import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { localDb, syncFromBackend } from '../../lib/localDb';
import { FileText, Inbox, ClipboardList, User, Share2, Copy, CheckCircle, XCircle, Send, AlertTriangle, Plus, RotateCcw, Shield } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const role = profile?.role || 'member';
  const prefix = role === 'super' ? '/super-admin/dashboard' : role === 'admin' ? '/admin/dashboard' : '/member/dashboard';

  const [allLoans, setAllLoans] = useState(() => localDb.getLoans());
  const [allUsers, setAllUsers] = useState(() => localDb.getUsers());
  const [products, setProducts] = useState(() => localDb.getProducts());
  const [units, setUnits] = useState(() => localDb.getUnits());
  const [kits, setKits] = useState(() => localDb.getKits());
  const [missions, setMissions] = useState(() => localDb.getCampaigns());

  useEffect(() => {
    syncFromBackend();
    const handleUpdate = () => {
      setAllLoans(localDb.getLoans());
      setAllUsers(localDb.getUsers());
      setProducts(localDb.getProducts());
      setUnits(localDb.getUnits());
      setKits(localDb.getKits());
      setMissions(localDb.getCampaigns());
    };
    window.addEventListener('appDataUpdated', handleUpdate);
    return () => window.removeEventListener('appDataUpdated', handleUpdate);
  }, []);
  
  const isSuper  = profile?.role === 'super';
  const isAdmin  = profile?.role === 'admin';
  const isMember = profile?.role === 'member';
  const branch   = profile?.branch || '';

  // Results are already scoped by the backend API
  const loans = allLoans;
  
  const totalDisbursed = loans.filter(l => ['approved', 'completed'].includes(l.status)).reduce((s, l) => s + l.amt, 0);
  const totalCollected = loans.reduce((acc, l) => acc + (l.total_paid || 0), 0);
  const collectionRate = totalDisbursed > 0 ? (totalCollected / totalDisbursed) * 100 : 0;
  
  const lowStock = products.filter(p => p.available_quantity < 5).length;
  const activeMissions = missions.filter(m => m.stat === 'Active').length;
  const checkedOutUnits = units.filter(u => u.status === 'Checked-out').length;

  const fmt = (n: number) => `₹${(n / 1000).toFixed(1)}k`;

  if (isMember) {
    return <MemberDashboard loans={loans} profile={profile} navigate={navigate} totalCollected={totalCollected} />;
  }

  return (
    <div className="dashboard-root" style={{ animation: 'fadeIn 0.5s ease' }}>
      {/* ════════════════ HEADER SECTION ════════════════ */}
      <div style={{ 
        background: 'linear-gradient(135deg, var(--teal) 0%, var(--teal2) 100%)', 
        padding: '30px 40px', borderRadius: 24, marginBottom: 30, color: '#fff',
        position: 'relative', overflow: 'hidden', boxShadow: '0 20px 50px rgba(13,115,119,0.15)'
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>Mission Control</h1>
            <div style={{ background: 'rgba(20,184,166,0.2)', color: '#14b8a6', padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 900 }}>{isSuper ? 'GLOBAL OVERVIEW' : `UNIT: ${branch}`}</div>
          </div>
          <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 6, opacity: 0.8 }}>Real-time synchronization across logistics and financial nodes</p>
        </div>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 300, height: 300, background: 'rgba(20,184,166,0.05)', borderRadius: '50%' }} />
      </div>

      {/* ════════════════ STATS GRID ════════════════ */}
      <div className="dash-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 30 }}>
        {[
          { l: 'Total Recovered', v: fmt(totalCollected), sub: `${collectionRate.toFixed(1)}% Recovery Rate`, ic: '📈', cl: 'var(--teal)' },
          { l: 'Inventory Health', v: products.length, sub: `${lowStock} items low stock`, ic: '📦', cl: '#6366f1' },
          { l: 'Active Missions', v: activeMissions, sub: `${checkedOutUnits} units in field`, ic: '🎯', cl: '#f59e0b' },
          { l: 'Pipeline Queue', v: loans.filter(l => l.status === 'pending').length, sub: 'Action required', ic: '⏳', cl: '#ef4444' },
        ].map((s, i) => (
          <div key={i} className="card-hover" style={{ background: '#fff', padding: '24px', borderRadius: 20, border: '1.5px solid #f1f5f9', transition: 'all 0.3s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: s.cl + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{s.ic}</div>
              <div style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>{s.l}</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginTop: 16 }}>{s.v}</div>
            <div style={{ fontSize: 11, color: s.sub.includes('low') || s.sub.includes('Action') ? '#ef4444' : '#64748b', fontWeight: 700, marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="dash-main-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* 1. Loan Management Dashboard */}
          <div className="card" style={{ padding: 24, borderRadius: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: 0 }}>📝 Loan Management Dashboard</h3>
              <button className="bsm s" onClick={() => navigate(`${prefix}/loans`)}>Review All Apps →</button>
            </div>
            <div className="dash-loan-stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
               {[
                 { lbl: 'Pending Review', n: loans.filter(l => l.status === 'pending').length, cl: '#f59e0b', bg: '#fffbeb', bcl: '#fbbf24' },
                 { lbl: 'Approved Cases', n: loans.filter(l => l.status === 'approved').length, cl: '#10b981', bg: '#f0fdf4', bcl: '#34d399' },
                 { lbl: 'Rejected Cases', n: loans.filter(l => l.status === 'rejected').length, cl: '#ef4444', bg: '#fef2f2', bcl: '#f87171' },
               ].map((x, i) => (
                 <div key={i} style={{ padding: '16px 12px', borderRadius: 16, background: x.bg, border: `1.5px solid ${x.cl}15`, borderLeft: `4px solid ${x.bcl}`, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontSize: 22, fontWeight: 950, color: x.cl }}>{x.n}</div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: x.cl, textTransform: 'uppercase', marginTop: 4, letterSpacing: '0.3px' }}>{x.lbl}</div>
                 </div>
               ))}
            </div>
            <div className="mobile-table-hide tbl-wrap">
               <table style={{ width: '100%' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #f1f5f9' }}>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: 11, color: '#94a3b8' }}>APPLICANT</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: 11, color: '#94a3b8' }}>PURPOSE</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: 11, color: '#94a3b8' }}>SUBMITTED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.filter(l => l.status === 'pending').slice(0, 3).map((l: any) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '14px 12px' }}>
                          <div style={{ fontWeight: 800, fontSize: 13 }}>{l.name}</div>
                          <div style={{ fontSize: 10, color: '#64748b' }}>₹{l.amt.toLocaleString()}</div>
                        </td>
                        <td style={{ padding: '14px 12px' }}>
                          <div style={{ fontSize: 12, color: '#1e293b' }}>{l.purpose}</div>
                        </td>
                        <td style={{ padding: '14px 12px' }}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{new Date(l.submittedDate || Date.now()).toLocaleDateString()}</div>
                        </td>
                      </tr>
                    ))}
                    {loans.filter(l => l.status === 'pending').length === 0 && (
                      <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>No pending applications at this time.</td></tr>
                    )}
                  </tbody>
               </table>
            </div>

            <div className="mobile-card-list">
              {loans.filter(l => l.status === 'pending').slice(0, 3).map((l: any) => (
                <div key={l.id} className="glass-card" style={{ padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{l.name}</div>
                    <div style={{ background: '#fffbeb', color: '#f59e0b', fontSize: 10, fontWeight: 900, padding: '4px 10px', borderRadius: 20 }}>PENDING</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>{l.purpose}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 950, color: 'var(--teal)', fontSize: 15 }}>₹{l.amt.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(l.submittedDate || Date.now()).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Repayment Portal Activity */}
          <div className="card" style={{ padding: 24, borderRadius: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: 0 }}>⚡ Repayment Portal Activity</h3>
              <button className="bsm s" onClick={() => navigate(`${prefix}/repayments`)}>View Portal →</button>
            </div>
            <div className="mobile-table-hide tbl-wrap">
               <table style={{ width: '100%' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #f1f5f9' }}>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: 11, color: '#94a3b8' }}>MEMBER / ID</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: 11, color: '#94a3b8' }}>AMOUNT</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: 11, color: '#94a3b8' }}>PROGRESS</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: 11, color: '#94a3b8' }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.filter(l => ['approved', 'completed'].includes(l.status)).slice(0, 5).map((l: any) => {
                       const p = l.amt > 0 ? ((l.total_paid || 0) / l.amt) * 100 : 0;
                       return (
                        <tr key={l.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <td style={{ padding: '14px 12px' }}>
                            <div style={{ fontWeight: 800, fontSize: 13 }}>{l.name}</div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{l.id}</div>
                          </td>
                          <td style={{ padding: '14px 12px' }}>
                            <div style={{ fontWeight: 900, fontSize: 13, color: 'var(--teal)' }}>₹{l.amt.toLocaleString()}</div>
                          </td>
                           <td style={{ padding: '14px 12px' }}>
                             <div style={{ width: 100 }}>
                                <div style={{ height: 5, background: '#f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
                                   <div style={{ width: `${p}%`, height: '100%', background: 'linear-gradient(90deg, var(--teal), #00c9a7)', borderRadius: 10 }} />
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 800, marginTop: 5, color: '#64748b' }}>{Math.round(p)}% Paid</div>
                             </div>
                           </td>
                          <td style={{ padding: '14px 12px' }}>
                            <span style={{ fontSize: 10, fontWeight: 900, padding: '4px 10px', borderRadius: 20, background: l.status === 'completed' ? '#f0fdf4' : '#fff7ed', color: l.status === 'completed' ? '#10b981' : '#f59e0b' }}>
                               {l.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                       )
                    })}
                  </tbody>
               </table>
            </div>

            <div className="mobile-card-list">
              {loans.filter(l => ['approved', 'completed'].includes(l.status)).slice(0, 5).map((l: any) => {
                 const p = l.amt > 0 ? ((l.total_paid || 0) / l.amt) * 100 : 0;
                 return (
                  <div key={l.id} className="glass-card" style={{ padding: 18, borderRadius: 20, border: '1.5px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                      <div>
                        <div style={{ fontWeight: 950, fontSize: 15, color: '#0f172a' }}>{l.name}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>ID: {l.id}</div>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 950, padding: '4px 10px', borderRadius: 20, background: l.status === 'completed' ? '#f0fdf4' : '#fff7ed', color: l.status === 'completed' ? '#10b981' : '#f59e0b' }}>
                        {l.status.toUpperCase()}
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 900, marginBottom: 6 }}>
                        <span style={{ color: 'var(--teal)' }}>₹{l.amt.toLocaleString()}</span>
                        <span style={{ color: '#64748b' }}>{Math.round(p)}% Paid</span>
                      </div>
                      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ width: `${p}%`, height: '100%', background: 'linear-gradient(90deg, var(--teal), #00c9a7)', borderRadius: 10 }} />
                      </div>
                    </div>
                  </div>
                 );
              })}
            </div>
          </div>
          
          {/* 3. Catalog & Inventory Snapshot */}
          <div className="card" style={{ padding: 24, borderRadius: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: 0 }}>📦 Catalog & Inventory Pulse</h3>
              <button className="bsm s" onClick={() => navigate(`${prefix}/inventory`)}>Manage Catalog →</button>
            </div>
            <div className="dash-inv-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {products.slice(0, 6).map((p: any, i: number) => (
                <div key={i} className="glass-card" style={{ padding: '14px', borderRadius: 18, border: '1.5px solid #f1f5f9', background: '#fff', textAlign: 'center' }}>
                   <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, margin: '0 auto 10px' }}>
                      {p.photo ? <img src={p.photo} style={{ width: '100%', height: '100%', borderRadius: 12 }} /> : '📦'}
                   </div>
                   <div style={{ fontSize: 12, fontWeight: 950, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                   <div style={{ fontSize: 14, fontWeight: 1000, color: 'var(--teal)', marginTop: 4 }}>{p.available_quantity}</div>
                   <div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Available</div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ─── RIGHT COLUMN: AUDIT & LOGISTICS ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Active Missions Tracking */}
          <div className="card" style={{ padding: 24, borderRadius: 24, background: 'linear-gradient(to bottom, #fff, #f8fafc)' }}>
             <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', marginBottom: 20 }}>🎯 Active Missions</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
               {missions.filter(m => m.stat === 'Active').slice(0, 4).map((m: any, i: number) => {
                  const perc = m.goal > 0 ? (m.received / m.goal) * 100 : 0;
                  return (
                    <div key={i} className="glass-card" style={{ background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: 20, padding: '18px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                             <div className="pulse-dot"></div>
                             <div style={{ fontSize: 14, fontWeight: 950, color: '#0f172a' }}>{m.title}</div>
                          </div>
                          <div style={{ fontSize: 9, fontWeight: 950, color: '#6366f1', background: 'rgba(99,102,241,0.08)', padding: '3px 8px', borderRadius: 8 }}>LIVE</div>
                       </div>
                        <div style={{ height: 5, background: '#f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
                           <div style={{ width: `${perc}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #a855f7)', borderRadius: 10 }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                           <div style={{ fontSize: 12, fontWeight: 1000, color: '#1e293b' }}>{fmt(m.received)}</div>
                           <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{Math.round(perc)}% Complete</div>
                        </div>
                    </div>
                  )
               })}
             </div>
          </div>

          {/* Logistics Overview */}
          <div className="card" style={{ padding: 24, borderRadius: 24 }}>
             <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', marginBottom: 20 }}>🛡️ Logistics Summary</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { lbl: 'Total Kits', val: kits.length, ic: '💼' },
                  { lbl: 'Total Units', val: units.length, ic: '🏷️' },
                  { lbl: 'Checked-out', val: checkedOutUnits, ic: '📤' },
                  { lbl: 'Available', val: units.length - checkedOutUnits, ic: '📥' },
                ].map((l, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: i % 2 === 0 ? '#f8fafc' : '#fff', borderRadius: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#334155' }}>
                      <span>{l.ic}</span> {l.lbl}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--teal)' }}>{l.val}</div>
                  </div>
                ))}
              </div>
           </div>

        </div>
      </div>
    </div>
  );
}

function MemberDashboard({ loans: allLoans, profile, navigate }: any) {
  const role = profile?.role || 'member';
  const prefix = role === 'super' ? '/super-admin/dashboard' : role === 'admin' ? '/admin/dashboard' : '/member/dashboard';

  // Tabs state
  const [activeTab, setActiveTab] = useState<'inbox' | 'filed' | 'inventory' | 'profile'>('inbox');

  // Load state from localDb
  const [inboxSubmissions, setInboxSubmissions] = useState<any[]>(() =>
    localDb.getInboxSubmissions().filter((s: any) => s.member_id === profile.id)
  );
  const [products, setProducts] = useState<any[]>(() => localDb.getProducts());
  const [units, setUnits] = useState<any[]>(() => localDb.getUnits());
  const [checkoutRequests, setCheckoutRequests] = useState<any[]>(() =>
    localDb.getCheckoutRequests().filter((r: any) => r.member_id === profile.id)
  );
  const [returnRequests, setReturnRequests] = useState<any[]>(() =>
    localDb.getReturnRequests().filter((r: any) => r.member_id === profile.id)
  );

  const [selectedSub, setSelectedSub] = useState<any>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  
  // Forwarding form fields
  const [witness1, setWitness1] = useState('');
  const [witness2, setWitness2] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');

  // Checkout modal fields
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [checkoutQty, setCheckoutQty] = useState('1');
  const [checkoutPurpose, setCheckoutPurpose] = useState('');

  // Toast feedback
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const refreshData = () => {
    setInboxSubmissions(localDb.getInboxSubmissions().filter((s: any) => s.member_id === profile.id));
    setProducts(localDb.getProducts());
    setUnits(localDb.getUnits());
    setCheckoutRequests(localDb.getCheckoutRequests().filter((r: any) => r.member_id === profile.id));
    setReturnRequests(localDb.getReturnRequests().filter((r: any) => r.member_id === profile.id));
  };

  // Auto-refresh when appDataUpdated fires
  useEffect(() => {
    const handleUpdate = () => {
      refreshData();
    };
    window.addEventListener('appDataUpdated', handleUpdate);
    return () => window.removeEventListener('appDataUpdated', handleUpdate);
  }, []);

  // Filter loans filed by this helper
  const myFiledLoans = allLoans.filter((l: any) => l.submitted_by_member_id === profile.id || l.memId === profile.id);

  // Computed values
  const newRequestsCount = inboxSubmissions.filter((s: any) => s.status === 'new').length;
  const myUnits = units.filter((u: any) => u.current_holder_id === profile.id && u.status === 'checked_out');

  // Actions
  const handleCopyLink = () => {
    const link = `${window.location.origin}/request/${profile.member_unique_code}`;
    navigator.clipboard.writeText(link);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleForwardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub) return;

    try {
      // 1. Create a new loan record
      const loanData = {
        db_id: null,
        memNo: `REQ-${Math.floor(1000 + Math.random() * 9000)}`,
        name: selectedSub.requester_name,
        branch: profile.branch || 'Poyanad Central',
        phone: selectedSub.requester_phone,
        mob: selectedSub.requester_phone,
        amt: selectedSub.loan_amount_requested,
        purpose: selectedSub.loan_purpose_category.charAt(0).toUpperCase() + selectedSub.loan_purpose_category.slice(1),
        purpDesc: selectedSub.loan_purpose_detail || '',
        months: selectedSub.preferred_tenure_months || 12,
        guarantors: guarantorName ? [{ name: guarantorName, phone: guarantorPhone }] : [],
        witnesses: witness1 ? [witness1, witness2].filter(Boolean) : [],
        submitted_by_member_id: profile.id,
        submission_source: 'inbox',
        inbox_submission_id: selectedSub.id
      };

      const newLoan = localDb.addLoan(loanData);

      // 2. Action the inbox submission
      localDb.actionInboxSubmission(selectedSub.id, 'forwarded', undefined, newLoan.id);

      showToast('s', 'Loan request successfully forwarded to Coordinator Queue! 🚀');
      setShowForwardModal(false);
      setSelectedSub(null);
      refreshData();
    } catch (err: any) {
      showToast('e', 'Failed to forward request: ' + err.message);
    }
  };

  const handleRejectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub || !rejectionReason.trim()) return;

    try {
      localDb.actionInboxSubmission(selectedSub.id, 'rejected', rejectionReason.trim());
      showToast('s', 'Request rejected.');
      setShowRejectModal(false);
      setSelectedSub(null);
      setRejectionReason('');
      refreshData();
    } catch (err: any) {
      showToast('e', 'Failed to reject: ' + err.message);
    }
  };

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !checkoutPurpose.trim()) return;

    try {
      localDb.createCheckoutRequest({
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        member_id: profile.id,
        member_name: profile.name,
        quantity: parseInt(checkoutQty) || 1,
        purpose: checkoutPurpose,
        item_type: selectedProduct.category === 'Equipment' || selectedProduct.category === 'Medical' ? 'lease' : 'permanent'
      });

      showToast('s', 'Checkout request submitted to Admin for approval.');
      setShowCheckoutModal(false);
      setSelectedProduct(null);
      setCheckoutQty('1');
      setCheckoutPurpose('');
      refreshData();
    } catch (err: any) {
      showToast('e', 'Failed to request checkout.');
    }
  };

  const handleReturnRequest = (unit: any) => {
    try {
      localDb.createReturnRequest({
        unit_id: unit.id,
        unit_code: unit.unit_code,
        product_name: products.find((p: any) => p.id === unit.product_id)?.name || 'Inventory Item',
        member_id: profile.id,
        member_name: profile.name
      });
      showToast('s', 'Return request logged. Please hand item to Admin for verification.');
      refreshData();
    } catch (err: any) {
      showToast('e', 'Failed to process return request.');
    }
  };

  const handleWhatsAppReminder = (loan: any) => {
    const nextIdx = (loan.repayments?.filter((r: any) => r.paid).length || 0);
    const repayment = loan.repayments?.[nextIdx];
    const amountDue = repayment?.amt || (loan.amt / (loan.repayments?.length || 12));
    const dueDate = repayment?.due || 'upcoming date';
    const text = `Hello ${loan.name}, this is a friendly reminder from SKSSF eGov helper ${profile.name} regarding your loan repayment. Your installment of ₹${amountDue.toLocaleString()} is due on ${dueDate}. Please coordinate to submit the payment soon. Thank you!`;
    const url = `https://api.whatsapp.com/send?phone=${loan.mob || loan.phone}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="dashboard-root" style={{ animation: 'fadeIn 0.5s ease', position: 'relative' }}>
      
      {/* Toast Feedback */}
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 1000, background: toast.type === 's' ? '#0f172a' : 'var(--red)', color: '#fff', padding: '14px 24px', borderRadius: '16px', fontWeight: 700, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {toast.type === 's' ? '✅' : '⚠️'} {toast.msg}
        </div>
      )}

      {/* ════════════════ HEADER SECTION ════════════════ */}
      <div style={{ 
        background: 'linear-gradient(135deg, var(--teal) 0%, var(--teal2) 100%)', 
        padding: '30px 40px', borderRadius: 24, marginBottom: 30, color: '#fff',
        position: 'relative', overflow: 'hidden', boxShadow: '0 20px 50px rgba(13,115,119,0.15)'
      }}>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Helper Dashboard</div>
              {profile.assigned_zone && <div style={{ background: 'rgba(20,184,166,0.3)', padding: '6px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: 900 }}>📍 ZONE: {profile.assigned_zone}</div>}
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 950, margin: '8px 0 0 0', letterSpacing: -0.5 }}>{profile.name}</h1>
            <p style={{ fontSize: 13, color: '#b2f5ea', marginTop: 4 }}>Unique Code: <b>{profile.member_unique_code || 'MBR-N/A'}</b> · Unit: {profile.branch || 'Poyanad Central'}</p>
          </div>
          <button onClick={handleCopyLink} style={{ background: '#fff', color: 'var(--teal)', border: 'none', borderRadius: '14px', padding: '12px 24px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <Copy size={15} /> {copySuccess ? 'Copied Link!' : 'Copy Share Link'}
          </button>
        </div>
      </div>

      {/* ════════════════ TAB NAVIGATION ════════════════ */}
      <div style={{ display: 'flex', gap: '12px', background: '#fff', padding: '6px', borderRadius: '18px', border: '1.5px solid #e2e8f0', marginBottom: '30px' }}>
        {[
          { id: 'inbox', label: 'Loan Requests Inbox', ic: <Inbox size={17} />, badge: newRequestsCount },
          { id: 'filed', label: 'Loans I Filed', ic: <FileText size={17} />, badge: myFiledLoans.length },
          { id: 'inventory', label: 'Inventory & Leases', ic: <ClipboardList size={17} />, badge: myUnits.length },
          { id: 'profile', label: 'My Public Profile', ic: <User size={17} /> }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 16px',
              borderRadius: '14px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '13.5px',
              transition: 'all 0.2s',
              background: activeTab === t.id ? 'var(--teal)' : 'transparent',
              color: activeTab === t.id ? '#fff' : '#475569'
            }}
          >
            {t.ic}
            <span>{t.label}</span>
            {!!t.badge && (
              <span style={{
                background: activeTab === t.id ? '#fff' : 'var(--teal)',
                color: activeTab === t.id ? 'var(--teal)' : '#fff',
                fontSize: '10.5px',
                padding: '2px 8px',
                borderRadius: '20px',
                fontWeight: 900
              }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════ TAB PANEL CONTENT ════════════════ */}
      <div style={{ animation: 'fadeIn 0.3s ease' }}>
        
        {/* 1. LOAN REQUESTS INBOX TAB */}
        {activeTab === 'inbox' && (
          <div className="card" style={{ padding: '24px', borderRadius: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0f172a', margin: 0 }}>📥 Public Submissions Inbox</h3>
                <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>Requests submitted by borrowers using your unique code link</p>
              </div>
            </div>

            {inboxSubmissions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📨</div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>Inbox is Empty</div>
                <p style={{ fontSize: '13px', maxWidth: '360px', margin: '6px auto 0' }}>Share your public link with applicants to receive loan requests directly.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Applicant</th>
                      <th>Category</th>
                      <th>Amount</th>
                      <th>Date Received</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inboxSubmissions.map((sub: any) => (
                      <tr key={sub.id}>
                        <td>
                          <b>{sub.requester_name}</b>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{sub.requester_phone}</div>
                        </td>
                        <td>
                          <span style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'capitalize' }}>
                            {sub.loan_purpose_category}
                          </span>
                        </td>
                        <td style={{ fontWeight: 800 }}>₹{Number(sub.loan_amount_requested).toLocaleString()}</td>
                        <td style={{ fontSize: '12px' }}>{new Date(sub.submitted_at).toLocaleDateString()}</td>
                        <td>
                          <span className={`bdg ${
                            sub.status === 'new' ? 'bdg-gr' :
                            sub.status === 'forwarded' ? 'bdg-g' : 'bdg-r'
                          }`}>
                            {sub.status === 'new' ? 'NEW' :
                             sub.status === 'forwarded' ? 'FORWARDED' : 'REJECTED'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="bsm s"
                            onClick={() => setSelectedSub(sub)}
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                          >
                            Review Details →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 2. LOANS I FILED TAB */}
        {activeTab === 'filed' && (
          <div className="card" style={{ padding: '24px', borderRadius: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0f172a', margin: 0 }}>📋 Loans Filed by You</h3>
                <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>Track borrowers you helped apply for support</p>
              </div>
              <button type="button" className="bsm s" onClick={() => navigate(`${prefix}/apply`)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={15} /> File New Loan Account
              </button>
            </div>

            {myFiledLoans.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📝</div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>No Loans Filed Yet</div>
                <p style={{ fontSize: '13px', maxWidth: '360px', margin: '6px auto 0' }}>Click "File New Loan Account" or forward a request from your inbox.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Loan No.</th>
                      <th>Borrower</th>
                      <th>Source</th>
                      <th>Amount</th>
                      <th>Outstanding</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myFiledLoans.map((loan: any) => (
                      <tr key={loan.id}>
                        <td style={{ fontSize: '12px', fontWeight: 700 }}>{loan.id}</td>
                        <td>
                          <b>{loan.name}</b>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{loan.mob || loan.phone}</div>
                        </td>
                        <td>
                          <span style={{ fontSize: '10.5px', fontWeight: 900, padding: '2px 8px', borderRadius: '6px', background: loan.submission_source === 'inbox' ? 'var(--teal-pale)' : '#f1f5f9', color: loan.submission_source === 'inbox' ? 'var(--teal)' : '#475569' }}>
                            {String(loan.submission_source || 'manual').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ fontWeight: 800 }}>₹{loan.amt.toLocaleString()}</td>
                        <td style={{ color: 'var(--red)', fontWeight: 800 }}>₹{(loan.remaining_balance ?? loan.amt).toLocaleString()}</td>
                        <td>
                          <span style={{ fontSize: '10px', fontWeight: 900, padding: '4px 10px', borderRadius: 20, background: loan.status === 'approved' ? '#f0fdf4' : loan.status === 'pending' ? '#fff7ed' : '#fef2f2', color: loan.status === 'approved' ? '#10b981' : loan.status === 'pending' ? '#f59e0b' : '#ef4444' }}>
                            {loan.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {loan.status === 'approved' && (loan.remaining_balance ?? loan.amt) > 0 && (
                            <button
                              type="button"
                              className="bsm s"
                              onClick={() => handleWhatsAppReminder(loan)}
                              style={{ background: '#25D366', borderColor: '#25D366', color: '#fff', fontSize: '11.5px', padding: '6px 12px', fontWeight: 800 }}
                            >
                              📲 Send Alert
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 3. INVENTORY TAB */}
        {activeTab === 'inventory' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            
            {/* Left Column: Checkout request form & Items Checked Out */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Checked out units */}
              <div className="card" style={{ padding: '24px', borderRadius: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', marginBottom: '16px' }}>🛡️ Items Checked Out to You</h3>
                
                {myUnits.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', background: '#f8fafc', borderRadius: '16px' }}>
                    <div style={{ fontSize: '24px', marginBottom: '6px' }}>📦</div>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>No items currently in hand.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {myUnits.map((u: any) => {
                      const prodName = products.find(p => p.id === u.product_id)?.name || 'Inventory Item';
                      const pendingRet = returnRequests.some(rr => rr.unit_id === u.id && rr.status === 'pending');
                      return (
                        <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', borderRadius: '16px', border: '1.5px solid #f1f5f9', background: '#fff' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b' }}>{prodName}</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Barcode: {u.barcode} · Unit Code: {u.unit_code}</div>
                          </div>
                          {pendingRet ? (
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#f59e0b', background: '#fff7ed', padding: '4px 10px', borderRadius: '10px' }}>Pending Admin Confirmation</span>
                          ) : (
                            <button type="button" className="bsm g" onClick={() => handleReturnRequest(u)} style={{ fontSize: '11.5px', padding: '6px 12px' }}>
                              🔄 Return Item
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Request Checkout */}
              <div className="card" style={{ padding: '24px', borderRadius: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', marginBottom: '12px' }}>➕ Request Inventory Checkout</h3>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Request new equipment or support kit leases from stock warehouse</p>

                <button
                  type="button"
                  className="bsm s"
                  onClick={() => setShowCheckoutModal(true)}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', fontSize: '13.5px', fontWeight: 800 }}
                >
                  Create Checkout Request Form →
                </button>
              </div>

              {/* Request status pipeline */}
              <div className="card" style={{ padding: '24px', borderRadius: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', marginBottom: '16px' }}>⏳ Request Pipeline Status</h3>
                
                {checkoutRequests.length === 0 && returnRequests.length === 0 ? (
                  <div style={{ textShadow: 'none', color: 'var(--muted)', fontSize: '12.5px', textAlign: 'center', padding: '16px 0' }}>
                    No recent checkout/return requests logged.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                    {checkoutRequests.map((r: any) => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                        <div>
                          <b>Checkout: {r.product_name}</b> (Qty: {r.quantity})
                          <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '2px' }}>Purpose: {r.purpose}</div>
                        </div>
                        <span className={`bdg ${r.status === 'approved' ? 'bdg-g' : r.status === 'rejected' ? 'bdg-r' : 'bdg-gr'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>
                          {r.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                    {returnRequests.map((r: any) => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                        <div>
                          <b>Return: {r.product_name}</b> (Code: {r.unit_code})
                        </div>
                        <span className={`bdg ${r.status === 'approved' ? 'bdg-g' : r.status === 'rejected' ? 'bdg-r' : 'bdg-gr'}`} style={{ fontSize: '9px', padding: '2px 8px' }}>
                          {r.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Right Column: Catalog Stock Count */}
            <div className="card" style={{ padding: '24px', borderRadius: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', marginBottom: '16px' }}>📦 Available Catalog &amp; Stock Levels</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', maxHeight: '550px', overflowY: 'auto', paddingRight: '4px' }}>
                {products.map((p: any) => (
                  <div key={p.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px', borderRadius: '16px', border: '1.5px solid #f1f5f9', background: '#f8fafc' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--teal-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', overflow: 'hidden' }}>
                      {p.photo ? <img src={p.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📦'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Category: {p.category}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: 900, color: p.available_quantity > 0 ? 'var(--teal)' : 'var(--red)' }}>
                        {p.available_quantity} / {p.total_quantity}
                      </div>
                      <div style={{ fontSize: '9px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Available</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* 4. MY PROFILE TAB */}
        {activeTab === 'profile' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '24px' }}>
            
            {/* Left: profile details card */}
            <div className="card" style={{ padding: '30px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0f172a', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '10px', margin: 0 }}>Helper Info</h3>
              
              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Name</label>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{profile.name}</div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Login Email</label>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{profile.email}</div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Contact Phone</label>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{profile.phone || '—'}</div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Assigned Zone / Branch</label>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                  {profile.assigned_zone || 'None'} / {profile.branch || 'Poyanad Central'}
                </div>
              </div>
            </div>

            {/* Right: public sharing card */}
            <div className="card" style={{ padding: '30px', borderRadius: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0f172a', marginBottom: '16px' }}>📲 Your Public Sharing Link</h3>
              
              {/* QR Code container */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '20px', border: '1.5px solid #e2e8f0', marginBottom: '20px' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${window.location.origin}/request/${profile.member_unique_code}`)}`}
                  alt="Public Link QR Code"
                  style={{ display: 'block', width: '180px', height: '180px', borderRadius: '10px' }}
                />
              </div>

              <div style={{ background: '#f1f5f9', padding: '12px 16px', borderRadius: '12px', fontSize: '12.5px', color: '#475569', fontWeight: 700, width: '100%', wordBreak: 'break-all', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                {window.location.origin}/request/{profile.member_unique_code || 'MBR-CODE'}
              </div>

              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <button type="button" onClick={handleCopyLink} style={{ flex: 1, background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Copy size={15} /> {copySuccess ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = `Need financial assistance? File a loan request directly through my SKSSF helper link: ${window.location.origin}/request/${profile.member_unique_code}`;
                    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
                  }}
                  style={{ flex: 1, background: '#25D366', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Share2 size={15} /> WhatsApp
                </button>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ════════════════ MODALS ════════════════ */}

      {/* 1. VIEW INBOX SUBMISSION DETAILS MODAL */}
      {selectedSub && (
        <div className="ov" onClick={e => { if ((e.target as HTMLElement).classList.contains('ov')) setSelectedSub(null); }}>
          <div className="modal wide" style={{ maxWidth: '720px' }}>
            <div className="modal-head">
              <div className="modal-title">Review Public Submission</div>
              <button type="button" className="modal-close" onClick={() => setSelectedSub(null)}>✕</button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Applicant Name</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{selectedSub.requester_name}</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Contact Mobile</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{selectedSub.requester_phone}</div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Address</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginTop: '2px', lineHeight: 1.5 }}>{selectedSub.requester_address}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Requested Amt</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--teal)', marginTop: '2px' }}>₹{Number(selectedSub.loan_amount_requested).toLocaleString()}</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Monthly Income</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#334155', marginTop: '2px' }}>₹{Number(selectedSub.monthly_income).toLocaleString()}</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Preferred Tenure</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#334155', marginTop: '2px' }}>{selectedSub.preferred_tenure_months || 12} Months</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Other Active Loans?</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: selectedSub.has_existing_loans ? 'var(--red)' : '#0d9488', marginTop: '2px' }}>
                    {selectedSub.has_existing_loans ? `Yes (₹${Number(selectedSub.existing_loan_amount || 0).toLocaleString()} outstanding)` : 'No'}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Collateral Offered?</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', marginTop: '2px' }}>
                    {selectedSub.has_collateral ? `Yes (${selectedSub.collateral_description})` : 'No'}
                  </div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Loan Purpose specifics</div>
                <div style={{ fontSize: '13.5px', color: '#334155', marginTop: '4px', lineHeight: 1.5 }}>
                  <b>Category:</b> {selectedSub.loan_purpose_category.toUpperCase()}<br/>
                  <b>Details:</b> {selectedSub.loan_purpose_detail || 'No additional details provided.'}
                </div>
              </div>

              {selectedSub.document_url && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Supporting Document</div>
                  <a href={selectedSub.document_url} download={`doc-${selectedSub.requester_name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--teal)', fontWeight: 800, fontSize: '13px', textDecoration: 'underline' }}>
                    📥 Download Document File
                  </a>
                </div>
              )}

              {selectedSub.status === 'rejected' && (
                <div style={{ background: 'var(--red-pale)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--red)', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>
                  <b>Rejection Reason:</b> {selectedSub.rejection_reason}
                </div>
              )}
            </div>

            <div className="modal-foot">
              <button type="button" className="bsm g" onClick={() => setSelectedSub(null)}>Close</button>
              {selectedSub.status === 'new' && (
                <>
                  <button type="button" className="bsm r" onClick={() => setShowRejectModal(true)}>Reject Request</button>
                  <button type="button" className="bsm s" onClick={() => setShowForwardModal(true)}>Forward to Coordinator Queue 🚀</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. FORWARD REQUEST MODAL */}
      {showForwardModal && selectedSub && (
        <div className="ov" style={{ zIndex: 1100 }}>
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-head">
              <div className="modal-title">Forward request Details</div>
              <button type="button" className="modal-close" onClick={() => setShowForwardModal(false)}>✕</button>
            </div>
            <form onSubmit={handleForwardSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Provide optional witnesses or guarantor details to forward with this loan application.</p>
                
                <div>
                  <label className="fl2">Guarantor Name (Optional)</label>
                  <input className="fi2" placeholder="e.g. Salim K" value={guarantorName} onChange={e => setGuarantorName(e.target.value)} />
                </div>
                <div>
                  <label className="fl2">Guarantor Mobile (Optional)</label>
                  <input className="fi2" placeholder="+91 XXXXX XXXXX" value={guarantorPhone} onChange={e => setGuarantorPhone(e.target.value)} />
                </div>
                <div>
                  <label className="fl2">Witness 1 Name (Optional)</label>
                  <input className="fi2" placeholder="e.g. Faisal P" value={witness1} onChange={e => setWitness1(e.target.value)} />
                </div>
                <div>
                  <label className="fl2">Witness 2 Name (Optional)</label>
                  <input className="fi2" placeholder="e.g. Shareef A" value={witness2} onChange={e => setWitness2(e.target.value)} />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="bsm g" onClick={() => setShowForwardModal(false)}>Cancel</button>
                <button type="submit" className="bsm s">Forward Application →</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. REJECT REQUEST MODAL */}
      {showRejectModal && selectedSub && (
        <div className="ov" style={{ zIndex: 1100 }}>
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div className="modal-head">
              <div className="modal-title">Provide Rejection Reason</div>
              <button type="button" className="modal-close" onClick={() => setShowRejectModal(false)}>✕</button>
            </div>
            <form onSubmit={handleRejectSubmit}>
              <div className="modal-body">
                <label className="fl2">Reason for Rejection *</label>
                <textarea required className="ta2" rows={3} placeholder="Please explain why this request is not forwarded..." value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}></textarea>
              </div>
              <div className="modal-foot">
                <button type="button" className="bsm g" onClick={() => setShowRejectModal(false)}>Cancel</button>
                <button type="submit" className="bsm r">Confirm Reject</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. CREATE CHECKOUT REQUEST MODAL */}
      {showCheckoutModal && (
        <div className="ov">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-head">
              <div className="modal-title">Inventory Checkout Request</div>
              <button type="button" className="modal-close" onClick={() => { setShowCheckoutModal(false); setSelectedProduct(null); }}>✕</button>
            </div>
            <form onSubmit={handleCheckoutSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="fl2">Select Product *</label>
                  <select required className="sel2" onChange={e => {
                    const prod = products.find(p => p.id === e.target.value);
                    setSelectedProduct(prod);
                  }}>
                    <option value="">-- Choose item --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.category}) - Stock: {p.available_quantity}</option>
                    ))}
                  </select>
                </div>
                
                {selectedProduct && (
                  <>
                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', border: '1px solid #e2e8f0' }}>
                      <b>Item Type Context:</b> {selectedProduct.category === 'Equipment' || selectedProduct.category === 'Medical' ? 'Lease / Return required' : 'Permanent / Consumable allocation'}
                    </div>
                    <div>
                      <label className="fl2">Quantity needed *</label>
                      <input className="fi2" type="number" min="1" max={selectedProduct.available_quantity || 1} value={checkoutQty} onChange={e => setCheckoutQty(e.target.value)} />
                    </div>
                  </>
                )}

                <div>
                  <label className="fl2">Purpose / Reason *</label>
                  <textarea required className="ta2" rows={3} placeholder="Please explain what this checkout item will be used for..." value={checkoutPurpose} onChange={e => setCheckoutPurpose(e.target.value)}></textarea>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="bsm g" onClick={() => { setShowCheckoutModal(false); setSelectedProduct(null); }}>Cancel</button>
                <button type="submit" className="bsm s">Submit Checkout Request</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
