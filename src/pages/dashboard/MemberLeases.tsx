import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { AlertTriangle, RotateCcw, CheckCircle2 } from 'lucide-react';

export default function MemberLeases() {
  const { profile } = useAuth();
  const [leases, setLeases] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Return modal
  const [selectedLease, setSelectedLease] = useState<any>(null);
  const [returnQty, setReturnQty] = useState(1);
  const [condNotes, setCondNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  async function loadLeaseData() {
    if (!profile) return;
    try {
      setLoading(true);
      // Fetch active leases (ACTIVE, OVERDUE)
      const { data: activeData, error: activeErr } = await supabase
        .from('inventory_checkout_records')
        .select('*')
        .eq('checked_out_by_member_id', profile.db_id || profile.id)
        .in('status', ['ACTIVE', 'OVERDUE']);

      if (activeErr) throw activeErr;
      setLeases(activeData || []);

      // Fetch pending requests
      const { data: pendingData, error: pendingErr } = await supabase
        .from('inventory_checkout_records')
        .select('*')
        .eq('checked_out_by_member_id', profile.db_id || profile.id)
        .eq('status', 'PENDING_APPROVAL');

      if (pendingErr) throw pendingErr;
      setPendingRequests(pendingData || []);
    } catch (err) {
      console.error('Failed to load leases:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeaseData();
  }, [profile]);

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (returnQty <= 0 || returnQty > selectedLease.quantity_checked_out) {
      showToast('e', `Return quantity must be between 1 and ${selectedLease.quantity_checked_out}`);
      return;
    }

    try {
      setSubmitting(true);
      const isFullReturn = returnQty === selectedLease.quantity_checked_out;
      const status = isFullReturn ? 'RETURNED' : selectedLease.status;

      // 1. Update checkout record
      const { error } = await supabase
        .from('inventory_checkout_records')
        .update({
          status: status,
          quantity_returned: Number(selectedLease.quantity_returned || 0) + returnQty,
          return_date: isFullReturn ? new Date().toISOString().split('T')[0] : null,
          condition_notes: condNotes.trim()
        })
        .eq('id', selectedLease.id);

      if (error) throw error;

      // 2. Increment stock in products/inventory_items if LEASE
      if (selectedLease.issue_type === 'LEASE') {
        const { data: item } = await supabase.from('products').select('available_stock').eq('id', selectedLease.item_id).single();
        if (item) {
          await supabase
            .from('products')
            .update({ available_stock: Number(item.available_stock || 0) + returnQty })
            .eq('id', selectedLease.item_id);
        }
      }

      showToast('s', 'Return registered successfully!');
      setSelectedLease(null);
      setCondNotes('');
      loadLeaseData();
    } catch (err: any) {
      showToast('e', err.message || 'Failed to submit return.');
    } finally {
      setSubmitting(false);
    }
  };

  const openReturnModal = (lease: any) => {
    setSelectedLease(lease);
    setReturnQty(lease.quantity_checked_out - (lease.quantity_returned || 0));
    setCondNotes('');
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
          <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>My Leased Items</h1>
          <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Track equipment checkouts, return schedules, and pending requests</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => window.location.assign('/member/dashboard/inventory')}
          style={{
            padding: '12px 20px',
            fontWeight: 800,
            fontSize: '14px',
            border: 'none',
            background: 'none',
            borderBottom: '3px solid transparent',
            color: '#64748b',
            cursor: 'pointer'
          }}
        >
          Browse Catalogue
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 20px',
            fontWeight: 800,
            fontSize: '14px',
            border: 'none',
            background: 'none',
            borderBottom: '3px solid var(--teal)',
            color: 'var(--teal)',
            cursor: 'pointer'
          }}
        >
          My Leases & returns
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '50px', color: 'var(--teal)' }}>
          <div className="spinner">Loading Leases...</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Active leases */}
          <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 900 }}>⚡ Active Checkouts</h3>
            {leases.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                <CheckCircle2 size={36} style={{ margin: '0 auto 10px', opacity: 0.5, color: '#10b981' }} />
                <div style={{ fontWeight: 800 }}>No Active Leases</div>
                <div style={{ fontSize: '12px', marginTop: '2px' }}>You do not currently hold any checked out equipment.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Item Name</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Qty</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Checkout Date</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Expected Return Date</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Status</th>
                      <th style={{ textAlign: 'center', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leases.map((lease) => {
                      const isOverdue = lease.status === 'OVERDUE' || (lease.expected_return_date && new Date(lease.expected_return_date) < new Date());
                      const remaining = lease.quantity_checked_out - (lease.quantity_returned || 0);
                      return (
                        <tr key={lease.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isOverdue ? '#fff5f5' : 'transparent' }}>
                          <td style={{ padding: '16px', fontWeight: 800 }}>{lease.item_name}</td>
                          <td style={{ padding: '16px', fontWeight: 700 }}>{remaining}</td>
                          <td style={{ padding: '16px', fontSize: '13px' }}>{lease.checked_out_date ? new Date(lease.checked_out_date).toLocaleDateString() : 'N/A'}</td>
                          <td style={{ padding: '16px', fontSize: '13px', fontWeight: 800, color: isOverdue ? 'var(--red)' : '#1e293b' }}>
                            {lease.expected_return_date ? new Date(lease.expected_return_date).toLocaleDateString() : 'PERMANENT'}
                          </td>
                          <td style={{ padding: '16px' }}>
                            <span className={`bdg ${isOverdue ? 'bdg-r' : 'bdg-g'}`} style={{ fontSize: '10px' }}>
                              {isOverdue ? 'OVERDUE' : lease.status}
                            </span>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'center' }}>
                            <button
                              onClick={() => openReturnModal(lease)}
                              className="bsm s"
                              style={{ padding: '8px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              <RotateCcw size={14} /> Return
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pending Queue */}
          <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 900 }}>⏳ Pending Approval Requests</h3>
            {pendingRequests.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                No pending requests.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #f1f5f9' }}>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Item Name</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Requested Qty</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Date Requested</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map((req) => (
                      <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '14px', fontWeight: 800 }}>{req.item_name}</td>
                        <td style={{ padding: '14px', fontWeight: 700 }}>{req.quantity_checked_out}</td>
                        <td style={{ padding: '14px' }}><span className={`bdg ${req.issue_type === 'LEASE' ? 'bdg-b' : 'bdg-g'}`} style={{ fontSize: '9px' }}>{req.issue_type}</span></td>
                        <td style={{ padding: '14px', fontSize: '13px' }}>{new Date(req.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: '14px' }}><span className="bdg bdg-a" style={{ fontSize: '10px' }}>PENDING ADMIN</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Return Item Modal */}
      {selectedLease && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: '400px', width: '90%', animation: 'slideUp 0.3s ease' }}>
            <div className="modal-head">
              <span className="modal-title">Return Equipment Unit</span>
              <button onClick={() => setSelectedLease(null)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleReturnSubmit} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '12px', fontSize: '13px' }}>
                <div><b>Item:</b> {selectedLease.item_name}</div>
                <div><b>Total Checked-out:</b> {selectedLease.quantity_checked_out} units</div>
              </div>

              <div>
                <label className="fl2">Quantity to Return</label>
                <input
                  type="number"
                  min={1}
                  max={selectedLease.quantity_checked_out - (selectedLease.quantity_returned || 0)}
                  value={returnQty}
                  onChange={(e) => setReturnQty(Number(e.target.value))}
                  className="fi2"
                  required
                />
              </div>

              <div>
                <label className="fl2">Condition remarks / Notes</label>
                <textarea
                  placeholder="Enter remarks on physical condition (e.g. good, damaged, missing parts)."
                  value={condNotes}
                  onChange={(e) => setCondNotes(e.target.value)}
                  className="ta2"
                  rows={3}
                  required
                />
              </div>

              <div className="modal-foot" style={{ display: 'flex', gap: '8px', padding: '12px 0 0 0', border: 'none' }}>
                <button type="submit" disabled={submitting} className="bsm s" style={{ flex: 1 }}>Confirm Return</button>
                <button type="button" onClick={() => setSelectedLease(null)} className="bsm g">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
