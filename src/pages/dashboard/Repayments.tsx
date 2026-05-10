import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { localDb } from '../../lib/localDb';

/* ─── Helpers ─── */
const fmt = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateShort = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

function statusFor(r: any): 'paid' | 'under_review' | 'partial' | 'rejected' | 'late' | 'upcoming' {
  if (r.paid || r.request?.status === 'approved') return 'paid';
  if (r.request?.status === 'pending') return 'under_review';
  if (r.request?.status === 'partially_approved') return 'partial';
  if (r.request?.status === 'rejected') return 'rejected';
  if (r.due && new Date(r.due) < new Date()) return 'late';
  return 'upcoming';
}
const STATUS_BG: Record<string, string> = {
  paid: 'var(--green)', under_review: 'var(--amber)', partial: '#6366f1', rejected: 'var(--red)', late: 'var(--red)', upcoming: '#e2e8f0'
};
const STATUS_LABEL: Record<string, string> = {
  paid: 'Verified', under_review: 'Reviewing', partial: 'Partial OK', rejected: 'Rejected', late: 'Overdue', upcoming: 'Upcoming'
};

type SubmitForm = {
  amt: string; payDate: string; mode: string; ref: string; memberNote: string; proof: string;
  isFullClearance?: boolean;
};
const BLANK_FORM: SubmitForm = {
  amt: '', payDate: new Date().toISOString().split('T')[0], mode: 'UPI', ref: '', memberNote: '', proof: '',
  isFullClearance: false
};

/* ═══════════════════════════════════════════════════════════════ */
export default function Repayments() {
  const { profile } = useAuth();
  const role = profile?.role || 'member';
  const isMember = role === 'member';
  const isAdmin = role === 'admin' || role === 'super';
  const [loans, setLoans] = useState<any[]>(() => localDb.getLoans());
  const [search, setSearch] = useState('');
  const [adminTab, setAdminTab] = useState<'queue' | 'schedules' | 'manual'>('queue');
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  /* modals */
  const [submitModal, setSubmitModal] = useState<{ loan: any; idx: number; edit?: boolean } | null>(null);
  const [historyModal, setHistoryModal] = useState<{ loan: any } | null>(null);
  const [recordPaymentModal, setRecordPaymentModal] = useState<{ loan: any } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ loan: any; idx: number } | null>(null);
  const [selectedLoans, setSelectedLoans] = useState<string[]>([]);
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([]);
  // All admins (for committee display)
  const allAdmins = localDb.getUsers().filter((u: any) => u.role === 'admin');
  const config = localDb.getPortalConfig();

  /* submit form */
  const [form, setForm] = useState<SubmitForm>({ ...BLANK_FORM });
  const [lightbox, setLightbox] = useState<string | null>(null);
  const upd = (k: keyof SubmitForm, v: any) => setForm(p => ({ ...p, [k]: v }));

  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    const loanId = params.get('loanId');
    const idx = params.get('idx');

    if (action === 'pay' && loanId && idx !== null) {
      const loan = loans.find(l => l.id === loanId);
      if (loan) {
        openSubmit(loan, parseInt(idx));
        // Clear params to avoid reopening on refresh
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [location, loans]);

  /* review modal */
  const [showReview, setShowReview] = useState(false);
  const [selectedReview, setSelectedReview] = useState<{loan:any, idx:number} | null>(null);
  const [actionStatus, setActionStatus] = useState('pending');
  const [actionNote, setActionNote] = useState('');

  /* admin verify */
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* admin manual */
  const [mfInst, setMfInst] = useState('');
  const [mfAmt, setMfAmt] = useState(''); 
  const [mfDate, setMfDate] = useState(new Date().toISOString().split('T')[0]);
  const [mfMode, setMfMode] = useState('Cash'); 
  const [mfRef, setMfRef] = useState('');
  const [mfProof, setMfProof] = useState('');
  const [toast, setToast] = useState<{ m: string; t: 's' | 'r' } | null>(null);
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [lastAction] = useState<{ id: string; type: 'approved' | 'rejected' } | null>(null);

  const refresh = () => {
    localDb.healCorruptedLoanData();
    const fresh = localDb.getLoans();
    console.log('Refreshing Repayments Data:', fresh.length, 'loans found');
    setLoans([...fresh]);
  };

  /* filtered loans: Already scoped by backend API */
  const activeLoan = loans.filter((l: any) => {
    if (!['approved', 'completed'].includes(l.status)) return false;
    const q = search.toLowerCase();
    const matchSearch = !q ||
                       (l.name || '').toLowerCase().includes(q) || 
                       (l.id || '').toLowerCase().includes(q) ||
                       String(l.amt).includes(q);
    return matchSearch;
  });

  /* admin pending queue + recently reviewed */
  /* ─── UNIFIED PIPELINE ENGINE ─── */
  const unifiedPipeline = loans.flatMap((loan: any) =>
    (loan.repayments || []).map((r: any, idx: number) => ({ loan, r, idx }))
      .filter(({ loan, r }) => {
        const status = r.request?.status;
        const isAwaiting = status === 'pending' || status === 'partially_approved';
        const isReviewed = status === 'approved' || status === 'rejected';
        
        // Filter by status
        if (pipelineFilter === 'pending') { if (!isAwaiting) return false; }
        else if (pipelineFilter === 'approved') { if (status !== 'approved') return false; }
        else if (pipelineFilter === 'rejected') { if (status !== 'rejected') return false; }
        else { if (!isAwaiting && !isReviewed) return false; }

        // Filter by branch (Role-based access)
        const lBranch = (loan.branch || '').trim().toLowerCase();
        const pBranch = (profile?.branch || '').trim().toLowerCase();
        const matchBranch = role === 'super' || lBranch === pBranch || !lBranch || !pBranch;
        if (!matchBranch) return false;

        // Filter by search
        const q = search.toLowerCase();
        if (!q) return true;
        return (loan.name || '').toLowerCase().includes(q) || 
               (loan.id || '').toLowerCase().includes(q) || 
               (r.request?.ref || '').toLowerCase().includes(q) ||
               String(r.request?.amt || '').includes(q);
      })
  ).sort((a, b) => {
    // Sort logic: Pending first, then by date
    const aStat = a.r.request?.status;
    const bStat = b.r.request?.status;
    const isAPen = aStat === 'pending' || aStat === 'partially_approved';
    const isBPen = bStat === 'pending' || bStat === 'partially_approved';
    if (isAPen && !isBPen) return -1;
    if (!isAPen && isBPen) return 1;
    return new Date(b.r.request?.reviewedAt || b.r.request?.submittedAt || 0).getTime() - 
           new Date(a.r.request?.reviewedAt || a.r.request?.submittedAt || 0).getTime();
  });

  const getSigningColor = (count: number, total: number) => {
    if (count === 0) return '#94a3b8'; // Grey
    if (count >= total) return '#10b981'; // Green
    if (total === 3 && count === 1) return '#ef4444'; // 1/3 red
    if (total === 3 && count === 2) return '#f59e0b'; // 2/3 yellow
    if (total === 2 && count === 1) return '#f59e0b'; // 1/2 yellow
    return '#f59e0b'; // Default yellow for partials
  };

  // Pipeline stats for Super Admin widget
  const allGlobalRepayments = loans.flatMap((loan: any) =>
    (loan.repayments || []).map((r: any, idx: number) => ({ loan, r, idx }))
  );
  
  const allPending = allGlobalRepayments.filter(({ r }) => r.request?.status === 'pending' || r.request?.status === 'partially_approved');
  const allPartial = allGlobalRepayments.filter(({ r }) => r.request?.status === 'partially_approved');
  
  const thisWeekStart = new Date(); thisWeekStart.setDate(thisWeekStart.getDate() - 7);
  const totalApproved = allGlobalRepayments.filter(({ r }) => r.paid || r.request?.status === 'approved').length;
  const totalRejected = allGlobalRepayments.filter(({ r }) => r.request?.status === 'rejected').length;
  const approvedThisWeek = allGlobalRepayments.filter(({ r }) => (r.paid || r.request?.status === 'approved') && new Date(r.paid || r.request?.reviewedAt || 0) > thisWeekStart).length;
  const rejectedThisWeek = allGlobalRepayments.filter(({ r }) => r.request?.status === 'rejected' && new Date(r.request?.reviewedAt || 0) > thisWeekStart).length;

  // Bottleneck detection: authorized reviewers with pending assignments older than 3 days
  const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const bottleneckAdmins = allAdmins.filter((admin: any) => {
    if (!config.authorizedReviewers?.includes(admin.id)) return false;
    return allPending.some((r: any) => {
      const assigned = r.request?.assignedReviewers || [];
      const hasActed = (r.request?.approvals || []).some((a: any) => a.id === admin.id || a.by === admin.name);
      const isOld = new Date(r.request?.submittedAt || 0) < threeDaysAgo;
      return (assigned.length === 0 || assigned.includes(admin.id)) && !hasActed && isOld;
    });
  });


  /* proof upload */
  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const max = 1200;
          if (width > height) { if (width > max) { height *= max / width; width = max; } }
          else { if (height > max) { width *= max / height; height = max; } }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          upd('proof', compressed);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(f);
    }
  };

  const openSubmit = (loan: any, idx: number, edit = false) => {
    const r = loan.repayments[idx];
    if (edit && r.request) {
      setForm({ amt: r.request.amt || String(r.amt), payDate: r.request.payDate || new Date().toISOString().split('T')[0], mode: r.request.mode || 'UPI', ref: r.request.ref || '', memberNote: r.request.memberNote || '', proof: r.request.proof || '' });
    } else {
      setForm({ ...BLANK_FORM, amt: String(r.amt) });
    }
    setSubmitModal({ loan, idx, edit });
  };

  const handleSubmit = async () => {
    // Validation with feedback
    if (!form.amt) { setToast({ m: 'Please enter the transfer amount.', t: 'r' }); return; }
    if (form.mode !== 'Cash' && !form.ref) { setToast({ m: 'Please enter the transaction Reference ID or linked number.', t: 'r' }); return; }

    setIsSubmitting(true);
    await new Promise(r => setTimeout(r, 800));
    
    // Pass isFullClearance to DB
    const data = { 
      ...form, 
      notes: `${form.isFullClearance ? 'FULL CLEARANCE | ' : ''}Mode: ${form.mode}|Ref: ${form.ref}|Date: ${form.payDate}|Amt: ${form.amt}` 
    };
    if (submitModal.edit) {
      localDb.editRepaymentRequest(submitModal.loan.id, submitModal.idx, data);
    } else {
      localDb.submitRepaymentRequest(submitModal.loan.id, submitModal.idx, data);
    }
    refresh();
    setIsSubmitting(false);
    const wasEdit = submitModal.edit;
    setSubmitModal(null);
    setToast({ m: wasEdit ? 'Submission updated successfully!' : 'Repayment submitted for approval!', t: 's' });
    setTimeout(() => setToast(null), 3000);
  };


  const downloadCompletionCertificate = (loan: any) => {
    const total = loan.amt;
    const date = new Date().toLocaleDateString('en-GB');
    const svg = `
      <svg width="600" height="400" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#fff"/>
        <rect x="20" y="20" width="560" height="360" fill="none" stroke="#0d7377" stroke-width="5"/>
        <rect x="30" y="30" width="540" height="340" fill="none" stroke="#14b8a6" stroke-width="1"/>
        <text x="300" y="80" text-anchor="middle" font-family="serif" font-size="32" font-weight="900" fill="#0d7377">NO DUES CERTIFICATE</text>
        <text x="300" y="110" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#64748b">SKSSF Interest-Free Loan Scheme</text>
        <text x="300" y="160" text-anchor="middle" font-family="serif" font-size="18" fill="#1e293b">This is to certify that</text>
        <text x="300" y="200" text-anchor="middle" font-family="serif" font-size="28" font-weight="900" fill="#14b8a6">${loan.name}</text>
        <text x="300" y="240" text-anchor="middle" font-family="serif" font-size="16" fill="#1e293b">has fully repaid the loan amount of</text>
        <text x="300" y="275" text-anchor="middle" font-family="serif" font-size="24" font-weight="900" fill="#1e293b">₹ ${total.toLocaleString()}</text>
        <text x="300" y="310" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#64748b">Loan ID: ${loan.id} · Purpose: ${loan.purpose}</text>
        <text x="40" y="360" font-family="sans-serif" font-size="10" fill="#94a3b8">Date: ${date}</text>
        <text x="560" y="360" text-anchor="end" font-family="sans-serif" font-size="10" fill="#94a3b8">Authorized by SKSSF Central Committee</text>
      </svg>
    `;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SKSSF_Certificate_${loan.id}.svg`;
    a.click();
  };




  /* ─── Member loan card (Premium) ─── */
  const MemberLoanCard = ({ loan }: { loan: any }) => {
    const reps: any[] = loan.repayments || [];
    const paidAmt = loan.total_paid ?? reps.reduce((s, r) => s + ((r.paid || r.request?.status === 'approved') ? (Number(r.paid_amount || r.request?.amt) || r.amt) : 0), 0);
    const paidCount = reps.filter(r => r.paid || r.request?.status === 'approved').length;
    const remaining = loan.remaining_balance ?? (loan.amt - paidAmt);
    const prog = loan.amt > 0 ? Math.min((paidAmt / loan.amt) * 100, 100) : 0;
    const isCompleted = (loan.status === 'completed' || reps.every(r => r.paid || r.request?.status === 'approved')) && remaining <= 0;
 
    const underReviewIdx = reps.findIndex(r => r.request?.status === 'pending' || r.request?.status === 'partially_approved');
    const rejectedIdx = reps.findIndex(r => r.request?.status === 'rejected' && !r.paid);
    const underReview = underReviewIdx > -1 ? reps[underReviewIdx] : null;
    const rejected = rejectedIdx > -1 ? reps[rejectedIdx] : null;
    const availableIdx = reps.findIndex(r => !r.paid && !['pending', 'partially_approved', 'rejected'].includes(r.request?.status || ''));
 
    return (
      <div className="fu" style={{ marginBottom: 30 }}>
        {/* 🏆 Completion Banner */}
        {isCompleted && (
          <div className="cb-banner-v2" style={{
            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', borderRadius: 20, padding: '32px', textAlign: 'center', color: '#fff',
            marginBottom: 20, position: 'relative', overflow: 'hidden', boxShadow: '0 10px 30px rgba(16, 185, 129, 0.2)'
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏁</div>
            <div style={{ fontWeight: 900, fontSize: 28, fontFamily: 'Playfair Display, serif' }}>Loan Fully Repaid!</div>
            <div style={{ fontSize: 13, opacity: .85, marginTop: 4 }}>{loan.id} — {loan.purpose} · Congratulations on completing your loan!</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 24, flexWrap: 'wrap' }}>
              <div><div style={{ fontWeight: 800, fontSize: 20 }}>{fmt(loan.amt)}</div><div style={{ fontSize: 11, opacity: .7 }}>Total Repaid</div></div>
              <div><div style={{ fontWeight: 800, fontSize: 20 }}>{reps.length}</div><div style={{ fontSize: 11, opacity: .7 }}>Installments</div></div>
              <button 
                onClick={() => downloadCompletionCertificate(loan)}
                style={{
                  background: 'rgba(255,255,255,0.2)', border: '1.5px solid #fff', color: '#fff',
                  padding: '8px 20px', borderRadius: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer'
                }}
              >
                📜 Download Completion Certificate
              </button>
            </div>
          </div>
        )}
 
        <div className="rp-card-v2" style={{ background: '#fff', borderRadius: 24, border: '1.5px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
          {/* Header section (Gradient) */}
          <div style={{ background: 'linear-gradient(135deg, #0d7377 0%, #14b8a6 100%)', padding: '28px 24px', position: 'relative', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: .8, textTransform: 'uppercase', letterSpacing: 1 }}>{loan.id}</div>
                <div style={{ fontSize: 24, fontWeight: 900, fontFamily: 'Playfair Display, serif', marginTop: 4 }}>{loan.name || profile?.name}</div>
                <div style={{ fontSize: 14, opacity: .9, marginTop: 2 }}>{loan.purpose} · {loan.branch}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: .8 }}>TOTAL LOAN</div>
                <div style={{ fontSize: 32, fontWeight: 900, fontFamily: 'Playfair Display, serif' }}>{fmt(loan.amt)}</div>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8, fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{fmt(paidAmt)} repaid</span>
                  {reps.some(r => r.paid && (Number(r.request?.amt) || r.amt) < r.amt) && (
                    <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.4)' }}>⚠️ Partial Payments Detected</span>
                  )}
                </div>
                <span>{fmt(remaining)} left</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,.2)', height: 8, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ width: `${prog}%`, height: '100%', background: '#fff', borderRadius: 10, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
                <span>{Math.round(prog)}% complete</span>
                <span>{paidCount} of {reps.length} EMIs Settled</span>
              </div>
            </div>
          </div>
 
          {/* Stats Summary Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1.5px solid #f1f5f9', background: '#fff' }}>
            {[
              [fmt(paidAmt), 'Total Paid', 'var(--teal)'],
              [fmt(remaining), 'Remaining', remaining > 0 ? 'var(--amber2)' : 'var(--green)'],
              [fmt(reps[0]?.amt || 0), 'Monthly EMI', '#1e293b'],
            ].map(([val, lbl, color], idx) => (
              <div key={idx} style={{ padding: '20px', textAlign: 'center', borderRight: idx < 2 ? '1.5px solid #f1f5f9' : 'none' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: color as string }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginTop: 4 }}>{lbl}</div>
              </div>
            ))}
          </div>
 
          {/* Center Hub Section: Unified Status Center */}
          <div style={{ padding: '24px' }}>
            {lastAction && lastAction.id === loan.id && lastAction.type === 'approved' ? (
               <div style={{ 
                 background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', 
                 border: '1.5px solid #bbf7d0', borderRadius: 20, padding: '24px', 
                 textAlign: 'center', animation: 'pulse 2s infinite'
               }}>
                 <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                 <div style={{ fontWeight: 900, fontSize: 17, color: '#166534' }}>Repayment Approved!</div>
                 <div style={{ fontSize: 12, color: '#15803d', marginTop: 4 }}>Your installment has been successfully recorded.</div>
               </div>
            ) : underReview ? (() => {
                const req = underReview.request || {};
                const approvals = req.approvals || [];
                const assignedIds = req.assignedReviewers || [];
                const pool = allAdmins.filter((a: any) => config.authorizedReviewers?.includes(a.id));
                const activePool = assignedIds.length > 0 ? pool.filter((a: any) => assignedIds.includes(a.id)) : pool;
                const approvedCount = approvals.filter((a: any) => a.status === 'approved').length;
                const threshold = config.repaymentApprovalsNeeded || 1;
 
                return (
                  <div style={{ 
                    background: 'linear-gradient(135deg,rgba(59,130,246,.08),rgba(37,99,235,.05))', 
                    border: '1.5px solid rgba(59,130,246,.15)', borderRadius: 24, padding: '24px', 
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(59,130,246,.1)' }}>
                          <span style={{ fontSize: 24 }}>⏳</span>
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 13, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Consensus in Progress</div>
                          <div style={{ fontWeight: 800, fontSize: 17, color: '#1e293b', marginTop: 2 }}>Installment #{underReviewIdx + 1} · {fmt(Number(req.amt) || underReview.amt)}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Waiting for committee approval ({approvedCount}/{threshold} signed)</div>
                        </div>
                      </div>
                      <button className="bsm o" style={{ background: '#fff' }} onClick={() => openSubmit(loan, underReviewIdx, true)}>Edit Proof ✏️</button>
                    </div>
 
                    <div style={{ background: '#fff', borderRadius: 16, padding: '12px 16px', border: '1px solid rgba(59,130,246,0.1)' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>Reviewer Status</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        {activePool.map((admin: any) => {
                          const approval = approvals.find((a: any) => a.id === admin.id || a.by === admin.name);
                          const dotColor = approval?.status === 'approved' ? '#10b981' : approval?.status === 'rejected' ? '#ef4444' : '#6366f1';
                          return (
                            <div key={admin.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ position: 'relative' }}>
                                <div className="sb-av" style={{ width: 28, height: 28, fontSize: 11 }}>
                                  {admin.avatar ? <img src={admin.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} /> : admin.name[0]}
                                </div>
                                <div style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: dotColor, border: '2px solid #fff' }}></div>
                              </div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>{admin.name}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()
             : rejected ? (
               <div style={{ 
                 background: 'linear-gradient(135deg,#fef2f2,#fff1f2)', 
                 border: '1.5px solid #fecaca', borderRadius: 20, padding: '24px', 
                 display: 'flex', alignItems: 'center', justifyContent: 'space-between'
               }}>
                 <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                   <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(239,68,68,.1)' }}>
                     <span style={{ fontSize: 24 }}>❌</span>
                   </div>
                   <div>
                     <div style={{ fontWeight: 800, fontSize: 13, color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Repayment Rejected</div>
                     <div style={{ fontWeight: 800, fontSize: 17, color: '#1e293b', marginTop: 2 }}>Installment #{rejectedIdx + 1}</div>
                     <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>Reason: {rejected.request?.adminNotes || 'Please check notes and resubmit.'}</div>
                   </div>
                 </div>
                 <button className="bsm r" onClick={() => openSubmit(loan, rejectedIdx, true)}>Resubmit Now 🔄</button>
               </div>
            ) : null}
 
            {/* Sub-Actions */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 10 }}>
               <button className="bsm g" style={{ background: 'transparent', border: 'none', color: '#64748b', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} 
                 onClick={() => setHistoryModal({ loan })}>
                 <span>📜</span> View Full Repayment History
               </button>
            </div>
          </div>
 
          {/* 🗺️ Installment Timeline Visual */}
          <div style={{ background: '#f8fafc', padding: '32px 28px', borderTop: '1.5px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
               <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>Installment Timeline</h3>
               <span style={{ fontSize: 12, color: '#64748b' }}>Click steps for details</span>
            </div>
 
            <div className="timeline-wrapper" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '0 10px' }}>
              <div className="timeline-line" style={{ position: 'absolute', top: 18, left: 30, right: 30, height: 3, background: '#e2e8f0', zIndex: 0 }} />
              
              {reps.map((r, i) => {
                const s = statusFor(r);
                const isActive = availableIdx === i;
                return (
                  <div key={i} className="timeline-step" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, cursor: 'pointer' }}
                    onClick={() => openSubmit(loan, i, s === 'under_review')}
                  >
                    {/* Step Bubble */}
                    <div className="timeline-bubble" style={{
                      width: 38, height: 38, borderRadius: '50%', background: STATUS_BG[s], color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900,
                      boxShadow: isActive ? '0 0 0 6px rgba(20, 184, 166, 0.15)' : '0 0 0 4px #fff',
                      transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                    }}>
                      {s === 'paid' ? '✓' : s === 'under_review' ? '⏳' : i + 1}
                    </div>
 
                    {/* Step Card */}
                    <div className="timeline-card" style={{ 
                      marginTop: 14, padding: '12px 8px', borderRadius: 16, width: '90%', background: '#fff', 
                      border: '1.5px solid', borderColor: isActive ? 'var(--teal)' : '#e2e8f0',
                      textAlign: 'center', boxShadow: isActive ? '0 4px 15px rgba(13, 115, 119, 0.08)' : 'none',
                      transition: 'all .2s'
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>EMI #{i + 1}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: STATUS_BG[s] === '#e2e8f0' ? '#1e293b' : STATUS_BG[s] }}>
                        {s === 'paid' ? fmt(Number(r.request?.amt) || r.amt) : fmt(r.amt)}
                      </div>
                      
                      {s === 'paid' && (Number(r.request?.amt) || r.amt) < r.amt && (
                        <div style={{ fontSize: 8, fontWeight: 900, color: 'var(--amber2)', marginTop: 2 }}>⚠️ PARTIAL</div>
                      )}

                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{fmtDateShort(r.due)}</div>
                      
                      <div style={{ 
                        marginTop: 8, padding: '4px 8px', borderRadius: 20, fontSize: 9, fontWeight: 800, display: 'inline-block',
                        background: STATUS_BG[s] === '#e2e8f0' ? '#f1f5f9' : (STATUS_BG[s] + '15'),
                        color: STATUS_BG[s] === '#e2e8f0' ? '#64748b' : STATUS_BG[s]
                      }}>
                        {STATUS_LABEL[s].toUpperCase()}
                      </div>
 
                      {s === 'paid' && (
                        <div style={{ fontSize: 9, color: '#64748b', marginTop: 6, opacity: 0.8 }}>
                          {r.paid_date}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ─── Admin queue item ─── */
  const QueueItem = ({ loan, r, idx, reviewed }: { loan: any; r: any; idx: number; reviewed?: boolean }) => {
    const [expanded, setExpanded] = useState(false);
    const req = r.request || {};
    const approvals = req.approvals || [];
    const assignedIds = req.assignedReviewers || [];
    const approvedCount = approvals.filter((a: any) => a.status === 'approved').length;
    const threshold = config.repaymentApprovalsNeeded || 1;
    const initials = (loan.name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

    const s = req.status === 'approved' ? 'approved' : req.status === 'rejected' ? 'rejected' : 'pending';
    const dateText = reviewed ? (req.reviewedAt ? fmtDate(req.reviewedAt.split('T')[0]) : '—') : (req.submittedAt ? fmtDate(req.submittedAt.split('T')[0]) : '—');
    const balance = loan.amt - (loan.repayments || []).reduce((acc: any, x: any) => acc + (x.paid ? x.amt : 0), 0);

    return (
      <div className={`aq-card ${reviewed ? s : ''}`} style={{ marginBottom: 12, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 16, overflow: 'hidden', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        {/* Summarized Row (Full Clickable Row) */}
        <div 
          className="aq-row-hover"
          style={{ 
            padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
            cursor: 'pointer', background: expanded ? '#f8fafc' : '#fff',
            transition: 'background 0.2s'
          }} 
          onClick={() => setExpanded(!expanded)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
             <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--teal)', color: '#fff', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, boxShadow: '0 4px 10px rgba(13,115,119,0.1)' }}>{initials}</div>
             <div>
                <div style={{ fontWeight: 950, fontSize: 15, color: '#0f172a' }}>{loan.name}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800 }}>{loan.id} · EMI #{idx + 1}</div>
             </div>
          </div>

          <div className="aq-row-resp" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
             <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>Amount</div>
                <div style={{ fontWeight: 950, fontSize: 15, color: (!r.paid && (req.amt === '0' || req.amt === 0)) ? 'var(--red)' : 'var(--teal)' }}>
                  {(!r.paid && (req.amt === '0' || req.amt === 0)) ? '⚠️ MISSING' : fmt(Number(req.amt || r.paid_amount || r.amt || 0))}
                </div>
             </div>

             <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 950, color: getSigningColor(approvedCount, threshold), background: getSigningColor(approvedCount, threshold) + '15', padding: '4px 12px', borderRadius: 20 }}>
                   {r.request ? `${approvedCount}/${threshold} Signed` : 'Manual'}
                </div>
                <div style={{ marginTop: 2, fontWeight: 950, fontSize: 11, color: r.paid ? '#10b981' : req.status === 'approved' ? '#10b981' : req.status === 'rejected' ? '#ef4444' : '#f59e0b' }}>
                   {r.paid ? '✅ Verified' : req.status === 'approved' ? `✅ Approved` : '⏳ In Review'}
                </div>
             </div>

             <div style={{ textAlign: 'right', minWidth: 100 }} className="aq-actions-resp">
                <div style={{ fontWeight: 800, fontSize: 13, color: '#1e293b' }}>{dateText}</div>
                <button 
                  style={{ 
                    border: 'none', background: 'rgba(20,184,166,0.1)', color: 'var(--teal)', 
                    fontSize: 10, fontWeight: 900, padding: '4px 12px', borderRadius: 8, 
                    marginTop: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    marginLeft: 'auto'
                  }}
                >
                  {expanded ? 'CLOSE ▲' : 'DETAILS ▼'}
                </button>
             </div>
          </div>
        </div>

        {/* Expanded View */}
        {expanded && (() => {
          const reps = loan.repayments || [];
          const availableIdx = reps.findIndex((rx: any) => !rx.paid && !rx.request);
          return (
            <div style={{ padding: '0 24px 24px', borderTop: '1px solid #f1f5f9', animation: 'fadeUp 0.3s ease' }}>
              {/* 1. Loan Summary Bar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: 20, marginTop: 20, overflow: 'hidden' }}>
                {[
                  [fmt(loan.amt - balance), 'Total Paid', 'var(--teal)'],
                  [fmt(balance), 'Remaining', balance > 0 ? 'var(--amber2)' : 'var(--green)'],
                  [fmt(reps[0]?.amt || 0), 'Monthly EMI', '#1e293b'],
                ].map(([val, lbl, color], idx) => (
                  <div key={idx} style={{ padding: '16px 12px', textAlign: 'center', borderRight: idx < 2 ? '1.5px solid #f1f5f9' : 'none' }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: color as string }}>{val}</div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginTop: 2 }}>{lbl}</div>
                  </div>
                ))}
              </div>

              {/* 2. Full Repayment History Link */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                <button className="bsm g" style={{ background: 'transparent', border: 'none', color: '#64748b', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }} 
                  onClick={(e) => { e.stopPropagation(); setHistoryModal({ loan }); }}>
                  <span>📜</span> View Full Repayment History
                </button>
              </div>

              {/* 3. Installment Timeline */}
              <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>Installment Timeline</div>
                  <span style={{ fontSize: 10, color: '#64748b' }}>Click steps for details</span>
                </div>
                
                <div style={{ position: 'relative', display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 15 }}>
                  {reps.map((rx: any, i: number) => {
                    const sx = statusFor(rx);
                    const isTarget = idx === i;
                    const clr = STATUS_BG[sx];
                    
                    return (
                      <div key={i} style={{ flex: '0 0 140px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                        {i < reps.length - 1 && <div style={{ position: 'absolute', top: 13, left: '70%', width: '100%', height: 2, background: '#e2e8f0', zIndex: 0 }} />}
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', background: clr, color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900,
                          boxShadow: isTarget ? `0 0 0 5px ${clr}20` : '0 0 0 3px #fff', zIndex: 1, position: 'relative'
                        }}>
                          {sx === 'paid' ? '✓' : i + 1}
                        </div>

                        <div style={{ 
                          marginTop: 12, padding: '10px 8px', borderRadius: 14, width: '100%', background: '#fff', 
                          border: `1.5px solid ${isTarget ? 'var(--teal)' : '#e2e8f0'}`,
                          textAlign: 'center', boxShadow: isTarget ? '0 4px 12px rgba(13,115,119,0.06)' : 'none'
                        }}>
                          <div style={{ fontSize: 8, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>EMI #{i + 1}</div>
                          <div style={{ fontSize: 13, fontWeight: 950, color: clr === '#e2e8f0' ? '#1e293b' : clr }}>{fmt(rx.amt)}</div>
                          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>{fmtDateShort(rx.due)}</div>
                          <div style={{ 
                            marginTop: 6, padding: '3px 8px', borderRadius: 20, fontSize: 8, fontWeight: 900, display: 'inline-block',
                            background: clr === '#e2e8f0' ? '#f1f5f9' : `${clr}15`,
                            color: clr === '#e2e8f0' ? '#64748b' : clr
                          }}>
                            {STATUS_LABEL[sx].toUpperCase()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {req.proof && (
                <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '14px 20px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 18 }}>📎</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>payment_proof.jpg</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Digital payment proof attached</div>
                    </div>
                  </div>
                  <button className="bsm o" style={{ borderRadius: 10, fontSize: 11, padding: '8px 16px' }} onClick={(e) => { e.stopPropagation(); setLightbox(req.proof); }}>🔍 View Proof</button>
                </div>
              )}

              {r.request && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#64748b', marginBottom: 10 }}>VERIFICATION SUMMARY</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {approvals.map((ap: any, i: number) => (
                      <div key={i} style={{ background: ap.status === 'approved' ? '#f0fdfa' : '#fef2f2', border: `1px solid ${ap.status === 'approved' ? '#ccfbf1' : '#fee2e2'}`, padding: '6px 14px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                         <div style={{ fontSize: 12 }}>{ap.status === 'approved' ? '✅' : '⏳'}</div>
                         <div style={{ fontSize: 10, fontWeight: 800, color: ap.status === 'approved' ? '#065f46' : '#991b1b' }}>{ap.by}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!reviewed && !isMember && (
                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                   <button className="bsm s" style={{ padding: '12px 24px', fontSize: 14, fontWeight: 900, borderRadius: 12 }} onClick={(e) => { e.stopPropagation(); setSelectedReview({loan, idx}); setShowReview(true); setActionStatus('approved'); setActionNote(''); }}>Proceed to Audit →</button>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  /* ─── Main render ─── */
  return (
    <>
      {/* ════════════════ HEADER SECTION ════════════════ */}
      <div className="section-head" style={{ marginBottom: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h1 className="title" style={{ margin: 0 }}>Repayment Portal</h1>
            <div style={{
              background: 'rgba(20,184,166,0.1)', color: 'var(--teal)', fontSize: 10, fontWeight: 900,
              padding: '4px 10px', borderRadius: 20, letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: 6
            }}>
              <span style={{ width: 6, height: 6, background: 'var(--teal)', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
              LIVE STATUS ACROSS BRANCHES
            </div>
          </div>
          <p className="subtitle" style={{ margin: 0 }}>Monitor and verify loan recoveries in real-time</p>
        </div>
      </div>
 
      {/* ═════════════════════ MEMBER VIEW ═════════════════════ */}
      {isMember && (
        <>
          {/* ─── SMART STATUS BANNERS ─── */}
          {(() => {
            // Detect overdue EMIs
            const overdueEMIs = activeLoan.flatMap(l =>
              (l.repayments || []).map((r: any, i: number) => ({ loan: l, r, i }))
                .filter(({ r }: { r: any }) => !r.paid && !r.request && r.due && new Date(r.due) < new Date())
            );
            // Detect pending review
            const pendingReqs = activeLoan.flatMap(l =>
              (l.repayments || []).map((r: any, i: number) => ({ loan: l, r, i }))
                .filter(({ r }: { r: any }) => r.request?.status === 'pending')
            );
            // Detect rejected
            const rejectedReqs = activeLoan.flatMap(l =>
              (l.repayments || []).map((r: any, i: number) => ({ loan: l, r, i }))
                .filter(({ r }: { r: any }) => r.request?.status === 'rejected' && !r.paid)
            );
            // Next due EMI
            const upcomingEMI = activeLoan.flatMap(l =>
              (l.repayments || []).map((r: any, i: number) => ({ loan: l, r, i }))
                .filter(({ r }: { r: any }) => !r.paid && !r.request && r.due && new Date(r.due) >= new Date())
            ).sort((a, b) => new Date(a.r.due).getTime() - new Date(b.r.due).getTime())[0];
 
            return (
              <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 🔴 Overdue Alert */}
                {overdueEMIs.length > 0 && (
                  <div style={{
                    background: 'linear-gradient(135deg, #fef2f2, #fff1f2)',
                    border: '1.5px solid #fecaca', borderRadius: 16, padding: '14px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: '0 4px 15px rgba(239,68,68,0.1)'
                  }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🚨</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#991b1b' }}>
                          {overdueEMIs.length} Overdue Installment{overdueEMIs.length > 1 ? 's' : ''} — Action Required
                        </div>
                        <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 2 }}>
                          {overdueEMIs.map(({ loan, i }) => `${loan.id} EMI #${i + 1}`).join(' · ')}
                        </div>
                      </div>
                    </div>
                    <button className="bsm r" onClick={() => openSubmit(overdueEMIs[0].loan, overdueEMIs[0].i)}>Submit Now</button>
                  </div>
                )}
 
                {/* ⏳ Pending Review */}
                {pendingReqs.map(({ loan, r, i }) => {
                  const req = r.request || {};
                  const approvals = req.approvals || [];
                  const threshold = config.repaymentApprovalsNeeded || 1;
                  const approvedCount = approvals.filter((a: any) => a.status === 'approved').length;
 
                  return (
                    <div key={`pending-${loan.id}-${i}`} style={{
                      background: 'linear-gradient(135deg, #fffbeb, #fefce8)',
                      border: '1.5px solid #fde68a', borderRadius: 20, overflow: 'hidden'
                    }}>
                      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(251,191,36,0.2)' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>⏳</div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 13, color: '#92400e' }}>
                              Submission Under Review ({approvedCount}/{threshold} Signed)
                            </div>
                            <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>EMI #{i + i} · {fmt(Number(req.amt) || r.amt)}</div>
                          </div>
                        </div>
                        <button className="bsm o" onClick={() => openSubmit(loan, i, true)}>Edit Proof</button>
                      </div>
 
                      <div style={{ padding: '12px 20px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {approvals.map((a: any, ai: number) => (
                            <div key={ai} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 10, padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>
                              {a.status === 'approved' ? '✅' : '⏳'} {a.by}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
 
                {/* ❌ Rejected */}
                {rejectedReqs.map(({ loan, r, i }) => (
                  <div key={`rej-${loan.id}-${i}`} style={{
                    background: 'linear-gradient(135deg, #fef2f2, #fff1f2)',
                    border: '1.5px solid #fecaca', borderRadius: 16, padding: '14px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>❌</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13, color: '#991b1b' }}>Repayment Rejected — {loan.id} EMI #{i + 1}</div>
                        <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>{r.request?.adminNotes || 'Please resubmit your proof.'}</div>
                      </div>
                    </div>
                    <button className="bsm r" onClick={() => openSubmit(loan, i, true)}>Resubmit Now</button>
                  </div>
                ))}
              </div>
            );
          })()}
 
          {activeLoan.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '70px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🌱</div>
              <div style={{ fontWeight: 600 }}>No active loans found.</div>
            </div>
          ) : activeLoan.map(loan => <MemberLoanCard key={loan.id} loan={loan} />)}
        </>
      )}


      {/* ═════════════════════ ADMIN VIEW ═════════════════════ */}
      {isAdmin && (
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* ═══ ADMIN MISSION CONTROL ═══ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 30, marginBottom: 30 }}>
            {/* Pipeline Overview Widget (Visible to All Admins) */}
            <div style={{
              background: 'linear-gradient(135deg, #0f172a, #1e293b)',
              borderRadius: 24, padding: '24px 30px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 0.5 }}>📊 Repayment Portal Matrix</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Real-time synchronization across all branch nodes</div>
                </div>
                <div style={{ fontSize: 10, background: 'rgba(20,184,166,0.2)', color: '#14b8a6', padding: '6px 14px', borderRadius: 20, fontWeight: 900 }}>
                  {role === 'super' ? 'SUPER ADMIN CONTROL' : 'BRANCH ADMIN VIEW'}
                </div>
              </div>
               <div className="matrix-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
                 {[
                   { label: 'Pending Review', val: allPending.length, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: '⏳', sub: 'Action Required' },
                   { label: 'Partially Signed', val: allPartial.length, color: '#6366f1', bg: 'rgba(99,102,241,0.08)', icon: '🖊️', sub: 'Signatures Pending' },
                   { label: 'Total Approved', val: totalApproved, color: '#10b981', bg: 'rgba(16,185,129,0.08)', icon: '✅', sub: `+${approvedThisWeek} this week` },
                   { label: 'Total Rejected', val: totalRejected, color: '#ef4444', bg: 'rgba(239,68,68,0.08)', icon: '❌', sub: `+${rejectedThisWeek} this week` },
                 ].map((stat, si) => (
                   <div key={si} style={{ background: stat.bg, borderRadius: 20, padding: '24px 16px', textAlign: 'center', border: `1px solid ${stat.color}22`, transition: 'all 0.3s' }}>
                     <div style={{ fontSize: 24, marginBottom: 12 }}>{stat.icon}</div>
                     <div style={{ fontSize: 32, fontWeight: 950, color: stat.color, lineHeight: 1 }}>{stat.val}</div>
                     <div style={{ fontSize: 11, color: '#fff', fontWeight: 900, textTransform: 'uppercase', marginTop: 12, letterSpacing: 0.5 }}>{stat.label}</div>
                     <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginTop: 4 }}>{stat.sub}</div>
                   </div>
                 ))}
               </div>

              {bottleneckAdmins.length > 0 && (
                <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(234,179,8,0.1)', borderRadius: 14, border: '1.5px solid rgba(234,179,8,0.3)' }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#fbbf24', marginBottom: 8 }}>⚠️ Critical Bottlenecks: Reviewers with 3+ Day Overdue Tasks</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {bottleneckAdmins.map((a: any) => (
                      <span key={a.id} style={{ background: 'rgba(234,179,8,0.2)', color: '#fbbf24', fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 20 }}>
                        {a.name} ({a.desig})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 🛡️ UNIFIED AUTHORIZATION HUB (SUPER ADMIN ONLY) */}
            {role === 'super' && (
              <div className="card" style={{ padding: '24px 30px', borderRadius: 24, background: '#fff', border: '1.5px solid #e2e8f0', boxShadow: '0 8px 30px rgba(0,0,0,0.03)' }}>
                <div className="auth-hub-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: 24, marginBottom: 24 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 44, height: 44, background: 'var(--teal-pale)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🛡️</div>
                      <div>
                        <div style={{ fontWeight: 950, fontSize: 19, color: '#0f172a' }}>Repayment Portal Authorization Hub</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Reviewer management and consensus policy console</div>
                      </div>
                    </div>
                  </div>
                
                <div style={{ width: 280 }}>
                  <div style={{ fontSize: 10, fontWeight: 950, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Consensus Policy</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <select 
                      className="sel2" 
                      style={{ height: 46, borderRadius: 12, fontSize: 14, fontWeight: 800, border: '1.5px solid #e2e8f0', flex: 1 }}
                      value={config.repaymentApprovalsNeeded || 1}
                      onChange={e => { localDb.updatePortalConfig({ repaymentApprovalsNeeded: Number(e.target.value) }); refresh(); }}
                    >
                      {[1,2,3,4,5,6,7,8,9,10].map(n => (
                        <option key={n} value={n}>{n} Signature{n > 1 ? 's' : ''} {n === 1 ? '(Fast)' : n <= 3 ? '(Secure)' : '(High Audit)'}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="auth-hub-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 40 }}>
                {/* LEFT: AUTHORIZATION SEARCH */}
                <div>
                  <label className="fl2" style={{ marginBottom: 10, fontSize: 12, fontWeight: 800, color: '#475569' }}>Authorize New Reviewer (Predictive Search)</label>
                  <div className="fiw" style={{ background: '#f8fafc', height: 48, borderRadius: 14, border: '1.5px solid #e2e8f0' }}>
                    <span className="fic" style={{ fontSize: 18 }}>🔍</span>
                    <input 
                      className="fi" 
                      list="admin-list" 
                      placeholder="Type admin name or designation..." 
                      style={{ fontSize: 14 }}
                      onKeyPress={e => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value;
                          const found = allAdmins.find((a: any) => a.name === val || `${a.name} (${a.desig})` === val);
                          if (found) {
                            if (!(config.authorizedReviewers || []).includes(found.id)) {
                              localDb.toggleReviewerPool(found.id);
                              refresh();
                              setToast({ m: `Authorized ${found.name} successfully.`, t: 's' });
                            }
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <datalist id="admin-list">
                      {allAdmins.filter((a: any) => !(config.authorizedReviewers || []).includes(a.id)).map((a: any) => (
                        <option key={a.id} value={`${a.name} (${a.desig})`} />
                      ))}
                    </datalist>
                  </div>
                  
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase' }}>Active Pool Control</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {allAdmins.filter((a: any) => (config.authorizedReviewers || []).includes(a.id)).map((a: any) => (
                        <div key={a.id} style={{ 
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', 
                          background: '#fff', border: '1.5px solid var(--teal)', color: 'var(--teal)', 
                          borderRadius: 25, fontSize: 11, fontWeight: 800, boxShadow: '0 2px 8px rgba(20,184,166,0.1)'
                        }}>
                          {a.name} 
                          <span onClick={() => { localDb.toggleReviewerPool(a.id); refresh(); }} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 14, fontWeight: 400 }}>✕</span>
                        </div>
                      ))}
                      {allAdmins.filter((a: any) => (config.authorizedReviewers || []).includes(a.id)).length === 0 && (
                        <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No reviewers authorized yet.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* RIGHT: DEFAULT COMMITTEE OUTPUT */}
                <div style={{ borderLeft: '1px solid #f1f5f9', paddingLeft: 40 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase' }}>Default Committee (Auto-Assigned)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {allAdmins.filter((a: any) => config.authorizedReviewers?.includes(a.id)).map((admin: any) => {
                      const inDefault = (config.defaultCommittee || []).includes(admin.id);
                      return (
                        <button key={admin.id}
                          onClick={() => {
                            const cur = config.defaultCommittee || [];
                            const next = cur.includes(admin.id) ? cur.filter((id: string) => id !== admin.id) : [...cur, admin.id];
                            localDb.updatePortalConfig({ defaultCommittee: next }); refresh();
                          }}
                          style={{
                            padding: '8px 16px', borderRadius: 14, fontSize: 11, fontWeight: 800, cursor: 'pointer',
                            border: inDefault ? '1.5px solid var(--teal)' : '1px solid #e2e8f0',
                            background: inDefault ? 'rgba(20,184,166,0.06)' : '#fff',
                            color: inDefault ? 'var(--teal)' : '#64748b', transition: 'all .2s'
                          }}
                        >
                          {inDefault ? '✓ ' : ''}{admin.name}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>
                    Click authorized reviewers to toggle them into the default committee for new requests.
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>




          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([
                { key: 'queue', label: '⚡ Transaction Pipeline', badge: allPending.length },
                { key: 'schedules', label: '📋 Loan Schedules', badge: 0 },
              ] as const).map(t => (
                <button 
                  key={t.key} 
                  onClick={() => setAdminTab(t.key)}
                  className={`tab-btn ${adminTab === t.key ? 'active' : ''}`}
                  style={{
                    padding: '12px 24px', borderRadius: 14, fontSize: 13, fontWeight: 900,
                    background: adminTab === t.key ? 'var(--teal)' : 'rgba(20,184,166,0.04)',
                    color: adminTab === t.key ? '#fff' : 'var(--teal)',
                    border: '1.5px solid', borderColor: adminTab === t.key ? 'var(--teal)' : 'rgba(20,184,166,0.1)',
                    transition: 'all .25s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex', alignItems: 'center', gap: 10
                  }}
                >
                  {t.label}
                  {t.badge > 0 && (
                    <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 900, padding: '1px 8px' }}>{t.badge}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {adminTab === 'queue' && (
            <div>
              {/* My Queue Summary Banner */}
              {(() => {
                const myPending = allPending.filter(({ r }) => {
                  const assigned = r.request?.assignedReviewers || [];
                  const inPool = config.authorizedReviewers?.includes(profile?.id);
                  const hasActed = (r.request?.approvals || []).some((a: any) => a.id === profile?.id || a.by === profile?.name);
                  return inPool && (assigned.length === 0 || assigned.includes(profile?.id)) && !hasActed;
                });
                const partialMine = allPending.filter(({ r }) => r.request?.status === 'partially_approved').length;
                if (myPending.length === 0 && partialMine === 0) return null;
                return (
                  <div style={{
                    display: 'flex', gap: 12, marginBottom: 20, padding: '14px 18px',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(59,130,246,0.06))',
                    borderRadius: 14, border: '1.5px solid rgba(99,102,241,0.15)'
                  }}>
                    <div style={{ fontSize: 22 }}>🔔</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#3730a3' }}>Your Review Queue</div>
                      <div style={{ fontSize: 11, color: '#4338ca', marginTop: 2 }}>
                        {myPending.length > 0 && <span style={{ marginRight: 10 }}><b>{myPending.length}</b> waiting for your signature</span>}
                        {partialMine > 0 && <span><b>{partialMine}</b> partially signed</span>}
                      </div>
                    </div>
                  </div>
                );
              })()}
    
                        {/* UNIFIED PIPELINE HEADER */}
              <div className="card inv-ctrls" style={{ padding: '24px 30px', marginBottom: 24, background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
                 <div className="inv-actions-group" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                   <div className="fiw" style={{ background: '#f8fafc', height: 44, padding: '0 16px', borderRadius: 14, width: 280, border: '1.5px solid #f1f5f9', display: 'flex', alignItems: 'center' }}>
                     <span className="fic">🔍</span>
                     <input className="fi" placeholder="Search pipeline..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%' }} />
                   </div>
                   
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                     <span style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8' }}>STATUS:</span>
                     <select 
                       className="sel2" 
                       value={pipelineFilter} 
                       onChange={(e: any) => setPipelineFilter(e.target.value)}
                       style={{ height: 44, padding: '0 14px', borderRadius: 12, fontSize: 11, fontWeight: 800, background: '#f1f5f9', border: 'none' }}
                     >
                       <option value="all">ALL TRANSACTIONS</option>
                       <option value="pending">⏳ PENDING</option>
                       <option value="approved">✅ APPROVED</option>
                       <option value="rejected">❌ REJECTED</option>
                       <option value="manual">📝 MANUAL ONLY</option>
                       <option value="digital">📱 DIGITAL ONLY</option>
                     </select>
                   </div>

                   <button className="bsm g" style={{ height: 44, padding: '0 20px', borderRadius: 12 }} onClick={() => {
                      const rows = [['Loan ID', 'Member', 'EMI #', 'Amount', 'Date', 'Source', 'Status']];
                      const data: any[] = [...unifiedPipeline];
                      loans.forEach((loan: any) => (loan.repayments || []).forEach((r: any, idx: number) => { if (r.paid && !r.request) data.push({ loan, r, idx }); }));
                      
                      data.filter(item => {
                        const status = item.r.request?.status || (item.r.paid ? 'approved' : 'pending');
                        const isManual = !item.r.request;
                        if (pipelineFilter === 'manual' && !isManual) return false;
                        if (pipelineFilter === 'digital' && isManual) return false;
                        if (pipelineFilter !== 'all' && pipelineFilter !== 'manual' && pipelineFilter !== 'digital' && status !== pipelineFilter) return false;
                        return true;
                      }).forEach(({ loan, r, idx }) => {
                        rows.push([loan.id, loan.name, `${idx+1}`, `${r.paid_amount || r.request?.amt || 0}`, r.paid_date || r.request?.payDate || '', r.request ? 'Digital' : 'Manual', r.request?.status || 'Paid']);
                      });

                      const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
                      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `skssf_pipeline_export.csv`; a.click();
                    }}>⬇ Export</button>
                    
                    <button className="bsm s" style={{ height: 44, padding: '0 20px', background: 'var(--teal)', color: '#fff', borderRadius: 12, fontWeight: 900, marginLeft: 'auto' }} onClick={() => { 
                      setMfInst(''); setMfAmt(''); setMfDate(new Date().toISOString().split('T')[0]); setMfMode('Cash'); setMfRef(''); setMfProof('');
                      setShowManualSearch(true); 
                    }}>
                      ➕ New Manual Entry
                    </button>
                 </div>
              </div>

              {/* MANUAL SEARCH OVERLAY */}
              {showManualSearch && (
                <div className="rp-modal" style={{ zIndex: 1100 }}>
                  <div className="rp-modal-inner" style={{ maxWidth: 550, padding: 30 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <div style={{ fontWeight: 950, fontSize: 18 }}>Record Branch Payment</div>
                      <button onClick={() => { setShowManualSearch(false); setSearch(''); }} className="cls-btn">×</button>
                    </div>
                    <div className="fiw" style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0', padding: '10px 16px', borderRadius: 16, marginBottom: 20 }}>
                      <span className="fic">🔍</span>
                      <input className="fi" autoFocus placeholder="Start typing member name or loan id..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div style={{ maxHeight: 350, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                       {activeLoan.filter(l => (l.repayments || []).some(r => !r.paid && !r.request)).slice(0, 8).map(l => (
                         <div key={l.id} className="rp-card-mini" 
                           onClick={() => {
                             setShowManualSearch(false);
                             setRecordPaymentModal({ loan: l });
                             const next = (l.repayments || []).findIndex((r: any) => !r.paid && !r.request);
                             if(next > -1) { 
                               const r = l.repayments[next];
                               setMfInst(String(next)); 
                               setMfAmt(String(r.request?.amt || r.amt)); 
                               setMfProof(r.request?.proof || ''); 
                               setMfDate(r.request?.payDate || new Date().toISOString().split('T')[0]); 
                             }
                           }}
                           style={{ padding: 16, background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: 14, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all .2s' }}
                         >
                           <div><div style={{ fontWeight: 900, fontSize: 14 }}>{l.name}</div><div style={{ fontSize: 11, color: '#64748b' }}>{l.id} · {l.branch}</div></div>
                           <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--teal)' }}>SELECT →</div>
                         </div>
                       ))}
                       {search && activeLoan.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>No matches found.</div>}
                    </div>
                  </div>
                </div>
              )}

              {(() => {
                // Combined Pipeline Logic
                let items: any[] = [...unifiedPipeline];
                
                // Mix in manual logs for a unified history
                if (pipelineFilter === 'all' || pipelineFilter === 'approved' || pipelineFilter === 'manual') {
                  loans.forEach((loan: any) => (loan.repayments || []).forEach((r: any, idx: number) => { 
                    if (r.paid && !r.request) {
                      const q = search.toLowerCase();
                      if (!q || loan.name.toLowerCase().includes(q) || loan.id.toLowerCase().includes(q)) {
                        items.push({ loan, r, idx });
                      }
                    }
                  }));
                }

                // Apply Dropdown Filter
                if (pipelineFilter === 'manual') items = items.filter(i => !i.r.request);
                else if (pipelineFilter === 'digital') items = items.filter(i => !!i.r.request);
                else if (pipelineFilter !== 'all') items = items.filter(i => (i.r.request?.status || (i.r.paid ? 'approved' : 'pending')) === pipelineFilter);

                if (items.length === 0) return (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', background: '#fff', borderRadius: 24, border: '2px dashed #f1f5f9' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
                    <div style={{ fontSize: 15, fontWeight: 900 }}>Pipeline Clear</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>No {pipelineFilter} transactions found matching your criteria.</div>
                  </div>
                );

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.sort((a,b) => {
                      const tA = new Date(a.r.request?.submittedAt || a.r.paid || a.r.paid_date || 0).getTime();
                      const tB = new Date(b.r.request?.submittedAt || b.r.paid || b.r.paid_date || 0).getTime();
                      return tB - tA;
                    }).slice(0, 40).map(({ loan, r, idx }) => (
                      <div key={`${loan.id}-${idx}`} style={{ position: 'relative' }}>
                        {!r.request && (
                          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'var(--amber)', borderRadius: '4px 0 0 4px', zIndex: 5 }} />
                        )}
                        <QueueItem loan={loan} r={r} idx={idx} reviewed={r.paid || r.request?.status === 'approved' || r.request?.status === 'rejected'} />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {adminTab === 'schedules' && (
            <div>
              <div style={{ marginBottom: 24, maxWidth: 450 }}>
                <div className="fiw" style={{ background: '#fff', border: '1.5px solid #e2e8f0', padding: '6px 16px', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                  <span className="fic">🔍</span>
                  <input className="fi" placeholder="Search Member or Loan ID..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>
              {activeLoan.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '70px', color: 'var(--muted)' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🌱</div>
                  <div style={{ fontWeight: 600 }}>No active loans found{search ? ' matching your search' : ''}.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))', gap: 20 }}>
                  {activeLoan.map(loan => {
                    const reps: any[] = loan.repayments || [];
                    const paidAmt = loan.total_paid ?? reps.reduce((s, r) => s + ((r.paid || r.request?.status === 'approved') ? (Number(r.paid_amount || r.request?.amt) || r.amt) : 0), 0);
                    const prog = loan.amt > 0 ? Math.min((paidAmt / loan.amt) * 100, 100) : 0;
                    const remaining = loan.remaining_balance ?? (loan.amt - paidAmt);
                    return (
                      <div key={loan.id} className="rp-card" style={{ 
                        marginBottom: 24, overflow: 'hidden', position: 'relative',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.04)',
                        borderRadius: '16px', background: '#fff'
                      }}>
                        {/* ROW 1: HEADER & STATS */}
                        <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontWeight: 900, fontSize: 16, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>💰</span> {loan.id}
                              </div>
                              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{loan.name}</div>
                              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>📍 {loan.branch}</span>
                                <span style={{ opacity: 0.3 }}>|</span>
                                <span>🔖 {loan.purpose}</span>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 28, fontWeight: 950, color: '#0f172a', letterSpacing: '-0.5px' }}>{fmt(loan.amt)}</div>
                              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>{Math.round(prog)}% Repaid</div>
                              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber2)', marginTop: 2 }}>{fmt(remaining)} Remaining</div>
                            </div>
                          </div>
                          
                          {/* PROGRESS BAR */}
                          <div style={{ marginTop: 20, height: 8, background: '#f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
                            <div style={{ width: `${prog}%`, height: '100%', background: 'var(--teal)', borderRadius: 10, transition: 'width 1s ease-in-out' }} />
                          </div>
                        </div>

                        {/* ROW 2: INSTALLMENT ROADMAP */}
                        <div style={{ background: '#f8fafc', padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>
                            EMI Lifecycle Status
                          </div>
                          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
                            {reps.map((r, i) => {
                              const s = statusFor(r);
                              const actual = Number(r.request?.amt) || r.amt;
                              const isPartial = r.paid && actual < r.amt;
                              return (
                                <div key={i} style={{ flexShrink: 0, textAlign: 'center' }}>
                                  <div style={{
                                    width: 32, height: 32, borderRadius: 10, 
                                    background: s === 'paid' ? 'var(--green)' : s === 'upcoming' ? '#e2e8f0' : 'var(--amber)',
                                    color: s === 'upcoming' ? '#64748b' : '#fff',
                                    fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: s === 'paid' ? '0 4px 12px rgba(16, 185, 129, 0.25)' : 'none',
                                    border: isPartial ? '2.5px solid #f59e0b' : 'none'
                                  }}>
                                    {s === 'paid' ? '✓' : i + 1}
                                  </div>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', marginTop: 8 }}>
                                    {isPartial ? <span style={{ color: '#d97706' }}>₹{actual}</span> : `EMI ${i+1}`}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* ROW 3: ACTIONS (Approval Focused) */}
                        <div style={{ padding: '20px 24px', display: 'flex', gap: 14 }}>
                          {(() => {
                            const nextPendingIdx = reps.findIndex(r => r.request?.status === 'pending');
                            const hasRequest = nextPendingIdx > -1;
                            return (
                              <>
                                <button 
                                  className={`bsm ${hasRequest ? 's' : 'g'}`}
                                  disabled={!hasRequest}
                                  style={{ flex: 1, padding: '14px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 14, opacity: hasRequest ? 1 : 0.6 }}
                                  onClick={() => {
                                    const r = reps[nextPendingIdx];
                                    setRecordPaymentModal({ loan });
                                    setMfInst(String(nextPendingIdx));
                                    setMfAmt(String(r.request?.amt || r.amt));
                                    setMfDate(r.request?.payDate || new Date().toISOString().split('T')[0]);
                                    setMfRef(r.request?.ref || '');
                                    setMfProof(r.request?.proof || '');
                                  }}
                                >
                                  <span style={{ fontSize: 18 }}>📥</span> 
                                  {hasRequest ? 'Verify Digital Request' : 'No Pending Requests'}
                                </button>
                                <button 
                                  style={{ flex: 1, padding: '14px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 14 }}
                                  onClick={() => setHistoryModal({ loan })}
                                >
                                  <span style={{ fontSize: 18 }}>📜</span> History Log
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ MODALS ════════════════ */}

      {/* 1. RECORD MANUAL PAYMENT (ADMIN) */}
      {recordPaymentModal && (() => {
        const l = recordPaymentModal.loan;
        const reps: any[] = l.repayments || [];
        const unpaid = reps.map((r, i) => ({ r, i })).filter(({ r }) => !r.paid && !r.request);
        const canLog = !!mfInst && !!mfAmt && !!mfDate && !!mfMode;
        return (
          <div className="rp-modal">
            <div className="rp-modal-inner" style={{ maxWidth: 500 }}>
              <div className="rp-modal-hd">
                <div style={{ fontWeight: 800 }}>Record Manual — {l.id}</div>
                <button onClick={() => setRecordPaymentModal(null)} className="cls-btn">×</button>
              </div>
              <div className="rp-modal-body">
                {(() => {
                  const activeReq = reps[parseInt(mfInst)]?.request;
                  const hasMemberData = !!activeReq;
                  
                  return (
                    <>
                      <div className="fgrid">
                        <div className="fg2 full">
                          <label className="fl2">Select EMI *</label>
                          <select className="sel2" value={mfInst} onChange={e => { 
                            const val = e.target.value;
                            setMfInst(val); 
                            const ii = parseInt(val); 
                            if (!isNaN(ii)) {
                              const r = reps[ii];
                              setMfAmt(String(r?.request?.amt || r?.amt || '')); 
                              setMfProof(r?.request?.proof || '');
                              setMfDate(r?.request?.payDate || new Date().toISOString().split('T')[0]);
                              setMfRef(r?.request?.ref || '');
                              setMfMode(r?.request?.mode || 'Cash');
                            }
                          }}>
                            <option value="">— Choose —</option>
                            {unpaid.map(({ r, i }) => <option key={i} value={i}>EMI #{i + 1} ({fmt(r.amt)})</option>)}
                          </select>
                        </div>
                        <div className="fg2">
                          <label className="fl2">Amount (₹)</label>
                          <input 
                            className="fi2" 
                            type="number" 
                            value={mfAmt} 
                            style={{ background: '#fff' }}
                            onChange={e => setMfAmt(e.target.value)} 
                          />
                          {hasMemberData && <div style={{ fontSize: 9, color: 'var(--amber)', fontWeight: 800, marginTop: 4 }}>Note: Overriding member's submission (Original: ₹{activeReq.amt})</div>}
                        </div>
                         <div className="fg2">
                           <label className="fl2">Transaction Date *</label>
                           <input 
                             className="fi2" 
                             type="date" 
                             value={mfDate} 
                             style={{ background: '#fff' }}
                             onChange={e => setMfDate(e.target.value)} 
                           />
                         </div>
                         <div className="fg2">
                           <label className="fl2">Payment Method *</label>
                           <select className="sel2" value={mfMode} onChange={e => setMfMode(e.target.value)}>
                             <option value="Cash">💵 Cash</option>
                             <option value="UPI">📱 UPI / PhonePe / GPay</option>
                             <option value="Bank">🏦 Bank Transfer</option>
                             <option value="Other">🌀 Other</option>
                           </select>
                         </div>
                         {mfMode !== 'Cash' && (
                           <div className="fg2 full">
                             <label className="fl2">{mfMode} Linked Number / Reference *</label>
                             <input className="fi2" placeholder={mfMode === 'UPI' ? 'Enter UPI Phone Number...' : 'Enter Account/Ref details...'} value={mfRef} onChange={e => setMfRef(e.target.value)} />
                           </div>
                         )}
                      </div>
                      
                      {activeReq?.proof ? (
                        <div style={{ marginTop: 20 }}>
                          <label className="fl2">Proof Given by Applicant</label>
                          <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc' }}>
                            <img src={activeReq.proof} style={{ width: '100%', maxHeight: 150, objectFit: 'contain', borderRadius: 8, cursor: 'zoom-in' }} onClick={() => setLightbox(activeReq.proof)} />
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 8, textAlign: 'center' }}>Click to enlarge proof</div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginTop: 20 }}>
                          <label className="fl2">Upload Physical Receipt (Optional)</label>
                          <div 
                            style={{ 
                              border: '2px dashed #e2e8f0', borderRadius: 16, padding: 24, textAlign: 'center', 
                              background: mfProof ? 'rgba(20,184,166,0.05)' : '#f8fafc', cursor: 'pointer', transition: 'all .2s'
                            }}
                            onClick={() => document.getElementById('manual-proof')?.click()}
                          >
                            {mfProof ? (
                               <div style={{ position: 'relative' }}>
                                 <img src={mfProof} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 10 }} />
                                 <div style={{ position: 'absolute', top: -10, right: -10, background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); setMfProof(''); }}>×</div>
                               </div>
                            ) : (
                               <>
                                 <div style={{ fontSize: 28, marginBottom: 8 }}>📸</div>
                                 <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>Click to upload receipt photo</div>
                               </>
                            )}
                            <input 
                              id="manual-proof" 
                              type="file" 
                              accept="image/*" 
                              hidden 
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = () => setMfProof(reader.result as string);
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="rp-modal-ft">
                <button className="bsm g" onClick={() => setRecordPaymentModal(null)}>Cancel</button>
                <button className="bsm s" disabled={!canLog} onClick={() => {
                  const instIdx = parseInt(mfInst);
                  const activeReq = reps[instIdx]?.request;
                  if (activeReq) {
                    localDb.verifyRepaymentRequest(l.id, instIdx, 'approved', 'Confirmed via Loan Schedule manual check.', profile?.name, profile?.role, profile?.id, { amt: Number(mfAmt), payDate: mfDate, proof: mfProof });
                  } else {
                    localDb.logRepayment(l.id, instIdx, { method: mfMode.toLowerCase() as any, amt: Number(mfAmt), notes: mfRef, proof: mfProof, payDate: mfDate });
                  }
                  refresh(); setRecordPaymentModal(null); 
                }}>{reps[parseInt(mfInst)]?.request ? 'Verify & Credit' : 'Credit Now'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 2. SUBMIT / EDIT MODAL (MEMBER) */}
      {submitModal && (() => {
        const inst = submitModal.loan.repayments[submitModal.idx];
        const isEdit = submitModal.edit;
        const canSubmit = !!form.amt && !!form.mode && !!form.payDate && (form.mode === 'Cash' || !!form.ref);
        return (
          <div className="rp-modal">
            <div className="rp-modal-inner" style={{ maxWidth: 520 }}>
              <div className="rp-modal-hd">
                <div style={{ fontWeight: 800 }}>{isEdit ? 'Update Payment' : 'Submit Payment'}</div>
                <button onClick={() => setSubmitModal(null)} className="cls-btn">×</button>
              </div>
              <div style={{ padding: 24 }}>
                <div style={{ background: 'var(--teal-pale)', padding: 16, borderRadius: 12, marginBottom: 20 }}>
                   <div style={{ fontSize: 11 }}>EMI #{submitModal.idx + 1} EXPECTED</div>
                   <div style={{ fontSize: 24, fontWeight: 900 }}>{fmt(inst.amt)}</div>
                </div>
                 <div className="fgrid">
                   <div className="fg2">
                     <label className="fl2">Amount Transferred *</label>
                     <input className="fi2" type="number" value={form.amt} onChange={e => upd('amt', e.target.value)} />
                   </div>
                   <div className="fg2">
                     <label className="fl2">Payment Method *</label>
                     <select className="sel2" value={form.mode} onChange={e => upd('mode', e.target.value)}>
                        <option value="UPI">📱 UPI / PhonePe / GPay</option>
                        <option value="Bank">🏦 Bank Transfer</option>
                        <option value="Cash">💵 Handover (Cash)</option>
                     </select>
                   </div>
                   <div className="fg2">
                     <label className="fl2">Transaction Date *</label>
                     <input className="fi2" type="date" value={form.payDate} onChange={e => upd('payDate', e.target.value)} />
                   </div>
                   <div className="fg2">
                     <label className="fl2">{form.mode === 'Cash' ? 'Receiver Name (Optional)' : 'Linked Ph / Ref ID *'}</label>
                     <input className="fi2" placeholder={form.mode === 'UPI' ? 'UPI Linked Number' : 'Reference details'} value={form.ref} onChange={e => upd('ref', e.target.value)} />
                   </div>
                 </div>
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: '12px 16px', borderRadius: 12, border: '1.5px solid #e2e8f0', cursor: 'pointer' }}>
                     <input type="checkbox" checked={form.isFullClearance} onChange={e => upd('isFullClearance', e.target.checked)} style={{ width: 18, height: 18 }} />
                     <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Request Full Loan Clearance</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Check this if you are paying the entire remaining balance at once.</div>
                     </div>
                  </label>
                </div>
                <div style={{ marginTop: 20 }}>
                  <input type="file" id="pf-up" hidden onChange={handleProofUpload} />
                  <div className="pf-box" onClick={() => document.getElementById('pf-up')?.click()} style={{ border: '2px dashed #99f6e4', padding: 20, textAlign: 'center', cursor: 'pointer', borderRadius: 12 }}>
                     {form.proof ? <img src={form.proof} style={{ maxHeight: 100 }} /> : 'Click to Upload'}
                  </div>
                </div>
              </div>
              <div className="rp-modal-ft">
                <button className="bsm g" onClick={() => setSubmitModal(null)}>Cancel</button>
                <button className="bsm s" disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>Submit</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 3. HISTORY MODAL */}
      {historyModal && (() => {
        const { loan } = historyModal;
        const acts = (loan.repayments || []).filter((r: any) => r.paid || r.request);
        return (
          <div className="rp-modal">
            <div className="rp-modal-inner" style={{ maxWidth: 580 }}>
              <div className="rp-modal-hd"><div style={{ fontWeight: 800 }}>History — {loan.id}</div><button onClick={() => setHistoryModal(null)} className="cls-btn">×</button></div>
              <div style={{ padding: 24 }}>
                {acts.length === 0 ? <p>No activity yet.</p> : acts.map((r: any, i: number) => {
                  const s = statusFor(r);
                  const req = r.request;
                  return (
                    <div key={i} style={{ background: '#f8fafc', padding: 20, borderRadius: 16, marginBottom: 16, borderLeft: `6px solid ${STATUS_BG[s]}`, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ fontWeight: 900, fontSize: 16, color: '#1e293b' }}>{fmt(r.amt)}</div>
                          <div style={{ background: STATUS_BG[s], color: '#fff', fontSize: 9, fontWeight: 900, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase' }}>{s}</div>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>📅 {r.paid_date || req?.payDate || '—'}</div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: req ? 'var(--teal)' : 'var(--amber)', marginTop: 4, textTransform: 'uppercase' }}>
                          {req ? '🔗 Digital Pipeline Verification' : '📝 Direct / Manual Entry'}
                        </div>
                        {req?.ref && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>REF: {req.ref}</div>}
                        
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                            {isMember && req && s !== 'paid' && (
                              <>
                                <button className="bsm o" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => { setHistoryModal(null); openSubmit(loan, i, true); }}>Edit Request</button>
                                <button className="bsm g" style={{ fontSize: 11, padding: '6px 12px', background: 'rgba(239,68,68,0.05)', color: 'var(--red)', border: '1px solid var(--red)' }} onClick={() => {
                                  if (window.confirm('Cancel this payment request?')) {
                                    localDb.deleteRepaymentsBulk(loan.id, [i]);
                                    refresh(); setHistoryModal(null);
                                  }
                                }}>Cancel Request</button>
                              </>
                            )}
                           {isAdmin && (r.paid || s === 'paid') && (
                             <button className="bsm r" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => {
                               if (window.confirm('Delete this payment record?')) {
                                 localDb.deleteRepaymentsBulk(loan.id, [i]);
                                 refresh(); setHistoryModal(null);
                               }
                             }}>🗑️ Delete</button>
                           )}
                        </div>
                      </div>
                      
                      {(r.proof || req?.proof) && (
                        <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
                          <img 
                            src={r.proof || req?.proof} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, cursor: 'zoom-in', border: '1.5px solid #e2e8f0' }} 
                            onClick={() => setLightbox(r.proof || req?.proof)} 
                          />
                          <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: 4, borderRadius: 6, fontSize: 8 }}>🔍</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 4. REVIEW MODAL (ADMIN) */}
      {showReview && selectedReview && (() => {
        const { loan, idx } = selectedReview;
        const r = loan.repayments[idx];
        const req = r.request;
        const approvals = req?.approvals || [];
        const threshold = config.repaymentApprovalsNeeded || 1;
        const approvedCount = approvals.filter((a: any) => a.status === 'approved').length;

        return (
          <div className="rp-modal">
            <div className="rp-modal-inner" style={{ maxWidth: 1000, display: 'flex', height: '85vh', borderRadius: 28, overflow: 'hidden' }}>
               {/* Left Side: Proof Viewer */}
               <div style={{ flex: 1.2, padding: 32, background: '#0f172a', overflowY: 'auto', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🖼️</div>
                      <div style={{ color: '#fff' }}>
                        <div style={{ fontWeight: 900, fontSize: 16 }}>Transaction Evidence</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Member uploaded proof of payment</div>
                      </div>
                    </div>
                    <button onClick={() => setShowReview(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>×</button>
                  </div>
                  
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', borderRadius: 20, border: '1.5px dashed rgba(255,255,255,0.1)', overflow: 'hidden', padding: 20 }}>
                    {req?.proof ? (
                      <img src={req.proof} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }} onClick={() => setLightbox(req.proof)} />
                    ) : (
                      <div style={{ textAlign: 'center', color: '#64748b' }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
                        <div style={{ fontWeight: 800 }}>No Proof Image Uploaded</div>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Click image to view high-resolution version</div>
               </div>

               {/* Right Side: Decision Console */}
               <div style={{ flex: 0.8, padding: 40, display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: '1px solid #f1f5f9' }}>
                  <div style={{ marginBottom: 30 }}>
                    <div style={{ fontSize: 11, fontWeight: 950, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>Audit Verification</div>
                    <div style={{ fontWeight: 950, fontSize: 24, color: '#0f172a' }}>{loan.name}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Loan ID: {loan.id} · EMI #{idx + 1}</div>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    <div style={{ background: '#f8fafc', padding: 20, borderRadius: 20, marginBottom: 24, border: '1.5px solid #f1f5f9' }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', marginBottom: 16 }}>Member-Submitted Details (Read-Only)</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800 }}>AMOUNT</div><div style={{ fontWeight: 950, fontSize: 18, color: 'var(--teal)' }}>₹{Number(req?.amt || 0).toLocaleString()}</div></div>
                        <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800 }}>DATE</div><div style={{ fontWeight: 900, fontSize: 15, color: '#1e293b' }}>{req?.payDate}</div></div>
                        <div style={{ gridColumn: 'span 2' }}><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800 }}>REF ID</div><div style={{ fontWeight: 900, fontSize: 15, color: '#1e293b' }}>{req?.ref || 'N/A'}</div></div>
                        <div style={{ gridColumn: 'span 2' }}><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800 }}>MODE</div><div style={{ fontWeight: 800, fontSize: 14, color: '#475569' }}>{req?.mode}</div></div>
                        {req?.isFullClearance && (
                          <div style={{ gridColumn: 'span 2', marginTop: 10, background: 'var(--amber)', color: '#fff', padding: '10px 16px', borderRadius: 12, fontWeight: 900, fontSize: 12, textAlign: 'center' }}>
                            ⚠️ FULL LOAN CLEARANCE REQUESTED
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ marginBottom: 24 }}>
                      <label className="fl2" style={{ marginBottom: 12, fontSize: 12, fontWeight: 900 }}>Consensus Status</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1.5px solid #e2e8f0', padding: '12px 16px', borderRadius: 14 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: '#1e293b' }}>{approvedCount} of {threshold} Signatures</div>
                          <div style={{ height: 6, background: '#f1f5f9', borderRadius: 10, marginTop: 8, overflow: 'hidden' }}>
                            <div style={{ width: `${(approvedCount / threshold) * 100}%`, height: '100%', background: 'var(--teal)', borderRadius: 10 }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 24 }}>🖊️</div>
                      </div>
                    </div>

                    <div style={{ marginBottom: 24 }}>
                      <label className="fl2" style={{ marginBottom: 10, fontSize: 12, fontWeight: 900 }}>Final Verdict</label>
                      <select className="sel2" style={{ height: 48, borderRadius: 12, fontSize: 14, fontWeight: 800 }} value={actionStatus} onChange={e => setActionStatus(e.target.value as any)}>
                        <option value="approved">✅ Approve Submission</option>
                        <option value="rejected">❌ Reject Submission</option>
                        <option value="pending">⏳ Leave Pending</option>
                      </select>
                      <textarea className="ta2" style={{ marginTop: 14, height: 100, borderRadius: 12, padding: 14, fontSize: 13 }} value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder="Provide audit notes or rejection reason..." />
                    </div>
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <button className="bsm s" style={{ width: '100%', height: 52, borderRadius: 14, fontSize: 16, fontWeight: 950, boxShadow: '0 8px 25px rgba(20,184,166,0.25)' }} onClick={() => {
                      localDb.verifyRepaymentRequest(loan.id, idx, actionStatus, actionNote, profile?.name, profile?.role, profile?.id);
                      refresh(); setShowReview(false);
                      setToast({ m: `Audit for ${loan.name} saved successfully.${req?.isFullClearance ? ' Full Loan Cleared.' : ''}`, t: 's' });
                    }}>Execute Decision →</button>
                  </div>
               </div>
            </div>
          </div>
        );
      })()}

      {/* 5. DELETE CONFIRM */}
      {deleteConfirm && (
        <div className="rp-modal">
          <div className="rp-modal-inner" style={{ maxWidth: 380, padding: 24 }}>
             <div style={{ fontWeight: 800, marginBottom: 12 }}>Withdraw Submission?</div>
             <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Cancel the pending request for EMI #{deleteConfirm.idx + 1}?</p>
             <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="bsm g" onClick={() => setDeleteConfirm(null)}>No</button>
                <button className="bsm r" onClick={() => { localDb.deleteRepaymentRequest(deleteConfirm.loan.id, deleteConfirm.idx); refresh(); setDeleteConfirm(null); }}>Proceed</button>
             </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Proof" />
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.t === 's' ? '#0d7377' : '#ef4444', color: '#fff',
          padding: '12px 24px', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.15)',
          zIndex: 2000, display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeUp .3s ease'
        }}>
          <span>{toast.t === 's' ? '✅' : '❌'}</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{toast.m}</span>
        </div>
      )}
      <style>{`
        @media (max-width: 1024px) {
          .section-head {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          .inv-ctrls {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .inv-actions-group {
            width: 100%;
            justify-content: space-between;
          }
        }

        @media (max-width: 768px) {
          .aq-card {
            border-radius: 20px !important;
          }
          .aq-row-hover {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 16px !important;
            padding: 20px !important;
          }
          .aq-row-resp {
            width: 100%;
            justify-content: space-between !important;
            gap: 10px !important;
            border-top: 1px solid #f1f5f9;
            padding-top: 16px;
          }
          .aq-actions-resp {
             text-align: right !important;
          }
          
          /* Vertical Timeline Transformation */
          .timeline-wrapper {
             flex-direction: column !important;
             padding-left: 20px !important;
             gap: 30px !important;
          }
          .timeline-line {
             top: 0 !important;
             left: 13px !important;
             right: auto !important;
             width: 2px !important;
             height: 100% !important;
          }
          .timeline-step {
             flex-direction: row !important;
             align-items: flex-start !important;
             width: 100% !important;
             gap: 15px !important;
             flex: none !important;
          }
          .timeline-bubble {
             flex-shrink: 0 !important;
          }
          .timeline-card {
             margin-top: 0 !important;
             text-align: left !important;
             width: 100% !important;
          }
        }

        @media (max-width: 480px) {
          .inv-actions-group {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 10px !important;
          }
          .inv-actions-group > div:first-child {
            grid-column: 1 / -1;
          }
          .inv-actions-group button:last-child {
            grid-column: 1 / -1;
            margin-left: 0 !important;
          }
        }
      `}</style>
    </>
  );
};

