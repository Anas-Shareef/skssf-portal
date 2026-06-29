import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Search, AlertTriangle, Eye, Plus, RefreshCw } from 'lucide-react';

export default function FiledLoans() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'PENDING_COORDINATOR_REVIEW' | 'PENDING_APPROVAL_PANEL' | 'APPROVED' | 'REJECTED' | 'REPAYMENT_COMPLETE'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadFiledLoans() {
    if (!profile) return;
    setLoading(true);
    setError('');
    try {
      // Use the backend API endpoint (service-role key, bypasses Supabase RLS)
      const token = sessionStorage.getItem('active_api_token') || '';
      const res = await fetch('/api/get-member-loans', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      setLoans(data.loans || []);
    } catch (err: any) {
      console.error('Failed to load filed loans:', err);
      setError(err.message || 'Failed to load loans.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiledLoans();
  }, [profile]);

  // Helper: get a normalized workflow status
  const getWorkflowStatus = (l: any): string => {
    if (l.workflow_status) return l.workflow_status;
    const s = (l.status || '').toLowerCase();
    if (s === 'approved') return 'APPROVED';
    if (s === 'rejected') return 'REJECTED_BY_PANEL';
    if (s === 'completed') return 'REPAYMENT_COMPLETE';
    return 'PENDING_COORDINATOR_REVIEW';
  };

  const filteredLoans = loans.filter(l => {
    const matchesSearch = (l.requester_name || l.name || '').toLowerCase().includes(search.toLowerCase());
    const wfStatus = getWorkflowStatus(l);
    if (activeTab === 'all') return matchesSearch;
    if (activeTab === 'REJECTED') {
      return (wfStatus === 'REJECTED_BY_COORDINATOR' || wfStatus === 'REJECTED_BY_PANEL') && matchesSearch;
    }
    return wfStatus === activeTab && matchesSearch;
  });

  const getStatusBadge = (l: any) => {
    const status = getWorkflowStatus(l);
    switch (status) {
      case 'APPROVED':
        return <span className="bdg bdg-g">APPROVED</span>;
      case 'REPAYMENT_COMPLETE':
        return <span className="bdg bdg-g" style={{ backgroundColor: '#059669' }}>FULLY PAID</span>;
      case 'REJECTED_BY_COORDINATOR':
      case 'REJECTED_BY_PANEL':
        return <span className="bdg bdg-r">REJECTED</span>;
      case 'PENDING_COORDINATOR_REVIEW':
        return <span className="bdg bdg-a">AWAITING REVIEW</span>;
      case 'PENDING_APPROVAL_PANEL':
        return <span className="bdg bdg-a" style={{ backgroundColor: '#6366f1' }}>AWAITING PANEL</span>;
      default:
        return <span className="bdg">{status.replace(/_/g, ' ')}</span>;
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      <div className="pg-hd fu" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Loans I Filed</h1>
          <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Log of all loan applications you submitted on behalf of community borrow requesters</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={loadFiledLoans} className="bsm g" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => navigate('/member/dashboard/apply')} className="bsm s" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> File New Application
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {[
          { id: 'all', lbl: 'All Applications' },
          { id: 'PENDING_COORDINATOR_REVIEW', lbl: 'Awaiting Coordinator' },
          { id: 'PENDING_APPROVAL_PANEL', lbl: 'Awaiting Panel' },
          { id: 'APPROVED', lbl: 'Approved' },
          { id: 'REJECTED', lbl: 'Rejected' },
          { id: 'REPAYMENT_COMPLETE', lbl: 'Fully Paid' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            style={{
              padding: '12px 20px',
              fontWeight: 800,
              fontSize: '14px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === t.id ? '3px solid var(--teal)' : '3px solid transparent',
              color: activeTab === t.id ? 'var(--teal)' : '#64748b',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {t.lbl}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <span style={{ position: 'absolute', left: '14px', top: '13px', color: '#94a3b8' }}>
          <Search size={18} />
        </span>
        <input
          type="text"
          placeholder="Search by applicant name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="fi2"
          style={{ paddingLeft: '44px', width: '100%', borderRadius: '12px' }}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '12px', padding: '60px', color: 'var(--teal)' }}>
          <div className="spinner" style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
          <span style={{ fontWeight: 700, fontSize: '14px' }}>Loading your applications...</span>
        </div>
      ) : error ? (
        <div className="card" style={{ padding: '40px 20px', textAlign: 'center', borderRadius: '20px', background: '#fff8f8', border: '1.5px solid #fecaca' }}>
          <AlertTriangle size={36} style={{ margin: '0 auto 12px', color: '#ef4444' }} />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>Failed to Load</h3>
          <p style={{ margin: '6px 0 16px', fontSize: '13px', color: '#94a3b8' }}>{error}</p>
          <button onClick={loadFiledLoans} className="bsm s">Try Again</button>
        </div>
      ) : filteredLoans.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '20px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
          <AlertTriangle size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: 'var(--teal)' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>No Records</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>No loan requests match the current selection.</p>
        </div>
      ) : (
        <div className="card" style={{ background: '#fff', borderRadius: '20px', border: '1.5px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Applicant</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Amount Requested</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Date Filed</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Status</th>
                  <th style={{ textAlign: 'center', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoans.map((l: any) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 800, color: '#1e293b' }}>{l.requester_name || l.name || '—'}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{l.requester_phone || l.mob || l.phone || ''}</div>
                    </td>
                    <td style={{ padding: '16px', fontWeight: 900, color: 'var(--teal)', fontSize: '14px' }}>
                      ₹{Number(l.loan_amount_requested || l.amount || l.amt || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '16px', color: '#475569', fontSize: '13px' }}>
                      {l.created_at ? new Date(l.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '16px' }}>
                      {getStatusBadge(l)}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <button
                        onClick={() => navigate(`/member/dashboard/filed-loans/${l.id}`)}
                        className="bsm g"
                        style={{ padding: '8px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Eye size={14} /> Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
            Showing {filteredLoans.length} of {loans.length} application{loans.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
