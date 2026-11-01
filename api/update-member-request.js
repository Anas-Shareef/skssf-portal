if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthenticated' });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthenticated' });

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
  if (!request || request.referred_member_id !== user.id) return res.status(403).json({ error: 'Forbidden' });
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
