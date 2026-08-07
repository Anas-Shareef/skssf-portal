if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Authenticate member via bearer token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthenticated' });

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ error: 'Unauthenticated' });

  // 2. Fetch member profile
  const { data: profile, error: profError } = await supabase
    .from('profiles')
    .select('id, name, member_unique_code, code')
    .eq('id', user.id)
    .single();

  if (profError || !profile) return res.status(401).json({ error: 'Profile not found' });

  const memberId = profile.id;
  const memberName = profile.name || '';
  const memberCode = profile.member_unique_code || profile.code || '';

  try {
    // 3. Service role query on loan_requests (bypasses RLS)
    const { data: requests, error: fetchErr } = await supabase
      .from('loan_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchErr) throw fetchErr;

    // Filter items belonging to this member by ID, Name, or Code match
    const filtered = (requests || []).filter(item => {
      const itemMemId = item.member_id || item.referred_member_id || item.referred_id;
      const itemMemName = (item.referred_member_name || '').toLowerCase();
      const itemReason = (item.reason || '').toLowerCase();
      
      const idMatch = itemMemId && (String(itemMemId) === String(memberId));
      const nameMatch = memberName && itemMemName.includes(memberName.toLowerCase());
      const reasonMatch = (memberName && itemReason.includes(memberName.toLowerCase())) ||
                          (memberCode && itemReason.includes(memberCode.toLowerCase()));

      return idMatch || nameMatch || reasonMatch;
    });

    return res.status(200).json({ success: true, requests: filtered });
  } catch (err) {
    console.error('Error in get-member-inbox:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
