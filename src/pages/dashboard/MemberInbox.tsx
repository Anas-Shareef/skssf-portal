import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Inbox, AlertTriangle, Eye, ArrowRight, XCircle, Phone, Search, FileText, CheckCircle2, X } from 'lucide-react';

export default function MemberInbox() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'NEW' | 'REVIEWED' | 'SUBMITTED' | 'DISMISSED'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  
  // Submit to Admin Pre-Submission Modal State
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [memberNotes, setMemberNotes] = useState('');
  const [recommendedAmount, setRecommendedAmount] = useState('');
  const [relationship, setRelationship] = useState('Community member');
  const [submittingAdmin, setSubmittingAdmin] = useState(false);

  // Dismiss Modal State
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const [dismissing, setDismissing] = useState(false);

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  async function loadInbox() {
    if (!profile) return;
    try {
      setLoading(true);
      const memberId = profile.db_id || profile.id;
      
      const { data, error } = await supabase
        .from('loan_requests')
        .select('*')
        .or(`member_id.eq.${memberId},referred_member_id.eq.${memberId},referred_member_name.ilike.%${profile.name}%`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Normalize statuses for display (legacy fallback mapping)
      const normalized = (data || []).map(item => {
        let st = item.status || 'NEW';
        if (st === 'DRAFT_UNASSIGNED' || st === 'DRAFT') st = 'NEW';
        if (st === 'CONVERTED') st = 'SUBMITTED';
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
          .update({ status: 'REVIEWED' })
          .eq('id', req.id);
        
        // Local update
        req.normalizedStatus = 'REVIEWED';
        req.status = 'REVIEWED';
      } catch (err) {
        console.error('Error marking request as REVIEWED:', err);
      }
    }
  };

  const handleFormalSubmitToAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    if (!memberNotes.trim() || memberNotes.trim().length < 20) {
      showToast('e', 'Member notes are required (minimum 20 characters).');
      return;
    }

    setSubmittingAdmin(true);
    try {
      const memberId = profile?.db_id || profile?.id;
      const req = selectedRequest;
      const recAmt = recommendedAmount ? parseFloat(recommendedAmount) : (req.loan_amount_requested || req.approximate_amount);
      const appName = req.applicant_name || req.requester_name;
      const appPhone = req.applicant_phone || req.requester_phone;
      const appWhatsapp = req.applicant_whatsapp || appPhone;
      const purposeStr = req.loan_purpose_detail || req.reason || req.loan_purpose_category || 'General Support';
      const period = req.repayment_period_months || 12;

      // 1. Create record in loans table
      const { data: newLoan, error: loanErr } = await supabase
        .from('loans')
        .insert([{
          submitted_by_member_id: memberId,
          filed_by_member_id: memberId,
          loan_request_id: req.id,
          applicant_name: appName,
          applicant_phone: appPhone,
          applicant_whatsapp: appWhatsapp,
          loan_amount_requested: req.loan_amount_requested || req.approximate_amount,
          loan_amount_approved: recAmt,
          purpose: purposeStr,
          repayment_period_months: period,
          member_notes: memberNotes.trim(),
          workflow_status: 'PENDING_COORDINATOR_REVIEW',
          submission_source: 'inbox'
        }])
        .select()
        .single();

      if (loanErr) throw loanErr;

      // 2. Update loan_requests status to SUBMITTED
      const { error: updateErr } = await supabase
        .from('loan_requests')
        .update({
          status: 'SUBMITTED',
          converted_to_loan_id: newLoan ? newLoan.id : null,
          member_notes: memberNotes.trim(),
          member_recommended_amount: recAmt,
          member_relationship: relationship
        })
        .eq('id', req.id);

      if (updateErr) throw updateErr;

      showToast('s', 'Loan application formally submitted to admin review panel!');
      setShowSubmitModal(false);
      setSelectedRequest(null);
      loadInbox();
    } catch (err: any) {
      showToast('e', err.message || 'Failed to submit loan application.');
    } finally {
      setSubmittingAdmin(false);
    }
  };

  const handleDismiss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dismissReason.trim()) {
      showToast('e', 'Reason for dismissal is required.');
      return;
    }
    setDismissing(true);
    try {
      const { error } = await supabase
        .from('loan_requests')
        .update({
          status: 'DISMISSED',
          dismissal_reason: dismissReason.trim(),
          dismissed_by: profile?.db_id || profile?.id
        })
        .eq('id', selectedRequest.id);

      if (error) throw error;

      showToast('s', 'Loan request dismissed.');
      setShowDismissModal(false);
      setSelectedRequest(null);
      setDismissReason('');
      loadInbox();
    } catch (err: any) {
      showToast('e', err.message || 'Dismissal failed.');
    } finally {
      setDismissing(false);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (activeFilter !== 'all' && r.normalizedStatus !== activeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = (r.applicant_name || r.requester_name || '').toLowerCase();
      const ref = (r.id || '').toLowerCase();
      return name.includes(q) || ref.includes(q);
    }
    return true;
  });

  const unreadNewCount = requests.filter(r => r.normalizedStatus === 'NEW').length;

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 2000, background: toast.type === 's' ? '#0f172a' : 'var(--red)', color: '#fff', padding: '14px 24px', borderRadius: '16px', fontWeight: 700, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {toast.type === 's' ? '✅' : '⚠️'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="pg-hd fu" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Loan Applications Inbox</h1>
            {unreadNewCount > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', fontSize: '12px', fontWeight: 900, padding: '2px 10px', borderRadius: '20px' }}>
                {unreadNewCount} NEW
              </span>
            )}
          </div>
          <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Review preliminary submissions received via your unique applicant request link</p>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search applicant or reference..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="fi2"
            style={{ width: '100%', paddingLeft: '36px', height: '40px', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', overflowX: 'auto' }}>
        {[
          { id: 'all', lbl: `All Requests (${requests.length})` },
          { id: 'NEW', lbl: `New (${requests.filter(r => r.normalizedStatus === 'NEW').length})` },
          { id: 'REVIEWED', lbl: `Reviewed (${requests.filter(r => r.normalizedStatus === 'REVIEWED').length})` },
          { id: 'SUBMITTED', lbl: `Submitted (${requests.filter(r => r.normalizedStatus === 'SUBMITTED').length})` },
          { id: 'DISMISSED', lbl: `Dismissed (${requests.filter(r => r.normalizedStatus === 'DISMISSED').length})` }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveFilter(t.id as any)}
            style={{
              padding: '12px 18px',
              fontWeight: 800,
              fontSize: '13.5px',
              border: 'none',
              background: 'none',
              borderBottom: activeFilter === t.id ? '3px solid var(--teal)' : '3px solid transparent',
              color: activeFilter === t.id ? 'var(--teal)' : '#64748b',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {t.lbl}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--teal)' }}>
          <div className="spinner">Loading Inbox Submissions...</div>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
          <Inbox size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: 'var(--teal)' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>Inbox is Empty</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>No loan requests match the selected filter criteria.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {filteredRequests.map((r) => {
            const isNew = r.normalizedStatus === 'NEW';
            const amt = r.loan_amount_requested || r.approximate_amount || 0;
            const name = r.applicant_name || r.requester_name || 'Applicant';
            const purpose = r.loan_purpose_category || r.reason || 'General';

            return (
              <div
                key={r.id}
                onClick={() => handleOpenDetail(r)}
                className="card"
                style={{
                  background: '#fff',
                  borderRadius: '20px',
                  border: isNew ? '2px solid var(--teal)' : '1.5px solid #e2e8f0',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  boxShadow: isNew ? '0 10px 25px -5px rgba(13,115,119,0.1)' : 'none'
                }}
              >
                {isNew && (
                  <span style={{ position: 'absolute', top: '16px', right: '16px', background: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: 900, padding: '2px 8px', borderRadius: '20px' }}>
                    NEW
                  </span>
                )}

                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                  {purpose}
                </div>

                <div style={{ fontSize: '17px', fontWeight: 900, color: '#0f172a', marginBottom: '4px' }}>
                  {name}
                </div>

                <div style={{ fontSize: '20px', fontWeight: 950, color: 'var(--teal)', margin: '8px 0' }}>
                  ₹{Number(amt).toLocaleString()}
                </div>

                <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                  <span>Submitted: {new Date(r.created_at).toLocaleDateString()}</span>
                  <span className={`bdg ${
                    r.normalizedStatus === 'SUBMITTED' ? 'bdg-g' :
                    r.normalizedStatus === 'REVIEWED' ? 'bdg-a' :
                    r.normalizedStatus === 'DISMISSED' ? 'bdg-r' : 'bdg-a'
                  }`} style={{ fontSize: '10px' }}>
                    {r.normalizedStatus}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FULL APPLICATION DETAIL MODAL */}
      {selectedRequest && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal" style={{ maxWidth: '680px', width: '92%', borderRadius: '24px', padding: '28px', background: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase' }}>
                  Reference: REF-{(selectedRequest.id || '').slice(0, 8).toUpperCase()}
                </div>
                <h2 style={{ fontSize: '22px', fontWeight: 950, color: '#0f172a', margin: '4px 0 0 0' }}>
                  {selectedRequest.applicant_name || selectedRequest.requester_name}
                </h2>
              </div>
              <button onClick={() => setSelectedRequest(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
            </div>

            {/* Application Data Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Section A: Applicant Personal Information */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Personal Information</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                  <div><b>Phone:</b> <a href={`tel:${selectedRequest.applicant_phone || selectedRequest.requester_phone}`} style={{ color: 'var(--teal)', fontWeight: 800 }}>{selectedRequest.applicant_phone || selectedRequest.requester_phone}</a></div>
                  <div><b>WhatsApp:</b> {selectedRequest.applicant_whatsapp || 'Same as phone'}</div>
                  <div><b>Date of Birth:</b> {selectedRequest.applicant_dob ? new Date(selectedRequest.applicant_dob).toLocaleDateString() : 'N/A'}</div>
                  <div><b>Gender:</b> {selectedRequest.applicant_gender || 'N/A'}</div>
                  <div><b>Aadhaar (Last 4):</b> <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>XXXX-{selectedRequest.applicant_aadhaar_last4 || 'XXXX'}</span></div>
                  <div><b>Monthly Income:</b> ₹{Number(selectedRequest.monthly_income || 0).toLocaleString()} ({selectedRequest.income_source || 'N/A'})</div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <b>Address:</b> {selectedRequest.applicant_address_house ? `${selectedRequest.applicant_address_house}, ${selectedRequest.applicant_address_street}, ${selectedRequest.applicant_address_city} - ${selectedRequest.applicant_address_pin}` : selectedRequest.requester_address}
                  </div>
                </div>
              </div>

              {/* Section B: Loan Details */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loan Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                  <div><b>Requested Amount:</b> <span style={{ color: 'var(--teal)', fontWeight: 900 }}>₹{Number(selectedRequest.loan_amount_requested || selectedRequest.approximate_amount || 0).toLocaleString()}</span></div>
                  <div><b>Repayment Period:</b> {selectedRequest.repayment_period_months || 12} Months</div>
                  <div><b>Purpose Category:</b> {selectedRequest.loan_purpose_category || 'General'}</div>
                  <div><b>Existing Debts:</b> {selectedRequest.existing_debts ? 'Yes' : 'No'} {selectedRequest.existing_debts_detail ? `(${selectedRequest.existing_debts_detail})` : ''}</div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <b>Detailed Purpose:</b>
                    <p style={{ margin: '4px 0 0 0', color: '#334155', lineHeight: 1.5 }}>{selectedRequest.loan_purpose_detail || selectedRequest.reason}</p>
                  </div>
                </div>
              </div>

              {/* Status & Previous Actions */}
              {selectedRequest.normalizedStatus === 'SUBMITTED' && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px', borderRadius: '14px', color: '#166534', fontSize: '13px' }}>
                  <b>Formally Submitted to Admin</b><br />
                  Member Notes: {selectedRequest.member_notes || 'N/A'}<br />
                  Relationship: {selectedRequest.member_relationship || 'N/A'}
                </div>
              )}

              {selectedRequest.normalizedStatus === 'DISMISSED' && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '14px', borderRadius: '14px', color: '#991b1b', fontSize: '13px' }}>
                  <b>Dismissed</b><br />
                  Reason: {selectedRequest.dismissal_reason || 'N/A'}
                </div>
              )}

              {/* Action Bar */}
              {selectedRequest.normalizedStatus !== 'SUBMITTED' && selectedRequest.normalizedStatus !== 'DISMISSED' && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                  <button
                    onClick={() => setShowDismissModal(true)}
                    className="bsm r"
                    style={{ flex: 1, padding: '12px', borderRadius: '14px', fontWeight: 800 }}
                  >
                    Dismiss Request
                  </button>
                  <button
                    onClick={() => setShowSubmitModal(true)}
                    className="bsm s"
                    style={{ flex: 2, padding: '12px', borderRadius: '14px', fontWeight: 900, background: '#0f172a' }}
                  >
                    Submit to Admin Review Panel →
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* SUBMIT TO ADMIN PRE-SUBMISSION FORM MODAL */}
      {showSubmitModal && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, background: 'rgba(15, 23, 42, 0.5)' }}>
          <div className="modal" style={{ maxWidth: '520px', width: '92%', borderRadius: '24px', padding: '28px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0 }}>Formally Submit Loan to Admin</h3>
              <button onClick={() => setShowSubmitModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleFormalSubmitToAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Member's Assessment Notes * (Min 20 chars)</label>
                <textarea
                  placeholder="Provide your personal assessment of the applicant's request and credibility..."
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Recommended Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="Same as requested"
                    value={recommendedAmount}
                    onChange={(e) => setRecommendedAmount(e.target.value)}
                    className="fi2"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Relationship</label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="sel2"
                    style={{ width: '100%', height: '42px' }}
                  >
                    <option value="Family">Family Member</option>
                    <option value="Neighbour">Neighbour</option>
                    <option value="Community member">Community Member</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowSubmitModal(false)} style={{ flex: 1, padding: '12px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={submittingAdmin || memberNotes.trim().length < 20} className="bsm s" style={{ flex: 2, padding: '12px', borderRadius: '12px', fontWeight: 900, background: '#0f172a' }}>
                  {submittingAdmin ? 'Submitting...' : 'Confirm Submission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DISMISS MODAL */}
      {showDismissModal && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, background: 'rgba(15, 23, 42, 0.5)' }}>
          <div className="modal" style={{ maxWidth: '460px', width: '92%', borderRadius: '24px', padding: '28px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#ef4444', margin: 0 }}>Dismiss Loan Request</h3>
              <button onClick={() => setShowDismissModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleDismiss} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Reason for Dismissal *</label>
                <textarea
                  placeholder="Explain why this preliminary application is being dismissed..."
                  value={dismissReason}
                  onChange={(e) => setDismissReason(e.target.value)}
                  className="ta2"
                  rows={3}
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowDismissModal(false)} style={{ flex: 1, padding: '12px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={dismissing || !dismissReason.trim()} className="bsm r" style={{ flex: 1, padding: '12px', borderRadius: '12px', fontWeight: 900 }}>
                  {dismissing ? 'Dismissing...' : 'Confirm Dismissal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
