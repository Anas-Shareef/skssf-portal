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

  if (req.method !== 'POST') {
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

    // Check requester role (must be admin or super)
    const { data: requesterProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', requester.id)
      .single();

    if (profileErr || !requesterProfile || (requesterProfile.role !== 'admin' && requesterProfile.role !== 'super')) {
      return res.status(403).json({ message: 'Forbidden - Admins only' });
    }

    // 2. Extract user details to create
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
      perms = []
    } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Email, password, and name are required' });
    }

    // 3. Create Auth User using Admin SDK
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password: password,
      email_confirm: true, // Auto-confirm email since admin is creating them
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

    // 4. Update the profile with remaining details
    const cleanAddress = addr || address || '';
    const cleanJoinDate = join_date || new Date().toISOString().split('T')[0];

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
        perms: perms
      })
      .eq('id', newUser.id);

    if (updateError) {
      console.error('Error updating public profile:', updateError);
      // Clean up the auth user if profile update fails to avoid orphan auth records
      await supabase.auth.admin.deleteUser(newUser.id);
      return res.status(500).json({ message: 'Profile initialization failed: ' + updateError.message });
    }

    // Return the newly created user profile
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

  } catch (error) {
    console.error('Create User API Error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
}
