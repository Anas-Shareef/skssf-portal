import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { ClipboardList, CheckCircle2, UserCheck, AlertTriangle, ArrowRight } from 'lucide-react';

export default function CoordinatorDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    pendingReviews: 0,
    reviewsDone: 0,
    panelPending: 0
  });
  const [recentLoans, setRecentLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      if (!profile) return;
      try {
        setLoading(true);
        // 1. Pending reviews count
        const { count: pendingCount } = await supabase
          .from('loans')
          .select('*', { count: 'exact', head: true })
          .eq('workflow_status', 'PENDING_COORDINATOR_REVIEW');

        // 2. Reviews done by me
        const { count: doneCount } = await supabase
          .from('loans')
          .select('*', { count: 'exact', head: true })
          .eq('coordinator_reviewer_id', profile.db_id || profile.id);

        // 3. Panel votes pending (if panel coordinator)
        let panelCount = 0;
        if (profile.is_panel_coordinator) {
          const { count: pCount } = await supabase
            .from('loans')
            .select('*', { count: 'exact', head: true })
            .eq('workflow_status', 'PENDING_APPROVAL_PANEL')
            .is('panel_coordinator_vote', null);
          panelCount = pCount || 0;
        }

        setStats({
          pendingReviews: pendingCount || 0,
          reviewsDone: doneCount || 0,
          panelPending: panelCount
        });

        // Recent loans queue
        const { data: loans } = await supabase
          .from('loans')
          .select('*')
          .or(`workflow_status.eq.PENDING_COORDINATOR_REVIEW,coordinator_reviewer_id.eq.${profile.db_id || profile.id}`)
          .order('created_at', { ascending: false })
          .limit(10);

        setRecentLoans(loans || []);
      } catch (err) {
        console.error('Failed to load coordinator stats:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [profile]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', color: 'var(--teal)' }}>
        <div className="spinner">Loading Dashboard...</div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      {/* Welcome Header */}
      <div style={{
        background: 'linear-gradient(135deg, var(--teal) 0%, var(--teal2) 100%)',
        padding: '30px',
        borderRadius: '24px',
        color: '#fff',
        marginBottom: '30px',
        boxShadow: '0 10px 30px rgba(13,115,119,0.15)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>
              Coordinator Console
            </span>
            <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '8px 0 0 0' }}>Welcome, {profile?.name}</h1>
            <p style={{ margin: '4px 0 0 0', opacity: 0.8, fontSize: '13px' }}>
              Assigned Zone: <b>{profile?.assigned_zone || 'Not Assigned'}</b> | Unit: {profile?.branch || 'Poyanad Central'}
            </p>
          </div>
          {profile?.is_panel_coordinator && (
            <div style={{ background: '#f59e0b', color: '#fff', padding: '8px 16px', borderRadius: '14px', fontSize: '12px', fontWeight: 800 }}>
              🛡️ Assigned Panel Coordinator
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div className="card" style={{ background: '#fff', padding: '24px', borderRadius: '20px', border: '1.5px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>Awaiting Verification</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
              <ClipboardList size={20} />
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 950, color: '#0f172a', marginTop: '12px' }}>{stats.pendingReviews}</div>
          <button className="bsm s" onClick={() => navigate('/coordinator/dashboard/loans')} style={{ marginTop: '16px', width: '100%', fontSize: '12px' }}>
            View Queue <ArrowRight size={14} style={{ marginLeft: '4px' }} />
          </button>
        </div>

        <div className="card" style={{ background: '#fff', padding: '24px', borderRadius: '20px', border: '1.5px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>My Verified Cases</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 950, color: '#0f172a', marginTop: '12px' }}>{stats.reviewsDone}</div>
          <button className="bsm g" onClick={() => navigate('/coordinator/dashboard/loans')} style={{ marginTop: '16px', width: '100%', fontSize: '12px' }}>
            View History
          </button>
        </div>

        {profile?.is_panel_coordinator && (
          <div className="card" style={{ background: '#fff', padding: '24px', borderRadius: '20px', border: '1.5px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>Panel Votes Required</span>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
                <UserCheck size={20} />
              </div>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 950, color: '#0f172a', marginTop: '12px' }}>{stats.panelPending}</div>
            <button className="bsm s" onClick={() => navigate('/coordinator/dashboard/panel-votes')} style={{ marginTop: '16px', width: '100%', fontSize: '12px', backgroundColor: '#6366f1' }}>
              Go to Voting Panel
            </button>
          </div>
        )}
      </div>

      {/* Main Layout Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Recent Pipeline Activity */}
        <div className="card" style={{ padding: '24px', borderRadius: '20px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginBottom: '20px' }}>📋 Verification Pipeline</h2>
          {recentLoans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
              <AlertTriangle size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <p style={{ margin: 0, fontWeight: 700 }}>No active loan requests in pipeline.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #f1f5f9' }}>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Applicant</th>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Amount Requested</th>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Workflow Status</th>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLoans.map((l) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '16px 12px' }}>
                        <div style={{ fontWeight: 800, color: '#1e293b' }}>{l.requester_name || l.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{l.phone || l.requester_phone}</div>
                      </td>
                      <td style={{ padding: '16px 12px', fontWeight: 900, color: 'var(--teal)' }}>
                        ₹{(l.loan_amount_requested || l.amt).toLocaleString()}
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <span className={`bdg ${
                          l.workflow_status === 'APPROVED' ? 'bdg-g' : 
                          l.workflow_status === 'PENDING_COORDINATOR_REVIEW' ? 'bdg-a' :
                          l.workflow_status.includes('REJECTED') ? 'bdg-r' : 'bdg-b'
                        }`} style={{ fontSize: '10px' }}>
                          {l.workflow_status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <button className="bsm s" onClick={() => navigate(`/coordinator/dashboard/loans/${l.id}`)} style={{ padding: '6px 12px', fontSize: '11px' }}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '24px', borderRadius: '20px', backgroundColor: '#fafafa', border: '1.5px solid #f1f5f9' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>🛡️ Coordinator Rules</h3>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <li>Verify requester details via phone or home visits.</li>
              <li>Add clear notes on collateral and guarantor reliability before forwarding.</li>
              <li>Rejections at coordinator level must contain solid, audit-ready justifications.</li>
              <li>If you're the designated panel coordinator, your vote is required for all final decisions.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
