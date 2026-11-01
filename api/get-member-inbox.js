if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    console.error('Member inbox is unavailable: Supabase server credentials are not configured.');
    return res.status(500).json({ error: 'Member inbox is temporarily unavailable.' });
  }

  // 1. Authenticate member via bearer token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
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
    return res.status(500).json({ error: 'Unable to verify member access.' });
  }
  if (!profile) return res.status(403).json({ error: 'Forbidden - No portal profile' });

  const memberId = profile.id;

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
    if (requestError) {
      console.error('Member inbox ownership lookup failed:', requestError);
      return res.status(500).json({ error: 'Unable to verify request ownership.' });
    }
    if (!request || request.referred_member_id !== memberId) return res.status(403).json({ error: 'Forbidden' });
    if (request.status === 'CONVERTED' || request.status === 'DISMISSED') {
      return res.status(409).json({ error: 'This request is no longer actionable.' });
    }

    // Opening a request is a UI event, not a database status transition.
    // Production loan_requests accepts DRAFT_UNASSIGNED, CONVERTED and
    // DISMISSED; writing REVIEWED here caused the check-constraint 500.
    if (action === 'review') {
      return res.status(200).json({
        success: true,
        request: { id: request.id, status: request.status }
      });
    }

    if (action === 'dismiss' && !String(dismissalReason || '').trim()) {
      return res.status(400).json({ error: 'Dismissal reason is required' });
    }
    const { data, error } = await supabase
      .from('loan_requests')
      .update({
        status: 'DISMISSED',
        dismissal_reason: String(dismissalReason).trim(),
        dismissed_by: memberId
      })
      .eq('id', requestId)
      .eq('referred_member_id', memberId)
      .select('id,status')
      .maybeSingle();
    if (error) {
      console.error('Member inbox dismissal failed:', error);
      return res.status(500).json({ error: 'Unable to update this request.' });
    }
    if (!data) return res.status(403).json({ error: 'Forbidden' });
    return res.status(200).json({ success: true, request: data });
  }

  try {
    // 3. Service-role query with an authoritative ownership filter.
    const { data: requests, error: fetchErr } = await supabase
      .from('loan_requests')
      .select('*')
      .eq('referred_member_id', memberId)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      console.error('Member inbox query failed:', fetchErr);
      return res.status(500).json({ error: 'Unable to load the member inbox.' });
    }

    const data = requests || [];
    return res.status(200).json({ success: true, data, requests: data });
  } catch (err) {
    console.error('Error in get-member-inbox:', err);
    return res.status(500).json({ error: 'Unable to load the member inbox.' });
  }
}
