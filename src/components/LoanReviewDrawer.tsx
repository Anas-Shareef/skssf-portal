import React, { useEffect, useRef, useCallback, useState } from 'react';
import { History as HistoryIcon } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface LoanReviewDrawerProps {
  open: boolean;
  loan: any;
  loans: any[];
  profile: any;
  config: any;
  allAdmins: any[];
  selectedMember: any;
  filingHelper: any;
  canSign: boolean;
  isGlobalApprover: boolean;
  actionStatus: string;
  actionNote: string;
  historyLoading: boolean;
  historyOpen: boolean;
  applicationHistory: any[];
  witnessLinkBusy: number | null;
  parseLoanPurpose: (purposeStr: string, rawLoan?: any) => any;
  formatDateOnly: (value: any) => string;
  historyValue: (value: any) => string;
  getLoanWitnesses: (loan: any) => any[];
  onClose: () => void;
  onActionStatusChange: (status: string) => void;
  onActionNoteChange: (note: string) => void;
  onRecordSignature: () => void;
  onLoadHistory: (loan: any) => void;
  onSendWitnessLink: (loan: any, witness: any, index: number) => void;
  onToggleReviewer: (adminId: string) => void;
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending:   { cls: 'bdg bdg-a', label: 'Pending' },
    approved:  { cls: 'bdg bdg-g', label: 'Approved' },
    completed: { cls: 'bdg bdg-b', label: 'Completed' },
    rejected:  { cls: 'bdg bdg-r', label: 'Rejected' },
  };
  const s = map[status] || { cls: 'bdg bdg-gr', label: 'Unknown' };
  return <span className={s.cls} style={{ fontSize: 11 }}>{s.label}</span>;
}

// ─── Unsaved-change guard ────────────────────────────────────────────────────

interface UnsavedDialogProps {
  onContinue: () => void;
  onDiscard: () => void;
}

function UnsavedDialog({ onContinue, onDiscard }: UnsavedDialogProps) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 10,
        background: 'rgba(15,23,42,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '12px 0 0 12px',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, padding: '28px 32px',
        maxWidth: 380, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
          Unsaved Changes
        </div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
          You have unsaved review changes. Are you sure you want to close?
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            className="bsm s"
            style={{ padding: '10px 20px', fontSize: 13 }}
            onClick={onContinue}
          >
            Continue Reviewing
          </button>
          <button
            className="bsm r"
            style={{ padding: '10px 20px', fontSize: 13 }}
            onClick={onDiscard}
          >
            Discard Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Drawer ─────────────────────────────────────────────────────────────

export default function LoanReviewDrawer({
  open,
  loan,
  loans,
  profile,
  config,
  allAdmins,
  selectedMember,
  filingHelper,
  canSign,
  isGlobalApprover,
  actionStatus,
  actionNote,
  historyLoading,
  historyOpen,
  applicationHistory,
  witnessLinkBusy,
  parseLoanPurpose,
  formatDateOnly,
  historyValue,
  getLoanWitnesses,
  onClose,
  onActionStatusChange,
  onActionNoteChange,
  onRecordSignature,
  onLoadHistory,
  onSendWitnessLink,
  onToggleReviewer,
}: LoanReviewDrawerProps) {

  const isMember = profile?.role === 'member';
  const drawerRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const rightColRef = useRef<HTMLDivElement>(null);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Determine whether the admin has made unsaved review changes
  const hasUnsavedChanges = useCallback(() => {
    if (isMember) return false;
    const originalStatus = loan?.status || 'pending';
    return (
      (actionStatus !== originalStatus && actionStatus !== 'pending') ||
      actionNote.trim().length > 0
    );
  }, [isMember, loan, actionStatus, actionNote]);

  // Animate in
  useEffect(() => {
    if (open) {
      setIsAnimatingOut(false);
      requestAnimationFrame(() => setIsVisible(true));
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') attemptClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, actionStatus, actionNote]);

  const attemptClose = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowUnsaved(true);
    } else {
      triggerClose();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedChanges]);

  const triggerClose = useCallback(() => {
    setShowUnsaved(false);
    setIsAnimatingOut(true);
    setIsVisible(false);
    // Wait for animation before actually closing
    setTimeout(() => {
      setIsAnimatingOut(false);
      onClose();
    }, 260);
  }, [onClose]);

  if (!open && !isAnimatingOut) return null;
  if (!loan) return null;

  const parsed = parseLoanPurpose(loan.purpose, loan);
  const contactVal = loan.mob || loan.phone || loan.requester_phone || loan.applicant_phone || '—';
  const salaryVal = loan.salary
    ? `₹${loan.salary}`
    : parsed.income
      ? parsed.income
      : loan.monthly_income
        ? `₹${Number(loan.monthly_income).toLocaleString()}`
        : '—';

  const applicantName = loan.applicant_name || loan.name || '';
  const appRef = loan.application_reference ||
    loan.request?.application_reference ||
    `REF-${String(loan.source_request_id || loan.id).slice(0, 8).toUpperCase()}`;

  // Previous loan stats
  const prevLoans = loans.filter(l => l.id !== loan.id && (l.name === applicantName || l.applicant_name === applicantName));
  const completedPrev = prevLoans.filter(l => l.status === 'completed' || l.workflow_status === 'REPAYMENT_COMPLETE').length;
  const activePrev   = prevLoans.filter(l => l.status === 'approved' || l.status === 'completed' || l.workflow_status === 'APPROVED' || l.workflow_status === 'DISBURSED').length;
  const hasActiveOrOverdue = activePrev > 0;

  const witnesses = getLoanWitnesses(loan);

  // ── Drawer container styles ──
  const backdropStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(15,23,42,0.5)',
    backdropFilter: 'blur(3px)',
    opacity: isVisible ? 1 : 0,
    transition: 'opacity 280ms ease',
    WebkitBackdropFilter: 'blur(3px)',
  };

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0, right: 0, bottom: 0,
    width: 'min(85vw, 1280px)',
    zIndex: 1001,
    background: '#ffffff',
    boxShadow: '-8px 0 60px rgba(0,0,0,0.18)',
    borderRadius: '12px 0 0 12px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
    // Respect reduced motion
    willChange: 'transform',
  };

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        style={backdropStyle}
        onClick={() => attemptClose()}
        aria-hidden="true"
      />

      {/* ── Drawer Panel ── */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Review & Act – Loan Application"
        style={panelStyle}
      >
        {/* Unsaved-changes guard overlay */}
        {showUnsaved && (
          <UnsavedDialog
            onContinue={() => setShowUnsaved(false)}
            onDiscard={triggerClose}
          />
        )}

        {/* ── FIXED HEADER ── */}
        <div style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1.5px solid var(--border)',
          background: '#fff',
          gap: 16,
          flexWrap: 'wrap',
          zIndex: 2,
        }}>
          {/* Left: title + meta */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--dark)', fontFamily: "'Poppins', serif" }}>
                Review &amp; Act
              </div>
              <StatusBadge status={loan.status} />
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
              <span>
                <span style={{ fontWeight: 600, color: 'var(--dark2)' }}>Applicant:</span>{' '}
                {applicantName || '—'}
              </span>
              <span>
                <span style={{ fontWeight: 600, color: 'var(--dark2)' }}>Reference:</span>{' '}
                {appRef}
              </span>
              {loan.memNo && (
                <span>
                  <span style={{ fontWeight: 600, color: 'var(--dark2)' }}>Member No:</span>{' '}
                  {loan.memNo}
                </span>
              )}
            </div>
          </div>

          {/* Right: actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button
              className="bsm g"
              style={{ fontSize: 11, padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onClick={() => window.print()}
              title="Print / Save as PDF"
            >
              🖨️ Print/PDF
            </button>
            <button
              className="modal-close"
              style={{ width: 34, height: 34 }}
              onClick={attemptClose}
              title="Close (Esc)"
              aria-label="Close drawer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── TWO-COLUMN BODY ── */}
        <div style={{
          flex: 1, minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
        }} className="drawer-body-cols">

          {/* ══ LEFT COLUMN – Original Signed Form ══ */}
          <div
            ref={leftColRef}
            className="drawer-left-col"
            style={{
              flex: '0 0 55%', maxWidth: '55%',
              overflowY: 'auto',
              borderRight: '1.5px solid var(--border)',
              background: 'var(--bg)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Left column sticky header */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 1,
              background: 'var(--bg)',
              padding: '14px 22px 10px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--dark)', fontFamily: "'Poppins', serif" }}>
                Original Signed Form
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>Read-only</div>
            </div>

            <div style={{ padding: '20px 22px', flex: 1 }}>

              {/* Amount Hero */}
              <div className="amt-hero" style={{ marginBottom: 20 }}>
                <div>
                  <div className="ah-lbl">Requested Amount</div>
                  <div className="ah-num">₹{loan.amt?.toLocaleString()}</div>
                  <div className="ah-words">Interest-Free Welfare Loan</div>
                </div>
                <div className="ah-r">
                  <div className="ah-rl">Tenure</div>
                  <div className="ah-rn">{loan.months} Months</div>
                </div>
              </div>

              {/* Applicant Details */}
              <div className="rv-sec">
                <div className="rv-sec-t">Applicant Details</div>
                <div className="rv-row"><div className="rv-k">Name</div><div className="rv-v">{loan.applicant_name || loan.name}</div></div>
                <div className="rv-row"><div className="rv-k">Application Reference</div><div className="rv-v">{appRef}</div></div>
                <div className="rv-row"><div className="rv-k">Contact</div><div className="rv-v">{contactVal}</div></div>
                {loan.applicant_whatsapp && <div className="rv-row"><div className="rv-k">WhatsApp</div><div className="rv-v">{loan.applicant_whatsapp}</div></div>}
                <div className="rv-row"><div className="rv-k">Date of Birth</div><div className="rv-v">{formatDateOnly(loan.applicant_dob)}</div></div>
                <div className="rv-row"><div className="rv-k">Gender</div><div className="rv-v">{loan.applicant_gender || 'Not provided'}</div></div>
                {loan.applicant_father_name && <div className="rv-row"><div className="rv-k">Father's Name</div><div className="rv-v">{loan.applicant_father_name}</div></div>}
                {loan.applicant_address && <div className="rv-row"><div className="rv-k">Address</div><div className="rv-v">{loan.applicant_address}</div></div>}
                {loan.applicant_address_pin && <div className="rv-row"><div className="rv-k">PIN</div><div className="rv-v">{loan.applicant_address_pin}</div></div>}
                {loan.applicant_occupation && <div className="rv-row"><div className="rv-k">Occupation</div><div className="rv-v">{loan.applicant_occupation}</div></div>}
                {loan.applicant_employer_name && <div className="rv-row"><div className="rv-k">Employer</div><div className="rv-v">{loan.applicant_employer_name}</div></div>}
                <div className="rv-row"><div className="rv-k">Monthly Salary</div><div className="rv-v">{salaryVal}</div></div>
                {loan.income_source && <div className="rv-row"><div className="rv-k">Income Source</div><div className="rv-v">{loan.income_source}</div></div>}
                {loan.request?.relationship && <div className="rv-row"><div className="rv-k">Member Relationship</div><div className="rv-v">{loan.request.relationship}</div></div>}
                {loan.member_notes && <div className="rv-row"><div className="rv-k">Member Assessment</div><div className="rv-v">{loan.member_notes}</div></div>}
                {selectedMember && (
                  <div className="rv-row" style={{ background: 'var(--teal-pale)', padding: '5px 8px', borderRadius: 8, marginTop: 8 }}>
                    <div className="rv-k" style={{ color: 'var(--teal)' }}>Membership No</div>
                    <div className="rv-v" style={{ fontWeight: 800 }}>{selectedMember.member_unique_code || selectedMember.memNo || '—'}</div>
                  </div>
                )}
                {filingHelper && (
                  <div className="rv-row" style={{ background: 'var(--teal-pale)', padding: '5px 8px', borderRadius: 8, marginTop: 6 }}>
                    <div className="rv-k" style={{ color: 'var(--teal)' }}>Filing Helper</div>
                    <div className="rv-v" style={{ fontWeight: 800 }}>{filingHelper.name} ({filingHelper.member_unique_code || 'MBR-CODE'})</div>
                  </div>
                )}
              </div>

              {/* Purpose & Specifications */}
              <div className="rv-sec">
                <div className="rv-sec-t">Purpose &amp; Specifications</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Category</div>
                    <span style={{ fontSize: 11, padding: '2px 8px', marginTop: 3, display: 'inline-block', borderRadius: 5, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', fontWeight: 800 }}>
                      {parsed.category}
                    </span>
                  </div>
                  {parsed.referredBy && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Referred By Member</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#166534', marginTop: 3 }}>👤 {parsed.referredBy}</div>
                    </div>
                  )}
                  {parsed.period && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Repayment Period</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginTop: 3 }}>⏱ {parsed.period}</div>
                    </div>
                  )}
                </div>
                {parsed.details && (
                  <div style={{ padding: 12, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>Detailed Purpose</div>
                    <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.5 }}>{parsed.details}</div>
                  </div>
                )}
              </div>

              {/* Additional Declarations */}
              {(parsed.dob || parsed.debts) && (
                <div className="rv-sec">
                  <div className="rv-sec-t">Additional Declarations</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, background: '#f8fafc', padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    {parsed.dob   && <div><b>DOB / Gender:</b> {parsed.dob}</div>}
                    {parsed.debts && <div><b>Existing Debts:</b> {parsed.debts}</div>}
                  </div>
                </div>
              )}

              {/* Repayment Plan */}
              <div className="rv-sec">
                <div className="rv-sec-t">Repayment Plan ({loan.months} Months)</div>
                {(loan.repayments || []).length > 0 ? (
                  <table className="wit-tbl">
                    <thead><tr><th>EMI #</th><th>Due Date</th><th>Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {(loan.repayments || []).map((r: any, i: number) => (
                        <tr key={i}>
                          <td><b>#{i + 1}</b></td>
                          <td>{new Date(r.due).toLocaleDateString()}</td>
                          <td><b>₹{r.amt?.toLocaleString()}</b></td>
                          <td>{r.paid ? <span className="bdg bdg-g" style={{ fontSize: 10 }}>Paid</span> : <span className="bdg bdg-a" style={{ fontSize: 10 }}>Due</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Repayment schedule will be generated upon disbursement.</div>
                )}
              </div>

              {/* Guarantors */}
              {loan.guarantors?.length > 0 && (
                <div className="rv-sec">
                  <div className="rv-sec-t">Guarantors</div>
                  <table className="wit-tbl">
                    <thead><tr><th>Name</th><th>Relation</th><th>Phone</th></tr></thead>
                    <tbody>
                      {loan.guarantors.map((g: any, i: number) => (
                        <tr key={i}><td><b>{g.name}</b></td><td>{g.rel}</td><td>{g.phone}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Witness / Guarantor Verifications */}
              <div className="rv-sec">
                <div className="rv-sec-t">Witness / Guarantor Verifications</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {witnesses.map((witness: any, index: number) => {
                    const idx = index + 1;
                    const cleanPhone = (witness.phone || '').replace(/\D/g, '');
                    const canIssueLink = !!loan.source_request_id && cleanPhone.length === 10;
                    return (
                      <div key={idx} style={{ background: '#fff', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 12, color: '#0f172a' }}>
                            Witness {idx}: {witness.name || '—'}{' '}
                            {witness.phone && <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>({witness.phone})</span>}{' '}
                            {witness.member_no && <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>· Member {witness.member_no}</span>}
                          </div>
                          <div style={{ marginTop: 4 }}>
                            {witness.status === 'VERIFIED' ? (
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '2px 7px', borderRadius: 5 }}>🟢 Verified ✓</span>
                            ) : witness.status === 'REJECTED' || witness.status === 'DECLINED' ? (
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#991b1b', background: '#fee2e2', padding: '2px 7px', borderRadius: 5 }}>🔴 Declined</span>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#b45309', background: '#fef3c7', padding: '2px 7px', borderRadius: 5 }}>⏳ Pending Confirmation</span>
                            )}
                          </div>
                        </div>
                        {witness.phone && (
                          canIssueLink ? (
                            <button
                              type="button"
                              onClick={() => onSendWitnessLink(loan, witness, idx)}
                              disabled={witnessLinkBusy === idx}
                              className="bsm s"
                              style={{ padding: '5px 10px', fontSize: 11, background: '#25D366', borderColor: '#25D366', color: '#fff', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4, opacity: witnessLinkBusy === idx ? 0.6 : 1 }}
                            >
                              {witnessLinkBusy === idx ? 'Preparing…' : '📲 Send WhatsApp Link'}
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, color: '#92400e', maxWidth: 200, lineHeight: 1.5 }}>
                              Secure link requires a submitted request.
                            </span>
                          )
                        )}
                      </div>
                    );
                  })}
                  {witnesses.length === 0 && (
                    <div style={{ fontSize: 12, color: '#92400e' }}>No witness information was saved for this application.</div>
                  )}
                </div>
              </div>

              {/* Applicant Signature */}
              {loan.signature && (
                <div className="rv-sec">
                  <div className="rv-sec-t">Applicant Signature</div>
                  <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                    <img src={loan.signature} alt="Signature" style={{ maxHeight: 80 }} />
                  </div>
                </div>
              )}

              {/* Declaration */}
              <div className="decl-box" style={{ fontSize: 12, padding: 12, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 8 }}>
                ✅ <b>Declaration Signed</b> — This application was digitally signed by {loan.name} on {loan.submittedDate}.
              </div>

            </div>
          </div>

          {/* ══ RIGHT COLUMN – Validation & Audit Trail ══ */}
          <div
            ref={rightColRef}
            className="drawer-right-col"
            style={{
              flex: '0 0 45%', maxWidth: '45%',
              overflowY: 'auto',
              background: '#fff',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Right column sticky header */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 1,
              background: '#fff',
              padding: '14px 22px 10px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--dark)', fontFamily: "'Poppins', serif" }}>
                {isMember ? 'Loan Application Status' : 'Validation & Audit Trail'}
              </div>
            </div>

            <div style={{ padding: '20px 22px', flex: 1 }}>

              {/* Change History */}
              {!isMember && (
                <div style={{ marginBottom: 16 }}>
                  <button
                    className="bsm o"
                    style={{ fontSize: 11, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    onClick={() => void onLoadHistory(loan)}
                    disabled={historyLoading}
                  >
                    <HistoryIcon size={13} />
                    {historyLoading ? 'Loading History…' : 'View Change History'}
                  </button>
                  {historyOpen && (
                    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#64748b', marginBottom: 7 }}>Application History</div>
                      {applicationHistory.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#64748b' }}>No edits recorded. This is the original submitted application.</div>
                      ) : applicationHistory.map((version: any) => (
                        <div key={version.id} style={{ borderTop: '1px solid #e2e8f0', paddingTop: 7, marginTop: 7 }}>
                          <div style={{ fontSize: 11, fontWeight: 800 }}>Version {version.application_version} — {version.editor_role === 'applicant' ? 'Original Submission' : 'Edited by Member'}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{version.editor?.name || version.edited_by || 'Applicant'} · {new Date(version.created_at).toLocaleString()}</div>
                          {(version.changed_fields || []).map((change: any) => (
                            <div key={change.field} style={{ fontSize: 11, color: '#475569', marginTop: 2 }}><b>{change.field}</b>: {historyValue(change.previous_value)} → {historyValue(change.new_value)}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Applicant Previous Loan History */}
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 7 }}>
                  🔍 Applicant Previous Loan History
                </div>
                <div style={{ display: 'flex', gap: 7, fontSize: 12, flexWrap: 'wrap' }}>
                  <span style={{ padding: '2px 7px', background: '#fff', borderRadius: 5, border: '1px solid #cbd5e1', fontWeight: 700 }}>Total: <b>{prevLoans.length}</b></span>
                  <span style={{ padding: '2px 7px', background: '#dcfce7', color: '#166534', borderRadius: 5, fontWeight: 700 }}>Completed: <b>{completedPrev}</b></span>
                  <span style={{ padding: '2px 7px', background: '#e0f2fe', color: '#0369a1', borderRadius: 5, fontWeight: 700 }}>Active: <b>{activePrev}</b></span>
                </div>
                {hasActiveOrOverdue && (
                  <div style={{ marginTop: 9, background: '#fef2f2', border: '1px solid #fecaca', padding: '7px 10px', borderRadius: 7, color: '#991b1b', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                    ⚠ Warning: Applicant currently has an active / outstanding loan.
                  </div>
                )}
              </div>

              {/* Admin Verification Checklist */}
              {!isMember && (
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 7 }}>✅ Admin Verification Checklist</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#0f172a' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      <input type="checkbox" defaultChecked style={{ accentColor: 'var(--teal)' }} /> Membership Number Verified
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      <input type="checkbox" defaultChecked style={{ accentColor: 'var(--teal)' }} /> Applicant Identity Verified
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      <input type="checkbox" defaultChecked style={{ accentColor: 'var(--teal)' }} /> Financial &amp; Occupation Reviewed
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      <input type="checkbox" defaultChecked style={{ accentColor: 'var(--teal)' }} /> Witness / Guarantors Checked
                    </label>
                  </div>
                </div>
              )}

              {/* Member: Consensus Progress */}
              {isMember && loan.status === 'pending' && (
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 20, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', marginBottom: 10 }}>Consensus Progress</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {allAdmins.filter((a: any) => config.authorizedReviewers?.includes(a.id)).map((admin: any) => {
                      const assignedIds: string[] = loan.assignedReviewers || [];
                      const assigned = assignedIds.length === 0 || assignedIds.includes(admin.id);
                      if (!assigned) return null;
                      const approval = (loan.approvals || []).find((ap: any) => ap.id === admin.id || ap.by === admin.name);
                      const dotColor = approval?.status === 'approved' ? '#10b981' : approval?.status === 'rejected' ? '#ef4444' : '#6366f1';
                      return (
                        <div key={admin.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ position: 'relative' }}>
                            <div className="sb-av" style={{ width: 26, height: 26, fontSize: 10 }}>{admin.name[0]}</div>
                            <div style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: dotColor, border: '2px solid #fff' }}></div>
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 700 }}>{admin.name}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Admin: Committee & Consensus + Verdict */}
              {!isMember && (
                <>
                  {/* Committee */}
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 18, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Committee &amp; Consensus</div>
                      {profile?.role === 'super' && <span style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 700 }}>Click to Assign</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {allAdmins.filter((a: any) => config.authorizedReviewers?.includes(a.id)).map((admin: any) => {
                        const assignedIds: string[] = loan.assignedReviewers || [];
                        const assigned = assignedIds.length === 0 || assignedIds.includes(admin.id);
                        const approval = (loan.approvals || []).find((ap: any) => ap.id === admin.id || ap.by === admin.name);
                        const dotColor = approval?.status === 'approved' ? '#10b981' : approval?.status === 'rejected' ? '#ef4444' : assigned ? '#6366f1' : '#e2e8f0';
                        return (
                          <div
                            key={admin.id}
                            onClick={() => onToggleReviewer(admin.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 7, padding: '4px 8px', borderRadius: 8,
                              background: assigned ? '#fff' : 'transparent',
                              border: assigned ? '1.5px solid var(--teal)' : '1.5px solid transparent',
                              cursor: profile?.role === 'super' ? 'pointer' : 'default',
                              opacity: assigned || profile?.role === 'super' ? 1 : 0.4,
                              transition: 'all .2s',
                            }}
                          >
                            <div style={{ position: 'relative' }}>
                              <div className="sb-av" style={{ width: 22, height: 22, fontSize: 10 }}>{admin.name[0]}</div>
                              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: dotColor, border: '2px solid #fff' }}></div>
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 700 }}>{admin.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Not-assigned warning */}
                  {!canSign && isGlobalApprover && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: 10, marginBottom: 16, display: 'flex', gap: 9, alignItems: 'center' }}>
                      <span style={{ fontSize: 18 }}>⚠️</span>
                      <div style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>
                        You are not an assigned reviewer for this case. You can view details, but only committee members can sign.
                      </div>
                    </div>
                  )}

                  {/* Verdict */}
                  <label className="fl2" style={{ marginBottom: 8, display: 'block', fontSize: 12, fontWeight: 700 }}>Your Verdict *</label>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                    {[
                      { id: 'approved', lbl: '✅ Approve', color: '#10b981' },
                      { id: 'rejected', lbl: '❌ Reject',  color: '#ef4444' },
                      { id: 'pending',  lbl: '⏳ Pending', color: '#f59e0b' },
                    ].map(s => (
                      <label
                        key={s.id}
                        className={`radio-opt ${actionStatus === s.id ? 'sel' : ''} ${!canSign ? 'dis' : ''}`}
                        style={{
                          flex: 1, marginBottom: 0, padding: '9px 4px', textAlign: 'center',
                          borderColor: actionStatus === s.id ? s.color : '', fontSize: 10,
                          opacity: canSign ? 1 : 0.6, pointerEvents: canSign ? 'auto' : 'none',
                          cursor: canSign ? 'pointer' : 'default',
                        }}
                        onClick={() => canSign && onActionStatusChange(s.id)}
                      >
                        <input type="radio" checked={actionStatus === s.id} readOnly />
                        <div className="ro-lbl" style={{ fontWeight: 800, fontSize: 10 }}>{s.lbl}</div>
                      </label>
                    ))}
                  </div>

                  <textarea
                    className="ta2"
                    placeholder={canSign ? 'Explain your decision…' : 'Read-only view'}
                    value={actionNote}
                    readOnly={!canSign}
                    onChange={e => onActionNoteChange(e.target.value)}
                    style={{ marginBottom: 14, fontSize: 12 }}
                    rows={3}
                  />
                </>
              )}

              {/* Action History */}
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark2)', marginBottom: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                Action History
              </div>
              <div style={{ paddingLeft: 12, borderLeft: '2px solid var(--border2)' }}>
                {[...(loan.audit || [])].reverse().map((log: any, i: number) => (
                  <div key={i} style={{ marginBottom: 16, position: 'relative' }}>
                    <div style={{
                      position: 'absolute', width: 10, height: 10, borderRadius: '50%', left: -18, top: 2,
                      background: log.action === 'Approved' ? 'var(--green)' : log.action === 'Rejected' ? 'var(--red)' : log.action === 'Submitted' ? 'var(--blue)' : 'var(--amber)',
                      border: '2px solid var(--white)',
                    }}></div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)' }}>{log.action}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>By <b>{log.by}</b> · {log.date}</div>
                    {log.note && (
                      <div style={{ marginTop: 5, fontSize: 11, fontStyle: 'italic', background: 'var(--bg)', padding: '7px 10px', borderRadius: 5, color: 'var(--dark2)' }}>
                        "{log.note}"
                      </div>
                    )}
                  </div>
                ))}
              </div>

            </div>

            {/* ── STICKY ACTION FOOTER (admin only) ── */}
            {!isMember && canSign && (
              <div style={{
                position: 'sticky', bottom: 0, zIndex: 2,
                background: '#fff',
                borderTop: '1.5px solid var(--border)',
                padding: '14px 22px',
                display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
                flexShrink: 0,
              }}>
                <div style={{ flex: 1, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                  <b style={{ color: 'var(--dark2)' }}>Verdict selected:</b>{' '}
                  <span style={{
                    fontWeight: 800,
                    color: actionStatus === 'approved' ? '#10b981' : actionStatus === 'rejected' ? '#ef4444' : '#f59e0b'
                  }}>
                    {actionStatus === 'approved' ? '✅ Approve' : actionStatus === 'rejected' ? '❌ Reject' : '⏳ Pending'}
                  </span>
                </div>
                <button
                  className="bsm s"
                  style={{
                    padding: '11px 22px', fontWeight: 800, fontSize: 12,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                  onClick={onRecordSignature}
                >
                  ✍️ Record My Signature →
                </button>
              </div>
            )}

            {/* Read-only footer for non-signers */}
            {!isMember && !canSign && (
              <div style={{
                position: 'sticky', bottom: 0, zIndex: 2,
                background: '#fffbeb',
                borderTop: '1.5px solid #fcd34d',
                padding: '10px 22px',
                display: 'flex', alignItems: 'center', gap: 8,
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 16 }}>🔒</span>
                <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>
                  Signature Restricted — you are not an assigned reviewer for this case.
                </span>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Responsive CSS ── */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          [role="dialog"] {
            transition: none !important;
          }
          [role="dialog"] + div {
            transition: none !important;
          }
        }

        /* Laptop: 1024–1279px */
        @media (max-width: 1279px) {
          [role="dialog"] {
            width: 92vw !important;
          }
          .drawer-left-col  { flex: 0 0 54% !important; max-width: 54% !important; }
          .drawer-right-col { flex: 0 0 46% !important; max-width: 46% !important; }
        }

        /* Tablet: 768–1023px — stacked */
        @media (max-width: 1023px) {
          [role="dialog"] {
            width: 96vw !important;
            border-radius: 12px 0 0 12px !important;
          }
          .drawer-body-cols {
            flex-direction: column !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }
          .drawer-left-col,
          .drawer-right-col {
            flex: none !important;
            max-width: 100% !important;
            overflow-y: visible !important;
            border-right: none !important;
          }
          .drawer-left-col {
            border-bottom: 2px solid var(--border) !important;
          }
        }

        /* Mobile: < 768px — full screen */
        @media (max-width: 767px) {
          [role="dialog"] {
            width: 100vw !important;
            height: 100dvh !important;
            border-radius: 0 !important;
          }
          .drawer-body-cols {
            -webkit-overflow-scrolling: touch;
          }
        }

        @media print {
          [role="dialog"] {
            position: static !important;
            width: 100% !important;
            height: auto !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          .drawer-right-col { display: none !important; }
          .drawer-left-col {
            flex: none !important;
            max-width: 100% !important;
            border: none !important;
            overflow: visible !important;
          }
        }
      `}</style>
    </>
  );
}

