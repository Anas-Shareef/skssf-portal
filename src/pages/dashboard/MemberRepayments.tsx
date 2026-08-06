import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Bell, Plus, Phone, CheckCircle2, AlertTriangle, Calendar, IndianRupee, Clock, Search, X } from 'lucide-react';

export default function MemberRepayments() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'overdue' | 'paid'>('upcoming');
  const [installments, setInstallments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [selectedInst, setSelectedInst] = useState<any>(null);
  const [amtPaid, setAmtPaid] = useState('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'Bank Transfer' | 'Online' | 'Other'>('Cash');
  const [payNote, setPayNote] = useState('');
  const [msgText, setMsgText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  async function loadRepayments() {
    if (!profile) return;
    try {
      setLoading(true);
      const memberId = profile.db_id || profile.id;

      // 1. Fetch member's loans
      const { data: loansData, error: loansErr } = await supabase
        .from('loans')
        .select('id, applicant_name, applicant_phone, applicant_whatsapp, requester_name, requester_phone')
        .or(`filed_by_member_id.eq.${memberId},submitted_by_member_id.eq.${memberId}`);

      if (loansErr) throw loansErr;

      const loanMap = new Map((loansData || []).map(l => [l.id, l]));
      const loanIds = Array.from(loanMap.keys());

      if (loanIds.length === 0) {
        setInstallments([]);
        setLoading(false);
        return;
      }

      // 2. Fetch repayment_instalments for these loans
      const { data: instData, error: instErr } = await supabase
        .from('repayment_instalments')
        .select('*')
        .in('loan_id', loanIds)
        .order('due_date', { ascending: true });

      if (instErr) throw instErr;

      const enriched = (instData || []).map(inst => {
        const loan = loanMap.get(inst.loan_id);
        const name = loan ? (loan.applicant_name || loan.requester_name) : 'Applicant';
        const phone = loan ? (loan.applicant_phone || loan.applicant_whatsapp || loan.requester_phone) : '';
        return {
          ...inst,
          applicantName: name,
          applicantPhone: phone
        };
      });

      setInstallments(enriched);
    } catch (err: any) {
      console.error('Failed to load repayments:', err);
      showToast('e', err.message || 'Failed to load repayments data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRepayments();
  }, [profile]);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const next60Days = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const currentMonthYear = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  // KPI Computations
  const dueThisMonthAmt = installments
    .filter(i => i.status !== 'PAID' && i.due_date && i.due_date.startsWith(currentMonthYear))
    .reduce((sum, i) => sum + Number(i.amount_due - (i.amount_paid || 0)), 0);

  const overdueList = installments.filter(i => 
    i.status === 'OVERDUE' || (i.status !== 'PAID' && i.due_date < todayStr)
  ).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const overdueTotalAmt = overdueList.reduce((sum, i) => sum + Number(i.amount_due - (i.amount_paid || 0)), 0);

  const paidThisMonthAmt = installments
    .filter(i => i.status === 'PAID' && i.payment_date && i.payment_date.startsWith(currentMonthYear))
    .reduce((sum, i) => sum + Number(i.amount_paid || 0), 0);

  const totalOutstandingAmt = installments
    .filter(i => i.status !== 'PAID')
    .reduce((sum, i) => sum + Number(i.amount_due - (i.amount_paid || 0)), 0);

  // Tab Filtering
  const upcomingList = installments
    .filter(i => i.status !== 'PAID' && i.due_date >= todayStr && i.due_date <= next60Days)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const paidList = installments
    .filter(i => i.status === 'PAID')
    .sort((a, b) => new Date(b.payment_date || b.updated_at).getTime() - new Date(a.payment_date || a.updated_at).getTime());

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInst) return;

    const paidVal = parseFloat(amtPaid);
    const balance = selectedInst.amount_due - (selectedInst.amount_paid || 0);

    if (isNaN(paidVal) || paidVal <= 0 || paidVal > balance) {
      showToast('e', `Payment amount cannot exceed remaining balance of ₹${balance.toLocaleString()}`);
      return;
    }

    setSubmitting(true);
    try {
      const newPaidAmt = Number(selectedInst.amount_paid || 0) + paidVal;
      const isFullyPaid = newPaidAmt >= selectedInst.amount_due;
      const newStatus = isFullyPaid ? 'PAID' : 'PARTIAL';

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

      showToast('s', 'Repayment payment recorded!');
      setShowPaymentModal(false);
      setSelectedInst(null);
      setAmtPaid('');
      setPayNote('');
      loadRepayments();
    } catch (err: any) {
      showToast('e', err.message || 'Payment log failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim() || !selectedInst) return;

    setSubmitting(true);
    try {
      const memberId = profile?.db_id || profile?.id;

      await supabase
        .from('requester_notifications')
        .insert([{
          loan_id: selectedInst.loan_id,
          instalment_id: selectedInst.id,
          sent_by_member_id: memberId,
          message_text: msgText.trim(),
          delivery_method: 'PORTAL_LOG'
        }]);

      showToast('s', 'Applicant reminder logged! Opening WhatsApp...');
      setShowNotifyModal(false);

      if (selectedInst.applicantPhone) {
        const url = `https://api.whatsapp.com/send?phone=${selectedInst.applicantPhone.replace(/\D/g, '')}&text=${encodeURIComponent(msgText.trim())}`;
        window.open(url, '_blank');
      }
    } catch (err: any) {
      showToast('e', err.message || 'Notification log failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const openNotifyModal = (inst: any) => {
    setSelectedInst(inst);
    const amountStr = Number(inst.amount_due - (inst.amount_paid || 0)).toLocaleString();
    const msg = `Dear ${inst.applicantName}, your SKSSF loan repayment of ₹${amountStr} is due on ${new Date(inst.due_date).toLocaleDateString()}. Please arrange payment at your earliest convenience. — ${profile?.name || 'Representative'}, SKSSF`;
    setMsgText(msg);
    setShowNotifyModal(true);
  };

  const openPaymentModal = (inst: any) => {
    setSelectedInst(inst);
    setAmtPaid(String(inst.amount_due - (inst.amount_paid || 0)));
    setShowPaymentModal(true);
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 2000, background: toast.type === 's' ? '#0f172a' : 'var(--red)', color: '#fff', padding: '14px 24px', borderRadius: '16px', fontWeight: 700, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {toast.type === 's' ? '✅' : '⚠️'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="pg-hd fu" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Repayments Overview</h1>
          <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Track, remind, and record instalment payments across all your active loans</p>
        </div>
      </div>

      {/* 4 Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div className="card" style={{ padding: '20px', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Due This Month</div>
          <div style={{ fontSize: '24px', fontWeight: 950, color: '#3b82f6', marginTop: '4px' }}>₹{Number(dueThisMonthAmt).toLocaleString()}</div>
        </div>

        <div className="card" style={{ padding: '20px', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Overdue</div>
          <div style={{ fontSize: '24px', fontWeight: 950, color: '#ef4444', marginTop: '4px' }}>
            {overdueList.length} <span style={{ fontSize: '13px', fontWeight: 700 }}>(₹{Number(overdueTotalAmt).toLocaleString()})</span>
          </div>
        </div>

        <div className="card" style={{ padding: '20px', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Paid This Month</div>
          <div style={{ fontSize: '24px', fontWeight: 950, color: '#10b981', marginTop: '4px' }}>₹{Number(paidThisMonthAmt).toLocaleString()}</div>
        </div>

        <div className="card" style={{ padding: '20px', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total Outstanding</div>
          <div style={{ fontSize: '24px', fontWeight: 950, color: '#0f172a', marginTop: '4px' }}>₹{Number(totalOutstandingAmt).toLocaleString()}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
        {[
          { id: 'upcoming', lbl: `Upcoming (${upcomingList.length})` },
          { id: 'overdue', lbl: `Overdue (${overdueList.length})` },
          { id: 'paid', lbl: `Paid History (${paidList.length})` }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            style={{
              padding: '12px 20px',
              fontWeight: 800,
              fontSize: '14px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === t.id ? '3px solid var(--teal)' : '3px solid transparent',
              color: activeTab === t.id ? 'var(--teal)' : '#64748b',
              cursor: 'pointer'
            }}
          >
            {t.lbl}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--teal)' }}>
          <div className="spinner">Loading Repayments...</div>
        </div>
      ) : activeTab === 'upcoming' ? (
        /* TAB 1: UPCOMING */
        upcomingList.length === 0 ? (
          <div className="card" style={{ padding: '50px 20px', textAlign: 'center', borderRadius: '20px', background: '#fff' }}>
            <Clock size={44} style={{ margin: '0 auto 12px', opacity: 0.3, color: 'var(--teal)' }} />
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>No Upcoming Instalments</h4>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>You have no pending instalments due in the next 60 days.</p>
          </div>
        ) : (
          <div className="card" style={{ background: '#fff', borderRadius: '24px', border: '1.5px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Applicant</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Due Date</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Amount Due</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Days Until Due</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Instalment #</th>
                    <th style={{ textAlign: 'center', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingList.map((inst) => {
                    const daysLeft = Math.ceil((new Date(inst.due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const isWithin7Days = daysLeft <= 7;
                    const dueAmt = inst.amount_due - (inst.amount_paid || 0);

                    return (
                      <tr
                        key={inst.id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: isWithin7Days ? '#fffbeb' : 'transparent',
                          borderLeft: isWithin7Days ? '4px solid #f59e0b' : 'none'
                        }}
                      >
                        <td style={{ padding: '16px 18px', fontWeight: 800, color: '#0f172a' }}>
                          {inst.applicantName}
                        </td>
                        <td style={{ padding: '16px 18px', fontSize: '13px', fontWeight: 700 }}>
                          {new Date(inst.due_date).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '16px 18px', fontWeight: 950, color: 'var(--teal)', fontSize: '15px' }}>
                          ₹{Number(dueAmt).toLocaleString()}
                        </td>
                        <td style={{ padding: '16px 18px', fontSize: '13px' }}>
                          <span style={{ fontWeight: 800, color: isWithin7Days ? '#d97706' : '#475569' }}>
                            {daysLeft === 0 ? 'Due Today' : `${daysLeft} days`}
                          </span>
                        </td>
                        <td style={{ padding: '16px 18px', fontWeight: 800, fontSize: '13px', color: '#64748b' }}>
                          #{inst.instalment_number}
                        </td>
                        <td style={{ padding: '16px 18px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            {isWithin7Days && (
                              <button onClick={() => openNotifyModal(inst)} className="bsm g" style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Bell size={14} color="#d97706" /> Notify
                              </button>
                            )}
                            <button onClick={() => openPaymentModal(inst)} className="bsm s" style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#0f172a' }}>
                              <Plus size={14} /> Record
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : activeTab === 'overdue' ? (
        /* TAB 2: OVERDUE */
        overdueList.length === 0 ? (
          <div className="card" style={{ padding: '50px 20px', textAlign: 'center', borderRadius: '20px', background: '#fff' }}>
            <CheckCircle2 size={44} style={{ margin: '0 auto 12px', color: '#10b981' }} />
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#10b981' }}>No Overdue Instalments</h4>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>All repayments are up to date!</p>
          </div>
        ) : (
          <div className="card" style={{ background: '#fff', borderRadius: '24px', border: '1.5px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#fef2f2' }}>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#991b1b', fontWeight: 900, textTransform: 'uppercase' }}>Applicant</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#991b1b', fontWeight: 900, textTransform: 'uppercase' }}>Was Due On</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#991b1b', fontWeight: 900, textTransform: 'uppercase' }}>Amount Due</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#991b1b', fontWeight: 900, textTransform: 'uppercase' }}>Days Overdue</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#991b1b', fontWeight: 900, textTransform: 'uppercase' }}>Amount Paid So Far</th>
                    <th style={{ textAlign: 'center', padding: '14px 18px', fontSize: '11px', color: '#991b1b', fontWeight: 900, textTransform: 'uppercase' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueList.map((inst) => {
                    const daysOverdue = Math.floor((today.getTime() - new Date(inst.due_date).getTime()) / (1000 * 60 * 60 * 24));
                    const dueAmt = inst.amount_due - (inst.amount_paid || 0);

                    return (
                      <tr
                        key={inst.id}
                        style={{ borderBottom: '1px solid #f1f5f9', background: '#fef2f2', borderLeft: '4px solid #ef4444' }}
                      >
                        <td style={{ padding: '16px 18px', fontWeight: 800, color: '#0f172a' }}>
                          {inst.applicantName}
                        </td>
                        <td style={{ padding: '16px 18px', fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>
                          {new Date(inst.due_date).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '16px 18px', fontWeight: 950, color: '#ef4444', fontSize: '15px' }}>
                          ₹{Number(dueAmt).toLocaleString()}
                        </td>
                        <td style={{ padding: '16px 18px', fontSize: '13px', fontWeight: 900, color: '#ef4444' }}>
                          {daysOverdue} days overdue
                        </td>
                        <td style={{ padding: '16px 18px', fontSize: '13px', fontWeight: 800, color: '#475569' }}>
                          ₹{Number(inst.amount_paid || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '16px 18px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button onClick={() => openNotifyModal(inst)} className="bsm r" style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Bell size={14} /> Notify
                            </button>
                            <button onClick={() => openPaymentModal(inst)} className="bsm s" style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#0f172a' }}>
                              <Plus size={14} /> Record
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* TAB 3: PAID HISTORY */
        paidList.length === 0 ? (
          <div className="card" style={{ padding: '50px 20px', textAlign: 'center', borderRadius: '20px', background: '#fff' }}>
            <FileText size={44} style={{ margin: '0 auto 12px', opacity: 0.3, color: 'var(--teal)' }} />
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>No Paid History Yet</h4>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>Recorded repayment history will appear here.</p>
          </div>
        ) : (
          <div className="card" style={{ background: '#fff', borderRadius: '24px', border: '1.5px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f0fdf4' }}>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#166534', fontWeight: 900, textTransform: 'uppercase' }}>Applicant</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#166534', fontWeight: 900, textTransform: 'uppercase' }}>Instalment #</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#166534', fontWeight: 900, textTransform: 'uppercase' }}>Amount Paid</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#166534', fontWeight: 900, textTransform: 'uppercase' }}>Payment Date</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#166534', fontWeight: 900, textTransform: 'uppercase' }}>Method</th>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#166534', fontWeight: 900, textTransform: 'uppercase' }}>Receipt / Note</th>
                  </tr>
                </thead>
                <tbody>
                  {paidList.map((inst) => (
                    <tr key={inst.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '16px 18px', fontWeight: 800, color: '#0f172a' }}>{inst.applicantName}</td>
                      <td style={{ padding: '16px 18px', fontWeight: 800, fontSize: '13px', color: '#475569' }}>#{inst.instalment_number}</td>
                      <td style={{ padding: '16px 18px', fontWeight: 950, color: '#10b981', fontSize: '15px' }}>₹{Number(inst.amount_paid).toLocaleString()}</td>
                      <td style={{ padding: '16px 18px', fontSize: '13px', color: '#475569' }}>{inst.payment_date ? new Date(inst.payment_date).toLocaleDateString() : '—'}</td>
                      <td style={{ padding: '16px 18px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>{inst.payment_method || 'Cash'}</td>
                      <td style={{ padding: '16px 18px', fontSize: '13px', color: '#64748b', fontStyle: inst.reference_note ? 'normal' : 'italic' }}>
                        {inst.reference_note || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* RECORD PAYMENT MODAL */}
      {showPaymentModal && selectedInst && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, background: 'rgba(15, 23, 42, 0.5)' }}>
          <div className="modal" style={{ maxWidth: '440px', width: '92%', borderRadius: '24px', padding: '28px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0 }}>Record Payment — {selectedInst.applicantName}</h3>
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
                <button type="submit" disabled={submitting} className="bsm s" style={{ flex: 1, padding: '12px', borderRadius: '12px', fontWeight: 900, background: '#0f172a' }}>
                  {submitting ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NOTIFY APPLICANT MODAL */}
      {showNotifyModal && selectedInst && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, background: 'rgba(15, 23, 42, 0.5)' }}>
          <div className="modal" style={{ maxWidth: '500px', width: '92%', borderRadius: '24px', padding: '28px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0 }}>Notify Applicant</h3>
              <button onClick={() => setShowNotifyModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSendReminder} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                <div><b>Applicant:</b> {selectedInst.applicantName}</div>
                <div><b>Phone:</b> <a href={`tel:${selectedInst.applicantPhone}`} style={{ color: 'var(--teal)', fontWeight: 800 }}>{selectedInst.applicantPhone}</a></div>
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
                <button type="submit" disabled={submitting} className="bsm s" style={{ flex: 2, padding: '12px', borderRadius: '12px', fontWeight: 900, background: '#25D366' }}>
                  {submitting ? 'Logging...' : 'Send via WhatsApp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
