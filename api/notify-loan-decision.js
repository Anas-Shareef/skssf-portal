if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && serviceKey
  ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabase) {
    console.error('Loan decision notification unavailable: missing Supabase server credentials.');
    return res.status(500).json({ error: 'Notification service is temporarily unavailable.' });
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthenticated' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthenticated' });

    const { data: actor, error: actorError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();
    if (actorError) {
      console.error('Loan decision actor lookup failed:', actorError);
      return res.status(500).json({ error: 'Unable to verify the approving user.' });
    }
    if (!actor || !['admin', 'super'].includes(actor.role)) {
      return res.status(403).json({ error: 'Admin permission required.' });
    }

    const { loanId, status } = req.body || {};
    if (!loanId || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid loan decision.' });
    }

    const { data: loan, error: loanError } = await supabase
      .from('loans')
      .select('id, name, submitted_by_member_id, source_request_id')
      .eq('id', loanId)
      .maybeSingle();
    if (loanError) {
      console.error('Loan decision lookup failed:', loanError);
      return res.status(500).json({ error: 'Unable to verify the loan.' });
    }
    if (!loan) return res.status(404).json({ error: 'Loan not found.' });
    if (!loan.submitted_by_member_id) return res.status(200).json({ success: true, notified: false });

    const label = status === 'approved' ? 'approved' : 'rejected';
    const { error: notificationError } = await supabase.from('notifications').insert({
      user_id: loan.submitted_by_member_id,
      title: `Loan application ${label}`,
      message: `Your loan application for ${loan.name || 'the applicant'} was ${label} by Admin.`,
      link_url: '/member/dashboard/loans'
    });
    if (notificationError) {
      console.error('Loan decision notification insert failed:', notificationError);
      return res.status(500).json({ error: 'Decision saved, but notification delivery failed.' });
    }

    return res.status(200).json({ success: true, notified: true });
  } catch (error) {
    console.error('Loan decision notification failed:', error);
    return res.status(500).json({ error: 'Unable to deliver the loan decision notification.' });
  }
}
