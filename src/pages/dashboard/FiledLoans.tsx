import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Search, Eye, Plus, RefreshCw, AlertCircle, FileText, CheckCircle, Clock, X, Share2, UserCheck } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

export default function FiledLoans() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETE'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  // Direct Filing Modal State
  const [showDirectFileModal, setShowDirectFileModal] = useState(false);
  const [applicantName, setApplicantName] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicantWhatsapp, setApplicantWhatsapp] = useState('');
  const [applicantAddress, setApplicantAddress] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [repaymentMonths, setRepaymentMonths] = useState('12');
  const [purposeCategory, setPurposeCategory] = useState('Medical');
  const [purposeDetail, setPurposeDetail] = useState('');
  const [memberNotes, setMemberNotes] = useState('');
  const [submittingDirect, setSubmittingDirect] = useState(false);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  async function loadFiledLoans() {
    if (!profile) return;
    setLoading(true);
    try {
      const memberId = profile.db_id || profile.id;
      
      const { data, error } = await supabase
        .from('loans')
        .select('*')
        .or(`filed_by_member_id.eq.${memberId},submitted_by_member_id.eq.${memberId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const loanList = data || [];
      setLoans(loanList);

      // Fetch count of overdue instalments across member's loans
      const loanIds = loanList.map(l => l.id);
      if (loanIds.length > 0) {
        const { count, error: instErr } = await supabase
          .from('repayment_instalments')
          .select('id', { count: 'exact', head: true })
          .in('loan_id', loanIds)
          .eq('status', 'OVERDUE');

        if (!instErr && count !== null) {
          setOverdueCount(count);
        }
      }
    } catch (err: any) {
      console.error('Failed to load filed loans:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiledLoans();
  }, [profile]);

  const handleDirectFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicantName.trim() || applicantName.trim().length < 3) {
      showToast('e', 'Applicant name is required (min 3 characters).');
      return;
    }
    if (!applicantPhone.trim() || !/^\d{10}$/.test(applicantPhone.replace(/\D/g, ''))) {
      showToast('e', 'Please enter a valid 10-digit applicant phone number.');
      return;
    }
    if (!applicantAddress.trim()) {
      showToast('e', 'Applicant address is required.');
      return;
    }
    const amt = parseFloat(loanAmount);
    if (isNaN(amt) || amt < 1000) {
      showToast('e', 'Loan amount must be at least ₹1,000.');
      return;
    }
    if (!purposeDetail.trim() || purposeDetail.trim().length < 20) {
      showToast('e', 'Purpose details must be at least 20 characters long.');
      return;
    }
    if (!memberNotes.trim() || memberNotes.trim().length < 15) {
      showToast('e', 'Member assessment notes are required (min 15 characters).');
      return;
    }

    setSubmittingDirect(true);
    try {
      const memberId = profile?.db_id || profile?.id;
      const memberCode = profile?.member_unique_code || profile?.code || 'MEMBER';
      const fullPurpose = `${purposeCategory}: ${purposeDetail.trim()}`;
      const months = parseInt(repaymentMonths || '12');

      let submissionSuccess = false;

      // 1. Primary: Serverless Service Role API Endpoint
      try {
        const apiRes = await fetch('/api/submit-loan-application', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicant_name: applicantName.trim(),
            applicant_phone: applicantPhone.trim(),
            applicant_address: applicantAddress.trim(),
            amount: amt,
            months: months,
            purpose: fullPurpose,
            member_notes: memberNotes.trim(),
            submitted_by_member_id: memberId
          })
        });

        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (apiData.success) {
            submissionSuccess = true;
          }
        }
      } catch (apiErr) {
        console.warn('API direct file submission fallback to client retry:', apiErr);
      }

      // 2. Client-side fallback if server endpoint is unreachable
      if (!submissionSuccess) {
        const generatedLoanNo = 'LN-' + Math.floor(100000 + Math.random() * 900000);
        const safePurpose = fullPurpose.slice(0, 200);
        const safeNotes = memberNotes.trim().slice(0, 200);

        const c1Payload: any = {
          loan_no: generatedLoanNo,
          name: applicantName.trim(),
          amount: amt,
          amt: amt,
          loan_amount_requested: amt,
          loan_amount_approved: amt,
          requester_name: applicantName.trim(),
          requester_phone: applicantPhone.trim(),
          requester_address: applicantAddress.trim(),
          purpose: safePurpose,
          repayment_period_months: months,
          member_notes: safeNotes,
          submitted_by_member_id: memberId,
          filed_by_member_id: memberId,
          status: 'pending'
        };

        const { data: c1Data, error: c1Err } = await supabase
          .from('loans')
          .insert([c1Payload])
          .select();

        if (!c1Err && c1Data && c1Data.length > 0) {
          submissionSuccess = true;
        } else {
          const c2Payload: any = {
            loan_no: generatedLoanNo,
            name: applicantName.trim(),
            amount: amt,
            amt: amt,
            purpose: safePurpose,
            status: 'pending'
          };

          const { data: c2Data, error: c2Err } = await supabase
            .from('loans')
            .insert([c2Payload])
            .select();

          if (c2Err) throw new Error(c2Err.message || 'Direct loan filing failed.');
          submissionSuccess = true;
        }
      }

      showToast('s', 'Loan application filed successfully! Forwarded to coordinator review.');
      setShowDirectFileModal(false);

      // Reset form
      setApplicantName('');
      setApplicantPhone('');
      setApplicantWhatsapp('');
      setApplicantAddress('');
      setLoanAmount('');
      setPurposeDetail('');
      setMemberNotes('');

      loadFiledLoans();
    } catch (err: any) {
      showToast('e', err.message || 'Direct loan filing failed.');
    } finally {
      setSubmittingDirect(false);
    }
  };

  const getWorkflowStatus = (l: any): string => {
    return l.workflow_status || l.status || 'PENDING_COORDINATOR_REVIEW';
  };

  const getPanelVotesCount = (l: any): string => {
    let count = 0;
    if (l.president_vote) count++;
    if (l.secretary_vote) count++;
    if (l.panel_coordinator_vote) count++;
    return `${count}/3`;
  };

  // KPI Calculations
  const totalFiled = loans.length;
  const underReviewCount = loans.filter(l => {
    const st = getWorkflowStatus(l);
    return st === 'PENDING_COORDINATOR_REVIEW' || st === 'PENDING_APPROVAL_PANEL';
  }).length;

  const activeLoansCount = loans.filter(l => {
    const st = getWorkflowStatus(l);
    return st === 'APPROVED' || st === 'DISBURSED';
  }).length;

  const filteredLoans = loans.filter(l => {
    const matchesSearch = (l.applicant_name || l.requester_name || l.name || '').toLowerCase().includes(search.toLowerCase());
    const wfStatus = getWorkflowStatus(l);
    
    if (activeTab === 'all') return matchesSearch;
    if (activeTab === 'PENDING') return (wfStatus === 'PENDING_COORDINATOR_REVIEW' || wfStatus === 'PENDING_APPROVAL_PANEL') && matchesSearch;
    if (activeTab === 'APPROVED') return (wfStatus === 'APPROVED' || wfStatus === 'DISBURSED') && matchesSearch;
    if (activeTab === 'REJECTED') return (wfStatus === 'REJECTED_BY_COORDINATOR' || wfStatus === 'REJECTED_BY_PANEL') && matchesSearch;
    if (activeTab === 'COMPLETE') return wfStatus === 'REPAYMENT_COMPLETE' && matchesSearch;
    return matchesSearch;
  });

  const getStatusBadge = (l: any) => {
    const status = getWorkflowStatus(l);
    switch (status) {
      case 'APPROVED':
      case 'DISBURSED':
        return <span className="bdg bdg-g">APPROVED</span>;
      case 'REPAYMENT_COMPLETE':
        return <span className="bdg bdg-g" style={{ backgroundColor: '#059669' }}>FULLY PAID</span>;
      case 'REJECTED_BY_COORDINATOR':
      case 'REJECTED_BY_PANEL':
        return <span className="bdg bdg-r">REJECTED</span>;
      case 'PENDING_COORDINATOR_REVIEW':
        return <span className="bdg bdg-a">PENDING REVIEW</span>;
      case 'PENDING_APPROVAL_PANEL':
        return <span className="bdg bdg-a" style={{ backgroundColor: '#6366f1' }}>UNDER REVIEW</span>;
      default:
        return <span className="bdg">{status.replace(/_/g, ' ')}</span>;
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 2000, background: toast.type === 's' ? '#0f172a' : 'var(--red)', color: '#fff', padding: '14px 24px', borderRadius: '16px', fontWeight: 700, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {toast.type === 's' ? '✅' : '⚠️'} {toast.msg}
        </div>
      )}

      {/* Header Bar */}
      <div className="pg-hd fu" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Loans I Filed</h1>
          <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Pipeline of all loan requests formally submitted to admin review panel</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={loadFiledLoans} className="bsm g" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => navigate('/member/dashboard/apply')} className="bsm g" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Share Applicant Link">
            <Share2 size={14} /> Share Link
          </button>
          <button onClick={() => setShowDirectFileModal(true)} className="bsm s" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#0f172a' }}>
            <Plus size={16} /> File New Application
          </button>
        </div>
      </div>

      {/* Helper Banner displaying logged-in member ID & info */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 18px', borderRadius: '16px', color: '#166534', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        <UserCheck size={18} />
        <span>
          Applications filed here are automatically tagged with your unique representative identity: <b>{profile?.name}</b> ({profile?.member_unique_code || profile?.code || 'Member'}). Reviewers will see this application came through your referral.
        </span>
      </div>

      {/* 4 Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div className="card" style={{ padding: '20px', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total Filed</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#0f172a', marginTop: '4px' }}>{totalFiled}</div>
        </div>

        <div className="card" style={{ padding: '20px', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Under Review</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#3b82f6', marginTop: '4px' }}>{underReviewCount}</div>
        </div>

        <div className="card" style={{ padding: '20px', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Active Loans</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#10b981', marginTop: '4px' }}>{activeLoansCount}</div>
        </div>

        <div className="card" style={{ padding: '20px', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Overdue Repayments</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#ef4444', marginTop: '4px' }}>{overdueCount}</div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e2e8f0', overflowX: 'auto' }}>
          {[
            { id: 'all', lbl: 'All Filed Loans' },
            { id: 'PENDING', lbl: 'Under Review' },
            { id: 'APPROVED', lbl: 'Approved / Active' },
            { id: 'REJECTED', lbl: 'Rejected' },
            { id: 'COMPLETE', lbl: 'Fully Paid' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                padding: '10px 16px',
                fontWeight: 800,
                fontSize: '13px',
                border: 'none',
                background: 'none',
                borderBottom: activeTab === t.id ? '3px solid var(--teal)' : '3px solid transparent',
                color: activeTab === t.id ? 'var(--teal)' : '#64748b',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {t.lbl}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: '260px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search applicant name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="fi2"
            style={{ width: '100%', paddingLeft: '36px', height: '38px', fontSize: '13px' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--teal)' }}>
          <div className="spinner">Loading Filed Loans...</div>
        </div>
      ) : filteredLoans.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
          <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: 'var(--teal)' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>No Filed Loans Found</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>You have not submitted any loan applications under this filter.</p>
        </div>
      ) : (
        <div className="card" style={{ background: '#fff', borderRadius: '24px', border: '1.5px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Applicant Name</th>
                  <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Amount (₹)</th>
                  <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Date Filed</th>
                  <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Coordinator</th>
                  <th style={{ textAlign: 'center', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Panel Vote</th>
                  <th style={{ textAlign: 'center', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoans.map((l) => {
                  const name = l.applicant_name || l.requester_name || l.name || 'Applicant';
                  const amount = l.loan_amount_approved || l.loan_amount_requested || l.amt || l.amount || 0;
                  const dateStr = l.created_at ? new Date(l.created_at).toLocaleDateString() : '—';
                  const coordStatus = l.coordinator_review_status === 'VERIFIED' ? 'Verified ✓' : (l.coordinator_review_status || 'Not assigned yet');

                  return (
                    <tr
                      key={l.id}
                      onClick={() => navigate(`/member/dashboard/filed-loans/${l.id}`)}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '16px 18px' }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>REF-{(String(l.id)).slice(0, 8).toUpperCase()}</div>
                      </td>

                      <td style={{ padding: '16px 18px', fontWeight: 950, color: 'var(--teal)', fontSize: '15px' }}>
                        ₹{Number(amount).toLocaleString()}
                      </td>

                      <td style={{ padding: '16px 18px', fontSize: '13px', color: '#475569' }}>
                        {dateStr}
                      </td>

                      <td style={{ padding: '16px 18px' }}>
                        {getStatusBadge(l)}
                      </td>

                      <td style={{ padding: '16px 18px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                        {coordStatus}
                      </td>

                      <td style={{ padding: '16px 18px', textAlign: 'center', fontWeight: 800, fontSize: '13px', color: '#334155' }}>
                        {getPanelVotesCount(l)}
                      </td>

                      <td style={{ padding: '16px 18px', textAlign: 'center' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/member/dashboard/filed-loans/${l.id}`); }}
                          className="bsm g"
                          style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Eye size={14} /> View
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

      {/* DIRECT LOAN FILING MODAL */}
      {showDirectFileModal && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, background: 'rgba(15, 23, 42, 0.5)' }}>
          <div className="modal" style={{ maxWidth: '580px', width: '92%', borderRadius: '24px', padding: '28px', background: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 950, color: '#0f172a', margin: 0 }}>File Loan Application</h3>
                <div style={{ fontSize: '12px', color: '#166534', fontWeight: 700, marginTop: '2px' }}>
                  Filing on behalf of applicant as Member: <b>{profile?.name}</b> ({profile?.member_unique_code || profile?.code || 'Member'})
                </div>
              </div>
              <button onClick={() => setShowDirectFileModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleDirectFileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Applicant Basic Details */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Applicant Information</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Applicant Full Name *</label>
                    <input
                      type="text"
                      placeholder="Full legal name of the loan seeker"
                      value={applicantName}
                      onChange={(e) => setApplicantName(e.target.value)}
                      className="fi2"
                      style={{ width: '100%' }}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className="fl2" style={{ fontWeight: 800 }}>Applicant Phone (10 digits) *</label>
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="Mobile number"
                        value={applicantPhone}
                        onChange={(e) => setApplicantPhone(e.target.value.replace(/\D/g, ''))}
                        className="fi2"
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                    <div>
                      <label className="fl2" style={{ fontWeight: 800 }}>WhatsApp Number (Optional)</label>
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="If different"
                        value={applicantWhatsapp}
                        onChange={(e) => setApplicantWhatsapp(e.target.value.replace(/\D/g, ''))}
                        className="fi2"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Applicant Full Address *</label>
                    <textarea
                      placeholder="House name, street, town, pin code"
                      value={applicantAddress}
                      onChange={(e) => setApplicantAddress(e.target.value)}
                      className="ta2"
                      rows={2}
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Loan Details */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Loan Specifications</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className="fl2" style={{ fontWeight: 800 }}>Loan Amount (₹) *</label>
                      <input
                        type="number"
                        min={1000}
                        placeholder="₹ Amount"
                        value={loanAmount}
                        onChange={(e) => setLoanAmount(e.target.value)}
                        className="fi2"
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                    <div>
                      <label className="fl2" style={{ fontWeight: 800 }}>Repayment Period (Months) *</label>
                      <input
                        type="number"
                        min={1}
                        max={36}
                        value={repaymentMonths}
                        onChange={(e) => setRepaymentMonths(e.target.value)}
                        className="fi2"
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Purpose Category *</label>
                    <select
                      value={purposeCategory}
                      onChange={(e) => setPurposeCategory(e.target.value)}
                      className="sel2"
                      style={{ width: '100%', height: '42px' }}
                    >
                      <option value="Medical">Medical Relief & Healthcare</option>
                      <option value="Education">Educational Support</option>
                      <option value="Business">Small Business & Livelihood</option>
                      <option value="Home Repair">Home Repair / Shelter</option>
                      <option value="Other">Other Purpose</option>
                    </select>
                  </div>

                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Detailed Purpose * (Min 20 chars)</label>
                    <textarea
                      placeholder="Detailed justification of why loan is needed..."
                      value={purposeDetail}
                      onChange={(e) => setPurposeDetail(e.target.value)}
                      className="ta2"
                      rows={2}
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Member Assessment */}
              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Your Representative Assessment Notes * (Min 15 chars)</label>
                <textarea
                  placeholder="Your personal assessment of the applicant's request, background, and credibility..."
                  value={memberNotes}
                  onChange={(e) => setMemberNotes(e.target.value)}
                  className="ta2"
                  rows={3}
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowDirectFileModal(false)} style={{ flex: 1, padding: '12px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={submittingDirect} className="bsm s" style={{ flex: 2, padding: '12px', borderRadius: '12px', fontWeight: 900, background: '#0f172a' }}>
                  {submittingDirect ? 'Filing Application...' : 'File Application to Review Panel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
