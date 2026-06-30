import React, { useState, useEffect } from 'react';
import { Search, AlertTriangle, CheckCircle2, Calendar, ShieldCheck, RefreshCw, X, Plus, Edit2, Trash2, Sliders, History, FileText, FolderPlus, HelpCircle } from 'lucide-react';
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
  manually_returned_by: string | null;
  member?: {
    name: string;
  };
  items?: InventoryItem;
}

interface Category {
  id: string;
  name: string;
}

export default function Inventory() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super';
  const isSuper = profile?.role === 'super';

  if (!isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px', background: '#fff', borderRadius: 24, border: '1.5px solid #e2e8f0', maxWidth: 500, margin: '60px auto' }}>
        <div style={{ fontSize: 72, marginBottom: 20 }}>🛡️</div>
        <h1 style={{ fontSize: 24, fontWeight: 950, color: '#0f172a', margin: 0 }}>Access Restricted</h1>
        <p style={{ fontSize: 14, color: '#64748b', maxWidth: 400, margin: '12px auto 24px', lineHeight: 1.5 }}>
          The Inventory &amp; Catalog Management page is reserved for authorized administrators only.
        </p>
        <button 
          onClick={() => window.location.href = '/member/dashboard'}
          style={{ padding: '12px 24px', borderRadius: 14, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<'catalogue' | 'checkouts'>('catalogue');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allCheckouts, setAllCheckouts] = useState<CheckoutRecord[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState<'all' | 'lease' | 'permanent'>('all');

  // Checkout table filter
  const [checkoutSearch, setCheckoutSearch] = useState('');
  const [checkoutStatusFilter, setCheckoutStatusFilter] = useState<'all' | 'active' | 'returned' | 'overdue'>('all');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [overrideCheckout, setOverrideCheckout] = useState<CheckoutRecord | null>(null);

  // Form states
  const [newItemName, setNewItemName] = useState('');
  const [newItemCatId, setNewItemCatId] = useState('');
  const [newItemType, setNewItemType] = useState<'lease' | 'permanent'>('lease');
  const [newItemStock, setNewItemStock] = useState(1);
  const [newItemLeaseDays, setNewItemLeaseDays] = useState(30);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemPhoto, setNewItemPhoto] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Category form
  const [newCatName, setNewCatName] = useState('');
  const [catSubmitting, setCatSubmitting] = useState(false);

  // Adjust stock form
  const [adjustNewStock, setAdjustNewStock] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  // Override return form
  const [overrideCondition, setOverrideCondition] = useState<'good' | 'damaged' | 'lost'>('good');
  const [overrideDate, setOverrideDate] = useState(new Date().toISOString().split('T')[0]);

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

  // Fetch Master Data
  const loadCatalogue = async () => {
    try {
      setLoading(true);
      const catRes = await fetch('/api/inventory-categories', { headers: getHeaders() });
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.categories || []);
        if (catData.categories?.length > 0 && !newItemCatId) {
          setNewItemCatId(catData.categories[0].id);
        }
      }

      const itemRes = await fetch('/api/inventory-items', { headers: getHeaders() });
      if (itemRes.ok) {
        const itemData = await itemRes.json();
        setItems(itemData.items || []);
      }
    } catch (err: any) {
      popToast('e', 'Failed to load catalogue');
    } finally {
      setLoading(false);
    }
  };

  // Fetch All Checkouts
  const loadCheckouts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/inventory-checkouts', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAllCheckouts(data.checkouts || []);
      }
    } catch (err) {
      popToast('e', 'Failed to load checkouts log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'catalogue') {
      loadCatalogue();
    } else {
      loadCheckouts();
    }
  }, [activeTab]);

  // Handle Add Item
  const handleAddItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || !newItemCatId || newItemStock < 0) {
      popToast('e', 'Fill all required fields');
      return;
    }

    try {
      setFormSubmitting(true);
      const res = await fetch('/api/inventory-items', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: newItemName,
          category_id: newItemCatId,
          item_type: newItemType,
          total_stock: newItemStock,
          lease_duration_days: newItemType === 'lease' ? newItemLeaseDays : null,
          description: newItemDesc,
          photo_url: newItemPhoto
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add item');

      popToast('s', `Product "${newItemName}" added successfully!`);
      setShowAddModal(false);
      
      // Reset
      setNewItemName('');
      setNewItemStock(1);
      setNewItemLeaseDays(30);
      setNewItemDesc('');
      setNewItemPhoto('');
      loadCatalogue();
    } catch (err: any) {
      popToast('e', err.message || 'Error adding item');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Edit Item
  const handleEditItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      setFormSubmitting(true);
      const res = await fetch('/api/inventory-item-actions', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'edit',
          id: editingItem.id,
          name: editingItem.name,
          category_id: editingItem.category_id,
          lease_duration_days: editingItem.item_type === 'lease' ? editingItem.lease_duration_days : null,
          description: editingItem.description,
          photo_url: editingItem.photo_url
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to edit item');

      popToast('s', 'Item updated successfully!');
      setEditingItem(null);
      loadCatalogue();
    } catch (err: any) {
      popToast('e', err.message || 'Error updating item');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Adjust Stock
  const handleAdjustStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem || adjustNewStock < 0 || !adjustReason.trim()) {
      popToast('e', 'Valid stock count and reason required');
      return;
    }

    try {
      setFormSubmitting(true);
      const res = await fetch('/api/inventory-item-actions', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'adjust-stock',
          id: adjustingItem.id,
          new_available_stock: adjustNewStock,
          reason: adjustReason
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Stock adjustment failed');

      popToast('s', 'Stock count adjusted successfully!');
      setAdjustingItem(null);
      setAdjustReason('');
      loadCatalogue();
    } catch (err: any) {
      popToast('e', err.message || 'Error adjusting stock');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Override Check-in (Mark as Returned)
  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideCheckout) return;

    try {
      setFormSubmitting(true);
      const res = await fetch('/api/inventory-checkout-actions', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'mark-returned',
          id: overrideCheckout.id,
          return_condition: overrideCondition,
          return_date: overrideDate
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Override failed');

      popToast('s', 'Checkout overridden successfully.');
      setOverrideCheckout(null);
      loadCheckouts();
    } catch (err: any) {
      popToast('e', err.message || 'Override failed');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Deactivate Item
  const handleDeactivate = async (id: string) => {
    if (!window.confirm('Are you sure you want to deactivate/hide this item from the catalogue?')) return;
    try {
      const res = await fetch('/api/inventory-item-actions', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'deactivate',
          id: id
        })
      });
      if (res.ok) {
        popToast('s', 'Item deactivated successfully.');
        loadCatalogue();
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to deactivate');
      }
    } catch (err: any) {
      popToast('e', err.message);
    }
  };

  // Handle Permanent Delete (Super-Admin only)
  const handleDeleteItem = async (id: string) => {
    if (!window.confirm('CRITICAL: Are you sure you want to PERMANENTLY delete this item? This action is irreversible.')) return;
    try {
      const res = await fetch('/api/inventory-item-actions', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'delete',
          id: id
        })
      });
      if (res.ok) {
        popToast('s', 'Item permanently deleted.');
        loadCatalogue();
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete');
      }
    } catch (err: any) {
      popToast('e', err.message);
    }
  };

  // Add Category Submit
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      setCatSubmitting(true);
      const res = await fetch('/api/inventory-categories', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: newCatName.trim() })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Category creation failed');

      popToast('s', `Category "${newCatName}" created!`);
      setNewCatName('');
      loadCatalogue();
    } catch (err: any) {
      popToast('e', err.message);
    } finally {
      setCatSubmitting(false);
    }
  };

  // Delete Category Submit
  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      const res = await fetch(`/api/inventory-categories?id=${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });

      if (res.ok) {
        popToast('s', 'Category deleted.');
        loadCatalogue();
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Deletion failed');
      }
    } catch (err: any) {
      popToast('e', err.message);
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

  // Filter Checkouts
  const filteredCheckouts = allCheckouts.filter(c => {
    const matchesSearch = c.member?.name?.toLowerCase().includes(checkoutSearch.toLowerCase()) ||
                          c.items?.name?.toLowerCase().includes(checkoutSearch.toLowerCase());
    const matchesStatus = checkoutStatusFilter === 'all' || c.status === checkoutStatusFilter;
    return matchesSearch && matchesStatus;
  });

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
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.75px', margin: 0 }}>Inventory Admin</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '6px 0 0 0', fontWeight: 500 }}>Create items, monitor member checkouts, and override warehouse records.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setShowCategoryModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '14px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
          >
            <FolderPlus size={14} /> Manage Categories
          </button>
          <button 
            onClick={activeTab === 'catalogue' ? loadCatalogue : loadCheckouts}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '14px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
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
            cursor: 'pointer'
          }}
        >
          📂 Catalog Stock
        </button>
        <button
          onClick={() => setActiveTab('checkouts')}
          style={{
            padding: '14px 28px',
            fontWeight: 800,
            fontSize: '15px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'checkouts' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'checkouts' ? 'var(--teal)' : '#64748b',
            cursor: 'pointer'
          }}
        >
          📝 Members Checkouts Ledger
        </button>
      </div>

      {/* Loading state */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 0', gap: '16px' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid #f1f5f9', borderTop: '4px solid var(--teal)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>Syncing admin ledger...</span>
        </div>
      ) : activeTab === 'catalogue' ? (
        
        /* ──── CATALOGUE TAB ──── */
        <>
          {/* Filters Bar */}
          <div style={{ display: 'flex', gap: '14px', marginBottom: '32px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
              <span style={{ position: 'absolute', left: '16px', top: '15px', color: '#94a3b8' }}>
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Search catalogue items..."
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
              <button onClick={() => setSelectedType('all')} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', background: selectedType === 'all' ? '#fff' : 'transparent', color: selectedType === 'all' ? '#0f172a' : '#64748b' }}>All</button>
              <button onClick={() => setSelectedType('lease')} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', background: selectedType === 'lease' ? '#fff' : 'transparent', color: selectedType === 'lease' ? '#0f172a' : '#64748b' }}>Lease</button>
              <button onClick={() => setSelectedType('permanent')} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', background: selectedType === 'permanent' ? '#fff' : 'transparent', color: selectedType === 'permanent' ? '#0f172a' : '#64748b' }}>Permanent</button>
            </div>

            <button 
              onClick={() => setShowAddModal(true)}
              className="bsm s"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 24px', height: '46px', borderRadius: '14px', fontSize: '13px', fontWeight: 800 }}
            >
              <Plus size={16} /> Add Catalog Item
            </button>
          </div>

          {/* Cards Grid */}
          {filteredCatalogue.length === 0 ? (
            <div className="card" style={{ padding: '80px 24px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '2px dashed #e2e8f0' }}>
              <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.4, color: '#64748b' }} />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>No Catalogue Matches</h3>
              <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#94a3b8' }}>Try adding items or clearing filters.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
              {filteredCatalogue.map(item => (
                <div key={item.id} className="card" style={{ background: '#fff', borderRadius: '24px', border: item.is_active ? '1.5px solid #f1f5f9' : '2px dashed #cbd5e1', opacity: item.is_active ? 1 : 0.65, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                  
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
                    {!item.is_active && (
                      <span style={{ position: 'absolute', top: '16px', left: '16px', fontSize: '9px', fontWeight: 900, color: '#fff', background: '#64748b', padding: '5px 10px', borderRadius: '8px' }}>
                        DRAFT/HIDDEN
                      </span>
                    )}
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

                    {/* Actions Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        onClick={() => setEditingItem(item)}
                        style={{ height: '38px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#334155', fontWeight: 800, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <Edit2 size={12} /> Edit Catalog
                      </button>
                      <button
                        onClick={() => {
                          setAdjustingItem(item);
                          setAdjustNewStock(item.available_stock);
                        }}
                        style={{ height: '38px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#334155', fontWeight: 800, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <Sliders size={12} /> Adjust Stock
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      {item.is_active ? (
                        <button
                          onClick={() => handleDeactivate(item.id)}
                          style={{ flex: 1, height: '38px', borderRadius: '10px', border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}
                        >
                          Deactivate / Hide
                        </button>
                      ) : (
                        <span style={{ flex: 1, height: '38px', borderRadius: '10px', background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0', fontWeight: 800, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Inactive</span>
                      )}

                      {isSuper && (
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          style={{ width: '38px', height: '38px', borderRadius: '10px', border: 'none', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                          title="Permanent Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        
        /* ──── CHECKOUTS LEDGER TAB ──── */
        <div className="card" style={{ padding: '28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          
          {/* Search & Filters */}
          <div style={{ display: 'flex', gap: '14px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
              <span style={{ position: 'absolute', left: '16px', top: '15px', color: '#94a3b8' }}>
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Search checkouts by member name or item..."
                value={checkoutSearch}
                onChange={(e) => setCheckoutSearch(e.target.value)}
                className="fi2"
                style={{ paddingLeft: '46px', width: '100%', height: '44px', borderRadius: '12px', fontSize: '13px' }}
              />
            </div>
            
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
              {(['all', 'active', 'returned', 'overdue'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setCheckoutStatusFilter(status)}
                  style={{ 
                    padding: '8px 16px', 
                    fontSize: '12px', 
                    fontWeight: 800, 
                    border: 'none', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    background: checkoutStatusFilter === status ? '#fff' : 'transparent', 
                    color: checkoutStatusFilter === status ? '#0f172a' : '#64748b',
                    textTransform: 'capitalize'
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {filteredCheckouts.length === 0 ? (
            <div style={{ padding: '50px', textAlign: 'center', color: '#94a3b8' }}>
              No checkouts logs found matching your filters.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                    <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Member</th>
                    <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Item Checked-out</th>
                    <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Qty</th>
                    <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Checkout Date</th>
                    <th style={{ textAlign: 'left', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Expected Return</th>
                    <th style={{ textAlign: 'center', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '14px', fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Overriding Override</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCheckouts.map(c => {
                    const isOverdue = c.status === 'overdue' || (c.due_return_date && new Date(c.due_return_date) < new Date() && c.status === 'active');
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '16px 14px' }}>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.member?.name || 'Member Account'}</div>
                        </td>
                        <td style={{ padding: '16px 14px' }}>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.items?.name || 'Supply Item'}</div>
                          {c.notes && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>📝 "{c.notes}"</div>}
                        </td>
                        <td style={{ padding: '16px 14px', fontWeight: 800, color: '#334155' }}>{c.quantity}</td>
                        <td style={{ padding: '16px 14px', fontSize: '13px', color: '#64748b' }}>
                          {c.checkout_date ? new Date(c.checkout_date).toLocaleDateString() : 'N/A'}
                        </td>
                        <td style={{ padding: '16px 14px', fontSize: '13px', color: '#64748b' }}>
                          {c.due_return_date ? new Date(c.due_return_date).toLocaleDateString() : 'Permanent'}
                        </td>
                        <td style={{ padding: '16px 14px', textAlign: 'center' }}>
                          <span style={{ 
                            padding: '4px 10px', 
                            borderRadius: '6px', 
                            fontSize: '10px', 
                            fontWeight: 900,
                            textTransform: 'uppercase',
                            background: c.status === 'returned' ? '#ecfdf5' : isOverdue ? '#fee2e2' : '#eff6ff',
                            color: c.status === 'returned' ? '#059669' : isOverdue ? '#ef4444' : '#2563eb'
                          }}>
                            {c.status === 'returned' ? `Returned (${c.return_condition})` : isOverdue ? 'Overdue' : 'Active'}
                          </span>
                        </td>
                        <td style={{ padding: '16px 14px', textAlign: 'right' }}>
                          {c.status !== 'returned' && (
                            <button
                              onClick={() => setOverrideCheckout(c)}
                              className="bsm s"
                              style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '8px', background: '#2563eb' }}
                            >
                              ⚙️ Force Check-in
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal" style={{ maxWidth: '520px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s ease' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900 }}>Create Catalog Product</span>
              <button onClick={() => setShowAddModal(false)} className="modal-close"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleAddItemSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2">Item Name *</label>
                <input type="text" placeholder="E.g., Medical Aid Kit Type A" value={newItemName} onChange={e => setNewItemName(e.target.value)} className="fi2" required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="fl2">Category *</label>
                  <select value={newItemCatId} onChange={e => setNewItemCatId(e.target.value)} className="sel2" style={{ width: '100%' }} required>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="fl2">Allocation Type *</label>
                  <select value={newItemType} onChange={e => setNewItemType(e.target.value as any)} className="sel2" style={{ width: '100%' }} required>
                    <option value="lease">Lease / Return required</option>
                    <option value="permanent">Permanent grant / Aid package</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="fl2">Starting Quantity *</label>
                  <input type="number" min={0} value={newItemStock} onChange={e => setNewItemStock(Number(e.target.value))} className="fi2" required />
                </div>
                {newItemType === 'lease' && (
                  <div>
                    <label className="fl2">Lease Limit (Days)</label>
                    <input type="number" min={1} value={newItemLeaseDays} onChange={e => setNewItemLeaseDays(Number(e.target.value))} className="fi2" required />
                  </div>
                )}
              </div>

              <div>
                <label className="fl2">Photo URL (Optional)</label>
                <input type="text" placeholder="https://images.unsplash.com/..." value={newItemPhoto} onChange={e => setNewItemPhoto(e.target.value)} className="fi2" />
              </div>

              <div>
                <label className="fl2">Catalog Description</label>
                <textarea placeholder="Write detail specifications or logistics guidelines..." value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} className="ta2" rows={3} />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ flex: 1, height: '44px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={formSubmitting} className="bsm s" style={{ flex: 1, height: '44px', borderRadius: '12px' }}>
                  {formSubmitting ? 'Creating...' : 'Create Catalog Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal" style={{ maxWidth: '520px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s ease' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900 }}>Edit Catalog Product</span>
              <button onClick={() => setEditingItem(null)} className="modal-close"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleEditItemSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2">Item Name *</label>
                <input type="text" value={editingItem.name} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} className="fi2" required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="fl2">Category *</label>
                  <select value={editingItem.category_id} onChange={e => setEditingItem({ ...editingItem, category_id: e.target.value })} className="sel2" style={{ width: '100%' }} required>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {editingItem.item_type === 'lease' && (
                  <div>
                    <label className="fl2">Lease Limit (Days)</label>
                    <input type="number" min={1} value={editingItem.lease_duration_days || 30} onChange={e => setEditingItem({ ...editingItem, lease_duration_days: Number(e.target.value) })} className="fi2" required />
                  </div>
                )}
              </div>

              <div>
                <label className="fl2">Photo URL</label>
                <input type="text" value={editingItem.photo_url || ''} onChange={e => setEditingItem({ ...editingItem, photo_url: e.target.value })} className="fi2" />
              </div>

              <div>
                <label className="fl2">Catalog Description</label>
                <textarea value={editingItem.description || ''} onChange={e => setEditingItem({ ...editingItem, description: e.target.value })} className="ta2" rows={3} />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setEditingItem(null)} style={{ flex: 1, height: '44px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={formSubmitting} className="bsm s" style={{ flex: 1, height: '44px', borderRadius: '12px' }}>
                  {formSubmitting ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {adjustingItem && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal" style={{ maxWidth: '440px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s ease' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900 }}>Adjust Supply Stock</span>
              <button onClick={() => setAdjustingItem(null)} className="modal-close"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleAdjustStockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '12px', fontSize: '13px' }}>
                <div><b>Product:</b> {adjustingItem.name}</div>
                <div><b>Current Available:</b> {adjustingItem.available_stock} Units</div>
              </div>

              <div>
                <label className="fl2">New Available Stock Count *</label>
                <input type="number" min={0} value={adjustNewStock} onChange={e => setAdjustNewStock(Number(e.target.value))} className="fi2" required />
              </div>

              <div>
                <label className="fl2">Adjustment Reason *</label>
                <textarea placeholder="E.g., Stock reconciliation, physical inventory audit, damaged kit deduction..." value={adjustReason} onChange={e => setAdjustReason(e.target.value)} className="ta2" rows={3} required />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setAdjustingItem(null)} style={{ flex: 1, height: '44px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={formSubmitting} className="bsm s" style={{ flex: 1, height: '44px', borderRadius: '12px' }}>
                  {formSubmitting ? 'Adjusting...' : 'Confirm Stock Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Force Return Override Modal */}
      {overrideCheckout && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal" style={{ maxWidth: '440px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s ease' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900 }}>Force Return Override</span>
              <button onClick={() => setOverrideCheckout(null)} className="modal-close"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleOverrideSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '12px', fontSize: '13px' }}>
                <div><b>Borrower:</b> {overrideCheckout.member?.name}</div>
                <div><b>Item:</b> {overrideCheckout.items?.name}</div>
                <div><b>Borrowed Qty:</b> {overrideCheckout.quantity} Units</div>
              </div>

              <div>
                <label className="fl2">Observed Condition upon return</label>
                <select value={overrideCondition} onChange={e => setOverrideCondition(e.target.value as any)} className="sel2" style={{ width: '100%' }}>
                  <option value="good">Good Condition (Adds back to available stock)</option>
                  <option value="damaged">Damaged (Does not add back to stock)</option>
                  <option value="lost">Lost / Misplaced (Does not add back to stock)</option>
                </select>
              </div>

              <div>
                <label className="fl2">Record Return Date</label>
                <input type="date" value={overrideDate} onChange={e => setOverrideDate(e.target.value)} className="fi2" required />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setOverrideCheckout(null)} style={{ flex: 1, height: '44px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={formSubmitting} className="bsm s" style={{ flex: 1, height: '44px', borderRadius: '12px' }}>
                  {formSubmitting ? 'Overriding...' : 'Force Check-in'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Categories Management Modal */}
      {showCategoryModal && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal" style={{ maxWidth: '520px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s ease' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900 }}>Manage Catalogue Categories</span>
              <button onClick={() => setShowCategoryModal(false)} className="modal-close"><X size={20} /></button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Add category form */}
              <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="fl2">New Category Name</label>
                  <input type="text" placeholder="E.g., Medical, Educational..." value={newCatName} onChange={e => setNewCatName(e.target.value)} className="fi2" required />
                </div>
                <button type="submit" disabled={catSubmitting} className="bsm s" style={{ height: '44px', borderRadius: '12px', padding: '0 20px' }}>
                  Add
                </button>
              </form>

              {/* Category list */}
              <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                {categories.length === 0 ? (
                  <div style={{ padding: '16px', color: '#94a3b8', textAlign: 'center' }}>No categories created.</div>
                ) : (
                  categories.map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontWeight: 800, color: '#334155' }}>{c.name}</span>
                      {isSuper && (
                        <button
                          onClick={() => handleDeleteCategory(c.id)}
                          style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                          title="Delete Category"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowCategoryModal(false)} style={{ height: '42px', padding: '0 24px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
