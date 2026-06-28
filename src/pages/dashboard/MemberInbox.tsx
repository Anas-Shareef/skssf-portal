import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Inbox, AlertTriangle, Eye, ArrowRight, XCircle, Phone } from 'lucide-react';

export default function MemberInbox() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'DRAFT_UNASSIGNED' | 'CONVERTED' | 'DISMISSED'>('all');
  const [selectedSub, setSelectedSub] = useState<any>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  async function loadInbox() {
    if (!profile) return;
    try {
      setLoading(true);
      // Fetch public requests routed to this member or unreferred
      const { data, error } = await supabase
        .from('loan_requests')
        .select('*')
        .or(`referred_member_id.eq.${profile.db_id || profile.id},referred_member_name.ilike.%${profile.name}%`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error('Failed to load member inbox:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInbox();
  }, [profile]);

  const filteredRequests = requests.filter(r => {
    if (activeTab === 'all') return true;
    return r.status === activeTab;
  });

  const handleDismiss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dismissReason.trim()) {
      showToast('e', 'Reason for dismissal is required.');
      return;
    }
    try {
      const { error } = await supabase
        .from('loan_requests')
        .update({
          status: 'DISMISSED',
          dismissal_reason: dismissReason.trim(),
          dismissed_by: profile?.db_id || profile?.id
        })
        .eq('id', selectedSub.id);

      if (error) throw error;

      showToast('s', 'Request dismissed successfully.');
      setSelectedSub(null);
      setDismissReason('');
      loadInbox();
    } catch (err: any) {
      showToast('e', err.message || 'Dismiss failed.');
    }
  };

  const handleConvert = async (req: any) => {
    try {
      // Mark as converted
      const { error } = await supabase
        .from('loan_requests')
        .update({ status: 'CONVERTED' })
        .eq('id', req.id);

      if (error) throw error;

      // Navigate to apply page with pre-filled state
      navigate('/member/dashboard/apply', {
        state: {
          requester_name: req.requester_name,
          requester_phone: req.requester_phone,
          requester_address: req.requester_address,
          loan_amount_requested: req.approximate_amount,
          purpose: req.reason,
          source_request_id: req.id
        }
      });
    } catch (err: any) {
      showToast('e', 'Failed to initialize conversion.');
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 1000, background: toast.type === 's' ? '#0f172a' : 'var(--red)', color: '#fff', padding: '14px 24px', borderRadius: '16px', fontWeight: 700, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {toast.type === 's' ? '✅' : '⚠️'} {toast.msg}
        </div>
      )}

      <div className="pg-hd fu" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Loan Requests Inbox</h1>
          <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Review preliminary submissions from the public loan request portal</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
        {[
          { id: 'all', lbl: 'All Submissions' },
          { id: 'DRAFT_UNASSIGNED', lbl: 'New Requests' },
          { id: 'CONVERTED', lbl: 'Converted' },
          { id: 'DISMISSED', lbl: 'Dismissed' }
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

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '50px', color: 'var(--teal)' }}>
          <div className="spinner">Loading Inbox...</div>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '20px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
          <Inbox size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: 'var(--teal)' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>Inbox is Empty</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>No incoming loan request matches this filter.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedSub ? '1.5fr 1fr' : '1fr', gap: '24px' }}>
          
          {/* Main List */}
          <div className="card" style={{ background: '#fff', borderRadius: '20px', border: '1.5px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                    <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Applicant</th>
                    <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Amount Requested</th>
                    <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Status</th>
                    <th style={{ textAlign: 'center', padding: '14px 16px', fontSize: '11px', color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: selectedSub?.id === r.id ? '#f0fdfa' : 'transparent' }}>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: 800, color: '#1e293b' }}>{r.requester_name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{new Date(r.created_at).toLocaleDateString()}</div>
                      </td>
                      <td style={{ padding: '16px', fontWeight: 900, color: 'var(--teal)', fontSize: '14px' }}>
                        ₹{Number(r.approximate_amount).toLocaleString()}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span className={`bdg ${
                          r.status === 'CONVERTED' ? 'bdg-g' : 
                          r.status === 'DRAFT_UNASSIGNED' ? 'bdg-a' : 'bdg-r'
                        }`} style={{ fontSize: '10px' }}>
                          {r.status === 'DRAFT_UNASSIGNED' ? 'NEW' : r.status}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <button
                          onClick={() => setSelectedSub(r)}
                          className="bsm g"
                          style={{ padding: '8px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Detail Panel */}
          {selectedSub && (
            <div className="card" style={{ padding: '24px', borderRadius: '20px', background: '#fff', border: '1.5px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '20px', height: 'fit-content' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>Request Details</h3>
                <button onClick={() => setSelectedSub(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: '#334155' }}>
                <div><b>Applicant Name:</b> {selectedSub.requester_name}</div>
                <div><b>Phone Number:</b> <a href={`tel:${selectedSub.requester_phone}`} style={{ color: 'var(--teal)', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Phone size={14} /> {selectedSub.requester_phone}</a></div>
                <div><b>Address:</b> {selectedSub.requester_address}</div>
                <div><b>Amount Requested:</b> <span style={{ fontWeight: 900, color: 'var(--teal)' }}>₹{Number(selectedSub.approximate_amount).toLocaleString()}</span></div>
                <div><b>Reason for Loan:</b> <p style={{ margin: '4px 0 0 0', lineHeight: 1.5, background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>"{selectedSub.reason}"</p></div>
                {selectedSub.referred_member_name && <div><b>Referred Member:</b> {selectedSub.referred_member_name}</div>}
              </div>

              {selectedSub.status === 'DRAFT_UNASSIGNED' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                  <button onClick={() => handleConvert(selectedSub)} className="bsm s" style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    Convert to Loan Request <ArrowRight size={16} />
                  </button>

                  <form onSubmit={handleDismiss} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 900, color: 'var(--red)' }}>Dismissal Reason</label>
                    <textarea
                      placeholder="Enter details on why this request is being dismissed."
                      value={dismissReason}
                      onChange={(e) => setDismissReason(e.target.value)}
                      className="ta2"
                      rows={2}
                      required
                    />
                    <button type="submit" className="bsm r" style={{ width: '100%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <XCircle size={15} /> Dismiss Request
                    </button>
                  </form>
                </div>
              )}

              {selectedSub.status === 'DISMISSED' && (
                <div style={{ padding: '12px', background: '#fef2f2', borderLeft: '4px solid var(--red)', borderRadius: '8px', fontSize: '13px', color: '#991b1b' }}>
                  <b>Dismissed Reason:</b> "{selectedSub.dismissal_reason}"
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
