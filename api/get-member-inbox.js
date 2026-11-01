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

  if (!['GET', 'POST'].includes(req.method)) {
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
    .maybeSingle();

  if (profError) {
    console.error('Member inbox profile lookup failed:', profError);
    return res.status(500).json({ error: 'Failed to verify profile' });
  }
  if (!profile) return res.status(403).json({ error: 'Forbidden - No portal profile' });

  const memberId = profile.id;
  const memberName = profile.name || '';
  const memberCode = profile.member_unique_code || profile.code || '';

  if (req.method === 'POST') {
    const { requestId, action, dismissalReason } = req.body || {};
    if (!requestId || !['review', 'dismiss'].includes(action)) {
      return res.status(400).json({ error: 'Invalid request action' });
    }
    const { data: request, error: requestError } = await supabase
      .from('loan_requests')
      .select('id, referred_member_id, status')
      .eq('id', requestId)
      .maybeSingle();
    if (requestError) return res.status(500).json({ error: requestError.message });
    if (!request || request.referred_member_id !== memberId) return res.status(403).json({ error: 'Forbidden' });
    if (request.status === 'CONVERTED' || request.status === 'DISMISSED') {
      return res.status(409).json({ error: 'This request is no longer actionable.' });
    }
    if (action === 'dismiss' && !String(dismissalReason || '').trim()) {
      return res.status(400).json({ error: 'Dismissal reason is required' });
    }
    const update = action === 'review'
      ? { status: 'REVIEWED' }
      : { status: 'DISMISSED', dismissal_reason: String(dismissalReason).trim() };
    const { data, error } = await supabase.from('loan_requests').update(update).eq('id', requestId).select('id,status').maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, request: data });
  }

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
