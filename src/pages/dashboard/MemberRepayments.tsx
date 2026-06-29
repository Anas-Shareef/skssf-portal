import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AlertTriangle, MessageSquare, Plus, Phone, CheckCircle2 } from 'lucide-react';

export default function MemberRepayments() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'overdue'>('upcoming');
  const [installments, setInstallments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [selectedInst, setSelectedInst] = useState<any>(null);
  const [amtPaid, setAmtPaid] = useState('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'Bank Transfer' | 'Other'>('Cash');
  const [payNote, setPayNote] = useState('');
  const [msgText, setMsgText] = useState('');

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  async function loadRepayments() {
    if (!profile) return;
    try {
      setLoading(true);
      const token = sessionStorage.getItem('active_api_token') || '';
      const res = await fetch('/api/get-member-repayments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      setInstallments(data.installments || []);
    } catch (err: any) {
      console.error('Failed to load repayments:', err);
      showToast('e', err.message || 'Failed to load repayments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRepayments();
  }, [profile]);

  const today = new Date().toISOString().split('T')[0];
  const next30Days = new Date();
  next30Days.setDate(next30Days.getDate() + 30);
  const limitDate = next30Days.toISOString().split('T')[0];

  const upcomingList = installments.filter(inst => 
    inst.status !== 'PAID' && inst.due_date >= today && inst.due_date <= limitDate
  );

  const overdueList = installments.filter(inst => 
    inst.status === 'OVERDUE' || (inst.status !== 'PAID' && inst.due_date < today)
  );

  const displayedList = activeTab === 'upcoming' ? upcomingList : overdueList;

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const paidVal = Number(amtPaid);
    const balance = selectedInst.amount_due - selectedInst.amount_paid;
    if (paidVal <= 0 || paidVal > balance) {
      showToast('e', `Payment amount must be between ₹1 and ₹${balance}`);
      return;
    }

    try {
      const token = sessionStorage.getItem('active_api_token') || '';
      const res = await fetch('/api/record-member-repayment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          selectedInstId: selectedInst.id,
          amtPaid: paidVal,
          payMethod,
          payNote: payNote.trim()
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      showToast('s', 'Payment logged successfully!');
      setShowPaymentModal(false);
      setSelectedInst(null);
      setAmtPaid('');
      setPayNote('');
      loadRepayments();
    } catch (err: any) {
      showToast('e', err.message || 'Payment log failed.');
    }
  };

  const handleNotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim()) return;

    try {
      const token = sessionStorage.getItem('active_api_token') || '';
      const res = await fetch('/api/log-member-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          loanId: selectedInst.loan_id,
          installmentId: selectedInst.id,
          messageText: msgText.trim()
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      showToast('s', 'Notification logged. Opening WhatsApp...');
      setShowNotifyModal(false);

      const encodedMsg = encodeURIComponent(msgText.trim());
      const phoneNo = selectedInst.loans?.requester_phone || selectedInst.loans?.phone;
      const url = `https://api.whatsapp.com/send?phone=${phoneNo}&text=${encodedMsg}`;
      window.open(url, '_blank');
    } catch (err: any) {
      showToast('e', err.message || 'Failed to log notification.');
    }
  };

  const openNotifyModal = (inst: any) => {
    setSelectedInst(inst);
    const amountStr = Number(inst.amount_due - inst.amount_paid).toLocaleString();
    const msg = `Dear ${inst.loans?.requester_name || inst.loans?.name}, your repayment installment #${inst.installment_number} of ₹${amountStr} for your SKSSF loan is due on ${new Date(inst.due_date).toLocaleDateString()}. Please coordinate to submit the payment soon. Thank you! — ${profile?.name}, SKSSF.`;
    setMsgText(msg);
    setShowNotifyModal(true);
  };

  const openPaymentModal = (inst: any) => {
    setSelectedInst(inst);
    setAmtPaid(String(inst.amount_due - inst.amount_paid));
    setShowPaymentModal(true);
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 1000, background: toast.type === 's' ? '#0f172a' : 'var(--red)', color: '#fff', padding: '14px 24px', borderRadius: '16px', fontWeight: 700, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {toast.type === 's' ? '✅' : '⚠️'} {toast.msg}
        </div>
      )}

      {overdueList.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fef2f2', border: '1.5px solid #fecaca', padding: '16px', borderRadius: '16px', marginBottom: '24px', color: '#991b1b' }}>
          <AlertTriangle size={20} />
          <div style={{ fontSize: '14px', fontWeight: 800 }}>You have {overdueList.length} overdue repayment(s) requiring attention.</div>
        </div>
      )}

      <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', marginBottom: '6px' }}>Repayments Portal</h1>
      <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px' }}>Manage installments and send reminders for applications you filed</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setActiveTab('upcoming')}
          style={{
            padding: '12px 20px',
            fontWeight: 800,
            fontSize: '14px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'upcoming' ? '3px solid var(--teal)' : '3px solid transparent',
            color: activeTab === 'upcoming' ? 'var(--teal)' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Upcoming Installments ({upcomingList.length})
        </button>
        <button
          onClick={() => setActiveTab('overdue')}
          style={{
            padding: '12px 20px',
            fontWeight: 800,
            fontSize: '14px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'overdue' ? '3px solid var(--teal)' : '3px solid transparent',
            color: activeTab === 'overdue' ? 'var(--teal)' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Overdue Installments ({overdueList.length})
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '50px', color: 'var(--teal)' }}>
          <div className="spinner">Loading Repayments...</div>
        </div>
      ) : displayedList.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '20px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
          <CheckCircle2 size={48} style={{ margin: '0 auto 16px', color: '#10b981', opacity: 0.8 }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>No Payments Due</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>All borrower installments are currently fully clear.</p>
        </div>
      ) : (
        <div className="card" style={{ background: '#fff', borderRadius: '20px', border: '1.5px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Borrower</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>EMI #</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Amount Due</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Due Date</th>
                  <th style={{ textAlign: 'center', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedList.map((inst) => {
                  const amountRemaining = inst.amount_due - inst.amount_paid;
                  return (
                    <tr key={inst.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: activeTab === 'overdue' ? '#fff5f5' : 'transparent' }}>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: 800, color: '#1e293b' }}>{inst.loans?.requester_name || inst.loans?.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{inst.loans?.requester_phone || inst.loans?.phone}</div>
                      </td>
                      <td style={{ padding: '16px', fontWeight: 700 }}>#{inst.installment_number}</td>
                      <td style={{ padding: '16px', fontWeight: 900, color: activeTab === 'overdue' ? 'var(--red)' : 'var(--teal)' }}>
                        ₹{amountRemaining.toLocaleString()}
                      </td>
                      <td style={{ padding: '16px', fontSize: '13px' }}>
                        {new Date(inst.due_date).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '16px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button onClick={() => openPaymentModal(inst)} className="bsm s" style={{ padding: '8px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Plus size={14} /> Log Pay
                        </button>
                        <button onClick={() => openNotifyModal(inst)} className="bsm g" style={{ padding: '8px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <MessageSquare size={14} /> Notify
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

      {/* Notify Modal */}
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
                <a href={`tel:${selectedInst.loans?.requester_phone || selectedInst.loans?.phone}`} style={{ fontSize: '16px', color: 'var(--teal)', fontWeight: 900, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={16} /> {selectedInst.loans?.requester_phone || selectedInst.loans?.phone} (Tap to Call)</a>
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
