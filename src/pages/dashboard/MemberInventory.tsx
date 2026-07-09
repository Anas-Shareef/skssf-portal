import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, AlertTriangle, CheckCircle2, Calendar, ShieldCheck, RefreshCw, X, Plus, Edit2, 
  Trash2, Sliders, FolderPlus, Package, Printer, EyeOff, ClipboardList, Grid, List, 
  Barcode as BarcodeIcon, Users, QrCode, FileSpreadsheet, Star, HelpCircle, Clock
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import JsBarcode from 'jsbarcode';

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
  public_visible?: boolean;
  public_description?: string | null;
  units?: any[];
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
  manually_returned_by: string | null;
  items?: InventoryItem;
  unit?: {
    barcode_value: string;
  } | null;
}

interface Category {
  id: string;
  name: string;
}

// Subcomponent for rendering barcode SVGs live
function BarcodeSVG({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          width: 1.2,
          height: 38,
          displayValue: true,
          fontSize: 9,
          margin: 2
        });
      } catch (e) {
        console.error('Barcode error:', e);
      }
    }
  }, [value]);

  return <svg ref={svgRef} style={{ maxWidth: '100%' }}></svg>;
}

export default function MemberInventory() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'catalogue' | 'my-items'>('catalogue');
  const [viewMode, setViewMode] = useState<'gallery' | 'table'>('gallery');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [myCheckouts, setMyCheckouts] = useState<CheckoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState<'all' | 'lease' | 'permanent'>('all');

  // Modals state
  const [checkoutItem, setCheckoutItem] = useState<InventoryItem | null>(null);
  const [checkoutQty, setCheckoutQty] = useState(1);
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);

  const [returnCheckout, setReturnCheckout] = useState<CheckoutRecord | null>(null);
  const [returnCondition, setReturnCondition] = useState<'good' | 'damaged' | 'lost'>('good');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Scanner modal state
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMode, setScannerMode] = useState<'checkout' | 'checkin'>('checkout');
  const [manualBarcode, setManualBarcode] = useState('');
  const [scanLookupResult, setScanLookupResult] = useState<any | null>(null);
  const [scanNotes, setScanNotes] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanSubmitting, setScanSubmitting] = useState(false);

  // Review submission state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [selectedReviewItem, setSelectedReviewItem] = useState<InventoryItem | null>(null);

  // Toast alert
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

  // Load Catalog Listing
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
      }
    } catch (err) {
      popToast('e', 'Failed to sync product catalogue.');
    } finally {
      setLoading(false);
    }
  };

  // Load My items
  const loadMyItems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/inventory?resource=checkouts&mine=true', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setMyCheckouts(data.checkouts || []);
      }
    } catch (e) {
      popToast('e', 'Failed to sync checkout holdings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalogue();
  }, []);

  useEffect(() => {
    if (activeTab === 'catalogue') loadCatalogue();
    else loadMyItems();
  }, [activeTab]);

  // Handle traditional checkout request
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutItem) return;

    try {
      setCheckoutSubmitting(true);
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          resource: 'checkouts',
          item_id: checkoutItem.id,
          quantity: checkoutQty,
          notes: checkoutNotes || 'Self-checked out via portal'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to checkout');

      popToast('s', `Checked out "${checkoutItem.name}" successfully!`);
      setCheckoutItem(null);
      setCheckoutNotes('');
      loadCatalogue();
    } catch (err: any) {
      popToast('e', err.message || 'Checkout failed');
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  // Handle traditional return request
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
          condition_notes: returnNotes || 'Returned via portal self-service'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process return');

      popToast('s', `Successfully returned "${returnCheckout.items?.name}"!`);
      setReturnCheckout(null);
      setReturnNotes('');
      loadMyItems();
    } catch (err: any) {
      popToast('e', err.message || 'Return processing failed');
    } finally {
      setReturnSubmitting(false);
    }
  };

  // Scanner manual lookup
  const handleBarcodeLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcode.trim()) return;

    try {
      setScanError('');
      setScanLookupResult(null);
      
      const res = await fetch(`/api/inventory?resource=barcode-lookup&barcode=${manualBarcode.trim()}`, {
        headers: getHeaders()
      });
      
      if (!res.ok) {
        throw new Error('No product or physical unit matches this barcode.');
      }
      
      const data = await res.json();
      setScanLookupResult(data);
    } catch (err: any) {
      setScanError(err.message || 'Error searching barcode');
    }
  };

  // Confirm barcode scanner checkout/checkin
  const handleConfirmScannerAction = async () => {
    if (!scanLookupResult) return;
    try {
      setScanSubmitting(true);
      setScanError('');
      
      const isUnit = scanLookupResult.type === 'unit';
      const item = scanLookupResult.item;
      
      if (scannerMode === 'checkout') {
        const unitId = isUnit ? scanLookupResult.unit.id : null;
        const res = await fetch('/api/inventory', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            resource: 'checkouts',
            item_id: item.id,
            unit_id: unitId,
            member_id: profile?.id,
            quantity: 1,
            notes: scanNotes || 'Checked out via self-scanner barcode lookup'
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Checkout failed');
        }
        popToast('s', `Checked out "${item.name}" unit successfully!`);
      } else {
        // Return / Check-in
        if (!isUnit) {
          throw new Error('Please scan a specific physical UNIT barcode (ending in -UXX) to return.');
        }
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
            return_condition: 'good',
            condition_notes: scanNotes || 'Returned via self-scanner barcode lookup'
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Return check-in failed');
        }
        popToast('s', `Checked in "${item.name}" unit successfully!`);
      }
      
      // Reset state
      setScanLookupResult(null);
      setManualBarcode('');
      setScanNotes('');
      setShowScanner(false);
      loadCatalogue();
    } catch (err: any) {
      setScanError(err.message || 'Action failed');
    } finally {
      setScanSubmitting(false);
    }
  };

  // Star Review submission handler
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReviewItem) return;

    try {
      setReviewSubmitting(true);
      const res = await fetch('/api/inventory?resource=reviews', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          item_id: selectedReviewItem.id,
          rating: reviewRating,
          comment: reviewComment
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Review submission failed');
      }

      popToast('s', 'Review submitted successfully. Jazakallah!');
      setReviewComment('');
      setReviewRating(5);
      setSelectedReviewItem(null);
    } catch (err: any) {
      popToast('e', err.message);
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Filters for Catalogue view
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) || 
                          (item.barcode_value && item.barcode_value.toLowerCase().includes(search.toLowerCase())) ||
                          (item.description && item.description.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesType = selectedType === 'all' || item.item_type === selectedType;
    return matchesSearch && matchesCategory && matchesType && item.is_active;
  });

  const activeLeases = myCheckouts.filter(c => c.status === 'active' && c.item_type_at_checkout === 'lease');
  const permanentItems = myCheckouts.filter(c => c.item_type_at_checkout === 'permanent' || c.status === 'returned');

  const getOverdueStatus = (dueDateStr: string | null) => {
    if (!dueDateStr) return { isOverdue: false, text: 'No Return Limit' };
    const due = new Date(dueDateStr);
    const today = new Date();
    const isOverdue = due < today;
    const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return {
      isOverdue,
      text: isOverdue 
        ? `Overdue by ${Math.abs(diff)} days` 
        : `Due return in ${diff === 0 ? 'Today' : diff + ' days'}`
    };
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
            <QrCode size={14} /> Barcode Scanner
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
            padding: '14px 28px', fontWeight: 800, fontSize: '15px', border: 'none', background: 'none',
            borderBottom: activeTab === 'catalogue' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'catalogue' ? 'var(--teal)' : '#64748b', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          📦 Catalog Listing
        </button>
        <button
          onClick={() => setActiveTab('my-items')}
          style={{
            padding: '14px 28px', fontWeight: 800, fontSize: '15px', border: 'none', background: 'none',
            borderBottom: activeTab === 'my-items' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'my-items' ? 'var(--teal)' : '#64748b', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          ⚡ My Items &amp; Leases
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 0', gap: '16px' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid #f1f5f9', borderTop: '4px solid var(--teal)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>Refreshing inventory ledger...</span>
        </div>
      ) : activeTab === 'catalogue' ? (
        <>
          {/* Filters Bar */}
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

            {/* View Mode Toggle */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '14px', marginLeft: 'auto' }}>
              <button onClick={() => setViewMode('gallery')} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', background: viewMode === 'gallery' ? '#fff' : 'transparent', color: viewMode === 'gallery' ? '#0f172a' : '#64748b' }}>
                <Grid size={13} /> Gallery
              </button>
              <button onClick={() => setViewMode('table')} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#0f172a' : '#64748b' }}>
                <List size={13} /> Table
              </button>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="card" style={{ padding: '80px 24px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '2px dashed #e2e8f0' }}>
              <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.4, color: '#64748b' }} />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>No Available Items</h3>
              <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#94a3b8' }}>Try adjustments or filter criteria.</p>
            </div>
          ) : viewMode === 'gallery' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
              {filteredItems.map(item => (
                <div key={item.id} className="card" style={{ background: '#fff', borderRadius: '24px', border: '1.5px solid #f1f5f9', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                  
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

                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      {item.categories?.name || 'Uncategorized'}
                    </div>
                    <h3 onClick={() => window.open('/catalog/' + item.id, '_blank')} style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--teal)'} onMouseLeave={e => e.currentTarget.style.color = '#0f172a'}>{item.name}</h3>
                    <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b', lineHeight: 1.45, flex: 1 }}>{item.description || 'No description provided.'}</p>
                    
                    {item.barcode_value && (
                      <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '14px' }}>
                        <BarcodeSVG value={item.barcode_value} />
                      </div>
                    )}

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

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          setCheckoutItem(item);
                          setCheckoutQty(1);
                        }}
                        disabled={item.available_stock <= 0}
                        className="bsm s"
                        style={{ flex: 2, height: '42px', borderRadius: '12px', background: item.available_stock > 0 ? 'var(--teal)' : '#cbd5e1', cursor: item.available_stock > 0 ? 'pointer' : 'default' }}
                      >
                        {item.available_stock <= 0 ? '🚫 Unavailable' : '⚡ Direct Checkout'}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedReviewItem(item);
                        }}
                        style={{ flex: 1, height: '42px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                      >
                        <Star size={14} style={{ color: 'gold', fill: 'gold' }} /> Review
                      </button>
                    </div>
                  </div>

                </div>
              ))}
            </div>
          ) : (
            /* Table view for catalog listing */
            <div className="card" style={{ padding: 0, borderRadius: '24px', overflow: 'hidden', border: '1.5px solid #f1f5f9', background: '#fff' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                      <th style={{ padding: '16px 20px', fontWeight: 800 }}>Supply Item</th>
                      <th style={{ padding: '16px 20px', fontWeight: 800 }}>Category</th>
                      <th style={{ padding: '16px 20px', fontWeight: 800 }}>Allocation</th>
                      <th style={{ padding: '16px 20px', fontWeight: 800 }}>Available Status</th>
                      <th style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 800 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '16px 20px' }}>
                          <strong style={{ color: '#0f172a', fontSize: '14.5px' }}>{item.name}</strong>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>SKU SKU: {item.barcode_value || '—'}</div>
                        </td>
                        <td style={{ padding: '16px 20px', fontWeight: 600 }}>{item.categories?.name || 'General'}</td>
                        <td style={{ padding: '16px 20px' }}>
                          <span className={`bdg ${item.item_type === 'lease' ? 'bdg-b' : 'bdg-g'}`}>{item.item_type}</span>
                        </td>
                        <td style={{ padding: '16px 20px', fontWeight: 800, color: item.available_stock > 0 ? '#059669' : '#ef4444' }}>
                          {item.available_stock} Units available
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <button
                            onClick={() => { setCheckoutItem(item); setCheckoutQty(1); }}
                            disabled={item.available_stock <= 0}
                            className="bsm s"
                            style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px' }}
                          >
                            Checkout
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        /* ──── MY ITEMS TAB ──── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
          
          <div className="card" style={{ padding: '28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Clock style={{ color: 'var(--teal)' }} size={20} />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>Active Leases</h3>
            </div>
            
            {activeLeases.length === 0 ? (
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
                    {activeLeases.map(c => {
                      const overdueInfo = getOverdueStatus(c.due_return_date);
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '16px 14px' }}>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.items?.name || 'Loading Item...'}</div>
                            {c.unit?.barcode_value && (
                              <div style={{ fontSize: '11.5px', color: 'var(--teal)', fontWeight: 800, fontFamily: 'monospace', marginTop: '4px' }}>
                                Unit SKU: {c.unit.barcode_value}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '16px 14px', fontWeight: 800, color: '#334155' }}>{c.quantity}</td>
                          <td style={{ padding: '16px 14px', fontSize: '13px', color: '#64748b' }}>
                            {c.checkout_date ? new Date(c.checkout_date).toLocaleDateString() : 'N/A'}
                          </td>
                          <td style={{ padding: '16px 14px', fontSize: '13px', fontWeight: 800, color: overdueInfo.isOverdue ? '#ef4444' : '#334155' }}>
                            {c.due_return_date ? new Date(c.due_return_date).toLocaleDateString() : 'Permanent'}
                          </td>
                          <td style={{ padding: '16px 14px', textAlign: 'center' }}>
                            <span style={{ 
                              padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase',
                              background: overdueInfo.isOverdue ? '#fee2e2' : '#eff6ff',
                              color: overdueInfo.isOverdue ? '#ef4444' : '#2563eb'
                            }}>{overdueInfo.text}</span>
                          </td>
                          <td style={{ padding: '16px 14px', textAlign: 'right' }}>
                            <button
                              onClick={() => {
                                setReturnCheckout(c);
                                setReturnCondition('good');
                              }}
                              className="bsm s"
                              style={{ padding: '6px 14px', borderRadius: '10px', fontSize: '12px' }}
                            >
                              Return / Check-In
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

          {/* Checkout & Return History */}
          <div className="card" style={{ padding: '28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <ShieldCheck style={{ color: 'var(--teal)' }} size={20} />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>Return Ledger &amp; Grants History</h3>
            </div>
            
            {permanentItems.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                No prior returns or permanent grant ledger entries.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Item</th>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Qty</th>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Allocation</th>
                      <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Action Date</th>
                      <th style={{ textAlign: 'center', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Condition</th>
                      <th style={{ textAlign: 'right', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permanentItems.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '16px 14px' }}>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.items?.name || 'Loading Item...'}</div>
                          {c.unit?.barcode_value && <div style={{ fontSize: '11px', color: 'var(--teal)', fontFamily: 'monospace' }}>SKU: {c.unit.barcode_value}</div>}
                        </td>
                        <td style={{ padding: '16px 14px', fontWeight: 800, color: '#334155' }}>{c.quantity}</td>
                        <td style={{ padding: '16px 14px', fontSize: '13px', color: '#64748b' }}>
                          {c.item_type_at_checkout === 'permanent' ? 'Permanent Grant' : 'Lease Return'}
                        </td>
                        <td style={{ padding: '16px 14px', fontSize: '13px', color: '#64748b' }}>
                          {c.item_type_at_checkout === 'permanent' 
                            ? (c.checkout_date ? new Date(c.checkout_date).toLocaleDateString() : 'N/A')
                            : (c.actual_return_date ? new Date(c.actual_return_date).toLocaleDateString() : 'N/A')
                          }
                        </td>
                        <td style={{ padding: '16px 14px', textAlign: 'center' }}>
                          <span style={{ 
                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                            background: c.return_condition === 'good' ? '#e6fcf5' : c.return_condition === 'damaged' ? '#fff4e6' : c.return_condition === 'lost' ? '#fff5f5' : '#f1f5f9',
                            color: c.return_condition === 'good' ? '#0ca678' : c.return_condition === 'damaged' ? '#f76707' : c.return_condition === 'lost' ? '#fa5252' : '#64748b'
                          }}>
                            {c.return_condition || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '16px 14px', textAlign: 'right' }}>
                          <span style={{ 
                            padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase',
                            background: c.status === 'returned' ? '#ecfdf5' : '#eff6ff',
                            color: c.status === 'returned' ? '#059669' : '#2563eb'
                          }}>{c.status}</span>
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
          <div className="modal" style={{ maxWidth: '480px', width: '90%', borderRadius: '24px', padding: '28px' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>Confirm Supply Checkout</span>
              <button onClick={() => setCheckoutItem(null)} className="modal-close"><X size={20} /></button>
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
                <label className="fl2">Quantity Required</label>
                <input
                  type="number"
                  min={1}
                  max={checkoutItem.available_stock}
                  value={checkoutQty}
                  onChange={(e) => setCheckoutQty(Number(e.target.value))}
                  className="fi2"
                  required
                />
                <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px', display: 'block' }}>
                  Maximum Available: {checkoutItem.available_stock} units
                </span>
              </div>

              <div>
                <label className="fl2">Checkout Notes (Optional)</label>
                <textarea
                  placeholder="E.g., Sahachari distribution, camp site, emergency rescue..."
                  value={checkoutNotes}
                  onChange={(e) => setCheckoutNotes(e.target.value)}
                  className="ta2"
                  rows={3}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setCheckoutItem(null)} style={{ flex: 1, height: '48px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '14px', fontWeight: 800, fontSize: '14px' }}>Cancel</button>
                <button type="submit" disabled={checkoutSubmitting} className="bsm s" style={{ flex: 1, height: '48px', borderRadius: '14px', fontSize: '14px' }}>
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
          <div className="modal" style={{ maxWidth: '440px', width: '90%', borderRadius: '24px', padding: '28px' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>Process Lease Return</span>
              <button onClick={() => setReturnCheckout(null)} className="modal-close"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleReturnSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '16px', fontSize: '13px', lineHeight: 1.5, border: '1px solid #f1f5f9' }}>
                <div><b>Item Name:</b> {returnCheckout.items?.name}</div>
                <div><b>Leased Qty:</b> {returnCheckout.quantity} Units</div>
              </div>

              <div>
                <label className="fl2">Observed Return Condition</label>
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
                <label className="fl2">Return Notes / Condition Remarks</label>
                <textarea
                  placeholder="Describe details if item is damaged, contents lost, or specify return location..."
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  className="ta2"
                  rows={3}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setReturnCheckout(null)} style={{ flex: 1, height: '48px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '14px', fontWeight: 800, fontSize: '14px' }}>Cancel</button>
                <button type="submit" disabled={returnSubmitting} className="bsm s" style={{ flex: 1, height: '48px', borderRadius: '14px', fontSize: '14px' }}>
                  {returnSubmitting ? 'Returning...' : 'Confirm Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Submission Modal */}
      {selectedReviewItem && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal" style={{ maxWidth: '460px', width: '90%', borderRadius: '24px', padding: '28px' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900 }}>Submit Product Review</span>
              <button onClick={() => setSelectedReviewItem(null)} className="modal-close"><X size={20} /></button>
            </div>

            <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                <strong>Product:</strong> {selectedReviewItem.name}
              </div>

              <div>
                <label className="fl2">Rating (1 to 5 Stars)</label>
                <div style={{ display: 'flex', gap: '8px', fontSize: '24px', marginTop: '6px' }}>
                  {[1, 2, 3, 4, 5].map(starVal => (
                    <span 
                      key={starVal} 
                      onClick={() => setReviewRating(starVal)}
                      style={{ cursor: 'pointer', transition: 'transform 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      {starVal <= reviewRating ? '★' : '☆'}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="fl2">Review Comment</label>
                <textarea 
                  placeholder="Share your experience with this physical unit or kit..." 
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  className="ta2"
                  rows={3}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setSelectedReviewItem(null)} style={{ flex: 1, height: '42px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={reviewSubmitting} className="bsm s" style={{ flex: 1, height: '42px', borderRadius: '12px' }}>
                  {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📷 BARCODE SCANNER OVERLAY MODAL */}
      {showScanner && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, background: 'rgba(15, 23, 42, 0.9)' }}>
          <div className="modal" style={{ maxWidth: '480px', width: '95%', borderRadius: '24px', padding: '0', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', background: '#fff' }}>
            
            <div style={{ background: '#0f172a', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <QrCode size={18} /> BARCODE SCANNER
              </div>
              <button onClick={() => setShowScanner(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>

            <div style={{ padding: '24px' }}>
              <div className="inv-type-pills" style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', marginBottom: '16px' }}>
                <button onClick={() => { setScannerMode('checkout'); setScanLookupResult(null); }} style={{ flex: 1, padding: '8px 12px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '8px', cursor: 'pointer', background: scannerMode === 'checkout' ? 'var(--teal)' : 'transparent', color: scannerMode === 'checkout' ? '#fff' : '#64748b' }}>Self Checkout</button>
                <button onClick={() => { setScannerMode('checkin'); setScanLookupResult(null); }} style={{ flex: 1, padding: '8px 12px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '8px', cursor: 'pointer', background: scannerMode === 'checkin' ? 'var(--teal)' : 'transparent', color: scannerMode === 'checkin' ? '#fff' : '#64748b' }}>Self Check-In</button>
              </div>

              {/* simulated scanner viewport */}
              <div style={{ width: '100%', height: '180px', background: '#090d16', borderRadius: '12px', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <div style={{ width: '50%', height: '50%', border: '2px dashed rgba(20, 184, 166, 0.4)', borderRadius: '8px', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, width: '100%', height: '3px', background: '#1BB89A', boxShadow: '0 0 10px #1BB89A', animation: 'scanLineAnim 2s linear infinite' }} />
                </div>
              </div>

              <form onSubmit={handleBarcodeLookup} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input 
                  type="text" 
                  placeholder="Scan or enter item/unit barcode..." 
                  value={manualBarcode} 
                  onChange={e => setManualBarcode(e.target.value)} 
                  style={{ flex: 1, height: '42px', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '0 12px', fontSize: '13px' }}
                />
                <button type="submit" className="bsm s" style={{ height: '42px', borderRadius: '10px', padding: '0 16px' }}>Lookup</button>
              </form>

              {scanError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '10px', padding: '12px', color: '#b91c1c', fontSize: '12px', fontWeight: 700, marginBottom: '16px' }}>
                  ⚠️ {scanError}
                </div>
              )}

              {scanLookupResult ? (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', marginBottom: '2px' }}>Code Match Found</div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 900 }}>{scanLookupResult.item.name}</h4>
                  <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', marginBottom: '12px' }}>SKU: {scanLookupResult.item.barcode_value}</div>

                  <div style={{ marginBottom: '12px' }}>
                    <label className="fl2">Scanner Notes (Optional)</label>
                    <input type="text" placeholder="Remarks..." value={scanNotes} onChange={e => setScanNotes(e.target.value)} className="fi2" style={{ height: '36px' }} />
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setScanLookupResult(null)} style={{ flex: 1, height: '38px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>Cancel</button>
                    <button onClick={handleConfirmScannerAction} disabled={scanSubmitting} className="bsm s" style={{ flex: 1, height: '38px', borderRadius: '8px', fontSize: '11px' }}>
                      {scanSubmitting ? 'Confirming...' : 'Confirm'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxHeight: '80px', overflowY: 'auto' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', width: '100%' }}>SIMULATION SHORTCUTS:</span>
                  {items.flatMap(item => (item.units || []).slice(0, 1)).map((unit: any) => (
                    <button 
                      key={unit.id} 
                      onClick={() => {
                        setManualBarcode(unit.barcode_value);
                        handleBarcodeLookup({ preventDefault: () => {} } as any);
                      }}
                      style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontFamily: 'monospace', cursor: 'pointer' }}
                    >
                      {unit.barcode_value}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
