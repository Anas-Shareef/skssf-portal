import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Inbox, Eye, ArrowRight, XCircle, CheckCircle2, Clock, Search, AlertCircle, FileText, UserCheck, Pencil, History as HistoryIcon, Save } from 'lucide-react';
import { getAccessToken } from '../../lib/authSession';

const formatDateOnly = (value: any) => {
  if (!value) return 'Not provided';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
};

const historyValue = (value: any) => {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

const getWitnesses = (request: any) => {
  if (Array.isArray(request?.witnesses) && request.witnesses.length) {
    return request.witnesses.map((witness: any, index: number) => ({
      ...witness,
      status: witness.status || request[`witness${index + 1}_status`] || null,
      verified_at: witness.verified_at || request[`witness${index + 1}_verified_at`] || null
    }));
  }
  return [1, 2].map(index => ({
    name: request?.[`witness${index}_name`] || '',
    phone: request?.[`witness${index}_phone`] || '',
    member_no: request?.[`witness${index}_member_no`] || '',
    status: request?.[`witness${index}_status`] || null,
    verified_at: request?.[`witness${index}_verified_at`] || null
  })).filter(witness => witness.name || witness.phone || witness.member_no);
};

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
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [editVersion, setEditVersion] = useState(1);
  const [editReason, setEditReason] = useState('');
  const [historyVersions, setHistoryVersions] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const applicationReference = (request: any) => {
    const match = String(request?.reason || '').match(/Application Reference:\s*([^\n]+)/i);
    return match?.[1]?.trim() || `REF-${String(request?.id || '').slice(0, 8).toUpperCase()}`;
  };

  async function loadInbox() {
    if (!profile) return;
    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      const res = await fetch('/api/get-member-inbox', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const apiRes = await res.json().catch(() => ({}));
      if (!res.ok || !apiRes.success) {
        throw new Error(apiRes.error || 'Unable to load the member inbox.');
      }
      const dataList: any[] = Array.isArray(apiRes.data)
        ? apiRes.data
        : (Array.isArray(apiRes.requests) ? apiRes.requests : []);

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
      showToast('e', err instanceof Error ? err.message : 'Unable to load the member inbox.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInbox();
  }, [profile]);

  const loadHistory = async (requestId: string) => {
    setHistoryLoading(true);
    setHistoryUnavailable(false);
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/get-member-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId, action: 'history' })
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 503) {
        setHistoryUnavailable(true);
        setHistoryVersions([]);
        return;
      }
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load application history.');
      setHistoryVersions(result.versions || []);
      setEditVersion(Number(result.request?.application_version || 1));
    } catch (err) {
      console.warn('Application history unavailable:', err);
      setHistoryVersions([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenDetail = async (req: any) => {
    setSelectedRequest(req);
    setEditMode(false);
    setRecommendedAmount(String(req.loan_amount_requested || req.approximate_amount || ''));
    setMemberNotes('');
    setEditForm({
      applicant_name: req.applicant_name || req.requester_name || '',
      applicant_phone: req.applicant_phone || req.requester_phone || '',
      applicant_whatsapp: req.applicant_whatsapp || '',
      applicant_dob: req.applicant_dob || '',
      applicant_gender: req.applicant_gender || '',
      requester_address: req.requester_address || '',
      applicant_address_house: req.applicant_address_house || '',
      applicant_address_street: req.applicant_address_street || '',
      applicant_address_city: req.applicant_address_city || '',
      applicant_address_pin: req.applicant_address_pin || '',
      applicant_father_name: req.applicant_father_name || '',
      applicant_occupation: req.applicant_occupation || '',
      applicant_employer_name: req.applicant_employer_name || '',
      loan_amount_requested: req.loan_amount_requested || req.approximate_amount || '',
      loan_purpose_category: req.loan_purpose_category || '',
      repayment_period_months: req.repayment_period_months || 12,
      monthly_income: req.monthly_income ?? '',
      income_source: req.income_source || '',
      existing_debts: !!req.existing_debts,
      existing_debts_detail: req.existing_debts_detail || '',
      loan_purpose_detail: req.loan_purpose_detail || '',
      witnesses: getWitnesses(req).length >= 2 ? getWitnesses(req) : [
        { name: req.witness1_name || '', phone: req.witness1_phone || '', member_no: req.witness1_member_no || '' },
        { name: req.witness2_name || '', phone: req.witness2_phone || '', member_no: req.witness2_member_no || '' }
      ]
    });
    setEditVersion(Number(req.application_version || 1));
    setEditReason('');
    void loadHistory(req.id);
  };

  const handleBeginEdit = () => {
    if (!selectedRequest || selectedRequest.normalizedStatus !== 'NEW') return;
    setEditMode(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    setActioning(true);
    try {
      const token = await getAccessToken();
      const addressParts = [
        editForm.applicant_address_house,
        editForm.applicant_address_street,
        editForm.applicant_address_city,
        editForm.applicant_address_pin
      ].map((part: any) => String(part || '').trim()).filter(Boolean);
      const changes = { ...editForm };
      if (addressParts.length >= 2) changes.requester_address = addressParts.join(', ');
      const response = await fetch('/api/get-member-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: selectedRequest.id, action: 'edit', expectedVersion: editVersion, changes, editReason })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save application changes.');
      const edit = result.edit || {};
      setSelectedRequest((current: any) => ({ ...current, ...changes, application_version: edit.application_version, last_edited_at: edit.last_edited_at }));
      setEditVersion(Number(edit.application_version || editVersion + 1));
      setEditMode(false);
      setEditReason('');
      await Promise.all([loadInbox(), loadHistory(selectedRequest.id)]);
      showToast('s', 'Application changes saved successfully.');
    } catch (err: any) {
      showToast('e', err.message || 'Unable to save application changes.');
    } finally {
      setActioning(false);
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
       const applicantName = selectedRequest.applicant_name || selectedRequest.requester_name || selectedRequest.name || 'Applicant';
      const applicantPhone = selectedRequest.applicant_phone || selectedRequest.requester_phone || selectedRequest.phone || '';
      const applicantAddress = selectedRequest.requester_address || selectedRequest.applicant_address_house || '';
      const rawPurpose = selectedRequest.loan_purpose_detail || selectedRequest.reason || selectedRequest.purpose || 'Loan Request';
      const months = selectedRequest.repayment_period_months || 12;

       const token = await getAccessToken();
       const apiRes = await fetch('/api/submit-loan-application', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
             submitted_by_member_id: profile?.db_id || profile?.id
           })
         });
       if (!apiRes.ok) throw new Error((await apiRes.json()).error || 'Submission to admin failed.');
       const apiData = await apiRes.json();
       if (!apiData.success) throw new Error('Submission to admin failed.');

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
       const token = await getAccessToken();
       const response = await fetch('/api/get-member-inbox', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
         body: JSON.stringify({ requestId: selectedRequest.id, action: 'dismiss', dismissalReason: dismissalReason.trim() })
       });
       if (!response.ok) throw new Error((await response.json()).error || 'Dismissal update failed.');

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
                         {applicationReference(req)} • {dateStr}
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
                    Reference: {applicationReference(selectedRequest)} {Number(selectedRequest.application_version || 1) > 1 && <span className="bdg bdg-a" style={{ marginLeft: '6px' }}>EDITED</span>}
                  </div>
              </div>
              <button onClick={() => setSelectedRequest(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><XCircle size={24} /></button>
            </div>

            {editMode ? (
              <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                <div style={{ padding: '14px', borderRadius: '14px', background: '#fffbeb', border: '1px solid #fde68a', fontSize: '12px', color: '#92400e' }}>
                  Editing version {editVersion}. Reference number, ownership, approval decisions, and repayment data are locked.
                </div>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Section A — Personal Details</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <input className="fi2" placeholder="Applicant name" value={editForm.applicant_name || ''} onChange={e => setEditForm((v: any) => ({ ...v, applicant_name: e.target.value }))} />
                    <input className="fi2" placeholder="Father's name" value={editForm.applicant_father_name || ''} onChange={e => setEditForm((v: any) => ({ ...v, applicant_father_name: e.target.value }))} />
                    <input className="fi2" placeholder="Phone" value={editForm.applicant_phone || ''} onChange={e => setEditForm((v: any) => ({ ...v, applicant_phone: e.target.value }))} />
                    <input className="fi2" placeholder="WhatsApp" value={editForm.applicant_whatsapp || ''} onChange={e => setEditForm((v: any) => ({ ...v, applicant_whatsapp: e.target.value }))} />
                    <input className="fi2" type="date" value={editForm.applicant_dob || ''} onChange={e => setEditForm((v: any) => ({ ...v, applicant_dob: e.target.value }))} />
                    <input className="fi2" placeholder="Gender" value={editForm.applicant_gender || ''} onChange={e => setEditForm((v: any) => ({ ...v, applicant_gender: e.target.value }))} />
                    <textarea className="ta2" placeholder="Address" value={editForm.requester_address || ''} onChange={e => setEditForm((v: any) => ({ ...v, requester_address: e.target.value }))} style={{ gridColumn: '1 / -1' }} rows={2} />
                    <input className="fi2" placeholder="House name / number" value={editForm.applicant_address_house || ''} onChange={e => setEditForm((v: any) => ({ ...v, applicant_address_house: e.target.value }))} />
                    <input className="fi2" placeholder="Place / area" value={editForm.applicant_address_street || ''} onChange={e => setEditForm((v: any) => ({ ...v, applicant_address_street: e.target.value }))} />
                    <input className="fi2" placeholder="District / city" value={editForm.applicant_address_city || ''} onChange={e => setEditForm((v: any) => ({ ...v, applicant_address_city: e.target.value }))} />
                    <input className="fi2" placeholder="PIN code" value={editForm.applicant_address_pin || ''} onChange={e => setEditForm((v: any) => ({ ...v, applicant_address_pin: e.target.value }))} />
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Section B — Employment & Loan Specifications</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <input className="fi2" placeholder="Occupation" value={editForm.applicant_occupation || ''} onChange={e => setEditForm((v: any) => ({ ...v, applicant_occupation: e.target.value }))} />
                    <input className="fi2" placeholder="Employer" value={editForm.applicant_employer_name || ''} onChange={e => setEditForm((v: any) => ({ ...v, applicant_employer_name: e.target.value }))} />
                    <input className="fi2" type="number" min="1" placeholder="Requested amount" value={editForm.loan_amount_requested ?? ''} onChange={e => setEditForm((v: any) => ({ ...v, loan_amount_requested: e.target.value }))} />
                    <input className="fi2" type="number" min="1" placeholder="Repayment months" value={editForm.repayment_period_months ?? ''} onChange={e => setEditForm((v: any) => ({ ...v, repayment_period_months: e.target.value }))} />
                    <input className="fi2" type="number" min="0" placeholder="Monthly income" value={editForm.monthly_income ?? ''} onChange={e => setEditForm((v: any) => ({ ...v, monthly_income: e.target.value }))} />
                    <input className="fi2" placeholder="Income source" value={editForm.income_source || ''} onChange={e => setEditForm((v: any) => ({ ...v, income_source: e.target.value }))} />
                    <input className="fi2" placeholder="Purpose category" value={editForm.loan_purpose_category || ''} onChange={e => setEditForm((v: any) => ({ ...v, loan_purpose_category: e.target.value }))} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, gridColumn: '1 / -1' }}><input type="checkbox" checked={!!editForm.existing_debts} onChange={e => setEditForm((v: any) => ({ ...v, existing_debts: e.target.checked }))} /> Existing debts</label>
                    {editForm.existing_debts && <textarea className="ta2" placeholder="Existing debt details" value={editForm.existing_debts_detail || ''} onChange={e => setEditForm((v: any) => ({ ...v, existing_debts_detail: e.target.value }))} style={{ gridColumn: '1 / -1' }} rows={2} />}
                    <textarea className="ta2" placeholder="Purpose details" value={editForm.loan_purpose_detail || ''} onChange={e => setEditForm((v: any) => ({ ...v, loan_purpose_detail: e.target.value }))} style={{ gridColumn: '1 / -1' }} rows={3} />
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Section C — Witness Verifications</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(editForm.witnesses || []).map((witness: any, index: number) => (
                      <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                        <input className="fi2" placeholder={`Witness ${index + 1} name`} value={witness.name || ''} onChange={e => setEditForm((v: any) => ({ ...v, witnesses: v.witnesses.map((w: any, i: number) => i === index ? { ...w, name: e.target.value } : w) }))} />
                        <input className="fi2" placeholder="Phone" value={witness.phone || ''} onChange={e => setEditForm((v: any) => ({ ...v, witnesses: v.witnesses.map((w: any, i: number) => i === index ? { ...w, phone: e.target.value } : w) }))} />
                        <input className="fi2" placeholder="Member number" value={witness.member_no || ''} onChange={e => setEditForm((v: any) => ({ ...v, witnesses: v.witnesses.map((w: any, i: number) => i === index ? { ...w, member_no: e.target.value } : w) }))} />
                        {index >= 2 && <button type="button" className="bsm r" style={{ padding: '7px 9px' }} onClick={() => setEditForm((v: any) => ({ ...v, witnesses: v.witnesses.filter((_: any, i: number) => i !== index) }))}>✕</button>}
                      </div>
                    ))}
                    <button type="button" className="bsm g" style={{ alignSelf: 'flex-start', padding: '7px 10px', fontSize: '11px' }} onClick={() => setEditForm((v: any) => ({ ...v, witnesses: [...(v.witnesses || []), { name: '', phone: '', member_no: '' }] }))}>+ Add witness</button>
                  </div>
                </div>
                <input className="fi2" placeholder="Edit reason (optional)" value={editReason} onChange={e => setEditReason(e.target.value)} maxLength={500} />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="bsm g" style={{ flex: 1, padding: '12px' }} onClick={() => setEditMode(false)}>Cancel</button>
                  <button type="submit" className="bsm s" style={{ flex: 2, padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }} disabled={actioning}><Save size={16} /> {actioning ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </form>
            ) : (
            <>
            {/* Applicant Detail Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Section A — Personal Details</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                  {selectedRequest.applicant_father_name && <div><b>Father's Name:</b> {selectedRequest.applicant_father_name}</div>}
                  <div><b>Phone:</b> {selectedRequest.applicant_phone || selectedRequest.requester_phone || '—'}</div>
                  {selectedRequest.applicant_whatsapp && <div><b>WhatsApp:</b> {selectedRequest.applicant_whatsapp}</div>}
                  <div><b>Date of Birth:</b> {formatDateOnly(selectedRequest.applicant_dob)}</div>
                  <div><b>Gender:</b> {selectedRequest.applicant_gender || 'Not provided'}</div>
                  <div style={{ gridColumn: '1 / -1' }}><b>Address:</b> {selectedRequest.requester_address || 'Not provided'}</div>
                  {(selectedRequest.applicant_address_house || selectedRequest.applicant_address_street || selectedRequest.applicant_address_city || selectedRequest.applicant_address_pin) && <div style={{ gridColumn: '1 / -1', color: '#64748b' }}><b>Address fields:</b> {[selectedRequest.applicant_address_house, selectedRequest.applicant_address_street, selectedRequest.applicant_address_city, selectedRequest.applicant_address_pin].filter(Boolean).join(', ')}</div>}
                  </div>
                </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Section B — Loan Specifications</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                  <div><b>Requested Amount:</b> <span style={{ color: 'var(--teal)', fontWeight: 900 }}>₹{Number(selectedRequest.loan_amount_requested || selectedRequest.approximate_amount || 0).toLocaleString()}</span></div>
                  <div><b>Repayment Period:</b> {selectedRequest.repayment_period_months || 12} Months</div>
                  {selectedRequest.applicant_occupation && <div><b>Occupation:</b> {selectedRequest.applicant_occupation}</div>}
                  {selectedRequest.applicant_employer_name && <div><b>Employer:</b> {selectedRequest.applicant_employer_name}</div>}
                  <div><b>Monthly Income:</b> {selectedRequest.monthly_income ? `₹${Number(selectedRequest.monthly_income).toLocaleString()}` : 'Not provided'}</div>
                  {selectedRequest.income_source && <div><b>Income Source:</b> {selectedRequest.income_source}</div>}
                  <div><b>Existing Debts:</b> {selectedRequest.existing_debts ? `Yes — ${selectedRequest.existing_debts_detail || ''}` : 'No'}</div>
                  {selectedRequest.loan_purpose_category && <div><b>Purpose Category:</b> {selectedRequest.loan_purpose_category}</div>}
                  <div style={{ gridColumn: '1 / -1' }}><b>Purpose Details:</b> {selectedRequest.loan_purpose_detail || selectedRequest.reason || '—'}</div>
                  </div>
              </div>

                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Section C — Witness Verifications</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {getWitnesses(selectedRequest).map((witness: any, index: number) => {
                    const idx = index + 1;
                    const wName = witness.name;
                    const wPhone = witness.phone;
                    const wStatus = witness.status;

                    const cleanPhone = (wPhone || '').replace(/\D/g, '');
                    const token = `WV-${selectedRequest.id || 'PYD'}-${idx}`;
                    const verifyLink = `https://skssf-portal.vercel.app/witness-verify/${token}`;
                    const msgText = `Assalamu Alaikum ${wName || 'Witness'},\n\n${selectedRequest.applicant_name || selectedRequest.requester_name || 'Applicant'} has listed you as a Witness for an Interest-Free Loan (₹${Number(selectedRequest.loan_amount_requested || selectedRequest.approximate_amount || 30000).toLocaleString()}) at SKSSF Poyanad Branch.\n\nPlease click to confirm: ${verifyLink}`;
                    const waUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msgText)}`;

                    return (
                      <div key={idx} style={{ background: '#fff', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
                              Witness {idx}: {wName || '—'} {wPhone && <span style={{ color: '#64748b', fontWeight: 600 }}>({wPhone})</span>} {witness.member_no && <span style={{ color: '#64748b', fontWeight: 600 }}>· Member {witness.member_no}</span>}
                          </div>
                          <div style={{ marginTop: '2px' }}>
                            {wStatus === 'VERIFIED' ? (
                              <span style={{ fontSize: '10px', fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>🟢 Verified ✓</span>
                            ) : (
                              <span style={{ fontSize: '10px', fontWeight: 800, color: '#b45309', background: '#fef3c7', padding: '2px 6px', borderRadius: '4px' }}>⏳ Pending</span>
                            )}
                          </div>
                        </div>
                        {wPhone && (
                          <a href={waUrl} target="_blank" rel="noreferrer" className="bsm s" style={{ padding: '4px 10px', fontSize: '11px', background: '#25D366', borderColor: '#25D366', color: '#fff', fontWeight: 800 }}>
                            📲 WhatsApp Link
                          </a>
                        )}
                      </div>
                    );
                  })}
                  {getWitnesses(selectedRequest).length === 0 && <div style={{ fontSize: '12px', color: '#92400e' }}>No witness information was saved for this application.</div>}
                  </div>
                </div>
            </div>
            </>
            )}

            {!editMode && (
              <div style={{ marginBottom: '20px', padding: '14px', borderRadius: '16px', background: '#fff', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '6px' }}><HistoryIcon size={16} /> Application History {historyVersions.length > 1 && <span className="bdg bdg-a">EDITED</span>}</div>
                  {selectedRequest.last_edited_at && <span style={{ fontSize: '10px', color: '#64748b' }}>Last edited {new Date(selectedRequest.last_edited_at).toLocaleString()}</span>}
                  {selectedRequest.normalizedStatus === 'NEW' && <button className="bsm o" style={{ fontSize: '11px', padding: '6px 10px' }} onClick={handleBeginEdit}><Pencil size={13} /> Edit Application</button>}
                </div>
                {historyLoading ? <div style={{ fontSize: '12px', color: '#64748b' }}>Loading history…</div> : historyUnavailable ? <div style={{ fontSize: '12px', color: '#92400e' }}>History migration is pending. Editing will be available after the database migration is applied.</div> : historyVersions.length === 0 ? <div style={{ fontSize: '12px', color: '#64748b' }}>Version 1 — Original submission. No edits recorded.</div> : historyVersions.map((version: any) => (
                  <div key={version.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '9px', marginTop: '9px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800 }}>Version {version.application_version} — {version.editor_role === 'applicant' ? 'Original Submission' : 'Edited by Member'}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>{version.editor?.name || version.edited_by || 'Applicant'} · {new Date(version.created_at).toLocaleString()}</div>
                    {version.changed_fields?.length > 0 && <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>{version.changed_fields.map((change: any) => <div key={change.field} style={{ fontSize: '11px', color: '#475569' }}><b>{change.field}</b>: {historyValue(change.previous_value)} → {historyValue(change.new_value)}</div>)}</div>}
                    {version.edit_reason && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Reason: {version.edit_reason}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Modal Actions */}
            {!editMode && selectedRequest.normalizedStatus !== 'SUBMITTED' && selectedRequest.normalizedStatus !== 'DISMISSED' ? (
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
