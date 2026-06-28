import React, { useState, useRef } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { localDb, syncFromBackend } from '../../lib/localDb';
import ConfirmDialog from '../../components/ConfirmDialog';

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
        {(isMember || profile?.role === 'super' || profile?.role === 'admin') && (
          <div className="pg-acts" style={{ marginLeft: 'auto' }}>
            <button className="bsm s" style={{ height: 48, padding: '0 24px', borderRadius: 14 }} onClick={() => {
              const prefix = profile?.role === 'super' ? '/super-admin/dashboard' : profile?.role === 'admin' ? '/admin/dashboard' : '/member/dashboard';
              navigate(`${prefix}/apply`);
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
          <div className="tbl-wrap">
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
                  return (
                    <tr key={l.id} style={{ background: selectedIds.includes(l.id) ? 'var(--teal-pale)' : '' }}>
                      <td><input type="checkbox" checked={selectedIds.includes(l.id)} onChange={() => toggleOne(l.id)} style={{ cursor: 'pointer' }} /></td>
                      <td style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{l.id}</td>
                      {!isMember && (
                        <td><b>{l.name}</b><br /><span style={{ fontSize: '11px', color: 'var(--muted)' }}>{l.memNo}</span></td>
                      )}
                      <td><b>₹{(l.amt || 0).toLocaleString()}</b><br /><span style={{ fontSize: '11px', color: 'var(--muted)' }}>{l.purpose}</span></td>
                      <td style={{ fontSize: '12px' }}>{l.submittedDate ? new Date(l.submittedDate).toLocaleDateString() : '—'}</td>
                      <td>{stBadge(l)}</td>
                      <td style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          className={`bsm ${l.status === 'pending' && isAdminOrSuper ? 's' : 'g'}`}
                          style={{ fontSize: '11px', padding: '5px 12px' }}
                          onClick={() => { setSelectedLoanId(l.id); setActionStatus(l.status); setActionNote(''); setShowReview(true); }}
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
        )}
      </div>

      {/* ── REVIEW MODAL ── */}
      {showReview && selectedLoan && (
        <div className="ov" onClick={e => { if ((e.target as HTMLElement).classList.contains('ov')) setShowReview(false); }}>
          <div className="modal review-modal-grid loan-review-container" style={{ maxWidth: '980px', height: '90vh', maxHeight: '90vh', display: 'grid', gridTemplateColumns: '1.2fr 1fr', overflow: 'hidden', padding: 0 }}>

            {/* LEFT — Original Application */}
            <div style={{ background: 'var(--bg)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              <div className="modal-head" style={{ background: 'var(--bg)', flexShrink: 0 }}>
                <div className="modal-title">Original Signed Form</div>
                <button className="bsm g" style={{ fontSize: '11px' }} onClick={() => window.print()}>⬇ Print/PDF</button>
              </div>
              <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div className="amt-hero">
                  <div>
                    <div className="ah-lbl">Requested Amount</div>
                    <div className="ah-num">₹{selectedLoan.amt?.toLocaleString()}</div>
                    <div className="ah-words">Interest-Free Welfare Loan</div>
                  </div>
                  <div className="ah-r">
                    <div className="ah-rl">Tenure</div>
                    <div className="ah-rn">{selectedLoan.months} Months</div>
                  </div>
                </div>
                <div className="rv-sec">
                  <div className="rv-sec-t">Applicant Details</div>
                  <div className="rv-row"><div className="rv-k">Name</div><div className="rv-v">{selectedLoan.name}</div></div>
                  <div className="rv-row"><div className="rv-k">Member ID</div><div className="rv-v">{selectedLoan.memNo} · {selectedLoan.branch}</div></div>
                  <div className="rv-row"><div className="rv-k">Contact</div><div className="rv-v">{selectedLoan.mob}</div></div>
                  {selectedMember && (
                    <>
                      <div className="rv-row"><div className="rv-k">Member Type</div><div className="rv-v">{selectedMember.type || 'Regular'}</div></div>
                      <div className="rv-row"><div className="rv-k">Joined Date</div><div className="rv-v">{selectedMember.joinDate || '—'}</div></div>
                      <div className="rv-row"><div className="rv-k">Occupation</div><div className="rv-v">{selectedMember.occupation || '—'}</div></div>
                      <div className="rv-row"><div className="rv-k">Monthly Salary</div><div className="rv-v">{selectedLoan.salary ? `₹${selectedLoan.salary}` : '—'}</div></div>
                      <div className="rv-row"><div className="rv-k">Aadhaar / ID</div><div className="rv-v">{selectedLoan.aadhaar || '—'}</div></div>
                    </>
                  )}
                </div>
                <div className="rv-sec">
                  <div className="rv-sec-t">Purpose & Description</div>
                  <div className="rv-row"><div className="rv-k">Category</div><div className="rv-v">{selectedLoan.purpose}</div></div>
                  <div style={{ fontSize: '13px', color: 'var(--dark2)', marginTop: '8px', fontStyle: 'italic', padding: '10px', background: 'var(--white)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    "{selectedLoan.purpDesc}"
                  </div>
                </div>

                {/* Repayment Plan */}
                <div className="rv-sec">
                  <div className="rv-sec-t">Repayment Plan ({selectedLoan.months} Months)</div>
                  <table className="wit-tbl">
                    <thead><tr><th>EMI #</th><th>Due Date</th><th>Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {(selectedLoan.repayments || []).map((r: any, i: number) => (
                        <tr key={i}>
                          <td><b>#{i + 1}</b></td>
                          <td>{new Date(r.due).toLocaleDateString()}</td>
                          <td><b>₹{r.amt?.toLocaleString()}</b></td>
                          <td>{r.paid ? <span className="bdg bdg-g" style={{ fontSize: '10px' }}>Paid</span> : <span className="bdg bdg-a" style={{ fontSize: '10px' }}>Due</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectedLoan.guarantors?.length > 0 && (
                  <div className="rv-sec">
                    <div className="rv-sec-t">Guarantors</div>
                    <table className="wit-tbl">
                      <thead><tr><th>Name</th><th>Relation</th><th>Phone</th></tr></thead>
                      <tbody>
                        {selectedLoan.guarantors.map((g: any, i: number) => (
                          <tr key={i}><td><b>{g.name}</b></td><td>{g.rel}</td><td>{g.phone}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {selectedLoan.witnesses?.length > 0 && (
                  <div className="rv-sec">
                    <div className="rv-sec-t">Witnesses</div>
                    <table className="wit-tbl">
                      <thead><tr><th>Name</th><th>Mobile</th></tr></thead>
                      <tbody>
                        {selectedLoan.witnesses.filter((w: any) => w.name).map((w: any, i: number) => (
                          <tr key={i}><td><b>{w.name}</b></td><td>{w.phone}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedLoan.signature && (
                  <div className="rv-sec">
                    <div className="rv-sec-t">Applicant Signature</div>
                    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', padding: '15px', textAlign: 'center' }}>
                       <img src={selectedLoan.signature} alt="Signature" style={{ maxHeight: '80px' }} />
                    </div>
                  </div>
                )}

                <div className="decl-box" style={{ fontSize: '12px', padding: '12px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  ✅ <b>Declaration Signed</b> — This application was digitally signed by {selectedLoan.name} on {selectedLoan.submittedDate}.
                </div>
              </div>
            </div>

            {/* RIGHT — Actions + Audit */}
            <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--white)', minHeight: 0, overflow: 'hidden' }}>
              <div className="modal-head" style={{ flexShrink: 0 }}>
                <div className="modal-title">{isMember ? 'Loan Application Status' : 'Validation & Audit Trail'}</div>
                <button className="modal-close" onClick={() => setShowReview(false)}>✕</button>
              </div>
              <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                {isMember && selectedLoan.status === 'pending' && (
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: '16px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', marginBottom: '12px' }}>Consensus Progress</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                      {allAdmins.filter((a: any) => config.authorizedReviewers?.includes(a.id)).map((admin: any) => {
                        const assignedIds: string[] = selectedLoan.assignedReviewers || [];
                        const assigned = assignedIds.length === 0 || assignedIds.includes(admin.id);
                        if (!assigned) return null;
                        
                        const approval = (selectedLoan.approvals || []).find((ap: any) => ap.id === admin.id || ap.by === admin.name);
                        const dotColor = approval?.status === 'approved' ? '#10b981' : approval?.status === 'rejected' ? '#ef4444' : '#6366f1';
                        
                        return (
                          <div key={admin.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ position: 'relative' }}>
                              <div className="sb-av" style={{ width: '28px', height: '28px', fontSize: '11px' }}>{admin.name[0]}</div>
                              <div style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '10px', height: '10px', borderRadius: '50%', background: dotColor, border: '2px solid #fff' }}></div>
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 700 }}>{admin.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!isMember && (
                  <>
                    {/* Committee Status & Assignment */}
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Committee & Consensus</div>
                      {profile?.role === 'super' && <span style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 700 }}>Click to Assign</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {allAdmins.filter((a: any) => config.authorizedReviewers?.includes(a.id)).map((admin: any) => {
                        const assignedIds: string[] = selectedLoan.assignedReviewers || [];
                        const assigned = assignedIds.length === 0 || assignedIds.includes(admin.id);
                        const approval = (selectedLoan.approvals || []).find((ap: any) => ap.id === admin.id || ap.by === admin.name);
                        const dotColor = approval?.status === 'approved' ? '#10b981' : approval?.status === 'rejected' ? '#ef4444' : assigned ? '#6366f1' : '#e2e8f0';
                        
                        const toggle = () => {
                          if (profile?.role !== 'super') return;
                          const isAssignedTag = assignedIds.includes(admin.id);
                          const newAssigned = isAssignedTag
                            ? assignedIds.filter((id: string) => id !== admin.id)
                            : [...assignedIds, admin.id];
                          // Update both top-level assignedReviewers and request.assignedReviewers so backend persists it
                          const updatedRequest = { ...(selectedLoan.request || {}), assignedReviewers: newAssigned };
                          localDb.updateLoan(selectedLoanId!, { assignedReviewers: newAssigned, request: updatedRequest });
                          localDb.addAuditLog(selectedLoanId!, 'Committee Updated', profile?.name || 'Super Admin', `${isAssignedTag ? 'Removed' : 'Assigned'} ${admin.name} to reviewers.`);
                          refreshLoans();
                        };

                        return (
                          <div key={admin.id} onClick={toggle} style={{ 
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', borderRadius: '10px',
                            background: assigned ? '#fff' : 'transparent',
                            border: assigned ? '1.5px solid var(--teal)' : '1.5px solid transparent',
                            cursor: profile?.role === 'super' ? 'pointer' : 'default',
                            opacity: assigned || profile?.role === 'super' ? 1 : 0.4,
                            transition: 'all .2s'
                          }}>
                            <div style={{ position: 'relative' }}>
                              <div className="sb-av" style={{ width: '24px', height: '24px', fontSize: '10px' }}>{admin.name[0]}</div>
                              <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '9px', height: '9px', borderRadius: '50%', background: dotColor, border: '2px solid #fff' }}></div>
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 700 }}>{admin.name}</div>
                          </div>
                        );
                      })}
                    </div>
                    {profile?.role === 'super' && (
                      <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>Authorize New Reviewer (Predictive Search)</div>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', pointerEvents: 'none' }}>🔍</span>
                          <input
                            className="fi2"
                            list="loan-admin-list"
                            placeholder="Type admin name to authorize & assign..."
                            value={reviewerSearch}
                            onChange={e => setReviewerSearch(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const val = reviewerSearch.trim();
                                const found = allAdmins.find((a: any) =>
                                  a.name === val ||
                                  `${a.name} (${a.desig})` === val ||
                                  a.name.toLowerCase().includes(val.toLowerCase())
                                );
                                if (found) {
                                  const assignedIds: string[] = selectedLoan.assignedReviewers || [];
                                  if (!(config.authorizedReviewers || []).includes(found.id)) {
                                    localDb.toggleReviewerPool(found.id);
                                  }
                                  if (!assignedIds.includes(found.id)) {
                                    const newAssigned = [...assignedIds, found.id];
                                    const updatedRequest = { ...(selectedLoan.request || {}), assignedReviewers: newAssigned };
                                    localDb.updateLoan(selectedLoanId!, { assignedReviewers: newAssigned, request: updatedRequest });
                                    localDb.addAuditLog(selectedLoanId!, 'Committee Updated', profile?.name || 'Super Admin', `Authorized and assigned ${found.name} to reviewers.`);
                                    refreshLoans();
                                  }
                                  setToast({ m: `✅ ${found.name} authorized & assigned to loan!`, t: 's' });
                                  setTimeout(() => setToast(null), 3000);
                                  setReviewerSearch('');
                                }
                              }
                            }}
                            style={{ paddingLeft: '32px', background: '#fff', border: '1.5px solid #cbd5e1', color: '#0f172a', borderRadius: '10px', width: '100%', fontSize: '12px', height: '36px' }}
                          />
                          <datalist id="loan-admin-list">
                            {allAdmins
                              .filter((a: any) => !(config.authorizedReviewers || []).includes(a.id))
                              .map((a: any) => (
                                <option key={a.id} value={`${a.name} (${a.desig})`} />
                              ))}
                          </datalist>
                        </div>
                      </div>
                    )}
                  </div>

                  {!canSign && isGlobalApprover && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', padding: '12px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ fontSize: '20px' }}>⚠️</span>
                      <div style={{ fontSize: '11px', color: '#92400e', fontWeight: 600 }}>
                        You are not an assigned reviewer for this case. You can view details, but only committee members can sign.
                      </div>
                    </div>
                  )}

                  <label className="fl2" style={{ marginBottom: '10px' }}>Your Verdict *</label>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                    {[
                      { id: 'approved', lbl: '✅ Approve', color: '#10b981' },
                      { id: 'rejected', lbl: '❌ Reject', color: '#ef4444' },
                      { id: 'pending', lbl: '⏳ Pending', color: '#f59e0b' }
                    ].map(s => (
                      <label key={s.id} className={`radio-opt ${actionStatus === s.id ? 'sel' : ''} ${!canSign ? 'dis' : ''}`} 
                        style={{ flex: 1, marginBottom: 0, padding: '10px 5px', textAlign: 'center', borderColor: actionStatus === s.id ? s.color : '', fontSize: '11px', opacity: canSign ? 1 : 0.6, pointerEvents: canSign ? 'auto' : 'none' }} 
                        onClick={() => canSign && setActionStatus(s.id)}>
                        <input type="radio" checked={actionStatus === s.id} readOnly />
                        <div className="ro-lbl" style={{ fontWeight: 800, fontSize: '11px' }}>{s.lbl}</div>
                      </label>
                    ))}
                  </div>
                  <textarea className="ta2" placeholder={canSign ? "Explain your decision..." : "Read-only view"} value={actionNote} readOnly={!canSign} onChange={e => setActionNote(e.target.value)} style={{ marginBottom: '16px' }} />
                  <button 
                    className="bsm s" 
                    style={{ width: '100%', padding: '14px', marginBottom: '24px', fontWeight: 800, opacity: canSign ? 1 : 0.5 }} 
                    disabled={!canSign}
                    onClick={() => setConfirmSave(true)}
                  >
                     {canSign ? 'Record My Signature →' : 'Signature Restricted'}
                  </button>
                </>
              )}

                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--dark2)', marginBottom: '14px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                  Action History
                </div>
                <div style={{ paddingLeft: '14px', borderLeft: '2px solid var(--border2)' }}>
                  {[...(selectedLoan.audit || [])].reverse().map((log: any, i: number) => (
                    <div key={i} style={{ marginBottom: '18px', position: 'relative' }}>
                      <div style={{
                        position: 'absolute', width: '11px', height: '11px', borderRadius: '50%', left: '-22px', top: '2px',
                        background: log.action === 'Approved' ? 'var(--green)' : log.action === 'Rejected' ? 'var(--red)' : log.action === 'Submitted' ? 'var(--blue)' : 'var(--amber)',
                        border: '2px solid var(--white)'
                      }}></div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--dark)' }}>{log.action}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>By <b>{log.by}</b> · {log.date}</div>
                      {log.note && (
                        <div style={{ marginTop: '6px', fontSize: '12px', fontStyle: 'italic', background: 'var(--bg)', padding: '8px 12px', borderRadius: '6px', color: 'var(--dark2)' }}>
                          "{log.note}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
        @media (max-width: 1024px) {
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
      `}</style>
    </>
  );
}
