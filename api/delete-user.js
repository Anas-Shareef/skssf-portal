import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

  if (req.method !== 'DELETE') {
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

    // 2. Extract user ID to delete
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Prevent deleting oneself
    if (id === requester.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    // 3. Delete Auth User using Admin SDK (this will cascade delete profile due to foreign key constraint ON DELETE CASCADE)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(id);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return res.status(500).json({ message: 'Failed to delete user: ' + deleteError.message });
    }

    return res.status(200).json({ success: true, message: 'User deleted successfully' });

  } catch (error) {
    console.error('Delete User API Error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
}
