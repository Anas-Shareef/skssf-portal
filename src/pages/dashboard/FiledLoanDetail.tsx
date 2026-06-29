import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { ArrowLeft, User, Phone, MapPin, CheckCircle2, MessageSquare, Plus, Check } from 'lucide-react';

export default function FiledLoanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loan, setLoan] = useState<any>(null);
  const [installments, setInstallments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);
  const [admins, setAdmins] = useState<any[]>([]);

  // Modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInst, setSelectedInst] = useState<any>(null);
  const [amtPaid, setAmtPaid] = useState('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'Bank Transfer' | 'Other'>('Cash');
  const [payNote, setPayNote] = useState('');

  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [msgText, setMsgText] = useState('');

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  async function loadLoanData() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('loans')
        .select('*, profiles:submitted_by_member_id(name)')
        .eq('id', id)
        .single();
      if (error) throw error;
      setLoan(data);

      const { data: adminList } = await supabase
        .from('profiles')
        .select('id, name, role')
        .in('role', ['admin', 'super', 'coordinator']);
      setAdmins(adminList || []);

      const { data: insts } = await supabase
        .from('repayment_installments')
        .select('*')
        .eq('loan_id', id)
        .order('installment_number');
      setInstallments(insts || []);
    } catch (err) {
      console.error('Failed to load loan data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLoanData();
  }, [id]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const paidVal = Number(amtPaid);
    const balance = selectedInst.amount_due - selectedInst.amount_paid;
    if (paidVal <= 0 || paidVal > balance) {
      showToast('e', `Payment amount must be between ₹1 and ₹${balance}`);
      return;
    }

    try {
      const newPaid = Number(selectedInst.amount_paid) + paidVal;
      const isPaid = newPaid >= selectedInst.amount_due;
      const status = isPaid ? 'PAID' : 'PARTIALLY_PAID';

      const { error } = await supabase
        .from('repayment_installments')
        .update({
          amount_paid: newPaid,
          status: status,
          payment_date: new Date().toISOString().split('T')[0],
          payment_method: payMethod,
          reference_note: payNote.trim(),
          recorded_by_user_id: profile?.db_id || profile?.id
        })
        .eq('id', selectedInst.id);

      if (error) throw error;

      // Log repayment in audit
      await supabase.from('loan_audit_log').insert({
        loan_id: id,
        action: 'REPAYMENT_RECORDED',
        performed_by_user_id: profile?.db_id || profile?.id,
        notes: `Recorded repayment ₹${paidVal.toLocaleString()} via ${payMethod} on installment #${selectedInst.installment_number}`
      });

      // Check if all installments are fully paid
      const { data: allInsts } = await supabase
        .from('repayment_installments')
        .select('status')
        .eq('loan_id', id);

      const allPaid = allInsts && allInsts.every(inst => inst.status === 'PAID');
      if (allPaid) {
        await supabase
          .from('loans')
          .update({ workflow_status: 'REPAYMENT_COMPLETE' })
          .eq('id', id);

        await supabase.from('loan_audit_log').insert({
          loan_id: id,
          action: 'LOAN_CLOSED',
          performed_by_user_id: profile?.db_id || profile?.id,
          notes: 'All installments fully paid. Loan workflow status closed.'
        });
      }

      showToast('s', 'Repayment recorded successfully!');
      setShowPaymentModal(false);
      setSelectedInst(null);
      setAmtPaid('');
      setPayNote('');
      loadLoanData();
    } catch (err: any) {
      showToast('e', err.message || 'Payment update failed.');
    }
  };

  const handleNotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim()) return;

    try {
      // 1. Insert to requester_notifications
      const { error } = await supabase
        .from('requester_notifications')
        .insert({
          loan_id: id,
          installment_id: selectedInst.id,
          sent_by_member_id: profile?.db_id || profile?.id,
          message_text: msgText.trim(),
          delivery_method: 'WHATSAPP'
        });

      if (error) throw error;

      showToast('s', 'Notification logged. Opening WhatsApp...');
      setShowNotifyModal(false);

      // 2. Open WhatsApp link
      const encodedMsg = encodeURIComponent(msgText.trim());
      const phoneNo = loan.requester_phone || loan.phone;
      const url = `https://api.whatsapp.com/send?phone=${phoneNo}&text=${encodedMsg}`;
      window.open(url, '_blank');
    } catch (err: any) {
      showToast('e', err.message || 'Notification log failed.');
    }
  };

  const openNotifyModal = (inst: any) => {
    setSelectedInst(inst);
    const amountStr = Number(inst.amount_due - inst.amount_paid).toLocaleString();
    const msg = `Dear ${loan.requester_name || loan.name}, your repayment installment #${inst.installment_number} of ₹${amountStr} for your SKSSF loan is due on ${new Date(inst.due_date).toLocaleDateString()}. Please coordinate to submit the payment soon. Thank you! — ${profile?.name}, SKSSF.`;
    setMsgText(msg);
    setShowNotifyModal(true);
  };

  const openPaymentModal = (inst: any) => {
    setSelectedInst(inst);
    setAmtPaid(String(inst.amount_due - inst.amount_paid));
    setShowPaymentModal(true);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '50px', color: 'var(--teal)' }}>
        <div className="spinner">Loading loan details...</div>
      </div>
    );
  }

  if (!loan) return null;

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 1000, background: toast.type === 's' ? '#0f172a' : 'var(--red)', color: '#fff', padding: '14px 24px', borderRadius: '16px', fontWeight: 700, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {toast.type === 's' ? '✅' : '⚠️'} {toast.msg}
        </div>
      )}

      <button onClick={() => navigate('/member/dashboard/filed-loans')} style={{ background: 'none', border: 'none', color: '#64748b', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <ArrowLeft size={16} /> Back to Filed Loans
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px', flexWrap: 'wrap' }}>
        
        {/* Left Column: Loan Detail Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card" style={{ padding: '28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', margin: 0 }}>{loan.requester_name || loan.name}</h2>
                <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700, marginTop: '4px' }}>Filed on: {new Date(loan.created_at).toLocaleDateString()}</div>
              </div>
              <span className={`bdg ${loan.workflow_status === 'APPROVED' ? 'bdg-g' : loan.workflow_status === 'REPAYMENT_COMPLETE' ? 'bdg-g' : loan.workflow_status.includes('REJECTED') ? 'bdg-r' : 'bdg-a'}`}>
                {loan.workflow_status.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="rv-sec">
              <div className="rv-sec-t">📋 Profile Details</div>
              <div className="rv-row"><div className="rv-k"><User size={15} /> Full Name</div><div className="rv-v">{loan.requester_name || loan.name}</div></div>
              <div className="rv-row"><div className="rv-k"><Phone size={15} /> Phone</div><div className="rv-v">{loan.requester_phone || loan.phone}</div></div>
              <div className="rv-row"><div className="rv-k"><MapPin size={15} /> Home Address</div><div className="rv-v">{loan.requester_address || loan.address}</div></div>
            </div>

            <div className="rv-sec" style={{ marginTop: '24px' }}>
              <div className="rv-sec-t">💼 Loan Specifications</div>
              <div className="rv-row"><div className="rv-k">Amount Requested</div><div className="rv-v" style={{ fontWeight: 900, color: 'var(--teal)' }}>₹{(loan.loan_amount_requested || loan.amt).toLocaleString()}</div></div>
              {loan.loan_amount_approved && <div className="rv-row"><div className="rv-k">Approved Amount</div><div className="rv-v" style={{ fontWeight: 900, color: '#10b981' }}>₹{Number(loan.loan_amount_approved).toLocaleString()}</div></div>}
              <div className="rv-row"><div className="rv-k">Repayment Period</div><div className="rv-v">{loan.repayment_period_months || loan.months || 12} Months</div></div>
              <div className="rv-row"><div className="rv-k">Purpose</div><div className="rv-v">{loan.purpose || loan.purpDesc}</div></div>
            </div>
          </div>

          {/* Repayment Installment Schedule */}
          {(loan.workflow_status === 'APPROVED' || loan.workflow_status === 'REPAYMENT_COMPLETE') && (
            <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 900 }}>📅 Repayment Schedule</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Inst #</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Due Date</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Amount Due</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Amount Paid</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Status</th>
                      <th style={{ textAlign: 'center', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installments.map((inst) => {
                      const balance = inst.amount_due - inst.amount_paid;
                      const isOverdue = inst.status === 'OVERDUE' || (inst.status === 'PENDING' && new Date(inst.due_date) < new Date());
                      return (
                        <tr key={inst.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px', fontWeight: 700 }}>#{inst.installment_number}</td>
                          <td style={{ padding: '12px', fontSize: '13px' }}>{new Date(inst.due_date).toLocaleDateString()}</td>
                          <td style={{ padding: '12px', fontWeight: 800 }}>₹{Number(inst.amount_due).toLocaleString()}</td>
                          <td style={{ padding: '12px', color: '#10b981', fontWeight: 800 }}>₹{Number(inst.amount_paid).toLocaleString()}</td>
                          <td style={{ padding: '12px' }}>
                            <span className={`bdg ${
                              inst.status === 'PAID' ? 'bdg-g' : 
                              isOverdue ? 'bdg-r' : 'bdg-a'
                            }`} style={{ fontSize: '10px' }}>
                              {isOverdue ? 'OVERDUE' : inst.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px', display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {inst.status !== 'PAID' && (
                              <>
                                <button onClick={() => openPaymentModal(inst)} className="bsm s" style={{ padding: '6px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <Plus size={12} /> Log Pay
                                </button>
                                <button onClick={() => openNotifyModal(inst)} className="bsm g" style={{ padding: '6px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <MessageSquare size={12} /> Notify
                                </button>
                              </>
                            )}
                            {inst.status === 'PAID' && (
                              <span style={{ color: '#10b981', fontSize: '13px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Check size={14} /> Paid</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Workflow Consensus */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Panel consensus status */}
            {(() => {
              const reqState = loan.request || {};
              const assignedIds: string[] = reqState.assignedReviewers || [];
              const approvals: any[] = reqState.approvals || [];
              const threshold = reqState.threshold || 2;
              
              const approvedCount = approvals.filter(a => a.status === 'approved').length;
              
              const reviewerList: { name: string; status: 'APPROVED' | 'REJECTED' | 'PENDING'; date?: string }[] = [];
              
              if (assignedIds.length > 0) {
                assignedIds.forEach(id => {
                  const adminObj = admins.find(a => String(a.id) === String(id));
                  const name = adminObj ? adminObj.name : 'Committee Member';
                  const approvalObj = approvals.find(ap => String(ap.id) === String(id) || ap.by === name);
                  reviewerList.push({
                    name,
                    status: approvalObj ? (approvalObj.status === 'approved' ? 'APPROVED' : 'REJECTED') : 'PENDING',
                    date: approvalObj ? new Date(approvalObj.date).toLocaleDateString() : undefined
                  });
                });
              } else {
                approvals.forEach(ap => {
                  reviewerList.push({
                    name: ap.by || 'Admin',
                    status: ap.status === 'approved' ? 'APPROVED' : 'REJECTED',
                    date: new Date(ap.date).toLocaleDateString()
                  });
                });
                for (let i = reviewerList.length; i < threshold; i++) {
                  reviewerList.push({
                    name: `Committee Reviewer ${i + 1}`,
                    status: 'PENDING'
                  });
                }
              }

              return (
                <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 900, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>🛡️ Consensus Status</span>
                    <span style={{ fontSize: '12px', background: '#ecfdf5', color: '#10b981', padding: '2px 8px', borderRadius: '8px', fontWeight: 800 }}>
                      {approvedCount} of {threshold} Approved
                    </span>
                  </h3>
                  <p style={{ margin: '0 0 16px 0', fontSize: '11.5px', color: '#64748b' }}>
                    Requires at least {threshold} committee signatures to approve the application.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                    {reviewerList.map((rev, index) => (
                      <div key={index} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: index < reviewerList.length - 1 ? '1px solid #f1f5f9' : 'none', paddingBottom: index < reviewerList.length - 1 ? '8px' : '0' }}>
                        <div>
                          <span style={{ fontWeight: 700, color: '#334155' }}>{rev.name}</span>
                          {rev.date && <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '6px' }}>({rev.date})</span>}
                        </div>
                        <span style={{
                          fontWeight: 800,
                          color: rev.status === 'APPROVED' ? '#10b981' : rev.status === 'REJECTED' ? 'var(--red)' : '#64748b'
                        }}>
                          {rev.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

          {/* Audit trail / log */}
          {loan.coordinator_review_notes && (
            <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 900 }}>📋 Coordinator Verification Notes</h3>
              <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, background: '#f8fafc', padding: '12px', borderRadius: '12px' }}>
                "{loan.coordinator_review_notes}"
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Record Payment Modal */}
      {showPaymentModal && selectedInst && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: '400px', width: '90%', animation: 'slideUp 0.3s ease' }}>
            <div className="modal-head">
              <span className="modal-title">Record Repayment EMI #{selectedInst.installment_number}</span>
              <button onClick={() => setShowPaymentModal(false)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleRecordPayment} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="fl2">Amount Paid (₹)</label>
                <input
                  type="number"
                  value={amtPaid}
                  onChange={(e) => setAmtPaid(e.target.value)}
                  className="fi2"
                  required
                />
              </div>
              <div>
                <label className="fl2">Payment Method</label>
                <select value={payMethod} onChange={(e: any) => setPayMethod(e.target.value)} className="sel2">
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="fl2">Reference / Note (Optional)</label>
                <textarea
                  placeholder="Tx ID, Receipt Number, etc."
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="ta2"
                  rows={2}
                />
              </div>
              <div className="modal-foot" style={{ display: 'flex', gap: '8px', padding: '12px 0 0 0', border: 'none' }}>
                <button type="submit" className="bsm s" style={{ flex: 1 }}>Save Repayment</button>
                <button type="button" onClick={() => setShowPaymentModal(false)} className="bsm g">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notify Requester Modal */}
      {showNotifyModal && selectedInst && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: '500px', width: '90%', animation: 'slideUp 0.3s ease' }}>
            <div className="modal-head">
              <span className="modal-title">Notify Borrower Requester</span>
              <button onClick={() => setShowNotifyModal(false)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleNotifySubmit} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="fl2">Requester Phone</label>
                <a href={`tel:${loan.requester_phone || loan.phone}`} style={{ fontSize: '16px', color: 'var(--teal)', fontWeight: 900, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={16} /> {loan.requester_phone || loan.phone} (Tap to Call)</a>
              </div>
              <div>
                <label className="fl2">WhatsApp Reminder Message</label>
                <textarea
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  className="ta2"
                  rows={5}
                  required
                />
              </div>
              <div className="modal-foot" style={{ display: 'flex', gap: '8px', padding: '12px 0 0 0', border: 'none' }}>
                <button type="submit" className="bsm s" style={{ flex: 1 }}>Open WhatsApp & Send</button>
                <button type="button" onClick={() => setShowNotifyModal(false)} className="bsm g">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
