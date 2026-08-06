import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { ArrowLeft, User, Phone, MapPin, IndianRupee, Download, Bell, Plus, CheckCircle, AlertCircle, Clock, ShieldCheck, FileText, X } from 'lucide-react';

export default function FiledLoanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loan, setLoan] = useState<any>(null);
  const [instalments, setInstalments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  // Modal States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInst, setSelectedInst] = useState<any>(null);
  const [amtPaid, setAmtPaid] = useState('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'Bank Transfer' | 'Online' | 'Other'>('Cash');
  const [payNote, setPayNote] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [sendingNotify, setSendingNotify] = useState(false);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  async function loadLoanData() {
    if (!id) return;
    try {
      setLoading(true);

      // 1. Fetch loan detail
      const { data: loanData, error: loanErr } = await supabase
        .from('loans')
        .select('*')
        .eq('id', id)
        .single();

      if (loanErr) throw loanErr;
      setLoan(loanData);

      // 2. Fetch repayment instalments if loan is approved or active
      const status = loanData.workflow_status || loanData.status;
      if (status === 'APPROVED' || status === 'DISBURSED' || status === 'REPAYMENT_COMPLETE') {
        const { data: instData, error: instErr } = await supabase
          .from('repayment_instalments')
          .select('*')
          .eq('loan_id', id)
          .order('instalment_number', { ascending: true });

        if (!instErr && instData) {
          // Sort OVERDUE first, then by instalment_number
          const sorted = [...instData].sort((a, b) => {
            const isOverdueA = a.status === 'OVERDUE' || (a.status === 'PENDING' && new Date(a.due_date) < new Date());
            const isOverdueB = b.status === 'OVERDUE' || (b.status === 'PENDING' && new Date(b.due_date) < new Date());
            if (isOverdueA && !isOverdueB) return -1;
            if (!isOverdueA && isOverdueB) return 1;
            return a.instalment_number - b.instalment_number;
          });
          setInstalments(sorted);
        }
      }
    } catch (err: any) {
      console.error('Failed to load loan details:', err);
      showToast('e', err.message || 'Failed to load loan details.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLoanData();
  }, [id]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInst) return;

    const paidVal = parseFloat(amtPaid);
    const balance = selectedInst.amount_due - (selectedInst.amount_paid || 0);

    if (isNaN(paidVal) || paidVal <= 0 || paidVal > balance) {
      showToast('e', `Payment amount cannot exceed remaining balance of ₹${balance.toLocaleString()}`);
      return;
    }

    setSavingPayment(true);
    try {
      const newPaidAmt = Number(selectedInst.amount_paid || 0) + paidVal;
      const isFullyPaid = newPaidAmt >= selectedInst.amount_due;
      const newStatus = isFullyPaid ? 'PAID' : 'PARTIAL';
      const todayStr = new Date().toISOString().split('T')[0];

      // Update repayment_instalment in Supabase
      const { error: updateErr } = await supabase
        .from('repayment_instalments')
        .update({
          amount_paid: newPaidAmt,
          status: newStatus,
          payment_date: todayStr,
          payment_method: payMethod,
          reference_note: payNote.trim(),
          recorded_by_user_id: profile?.db_id || profile?.id
        })
        .eq('id', selectedInst.id);

      if (updateErr) throw updateErr;

      // Check if all instalments for this loan are now PAID
      const { data: allInsts } = await supabase
        .from('repayment_instalments')
        .select('status')
        .eq('loan_id', id);

      if (allInsts && allInsts.every(inst => inst.status === 'PAID')) {
        await supabase
          .from('loans')
          .update({ workflow_status: 'REPAYMENT_COMPLETE', status: 'completed' })
          .eq('id', id);
      }

      showToast('s', 'Payment recorded successfully!');
      setShowPaymentModal(false);
      setSelectedInst(null);
      setAmtPaid('');
      setPayNote('');
      loadLoanData();
    } catch (err: any) {
      showToast('e', err.message || 'Failed to record payment.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleSendReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim()) return;

    setSendingNotify(true);
    try {
      const memberId = profile?.db_id || profile?.id;
      
      // Log to requester_notifications table
      await supabase
        .from('requester_notifications')
        .insert([{
          loan_id: id,
          instalment_id: selectedInst ? selectedInst.id : null,
          sent_by_member_id: memberId,
          message_text: msgText.trim(),
          delivery_method: 'PORTAL_LOG'
        }]);

      showToast('s', 'Applicant reminder logged! Opening communication links...');
      setShowNotifyModal(false);

      // Open WhatsApp link
      const phoneNo = loan.applicant_phone || loan.applicant_whatsapp || loan.requester_phone;
      if (phoneNo) {
        const url = `https://api.whatsapp.com/send?phone=${phoneNo.replace(/\D/g, '')}&text=${encodeURIComponent(msgText.trim())}`;
        window.open(url, '_blank');
      }
    } catch (err: any) {
      showToast('e', err.message || 'Failed to send notification.');
    } finally {
      setSendingNotify(false);
    }
  };

  const openNotifyModal = (inst?: any) => {
    setSelectedInst(inst || null);
    const name = loan.applicant_name || loan.requester_name;
    const dueAmt = inst ? (inst.amount_due - (inst.amount_paid || 0)) : (loan.loan_amount_approved || loan.loan_amount_requested);
    const dueDateStr = inst?.due_date ? new Date(inst.due_date).toLocaleDateString() : 'due date';
    
    const msg = `Dear ${name}, your SKSSF loan repayment of ₹${Number(dueAmt).toLocaleString()} is due on ${dueDateStr}. Please arrange payment at your earliest convenience. — ${profile?.name || 'Representative'}, SKSSF`;
    setMsgText(msg);
    setShowNotifyModal(true);
  };

  const openPaymentModal = (inst: any) => {
    setSelectedInst(inst);
    setAmtPaid(String(inst.amount_due - (inst.amount_paid || 0)));
    setShowPaymentModal(true);
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--teal)' }}>
        <div className="spinner">Loading Loan Details...</div>
      </div>
    );
  }

  if (!loan) return null;

  const isApproved = loan.workflow_status === 'APPROVED' || loan.workflow_status === 'DISBURSED' || loan.workflow_status === 'REPAYMENT_COMPLETE';
  const isRejected = (loan.workflow_status || '').includes('REJECTED');
  const refCode = `REF-${String(loan.id).slice(0, 8).toUpperCase()}`;

  // Schedule Summary Calculations
  const totalLoanAmt = loan.loan_amount_approved || loan.loan_amount_requested || 0;
  const totalPaidAmt = instalments.reduce((sum, inst) => sum + Number(inst.amount_paid || 0), 0);
  const outstandingAmt = Math.max(0, totalLoanAmt - totalPaidAmt);
  const progressPct = totalLoanAmt > 0 ? Math.min(100, Math.round((totalPaidAmt / totalLoanAmt) * 100)) : 0;

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 2000, background: toast.type === 's' ? '#0f172a' : 'var(--red)', color: '#fff', padding: '14px 24px', borderRadius: '16px', fontWeight: 700, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {toast.type === 's' ? '✅' : '⚠️'} {toast.msg}
        </div>
      )}

      {/* SECTION A — Page Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <button onClick={() => navigate('/member/dashboard/filed-loans')} style={{ background: 'none', border: 'none', color: '#64748b', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginBottom: '6px' }}>
            <ArrowLeft size={16} /> Back to Filed Loans
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 950, color: '#0f172a', margin: 0 }}>
              Loan Application — {loan.applicant_name || loan.requester_name}
            </h1>
            <span style={{ fontSize: '12px', fontWeight: 900, background: '#f1f5f9', color: 'var(--teal)', padding: '3px 10px', borderRadius: '8px', fontFamily: 'monospace' }}>
              {refCode}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={handleDownloadPDF} className="bsm g" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Download size={15} /> Download PDF
          </button>
          <span className={`bdg ${isApproved ? 'bdg-g' : isRejected ? 'bdg-r' : 'bdg-a'}`} style={{ fontSize: '12px', padding: '8px 16px', borderRadius: '12px' }}>
            {loan.workflow_status ? loan.workflow_status.replace(/_/g, ' ') : 'PENDING'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px', flexWrap: 'wrap' }}>
        
        {/* Left Column: Applicant Info, Loan Specs, Repayment Schedule */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* SECTION B — Applicant Information Card */}
          <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="var(--teal)" /> Section B — Applicant Details
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13.5px' }}>
              <div><b>Full Name:</b> {loan.applicant_name || loan.requester_name}</div>
              <div>
                <b>Phone:</b>{' '}
                <a href={`tel:${loan.applicant_phone || loan.requester_phone}`} style={{ color: 'var(--teal)', fontWeight: 800, textDecoration: 'none' }}>
                  📞 {loan.applicant_phone || loan.requester_phone}
                </a>
              </div>
              <div><b>WhatsApp:</b> {loan.applicant_whatsapp || 'Same as phone'}</div>
              <div><b>Date of Birth:</b> {loan.applicant_dob ? new Date(loan.applicant_dob).toLocaleDateString() : 'N/A'}</div>
              <div><b>Gender:</b> {loan.applicant_gender || 'N/A'}</div>
              <div><b>Aadhaar (Last 4):</b> <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>XXXX-{loan.applicant_aadhaar_last4 || 'XXXX'}</span></div>
              <div><b>Monthly Income:</b> ₹{Number(loan.monthly_income || 0).toLocaleString()}</div>
              <div><b>Source of Income:</b> {loan.income_source || 'N/A'}</div>
              <div style={{ gridColumn: 'span 2' }}>
                <b>Address:</b> {loan.applicant_address_house ? `${loan.applicant_address_house}, ${loan.applicant_address_street}, ${loan.applicant_address_city} - ${loan.applicant_address_pin}` : loan.requester_address}
              </div>
            </div>
          </div>

          {/* SECTION C — Loan Details Card */}
          <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IndianRupee size={18} color="var(--teal)" /> Section C — Loan Details
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13.5px' }}>
              <div><b>Amount Requested:</b> <span style={{ color: 'var(--teal)', fontWeight: 900 }}>₹{Number(loan.loan_amount_requested || loan.amount || 0).toLocaleString()}</span></div>
              <div><b>Amount Approved:</b> <span style={{ color: '#10b981', fontWeight: 900 }}>{loan.loan_amount_approved ? `₹${Number(loan.loan_amount_approved).toLocaleString()}` : '— (Pending Approval)'}</span></div>
              <div><b>Repayment Period:</b> {loan.repayment_period_months || 12} Months</div>
              <div><b>Date Filed by Member:</b> {loan.created_at ? new Date(loan.created_at).toLocaleDateString() : '—'}</div>
              <div style={{ gridColumn: 'span 2' }}>
                <b>Purpose:</b> {loan.purpose || loan.loan_purpose || 'General Support'}
              </div>
              {loan.member_notes && (
                <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <b>Member Assessment Notes:</b>
                  <p style={{ margin: '4px 0 0 0', color: '#475569', fontStyle: 'italic' }}>"{loan.member_notes}"</p>
                </div>
              )}
            </div>
          </div>

          {/* SECTION E — 📅 Repayment Schedule (Auto-Generated on Approval) */}
          {isApproved ? (
            <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 950, color: '#0f172a' }}>
                  📅 Repayment Schedule
                </h3>
                
                {/* Section F: Standalone Send Reminder trigger */}
                <button onClick={() => openNotifyModal()} className="bsm s" style={{ padding: '8px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#0f172a' }}>
                  <Bell size={14} /> Send Reminder to Applicant
                </button>
              </div>

              {instalments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '13px' }}>
                  Repayment schedule generated upon approval. Loading instalments...
                </div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                          <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>#</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Due Date</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Amount Due</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Amount Paid</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Payment Date</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Status</th>
                          <th style={{ textAlign: 'center', padding: '12px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {instalments.map((inst) => {
                          const isPaid = inst.status === 'PAID';
                          const isOverdue = inst.status === 'OVERDUE' || (!isPaid && new Date(inst.due_date) < new Date());
                          const isUpcoming7Days = !isPaid && !isOverdue && (new Date(inst.due_date).getTime() - new Date().getTime() <= 7 * 24 * 60 * 60 * 1000);

                          return (
                            <tr
                              key={inst.id}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                borderLeft: isOverdue ? '4px solid #ef4444' : isUpcoming7Days ? '4px solid #f59e0b' : 'none',
                                background: isOverdue ? '#fef2f2' : isUpcoming7Days ? '#fffbeb' : 'transparent'
                              }}
                            >
                              <td style={{ padding: '14px 12px', fontWeight: 800 }}>#{inst.instalment_number}</td>
                              <td style={{ padding: '14px 12px', fontSize: '13px', fontWeight: 700 }}>{new Date(inst.due_date).toLocaleDateString()}</td>
                              <td style={{ padding: '14px 12px', fontWeight: 900 }}>₹{Number(inst.amount_due).toLocaleString()}</td>
                              <td style={{ padding: '14px 12px', color: '#10b981', fontWeight: 900 }}>₹{Number(inst.amount_paid || 0).toLocaleString()}</td>
                              <td style={{ padding: '14px 12px', fontSize: '12px', color: '#64748b' }}>
                                {inst.payment_date ? new Date(inst.payment_date).toLocaleDateString() : '—'}
                              </td>
                              <td style={{ padding: '14px 12px' }}>
                                <span className={`bdg ${
                                  isPaid ? 'bdg-g' : isOverdue ? 'bdg-r' : isUpcoming7Days ? 'bdg-a' : 'bdg-a'
                                }`} style={{ fontSize: '10px' }}>
                                  {isPaid ? 'PAID' : isOverdue ? 'OVERDUE' : inst.status}
                                </span>
                              </td>
                              <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                {!isPaid && (
                                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                    <button onClick={() => openPaymentModal(inst)} className="bsm s" style={{ padding: '6px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <Plus size={12} /> Record
                                    </button>
                                    <button onClick={() => openNotifyModal(inst)} className="bsm g" style={{ padding: '6px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <Bell size={12} /> Notify
                                    </button>
                                  </div>
                                )}
                                {isPaid && (
                                  <span style={{ color: '#10b981', fontSize: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <CheckCircle size={14} /> Paid
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Bar */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800, marginBottom: '8px' }}>
                      <span>Total Loan: ₹{Number(totalLoanAmt).toLocaleString()}</span>
                      <span>Paid: ₹{Number(totalPaidAmt).toLocaleString()}</span>
                      <span>Outstanding: <b style={{ color: '#ef4444' }}>₹{Number(outstandingAmt).toLocaleString()}</b></span>
                    </div>

                    <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${progressPct}%`, height: '100%', background: '#10b981', transition: 'width 0.4s ease' }}></div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '11px', color: '#64748b', fontWeight: 800, marginTop: '4px' }}>
                      {progressPct}% Repaid
                    </div>
                  </div>
                </>
              )}

            </div>
          ) : (
            <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#f8fafc', border: '1.5px dashed #cbd5e1', textAlign: 'center', color: '#64748b' }}>
              <Clock size={36} style={{ margin: '0 auto 12px', opacity: 0.5, color: 'var(--teal)' }} />
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>Repayment Schedule Pending Approval</h4>
              <p style={{ margin: '6px 0 0 0', fontSize: '13px' }}>The monthly repayment schedule will be auto-generated as soon as the 3-person panel approves the application.</p>
            </div>
          )}

        </div>

        {/* Right Column: SECTION D — Live Review Status Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="var(--teal)" /> Section D — Review Status
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Step 1: Member Submission */}
              <div style={{ borderLeft: '3px solid #10b981', paddingLeft: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>1. Member Submission</div>
                <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 800, marginTop: '2px' }}>✅ Completed</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Submitted by {profile?.name || 'Member'}</div>
              </div>

              {/* Step 2: Coordinator Review */}
              <div style={{ borderLeft: `3px solid ${loan.coordinator_review_status === 'VERIFIED' ? '#10b981' : loan.coordinator_review_status === 'REJECTED' ? '#ef4444' : '#f59e0b'}`, paddingLeft: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>2. Coordinator Review</div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: loan.coordinator_review_status === 'VERIFIED' ? '#10b981' : loan.coordinator_review_status === 'REJECTED' ? '#ef4444' : '#f59e0b', marginTop: '2px' }}>
                  {loan.coordinator_review_status === 'VERIFIED' ? '✅ Verified' : loan.coordinator_review_status === 'REJECTED' ? '❌ Rejected' : '⏳ In Progress'}
                </div>
                {loan.coordinator_review_notes && <div style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic', marginTop: '2px' }}>"{loan.coordinator_review_notes}"</div>}
              </div>

              {/* Step 3: President Vote */}
              <div style={{ borderLeft: `3px solid ${loan.president_vote === 'APPROVE' ? '#10b981' : loan.president_vote === 'REJECT' ? '#ef4444' : '#cbd5e1'}`, paddingLeft: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>3. President Vote</div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: loan.president_vote === 'APPROVE' ? '#10b981' : loan.president_vote === 'REJECT' ? '#ef4444' : '#64748b', marginTop: '2px' }}>
                  {loan.president_vote ? loan.president_vote : '⏳ Pending'}
                </div>
              </div>

              {/* Step 4: Secretary Vote */}
              <div style={{ borderLeft: `3px solid ${loan.secretary_vote === 'APPROVE' ? '#10b981' : loan.secretary_vote === 'REJECT' ? '#ef4444' : '#cbd5e1'}`, paddingLeft: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>4. Secretary Vote</div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: loan.secretary_vote === 'APPROVE' ? '#10b981' : loan.secretary_vote === 'REJECT' ? '#ef4444' : '#64748b', marginTop: '2px' }}>
                  {loan.secretary_vote ? loan.secretary_vote : '⏳ Pending'}
                </div>
              </div>

              {/* Step 5: Panel Coordinator Vote */}
              <div style={{ borderLeft: `3px solid ${loan.panel_coordinator_vote === 'APPROVE' ? '#10b981' : loan.panel_coordinator_vote === 'REJECT' ? '#ef4444' : '#cbd5e1'}`, paddingLeft: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>5. Panel Coordinator Vote</div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: loan.panel_coordinator_vote === 'APPROVE' ? '#10b981' : loan.panel_coordinator_vote === 'REJECT' ? '#ef4444' : '#64748b', marginTop: '2px' }}>
                  {loan.panel_coordinator_vote ? loan.panel_coordinator_vote : '⏳ Pending'}
                </div>
              </div>

              {/* Final Banner */}
              {isApproved && (
                <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', padding: '14px', borderRadius: '14px', color: '#166534', textAlign: 'center', marginTop: '8px' }}>
                  <div style={{ fontWeight: 950, fontSize: '14px' }}>🎉 LOAN APPROVED</div>
                  <div style={{ fontSize: '12px', marginTop: '2px' }}>Approved Amount: <b>₹{Number(loan.loan_amount_approved || loan.loan_amount_requested).toLocaleString()}</b></div>
                </div>
              )}

              {isRejected && (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', padding: '14px', borderRadius: '14px', color: '#991b1b', textAlign: 'center', marginTop: '8px' }}>
                  <div style={{ fontWeight: 950, fontSize: '14px' }}>⛔ LOAN REJECTED</div>
                  {loan.rejection_reason && <div style={{ fontSize: '12px', marginTop: '4px' }}>Reason: "{loan.rejection_reason}"</div>}
                </div>
              )}

            </div>
          </div>

        </div>

      </div>

      {/* RECORD PAYMENT MODAL */}
      {showPaymentModal && selectedInst && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, background: 'rgba(15, 23, 42, 0.5)' }}>
          <div className="modal" style={{ maxWidth: '440px', width: '92%', borderRadius: '24px', padding: '28px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0 }}>Record Payment — Inst #{selectedInst.instalment_number}</h3>
              <button onClick={() => setShowPaymentModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Amount Paid (₹) *</label>
                <input
                  type="number"
                  max={selectedInst.amount_due - (selectedInst.amount_paid || 0)}
                  value={amtPaid}
                  onChange={(e) => setAmtPaid(e.target.value)}
                  className="fi2"
                  style={{ width: '100%' }}
                  required
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                  Remaining Due: ₹{Number(selectedInst.amount_due - (selectedInst.amount_paid || 0)).toLocaleString()}
                </div>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Payment Method *</label>
                <select value={payMethod} onChange={(e: any) => setPayMethod(e.target.value)} className="sel2" style={{ width: '100%', height: '42px' }}>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Online">Online / UPI</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Reference / Receipt Note</label>
                <input
                  type="text"
                  placeholder="E.g. TXN-9981 or receipt number"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="fi2"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowPaymentModal(false)} style={{ flex: 1, padding: '12px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={savingPayment} className="bsm s" style={{ flex: 1, padding: '12px', borderRadius: '12px', fontWeight: 900, background: '#0f172a' }}>
                  {savingPayment ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NOTIFY APPLICANT MODAL */}
      {showNotifyModal && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, background: 'rgba(15, 23, 42, 0.5)' }}>
          <div className="modal" style={{ maxWidth: '500px', width: '92%', borderRadius: '24px', padding: '28px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0 }}>Notify Applicant</h3>
              <button onClick={() => setShowNotifyModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSendReminder} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                <div><b>Applicant:</b> {loan.applicant_name || loan.requester_name}</div>
                <div>
                  <b>Phone:</b>{' '}
                  <a href={`tel:${loan.applicant_phone || loan.requester_phone}`} style={{ color: 'var(--teal)', fontWeight: 800 }}>
                    {loan.applicant_phone || loan.requester_phone}
                  </a>
                </div>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Reminder Message</label>
                <textarea
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  className="ta2"
                  rows={4}
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowNotifyModal(false)} style={{ flex: 1, padding: '12px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={sendingNotify} className="bsm s" style={{ flex: 2, padding: '12px', borderRadius: '12px', fontWeight: 900, background: '#25D366' }}>
                  {sendingNotify ? 'Logging...' : 'Send via WhatsApp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
