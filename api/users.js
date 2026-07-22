if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Create Supabase client with Service Role Key for admin privileges
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function hasSubsetPermissions(requesterPerms, targetPerms) {
  if (!targetPerms) return true;
  const requester = requesterPerms || {};
  for (const key of Object.keys(targetPerms)) {
    if (targetPerms[key] === true && requester[key] !== true) {
      return false;
    }
  }
  return true;
}

async function logInventoryAudit(actorId, action, entityType, entityId, payload = null) {
  try {
    await supabase.from('inventory_audit_log').insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      payload
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Authorize the requester
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized - Missing token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify user session
    const { data: { user: requester }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !requester) {
      return res.status(401).json({ message: 'Unauthorized - Invalid token' });
    }

    // ==========================================
    // METHOD: GET (get-users.js logic)
    // ==========================================
    if (req.method === 'GET') {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at');

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        return res.status(500).json({ message: 'Failed to fetch profiles: ' + profilesError.message });
      }

      // Fetch all auth users to get emails (requires Service Role key)
      const { data: authData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (listError) {
        console.error('Error listing auth users:', listError);
        return res.status(500).json({ message: 'Failed to fetch auth users: ' + listError.message });
      }

      const authUsers = authData?.users || [];
      const authUserMap = new Map();
      authUsers.forEach(u => {
        authUserMap.set(u.id, u.email);
      });

      // Merge email from auth users into profiles
      const mergedUsers = profiles.map(p => ({
        ...p,
        email: authUserMap.get(p.id) || ''
      }));

      return res.status(200).json({
        success: true,
        users: mergedUsers,
        members: mergedUsers
      });
    }

    // ==========================================
    // METHOD: POST (create-user.js logic)
    // ==========================================
    if (req.method === 'POST') {
      // Check requester role, branch, and permissions
      const { data: requesterProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('role, branch, perms')
        .eq('id', requester.id)
        .single();

      if (profileErr || !requesterProfile || (requesterProfile.role !== 'admin' && requesterProfile.role !== 'super')) {
        return res.status(403).json({ message: 'Forbidden - Admins only' });
      }

      const {
        email,
        password,
        name,
        role = 'member',
        code,
        member_no,
        phone,
        branch,
        designation,
        occupation,
        address,
        addr,
        dob,
        gender,
        salary = 0,
        active = true,
        join_date,
        is_approver = false,
        perms = {},
        avatar = ''
      } = req.body;

      // Rule Enforcement for Admin
      if (requesterProfile.role === 'admin') {
        if (role !== 'member') {
          return res.status(403).json({ message: 'Forbidden - Admins can only create members' });
        }
        if (branch !== requesterProfile.branch) {
          return res.status(403).json({ message: `Forbidden - Admins can only create members in their own branch (${requesterProfile.branch})` });
        }
        if (!hasSubsetPermissions(requesterProfile.perms, perms)) {
          return res.status(403).json({ message: 'Forbidden - Admins can only assign permissions that they possess' });
        }
      }

      if (!email || !password || !name) {
        return res.status(400).json({ message: 'Email, password, and name are required' });
      }

      // Create Auth User using Admin SDK
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: email.trim(),
        password: password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          name: name,
          role: role
        }
      });

      if (createError) {
        console.error('Error creating auth user:', createError);
        return res.status(500).json({ message: 'Failed to create auth user: ' + createError.message });
      }

      const newUser = createData.user;
      if (!newUser) {
        return res.status(500).json({ message: 'Failed to create auth user - no user returned' });
      }

      const cleanAddress = addr || address || '';
      const cleanJoinDate = join_date || new Date().toISOString().split('T')[0];

      // Update public profile details (they are auto-inserted on auth sign up but need admin overrides)
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          code: code || null,
          member_no: member_no || null,
          phone: phone || null,
          branch: branch || null,
          designation: designation || null,
          occupation: occupation || null,
          addr: cleanAddress,
          dob: dob || null,
          gender: gender || null,
          salary: Number(salary),
          active: !!active,
          join_date: cleanJoinDate,
          is_approver: !!is_approver,
          perms: perms,
          avatar: avatar || null
        })
        .eq('id', newUser.id);

      if (updateError) {
        console.error('Error updating public profile:', updateError);
        await supabase.auth.admin.deleteUser(newUser.id);
        return res.status(500).json({ message: 'Profile initialization failed: ' + updateError.message });
      }

      const { data: finalProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', newUser.id)
        .single();

      return res.status(200).json({
        success: true,
        user: {
          ...finalProfile,
          email: newUser.email || email.trim(),
          address: finalProfile.addr
        }
      });
    }

    // ==========================================
    // METHOD: PATCH or PUT (update-user.js logic)
    // ==========================================
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ message: 'User ID is required' });
      }

      // Fetch requester's profile to check role, branch, and permissions
      const { data: requesterProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('role, branch, perms')
        .eq('id', requester.id)
        .single();

      if (profileErr || !requesterProfile) {
        return res.status(401).json({ message: 'Unauthorized - Requester profile not found' });
      }

      const isSelf = (requester.id === id);
      let isAuthorized = isSelf;

      if (!isAuthorized && (requesterProfile.role === 'admin' || requesterProfile.role === 'super')) {
        isAuthorized = true;
      }

      if (!isAuthorized) {
        return res.status(403).json({ message: 'Forbidden - Unauthorized profile update' });
      }

      const {
        email,
        password,
        name,
        role,
        code,
        member_no,
        phone,
        branch,
        designation,
        occupation,
        address,
        addr,
        dob,
        gender,
        salary,
        active,
        join_date,
        is_approver,
        perms,
        sahachari_paid,
        sah_miss,
        total_donated,
        avatar
      } = req.body;

      // Fetch target profile
      const { data: targetProfile, error: targetErr } = await supabase
        .from('profiles')
        .select('role, branch, perms')
        .eq('id', id)
        .single();

      if (targetErr || !targetProfile) {
        return res.status(404).json({ message: 'User profile not found' });
      }

      // Prevent non-admin self-updates from promoting role or changing permissions
      if (isSelf && requesterProfile.role !== 'super' && requesterProfile.role !== 'admin') {
        if (role !== undefined && role !== requesterProfile.role) {
          return res.status(403).json({ message: 'Forbidden - Cannot modify your own role' });
        }
        if (perms !== undefined) {
          return res.status(403).json({ message: 'Forbidden - Cannot modify your own permissions' });
        }
      }

      // Admin role rule constraints
      if (requesterProfile.role === 'admin') {

        // Admin can only edit members
        if (targetProfile.role !== 'member') {
          return res.status(403).json({ message: 'Forbidden - Admins can only edit members' });
        }

        // Admin can only edit members of their own branch
        if (targetProfile.branch !== requesterProfile.branch) {
          return res.status(403).json({ message: `Forbidden - Admins can only edit members of their own branch (${requesterProfile.branch})` });
        }

        // Admin cannot change user role to admin or super
        if (role !== undefined && role !== 'member') {
          return res.status(403).json({ message: 'Forbidden - Admins cannot promote members to admins' });
        }

        // Admin cannot transfer user to another branch
        const targetBranch = branch !== undefined ? branch : targetProfile.branch;
        if (targetBranch !== requesterProfile.branch) {
          return res.status(403).json({ message: 'Forbidden - Admins cannot transfer members to another branch' });
        }

        // Admin can only assign permissions they possess
        if (perms !== undefined && !hasSubsetPermissions(requesterProfile.perms, perms)) {
          return res.status(403).json({ message: 'Forbidden - Admins can only assign permissions that they possess' });
        }
      }

      // Update Auth User if provided
      const { data: userData } = await supabase.auth.admin.getUserById(id);
      const authUser = userData?.user;

      const authUpdates = {};
      if (email && authUser && authUser.email !== email.trim()) {
        authUpdates.email = email.trim();
      }
      if (password) authUpdates.password = password;

      if (name || role) {
        authUpdates.user_metadata = {};
        if (name) authUpdates.user_metadata.name = name;
        if (role) authUpdates.user_metadata.role = role;
      }

      if (Object.keys(authUpdates).length > 0) {
        const { error: authUpdateError } = await supabase.auth.admin.updateUserById(id, authUpdates);
        if (authUpdateError) {
          console.error('Error updating auth user:', authUpdateError);
          return res.status(500).json({ message: 'Auth update failed: ' + authUpdateError.message });
        }
      }

      // Update profile fields
      const profileUpdates = {};
      if (name !== undefined) profileUpdates.name = name;
      if (role !== undefined) profileUpdates.role = role;
      if (code !== undefined) profileUpdates.code = code;
      if (member_no !== undefined) profileUpdates.member_no = member_no;
      if (phone !== undefined) profileUpdates.phone = phone;
      if (branch !== undefined) profileUpdates.branch = branch;
      if (designation !== undefined) profileUpdates.designation = designation;
      if (occupation !== undefined) profileUpdates.occupation = occupation;
      
      const cleanAddress = addr !== undefined ? addr : address;
      if (cleanAddress !== undefined) profileUpdates.addr = cleanAddress;
      
      if (dob !== undefined) profileUpdates.dob = dob === '' ? null : dob;
      if (gender !== undefined) profileUpdates.gender = gender;
      if (salary !== undefined) profileUpdates.salary = Number(salary);
      if (active !== undefined) profileUpdates.active = !!active;
      if (join_date !== undefined) profileUpdates.join_date = join_date === '' ? null : join_date;
      if (is_approver !== undefined) profileUpdates.is_approver = !!is_approver;
      if (perms !== undefined) profileUpdates.perms = perms;
      if (sahachari_paid !== undefined) profileUpdates.sahachari_paid = sahachari_paid;
      if (sah_miss !== undefined) profileUpdates.sah_miss = sah_miss;
      if (total_donated !== undefined) profileUpdates.total_donated = Number(total_donated);
      if (avatar !== undefined) profileUpdates.avatar = avatar;

      if (Object.keys(profileUpdates).length > 0) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(profileUpdates)
          .eq('id', id);

        if (updateError) {
          console.error('Error updating profiles table:', updateError);
          return res.status(500).json({ message: 'Profile update failed: ' + updateError.message });
        }

        // Log permission updates to audit log
        if (perms !== undefined) {
          await logInventoryAudit(
            requester.id,
            'update_permissions',
            'profile',
            id,
            {
              old_perms: targetProfile.perms || {},
              new_perms: perms
            }
          );
        }
      }

      // Get fresh profile
      const { data: finalProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      const { data: authData } = await supabase.auth.admin.getUserById(id);
      const freshAuthUser = authData?.user;

      return res.status(200).json({
        success: true,
        user: {
          ...finalProfile,
          email: freshAuthUser?.email || email || '',
          address: finalProfile.addr
        }
      });
    }

    // ==========================================
    // METHOD: DELETE (delete-user.js logic)
    // ==========================================
    if (req.method === 'DELETE') {
      // Check requester role (must be admin or super)
      const { data: requesterProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', requester.id)
        .single();

      if (profileErr || !requesterProfile || (requesterProfile.role !== 'admin' && requesterProfile.role !== 'super')) {
        return res.status(403).json({ message: 'Forbidden - Admins only' });
      }

      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ message: 'User ID is required' });
      }

      // Prevent deleting oneself
      if (id === requester.id) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }

      // Delete Auth User (cascades to profile)
      const { error: deleteError } = await supabase.auth.admin.deleteUser(id);

      if (deleteError) {
        console.error('Error deleting user:', deleteError);
        return res.status(500).json({ message: 'Failed to delete user: ' + deleteError.message });
      }

      return res.status(200).json({ success: true, message: 'User deleted successfully' });
    }

    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (error) {
    console.error('Users API consolidated error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
}
