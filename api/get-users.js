import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Service role client to query auth users
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
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

    // 2. Fetch profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at');

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return res.status(500).json({ message: 'Failed to fetch profiles: ' + profilesError.message });
    }

    // 3. Fetch all auth users to get emails (requires Service Role key)
    // We paginate with a high limit to get all users. For very large databases, pagination would be needed.
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

    // 4. Merge email from auth users into profiles
    const mergedUsers = profiles.map(p => ({
      ...p,
      email: authUserMap.get(p.id) || ''
    }));

    return res.status(200).json({
      success: true,
      users: mergedUsers
    });

  } catch (error) {
    console.error('Get Users API Error:', error);
    return res.status(500).json({ message: error.message || 'Server error' });
  }
}
