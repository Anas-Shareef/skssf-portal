import React, { useState, useEffect, useRef } from 'react';
import { Search, AlertTriangle, CheckCircle2, Calendar, ShieldCheck, RefreshCw, X, HelpCircle, Package, Clock, QrCode } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Html5Qrcode } from 'html5-qrcode';

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
  barcode_value?: string | null;
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
  unit?: {
    barcode_value: string;
  } | null;
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

  // Scanner modal states
  const [showScanner, setShowScanner] = useState(false);
  const [scanMode, setScanMode] = useState<'checkout' | 'checkin'>('checkout');
  const [manualCode, setManualCode] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLookupResult, setScanLookupResult] = useState<any | null>(null);
  const [scanSubmitting, setScanSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);

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
      const catRes = await fetch('/api/inventory?resource=categories', { headers: getHeaders() });
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.categories || []);
      }

      const itemRes = await fetch('/api/inventory?resource=items', { headers: getHeaders() });
      if (itemRes.ok) {
        const itemData = await itemRes.json();
        setItems(itemData.items || []);
      } else {
        const err = await itemRes.json();
        throw new Error(err.error || 'Failed to load catalog');
      }
    } catch (err: any) {
      popToast('e', err.message || 'Error loading catalogue');
    } finally {
      setLoading(false);
    }
  };

  // Load Member's Checkout records
  const loadMyItems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/inventory?resource=checkouts&mine=true', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setMyCheckouts(data.checkouts || []);
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to load checkouts');
      }
    } catch (err: any) {
      popToast('e', err.message || 'Error loading my checkouts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'catalogue') loadCatalogue();
    else loadMyItems();
  }, [activeTab]);

  // Handle Scanner Initialization/Tear-down
  useEffect(() => {
    if (showScanner && !scanLookupResult) {
      const startScanner = async () => {
        try {
          // Add small delay to ensure container element is mounted in DOM
          await new Promise(r => setTimeout(r, 200));
          const html5Qrcode = new Html5Qrcode("member-reader");
          scannerRef.current = html5Qrcode;
          await html5Qrcode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 120 } },
            (decodedText) => {
              handleBarcodeDetected(decodedText);
            },
            () => {} // Suppress noise
          );
        } catch (err) {
          console.warn("Scanner start failed:", err);
          setScanError("Camera access failed. Fallback to typing the barcode code below.");
        }
      };
      startScanner();
    }

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [showScanner, scanLookupResult]);

  // Lookup barcode
  const handleBarcodeDetected = async (code: string) => {
    setScanError(null);
    try {
      const res = await fetch(`/api/inventory?resource=barcode-lookup&barcode=${code.trim()}`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Barcode lookup failed');

      // Stop scanner upon successful detection
      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }

      setScanLookupResult({ code: code.trim(), ...data });
    } catch (err: any) {
      setScanError(err.message || 'Product/Unit barcode not found');
    }
  };

  const handleManualScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleBarcodeDetected(manualCode.trim());
      setManualCode('');
    }
  };

  // Confirm check-out from scanner
  const handleConfirmScanCheckout = async () => {
    if (!scanLookupResult) return;
    try {
      setScanSubmitting(true);
      const isUnit = scanLookupResult.type === 'unit';
      const item = isUnit ? scanLookupResult.item : scanLookupResult.item;
      const unitId = isUnit ? scanLookupResult.unit.id : null;

      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          resource: 'checkouts',
          item_id: item.id,
          unit_id: unitId,
          quantity: 1,
          notes: scanNotes || `Checked out via barcode scan (${scanLookupResult.code})`
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');

      popToast('s', `Successfully checked out "${item.name}"!`);
      handleCloseScanner();
      loadCatalogue();
    } catch (err: any) {
      setScanError(err.message || 'Error checking out');
    } finally {
      setScanSubmitting(false);
    }
  };

  // Confirm return (check-in) from scanner
  const handleConfirmScanCheckin = async () => {
    if (!scanLookupResult) return;
    try {
      setScanSubmitting(true);
      const isUnit = scanLookupResult.type === 'unit';
      
      if (!isUnit) {
        throw new Error('Please scan the unit barcode (e.g. ending in -U01) to return it.');
      }

      // Check if unit is checked out
      const unit = scanLookupResult.unit;
      if (unit.status !== 'checked_out' || !unit.current_checkout_id) {
        throw new Error('This physical unit is not currently marked as checked out.');
      }

      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          resource: 'checkout-actions',
          action: 'checkin',
          id: unit.current_checkout_id,
          return_condition: returnCondition,
          condition_notes: returnNotes || `Returned via barcode scan (${scanLookupResult.code})`
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Return check-in failed');

      popToast('s', `Successfully returned "${scanLookupResult.item.name}" unit!`);
      handleCloseScanner();
      loadCatalogue();
    } catch (err: any) {
      setScanError(err.message || 'Error checking in');
    } finally {
      setScanSubmitting(false);
    }
  };

  const handleCloseScanner = () => {
    setShowScanner(false);
    setScanLookupResult(null);
    setScanError(null);
    setScanNotes('');
    setReturnNotes('');
    setReturnCondition('good');
  };

  // Traditional Checkout Submit
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutItem) return;
    
    if (checkoutQty <= 0 || checkoutQty > checkoutItem.available_stock) {
      popToast('e', `Invalid quantity. Select between 1 and ${checkoutItem.available_stock}.`);
      return;
    }

    try {
      setCheckoutSubmitting(true);
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          resource: 'checkouts',
          item_id: checkoutItem.id,
          quantity: checkoutQty,
          notes: checkoutNotes
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete checkout');

      popToast('s', `Checkout completed! Grabbed ${checkoutQty}x "${checkoutItem.name}"`);
      setCheckoutItem(null);
      setCheckoutNotes('');
      setCheckoutQty(1);
      loadCatalogue();
    } catch (err: any) {
      popToast('e', err.message || 'Checkout error');
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  // Traditional Return Submit
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnCheckout) return;

    try {
      setReturnSubmitting(true);
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          resource: 'checkout-actions',
          action: 'checkin',
          id: returnCheckout.id,
          return_condition: returnCondition,
          condition_notes: returnNotes
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete return');

      popToast('s', 'Return processed successfully!');
      setReturnCheckout(null);
      setReturnNotes('');
      setReturnCondition('good');
      loadMyItems();
    } catch (err: any) {
      popToast('e', err.message || 'Return error');
    } finally {
      setReturnSubmitting(false);
    }
  };

  // Filter Catalog items
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
                          (item.barcode_value && item.barcode_value.toLowerCase().includes(search.toLowerCase())) ||
                          (item.categories?.name && item.categories.name.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesType = selectedType === 'all' || item.item_type === selectedType;
    return matchesSearch && matchesCategory && matchesType;
  });

  // Split Leased vs Permanent
  const activeLeaseItems = myCheckouts.filter(c => c.item_type_at_checkout === 'lease' && c.status !== 'returned');
  const permanentItems = myCheckouts.filter(c => c.item_type_at_checkout === 'permanent' || c.status === 'returned');

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
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setShowScanner(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', border: 'none', background: 'var(--teal)', color: '#fff', borderRadius: '14px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(13,115,119,0.2)' }}
          >
            <QrCode size={14} /> Scan Barcode
          </button>
          <button 
            onClick={activeTab === 'catalogue' ? loadCatalogue : loadMyItems}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '14px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
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

            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '14px' }}>
              <button onClick={() => setSelectedType('all')} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', background: selectedType === 'all' ? '#fff' : 'transparent', color: selectedType === 'all' ? '#0f172a' : '#64748b' }}>All</button>
              <button onClick={() => setSelectedType('lease')} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', background: selectedType === 'lease' ? '#fff' : 'transparent', color: selectedType === 'lease' ? '#0f172a' : '#64748b' }}>Lease</button>
              <button onClick={() => setSelectedType('permanent')} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', background: selectedType === 'permanent' ? '#fff' : 'transparent', color: selectedType === 'permanent' ? '#0f172a' : '#64748b' }}>Permanent</button>
            </div>
          </div>

          {/* Cards Grid */}
          {filteredItems.length === 0 ? (
            <div className="card" style={{ padding: '80px 24px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '2px dashed #e2e8f0' }}>
              <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.4, color: '#64748b' }} />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>No Available Items</h3>
              <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#94a3b8' }}>Try adjustments or filter criteria.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
              {filteredItems.map(item => (
                <div key={item.id} className="card" style={{ background: '#fff', borderRadius: '24px', border: '1.5px solid #f1f5f9', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                  
                  {/* Photo Section */}
                  <div style={{ height: '160px', background: '#f8fafc', borderBottom: '1.5px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '56px', position: 'relative' }}>
                    {item.photo_url ? (
                      <img src={item.photo_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      item.item_type === 'lease' ? '🛠️' : '📦'
                    )}
                    <span className={`bdg ${item.item_type === 'lease' ? 'bdg-b' : 'bdg-g'}`} style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', padding: '5px 10px', borderRadius: '8px' }}>
                      {item.item_type === 'lease' ? 'Lease' : 'Permanent'}
                    </span>
                  </div>

                  {/* Details */}
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      {item.categories?.name || 'Uncategorized'}
                    </div>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>{item.name}</h3>
                    <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b', lineHeight: 1.45, flex: 1 }}>{item.description || 'No description provided.'}</p>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid #f8fafc', paddingTop: '16px', marginBottom: '20px' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Available Stock</div>
                        <div style={{ fontSize: '18px', fontWeight: 950, color: 'var(--teal)' }}>
                          {item.available_stock} / {item.total_stock} Units
                        </div>
                      </div>
                      {item.item_type === 'lease' && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Limit</div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>{item.lease_duration_days || 30} Days</div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setCheckoutItem(item);
                        setCheckoutQty(1);
                      }}
                      disabled={item.available_stock <= 0}
                      className="bsm s"
                      style={{ width: '100%', height: '42px', borderRadius: '12px', background: item.available_stock > 0 ? 'var(--teal)' : '#cbd5e1', cursor: item.available_stock > 0 ? 'pointer' : 'default' }}
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
                            {c.unit?.barcode_value ? (
                              <div style={{ fontSize: '11.5px', color: 'var(--teal)', fontWeight: 800, fontFamily: 'monospace', marginTop: '4px' }}>
                                Unit SKU: {c.unit.barcode_value}
                              </div>
                            ) : (
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>ID: {c.item_id.substring(0, 8)}</div>
                            )}
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
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Transaction Date</th>
                      <th style={{ textAlign: 'center', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Condition</th>
                      <th style={{ textAlign: 'right', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permanentItems.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '16px 14px' }}>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.items?.name || 'Loading Item...'}</div>
                          {c.unit?.barcode_value ? (
                            <div style={{ fontSize: '11.5px', color: 'var(--teal)', fontWeight: 800, fontFamily: 'monospace', marginTop: '4px' }}>
                              Unit SKU: {c.unit.barcode_value}
                            </div>
                          ) : (
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>ID: {c.item_id.substring(0, 8)}</div>
                          )}
                        </td>
                        <td style={{ padding: '16px 14px', fontWeight: 800, color: '#334155' }}>{c.quantity}</td>
                        <td style={{ padding: '16px 14px', fontSize: '13px', color: '#64748b' }}>
                          {c.item_type_at_checkout === 'permanent' ? 'Permanent Grant' : 'Lease Return'}
                        </td>
                        <td style={{ padding: '16px 14px', fontSize: '13px', color: '#64748b' }}>
                          {c.item_type_at_checkout === 'permanent' 
                            ? (c.checkout_date ? new Date(c.checkout_date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'N/A')
                            : (c.actual_return_date ? new Date(c.actual_return_date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'N/A')
                          }
                        </td>
                        <td style={{ padding: '16px 14px', textAlign: 'center' }}>
                          <span style={{ 
                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                            textTransform: 'uppercase',
                            background: c.return_condition === 'good' ? '#e6fcf5' : c.return_condition === 'damaged' ? '#fff4e6' : c.return_condition === 'lost' ? '#fff5f5' : '#f1f5f9',
                            color: c.return_condition === 'good' ? '#0ca678' : c.return_condition === 'damaged' ? '#f76707' : c.return_condition === 'lost' ? '#fa5252' : '#64748b'
                          }}>
                            {c.return_condition || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '16px 14px', textAlign: 'right' }}>
                          <span style={{ 
                            padding: '5px 12px', 
                            borderRadius: '8px', 
                            fontSize: '11px', 
                            fontWeight: 900,
                            textTransform: 'uppercase',
                            background: c.status === 'returned' ? '#ecfdf5' : '#eff6ff',
                            color: c.status === 'returned' ? '#059669' : '#2563eb'
                          }}>
                            {c.status}
                          </span>
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

      {/* Traditional Checkout Modal */}
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

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setCheckoutItem(null)} style={{ flex: 1, height: '48px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '14px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={checkoutSubmitting} className="bsm s" style={{ flex: 1, height: '48px', borderRadius: '14px', fontSize: '14px', cursor: 'pointer' }}>
                  {checkoutSubmitting ? 'Processing...' : 'Confirm Checkout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Traditional Return Modal */}
      {returnCheckout && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal" style={{ maxWidth: '440px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>Process Lease Return</span>
              <button onClick={() => setReturnCheckout(null)} className="modal-close" style={{ fontSize: '22px' }}><X size={20} /></button>
            </div>
            
            <form onSubmit={handleReturnSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '16px', fontSize: '13px', lineHeight: 1.5, border: '1px solid #f1f5f9' }}>
                <div><b>Item Name:</b> {returnCheckout.items?.name}</div>
                <div><b>Leased Qty:</b> {returnCheckout.quantity} Units</div>
                <div><b>Checkout Date:</b> {returnCheckout.checkout_date ? new Date(returnCheckout.checkout_date).toLocaleDateString() : 'N/A'}</div>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800, fontSize: '13px', color: '#334155' }}>Observed Return Condition</label>
                <select 
                  value={returnCondition} 
                  onChange={(e) => setReturnCondition(e.target.value as any)} 
                  className="sel2" 
                  style={{ width: '100%', height: '44px', borderRadius: '12px' }}
                >
                  <option value="good">Good / Reposited (Restores stock count)</option>
                  <option value="damaged">Damaged / Damaged Unit (Loss of stock)</option>
                  <option value="lost">Lost / Misplaced (Loss of stock)</option>
                </select>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800, fontSize: '13px', color: '#334155' }}>Return Notes / Condition Remarks</label>
                <textarea
                  placeholder="Describe details if item is damaged, contents lost, or specify return location..."
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  className="ta2"
                  rows={3}
                  style={{ borderRadius: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setReturnCheckout(null)} style={{ flex: 1, height: '48px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '14px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={returnSubmitting} className="bsm s" style={{ flex: 1, height: '48px', borderRadius: '14px', fontSize: '14px', cursor: 'pointer' }}>
                  {returnSubmitting ? 'Returning...' : 'Confirm Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📷 BARCODE SCANNER OVERLAY MODAL */}
      {showScanner && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, background: 'rgba(15, 23, 42, 0.9)' }}>
          <div className="modal" style={{ maxWidth: '480px', width: '95%', borderRadius: '24px', padding: '0', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', background: '#fff', animation: 'slideUp 0.25s ease' }}>
            
            {/* Header */}
            <div style={{ background: '#0f172a', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>📷</span> BARCODE SCANNER
              </div>
              <button onClick={handleCloseScanner} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24 }}>✕</button>
            </div>

            {/* Content Area */}
            {!scanLookupResult ? (
              <>
                {/* Viewport container */}
                <div style={{ position: 'relative', width: '100%', height: 260, background: '#000', overflow: 'hidden' }}>
                  <div id="member-reader" style={{ width: '100%', height: '100%' }}></div>
                  
                  {/* Cyberpunk Scan Overlay */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    pointerEvents: 'none', border: '30px solid rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div style={{ 
                      width: '100%', height: 110, border: '2px solid rgba(20,184,166,0.5)', 
                      borderRadius: 4, position: 'relative', overflow: 'hidden',
                      boxShadow: '0 0 20px rgba(20,184,166,0.2)'
                    }}>
                      {/* Corners */}
                      <div style={{ position: 'absolute', top: -2, left: -2, width: 16, height: 16, borderTop: '4px solid var(--teal)', borderLeft: '4px solid var(--teal)' }}></div>
                      <div style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderTop: '4px solid var(--teal)', borderRight: '4px solid var(--teal)' }}></div>
                      <div style={{ position: 'absolute', bottom: -2, left: -2, width: 16, height: 16, borderBottom: '4px solid var(--teal)', borderLeft: '4px solid var(--teal)' }}></div>
                      <div style={{ position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderBottom: '4px solid var(--teal)', borderRight: '4px solid var(--teal)' }}></div>
                      
                      {/* Laser Line */}
                      <div style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        background: 'linear-gradient(to bottom, transparent 30%, rgba(20,184,166,0.25) 50%, transparent 70%)',
                        animation: 'scanLaser 2.2s infinite ease-in-out'
                      }}></div>
                      <div style={{
                        position: 'absolute', top: '50%', left: 0, width: '100%', height: 2, 
                        background: 'var(--teal)', boxShadow: '0 0 15px var(--teal)',
                        animation: 'scanLaser 2.2s infinite ease-in-out'
                      }}></div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '24px' }}>
                  <style>
                    {`@keyframes scanLaser { 0% { top: -100%; } 50% { top: 100%; } 100% { top: -100%; } }`}
                  </style>

                  {/* Mode Toggles */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                    {['checkout', 'checkin'].map(m => (
                      <button key={m} onClick={() => setScanMode(m as any)} style={{
                        flex: 1, padding: '12px', borderRadius: 12, fontWeight: 800, fontSize: 13,
                        border: 'none', cursor: 'pointer', transition: 'all .2s',
                        background: scanMode === m ? 'var(--dark)' : '#f1f5f9',
                        color: scanMode === m ? '#fff' : '#64748b'
                      }}>
                        {m === 'checkout' ? '📤 CHECK-OUT' : '📥 CHECK-IN (RETURN)'}
                      </button>
                    ))}
                  </div>

                  {scanError && (
                    <div style={{ padding: '12px', background: '#fef2f2', color: '#b91c1c', borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
                      {scanError}
                    </div>
                  )}

                  {/* Manual input form */}
                  <form onSubmit={handleManualScanSubmit} style={{ display: 'flex', gap: 10 }}>
                    <input 
                      type="text" 
                      placeholder="Or enter barcode manually..." 
                      value={manualCode}
                      onChange={e => setManualCode(e.target.value)}
                      style={{
                        flex: 1, padding: '12px 16px', borderRadius: 12, border: '1.5px solid #e2e8f0',
                        outline: 'none', fontSize: 14, fontFamily: 'monospace'
                      }}
                    />
                    <button type="submit" style={{
                      background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 12,
                      padding: '0 20px', fontWeight: 800, cursor: 'pointer'
                    }}>Lookup</button>
                  </form>
                </div>
              </>
            ) : (
              /* Resolved lookup confirm view */
              <div style={{ padding: '24px' }}>
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9', marginBottom: 20 }}>
                  <div style={{ fontSize: '11px', fontWeight: 900, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {scanLookupResult.type === 'unit' ? 'PHYSICAL UNIT SKU RESOLVED' : 'PRODUCT SKU RESOLVED'}
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '6px 0', color: '#0f172a' }}>
                    {scanLookupResult.item.name}
                  </h3>
                  <div style={{ fontSize: '13px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div><b>Category:</b> {scanLookupResult.item.categories?.name || 'General'}</div>
                    <div><b>Type:</b> {scanLookupResult.item.item_type === 'lease' ? 'Lease' : 'Permanent'}</div>
                    <div><b>Barcode Value:</b> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{scanLookupResult.code}</span></div>
                    {scanLookupResult.type === 'unit' && (
                      <div><b>Unit Status:</b> <span style={{ fontWeight: 800, color: scanLookupResult.unit.status === 'available' ? '#059669' : '#1c7ed6' }}>{scanLookupResult.unit.status.toUpperCase()}</span></div>
                    )}
                  </div>
                </div>

                {scanError && (
                  <div style={{ padding: '12px', background: '#fef2f2', color: '#b91c1c', borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
                    {scanError}
                  </div>
                )}

                {scanMode === 'checkout' ? (
                  /* Checkout Confirmation details */
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <label className="fl2" style={{ fontWeight: 800, fontSize: '13px', color: '#334155' }}>Checkout Note (Optional)</label>
                      <input 
                        type="text" 
                        placeholder="E.g. Sahachari relief work..." 
                        value={scanNotes}
                        onChange={e => setScanNotes(e.target.value)}
                        className="fi2"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setScanLookupResult(null)} style={{ flex: 1, height: '48px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '14px', fontWeight: 800, cursor: 'pointer' }}>Scan Again</button>
                      <button onClick={handleConfirmScanCheckout} disabled={scanSubmitting} className="bsm s" style={{ flex: 1, height: '48px', borderRadius: '14px', fontWeight: 800, cursor: 'pointer' }}>
                        {scanSubmitting ? 'Confirming...' : 'Confirm Check-Out'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Return Confirmation details */
                  <div>
                    <div style={{ marginBottom: 14 }}>
                      <label className="fl2" style={{ fontWeight: 800, fontSize: '13px', color: '#334155' }}>Return Condition</label>
                      <select 
                        value={returnCondition} 
                        onChange={e => setReturnCondition(e.target.value as any)} 
                        className="sel2" 
                        style={{ width: '100%', height: '44px', borderRadius: '12px' }}
                      >
                        <option value="good">Good / Usable (Adds back to stock)</option>
                        <option value="damaged">Damaged (Loss of stock)</option>
                        <option value="lost">Lost / Misplaced (Loss of stock)</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label className="fl2" style={{ fontWeight: 800, fontSize: '13px', color: '#334155' }}>Remarks / Remarks Note</label>
                      <input 
                        type="text" 
                        placeholder="Specify details if damaged or lost..." 
                        value={returnNotes}
                        onChange={e => setReturnNotes(e.target.value)}
                        className="fi2"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setScanLookupResult(null)} style={{ flex: 1, height: '48px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '14px', fontWeight: 800, cursor: 'pointer' }}>Scan Again</button>
                      <button onClick={handleConfirmScanCheckin} disabled={scanSubmitting} className="bsm s" style={{ flex: 1, height: '48px', borderRadius: '14px', fontWeight: 800, cursor: 'pointer' }}>
                        {scanSubmitting ? 'Confirming...' : 'Confirm Return'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
