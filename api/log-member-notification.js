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
    .single();

  if (profError || !profile) return res.status(401).json({ error: 'Profile not found' });

  const { loanId, installmentId, messageText } = req.body;
  if (!loanId || !installmentId || !messageText) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const { error } = await supabase
    .from('requester_notifications')
    .insert({
      loan_id: loanId,
      installment_id: installmentId,
      sent_by_member_id: profile.id,
      message_text: messageText.trim(),
      delivery_method: 'WHATSAPP'
    });

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ success: true });
}
