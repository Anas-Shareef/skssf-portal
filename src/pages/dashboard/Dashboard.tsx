import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { localDb, syncFromBackend } from '../../lib/localDb';
import { supabase } from '../../lib/supabaseClient';
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

function MemberDashboard({ profile, navigate }: any) {
  const [stats, setStats] = useState({
    filed: 0,
    pending: 0,
    dueWeek: 0,
    itemsHeld: 0
  });
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [overdueAlert, setOverdueAlert] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    async function loadStats() {
      if (!profile) return;
      try {
        setLoading(true);
        const memberId = profile.db_id || profile.id;

        // 1. Filed count
        const { count: filedCount } = await supabase
          .from('loans')
          .select('*', { count: 'exact', head: true })
          .eq('submitted_by_member_id', memberId);

        // 2. Pending my action
        const { count: inboxCount } = await supabase
          .from('loan_requests')
          .select('*', { count: 'exact', head: true })
          .eq('referred_member_id', memberId)
          .eq('status', 'DRAFT_UNASSIGNED');

        const { count: pendingLoans } = await supabase
          .from('loans')
          .select('*', { count: 'exact', head: true })
          .eq('submitted_by_member_id', memberId)
          .in('workflow_status', ['PENDING_COORDINATOR_REVIEW', 'PENDING_APPROVAL_PANEL']);

        // 3. Repayments due this week
        const { data: installments } = await supabase
          .from('repayment_installments')
          .select('*, loans!inner(*)')
          .eq('loans.submitted_by_member_id', memberId);

        let dueWeekCount = 0;
        let overdueCount = 0;
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        if (installments) {
          installments.forEach((inst: any) => {
            const dueDate = new Date(inst.due_date);
            const isPaid = inst.status === 'PAID';
            if (!isPaid) {
              if (dueDate >= today && dueDate <= nextWeek) {
                dueWeekCount++;
              }
              if (inst.status === 'OVERDUE' || dueDate < today) {
                overdueCount++;
              }
            }
          });
        }

        // 4. Items held
        const { count: itemsCount } = await supabase
          .from('inventory_checkout_records')
          .select('*', { count: 'exact', head: true })
          .eq('checked_out_by_member_id', memberId)
          .in('status', ['ACTIVE', 'OVERDUE']);

        setStats({
          filed: filedCount || 0,
          pending: (inboxCount || 0) + (pendingLoans || 0),
          dueWeek: dueWeekCount,
          itemsHeld: itemsCount || 0
        });
        setOverdueAlert(overdueCount);

        // Recent activity feed
        const { data: auditLogs } = await supabase
          .from('loan_audit_log')
          .select('*, loans!inner(*)')
          .eq('loans.submitted_by_member_id', memberId)
          .order('performed_at', { ascending: false })
          .limit(10);

        setRecentActivities(auditLogs || []);
      } catch (err) {
        console.error('Failed to load member dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [profile]);

  const handleCopyLink = () => {
    const link = `${window.location.origin}/request/${profile?.member_unique_code || 'MBR-N/A'}`;
    navigator.clipboard.writeText(link);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', color: 'var(--teal)' }}>
        <div className="spinner">Loading Dashboard...</div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Overdue alert banner */}
      {overdueAlert > 0 && (
        <div style={{
          background: '#fef2f2',
          border: '1.5px solid #fecaca',
          padding: '16px 20px',
          borderRadius: '16px',
          color: '#991b1b',
          fontWeight: 800,
          fontSize: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <span>⚠️ You have {overdueAlert} repayment installment(s) currently overdue.</span>
          <button onClick={() => navigate('/member/dashboard/repayments')} className="bsm r" style={{ padding: '8px 16px', fontSize: '12px' }}>
            Follow Up Now
          </button>
        </div>
      )}

      {/* Profile Welcome Header */}
      <div style={{
        background: 'linear-gradient(135deg, var(--teal) 0%, var(--teal2) 100%)',
        padding: '30px',
        borderRadius: '24px',
        color: '#fff',
        boxShadow: '0 10px 30px rgba(13,115,119,0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div>
          <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>
            Member Workspace
          </span>
          <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '8px 0 0 0' }}>Welcome, {profile?.name}</h1>
          <p style={{ margin: '4px 0 0 0', opacity: 0.8, fontSize: '13px' }}>
            Helper Code: <b>{profile?.member_unique_code || 'MBR-N/A'}</b> | Unit: {profile?.branch || 'Poyanad Central'}
          </p>
        </div>
        <button onClick={handleCopyLink} className="bsm s" style={{ background: '#fff', color: 'var(--teal)', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '14px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          {copySuccess ? 'Copied Link!' : 'Copy Share Link'}
        </button>
      </div>

      {/* 4 Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        {[
          { label: 'Loans I Filed', val: stats.filed, icon: '📄', color: 'rgba(13, 115, 119, 0.1)', tColor: 'var(--teal)' },
          { label: 'Pending My Action', val: stats.pending, icon: '⏳', color: 'rgba(245, 158, 11, 0.1)', tColor: '#f59e0b' },
          { label: 'Due This Week', val: stats.dueWeek, icon: '📅', color: 'rgba(99, 102, 241, 0.1)', tColor: '#6366f1' },
          { label: 'Inventory Items Held', val: stats.itemsHeld, icon: '📦', color: 'rgba(16, 185, 129, 0.1)', tColor: '#10b981' }
        ].map((s, idx) => (
          <div key={idx} className="card" style={{ background: '#fff', padding: '24px', borderRadius: '20px', border: '1.5px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>{s.label}</span>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{s.icon}</div>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 950, color: '#0f172a', marginTop: '12px' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Quick Action Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        {[
          { title: 'Requests Inbox', desc: 'Review submissions from public form', path: '/member/dashboard/inbox', emoji: '📥' },
          { title: 'Loans I Filed', desc: 'Track progress of applications', path: '/member/dashboard/filed-loans', emoji: '📄' },
          { title: 'New Application', desc: 'File request on behalf of borrower', path: '/member/dashboard/apply', emoji: '📝' },
          { title: 'Repayments', desc: 'Record installments and EMI proof', path: '/member/dashboard/repayments', emoji: '📊' }
        ].map((t, idx) => (
          <div key={idx} onClick={() => navigate(t.path)} className="card card-hover" style={{ background: '#fff', padding: '20px', borderRadius: '20px', border: '1.5px solid #f1f5f9', cursor: 'pointer', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <span style={{ fontSize: '28px' }}>{t.emoji}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: '#0f172a' }}>{t.title}</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#94a3b8', lineHeight: 1.3 }}>{t.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity Feed */}
      <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 900 }}>📋 Helper Activity Log</h3>
        {recentActivities.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
            No recent activity logged.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recentActivities.map((act) => (
              <div key={act.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', borderLeft: '4px solid var(--teal)', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b' }}>
                    {act.action.replace(/_/g, ' ')} — {act.loans?.requester_name || act.loans?.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{act.notes}</div>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {new Date(act.performed_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
