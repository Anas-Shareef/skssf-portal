import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import localDb, { syncFromBackend } from '../../lib/localDb';
import { Search, AlertTriangle, Eye, Plus } from 'lucide-react';

export default function FiledLoans() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'PENDING_COORDINATOR_REVIEW' | 'PENDING_APPROVAL_PANEL' | 'APPROVED' | 'REJECTED' | 'REPAYMENT_COMPLETE'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadFiledLoans() {
    if (!profile) return;
    try {
      setLoading(true);
      // Ensure localDb is synced from backend (service-role key, no RLS issues)
      await syncFromBackend();
      const myId = profile.db_id || profile.id;
      const all = localDb.getLoans();
      // Filter by submitted_by_member_id OR applicant_id OR memId matching this member
      const myLoans = all.filter((l: any) =>
        l.submitted_by_member_id === myId ||
        l.applicant_id === myId ||
        l.memId === myId
      );
      // Sort newest first
      myLoans.sort((a: any, b: any) => new Date(b.submittedDate || b.submitted_date || 0).getTime() - new Date(a.submittedDate || a.submitted_date || 0).getTime());
      setLoans(myLoans);
    } catch (err) {
      console.error('Failed to load filed loans:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiledLoans();
  }, [profile]);

  // Also refresh if localDb data changes
  useEffect(() => {
    const handleUpdate = () => loadFiledLoans();
    window.addEventListener('appDataUpdated', handleUpdate);
    return () => window.removeEventListener('appDataUpdated', handleUpdate);
  }, [profile]);

  // Helper: get a normalized workflow status from loan (handles both API and localDb shapes)
  const getWorkflowStatus = (l: any): string => {
    if (l.workflow_status) return l.workflow_status;
    // Map localDb status to workflow status
    const s = (l.status || '').toLowerCase();
    if (s === 'approved') return 'APPROVED';
    if (s === 'rejected') return 'REJECTED_BY_PANEL';
    if (s === 'completed') return 'REPAYMENT_COMPLETE';
    return 'PENDING_COORDINATOR_REVIEW'; // default pending
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
          <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Log of all loan applications submitted on behalf of community borrow requesters</p>
        </div>
        <button onClick={() => navigate('/member/dashboard/apply')} className="bsm s" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> File New Application
        </button>
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
        <div style={{ display: 'flex', justifyContent: 'center', padding: '50px', color: 'var(--teal)' }}>
          <div className="spinner">Loading Applications...</div>
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
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Workflow Status</th>
                  <th style={{ textAlign: 'center', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoans.map((l: any) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 800, color: '#1e293b' }}>{l.requester_name || l.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{l.requester_phone || l.mob || l.phone}</div>
                    </td>
                    <td style={{ padding: '16px', fontWeight: 900, color: 'var(--teal)', fontSize: '14px' }}>
                      ₹{Number(l.loan_amount_requested || l.amt || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '16px', color: '#475569', fontSize: '13px' }}>
                      {new Date(l.created_at || l.submittedDate || l.submitted_date || Date.now()).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '16px' }}>
                      {getStatusBadge(l)}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <button
                        onClick={() => navigate(`/member/dashboard/filed-loans/${l.db_id || l.id}`)}
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
        </div>
      )}
    </div>
  );
}
