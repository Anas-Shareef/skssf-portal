import React, { useState, useRef } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { localDb, syncFromBackend } from '../../lib/localDb';
import { supabase } from '../../lib/supabaseClient';
import { authenticatedFetch } from '../../lib/authSession';
import ConfirmDialog from '../../components/ConfirmDialog';
import { History as HistoryIcon, Plus } from 'lucide-react';
import LoanReviewDrawer from '../../components/LoanReviewDrawer';



export function parseLoanPurpose(purposeStr: string, rawLoan?: any) {
  const p = purposeStr || '';
  if (!p.includes('Category:') && !p.includes('Referred By:')) {
    return {
      referredBy: rawLoan?.submitted_by_member_name || rawLoan?.referred_member_name || '',
      category: rawLoan?.loan_purpose_category || p || 'General Support',
      details: rawLoan?.loan_purpose_detail || rawLoan?.purpDesc || rawLoan?.member_notes || rawLoan?.purpose_desc || '',
      period: rawLoan?.months ? `${rawLoan.months} Months` : (rawLoan?.repayment_period_months ? `${rawLoan.repayment_period_months} Months` : ''),
      income: rawLoan?.income || '',
      debts: rawLoan?.debts || '',
      aadhaar: rawLoan?.aadhaar || '',
      dob: rawLoan?.dob || '',
      isParsed: false
    };
  }

  const refMatch = p.match(/Referred By:\s*([^Category|Details|Period|Income|Debts|Aadhaar|DOB]+)/i);
  const catMatch = p.match(/Category:\s*([^Details|Period|Income|Debts|Aadhaar|DOB]+)/i);
  const detMatch = p.match(/Details:\s*([^Period|Income|Debts|Aadhaar|DOB]+)/i);
  const perMatch = p.match(/Period:\s*([^Income|Debts|Aadhaar|DOB]+)/i);
  const incMatch = p.match(/Income:\s*([^Debts|Aadhaar|DOB]+)/i);
  const dbtMatch = p.match(/Debts:\s*([^Aadhaar|DOB]+)/i);
  const aadhMatch = p.match(/Aadhaar Last 4:\s*([^DOB]+)/i);
  const dobMatch = p.match(/DOB:\s*(.+)/i);

  const referredBy = refMatch ? refMatch[1].trim() : (rawLoan?.submitted_by_member_name || '');
  const category = catMatch ? catMatch[1].trim() : (rawLoan?.loan_purpose_category || 'General Support');
  const details = detMatch ? detMatch[1].trim() : (rawLoan?.loan_purpose_detail || rawLoan?.purpDesc || rawLoan?.member_notes || rawLoan?.purpose_desc || '');
  const period = perMatch ? perMatch[1].trim() : (rawLoan?.months ? `${rawLoan.months} Months` : '');
  const income = incMatch ? incMatch[1].trim() : '';
  const debts = dbtMatch ? dbtMatch[1].trim() : '';
  const aadhaar = aadhMatch ? aadhMatch[1].trim() : '';
  const dob = dobMatch ? dobMatch[1].trim() : '';

  return {
    referredBy,
    category,
    details,
    period,
    income,
    debts,
    aadhaar,
    dob,
    isParsed: true
  };
}

const formatDateOnly = (value: any) => {
  if (!value) return 'Not provided';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
};

const historyValue = (value: any) => {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

const getLoanWitnesses = (loan: any) => {
  if (Array.isArray(loan?.witnesses) && loan.witnesses.length) return loan.witnesses.map((witness: any, index: number) => ({
    ...witness,
    status: witness.status || loan[`witness${index + 1}_status`] || null,
    verified_at: witness.verified_at || loan[`witness${index + 1}_verified_at`] || null
  }));
  return [1, 2].map(index => ({
    name: loan?.[`witness${index}_name`] || '',
    phone: loan?.[`witness${index}_phone`] || '',
    member_no: loan?.[`witness${index}_member_no`] || '',
    status: loan?.[`witness${index}_status`] || null,
    verified_at: loan?.[`witness${index}_verified_at`] || null
  })).filter(witness => witness.name || witness.phone || witness.member_no);
};

export default function LoanManagement() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isMember = profile?.role === 'member';

  const [loans, setLoans] = useState<any[]>(() => localDb.getLoans());
  
  React.useEffect(() => {
    // Initial sync on mount
    syncFromBackend();

    const handleUpdate = () => {
      setLoans(localDb.getLoans());
    };
    window.addEventListener('appDataUpdated', handleUpdate);
    return () => window.removeEventListener('appDataUpdated', handleUpdate);
  }, []);
  const [showReview, setShowReview] = useState(false);
  const [applicationHistory, setApplicationHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [witnessLinkBusy, setWitnessLinkBusy] = useState<number | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState('pending');
  const [actionNote, setActionNote] = useState('');
  const [confirmSave, setConfirmSave] = useState(false);
  const [editingLoan, setEditingLoan] = useState<any | null>(null);
  const [toast, setToast] = useState<{ m: string; t: 's' | 'r' } | null>(null);
  
  // Disbursement states
  const [disburseModalLoan, setDisburseModalLoan] = useState<any | null>(null);
  const [disbDate, setDisbDate] = useState(new Date().toISOString().split('T')[0]);
  const [disbTenure, setDisbTenure] = useState('12');
  const [disbFreq, setDisbFreq] = useState('monthly');
  
  // Edit form refs
  const editAmtRef = useRef<HTMLInputElement>(null);
  const editPurpRef = useRef<HTMLSelectElement>(null);
  const editDescRef = useRef<HTMLTextAreaElement>(null);
  const editMonthsRef = useRef<HTMLInputElement>(null);

  // Search / filter
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [fStatus, setFStatus] = useState('');
  const [fPurpose, setFPurpose] = useState('');
  const [fBranch, setFBranch] = useState('');
  const [reviewerSearch, setReviewerSearch] = useState('');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Confirm dialogs
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; loan?: any; bulk?: boolean } | null>(null);
  const [confirmExport, setConfirmExport] = useState(false);
  const allAdmins = localDb.getUsers().filter((u: any) => u.role === 'admin');
  const config = localDb.getPortalConfig();

  const refreshLoans = () => setLoans(localDb.getLoans());

  const loadApplicationHistory = async (loan: any) => {
    if (!loan?.source_request_id) {
      setApplicationHistory([]);
      setHistoryOpen(true);
      return;
    }
    setHistoryLoading(true);
    try {
      const response = await authenticatedFetch('/api/get-member-inbox', {
        method: 'POST',
        body: JSON.stringify({ requestId: loan.source_request_id, action: 'history' })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load application history.');
      setApplicationHistory(result.versions || []);
      setHistoryOpen(true);
    } catch (err: any) {
      setToast({ m: err.message || 'Unable to load application history.', t: 'r' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setHistoryLoading(false);
    }
  };
  
  const sendWitnessVerificationLink = async (loan: any, witness: any, index: number) => {
    if (!loan?.id) return;
    const digits = String(witness?.phone || '').replace(/\D/g, '');
    if (digits.length !== 10) {
      setToast({ m: 'This witness does not have a valid 10-digit mobile number.', t: 'r' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setWitnessLinkBusy(index);
    try {
      const response = await authenticatedFetch('/api/get-member-inbox', {
        method: 'POST',
        body: JSON.stringify({ loanId: loan.id, action: 'witness_link', witnessIndex: index })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.link?.url) throw new Error(result.error || 'Unable to issue a witness verification link.');

      const applicant = loan.applicant_name || loan.name || loan.requester_name || 'Applicant';
      const reference = loan.application_reference || loan.loan_no || 'this application';
      const message = [
        `Assalamu Alaikum ${witness?.name || 'Witness'},`,
        '',
        'SKSSF Poyanad Branch (Reg No: 2773) — Interest-Free Loan',
        '',
        `${applicant} has named you as a witness / guarantor for loan application ${reference}.`,
        '',
        'Please open your personal verification link to confirm or decline:',
        result.link.url,
        '',
        'The link can be used once and expires automatically. If you did not expect this message, please ignore it.'
      ].join('\n');

      window.open(`https://wa.me/91${digits}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');

      // Opening WhatsApp only prepares a message in the admin's own app. Record
      // that the link was shared, never that it was delivered or read.
      await authenticatedFetch('/api/get-member-inbox', {
        method: 'POST',
        body: JSON.stringify({ loanId: loan.id, action: 'witness_shared', witnessIndex: index, channel: 'whatsapp' })
      }).catch(() => undefined);

      setToast({ m: 'Witness link prepared in WhatsApp. Delivery is not confirmed by the portal.', t: 's' });
      setTimeout(() => setToast(null), 3500);
    } catch (err: any) {
      setToast({ m: err.message || 'Unable to issue a witness verification link.', t: 'r' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setWitnessLinkBusy(null);
    }
  };

  // Real-time permission check (Global)
  const isGlobalApprover = profile?.role === 'super' || config.authorizedReviewers?.includes(profile?.id || '') || localDb.getUserById(profile?.id || '')?.is_approver;

  // Scope: results are already scoped by the backend API.
  // We just trust the 'loans' array as returned by localDb.
  const scopedLoans = loans;

  // Personal stats for this member
  const myTotal    = scopedLoans.length;
  const myApproved = scopedLoans.filter(l => l.status === 'approved' || l.status === 'completed').length;
  const myRejected = scopedLoans.filter(l => l.status === 'rejected').length;
  const myPending  = scopedLoans.filter(l => l.status === 'pending').length;

  // Admin global stats
  const allPending  = loans.filter(l => l.status === 'pending').length;
  const allApproved = loans.filter(l => l.status === 'approved' || l.status === 'completed').length;
  const allRejected = loans.filter(l => l.status === 'rejected').length;

  const selectedLoan = loans.find(l => l.id === selectedLoanId);
  const assigned = selectedLoan?.assignedReviewers || [];
  const isAssigned = assigned.length === 0 || assigned.includes(profile?.id || '');
  const canSign = profile?.role === 'super' || (isGlobalApprover && isAssigned);

  const selectedMember = selectedLoan ? localDb.getUserById(selectedLoan.memId || selectedLoan.applicant_id) : null;
  const filingHelper = selectedLoan?.submitted_by_member_id ? localDb.getUserById(selectedLoan.submitted_by_member_id) : null;

  const activeFilterCount = [fStatus, fPurpose, fBranch].filter(Boolean).length;
  const clearFilters = () => { setFStatus(''); setFPurpose(''); setFBranch(''); };

  // Multi-filter applied
  const filteredLoans = scopedLoans.filter(l => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (l.id || '').toLowerCase().includes(q) ||
      (l.name || '').toLowerCase().includes(q) ||
      (l.purpose || '').toLowerCase().includes(q) ||
      (l.memNo || '').toLowerCase().includes(q);
    const matchStatus  = !fStatus  || l.status  === fStatus;
    const matchPurpose = !fPurpose || l.purpose === fPurpose;
    const matchBranch  = !fBranch  || l.branch  === fBranch;
    return matchSearch && matchStatus && matchPurpose && matchBranch;
  });

  const allSelected = filteredLoans.length > 0 && filteredLoans.every(l => selectedIds.includes(l.id));
  const toggleAll   = () => setSelectedIds(allSelected ? [] : filteredLoans.map(l => l.id));
  const toggleOne   = (id: string) => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const doSaveAction = () => {
    if (!selectedLoanId || !profile) return;
    const ok = localDb.verifyLoanRequest(
      selectedLoanId, 
      actionStatus, 
      actionNote, 
      profile.name, 
      profile.role, 
      profile.id
    );
    if (ok) {
      refreshLoans();
      setShowReview(false);
      setConfirmSave(false);
      setToast({ m: `Verdict "${actionStatus}" recorded successfully!`, t: 's' });
      setTimeout(() => setToast(null), 3000);
    } else {
      setToast({ m: 'Action failed. Are you an authorized Approver?', t: 'r' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const doDeleteLoan = (id: string) => {
    localDb.deleteLoansBulk([id]);
    refreshLoans();
  };

  const handleUpdateLoan = () => {
    if (!editingLoan) return;
    const isEditingMember = profile?.role === 'member';
    
    const updates: any = {
      amt: parseFloat(editAmtRef.current?.value || '0'),
      purpose: editPurpRef.current?.value || editingLoan.purpose,
      purpDesc: editDescRef.current?.value || editingLoan.purpDesc,
      months: parseInt(editMonthsRef.current?.value || '12'),
    };

    if (isEditingMember) {
      // Member edits reset everything for safety
      updates.status = 'pending';
      updates.approvals = [];
      localDb.updateLoan(editingLoan.id, updates);
      localDb.addAuditLog(editingLoan.id, 'Edited & Resubmitted', profile?.name || 'Member', 'Updated loan details manually. New signatures required.');
    } else {
      // Admin/Superadmin edits are "management actions" and keep existing signatures
      localDb.updateLoan(editingLoan.id, updates);
      localDb.addAuditLog(editingLoan.id, 'Management Edit', profile?.name || 'Admin', `Updated application details: ₹${updates.amt.toLocaleString()} / ${updates.months}mo.`);
    }

    setEditingLoan(null);
    refreshLoans();
    setToast({ m: 'Loan details updated successfully!', t: 's' });
    setTimeout(() => setToast(null), 3000);
  };

  const doBulkDelete = () => {
    localDb.deleteLoansBulk(selectedIds);
    setSelectedIds([]);
    refreshLoans();
  };

  const doExportCSV = () => {
    const rows = [['App No', 'Applicant', 'Amount', 'Purpose', 'Branch', 'Submitted', 'Status']];
    filteredLoans.forEach(l => rows.push([l.id, l.name, `${l.amt}`, l.purpose, l.branch || '', l.submittedDate || '', l.status]));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'loans.csv'; a.click();
  };

  const stBadge = (l: any): ReactElement => {
    const s = l.status;
    const approvals = l.request?.approvals || l.approvals || [];
    const approvedCount = approvals.filter((a: any) => a.status === 'approved').length;
    const threshold = l.request?.threshold || config.repaymentApprovalsNeeded || 1;

    const map: Record<string, ReactElement> = {
      pending:   approvedCount > 0 
        ? <span className="bdg bdg-a" style={{ background: '#eef2ff', color: '#6366f1', border: '1px solid #c7d2fe' }}>⏳ {approvedCount}/{threshold} Signed</span>
        : <span className="bdg bdg-a">Pending</span>,
      approved:  <span className="bdg bdg-g">Approved</span>,
      completed: <span className="bdg bdg-b">Completed</span>,
      rejected:  <span className="bdg bdg-r">Rejected</span>,
    };
    return map[s] || <span className="bdg bdg-gr">Unknown</span>;
  };

  const chipStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    background: 'var(--teal-pale)', border: '1px solid var(--teal-pale2)',
    color: 'var(--teal2)', borderRadius: '20px', padding: '3px 10px',
    fontSize: '12px', fontWeight: 500,
  };
  const chipX: React.CSSProperties = { cursor: 'pointer', fontWeight: 700, marginLeft: '2px', color: 'var(--teal)', fontSize: '14px', lineHeight: 1 };

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', top: 100, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: toast.t === 's' ? '#065f46' : '#991b1b',
          color: '#fff', padding: '12px 24px', borderRadius: 12, fontWeight: 800,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)', fontSize: 13
        }}>
          {toast.t === 's' ? '✅' : '❌'} {toast.m}
        </div>
      )}
      <div className="pg-hd" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="pg-title">💰 Loan Management</div>
          <div className="pg-sub">
            {isMember ? 'Track your loan requests and their status.' : 'Review applications, set status, and view the full audit trail.'}
          </div>
        </div>
        {(profile?.role === 'super' || profile?.role === 'admin') && (
          <div className="pg-acts" style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="bsm s"
              style={{ height: 48, padding: '0 24px', borderRadius: 14, display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800 }}
              onClick={() => {
                const p = profile?.role === 'super' ? '/super-admin/dashboard' : '/admin/dashboard';
                navigate(`${p}/loans/file-new`);
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> File New Application
            </button>
          </div>
        )}
        {isMember && (
          <div className="pg-acts" style={{ marginLeft: 'auto' }}>
            <button className="bsm s" style={{ height: 48, padding: '0 24px', borderRadius: 14 }} onClick={() => {
              navigate('/member/dashboard/apply');
            }}>+ Apply for Loan</button>
          </div>
        )}
      </div>

      {/* ── STATS PIPELINE ── */}
      <div className="pipeline loan-pipeline-grid fu" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div className="ps"><div className="ps-dot" style={{ background: 'var(--blue)' }}></div><div className="ps-n">{isMember ? myTotal : loans.length}</div><div className="ps-l">Total Requests</div></div>
        <div className="ps"><div className="ps-dot" style={{ background: 'var(--amber)' }}></div><div className="ps-n">{isMember ? myPending : allPending}</div><div className="ps-l">Pending</div></div>
        <div className="ps"><div className="ps-dot" style={{ background: 'var(--green)' }}></div><div className="ps-n">{isMember ? myApproved : allApproved}</div><div className="ps-l">Approved</div></div>
        <div className="ps"><div className="ps-dot" style={{ background: 'var(--red)' }}></div><div className="ps-n">{isMember ? myRejected : allRejected}</div><div className="ps-l">Rejected</div></div>
      </div>

      {/* ── LOAN TABLE CARD ── */}
      <div className="card fu">

        {/* CARD HEADER */}
        <div className="card-hd inv-ctrls" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div className="card-title">Loan Pipeline ({filteredLoans.length}/{scopedLoans.length})</div>
          <div className="inv-actions-group" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="fiw" style={{ maxWidth: '240px', flex: 1 }}>
              <span className="fic">🔍</span>
              <input
                className="fi"
                placeholder="Quick search…"
                value={search}
                onChange={e => { setSearch(e.target.value); setSelectedIds([]); }}
                style={{ padding: '0 10px 0 36px', fontSize: '13px', height: 44, borderRadius: 12 }}
              />
            </div>
            <button
              className={`bsm ${showFilters ? 's' : 'g'}`}
              style={{ fontSize: '12px', height: 44, padding: '0 16px', borderRadius: 12 }}
              onClick={() => setShowFilters(v => !v)}
            >
              🔎 Filters {activeFilterCount > 0 && <span style={{ background: 'var(--red)', color: '#fff', borderRadius: '10px', fontSize: '10px', padding: '1px 6px', marginLeft: '4px' }}>{activeFilterCount}</span>}
            </button>
            <button className="bsm g" style={{ fontSize: '12px', height: 44, padding: '0 16px', borderRadius: 12 }} onClick={() => setConfirmExport(true)}>⬇ Export CSV</button>
          </div>
        </div>

        {/* FILTER PANEL */}
        {showFilters && (
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px', marginBottom: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '5px' }}>Status</label>
                <select className="sel2" value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ padding: '7px 10px', fontSize: '12.5px' }}>
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '5px' }}>Purpose</label>
                <select className="sel2" value={fPurpose} onChange={e => setFPurpose(e.target.value)} style={{ padding: '7px 10px', fontSize: '12.5px' }}>
                  <option value="">All</option>
                  <option>Medical</option><option>Education</option><option>Marriage</option><option>Other</option>
                </select>
              </div>
              {!isMember && (
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '5px' }}>Branch</label>
                  <select className="sel2" value={fBranch} onChange={e => setFBranch(e.target.value)} style={{ padding: '7px 10px', fontSize: '12.5px' }}>
                    <option value="">All Branches</option>
                    <option>Poyanad Central</option><option>Malappuram North</option>
                    <option>Thrissur East</option><option>Kannur West</option>
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              {activeFilterCount > 0 ? (
                <>
                  {fStatus  && <span style={chipStyle}>Status: <b>{fStatus}</b>  <span onClick={() => setFStatus('')}  style={chipX}>×</span></span>}
                  {fPurpose && <span style={chipStyle}>Purpose: <b>{fPurpose}</b> <span onClick={() => setFPurpose('')} style={chipX}>×</span></span>}
                  {fBranch  && <span style={chipStyle}>Branch: <b>{fBranch}</b>   <span onClick={() => setFBranch('')}  style={chipX}>×</span></span>}
                  <button className="bsm r" style={{ fontSize: '11px', padding: '3px 10px' }} onClick={clearFilters}>Clear All</button>
                </>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>No active filters — all loans shown.</span>
              )}
            </div>
          </div>
        )}

        {/* BULK ACTION BAR */}
        {selectedIds.length > 0 && (
          <div style={{ padding: '10px 20px', background: 'var(--teal-pale)', borderBottom: '1px solid var(--teal-pale2)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--teal)' }}>{selectedIds.length} loan{selectedIds.length > 1 ? 's' : ''} selected</span>
            {(!isMember || filteredLoans.filter(l => selectedIds.includes(l.id)).every(l => l.status === 'pending')) && (
              <button className="bsm r" style={{ fontSize: '12px', padding: '5px 14px' }} onClick={() => setConfirmDelete({ open: true, bulk: true })}>🗑 Delete Selected</button>
            )}
            <button className="bsm g" style={{ fontSize: '12px', padding: '5px 14px' }} onClick={() => setSelectedIds([])}>✕ Clear</button>
          </div>
        )}

        {/* TABLE */}
        {filteredLoans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>💰</div>
            <div>{search || activeFilterCount > 0 ? 'No loans match your filters.' : isMember ? 'You have no loan requests yet.' : 'No loan applications yet.'}</div>
            {isMember && <button className="bsm s" style={{ marginTop: '16px' }} onClick={() => {
              const prefix = profile?.role === 'super' ? '/super-admin/dashboard' : profile?.role === 'admin' ? '/admin/dashboard' : '/member/dashboard';
              navigate(`${prefix}/apply`);
            }}>Apply for Loan →</button>}
          </div>
        ) : (
          <>
            <div className="tbl-wrap loan-desktop-table">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '36px' }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                    </th>
                    <th>App No.</th>
                    {!isMember && <th>Applicant</th>}
                    <th>Amount / Purpose</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLoans.map(l => {
                    const isAdminOrSuper = profile?.role === 'admin' || profile?.role === 'super';
                    const parsed = parseLoanPurpose(l.purpose, l);

                    return (
                      <tr key={l.id} style={{ background: selectedIds.includes(l.id) ? 'var(--teal-pale)' : '' }}>
                        <td><input type="checkbox" checked={selectedIds.includes(l.id)} onChange={() => toggleOne(l.id)} style={{ cursor: 'pointer' }} /></td>
                        <td style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{l.id}</td>
                        {!isMember && (
                          <td><b>{l.name}</b><br /><span style={{ fontSize: '11px', color: 'var(--muted)' }}>{l.memNo}</span></td>
                        )}
                        <td>
                          <div>
                            <div style={{ fontSize: '14.5px', fontWeight: 950, color: 'var(--teal)' }}>
                              ₹{(l.amt || l.amount || 0).toLocaleString()}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', fontWeight: 800 }}>
                                {parsed.category}
                              </span>
                              {parsed.referredBy && (
                                <span style={{ fontSize: '11px', color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, border: '1px solid #bbf7d0' }}>
                                  👤 Ref: {parsed.referredBy}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: '12px' }}>{l.submittedDate ? new Date(l.submittedDate).toLocaleDateString() : '—'}</td>
                        <td>{stBadge(l)}</td>
                        <td style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            className={`bsm ${l.status === 'pending' && isAdminOrSuper ? 's' : 'g'}`}
                            style={{ fontSize: '11px', padding: '5px 12px' }}
                            onClick={() => { setSelectedLoanId(l.id); setActionStatus(l.status); setActionNote(''); setHistoryOpen(false); setApplicationHistory([]); setShowReview(true); }}
                          >
                            {l.status === 'pending' && isAdminOrSuper ? 'Review & Act →' : 'View Details'}
                          </button>
                          {l.status === 'approved' && !l.disbursementDate && isAdminOrSuper && (
                            <button
                              className="bsm s"
                              style={{ fontSize: '11px', padding: '5px 12px', background: 'var(--amber2)', borderColor: 'var(--amber2)' }}
                              onClick={() => {
                                setDisburseModalLoan(l);
                                setDisbTenure(String(l.months || 12));
                              }}
                            >
                              💰 Disburse
                            </button>
                          )}
                          {((l.status === 'pending' || l.status === 'rejected') && (isMember || isAdminOrSuper)) && (
                            <button
                              className="bsm o"
                              style={{ fontSize: '11px', padding: '5px 12px' }}
                              onClick={() => setEditingLoan(l)}
                            >
                              Edit
                            </button>
                          )}
                          {(isAdminOrSuper || (isMember && l.status === 'pending')) && (
                            <button className="bsm r" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={() => setConfirmDelete({ open: true, loan: l })}>🗑</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Transformation (Screens <= 768px) */}
            <div className="loan-mobile-cards">
              {filteredLoans.map(l => {
                const isAdminOrSuper = profile?.role === 'admin' || profile?.role === 'super';
                const parsed = parseLoanPurpose(l.purpose, l);
                const isSelected = selectedIds.includes(l.id);

                return (
                  <div
                    key={`mobile-card-${l.id}`}
                    style={{
                      background: isSelected ? 'var(--teal-pale)' : '#fff',
                      border: '1.5px solid var(--border)',
                      borderRadius: '16px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                    }}
                  >
                    {/* Header: Checkbox + Applicant Name + Reference + Status Badge */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(l.id)}
                          style={{ cursor: 'pointer', marginTop: '3px' }}
                        />
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                            {l.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            {l.memNo ? `Mem: ${l.memNo} · ` : ''}Ref: {l.id}
                          </div>
                        </div>
                      </div>
                      <div>{stBadge(l)}</div>
                    </div>

                    {/* Amount & Category */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ fontSize: '17px', fontWeight: 950, color: 'var(--teal)' }}>
                        ₹{(l.amt || l.amount || 0).toLocaleString()}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', fontWeight: 800 }}>
                          {parsed.category}
                        </span>
                        {parsed.referredBy && (
                          <span style={{ fontSize: '11px', color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, border: '1px solid #bbf7d0' }}>
                            👤 Ref: {parsed.referredBy}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Submission Date */}
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                      <b>Submitted:</b> {l.submittedDate ? new Date(l.submittedDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                      <button
                        className={`bsm ${l.status === 'pending' && isAdminOrSuper ? 's' : 'g'}`}
                        style={{ fontSize: '12px', padding: '7px 14px', flex: 1, minWidth: '120px' }}
                        onClick={() => { setSelectedLoanId(l.id); setActionStatus(l.status); setActionNote(''); setHistoryOpen(false); setApplicationHistory([]); setShowReview(true); }}
                      >
                        {l.status === 'pending' && isAdminOrSuper ? 'Review & Act →' : 'View Details'}
                      </button>
                      {l.status === 'approved' && !l.disbursementDate && isAdminOrSuper && (
                        <button
                          className="bsm s"
                          style={{ fontSize: '12px', padding: '7px 14px', background: 'var(--amber2)', borderColor: 'var(--amber2)' }}
                          onClick={() => {
                            setDisburseModalLoan(l);
                            setDisbTenure(String(l.months || 12));
                          }}
                        >
                          💰 Disburse
                        </button>
                      )}
                      {((l.status === 'pending' || l.status === 'rejected') && (isMember || isAdminOrSuper)) && (
                        <button
                          className="bsm o"
                          style={{ fontSize: '12px', padding: '7px 14px' }}
                          onClick={() => setEditingLoan(l)}
                        >
                          Edit
                        </button>
                      )}
                      {(isAdminOrSuper || (isMember && l.status === 'pending')) && (
                        <button className="bsm r" style={{ fontSize: '12px', padding: '7px 12px' }} onClick={() => setConfirmDelete({ open: true, loan: l })}>
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── REVIEW DRAWER ── */}
      <LoanReviewDrawer
        open={showReview}
        loan={selectedLoan!}
        loans={loans}
        profile={profile}
        config={config}
        allAdmins={allAdmins}
        selectedMember={selectedMember}
        filingHelper={filingHelper}
        canSign={canSign}
        isGlobalApprover={isGlobalApprover}
        actionStatus={actionStatus}
        actionNote={actionNote}
        historyLoading={historyLoading}
        historyOpen={historyOpen}
        applicationHistory={applicationHistory}
        witnessLinkBusy={witnessLinkBusy}
        parseLoanPurpose={parseLoanPurpose}
        formatDateOnly={formatDateOnly}
        historyValue={historyValue}
        getLoanWitnesses={getLoanWitnesses}
        onClose={() => setShowReview(false)}
        onActionStatusChange={setActionStatus}
        onActionNoteChange={setActionNote}
        onRecordSignature={() => setConfirmSave(true)}
        onLoadHistory={loadApplicationHistory}
        onSendWitnessLink={sendWitnessVerificationLink}
        onToggleReviewer={(adminId) => {
          if (!selectedLoanId || profile?.role !== 'super') return;
          const assignedIds: string[] = selectedLoan?.assignedReviewers || [];
          const isAssignedTag = assignedIds.includes(adminId);
          const newAssigned = isAssignedTag
            ? assignedIds.filter((id: string) => id !== adminId)
            : [...assignedIds, adminId];
          const updatedRequest = { ...(selectedLoan?.request || {}), assignedReviewers: newAssigned };
          localDb.updateLoan(selectedLoanId, { assignedReviewers: newAssigned, request: updatedRequest });
          localDb.addAuditLog(selectedLoanId, 'Committee Updated', profile?.name || 'Super Admin', `${isAssignedTag ? 'Removed' : 'Assigned'} reviewer.`);
          refreshLoans();
        }}
      />

      {/* ── EDIT LOAN MODAL (Members only) ── */}
      {editingLoan && (
        <div className="ov" onClick={e => { if ((e.target as HTMLElement).classList.contains('ov')) setEditingLoan(null); }}>
          <div className="modal">
            <div className="modal-head">
              <div className="modal-title">Edit Loan Request</div>
              <button className="modal-close" onClick={() => setEditingLoan(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--teal-pale)', padding: '12px', borderRadius: '10px', fontSize: '12.5px', color: 'var(--teal2)', marginBottom: '16px' }}>
                📝 You can edit your application while it is still <b>Pending</b>.
              </div>
              <div className="fgrid">
                <div className="fg2 full"><label className="fl2">Requested Amount (₹) *</label><input className="fi2" type="number" defaultValue={editingLoan.amt} ref={editAmtRef} /></div>
                <div className="fg2">
                  <label className="fl2">Purpose *</label>
                  <select className="sel2" defaultValue={editingLoan.purpose} ref={editPurpRef}>
                    <option>Medical</option><option>Education</option><option>Marriage</option><option>Business</option><option>Other</option>
                  </select>
                </div>
                <div className="fg2"><label className="fl2">Tenure (Months) *</label><input className="fi2" type="number" defaultValue={editingLoan.months} ref={editMonthsRef} /></div>
                <div className="fg2 full"><label className="fl2">Description</label><textarea className="ta2" rows={3} defaultValue={editingLoan.purpDesc} ref={editDescRef} /></div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="bsm g" onClick={() => setEditingLoan(null)}>Cancel</button>
              <button className="bsm s" onClick={handleUpdateLoan}>Update Application</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DIALOGS ── */}
      <ConfirmDialog
        open={confirmSave}
        icon={actionStatus === 'approved' ? '✅' : actionStatus === 'rejected' ? '❌' : '📝'}
        danger={actionStatus === 'rejected'}
        title={actionStatus === 'approved' ? 'Approve this Loan?' : actionStatus === 'rejected' ? 'Reject this Loan?' : 'Update Loan Status?'}
        message={actionStatus === 'approved'
          ? `Mark loan "${selectedLoanId}" as Approved. This will be recorded in the audit trail.`
          : actionStatus === 'rejected'
          ? `Reject loan "${selectedLoanId}". This will be logged and visible to the member.`
          : `Update status of loan "${selectedLoanId}" to Pending.`}
        confirmLabel={actionStatus === 'approved' ? 'Yes, Approve' : actionStatus === 'rejected' ? 'Yes, Reject' : 'Yes, Update'}
        cancelLabel="Go Back"
        onConfirm={doSaveAction}
        onCancel={() => setConfirmSave(false)}
      />

      <ConfirmDialog
        open={!!confirmDelete?.open}
        danger
        icon="🗑️"
        title={confirmDelete?.bulk ? `Delete ${selectedIds.length} Loans?` : 'Delete Loan?'}
        message={confirmDelete?.bulk
          ? `Permanently delete ${selectedIds.length} selected loan records. This cannot be undone.`
          : `Permanently delete loan "${confirmDelete?.loan?.id}" — ${confirmDelete?.loan?.name}?`}
        confirmLabel={confirmDelete?.bulk ? `Delete ${selectedIds.length}` : 'Yes, Delete'}
        cancelLabel="Cancel"
        onConfirm={() => {
          if (confirmDelete?.bulk) doBulkDelete();
          else if (confirmDelete?.loan) doDeleteLoan(confirmDelete.loan.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* ── DISBURSE LOAN MODAL ── */}
      {disburseModalLoan && (
        <div className="ov" onClick={e => { if ((e.target as HTMLElement).classList.contains('ov')) setDisburseModalLoan(null); }}>
          <div className="modal" style={{ maxWidth: '450px' }}>
            <div className="modal-head">
              <div className="modal-title">Confirm Loan Disbursement</div>
              <button className="modal-close" onClick={() => setDisburseModalLoan(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--teal-pale)', padding: '12px', borderRadius: '10px', fontSize: '12.5px', color: 'var(--teal2)', marginBottom: '16px' }}>
                💸 Recording disbursement will generate the repayment schedule.
              </div>
              <div className="fgrid">
                <div className="fg2 full">
                  <label className="fl2">Disbursement Date *</label>
                  <input className="fi2" type="date" value={disbDate} onChange={e => setDisbDate(e.target.value)} />
                </div>
                <div className="fg2">
                  <label className="fl2">Tenure (Months) *</label>
                  <input className="fi2" type="number" value={disbTenure} onChange={e => setDisbTenure(e.target.value)} />
                </div>
                <div className="fg2">
                  <label className="fl2">Repayment Frequency *</label>
                  <select className="sel2" value={disbFreq} onChange={e => setDisbFreq(e.target.value)}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="one_time">One-Time / Lumpsum</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="bsm g" onClick={() => setDisburseModalLoan(null)}>Cancel</button>
              <button className="bsm s" onClick={async () => {
                await localDb.generateInstallments(disburseModalLoan.loan_no || disburseModalLoan.id, {
                  disbursement_date: disbDate,
                  tenure_months: Number(disbTenure),
                  repayment_frequency: disbFreq
                });
                setToast({ m: `Loan disbursed and schedule generated!`, t: 's' });
                setTimeout(() => setToast(null), 3000);
                setDisburseModalLoan(null);
                refreshLoans();
              }}>Confirm Disbursement 💰</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmExport}
        icon="📥"
        danger={false}
        title="Export Loan Data?"
        message={`Download ${filteredLoans.length} loan record(s) as a CSV file.`}
        confirmLabel="Download CSV"
        cancelLabel="Cancel"
        onConfirm={() => { doExportCSV(); setConfirmExport(false); }}
        onCancel={() => setConfirmExport(false)}
      />
      <style>{`
        /* Pipeline Statistics Grid */
        .loan-pipeline-grid {
          display: grid !important;
          grid-template-columns: repeat(4, 1fr) !important;
          gap: 14px !important;
        }

        @media (min-width: 769px) {
          .loan-mobile-cards {
            display: none !important;
          }
        }

        @media (max-width: 1024px) {
          .loan-pipeline-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }
          .pg-hd {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          .pg-acts {
            width: 100%;
            margin-left: 0 !important;
          }
          .pg-acts button {
            width: 100%;
            justify-content: center;
          }
          .inv-ctrls {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .inv-actions-group {
            width: 100%;
            justify-content: space-between;
          }
          .inv-actions-group > div {
            max-width: 100% !important;
          }
        }

        @media (max-width: 768px) {
          .loan-desktop-table {
            display: none !important;
          }
          .loan-mobile-cards {
            display: flex !important;
            flex-direction: column !important;
            gap: 14px !important;
            padding: 16px !important;
          }
          .loan-review-container {
            grid-template-columns: 1fr !important;
            height: 95vh !important;
            max-height: 95vh !important;
          }
          .amt-hero {
            flex-direction: column !important;
            gap: 15px !important;
            padding: 20px !important;
          }
          .ah-r {
            text-align: left !important;
            border-left: none !important;
            border-top: 1px solid rgba(255,255,255,0.1);
            padding-top: 15px;
            width: 100%;
          }
          .rv-row {
            flex-direction: column !important;
            gap: 4px !important;
            align-items: flex-start !important;
          }
          .rv-v {
            text-align: left !important;
            width: 100%;
            font-weight: 800 !important;
          }
          .wit-tbl {
            display: block;
            overflow-x: auto;
            white-space: nowrap;
          }
          .review-modal-grid > div:first-child {
            border-right: none !important;
            border-bottom: 2px solid var(--border);
          }
        }

        @media (max-width: 480px) {
          .card-hd .card-title {
            width: 100%;
            text-align: center;
            margin-bottom: 10px;
          }
          .inv-actions-group {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 10px !important;
          }
          .inv-actions-group > div:first-child {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 360px) {
          .loan-pipeline-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}
