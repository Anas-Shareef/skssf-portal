import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Create Supabase client with Service Role Key for admin privileges
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return res.status(405).json({ message: 'Method Not Allowed' });
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

    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Check requester role (must be admin or super, OR the user updating themselves)
    let isSelf = (requester.id === id);
    let isAuthorized = isSelf;

    if (!isAuthorized) {
      const { data: requesterProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', requester.id)
        .single();

      if (!profileErr && requesterProfile && (requesterProfile.role === 'admin' || requesterProfile.role === 'super')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Forbidden - Unauthorized profile update' });
    }

    // 2. Extract updates
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
      total_donated
    } = req.body;

    // 3. Update Auth User (email & password) if provided using Admin SDK
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

    // 4. Update the profiles table
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
    
    if (dob !== undefined) profileUpdates.dob = dob;
    if (gender !== undefined) profileUpdates.gender = gender;
    if (salary !== undefined) profileUpdates.salary = Number(salary);
    if (active !== undefined) profileUpdates.active = !!active;
    if (join_date !== undefined) profileUpdates.join_date = join_date;
    if (is_approver !== undefined) profileUpdates.is_approver = !!is_approver;
    if (perms !== undefined) profileUpdates.perms = perms;
    if (sahachari_paid !== undefined) profileUpdates.sahachari_paid = sahachari_paid;
    if (sah_miss !== undefined) profileUpdates.sah_miss = sah_miss;
    if (total_donated !== undefined) profileUpdates.total_donated = Number(total_donated);

    if (Object.keys(profileUpdates).length > 0) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', id);

      if (updateError) {
        console.error('Error updating profiles table:', updateError);
        return res.status(500).json({ message: 'Profile update failed: ' + updateError.message });
      }
    }

    // Return the final updated user profile
    const { data: finalProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    // Fetch user from auth to get the fresh email
    const { data: authData } = await supabase.auth.admin.getUserById(id);
    const authUser = authData?.user;

    return res.status(200).json({
      success: true,
      user: {
        ...finalProfile,
        email: authUser?.email || email || '',
        address: finalProfile.addr
      }
    });

  } catch (error) {
    console.error('Update User API Error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
}
