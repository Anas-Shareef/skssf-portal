if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  // Authorization check for Cron trigger
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, message: 'Unauthorized cron trigger' });
  }

  try {
    console.log('Starting daily repayment alert runner (07:00 IST schedule)...');

    // 1. Fetch pending, partial, or overdue installments
    const { data: installments, error: fetchInstError } = await supabase
      .from('repayment_instalments')
      .select('*, loans(*)')
      .in('status', ['PENDING', 'PARTIAL', 'OVERDUE']);

    if (fetchInstError) {
      console.warn('repayment_instalments query failed:', fetchInstError.message);
      return res.status(500).json({ success: false, error: fetchInstError.message });
    }

    // 2. Fetch sent notifications log for deduplication
    const { data: sentLogs, error: fetchLogError } = await supabase
      .from('repayment_notifications_sent')
      .select('*');

    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayStr);

    const sentLogMap = {}; // Key: installment_id + '_' + trigger_type + '_' + sent_date
    if (sentLogs) {
      sentLogs.forEach(log => {
        sentLogMap[`${log.instalment_id}_${log.trigger_type}_${log.sent_date || todayStr}`] = true;
      });
    }

    let alertsSentCount = 0;

    for (const inst of (installments || [])) {
      const loan = inst.loans;
      if (!loan) continue;

      const memberId = loan.submitted_by_member_id || loan.filed_by_member_id;
      if (!memberId) continue;

      const dueDate = new Date(inst.due_date);
      const diffTime = dueDate.getTime() - today.getTime();
      const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const appName = loan.applicant_name || loan.requester_name || 'Applicant';

      let triggerType = null;
      let alertTitle = '';
      let alertMessage = '';

      if (daysUntilDue === 7) {
        triggerType = '7_DAY';
        alertTitle = '⏰ Upcoming Repayment (7 Days)';
        alertMessage = `Upcoming Repayment: ₹${Number(inst.amount_due - (inst.amount_paid || 0)).toLocaleString()} for ${appName} is due in 7 days on ${new Date(inst.due_date).toLocaleDateString()}.`;
      } else if (daysUntilDue === 3) {
        triggerType = '3_DAY';
        alertTitle = '⚠️ Reminder: Repayment Due in 3 Days';
        alertMessage = `Reminder: ₹${Number(inst.amount_due - (inst.amount_paid || 0)).toLocaleString()} for ${appName} is due in 3 days on ${new Date(inst.due_date).toLocaleDateString()}. Please prepare to collect.`;
      } else if (daysUntilDue === 1) {
        triggerType = '1_DAY';
        alertTitle = '🚨 Tomorrow: Repayment Due';
        alertMessage = `Tomorrow: ₹${Number(inst.amount_due - (inst.amount_paid || 0)).toLocaleString()} repayment for ${appName} is due tomorrow (${new Date(inst.due_date).toLocaleDateString()}). Contact them today.`;
      } else if (daysUntilDue === 0) {
        triggerType = 'DUE_DATE';
        alertTitle = '📅 Today: Repayment Due TODAY';
        alertMessage = `Today: ₹${Number(inst.amount_due - (inst.amount_paid || 0)).toLocaleString()} repayment for ${appName} is due TODAY. Please collect and record it.`;
      } else if (daysUntilDue < 0) {
        triggerType = Math.abs(daysUntilDue) === 1 ? 'OVERDUE_DAY1' : 'OVERDUE_REPEAT';
        alertTitle = '⛔ OVERDUE Repayment';
        alertMessage = `OVERDUE: ₹${Number(inst.amount_due - (inst.amount_paid || 0)).toLocaleString()} for ${appName} was due ${new Date(inst.due_date).toLocaleDateString()} and has not been recorded. Please follow up.`;
      }

      if (triggerType) {
        const logKey = `${inst.id}_${triggerType}_${todayStr}`;
        if (!sentLogMap[logKey]) {
          // 1. Insert in-app notification for member
          await supabase.from('notifications').insert({
            user_id: memberId,
            title: alertTitle,
            message: alertMessage,
            link_url: `/member/dashboard/repayments`,
            read_at: null
          });

          // Also notify admin if overdue
          if (triggerType === 'OVERDUE_DAY1' || triggerType === 'OVERDUE_REPEAT') {
            const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
            if (admins) {
              const adminNotifs = admins.map(a => ({
                user_id: a.id,
                title: `⛔ Overdue Loan Repayment — ${appName}`,
                message: alertMessage,
                link_url: `/admin/dashboard/repayments`,
                read_at: null
              }));
              await supabase.from('notifications').insert(adminNotifs);
            }
          }

          // 2. Log in sent notifications for deduplication
          await supabase.from('repayment_notifications_sent').insert({
            instalment_id: inst.id,
            trigger_type: triggerType,
            sent_date: todayStr
          });

          // 3. Mark instalment status as OVERDUE if past due date
          if (daysUntilDue < 0) {
            await supabase
              .from('repayment_instalments')
              .update({ status: 'OVERDUE' })
              .eq('id', inst.id);
          }

          alertsSentCount++;
        }
      }
    }

    console.log(`Repayment alert runner execution complete. Evaluated ${installments.length} instalments. Sent ${alertsSentCount} new alerts.`);
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
