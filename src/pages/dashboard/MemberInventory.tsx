import React, { useState, useEffect } from 'react';
import { Search, AlertTriangle, CheckCircle2, Calendar, ShieldCheck, RefreshCw, X, HelpCircle, Package, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface InventoryItem {
  id: string;
  name: string;
  category_id: string;
  item_type: 'lease' | 'permanent';
  total_stock: number;
  available_stock: number;
  lease_duration_days: number | null;
  description: string | null;
  photo_url: string | null;
  is_active: boolean;
  categories?: {
    name: string;
  };
}

interface CheckoutRecord {
  id: string;
  member_id: string;
  item_id: string;
  quantity: number;
  item_type_at_checkout: 'lease' | 'permanent';
  checkout_date: string;
  due_return_date: string | null;
  actual_return_date: string | null;
  status: 'active' | 'returned' | 'overdue';
  return_condition: 'good' | 'damaged' | 'lost' | null;
  condition_flag: boolean;
  condition_notes: string | null;
  notes: string | null;
  items?: InventoryItem;
}

interface Category {
  id: string;
  name: string;
}

export default function MemberInventory() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'catalogue' | 'my-items'>('catalogue');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [myCheckouts, setMyCheckouts] = useState<CheckoutRecord[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState<'all' | 'lease' | 'permanent'>('all');

  // Checkout modal
  const [checkoutItem, setCheckoutItem] = useState<InventoryItem | null>(null);
  const [checkoutQty, setCheckoutQty] = useState(1);
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);

  // Return modal
  const [returnCheckout, setReturnCheckout] = useState<CheckoutRecord | null>(null);
  const [returnCondition, setReturnCondition] = useState<'good' | 'damaged' | 'lost'>('good');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  const popToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const getHeaders = () => {
    const token = sessionStorage.getItem('active_api_token') || '';
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  // Load Categories & Items
  const loadCatalogue = async () => {
    try {
      setLoading(true);
      // Fetch categories
      const catRes = await fetch('/api/inventory-categories', { headers: getHeaders() });
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.categories || []);
      }

      // Fetch items
      const itemRes = await fetch('/api/inventory-items', { headers: getHeaders() });
      if (itemRes.ok) {
        const itemData = await itemRes.json();
        setItems(itemData.items || []);
      } else {
        const err = await itemRes.json();
        throw new Error(err.error || 'Failed to load items');
      }
    } catch (err: any) {
      popToast('e', err.message || 'Error loading catalogue');
    } finally {
      setLoading(false);
    }
  };

  // Load Member's Checkouts
  const loadMyItems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/inventory-checkouts?mine=true', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setMyCheckouts(data.checkouts || []);
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to load checkouts');
      }
    } catch (err: any) {
      popToast('e', err.message || 'Error loading checkouts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'catalogue') {
      loadCatalogue();
    } else {
      loadMyItems();
    }
  }, [activeTab]);

  // Handle Checkout Submit
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutItem) return;

    if (checkoutQty <= 0 || checkoutQty > checkoutItem.available_stock) {
      popToast('e', `Invalid quantity. Select between 1 and ${checkoutItem.available_stock}.`);
      return;
    }

    try {
      setCheckoutSubmitting(true);
      const res = await fetch('/api/inventory-checkouts', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          item_id: checkoutItem.id,
          quantity: checkoutQty,
          notes: checkoutNotes
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');

      popToast('s', `Checkout completed! Grabbed ${checkoutQty}x "${checkoutItem.name}"`);
      setCheckoutItem(null);
      setCheckoutQty(1);
      setCheckoutNotes('');
      loadCatalogue();
    } catch (err: any) {
      popToast('e', err.message || 'Checkout failed');
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  // Handle Return Submit (Self Check-in)
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnCheckout) return;

    try {
      setReturnSubmitting(true);
      const res = await fetch('/api/inventory-checkout-actions', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'checkin',
          id: returnCheckout.id,
          return_condition: returnCondition,
          condition_notes: returnNotes
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');

      if (returnCondition === 'good') {
        popToast('s', 'Check-in recorded! Item returned to available stock.');
      } else {
        popToast('e', `Item check-in completed. Marked as ${returnCondition} for admin review.`);
      }

      setReturnCheckout(null);
      setReturnNotes('');
      setReturnCondition('good');
      loadMyItems();
    } catch (err: any) {
      popToast('e', err.message || 'Check-in failed');
    } finally {
      setReturnSubmitting(false);
    }
  };

  // Filter Catalog
  const filteredCatalogue = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) || 
                          (item.description && item.description.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesType = selectedType === 'all' || item.item_type === selectedType;
    return matchesSearch && matchesCategory && matchesType;
  });

  // Split Member Items
  const activeLeaseItems = myCheckouts.filter(c => c.item_type_at_checkout === 'lease' && c.status !== 'returned');
  const permanentItems = myCheckouts.filter(c => c.item_type_at_checkout === 'permanent' || c.status === 'returned');

  // Format Date Status color-coding
  const getOverdueStatus = (dueDateStr: string | null) => {
    if (!dueDateStr) return { label: 'Permanent', style: { color: '#64748b', background: '#f1f5f9' } };
    const today = new Date();
    today.setHours(0,0,0,0);
    const dueDate = new Date(dueDateStr);
    dueDate.setHours(0,0,0,0);

    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Overdue by ${Math.abs(diffDays)}d`, style: { color: '#ef4444', background: '#fee2e2', border: '1.5px solid #fca5a5' } };
    } else if (diffDays <= 3) {
      return { label: `Due in ${diffDays}d`, style: { color: '#ef4444', background: '#fee2e2' } };
    } else if (diffDays <= 7) {
      return { label: `Due in ${diffDays}d`, style: { color: '#d97706', background: '#fef3c7' } };
    } else {
      return { label: `${diffDays} days left`, style: { color: '#059669', background: '#ecfdf5' } };
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)', padding: '30px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Toast Alert */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          background: toast.type === 's' ? '#069669' : '#e11d48',
          color: '#fff',
          padding: '16px 28px',
          borderRadius: '20px',
          fontWeight: 800,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '14px',
          animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {toast.type === 's' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.75px', margin: 0 }}>Inventory Hub</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '6px 0 0 0', fontWeight: 500 }}>Checkout relief supplies or log leases directly—no approval required.</p>
        </div>
        <button 
          onClick={activeTab === 'catalogue' ? loadCatalogue : loadMyItems}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '14px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', borderBottom: '2.5px solid #f1f5f9', paddingBottom: '2px' }}>
        <button
          onClick={() => setActiveTab('catalogue')}
          style={{
            padding: '14px 28px',
            fontWeight: 800,
            fontSize: '15px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'catalogue' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'catalogue' ? 'var(--teal)' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          📦 Catalog Listing
        </button>
        <button
          onClick={() => setActiveTab('my-items')}
          style={{
            padding: '14px 28px',
            fontWeight: 800,
            fontSize: '15px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'my-items' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'my-items' ? 'var(--teal)' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          ⚡ My Items & Leases
        </button>
      </div>

      {/* Loading state */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 0', gap: '16px' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid #f1f5f9', borderTop: '4px solid var(--teal)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>Refreshing inventory ledger...</span>
        </div>
      ) : activeTab === 'catalogue' ? (
        
        /* ──── CATALOGUE TAB ──── */
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '14px', marginBottom: '32px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
              <span style={{ position: 'absolute', left: '16px', top: '15px', color: '#94a3b8' }}>
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Search catalogue items by name, barcode or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="fi2"
                style={{ paddingLeft: '46px', width: '100%', height: '46px', borderRadius: '14px', fontSize: '13px' }}
              />
            </div>
            
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)} 
              className="sel2" 
              style={{ width: '200px', height: '46px', borderRadius: '14px', fontSize: '13px' }}
            >
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {/* Type Filter Pills */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '14px' }}>
              <button 
                onClick={() => setSelectedType('all')}
                style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', background: selectedType === 'all' ? '#fff' : 'transparent', color: selectedType === 'all' ? '#0f172a' : '#64748b', boxShadow: selectedType === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >
                All
              </button>
              <button 
                onClick={() => setSelectedType('lease')}
                style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', background: selectedType === 'lease' ? '#fff' : 'transparent', color: selectedType === 'lease' ? '#0f172a' : '#64748b', boxShadow: selectedType === 'lease' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >
                Lease / Return
              </button>
              <button 
                onClick={() => setSelectedType('permanent')}
                style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', background: selectedType === 'permanent' ? '#fff' : 'transparent', color: selectedType === 'permanent' ? '#0f172a' : '#64748b', boxShadow: selectedType === 'permanent' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >
                Permanent
              </button>
            </div>
          </div>

          {/* Cards Grid */}
          {filteredCatalogue.length === 0 ? (
            <div className="card" style={{ padding: '80px 24px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '2px dashed #e2e8f0' }}>
              <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.4, color: '#64748b' }} />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>No Catalogue Matches</h3>
              <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#94a3b8' }}>Try adjusting your keywords or category filters.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '24px' }}>
              {filteredCatalogue.map(item => (
                <div key={item.id} className="card" style={{ background: '#fff', borderRadius: '24px', border: '1.5px solid #f1f5f9', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', transition: 'transform 0.2s', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                  
                  {/* Photo Section */}
                  <div style={{ height: '180px', background: '#f8fafc', borderBottom: '1.5px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px', position: 'relative' }}>
                    {item.photo_url ? (
                      <img src={item.photo_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      item.item_type === 'lease' ? '🛠️' : '📦'
                    )}
                    <span 
                      className={`bdg ${item.item_type === 'lease' ? 'bdg-b' : 'bdg-g'}`} 
                      style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', padding: '6px 12px', borderRadius: '8px' }}
                    >
                      {item.item_type === 'lease' ? 'Lease' : 'Permanent'}
                    </span>
                  </div>

                  {/* Details */}
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      {item.categories?.name || 'Uncategorized'}
                    </div>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>{item.name}</h3>
                    <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b', lineHeight: 1.5, flex: 1 }}>{item.description || 'No description provided.'}</p>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid #f8fafc', paddingTop: '16px', marginBottom: '20px' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stock Available</div>
                        <div style={{ fontSize: '18px', fontWeight: 950, color: item.available_stock > 0 ? 'var(--teal)' : '#ef4444' }}>
                          {item.available_stock > 0 ? `${item.available_stock} Units` : 'Out of Stock'}
                        </div>
                      </div>
                      {item.item_type === 'lease' && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Duration</div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>{item.lease_duration_days || 30} Days</div>
                        </div>
                      )}
                    </div>

                    <button
                      disabled={item.available_stock <= 0}
                      onClick={() => {
                        setCheckoutItem(item);
                        setCheckoutQty(1);
                      }}
                      className="bsm s"
                      style={{ 
                        width: '100%', 
                        padding: '12px', 
                        fontSize: '13px', 
                        fontWeight: 800, 
                        borderRadius: '12px',
                        background: item.available_stock <= 0 ? '#cbd5e1' : 'var(--teal)',
                        cursor: item.available_stock <= 0 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {item.available_stock <= 0 ? '🚫 Unavailable' : '⚡ Direct Checkout'}
                    </button>
                  </div>

                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        
        /* ──── MY ITEMS TAB ──── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
          
          {/* Active Leased Items Section */}
          <div className="card" style={{ padding: '28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Clock style={{ color: 'var(--teal)' }} size={20} />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>Active Leases</h3>
            </div>
            
            {activeLeaseItems.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                <CheckCircle2 size={36} style={{ margin: '0 auto 12px', opacity: 0.5, color: '#10b981' }} />
                <div style={{ fontWeight: 800, color: '#1e293b' }}>All Leases Clear!</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>You do not currently have any active lease items to return.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Item</th>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Qty</th>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Checkout Date</th>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Expected Return</th>
                      <th style={{ textAlign: 'center', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Status</th>
                      <th style={{ textAlign: 'right', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeLeaseItems.map(c => {
                      const overdueInfo = getOverdueStatus(c.due_return_date);
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '16px 14px' }}>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.items?.name || 'Loading Item...'}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>ID: {c.item_id.substring(0, 8)}</div>
                          </td>
                          <td style={{ padding: '16px 14px', fontWeight: 800, color: '#334155' }}>{c.quantity}</td>
                          <td style={{ padding: '16px 14px', fontSize: '13px', color: '#64748b' }}>
                            {c.checkout_date ? new Date(c.checkout_date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'N/A'}
                          </td>
                          <td style={{ padding: '16px 14px', fontSize: '13px', fontWeight: 800, color: '#334155' }}>
                            {c.due_return_date ? new Date(c.due_return_date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'N/A'}
                          </td>
                          <td style={{ padding: '16px 14px', textAlign: 'center' }}>
                            <span style={{ 
                              padding: '5px 12px', 
                              borderRadius: '8px', 
                              fontSize: '11px', 
                              fontWeight: 900,
                              textTransform: 'uppercase',
                              ...overdueInfo.style
                            }}>
                              {overdueInfo.label}
                            </span>
                          </td>
                          <td style={{ padding: '16px 14px', textAlign: 'right' }}>
                            <button
                              onClick={() => setReturnCheckout(c)}
                              className="bsm s"
                              style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, borderRadius: '10px' }}
                            >
                              ↩️ Check In
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

          {/* Permanent Items & Return History Section */}
          <div className="card" style={{ padding: '28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <ShieldCheck style={{ color: '#059669' }} size={20} />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>Permanent Allocations & Return History</h3>
            </div>

            {permanentItems.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                No past returned items or permanent aid allocations recorded.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Item</th>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Qty</th>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Checkout Date</th>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Return Date</th>
                      <th style={{ textAlign: 'right', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Allocation / Condition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permanentItems.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '16px 14px' }}>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.items?.name || 'Relief Item'}</div>
                        </td>
                        <td style={{ padding: '16px 14px', fontWeight: 800, color: '#334155' }}>{c.quantity}</td>
                        <td style={{ padding: '16px 14px', fontSize: '13px', color: '#64748b' }}>
                          {c.checkout_date ? new Date(c.checkout_date).toLocaleDateString() : 'N/A'}
                        </td>
                        <td style={{ padding: '16px 14px', fontSize: '13px', color: '#64748b' }}>
                          {c.actual_return_date ? new Date(c.actual_return_date).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '16px 14px', textAlign: 'right' }}>
                          {c.item_type_at_checkout === 'permanent' ? (
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '4px 10px', borderRadius: '6px' }}>
                              Permanent Grant
                            </span>
                          ) : (
                            <span style={{ 
                              fontSize: '11px', 
                              fontWeight: 800, 
                              color: c.return_condition === 'good' ? '#059669' : '#e11d48',
                              background: c.return_condition === 'good' ? '#ecfdf5' : '#fee2e2',
                              padding: '4px 10px', 
                              borderRadius: '6px',
                              textTransform: 'uppercase'
                            }}>
                              Returned ({c.return_condition})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Checkout Modal */}
      {checkoutItem && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal" style={{ maxWidth: '480px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.4px' }}>Confirm Supply Checkout</span>
              <button onClick={() => setCheckoutItem(null)} className="modal-close" style={{ fontSize: '22px' }}><X size={20} /></button>
            </div>
            
            <form onSubmit={handleCheckoutSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '16px', fontSize: '13px', lineHeight: 1.5, border: '1px solid #f1f5f9' }}>
                <div><b>Item Name:</b> {checkoutItem.name}</div>
                <div><b>Allocation:</b> {checkoutItem.item_type === 'lease' ? 'Lease (Return Required)' : 'Permanent Grant'}</div>
                {checkoutItem.item_type === 'lease' && (
                  <div style={{ color: 'var(--teal)', fontWeight: 800, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={14} /> Will be expected back in {checkoutItem.lease_duration_days || 30} days.
                  </div>
                )}
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800, fontSize: '13px', color: '#334155' }}>Quantity Required</label>
                <input
                  type="number"
                  min={1}
                  max={checkoutItem.available_stock}
                  value={checkoutQty}
                  onChange={(e) => setCheckoutQty(Number(e.target.value))}
                  className="fi2"
                  style={{ height: '44px', borderRadius: '12px' }}
                  required
                />
                <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px', display: 'block', fontWeight: 500 }}>
                  Maximum Available: {checkoutItem.available_stock} units
                </span>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800, fontSize: '13px', color: '#334155' }}>Checkout Notes (Optional)</label>
                <textarea
                  placeholder="E.g., Sahachari distribution, camp site, emergency rescue..."
                  value={checkoutNotes}
                  onChange={(e) => setCheckoutNotes(e.target.value)}
                  className="ta2"
                  rows={3}
                  style={{ borderRadius: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setCheckoutItem(null)} style={{ flex: 1, height: '46px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                <button type="submit" disabled={checkoutSubmitting} className="bsm s" style={{ flex: 1, height: '46px', borderRadius: '12px', fontSize: '13px', fontWeight: 800 }}>
                  {checkoutSubmitting ? 'Confirming...' : '✅ Checkout Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Check-In Modal */}
      {returnCheckout && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal" style={{ maxWidth: '480px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.4px' }}>Return Supply Check-In</span>
              <button onClick={() => setReturnCheckout(null)} className="modal-close"><X size={20} /></button>
            </div>

            <form onSubmit={handleReturnSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '16px', fontSize: '13px', border: '1px solid #f1f5f9' }}>
                <div><b>Returning Item:</b> {returnCheckout.items?.name}</div>
                <div><b>Quantity Checked-out:</b> {returnCheckout.quantity}</div>
                <div style={{ color: '#ef4444', fontWeight: 800, marginTop: '6px' }}>
                  ⚠️ Check-in will instantly return items to stock if in good condition.
                </div>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800, fontSize: '13px', color: '#334155' }}>Condition of Item(s)</label>
                <select 
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value as any)}
                  className="sel2"
                  style={{ height: '44px', borderRadius: '12px', width: '100%', display: 'block' }}
                >
                  <option value="good">Good condition (return to stock)</option>
                  <option value="damaged">Damaged / Needs repair (withholds stock)</option>
                  <option value="lost">Lost / Misplaced (withholds stock)</option>
                </select>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800, fontSize: '13px', color: '#334155' }}>
                  {returnCondition === 'good' ? 'Return Comments (Optional)' : 'Incident / Damage Explanation'}
                </label>
                <textarea
                  placeholder={returnCondition === 'good' ? "Comments about item status..." : "Explain why the item was damaged or lost. Admins will review."}
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  className="ta2"
                  rows={3}
                  style={{ borderRadius: '12px' }}
                  required={returnCondition !== 'good'}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setReturnCheckout(null)} style={{ flex: 1, height: '46px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                <button type="submit" disabled={returnSubmitting} className="bsm s" style={{ flex: 1, height: '46px', borderRadius: '12px', fontSize: '13px', fontWeight: 800 }}>
                  {returnSubmitting ? 'Submitting...' : '↩️ Submit Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
