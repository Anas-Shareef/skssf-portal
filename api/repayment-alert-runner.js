import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  // Simple auth check for Vercel Cron
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, message: 'Unauthorized cron trigger' });
  }

  try {
    console.log('Starting daily repayment alert runner...');

    // 1. Fetch all pending or overdue installments
    const { data: installments, error: fetchInstError } = await supabase
      .from('repayment_installments')
      .select('*, loans(*)')
      .in('status', ['PENDING', 'PARTIALLY_PAID', 'OVERDUE']);

    if (fetchInstError) {
      console.warn('repayment_installments query failed:', fetchInstError.message);
      return res.status(500).json({ success: false, error: fetchInstError.message });
    }

    // 2. Fetch sent notifications log to de-duplicate
    const { data: sentLogs, error: fetchLogError } = await supabase
      .from('repayment_notifications_sent')
      .select('*');

    if (fetchLogError) {
      console.warn('repayment_notifications_sent query failed:', fetchLogError.message);
      return res.status(500).json({ success: false, error: fetchLogError.message });
    }

    const sentLogMap = {}; // key: installment_id + '_' + trigger_type
    sentLogs.forEach(log => {
      sentLogMap[`${log.installment_id}_${log.trigger_type}`] = true;
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayStr);

    let alertsSentCount = 0;

    for (const inst of installments) {
      const loan = inst.loans;
      if (!loan) continue;

      const memberId = loan.submitted_by_member_id;
      if (!memberId) continue;

      const dueDate = new Date(inst.due_date);
      const diffTime = dueDate.getTime() - today.getTime();
      const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let triggerType = null;
      let alertTitle = '';
      let alertMessage = '';

      if (daysUntilDue === 7) {
        triggerType = '7_DAY';
        alertTitle = '⏳ Repayment Due in 7 Days';
        alertMessage = `Repayment installment #${inst.installment_number} of ₹${inst.amount_due} for ${loan.requester_name || loan.name} is due in 7 days.`;
      } else if (daysUntilDue === 3) {
        triggerType = '3_DAY';
        alertTitle = '⚠️ Urgent: Repayment Due in 3 Days';
        alertMessage = `Urgent: Repayment installment #${inst.installment_number} of ₹${inst.amount_due} for ${loan.requester_name || loan.name} is due in 3 days.`;
      } else if (daysUntilDue === 0) {
        triggerType = 'DUE_DATE';
        alertTitle = '📅 Repayment Due Today';
        alertMessage = `Today is the due date for installment #${inst.installment_number} of ₹${inst.amount_due} for ${loan.requester_name || loan.name}.`;
      } else if (daysUntilDue < 0) {
        triggerType = 'OVERDUE';
        alertTitle = '🚨 Repayment Overdue';
        alertMessage = `Overdue: installment #${inst.installment_number} of ₹${inst.amount_due} for ${loan.requester_name || loan.name} is overdue by ${Math.abs(daysUntilDue)} days.`;
      }

      if (triggerType) {
        const logKey = `${inst.id}_${triggerType}`;
        if (!sentLogMap[logKey]) {
          // Send notification
          await supabase.from('notifications').insert({
            user_id: memberId,
            title: alertTitle,
            message: alertMessage,
            link_url: `/member/dashboard/repayments`,
            is_read: false
          });

          // Log in sent notifications
          await supabase.from('repayment_notifications_sent').insert({
            installment_id: inst.id,
            trigger_type: triggerType
          });

          // If overdue, update installment status and loan repayment_status
          if (triggerType === 'OVERDUE') {
            await supabase
              .from('repayment_installments')
              .update({ status: 'OVERDUE' })
              .eq('id', inst.id);

            await supabase
              .from('loans')
              .update({ repayment_status: 'overdue' })
              .eq('id', loan.id);
          }

          alertsSentCount++;
        }
      }
    }

    console.log(`Alert runner run complete. Evaluated ${installments.length} installments. Sent ${alertsSentCount} alerts.`);
    return res.status(200).json({
      success: true,
      evaluated: installments.length,
      alerts_sent: alertsSentCount
    });

  } catch (error) {
    console.error('Repayment alert runner execution failed:', error);
    return res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
}
