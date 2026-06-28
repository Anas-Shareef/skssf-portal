import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Search, AlertTriangle, Plus, ArrowRight } from 'lucide-react';

export default function MemberInventory() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  // Checkout modal states
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [qty, setQty] = useState(1);
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  async function loadInventory() {
    try {
      setLoading(true);
      // Query items from inventory_items / products table
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .gt('available_stock', 0);
      
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error('Failed to load catalogue:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInventory();
  }, []);

  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean)));

  const filteredItems = items.filter(i => {
    const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || i.category === category;
    return matchesSearch && matchesCategory;
  });

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qty <= 0 || qty > selectedItem.available_stock) {
      showToast('e', `Quantity must be between 1 and ${selectedItem.available_stock}`);
      return;
    }
    if (!purpose.trim()) {
      showToast('e', 'Purpose is required.');
      return;
    }

    try {
      setSubmitting(true);
      
      // Calculate return date if LEASE
      let expectedReturnDate = null;
      if (selectedItem.issue_type === 'LEASE' && selectedItem.lease_duration_days) {
        const d = new Date();
        d.setDate(d.getDate() + selectedItem.lease_duration_days);
        expectedReturnDate = d.toISOString().split('T')[0];
      }

      // 1. Insert checkout request
      const { error } = await supabase
        .from('inventory_checkout_records')
        .insert({
          item_id: selectedItem.id,
          item_name: selectedItem.name,
          checked_out_by_member_id: profile?.db_id || profile?.id,
          quantity_checked_out: qty,
          issue_type: selectedItem.issue_type,
          expected_return_date: expectedReturnDate,
          purpose: purpose.trim(),
          status: 'PENDING_APPROVAL'
        });

      if (error) throw error;

      // 2. Insert notifications for admin
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
      if (admins && admins.length > 0) {
        const adminNotifications = admins.map(a => ({
          user_id: a.id,
          title: 'Inventory Checkout requested',
          message: `Member ${profile?.name} has requested checkout of ${selectedItem.name} (Qty: ${qty})`,
          link_url: '/admin/dashboard/inventory'
        }));
        await supabase.from('notifications').insert(adminNotifications);
      }

      showToast('s', 'Checkout request logged and awaiting Admin approval.');
      setSelectedItem(null);
      setQty(1);
      setPurpose('');
      loadInventory();
    } catch (err: any) {
      showToast('e', err.message || 'Checkout request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const openCheckoutModal = (item: any) => {
    setSelectedItem(item);
    setQty(1);
    setPurpose('');
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
          <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Inventory Catalogue</h1>
          <p className="pg-sub" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>Request equipment checkout or permanent aid kits issuance</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => navigate('/member/dashboard/inventory')}
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
          Browse Catalogue
        </button>
        <button
          onClick={() => navigate('/member/dashboard/inventory/my-leases')}
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
          My Leases & returns
        </button>
      </div>

      {/* Filters Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }}>
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Search catalogue items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="fi2"
            style={{ paddingLeft: '40px', width: '100%', borderRadius: '12px' }}
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="sel2" style={{ maxWidth: '200px' }}>
          <option value="all">All Categories</option>
          {categories.map((c, idx) => <option key={idx} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '50px', color: 'var(--teal)' }}>
          <div className="spinner">Loading Catalogue...</div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '20px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
          <AlertTriangle size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: 'var(--teal)' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>Catalogue Empty</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>No items are currently in stock matching your filter.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {filteredItems.map((item) => (
            <div key={item.id} className="card card-hover" style={{ background: '#fff', borderRadius: '20px', border: '1.5px solid #f1f5f9', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              {/* Product Photo section */}
              <div style={{ height: '160px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px', position: 'relative' }}>
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : '📦'}
                <span className={`bdg ${item.issue_type === 'LEASE' ? 'bdg-b' : 'bdg-g'}`} style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '9px', fontWeight: 900 }}>
                  {item.issue_type}
                </span>
              </div>

              {/* Card Body */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>{item.name}</h3>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b', lineHeight: 1.4, flex: 1 }}>{item.description || 'No description provided.'}</p>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>Available Stock</div>
                    <div style={{ fontSize: '16px', fontWeight: 950, color: 'var(--teal)' }}>{item.available_stock} Units</div>
                  </div>
                  {item.issue_type === 'LEASE' && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>Lease Limit</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#475569' }}>{item.lease_duration_days || 30} Days</div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => openCheckoutModal(item)}
                  className="bsm s"
                  style={{ width: '100%', marginTop: '16px', padding: '10px' }}
                >
                  Request Checkout
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Checkout Modal */}
      {selectedItem && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: '440px', width: '90%', animation: 'slideUp 0.3s ease' }}>
            <div className="modal-head">
              <span className="modal-title">Request Item Checkout</span>
              <button onClick={() => setSelectedItem(null)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleCheckoutSubmit} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '12px', fontSize: '13px' }}>
                <div><b>Item:</b> {selectedItem.name}</div>
                <div><b>Type:</b> {selectedItem.issue_type}</div>
                {selectedItem.issue_type === 'LEASE' && (
                  <div style={{ color: 'var(--teal)', fontWeight: 800, marginTop: '4px' }}>
                    📅 Return expected within {selectedItem.lease_duration_days} days of approval.
                  </div>
                )}
              </div>

              <div>
                <label className="fl2">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={selectedItem.available_stock}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="fi2"
                  required
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  Max Available: {selectedItem.available_stock} units
                </span>
              </div>

              <div>
                <label className="fl2">Purpose / Deployment Description</label>
                <textarea
                  placeholder="Detail how and where this equipment/kit will be deployed."
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="ta2"
                  rows={3}
                  required
                />
              </div>

              <div className="modal-foot" style={{ display: 'flex', gap: '8px', padding: '12px 0 0 0', border: 'none' }}>
                <button type="submit" disabled={submitting} className="bsm s" style={{ flex: 1 }}>Submit Checkout Request</button>
                <button type="button" onClick={() => setSelectedItem(null)} className="bsm g">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
