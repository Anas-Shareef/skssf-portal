import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { AlertTriangle, CheckCircle2, XCircle, Vote } from 'lucide-react';

export default function PanelVotes() {
  const { profile } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [votingOn, setVotingOn] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  async function loadPanelLoans() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('loans')
        .select('*')
        .eq('workflow_status', 'PENDING_APPROVAL_PANEL');
      if (error) throw error;
      setLoans(data || []);
    } catch (err) {
      console.error('Failed to load panel loans:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (profile?.is_panel_coordinator) {
      loadPanelLoans();
    } else {
      setLoading(false);
    }
  }, [profile]);

  const handleVote = async (loanId: string, decision: 'APPROVE' | 'REJECT', loan: any) => {
    if (decision === 'REJECT' && !reason.trim()) {
      showToast('e', 'Please provide a reason for rejection.');
      return;
    }

    try {
      setVotingOn(loanId);
      // 1. Submit coordinator vote
      const updates: any = {
        panel_coordinator_vote: decision,
        panel_coordinator_vote_reason: decision === 'REJECT' ? reason.trim() : null
      };

      // Determine new workflow status
      let nextStatus = 'PENDING_APPROVAL_PANEL';
      const presVote = loan.president_vote;
      const secVote = loan.secretary_vote;

      if (decision === 'REJECT' || presVote === 'REJECT' || secVote === 'REJECT') {
        nextStatus = 'REJECTED_BY_PANEL';
        updates.workflow_status = nextStatus;
        updates.rejected_by = profile?.db_id || profile?.id;
        updates.rejection_reason = decision === 'REJECT' ? reason.trim() : (presVote === 'REJECT' ? loan.president_vote_reason : loan.secretary_vote_reason);
      } else if (decision === 'APPROVE' && presVote === 'APPROVE' && secVote === 'APPROVE') {
        nextStatus = 'APPROVED';
        updates.workflow_status = nextStatus;
        updates.disbursement_date = new Date().toISOString().split('T')[0];
        updates.loan_amount_approved = loan.loan_amount_requested;
      }

      const { error } = await supabase
        .from('loans')
        .update(updates)
        .eq('id', loanId);

      if (error) throw error;

      // 2. Log audit trail
      await supabase.from('loan_audit_log').insert({
        loan_id: loanId,
        action: 'PANEL_VOTE_CAST',
        performed_by_user_id: profile?.db_id || profile?.id,
        notes: `Panel Coordinator voted ${decision}. Workflow status is now ${nextStatus}.`
      });

      // 3. Generate repayment installments if approved
      if (nextStatus === 'APPROVED') {
        const disDate = new Date().toISOString().split('T')[0];
        const months = loan.repayment_period_months || 12;
        const totalAmt = loan.loan_amount_requested;

        // Try RPC first
        const { error: rpcError } = await supabase.rpc('generate_repayment_schedule', {
          p_loan_id: loanId,
          p_amount: totalAmt,
          p_months: months,
          p_disbursement_date: disDate
        });

        if (rpcError) {
          console.warn('RPC failed, inserting schedule client-side:', rpcError);
          // Fallback client-side generation
          const instAmt = Math.round((totalAmt / months) * 100) / 100;
          const lastInstAmt = Math.round((totalAmt - (instAmt * (months - 1))) * 100) / 100;
          const insts = [];
          for (let i = 1; i <= months; i++) {
            const due = new Date();
            due.setDate(due.getDate() + (i * 30));
            insts.push({
              loan_id: loanId,
              installment_number: i,
              due_date: due.toISOString().split('T')[0],
              amount_due: i === months ? lastInstAmt : instAmt,
              status: 'PENDING'
            });
          }
          await supabase.from('repayment_installments').insert(insts);
        }
      }

      // Notify others
      const targets = [];
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
      if (admins) targets.push(...admins.map(a => a.id));
      if (loan.submitted_by_member_id) targets.push(loan.submitted_by_member_id);

      const uniqueTargets = Array.from(new Set(targets));
      if (uniqueTargets.length > 0) {
        const notifications = uniqueTargets.map(uid => ({
          user_id: uid,
          title: nextStatus === 'APPROVED' ? 'Loan Approved' : 'Consensus Vote Update',
          message: `Consensus Update: ${profile?.name} voted ${decision} for ${loan.requester_name || loan.name}. Status: ${nextStatus}.`,
          link_url: uid === loan.submitted_by_member_id ? `/member/dashboard/filed-loans/${loanId}` : `/admin/dashboard/loans/${loanId}`
        }));
        await supabase.from('notifications').insert(notifications);
      }

      showToast('s', 'Vote recorded successfully!');
      setReason('');
      loadPanelLoans();
    } catch (err: any) {
      showToast('e', err.message || 'Failed to submit vote.');
    } finally {
      setVotingOn(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '50px', color: 'var(--teal)' }}>
        <div className="spinner">Loading Panel items...</div>
      </div>
    );
  }

  if (!profile?.is_panel_coordinator) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div className="card" style={{ padding: '40px', background: '#fff', borderRadius: '24px', border: '1.5px solid #f1f5f9' }}>
          <AlertTriangle size={48} style={{ margin: '0 auto 16px', color: '#f59e0b' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>Access Denied</h2>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '6px' }}>You are not currently assigned as the panel coordinator. Please check with your administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 1000, background: toast.type === 's' ? '#0f172a' : 'var(--red)', color: '#fff', padding: '14px 24px', borderRadius: '16px', fontWeight: 700, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {toast.type === 's' ? '✅' : '⚠️'} {toast.msg}
        </div>
      )}

      <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', marginBottom: '6px' }}>Approval Panel Queue</h1>
      <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px' }}>Cast your vote. Consensus requires approval from President, Secretary, and Panel Coordinator.</p>

      {loans.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '20px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
          <CheckCircle2 size={48} style={{ margin: '0 auto 16px', color: '#10b981', opacity: 0.8 }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>Clear Queue</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>No loan requests are currently awaiting panel vote.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {loans.map((loan) => (
            <div key={loan.id} className="card" style={{ padding: '24px', borderRadius: '20px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr', gap: '24px', flexWrap: 'wrap' }}>
                
                {/* Details */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', margin: 0 }}>{loan.requester_name || loan.name}</h3>
                    <span className="bdg bdg-a" style={{ fontSize: '9px' }}>AWAITING PANEL</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#475569', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div><b>Amount Requested:</b> <span style={{ color: 'var(--teal)', fontWeight: 900 }}>₹{(loan.loan_amount_requested || loan.amt).toLocaleString()}</span></div>
                    <div><b>Tenure:</b> {loan.repayment_period_months || loan.months || 12} Months</div>
                    <div style={{ gridColumn: 'span 2' }}><b>Purpose:</b> {loan.purpose || loan.purpDesc}</div>
                  </div>

                  {loan.coordinator_review_notes && (
                    <div style={{ marginTop: '16px', padding: '12px', background: '#f8fafc', borderRadius: '12px', borderLeft: '3px solid var(--teal)', fontSize: '13px' }}>
                      <b>Review notes:</b> "{loan.coordinator_review_notes}"
                    </div>
                  )}
                </div>

                {/* Vote Status & Voting Board */}
                <div style={{ borderLeft: '1.5px solid #f1f5f9', paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Consensus Tracker */}
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>Consensus Status</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', fontWeight: 700 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>President:</span>
                        <span className={loan.president_vote === 'APPROVE' ? 'text-green' : loan.president_vote === 'REJECT' ? 'text-red' : 'text-gray'}>
                          {loan.president_vote || 'PENDING'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Secretary:</span>
                        <span className={loan.secretary_vote === 'APPROVE' ? 'text-green' : loan.secretary_vote === 'REJECT' ? 'text-red' : 'text-gray'}>
                          {loan.secretary_vote || 'PENDING'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>You (Panel Coordinator):</span>
                        <span className={loan.panel_coordinator_vote === 'APPROVE' ? 'text-green' : loan.panel_coordinator_vote === 'REJECT' ? 'text-red' : 'text-gray'}>
                          {loan.panel_coordinator_vote || 'PENDING'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cast vote section */}
                  {loan.panel_coordinator_vote == null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800 }}>Cast Your Vote</h4>
                      {votingOn === loan.id ? (
                        <div style={{ color: 'var(--teal)', fontSize: '12px', fontWeight: 800 }}>Submitting vote...</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <textarea
                            placeholder="Rejection reason (only required if rejecting)"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="ta2"
                            rows={2}
                          />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleVote(loan.id, 'APPROVE', loan)}
                              className="bsm s"
                              style={{ flex: 1, padding: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            >
                              <CheckCircle2 size={14} /> Approve
                            </button>
                            <button
                              onClick={() => handleVote(loan.id, 'REJECT', loan)}
                              className="bsm r"
                              style={{ flex: 1, padding: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
