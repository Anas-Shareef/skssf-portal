import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  // Simple auth check for Vercel Cron
  // Vercel sends an Authorization header with Bearer token if CRON_SECRET is configured
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, message: 'Unauthorized cron trigger' });
  }

  try {
    console.log('Starting daily repayment alert runner...');

    // 1. Fetch notification settings
    let settings = {
      alert_days_advance_1: 15,
      alert_days_advance_2: 7,
      alert_days_urgent: 3,
      alert_days_final: 1,
      overdue_alert_daily_days: 7,
      overdue_alert_weekly_after: 7,
      overdue_stop_days: 60
    };

    const { data: dbSettings } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (dbSettings) {
      settings = { ...settings, ...dbSettings };
    }

    // 2. Fetch all pending or overdue installments
    const { data: installments, error: fetchInstError } = await supabase
      .from('loan_installments')
      .select('*, loans(*)')
      .in('status', ['pending', 'overdue']);

    if (fetchInstError) {
      // If table doesn't exist, we skip database execution but log it
      console.warn('loan_installments table query failed (skipping DB alerts):', fetchInstError.message);
      return res.status(200).json({
        success: true,
        message: 'Installments table not active in DB. Skipping database alerts.'
      });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayStr);

    let alertsSentCount = 0;
    const notificationsToCreate = [];
    const updatedInstallments = [];

    for (const inst of installments) {
      const loan = inst.loans;
      if (!loan) continue;

      const applicantId = loan.user_id || loan.applicant_id;
      if (!applicantId) continue;

      const dueDate = new Date(inst.due_date);
      const diffTime = dueDate.getTime() - today.getTime();
      const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let alertType = null;
      let alertMessage = '';

      // Determine alert type based on settings thresholds
      if (daysUntilDue === settings.alert_days_advance_1) {
        alertType = 'advance_15';
        alertMessage = `Repayment due in 15 days for ${loan.name || 'Member'}'s loan #${loan.loan_no || loan.id}. Amount: ₹${inst.amount_due}.`;
      } else if (daysUntilDue === settings.alert_days_advance_2) {
        alertType = 'advance_7';
        alertMessage = `Repayment due in 7 days for ${loan.name || 'Member'}'s loan #${loan.loan_no || loan.id}. Amount: ₹${inst.amount_due}.`;
      } else if (daysUntilDue === settings.alert_days_urgent) {
        alertType = 'urgent_3';
        alertMessage = `Repayment due in 3 days for ${loan.name || 'Member'}'s loan #${loan.loan_no || loan.id}. Amount: ₹${inst.amount_due}. Please notify the requester.`;
      } else if (daysUntilDue === settings.alert_days_final) {
        alertType = 'final_1';
        alertMessage = `FINAL REMINDER: Repayment due tomorrow for ${loan.name || 'Member'}'s loan #${loan.loan_no || loan.id}. Amount: ₹${inst.amount_due}.`;
      } else if (daysUntilDue === 0) {
        alertType = 'due_today';
        alertMessage = `Today is the repayment due date for ${loan.name || 'Member'}'s loan #${loan.loan_no || loan.id}. Please confirm payment.`;
      } else if (daysUntilDue < 0) {
        // Overdue alerts logic
        const overdueDays = Math.abs(daysUntilDue);
        if (overdueDays <= settings.overdue_stop_days) {
          const sentLog = inst.notification_sent_at || {};
          const lastOverdueAlert = sentLog.last_overdue_alert_date;
          
          let shouldAlert = false;
          if (!lastOverdueAlert) {
            shouldAlert = true;
          } else {
            const lastAlertDate = new Date(lastOverdueAlert);
            const daysSinceLastAlert = Math.floor((today.getTime() - lastAlertDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (overdueDays <= settings.overdue_alert_daily_days) {
              // Daily alerts in first 7 days
              shouldAlert = daysSinceLastAlert >= 1;
            } else {
              // Weekly alerts after 7 days
              shouldAlert = daysSinceLastAlert >= 7;
            }
          }

          if (shouldAlert) {
            alertType = `overdue_${overdueDays}`;
            alertMessage = `OVERDUE: Repayment for ${loan.name || 'Member'}'s loan #${loan.loan_no || loan.id} is ${overdueDays} days overdue. Amount: ₹${inst.amount_due}.`;
          }
        }
      }

      // If an alert is triggered, check deduplication
      if (alertType && alertMessage) {
        const sentLog = inst.notification_sent_at || {};
        if (!sentLog[alertType]) {
          // Add to notifications queue
          notificationsToCreate.push({
            user_id: applicantId,
            title: daysUntilDue < 0 ? '⚠️ Overdue Repayment' : '⏳ Upcoming Repayment',
            message: alertMessage,
            type: daysUntilDue < 0 ? 'overdue' : (daysUntilDue <= 3 ? 'urgent' : 'info'),
            loan_id: loan.loan_no || String(loan.id),
            is_read: false
          });

          // Mark as sent on the installment
          sentLog[alertType] = new Date().toISOString();
          if (daysUntilDue < 0) {
            sentLog.last_overdue_alert_date = todayStr;
          }

          // Update status to overdue if applicable
          let newStatus = inst.status;
          if (daysUntilDue < 0 && inst.status === 'pending') {
            newStatus = 'overdue';
          }

          updatedInstallments.push({
            id: inst.id,
            status: newStatus,
            notification_sent_at: sentLog
          });

          alertsSentCount++;
        }
      }
    }

    // 3. Batch insert notifications
    if (notificationsToCreate.length > 0) {
      const { error: notifErr } = await supabase
        .from('notifications')
        .insert(notificationsToCreate);
      if (notifErr) console.error('Error inserting notifications:', notifErr.message);
    }

    // 4. Batch update installments
    if (updatedInstallments.length > 0) {
      for (const update of updatedInstallments) {
        await supabase
          .from('loan_installments')
          .update({
            status: update.status,
            notification_sent_at: update.notification_sent_at
          })
          .eq('id', update.id);
      }
    }

    // 5. Update overall loan repayment_status if overdue
    const overdueLoans = [...new Set(updatedInstallments.filter(u => u.status === 'overdue').map(u => u.id))];
    for (const instId of overdueLoans) {
      const inst = installments.find(i => i.id === instId);
      if (inst && inst.loans) {
        await supabase
          .from('loans')
          .update({ repayment_status: 'overdue' })
          .eq('id', inst.loans.id);
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
