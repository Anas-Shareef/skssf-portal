import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Inbox, Eye, ArrowRight, XCircle, CheckCircle2, Clock, Search, AlertCircle, FileText, UserCheck } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

export default function MemberInbox() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'NEW' | 'REVIEWED' | 'SUBMITTED' | 'DISMISSED'>('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  // Modals
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showDismissModal, setShowDismissModal] = useState(false);

  // Submit Form state
  const [memberNotes, setMemberNotes] = useState('');
  const [recommendedAmount, setRecommendedAmount] = useState('');
  const [relationship, setRelationship] = useState('Neighbour / Community Member');
  const [dismissalReason, setDismissalReason] = useState('');
  const [actioning, setActioning] = useState(false);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  async function loadInbox() {
    if (!profile) return;
    try {
      setLoading(true);
      let dataList: any[] = [];

      // 1. Try Service Role Endpoint (Bypasses RLS & handles all schema variations)
      try {
        const token = sessionStorage.getItem('active_api_token') || '';
        const res = await fetch('/api/get-member-inbox', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const apiRes = await res.json();
          if (apiRes.success && Array.isArray(apiRes.requests)) {
            dataList = apiRes.requests;
          }
        }
      } catch (apiErr) {
        console.warn('API get-member-inbox fallback to direct client query:', apiErr);
      }

      // 2. Direct client query fallback if API not used
      if (dataList.length === 0) {
        const memberId = profile.db_id || profile.id;
        const memberName = profile.name || '';
        const memberCode = profile.member_unique_code || profile.code || '';

        const { data: clientData, error } = await supabase
          .from('loan_requests')
          .select('*')
          .or(`member_id.eq.${memberId},referred_member_id.eq.${memberId},referred_member_name.ilike.%${memberName}%,reason.ilike.%${memberName}%,reason.ilike.%${memberCode}%`)
          .order('created_at', { ascending: false });

        if (!error && clientData) {
          dataList = clientData;
        }
      }

      // Normalize statuses for display
      const normalized = dataList.map(item => {
        let st = item.status || 'NEW';
        if (st === 'DRAFT_UNASSIGNED' || st === 'DRAFT' || st === 'pending') st = 'NEW';
        if (st === 'CONVERTED' || st === 'forwarded' || st === 'SUBMITTED') st = 'SUBMITTED';
        return { ...item, normalizedStatus: st };
      });

      // Sort: NEW first, then REVIEWED, then SUBMITTED/DISMISSED
      normalized.sort((a, b) => {
        const order: Record<string, number> = { NEW: 1, REVIEWED: 2, SUBMITTED: 3, DISMISSED: 4 };
        const oa = order[a.normalizedStatus] || 5;
        const ob = order[b.normalizedStatus] || 5;
        if (oa !== ob) return oa - ob;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setRequests(normalized);
    } catch (err) {
      console.error('Failed to load member inbox:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInbox();
  }, [profile]);

  // Open item & mark status as REVIEWED if currently NEW
  const handleOpenDetail = async (req: any) => {
    setSelectedRequest(req);
    setRecommendedAmount(String(req.loan_amount_requested || req.approximate_amount || ''));
    setMemberNotes('');
    
    if (req.normalizedStatus === 'NEW') {
      try {
        await supabase
          .from('loan_requests')
          .update({ status: 'pending' })
          .eq('id', req.id);
        
        req.normalizedStatus = 'REVIEWED';
      } catch (err) {
        console.warn('Silent update request status fallback:', err);
      }
    }
  };

  const handleFormalSubmitToAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberNotes.trim() || memberNotes.trim().length < 20) {
      showToast('e', 'Member assessment notes must be at least 20 characters long.');
      return;
    }
    const recAmt = parseFloat(recommendedAmount);
    if (isNaN(recAmt) || recAmt <= 0) {
      showToast('e', 'Please enter a valid recommended amount.');
      return;
    }

    setActioning(true);
    try {
      const memberId = profile?.db_id || profile?.id;
      const applicantName = selectedRequest.applicant_name || selectedRequest.requester_name || selectedRequest.name || 'Applicant';
      const applicantPhone = selectedRequest.applicant_phone || selectedRequest.requester_phone || selectedRequest.phone || '';
      const applicantAddress = selectedRequest.requester_address || selectedRequest.applicant_address_house || '';
      const rawPurpose = selectedRequest.loan_purpose_detail || selectedRequest.reason || selectedRequest.purpose || 'Loan Request';
      const months = selectedRequest.repayment_period_months || 12;

      let submissionSuccess = false;

      // 1. Primary: Serverless Service Role API Endpoint (Bypasses RLS, handles all NOT NULL & VARCHAR(255) constraints)
      try {
        const apiRes = await fetch('/api/submit-loan-application', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_request_id: selectedRequest.id,
            applicant_name: applicantName,
            applicant_phone: applicantPhone,
            applicant_address: applicantAddress,
            amount: recAmt,
            months: months,
            relationship: relationship,
            member_notes: memberNotes.trim(),
            purpose: rawPurpose,
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
        console.warn('API submission fallback to direct client retry:', apiErr);
      }

      // 2. Client-side fallback if server endpoint is unreachable
      if (!submissionSuccess) {
        const generatedLoanNo = 'LN-' + Math.floor(100000 + Math.random() * 900000);
        const safePurpose = rawPurpose.slice(0, 200);
        const safeNotes = memberNotes.trim().slice(0, 200);

        // Candidate 1: Standard PRD schema with both `name` and `requester_name`
        const c1Payload: any = {
          loan_no: generatedLoanNo,
          name: applicantName,
          requester_name: applicantName,
          requester_phone: applicantPhone,
          requester_address: applicantAddress,
          loan_amount_requested: recAmt,
          loan_amount_approved: recAmt,
          purpose: safePurpose,
          repayment_period_months: months,
          member_notes: safeNotes,
          submitted_by_member_id: memberId,
          status: 'pending'
        };

        const { data: c1Data, error: c1Err } = await supabase
          .from('loans')
          .insert([c1Payload])
          .select();

        if (!c1Err && c1Data && c1Data.length > 0) {
          submissionSuccess = true;
        } else {
          // Candidate 2: Base schema with `name`, `loan_no`, `purpose`, `status`
          const c2Payload: any = {
            loan_no: generatedLoanNo,
            name: applicantName,
            purpose: safePurpose,
            status: 'pending'
          };

          const { data: c2Data, error: c2Err } = await supabase
            .from('loans')
            .insert([c2Payload])
            .select();

          if (c2Err) throw new Error(c2Err.message || 'Submission failed.');
          submissionSuccess = true;
        }

        // Update status of loan_requests item
        try {
          await supabase
            .from('loan_requests')
            .update({ status: 'forwarded' })
            .eq('id', selectedRequest.id);
        } catch (updErr) {
          console.warn('Silent update loan_requests status fallback:', updErr);
        }
      }

      showToast('s', 'Loan request submitted successfully to Admin Review Panel!');
      setShowSubmitModal(false);
      setSelectedRequest(null);
      loadInbox();
    } catch (err: any) {
      showToast('e', err.message || 'Submission to admin failed.');
    } finally {
      setActioning(false);
    }
  };

  const handleDismissRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dismissalReason.trim()) {
      showToast('e', 'Please state the reason for dismissing this request.');
      return;
    }

    setActioning(true);
    try {
      await supabase
        .from('loan_requests')
        .update({
          status: 'DISMISSED',
          dismissal_reason: dismissalReason.trim()
        })
        .eq('id', selectedRequest.id);

      showToast('s', 'Request dismissed.');
      setShowDismissModal(false);
      setSelectedRequest(null);
      loadInbox();
    } catch (err: any) {
      showToast('e', err.message || 'Dismissal update failed.');
    } finally {
      setActioning(false);
    }
  };

  // Filter List
  const filteredRequests = requests.filter(r => {
    const matchesSearch = (r.applicant_name || r.requester_name || '').toLowerCase().includes(search.toLowerCase()) ||
                          (r.applicant_phone || r.requester_phone || '').includes(search);
    if (activeTab === 'all') return matchesSearch;
    return r.normalizedStatus === activeTab && matchesSearch;
  });

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'NEW':
        return <span className="bdg bdg-r" style={{ background: '#ef4444', color: '#fff', fontWeight: 900 }}>NEW</span>;
      case 'REVIEWED':
        return <span className="bdg bdg-a">REVIEWED</span>;
      case 'SUBMITTED':
        return <span className="bdg bdg-g">SUBMITTED TO ADMIN</span>;
      case 'DISMISSED':
        return <span className="bdg" style={{ background: '#e2e8f0', color: '#64748b' }}>DISMISSED</span>;
      default:
        return <span className="bdg">{st}</span>;
    }
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
          <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Applications Inbox</h1>
          <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Review loan applications submitted via your public share link</p>
        </div>
        <button onClick={loadInbox} className="bsm g" style={{ fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          Refresh Inbox
        </button>
      </div>

      {/* Filter Tabs & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e2e8f0', overflowX: 'auto' }}>
          {[
            { id: 'all', lbl: `All (${requests.length})` },
            { id: 'NEW', lbl: `New (${requests.filter(r => r.normalizedStatus === 'NEW').length})` },
            { id: 'REVIEWED', lbl: `Reviewed (${requests.filter(r => r.normalizedStatus === 'REVIEWED').length})` },
            { id: 'SUBMITTED', lbl: `Submitted to Admin (${requests.filter(r => r.normalizedStatus === 'SUBMITTED').length})` },
            { id: 'DISMISSED', lbl: `Dismissed (${requests.filter(r => r.normalizedStatus === 'DISMISSED').length})` }
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
            placeholder="Search by applicant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="fi2"
            style={{ width: '100%', paddingLeft: '36px', height: '38px', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Requests List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--teal)' }}>
          <div className="spinner">Loading Inbox Submissions...</div>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
          <Inbox size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: 'var(--teal)' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>Inbox is Empty</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>No applicant submissions found under this filter.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {filteredRequests.map((req) => {
            const name = req.applicant_name || req.requester_name || 'Applicant';
            const amount = req.loan_amount_requested || req.approximate_amount || 0;
            const category = req.loan_purpose_category || 'Loan Request';
            const dateStr = req.created_at || req.submitted_at ? new Date(req.created_at || req.submitted_at).toLocaleDateString() : '—';
            const isNew = req.normalizedStatus === 'NEW';

            return (
              <div
                key={req.id}
                className="card"
                style={{
                  padding: '20px',
                  borderRadius: '20px',
                  background: '#fff',
                  border: isNew ? '2px solid #ef4444' : '1.5px solid #e2e8f0',
                  boxShadow: isNew ? '0 10px 25px -5px rgba(239, 68, 68, 0.1)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justify: 'space-between',
                  gap: '14px',
                  position: 'relative'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>{name}</h3>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginTop: '2px' }}>
                        REF-{(String(req.id)).slice(0, 8).toUpperCase()} • {dateStr}
                      </div>
                    </div>
                    {getStatusBadge(req.normalizedStatus)}
                  </div>

                  <div style={{ margin: '12px 0 8px 0', padding: '10px 14px', background: '#f8fafc', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569' }}>Requested Amount:</span>
                    <span style={{ fontSize: '16px', fontWeight: 950, color: 'var(--teal)' }}>₹{Number(amount).toLocaleString()}</span>
                  </div>

                  <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.4 }}>
                    <b>Purpose:</b> {category} — {req.loan_purpose_detail || req.reason || 'Not specified'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '12px', marginTop: 'auto' }}>
                  <button
                    onClick={() => handleOpenDetail(req)}
                    className="bsm s"
                    style={{ flex: 1, padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#0f172a' }}
                  >
                    <Eye size={14} /> View Application Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL DRAWER MODAL */}
      {selectedRequest && !showSubmitModal && !showDismissModal && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, background: 'rgba(15, 23, 42, 0.5)' }}>
          <div className="modal" style={{ maxWidth: '640px', width: '92%', borderRadius: '24px', padding: '28px', background: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 950, color: '#0f172a', margin: 0 }}>
                  {selectedRequest.applicant_name || selectedRequest.requester_name || 'Applicant'}
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                  Reference: REF-{(String(selectedRequest.id)).slice(0, 8).toUpperCase()}
                </div>
              </div>
              <button onClick={() => setSelectedRequest(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><XCircle size={24} /></button>
            </div>

            {/* Applicant Detail Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Section A — Personal Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                  <div><b>Phone:</b> {selectedRequest.applicant_phone || selectedRequest.requester_phone || '—'}</div>
                  <div><b>WhatsApp:</b> {selectedRequest.applicant_whatsapp || '—'}</div>
                  <div><b>DOB / Gender:</b> {selectedRequest.applicant_dob || '—'} ({selectedRequest.applicant_gender || '—'})</div>
                  <div><b>Aadhaar Last 4:</b> {selectedRequest.applicant_aadhaar_last4 || '—'}</div>
                  <div style={{ gridColumn: '1 / -1' }}><b>Address:</b> {selectedRequest.requester_address || `${selectedRequest.applicant_address_house || ''}, ${selectedRequest.applicant_address_city || ''}`}</div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Section B — Loan Specifications</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                  <div><b>Requested Amount:</b> <span style={{ color: 'var(--teal)', fontWeight: 900 }}>₹{Number(selectedRequest.loan_amount_requested || selectedRequest.approximate_amount || 0).toLocaleString()}</span></div>
                  <div><b>Repayment Period:</b> {selectedRequest.repayment_period_months || 12} Months</div>
                  <div><b>Monthly Income:</b> ₹{Number(selectedRequest.monthly_income || 0).toLocaleString()} ({selectedRequest.income_source || '—'})</div>
                  <div><b>Existing Debts:</b> {selectedRequest.existing_debts ? `Yes — ${selectedRequest.existing_debts_detail || ''}` : 'No'}</div>
                  <div style={{ gridColumn: '1 / -1' }}><b>Purpose Details:</b> {selectedRequest.loan_purpose_detail || selectedRequest.reason || '—'}</div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            {selectedRequest.normalizedStatus !== 'SUBMITTED' && selectedRequest.normalizedStatus !== 'DISMISSED' ? (
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setShowDismissModal(true)}
                  className="bsm r"
                  style={{ flex: 1, padding: '12px', borderRadius: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <XCircle size={16} /> Dismiss Request
                </button>
                <button
                  onClick={() => setShowSubmitModal(true)}
                  className="bsm s"
                  style={{ flex: 2, padding: '12px', borderRadius: '14px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--teal)' }}
                >
                  Submit to Admin Review Panel <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '14px', textAlign: 'center', fontSize: '13px', fontWeight: 800, color: '#64748b' }}>
                Status: {selectedRequest.normalizedStatus === 'SUBMITTED' ? '✅ Forwarded to Admin Review Panel' : '⛔ Dismissed'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FORMAL SUBMIT TO ADMIN MODAL */}
      {showSubmitModal && selectedRequest && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1300, background: 'rgba(15, 23, 42, 0.6)' }}>
          <div className="modal" style={{ maxWidth: '520px', width: '92%', borderRadius: '24px', padding: '28px', background: '#fff' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: '0 0 16px 0' }}>
              Submit to Admin Review Panel
            </h3>

            <form onSubmit={handleFormalSubmitToAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Recommended Amount (₹) *</label>
                <input
                  type="number"
                  value={recommendedAmount}
                  onChange={(e) => setRecommendedAmount(e.target.value)}
                  className="fi2"
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Your Relationship to Applicant *</label>
                <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className="sel2" style={{ width: '100%', height: '42px' }}>
                  <option value="Neighbour / Community Member">Neighbour / Community Member</option>
                  <option value="Mahallu Relative">Mahallu Relative</option>
                  <option value="Colleague / Associate">Colleague / Associate</option>
                  <option value="Other Representative">Other Representative</option>
                </select>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Your Member Assessment Notes * (Min 20 chars)</label>
                <textarea
                  placeholder="Enter your personal assessment of the applicant's credibility, situation, and repayment capability..."
                  value={memberNotes}
                  onChange={(e) => setMemberNotes(e.target.value)}
                  className="ta2"
                  rows={4}
                  style={{ width: '100%' }}
                  required
                />
                <div style={{ fontSize: '11px', color: memberNotes.trim().length < 20 ? 'var(--red)' : '#64748b', fontWeight: 700, textAlign: 'right', marginTop: '2px' }}>
                  {memberNotes.trim().length}/20 chars min
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowSubmitModal(false)} style={{ flex: 1, padding: '12px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={actioning || memberNotes.trim().length < 20} className="bsm s" style={{ flex: 2, padding: '12px', borderRadius: '12px', fontWeight: 900, background: 'var(--teal)' }}>
                  {actioning ? 'Submitting...' : 'Confirm Submission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DISMISS MODAL */}
      {showDismissModal && selectedRequest && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1300, background: 'rgba(15, 23, 42, 0.6)' }}>
          <div className="modal" style={{ maxWidth: '440px', width: '92%', borderRadius: '24px', padding: '28px', background: '#fff' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#ef4444', margin: '0 0 16px 0' }}>
              Dismiss Loan Request
            </h3>

            <form onSubmit={handleDismissRequest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Reason for Dismissal *</label>
                <textarea
                  placeholder="Explain why this request is being dismissed..."
                  value={dismissalReason}
                  onChange={(e) => setDismissalReason(e.target.value)}
                  className="ta2"
                  rows={3}
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowDismissModal(false)} style={{ flex: 1, padding: '12px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={actioning} className="bsm r" style={{ flex: 1, padding: '12px', borderRadius: '12px', fontWeight: 900 }}>
                  {actioning ? 'Dismissing...' : 'Confirm Dismiss'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
