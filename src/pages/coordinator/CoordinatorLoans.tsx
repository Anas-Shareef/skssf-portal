import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Search, AlertTriangle, Eye } from 'lucide-react';

export default function CoordinatorLoans() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'pending' | 'reviewed'>('pending');
  const [loans, setLoans] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLoans() {
      if (!profile) return;
      try {
        setLoading(true);
        let query = supabase.from('loans').select('*, profiles:submitted_by_member_id(name)');
        
        if (activeTab === 'pending') {
          query = query.eq('workflow_status', 'PENDING_COORDINATOR_REVIEW');
        } else {
          query = query.eq('coordinator_reviewer_id', profile.db_id || profile.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        setLoans(data || []);
      } catch (err) {
        console.error('Failed to load coordinator loans:', err);
      } finally {
        setLoading(false);
      }
    }
    loadLoans();
  }, [activeTab, profile]);

  const filteredLoans = loans.filter(l => 
    (l.requester_name || l.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (String(l.loan_amount_requested || l.amt)).includes(search)
  );

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      <div className="pg-hd fu" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Review Queue</h1>
          <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Verify applicant profiles and forward to the approval panel</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '12px 20px',
            fontWeight: 800,
            fontSize: '14px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'pending' ? '3px solid var(--teal)' : '3px solid transparent',
            color: activeTab === 'pending' ? 'var(--teal)' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Awaiting Verification
        </button>
        <button
          onClick={() => setActiveTab('reviewed')}
          style={{
            padding: '12px 20px',
            fontWeight: 800,
            fontSize: '14px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'reviewed' ? '3px solid var(--teal)' : '3px solid transparent',
            color: activeTab === 'reviewed' ? 'var(--teal)' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          My Verifications History
        </button>
      </div>

      {/* Search Input */}
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <span style={{ position: 'absolute', left: '14px', top: '13px', color: '#94a3b8' }}>
          <Search size={18} />
        </span>
        <input
          type="text"
          placeholder="Search by applicant name or amount..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="fi2"
          style={{ paddingLeft: '44px', width: '100%', borderRadius: '12px' }}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '50px', color: 'var(--teal)' }}>
          <div className="spinner">Loading Queue...</div>
        </div>
      ) : filteredLoans.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '20px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
          <AlertTriangle size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: '#f59e0b' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>Queue is Empty</h3>
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
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Filing Member</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Workflow Status</th>
                  <th style={{ textAlign: 'center', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoans.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 800, color: '#1e293b' }}>{l.requester_name || l.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{l.requester_phone || l.phone}</div>
                    </td>
                    <td style={{ padding: '16px', fontWeight: 900, color: 'var(--teal)', fontSize: '15px' }}>
                      ₹{(l.loan_amount_requested || l.amt).toLocaleString()}
                    </td>
                    <td style={{ padding: '16px', color: '#475569', fontSize: '13px', fontWeight: 700 }}>
                      {l.profiles?.name || 'Manual Admin'}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span className={`bdg ${
                        l.workflow_status === 'APPROVED' ? 'bdg-g' : 
                        l.workflow_status === 'PENDING_COORDINATOR_REVIEW' ? 'bdg-a' :
                        l.workflow_status.includes('REJECTED') ? 'bdg-r' : 'bdg-b'
                      }`} style={{ fontSize: '10px' }}>
                        {l.workflow_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <button
                        onClick={() => navigate(`/coordinator/dashboard/loans/${l.id}`)}
                        className="bsm s"
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
