if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthenticated' });

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ error: 'Unauthenticated' });

  const { data: profile, error: profError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (profError) {
    console.error('Notification profile lookup failed:', profError);
    return res.status(500).json({ error: 'Failed to verify profile' });
  }
  if (!profile) return res.status(403).json({ error: 'Forbidden - No portal profile' });

  const { loanId, installmentId, messageText } = req.body || {};
  const resolvedLoanId = Number(loanId);
  const resolvedInstallmentId = installmentId ? Number(installmentId) : null;
  if (!Number.isFinite(resolvedLoanId) || resolvedLoanId <= 0) {
    return res.status(400).json({ error: 'A valid loan identifier is required.' });
  }
  if (installmentId && (!Number.isFinite(Number(installmentId)) || Number(installmentId) <= 0)) {
    return res.status(400).json({ error: 'A valid installment identifier is required.' });
  }

  const { error } = await supabase
    .from('requester_notifications')
    .insert({
      loan_id: resolvedLoanId,
      installment_id: resolvedInstallmentId,
      sent_by_member_id: profile.id,
      message_text: String(messageText || '').trim(),
      delivery_method: 'WHATSAPP'
    });

  if (error) {
    console.error('Requester notification insert failed:', error);
    return res.status(500).json({
      error: error.message,
      code: error.code || null,
      sqlState: error.code || null,
      details: error.details || null,
      hint: error.hint || null
    });
  }

  return res.status(200).json({ success: true });
}
