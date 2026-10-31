if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate the member via their token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthenticated' });

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ error: 'Unauthenticated' });

  // Fetch the member's profile to confirm role
  const { data: profile, error: profError } = await supabase
    .from('profiles')
    .select('id, role, name')
    .eq('id', user.id)
    .single();

  if (profError || !profile) return res.status(401).json({ error: 'Profile not found' });

  // Fetch loans submitted by this member (service role = bypasses RLS)
  const { data: loans, error: loansError } = await supabase
    .from('loans')
    .select('*')
    .eq('submitted_by_member_id', profile.id)
    .order('created_at', { ascending: false });

  if (loansError) return res.status(500).json({ error: loansError.message });

  return res.status(200).json({ loans: loans || [] });
}
