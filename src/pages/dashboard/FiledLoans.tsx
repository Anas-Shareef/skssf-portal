import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Search, Eye, Plus, RefreshCw, AlertCircle, FileText, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

export default function FiledLoans() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETE'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadFiledLoans() {
    if (!profile) return;
    setLoading(true);
    try {
      const memberId = profile.db_id || profile.id;
      
      const { data, error } = await supabase
        .from('loans')
        .select('*')
        .or(`filed_by_member_id.eq.${memberId},submitted_by_member_id.eq.${memberId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const loanList = data || [];
      setLoans(loanList);

      // Fetch count of overdue instalments across member's loans
      const loanIds = loanList.map(l => l.id);
      if (loanIds.length > 0) {
        const { count, error: instErr } = await supabase
          .from('repayment_instalments')
          .select('id', { count: 'exact', head: true })
          .in('loan_id', loanIds)
          .eq('status', 'OVERDUE');

        if (!instErr && count !== null) {
          setOverdueCount(count);
        }
      }
    } catch (err: any) {
      console.error('Failed to load filed loans:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiledLoans();
  }, [profile]);

  const getWorkflowStatus = (l: any): string => {
    return l.workflow_status || l.status || 'PENDING_COORDINATOR_REVIEW';
  };

  const getPanelVotesCount = (l: any): string => {
    let count = 0;
    if (l.president_vote) count++;
    if (l.secretary_vote) count++;
    if (l.panel_coordinator_vote) count++;
    return `${count}/3`;
  };

  // KPI Calculations
  const totalFiled = loans.length;
  const underReviewCount = loans.filter(l => {
    const st = getWorkflowStatus(l);
    return st === 'PENDING_COORDINATOR_REVIEW' || st === 'PENDING_APPROVAL_PANEL';
  }).length;

  const activeLoansCount = loans.filter(l => {
    const st = getWorkflowStatus(l);
    return st === 'APPROVED' || st === 'DISBURSED';
  }).length;

  const filteredLoans = loans.filter(l => {
    const matchesSearch = (l.applicant_name || l.requester_name || l.name || '').toLowerCase().includes(search.toLowerCase());
    const wfStatus = getWorkflowStatus(l);
    
    if (activeTab === 'all') return matchesSearch;
    if (activeTab === 'PENDING') return (wfStatus === 'PENDING_COORDINATOR_REVIEW' || wfStatus === 'PENDING_APPROVAL_PANEL') && matchesSearch;
    if (activeTab === 'APPROVED') return (wfStatus === 'APPROVED' || wfStatus === 'DISBURSED') && matchesSearch;
    if (activeTab === 'REJECTED') return (wfStatus === 'REJECTED_BY_COORDINATOR' || wfStatus === 'REJECTED_BY_PANEL') && matchesSearch;
    if (activeTab === 'COMPLETE') return wfStatus === 'REPAYMENT_COMPLETE' && matchesSearch;
    return matchesSearch;
  });

  const getStatusBadge = (l: any) => {
    const status = getWorkflowStatus(l);
    switch (status) {
      case 'APPROVED':
      case 'DISBURSED':
        return <span className="bdg bdg-g">APPROVED</span>;
      case 'REPAYMENT_COMPLETE':
        return <span className="bdg bdg-g" style={{ backgroundColor: '#059669' }}>FULLY PAID</span>;
      case 'REJECTED_BY_COORDINATOR':
      case 'REJECTED_BY_PANEL':
        return <span className="bdg bdg-r">REJECTED</span>;
      case 'PENDING_COORDINATOR_REVIEW':
        return <span className="bdg bdg-a">PENDING REVIEW</span>;
      case 'PENDING_APPROVAL_PANEL':
        return <span className="bdg bdg-a" style={{ backgroundColor: '#6366f1' }}>UNDER REVIEW</span>;
      default:
        return <span className="bdg">{status.replace(/_/g, ' ')}</span>;
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      
      {/* Header Bar */}
      <div className="pg-hd fu" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Loans I Filed</h1>
          <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Pipeline of all loan requests formally submitted to admin review panel</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={loadFiledLoans} className="bsm g" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => navigate('/member/dashboard/apply')} className="bsm s" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#0f172a' }}>
            <Plus size={16} /> Share Link / Apply
          </button>
        </div>
      </div>

      {/* 4 Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div className="card" style={{ padding: '20px', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total Filed</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#0f172a', marginTop: '4px' }}>{totalFiled}</div>
        </div>

        <div className="card" style={{ padding: '20px', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Under Review</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#3b82f6', marginTop: '4px' }}>{underReviewCount}</div>
        </div>

        <div className="card" style={{ padding: '20px', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Active Loans</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#10b981', marginTop: '4px' }}>{activeLoansCount}</div>
        </div>

        <div className="card" style={{ padding: '20px', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Overdue Repayments</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#ef4444', marginTop: '4px' }}>{overdueCount}</div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e2e8f0', overflowX: 'auto' }}>
          {[
            { id: 'all', lbl: 'All Filed Loans' },
            { id: 'PENDING', lbl: 'Under Review' },
            { id: 'APPROVED', lbl: 'Approved / Active' },
            { id: 'REJECTED', lbl: 'Rejected' },
            { id: 'COMPLETE', lbl: 'Fully Paid' }
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
            placeholder="Search applicant name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="fi2"
            style={{ width: '100%', paddingLeft: '36px', height: '38px', fontSize: '13px' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--teal)' }}>
          <div className="spinner">Loading Filed Loans...</div>
        </div>
      ) : filteredLoans.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
          <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: 'var(--teal)' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>No Filed Loans Found</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>You have not submitted any loan applications under this filter.</p>
        </div>
      ) : (
        <div className="card" style={{ background: '#fff', borderRadius: '24px', border: '1.5px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Applicant Name</th>
                  <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Amount (₹)</th>
                  <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Date Filed</th>
                  <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Coordinator</th>
                  <th style={{ textAlign: 'center', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Panel Vote</th>
                  <th style={{ textAlign: 'center', padding: '14px 18px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoans.map((l) => {
                  const name = l.applicant_name || l.requester_name || l.name || 'Applicant';
                  const amount = l.loan_amount_approved || l.loan_amount_requested || l.amount || 0;
                  const dateStr = l.created_at ? new Date(l.created_at).toLocaleDateString() : '—';
                  const coordStatus = l.coordinator_review_status === 'VERIFIED' ? 'Verified ✓' : (l.coordinator_review_status || 'Not assigned yet');

                  return (
                    <tr
                      key={l.id}
                      onClick={() => navigate(`/member/dashboard/filed-loans/${l.id}`)}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '16px 18px' }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>REF-{(String(l.id)).slice(0, 8).toUpperCase()}</div>
                      </td>

                      <td style={{ padding: '16px 18px', fontWeight: 950, color: 'var(--teal)', fontSize: '15px' }}>
                        ₹{Number(amount).toLocaleString()}
                      </td>

                      <td style={{ padding: '16px 18px', fontSize: '13px', color: '#475569' }}>
                        {dateStr}
                      </td>

                      <td style={{ padding: '16px 18px' }}>
                        {getStatusBadge(l)}
                      </td>

                      <td style={{ padding: '16px 18px', fontSize: '13px', color: '#475569', fontWeight: 700 }}>
                        {coordStatus}
                      </td>

                      <td style={{ padding: '16px 18px', textAlign: 'center', fontWeight: 800, fontSize: '13px', color: '#334155' }}>
                        {getPanelVotesCount(l)}
                      </td>

                      <td style={{ padding: '16px 18px', textAlign: 'center' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/member/dashboard/filed-loans/${l.id}`); }}
                          className="bsm g"
                          style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
