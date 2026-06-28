import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { ArrowLeft, User, Phone, MapPin, FileText, CheckCircle2, XCircle } from 'lucide-react';

export default function CoordinatorLoanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loan, setLoan] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [actioning, setActioning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    async function loadLoanDetail() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('loans')
          .select('*, profiles:submitted_by_member_id(name)')
          .eq('id', id)
          .single();
        if (error) throw error;
        setLoan(data);
      } catch (err) {
        console.error('Failed to load loan details:', err);
        showToast('e', 'Loan record not found.');
      } finally {
        setLoading(false);
      }
    }
    loadLoanDetail();
  }, [id]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim() || notes.trim().length < 20) {
      showToast('e', 'Verification notes must be at least 20 characters long.');
      return;
    }
    try {
      setActioning(true);
      // 1. Update loan workflow status and resolve panel coordinator ID
      const { data: settings } = await supabase.from('system_settings').select('panel_coordinator_id').single();
      const panelCoordinatorId = settings?.panel_coordinator_id || null;

      const { error } = await supabase
        .from('loans')
        .update({
          workflow_status: 'PENDING_APPROVAL_PANEL',
          coordinator_reviewer_id: profile?.db_id || profile?.id,
          coordinator_review_notes: notes.trim(),
          coordinator_review_status: 'VERIFIED',
          panel_coordinator_id: panelCoordinatorId
        })
        .eq('id', id);

      if (error) throw error;

      // 2. Insert audit log
      await supabase.from('loan_audit_log').insert({
        loan_id: id,
        action: 'COORDINATOR_VERIFIED',
        performed_by_user_id: profile?.db_id || profile?.id,
        notes: `Verified by coordinator ${profile?.name}. Notes: ${notes.trim()}`
      });

      // 3. Send notifications to admins and panel coordinator
      const targets = [];
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
      if (admins) targets.push(...admins.map(a => a.id));
      if (panelCoordinatorId) targets.push(panelCoordinatorId);

      const uniqueTargets = Array.from(new Set(targets));
      if (uniqueTargets.length > 0) {
        const notifications = uniqueTargets.map(uid => ({
          user_id: uid,
          title: 'Loan Review Consensus',
          message: `Loan for ${loan.requester_name || loan.name} verified by Coordinator ${profile?.name}. Awaiting your panel vote.`,
          link_url: `/admin/dashboard/loans/${id}`
        }));
        await supabase.from('notifications').insert(notifications);
      }

      showToast('s', 'Loan successfully verified and forwarded to Approval Panel!');
      setTimeout(() => navigate('/coordinator/dashboard/loans'), 1500);
    } catch (err: any) {
      showToast('e', err.message || 'Verification update failed.');
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      showToast('e', 'Rejection reason is required.');
      return;
    }
    try {
      setActioning(true);
      const { error } = await supabase
        .from('loans')
        .update({
          workflow_status: 'REJECTED_BY_COORDINATOR',
          coordinator_reviewer_id: profile?.db_id || profile?.id,
          coordinator_rejection_reason: reason.trim(),
          coordinator_review_status: 'REJECTED'
        })
        .eq('id', id);

      if (error) throw error;

      // Audit log
      await supabase.from('loan_audit_log').insert({
        loan_id: id,
        action: 'COORDINATOR_REJECTED',
        performed_by_user_id: profile?.db_id || profile?.id,
        notes: `Rejected by coordinator ${profile?.name}. Reason: ${reason.trim()}`
      });

      // Send notification to member who filed it
      if (loan.submitted_by_member_id) {
        await supabase.from('notifications').insert({
          user_id: loan.submitted_by_member_id,
          title: 'Loan Request Rejected',
          message: `Your filed loan request for ${loan.requester_name || loan.name} was rejected by coordinator. Reason: ${reason.trim()}`,
          link_url: `/member/dashboard/filed-loans/${id}`
        });
      }

      showToast('s', 'Loan request rejected.');
      setTimeout(() => navigate('/coordinator/dashboard/loans'), 1500);
    } catch (err: any) {
      showToast('e', err.message || 'Rejection update failed.');
    } finally {
      setActioning(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '50px', color: 'var(--teal)' }}>
        <div className="spinner">Loading Loan details...</div>
      </div>
    );
  }

  if (!loan) return null;

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      {/* Toast Feedback */}
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 1000, background: toast.type === 's' ? '#0f172a' : 'var(--red)', color: '#fff', padding: '14px 24px', borderRadius: '16px', fontWeight: 700, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {toast.type === 's' ? '✅' : '⚠️'} {toast.msg}
        </div>
      )}

      <button onClick={() => navigate('/coordinator/dashboard/loans')} style={{ background: 'none', border: 'none', color: '#64748b', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <ArrowLeft size={16} /> Back to review queue
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>
        
        {/* Left column: Loan Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card" style={{ padding: '28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', margin: 0 }}>{loan.requester_name || loan.name}</h2>
                <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700, marginTop: '4px' }}>Filed on: {new Date(loan.created_at).toLocaleDateString()}</div>
              </div>
              <span className={`bdg ${loan.workflow_status === 'APPROVED' ? 'bdg-g' : loan.workflow_status.includes('REJECTED') ? 'bdg-r' : 'bdg-a'}`}>
                {loan.workflow_status.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="rv-sec">
              <div className="rv-sec-t">📋 Profile Details</div>
              <div className="rv-row">
                <div className="rv-k"><User size={15} /> Full Name</div>
                <div className="rv-v">{loan.requester_name || loan.name}</div>
              </div>
              <div className="rv-row">
                <div className="rv-k"><Phone size={15} /> Phone</div>
                <div className="rv-v">{loan.requester_phone || loan.phone}</div>
              </div>
              <div className="rv-row">
                <div className="rv-k"><MapPin size={15} /> Home Address</div>
                <div className="rv-v">{loan.requester_address || loan.address}</div>
              </div>
            </div>

            <div className="rv-sec" style={{ marginTop: '24px' }}>
              <div className="rv-sec-t">💼 Loan Specifications</div>
              <div className="rv-row">
                <div className="rv-k">Amount Requested</div>
                <div className="rv-v" style={{ fontWeight: 900, color: 'var(--teal)', fontSize: '16px' }}>₹{(loan.loan_amount_requested || loan.amt).toLocaleString()}</div>
              </div>
              <div className="rv-row">
                <div className="rv-k">Repayment Tenure</div>
                <div className="rv-v">{loan.repayment_period_months || loan.months || 12} Months</div>
              </div>
              <div className="rv-row">
                <div className="rv-k">Purpose</div>
                <div className="rv-v">{loan.purpose || loan.purpDesc}</div>
              </div>
              <div className="rv-row">
                <div className="rv-k">Filing Helper</div>
                <div className="rv-v" style={{ fontWeight: 800 }}>{loan.profiles?.name || 'Manual Admin'}</div>
              </div>
            </div>

            {loan.member_notes && (
              <div style={{ marginTop: '24px', padding: '16px', background: '#f8fafc', borderRadius: '16px', borderLeft: '4px solid var(--teal)' }}>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>Filing Member Notes</div>
                <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>"{loan.member_notes}"</div>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Action Board */}
        <div>
          {loan.workflow_status === 'PENDING_COORDINATOR_REVIEW' ? (
            <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>⚡ Verification Board</h3>
              
              {/* Form 1: Verify & Forward */}
              <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="fl2" style={{ fontWeight: 800 }}>Verification Remarks</label>
                  <textarea
                    placeholder="Enter detailed validation feedback regarding collateral, guarantor, and background check. Min 20 characters."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="ta2"
                    rows={4}
                    required
                  />
                  <div style={{ fontSize: '11px', color: notes.length < 20 ? 'var(--red)' : '#64748b', fontWeight: 700, alignSelf: 'flex-end' }}>
                    {notes.length}/20 chars min
                  </div>
                </div>
                <button type="submit" disabled={actioning || notes.length < 20} className="bsm s" style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} /> Verify & Forward to Panel
                </button>
              </form>

              {/* Form 2: Reject */}
              <form onSubmit={handleReject} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="fl2" style={{ fontWeight: 800, color: 'var(--red)' }}>Rejection Reason</label>
                  <textarea
                    placeholder="Provide a detailed audit-ready reason for denying this request."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="ta2"
                    rows={3}
                    required
                  />
                </div>
                <button type="submit" disabled={actioning || !reason.trim()} className="bsm r" style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <XCircle size={16} /> Reject Request
                </button>
              </form>
            </div>
          ) : (
            <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>Verification Audit</h3>
              {loan.coordinator_review_status === 'VERIFIED' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="bdg bdg-g" style={{ width: 'fit-content' }}>VERIFIED & FORWARDED</div>
                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                    <b>Review Notes:</b> "{loan.coordinator_review_notes}"
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="bdg bdg-r" style={{ width: 'fit-content' }}>REJECTED BY COORDINATOR</div>
                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                    <b>Reason:</b> "{loan.coordinator_rejection_reason}"
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
