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
    .single();

  if (profError || !profile) return res.status(401).json({ error: 'Profile not found' });

  const { selectedInstId, amtPaid, payMethod, payNote } = req.body;
  if (!selectedInstId || !amtPaid || !payMethod) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // 1. Fetch the installment
  const { data: inst, error: fetchError } = await supabase
    .from('repayment_installments')
    .select('*, loans(*)')
    .eq('id', selectedInstId)
    .single();

  if (fetchError || !inst) return res.status(404).json({ error: 'Installment not found' });

  // Safety: Check if the logged-in member is indeed the submitter of the parent loan
  if (inst.loans.submitted_by_member_id !== profile.id) {
    return res.status(403).json({ error: 'Unauthorized to update this installment' });
  }

  const paidVal = Number(amtPaid);
  const balance = inst.amount_due - inst.amount_paid;
  if (paidVal <= 0 || paidVal > balance) {
    return res.status(400).json({ error: `Payment amount must be between 1 and ${balance}` });
  }

  const newPaid = Number(inst.amount_paid) + paidVal;
  const isPaid = newPaid >= inst.amount_due;
  const status = isPaid ? 'PAID' : 'PARTIALLY_PAID';

  // 2. Update repayment_installment
  const { error: updateError } = await supabase
    .from('repayment_installments')
    .update({
      amount_paid: newPaid,
      status: status,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: payMethod,
      reference_note: (payNote || '').trim(),
      recorded_by_user_id: profile.id
    })
    .eq('id', inst.id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  // 3. Write to loan_audit_log
  await supabase.from('loan_audit_log').insert({
    loan_id: inst.loan_id,
    action: 'REPAYMENT_RECORDED',
    performed_by_user_id: profile.id,
    notes: `Recorded repayment ₹${paidVal.toLocaleString()} via ${payMethod} on installment #${inst.installment_number}`
  });

  // 4. Update the JSONB repayments array in the parent loan to keep it in sync
  const { data: loan, error: loanFetchErr } = await supabase
    .from('loans')
    .select('repayments, id')
    .eq('id', inst.loan_id)
    .single();

  if (!loanFetchErr && loan && loan.repayments) {
    // Repayments array is 0-indexed, whereas installment_number is 1-indexed
    const idx = inst.installment_number - 1;
    if (loan.repayments[idx]) {
      loan.repayments[idx].paid = isPaid ? true : null;
      loan.repayments[idx].paid_date = new Date().toISOString().split('T')[0];
      loan.repayments[idx].paid_amount = newPaid;
      loan.repayments[idx].method = payMethod;
      loan.repayments[idx].ref = (payNote || '').trim();
      loan.repayments[idx].recorded_by = profile.id;
      
      await supabase
        .from('loans')
        .update({ repayments: loan.repayments })
        .eq('id', loan.id);
    }
  }

  // 5. Check if all installments are now fully paid to auto-close the loan
  const { data: allInsts } = await supabase
    .from('repayment_installments')
    .select('status')
    .eq('loan_id', inst.loan_id);

  const allPaid = allInsts && allInsts.every(x => x.status === 'PAID');
  if (allPaid) {
    await supabase
      .from('loans')
      .update({ workflow_status: 'REPAYMENT_COMPLETE', status: 'completed' })
      .eq('id', inst.loan_id);

    await supabase.from('loan_audit_log').insert({
      loan_id: inst.loan_id,
      action: 'LOAN_CLOSED',
      performed_by_user_id: profile.id,
      notes: 'All installments fully paid. Loan workflow status closed.'
    });
  }

  return res.status(200).json({ success: true });
}
