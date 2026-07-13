import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, AlertTriangle, CheckCircle2, Calendar, ShieldCheck, RefreshCw, X, Plus, Edit2, 
  Trash2, Sliders, FolderPlus, Package, Printer, EyeOff, ClipboardList, Grid, List, 
  Barcode as BarcodeIcon, Users, QrCode, FileSpreadsheet, Star, HelpCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import JsBarcode from 'jsbarcode';
import * as XLSX from 'xlsx';
import { useSearchParams } from 'react-router-dom';

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
  member?: {
    name: string;
    membership_no?: string;
  };
  items?: InventoryItem;
  unit?: {
    barcode_value: string;
  } | null;
}

interface Category {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  name: string;
  role: string;
  membership_no?: string;
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

const getCategoryBgClass = (catName: string) => {
  const name = catName.toLowerCase();
  if (name.includes('edu')) return 'bg-edu';
  if (name.includes('rel')) return 'bg-rel';
  if (name.includes('hlt') || name.includes('heal') || name.includes('med')) return 'bg-hlt';
  if (name.includes('wel')) return 'bg-wel';
  return 'bg-def';
};

const getProductEmoji = (name: string, catName: string) => {
  const n = name.toLowerCase();
  const c = catName.toLowerCase();
  if (c.includes('edu') || n.includes('kit') || n.includes('study')) return '📚';
  if (c.includes('rel') || n.includes('mat') || n.includes('quran') || n.includes('prayer')) return '🕌';
  if (c.includes('hlt') || n.includes('first') || n.includes('medical') || n.includes('aid')) return '🏥';
  if (c.includes('wel') || n.includes('grocer') || n.includes('pack')) return '🤝';
  return '📦';
};

export default function MemberInventory() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super' || profile?.role === 'member';
  const isSuper = profile?.role === 'super';

  // State Declarations
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabParam = searchParams.get('tab') || 'catalogue';
  const activeTab = (['catalogue', 'barcodes', 'scanner', 'checkouts', 'missions', 'reports', 'settings', 'damage_review'].includes(activeTabParam)
    ? activeTabParam
    : 'catalogue') as 'catalogue' | 'barcodes' | 'scanner' | 'checkouts' | 'missions' | 'reports' | 'settings' | 'damage_review';

  const setActiveTab = (tab: 'catalogue' | 'barcodes' | 'scanner' | 'checkouts' | 'missions' | 'reports' | 'settings' | 'damage_review') => {
    setSearchParams({ tab });
  };
  const [viewMode, setViewMode] = useState<'gallery' | 'table' | 'barcodes'>('gallery');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allCheckouts, setAllCheckouts] = useState<CheckoutRecord[]>([]);
  const [damageRecords, setDamageRecords] = useState<CheckoutRecord[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState<'all' | 'lease' | 'permanent'>('all');

  // Checkout ledger search
  const [checkoutSearch, setCheckoutSearch] = useState('');
  const [checkoutStatusFilter, setCheckoutStatusFilter] = useState<'all' | 'active' | 'returned' | 'overdue'>('all');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedDetailTab, setSelectedDetailTab] = useState<'units' | 'distribution' | 'reviews'>('units');
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [overrideCheckout, setOverrideCheckout] = useState<CheckoutRecord | null>(null);
  const [selectedProductDetail, setSelectedProductDetail] = useState<InventoryItem | null>(null);
  const [selectedMissionDetail, setSelectedMissionDetail] = useState<any | null>(null);
  const [printJob, setPrintJob] = useState<{ type: 'single' | 'all'; item?: InventoryItem } | null>(null);

  // Missions & Bundling State
  const [showCreateMissionModal, setShowCreateMissionModal] = useState(false);
  const [newMissionName, setNewMissionName] = useState('');
  const [newMissionDesc, setNewMissionDesc] = useState('');
  const [newMissionBundles, setNewMissionBundles] = useState<{ item_id: string; quantity: number }[]>([]);

  const [missionsList, setMissionsList] = useState<any[]>([]);

  const loadMissions = async (silent = true) => {
    try {
      if (!silent) setRefreshing(true);
      const res = await fetch('/api/inventory?resource=missions', { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to load welfare missions');
      const data = await res.json();
      const loadedMissions = data.missions || [];
      setMissionsList(loadedMissions);
      
      // Auto-select General Distribution or the first mission if none is selected yet
      if (loadedMissions.length > 0 && (!scannerMission || scannerMission === 'General Distribution')) {
        const general = loadedMissions.find((m: any) => m.name === 'General Distribution');
        if (general) {
          setScannerMission(general.id);
        } else {
          setScannerMission(loadedMissions[0].id);
        }
      }
    } catch (e: any) {
      console.warn("Failed to load welfare missions:", e);
    } finally {
      if (!silent) setRefreshing(false);
    }
  };

  // Scanner State
  const [scannerMode, setScannerMode] = useState<'checkout' | 'checkin'>('checkout');
  const [manualBarcode, setManualBarcode] = useState('');
  const [scanLookupResult, setScanLookupResult] = useState<any | null>(null);
  const [scanNotes, setScanNotes] = useState('');
  const [scannerMemberId, setScannerMemberId] = useState('');
  const [scannerMission, setScannerMission] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanSubmitting, setScanSubmitting] = useState(false);

  // Confirm dialog state
  interface ConfirmOpts {
    title: string;
    message: string;
    icon: 'delete' | 'deactivate' | 'category';
    danger: boolean;
    onConfirm: () => void;
  }
  const [confirmDialog, setConfirmDialog] = useState<ConfirmOpts | null>(null);

  // Form states
  const [newItemName, setNewItemName] = useState('');
  const [newItemCatId, setNewItemCatId] = useState('');
  const [newItemType, setNewItemType] = useState<'lease' | 'permanent'>('lease');
  const [newItemStock, setNewItemStock] = useState(1);
  const [newItemLeaseDays, setNewItemLeaseDays] = useState(30);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemPhoto, setNewItemPhoto] = useState('');
  const [newItemPublicVisible, setNewItemPublicVisible] = useState(false);
  const [newItemPublicDesc, setNewItemPublicDesc] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Category form
  const [newCatName, setNewCatName] = useState('');
  const [catSubmitting, setCatSubmitting] = useState(false);

  // Adjust stock form
  const [adjustNewStock, setAdjustNewStock] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  // Override return form
  const [overrideCondition, setOverrideCondition] = useState<'good' | 'damaged' | 'lost'>('good');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [overrideDate, setOverrideDate] = useState(new Date().toISOString().split('T')[0]);

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

  // Fetch Master Data
  const loadCatalogue = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      else setRefreshing(true);
      const catRes = await fetch('/api/inventory?resource=categories', { headers: getHeaders() });
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.categories || []);
        if (catData.categories?.length > 0 && !newItemCatId) {
          setNewItemCatId(catData.categories[0].id);
        }
      }

      const itemRes = await fetch('/api/inventory?resource=items', { headers: getHeaders() });
      if (itemRes.ok) {
        const itemData = await itemRes.json();
        setItems(itemData.items || []);
      }
    } catch (err: any) {
      popToast('e', 'Failed to load catalogue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch All Checkouts
  const loadCheckouts = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      else setRefreshing(true);
      const res = await fetch('/api/inventory?resource=checkouts', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAllCheckouts(data.checkouts || []);
      }
    } catch (err) {
      popToast('e', 'Failed to load checkouts log');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch Damage Reviews
  const loadDamageReview = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      const res = await fetch('/api/inventory?resource=damage-review', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setDamageRecords(data.records || []);
      }
    } catch (err) {
      popToast('e', 'Failed to load damage reviews');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Members Profiles list for Scanner dropdowns
  const loadMembers = async () => {
    try {
      const res = await fetch('/api/members', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        // For admins/supers, default to first member; for members, do NOT override (set by profile useEffect)
        const isMemberRole = profile?.role === 'member';
        if (!isMemberRole && data.members?.length > 0) {
          setScannerMemberId(data.members[0].id);
        }
      }
    } catch (e) {
      console.warn("Failed to load profiles list:", e);
    }
  };

  // Auto-assign member id for member-role scanner
  useEffect(() => {
    if (profile?.role === 'member' && (profile?.db_id || profile?.id)) {
      setScannerMemberId(profile.db_id || profile.id);
    }
  }, [profile]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      await Promise.all([loadCatalogue(false), loadCheckouts(false), loadDamageReview(false), loadMembers(), loadMissions(true)]);
      setInitialLoading(false);
    };
    init();
  }, []);

  // Background refresh on tab change
  useEffect(() => {
    if (initialLoading) return;
    if (activeTab === 'catalogue') {
      loadCatalogue(false);
    } else if (activeTab === 'checkouts') {
      loadCheckouts(false);
    } else if (activeTab === 'damage_review') {
      loadDamageReview(false);
    } else if (activeTab === 'missions') {
      loadMissions(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedProductDetail) {
      setSelectedDetailTab('units');
    }
  }, [selectedProductDetail]);

  useEffect(() => {
    if (printJob) {
      const timer = setTimeout(() => {
        const cleanup = () => {
          setPrintJob(null);
          window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        window.print();
        // Fallback: clear after 8 seconds if afterprint didn't fire
        setTimeout(() => cleanup(), 8000);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [printJob]);

  // Handle Add Item
  const handleAddItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || !newItemCatId || newItemStock < 0) {
      popToast('e', 'Fill all required fields');
      return;
    }

    try {
      setFormSubmitting(true);
      const res = await fetch('/api/inventory?resource=items', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: newItemName,
          category_id: newItemCatId,
          item_type: newItemType,
          total_stock: newItemStock,
          lease_duration_days: newItemType === 'lease' ? newItemLeaseDays : null,
          description: newItemDesc,
          photo_url: newItemPhoto,
          public_visible: newItemPublicVisible,
          public_description: newItemPublicDesc
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
      setNewItemPublicVisible(false);
      setNewItemPublicDesc('');
      loadCatalogue(false);
    } catch (err: any) {
      popToast('e', err.message || 'Error adding item');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleCreateMissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMissionName.trim() || !newMissionDesc.trim()) {
      popToast('e', 'Please provide a mission name and description');
      return;
    }

    try {
      setFormSubmitting(true);
      const res = await fetch('/api/inventory?resource=missions', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: newMissionName.trim(),
          description: newMissionDesc.trim(),
          emoji: '🤝'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create mission');

      popToast('s', `Mission "${newMissionName}" created successfully!`);
      await loadMissions(true);

      // Reset form
      setNewMissionName('');
      setNewMissionDesc('');
      setNewMissionBundles([]);
      setShowCreateMissionModal(false);
    } catch (err: any) {
      popToast('e', err.message || 'Error creating mission');
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
      const res = await fetch('/api/inventory?resource=item-actions', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'edit',
          id: editingItem.id,
          name: editingItem.name,
          category_id: editingItem.category_id,
          total_stock: editingItem.total_stock,
          lease_duration_days: editingItem.item_type === 'lease' ? editingItem.lease_duration_days : null,
          description: editingItem.description,
          photo_url: editingItem.photo_url,
          public_visible: editingItem.public_visible,
          public_description: editingItem.public_description
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to edit item');

      popToast('s', 'Item updated successfully!');
      setEditingItem(null);
      loadCatalogue(false);
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
      const res = await fetch('/api/inventory?resource=item-actions', {
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
      loadCatalogue(false);
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
      const res = await fetch('/api/inventory?resource=checkout-actions', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'mark-returned',
          id: overrideCheckout.id,
          return_condition: overrideCondition,
          return_date: overrideDate,
          condition_notes: overrideNotes
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Override failed');

      popToast('s', 'Checkout overridden successfully.');
      setOverrideCheckout(null);
      setOverrideNotes('');
      loadCheckouts(false);
      loadCatalogue(false);
      loadDamageReview(false);
    } catch (err: any) {
      popToast('e', err.message || 'Override failed');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Quick Return Quick Check-in action from Checkouts lists
  const handleQuickReturn = async (checkoutId: string, condition: 'good' | 'damaged' | 'lost') => {
    try {
      const res = await fetch('/api/inventory?resource=checkout-actions', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          action: 'mark-returned',
          id: checkoutId,
          return_condition: condition,
          return_date: new Date().toISOString().split('T')[0],
          condition_notes: `Returned via quick check-in`
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Check-in failed');
      }

      popToast('s', 'Item unit checked in successfully!');
      loadCheckouts(false);
      loadCatalogue(false);
      loadDamageReview(false);
    } catch (err: any) {
      popToast('e', err.message);
    }
  };

  // Handle Deactivate Item
  const handleDeactivate = async (id: string) => {
    setConfirmDialog({
      title: 'Deactivate Item',
      message: 'This will hide the item from the member catalogue. Members will no longer be able to request it. You can reactivate it later.',
      icon: 'deactivate',
      danger: false,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch('/api/inventory?resource=item-actions', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ action: 'deactivate', id })
          });
          if (res.ok) {
            popToast('s', 'Item deactivated successfully.');
            loadCatalogue(false);
          } else {
            const err = await res.json();
            throw new Error(err.error || 'Failed to deactivate');
          }
        } catch (err: any) {
          popToast('e', err.message);
        }
      }
    });
  };

  // Handle Permanent Delete (Super-Admin only)
  const handleDeleteItem = async (id: string) => {
    setConfirmDialog({
      title: 'Permanently Delete Item',
      message: 'CRITICAL: This action is irreversible and will permanently remove this item and all associated records from the database.',
      icon: 'delete',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch('/api/inventory?resource=item-actions', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ action: 'delete', id })
          });
          if (res.ok) {
            popToast('s', 'Item permanently deleted.');
            loadCatalogue(false);
          } else {
            const err = await res.json();
            throw new Error(err.error || 'Failed to delete');
          }
        } catch (err: any) {
          popToast('e', err.message);
        }
      }
    });
  };

  // Add Category Submit
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      setCatSubmitting(true);
      const res = await fetch('/api/inventory?resource=categories', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: newCatName.trim() })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Category creation failed');

      popToast('s', `Category "${newCatName}" created!`);
      setNewCatName('');
      loadCatalogue(false);
    } catch (err: any) {
      popToast('e', err.message);
    } finally {
      setCatSubmitting(false);
    }
  };

  // Delete Category Submit
  const handleDeleteCategory = async (id: string) => {
    setConfirmDialog({
      title: 'Delete Category',
      message: 'Are you sure you want to delete this category? Items assigned to it will become uncategorized.',
      icon: 'category',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/inventory?resource=categories&id=${id}`, {
            method: 'DELETE',
            headers: getHeaders()
          });
          if (res.ok) {
            popToast('s', 'Category deleted successfully.');
            loadCatalogue(false);
          } else {
            const err = await res.json();
            throw new Error(err.error || 'Failed to delete category');
          }
        } catch (err: any) {
          popToast('e', err.message);
        }
      }
    });
  };

  // Resolve Damage/Loss Review record
  const handleResolveDamageRecord = async (id: string, resolveAction: 'repaired' | 'writeoff') => {
    try {
      const res = await fetch('/api/inventory?resource=damage-review', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ id, resolve_action: resolveAction })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resolution failed');

      popToast('s', `Flag resolved successfully as ${resolveAction === 'repaired' ? 'repaired & restocked' : 'permanent write-off'}.`);
      loadDamageReview(false);
      loadCatalogue(false);
    } catch (err: any) {
      popToast('e', err.message || 'Error resolving record');
    }
  };

  // Scanner manual barcode lookup
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

  // Scanner Quick Scan Click Selection (Viewfinder simulations)
  const handleSelectQuickScan = async (barcodeVal: string) => {
    try {
      setScanError('');
      setScanLookupResult(null);
      const res = await fetch(`/api/inventory?resource=barcode-lookup&barcode=${barcodeVal}`, {
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('No matching barcode');
      const data = await res.json();
      setScanLookupResult(data);
    } catch (err: any) {
      setScanError('Quick scan lookup failed.');
    }
  };

  // Confirm Scanner Action (Checkout or Checkin)
  const handleConfirmScannerAction = async () => {
    if (!scanLookupResult) return;
    try {
      setScanSubmitting(true);
      setScanError('');
      
      const isUnit = scanLookupResult.type === 'unit';
      const item = scanLookupResult.item;
      
      if (scannerMode === 'checkout') {
        const unitId = isUnit ? scanLookupResult.unit.id : null;
        const selectedMissionObj = missionsList.find(m => m.id === scannerMission);
        const missionName = selectedMissionObj ? selectedMissionObj.name : 'General Distribution';
        const missionId = selectedMissionObj ? selectedMissionObj.id : null;

        const res = await fetch('/api/inventory', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            resource: 'checkouts',
            item_id: item.id,
            unit_id: unitId,
            member_id: scannerMemberId,
            quantity: 1,
            notes: scanNotes || `Scanned checkout for ${missionName}`,
            mission_id: missionId
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
            return_condition: 'good', // default scan return as good
            condition_notes: scanNotes || 'Scanned returned'
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Return check-in failed');
        }
        popToast('s', `Checked in "${item.name}" unit successfully!`);
      }
      
      // Clean scan state
      setScanLookupResult(null);
      setManualBarcode('');
      setScanNotes('');
      loadCatalogue(false);
      loadCheckouts(false);
    } catch (err: any) {
      setScanError(err.message || 'Action execution failed');
    } finally {
      setScanSubmitting(false);
    }
  };

  // SheetJS Excel Report Export
  const handleExportExcel = () => {
    // 1. Catalog sheet
    const catalogData = items.map(p => ({
      'Item Name': p.name,
      'SKU Code': p.barcode_value || 'N/A',
      'Category': p.categories?.name || 'Uncategorized',
      'Type': p.item_type === 'lease' ? 'Lease' : 'Permanent',
      'Total Stock': p.total_stock,
      'Available': p.available_stock,
      'Checked Out': p.total_stock - p.available_stock,
      'Lease Duration (Days)': p.lease_duration_days || 'Permanent',
      'Public Visible': p.public_visible ? 'Yes' : 'No'
    }));

    // 2. Active Leases sheet
    const activeLeases = allCheckouts
      .filter(c => c.status === 'active')
      .map(c => ({
        'Borrower': c.member?.name || 'N/A',
        'Item Name': c.items?.name || 'N/A',
        'Unit SKU': c.unit?.barcode_value || 'N/A',
        'Qty': c.quantity,
        'Checkout Date': c.checkout_date,
        'Due Return Date': c.due_return_date || 'Permanent',
        'Notes': c.notes || ''
      }));

    const wb = XLSX.utils.book_new();
    const wsCatalog = XLSX.utils.json_to_sheet(catalogData);
    const wsLeases = XLSX.utils.json_to_sheet(activeLeases);

    XLSX.utils.book_append_sheet(wb, wsCatalog, 'Welfare Inventory');
    XLSX.utils.book_append_sheet(wb, wsLeases, 'Active Checkouts Ledger');

    XLSX.writeFile(wb, `SKSSF_Inventory_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    popToast('s', 'Excel inventory report exported successfully!');
  };

  // Filter Catalog
  const filteredCatalogue = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) || 
                          (item.barcode_value && item.barcode_value.toLowerCase().includes(search.toLowerCase())) ||
                          (item.description && item.description.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesType = selectedType === 'all' || item.item_type === selectedType;
    return matchesSearch && matchesCategory && matchesType;
  });

  // Filter ledger
  const filteredCheckouts = allCheckouts.filter(c => {
    const name = c.member?.name || '';
    const item = c.items?.name || '';
    const matchesSearch = name.toLowerCase().includes(checkoutSearch.toLowerCase()) || 
                          item.toLowerCase().includes(checkoutSearch.toLowerCase()) ||
                          (c.unit?.barcode_value && c.unit.barcode_value.toLowerCase().includes(checkoutSearch.toLowerCase()));
    
    let matchesStatus = true;
    if (checkoutStatusFilter === 'active') matchesStatus = c.status === 'active';
    else if (checkoutStatusFilter === 'returned') matchesStatus = c.status === 'returned';
    else if (checkoutStatusFilter === 'overdue') {
      const isOverdue = c.status === 'overdue' || (c.status === 'active' && c.due_return_date && new Date(c.due_return_date) < new Date());
      matchesStatus = isOverdue;
    }
    
    return matchesSearch && matchesStatus;
  });

  // Overdue math
  const getDaysOut = (dateStr: string) => {
    const start = new Date(dateStr);
    const end = new Date();
    const diff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  const getDaysOutValue = (c: CheckoutRecord) => {
    if (c.item_type_at_checkout === 'permanent') return '—';
    if (c.status === 'returned') return '—';
    if (!c.due_return_date) return '—';
    const due = new Date(c.due_return_date);
    const now = new Date();
    due.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    if (now > due) {
      const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      return `${diff}d`;
    }
    return '0d';
  };

  return (
    <div className="inv-wrap" style={{ animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)', padding: '30px', maxWidth: '1400px', margin: '0 auto' }}>
      
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

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal" style={{ maxWidth: '400px', width: '90%', borderRadius: '24px', padding: '28px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>
              {confirmDialog.icon === 'delete' ? '🗑️' : confirmDialog.icon === 'deactivate' ? '👁️' : '📁'}
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginBottom: '12px' }}>{confirmDialog.title}</h3>
            <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5, marginBottom: '24px' }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirmDialog(null)} style={{ flex: 1, height: '42px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
              <button 
                onClick={confirmDialog.onConfirm} 
                style={{ flex: 1, height: '42px', border: 'none', background: confirmDialog.danger ? '#ef4444' : 'var(--teal)', color: '#fff', borderRadius: '12px', fontWeight: 800 }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="inv-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.75px', margin: 0 }}>Inventory Admin</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '6px 0 0 0', fontWeight: 500 }}>Create items, monitor member checkouts, and override warehouse records.</p>
        </div>
        <div className="inv-header-btns" style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setShowCategoryModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '14px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
          >
            <FolderPlus size={14} /> Manage Categories
          </button>
          <button 
            onClick={() => {
              if (activeTab === 'catalogue') loadCatalogue(false);
              else if (activeTab === 'checkouts') loadCheckouts(false);
              else if (activeTab === 'damage_review') loadDamageReview(false);
            }}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '14px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: refreshing ? 'default' : 'pointer' }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} /> 
            {refreshing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Tabs list matching Claude Prototype */}
      <div className="inv-tabs" style={{ display: 'none', gap: '8px', marginBottom: '32px', borderBottom: '2.5px solid #f1f5f9', paddingBottom: '2px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('catalogue')}
          style={{
            padding: '14px 20px', fontWeight: 800, fontSize: '14.5px', border: 'none', background: 'none',
            borderBottom: activeTab === 'catalogue' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'catalogue' ? 'var(--teal)' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap'
          }}
        >
          🛍️ Product Catalog
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('barcodes')}
          style={{
            padding: '14px 20px', fontWeight: 800, fontSize: '14.5px', border: 'none', background: 'none',
            borderBottom: activeTab === 'barcodes' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'barcodes' ? 'var(--teal)' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap'
          }}
        >
          📊 Barcode Manager
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('scanner')}
          style={{
            padding: '14px 20px', fontWeight: 800, fontSize: '14.5px', border: 'none', background: 'none',
            borderBottom: activeTab === 'scanner' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'scanner' ? 'var(--teal)' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap'
          }}
        >
          📷 Scanner (Check In/Out)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('checkouts')}
          style={{
            padding: '14px 20px', fontWeight: 800, fontSize: '14.5px', border: 'none', background: 'none',
            borderBottom: activeTab === 'checkouts' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'checkouts' ? 'var(--teal)' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap'
          }}
        >
          ⚡ My Items & Leases
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('missions')}
          style={{
            padding: '14px 20px', fontWeight: 800, fontSize: '14.5px', border: 'none', background: 'none',
            borderBottom: activeTab === 'missions' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'missions' ? 'var(--teal)' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap'
          }}
        >
          🎯 Mission Packages
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          style={{
            padding: '14px 20px', fontWeight: 800, fontSize: '14.5px', border: 'none', background: 'none',
            borderBottom: activeTab === 'reports' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'reports' ? 'var(--teal)' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap'
          }}
        >
          📊 Inventory Reports
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          style={{
            padding: '14px 20px', fontWeight: 800, fontSize: '14.5px', border: 'none', background: 'none',
            borderBottom: activeTab === 'settings' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'settings' ? 'var(--teal)' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap'
          }}
        >
          ⚙️ Settings
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('damage_review')}
          style={{
            padding: '14px 20px', fontWeight: 800, fontSize: '14.5px', border: 'none', background: 'none',
            borderBottom: activeTab === 'damage_review' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
            color: activeTab === 'damage_review' ? 'var(--teal)' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap'
          }}
        >
          ⚠️ Damage Queue ({damageRecords.length})
        </button>
      </div>

      {/* Loading state */}
      {initialLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 0', gap: '16px' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid #f1f5f9', borderTop: '4px solid var(--teal)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>Syncing admin ledger...</span>
        </div>
      ) : (
        <>
          {/* ① CATALOGUE TAB */}
          {activeTab === 'catalogue' && (
            <>
              {/* Filters Bar */}
              <div className="inv-filters" style={{ display: 'flex', gap: '14px', marginBottom: '32px', flexWrap: 'wrap', alignItems: 'center' }}>
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

                <div className="inv-type-pills" style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '14px' }}>
                  <button onClick={() => setSelectedType('all')} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', background: selectedType === 'all' ? '#fff' : 'transparent', color: selectedType === 'all' ? '#0f172a' : '#64748b' }}>All</button>
                  <button onClick={() => setSelectedType('lease')} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', background: selectedType === 'lease' ? '#fff' : 'transparent', color: selectedType === 'lease' ? '#0f172a' : '#64748b' }}>Lease</button>
                  <button onClick={() => setSelectedType('permanent')} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', background: selectedType === 'permanent' ? '#fff' : 'transparent', color: selectedType === 'permanent' ? '#0f172a' : '#64748b' }}>Permanent</button>
                </div>

                {/* View Toggles matching Claude Prototype */}
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '14px', marginRight: 'auto' }}>
                  <button onClick={() => setViewMode('gallery')} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', background: viewMode === 'gallery' ? '#fff' : 'transparent', color: viewMode === 'gallery' ? '#0f172a' : '#64748b' }}>
                    <Grid size={13} /> Gallery
                  </button>
                  <button onClick={() => setViewMode('table')} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 800, border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#0f172a' : '#64748b' }}>
                    <List size={13} /> Table
                  </button>
                </div>

                <button 
                  onClick={() => setShowAddModal(true)}
                  className="bsm s"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 24px', height: '46px', borderRadius: '14px', fontSize: '13px', fontWeight: 800 }}
                >
                  <Plus size={16} /> Add Catalog Item
                </button>
              </div>

              {filteredCatalogue.length === 0 ? (
                <div className="card" style={{ padding: '80px 24px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '2px dashed #e2e8f0' }}>
                  <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.4, color: '#64748b' }} />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>No Catalogue Matches</h3>
                  <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#94a3b8' }}>Try adding items or clearing filters.</p>
                </div>
              ) : (
                <>
                  {/* ① GALLERY VIEW */}
                  {viewMode === 'gallery' && (
                    <div className="cat-grid fu">
                      {/* Embedded custom styling overrides to match prototype exactly */}
                      <style>{`
                        .cat-grid {
                          display: grid;
                          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
                          gap: 18px;
                        }
                        .cat-card {
                          background: #ffffff;
                          border-radius: 18px;
                          border: 1.5px solid #E2DED6;
                          overflow: hidden;
                          transition: all .28s cubic-bezier(.34,1.56,.64,1);
                          cursor: pointer;
                          position: relative;
                          box-shadow: 0 2px 12px rgba(13,115,119,.07);
                          display: flex;
                          flex-direction: column;
                          height: 100%;
                        }
                        .cat-card:hover {
                          transform: translateY(-5px) scale(1.01);
                          box-shadow: 0 8px 32px rgba(13,115,119,.12);
                          border-color: rgba(13,115,119,.18);
                        }
                        .cc-img {
                          width: 100%;
                          height: 160px;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          font-size: 60px;
                          position: relative;
                          overflow: hidden;
                        }
                        .cc-img img {
                          width: 100%;
                          height: 100%;
                          object-fit: cover;
                          position: absolute;
                          inset: 0;
                        }
                        .cc-img.bg-edu { background: linear-gradient(135deg,#EFF6FF,#DBEAFE); }
                        .cc-img.bg-rel { background: linear-gradient(135deg,#F0FDF4,#DCFCE7); }
                        .cc-img.bg-hlt { background: linear-gradient(135deg,#FFF7ED,#FFEDD5); }
                        .cc-img.bg-wel { background: linear-gradient(135deg,#FDF4FF,#F3E8FF); }
                        .cc-img.bg-def { background: linear-gradient(135deg,#E6E2DA,#DEDAD0); }
                        .cc-stock-bar {
                          position: absolute;
                          bottom: 0;
                          left: 0;
                          right: 0;
                          height: 3px;
                          background: #E2DED6;
                        }
                        .cc-stock-fill {
                          height: 100%;
                          transition: width 0.6s ease;
                        }
                        .cc-hover-overlay {
                          position: absolute;
                          inset: 0;
                          background: rgba(13,115,119,0.85);
                          display: flex;
                          flex-direction: column;
                          align-items: center;
                          justify-content: center;
                          gap: 9px;
                          opacity: 0;
                          transition: opacity 0.25s;
                          z-index: 10;
                        }
                        .cat-card:hover .cc-hover-overlay {
                          opacity: 1;
                        }
                        .cc-hover-btn {
                          padding: 8px 18px;
                          border-radius: 50px;
                          font-size: 12.5px;
                          font-weight: 600;
                          cursor: pointer;
                          border: none;
                          transition: all 0.2s;
                          display: flex;
                          align-items: center;
                          gap: 6px;
                        }
                        .cc-body {
                          padding: 14px 16px;
                          text-align: left;
                          display: flex;
                          flex-direction: column;
                          flex: 1;
                        }
                        .cc-cat {
                          font-size: 11px;
                          font-weight: 700;
                          text-transform: uppercase;
                          letter-spacing: .5px;
                          color: #6B7280;
                          margin-bottom: 5px;
                        }
                        .cc-name {
                          font-family: 'Playfair Display', serif;
                          font-size: 16px;
                          font-weight: 700;
                          margin-bottom: 6px;
                          line-height: 1.3;
                          color: #1A1F2E;
                        }
                        .cc-sku {
                          font-family: 'JetBrains Mono', monospace;
                          font-size: 10.5px;
                          color: #9CA3AF;
                          margin-bottom: 8px;
                          letter-spacing: .3px;
                        }
                        .cc-stats {
                          display: flex;
                          align-items: center;
                          justify-content: space-between;
                          margin-bottom: 10px;
                        }
                        .cc-bc-row {
                          border-top: 1px solid #E2DED6;
                          padding-top: 10px;
                          display: flex;
                          align-items: center;
                          justify-content: space-between;
                          margin-top: auto;
                        }
                        .cc-bc-svg-wrap {
                          flex: 1;
                          overflow: hidden;
                          display: flex;
                          justify-content: center;
                        }
                        .cc-bc-actions {
                          display: flex;
                          gap: 5px;
                          margin-left: 8px;
                        }
                        .cc-bc-action {
                          width: 28px;
                          height: 28px;
                          border-radius: 7px;
                          border: 1.5px solid #E2DED6;
                          background: #fff;
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          font-size: 13px;
                          transition: all 0.2s;
                        }
                        .cc-bc-action:hover {
                          border-color: #0D7377;
                          background: rgba(13,115,119,0.08);
                        }
                      `}</style>

                      {filteredCatalogue.map(item => {
                        const unitsList = item.units || [];
                        const availableUnits = unitsList.filter((u: any) => u.status === 'available').length;
                        const outUnits = unitsList.filter((u: any) => u.status === 'checked_out').length;
                        const pctAvailable = item.total_stock > 0 ? Math.round((availableUnits / item.total_stock) * 100) : 0;
                        
                        const stockColor = availableUnits > item.total_stock * 0.5 ? '#16A34A' : availableUnits > 0 ? '#F0A500' : '#EF4444';
                        const stockLabel = availableUnits > item.total_stock * 0.5 ? '✓ In Stock' : availableUnits > 0 ? '⚠ Low Stock' : '✕ Out of Stock';
                        const stockBdg = availableUnits > item.total_stock * 0.5 ? 'bdg-g' : availableUnits > 0 ? 'bdg-a' : 'bdg-r';

                        const reviewsList = (item as any).reviews || [];
                        const avgRating = reviewsList.length > 0 
                          ? Math.round(reviewsList.reduce((acc: number, r: any) => acc + r.rating, 0) / reviewsList.length) 
                          : 5; // default mock rating

                        return (
                          <div key={item.id} className="cat-card" onClick={() => setSelectedProductDetail(item)}>
                            
                            {/* Photo / Emoji Section */}
                            <div className={`cc-img ${getCategoryBgClass(item.categories?.name || '')}`}>
                              {item.photo_url ? (
                                <img src={item.photo_url} alt={item.name} />
                              ) : (
                                <span style={{ fontSize: '64px' }}>
                                  {getProductEmoji(item.name, item.categories?.name || '')}
                                </span>
                              )}

                              {/* Green Stock Progress bar border */}
                              <div className="cc-stock-bar">
                                <div className="cc-stock-fill" style={{ width: `${pctAvailable}%`, background: stockColor }} />
                              </div>

                              {/* Hover overlay actions */}
                              <div className="cc-hover-overlay">
                                <button 
                                  className="cc-hover-btn" 
                                  style={{ background: '#fff', color: 'var(--teal)' }}
                                  onClick={(e) => { e.stopPropagation(); setSelectedProductDetail(item); }}
                                >
                                  📋 View Details
                                </button>
                                {item.item_type === 'lease' && (
                                  <button 
                                    className="cc-hover-btn" 
                                    style={{ background: 'var(--teal)', color: '#fff' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setScannerMode('checkout');
                                      setManualBarcode(item.units?.[0]?.barcode_value || item.barcode_value || '');
                                      setActiveTab('scanner');
                                      handleSelectQuickScan(item.units?.[0]?.barcode_value || item.barcode_value || '');
                                    }}
                                  >
                                    📤 Check Out
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Details body */}
                            <div className="cc-body">
                              <div className="cc-cat">{item.categories?.name || 'Uncategorized'}</div>
                              <div className="cc-name">{item.name}</div>
                              
                              <div className="cc-stats">
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>
                                  Stock: {item.total_stock}
                                </span>
                                <span className={`bdg ${stockBdg}`}>{stockLabel}</span>
                              </div>

                              {/* Admin Extra Actions Row */}
                              <div style={{ display: 'flex', gap: '6px', marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setEditingItem(item); }} 
                                  style={{ flex: 1, padding: '5px 0', fontSize: '11px', fontWeight: 800, border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer' }}
                                >
                                  ✏️ Edit
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setAdjustingItem(item); setAdjustNewStock(item.available_stock); }} 
                                  style={{ flex: 1, padding: '5px 0', fontSize: '11px', fontWeight: 800, border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer' }}
                                >
                                  ⚙️ Adjust
                                </button>
                              </div>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ② TABLE VIEW */}
                  {viewMode === 'table' && (
                    <div className="card" style={{ padding: 0, borderRadius: '24px', overflow: 'hidden', border: '1.5px solid #f1f5f9', background: '#fff' }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569' }}>Product Info</th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569' }}>Category</th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569' }}>Type</th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569' }}>Total Stock</th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCatalogue.map(item => {
                              return (
                                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '16px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      <div style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', overflow: 'hidden' }}>
                                        {item.photo_url ? <img src={item.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (item.item_type === 'lease' ? '🛠️' : '📦')}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: 800, color: '#1e293b' }}>{item.name}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td style={{ padding: '16px 20px', fontWeight: 700, color: '#475569' }}>{item.categories?.name || 'Uncategorized'}</td>
                                  <td style={{ padding: '16px 20px' }}>
                                    <span className={`bdg ${item.item_type === 'lease' ? 'bdg-b' : 'bdg-g'}`} style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                                      {item.item_type}
                                    </span>
                                  </td>
                                  <td style={{ padding: '16px 20px' }}>
                                    <div style={{ fontWeight: 800, color: '#1e293b' }}>
                                      {item.total_stock}
                                    </div>
                                  </td>
                                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                      <button onClick={() => setSelectedProductDetail(item)} className="bsm s" style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '8px' }}>View Detail</button>
                                      <button onClick={() => setEditingItem(item)} className="bsm g" style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>Edit</button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ③ BARCODES PRINT VIEW */}
                  {viewMode === 'barcodes' && (
                    <div style={{ background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: '24px', padding: '28px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                          <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>All Product SKU Barcodes</h3>
                          <p style={{ fontSize: '12px', color: '#64748b' }}>Ready-to-print SKU sheets for product catalog shelves.</p>
                        </div>
                        <button onClick={() => window.print()} className="bsm dark" style={{ height: '38px', borderRadius: '10px' }}>
                          <Printer size={13} /> Print Barcode Sheet
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                        {filteredCatalogue.map(item => (
                          <div key={item.id} style={{ border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <div style={{ fontSize: '9px', fontWeight: 900, color: 'var(--teal)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '4px' }}>SKSSF POYANAD BRANCH</div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', height: '18px', overflow: 'hidden', width: '100%' }}>{item.name}</div>
                            <div style={{ margin: '6px 0' }}>
                              {item.barcode_value ? <BarcodeSVG value={item.barcode_value} /> : 'No Barcode'}
                            </div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>{item.categories?.name || 'General'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ①.B BARCODE MANAGER TAB */}
          {activeTab === 'barcodes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              {/* Page Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '24px' }}>📊</span>
                    <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#1A1F2E', fontFamily: 'Playfair Display, serif', margin: 0 }}>Barcode Manager</h3>
                  </div>
                  <p style={{ fontSize: '13px', color: '#6B7280', margin: '4px 0 0 0' }}>View, print, and manage all product barcodes</p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setPrintJob({ type: 'all' })} 
                  style={{ height: '42px', padding: '0 20px', background: '#1A1F2E', color: '#fff', borderRadius: '50px', border: 'none', fontWeight: 800, fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <Printer size={16} /> Print All
                </button>
              </div>

              {/* List of Products Barcode Cards */}
              {filteredCatalogue.map(item => {
                const unitsList = item.units || [];
                const showCount = 6;
                const visibleUnits = unitsList.slice(0, showCount);
                const remainingCount = unitsList.length - showCount;

                return (
                  <div 
                    key={item.id} 
                    style={{ background: '#fff', border: '1.5px solid #E2DED6', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 2px 12px rgba(13,115,119,.04)' }}
                  >
                    {/* Header Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '48px', height: '48px', background: '#F4F1EB', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', border: '1px solid #E2DED6' }}>
                          {getProductEmoji(item.name, item.categories?.name || '')}
                        </div>
                        <div>
                          <h4 style={{ fontSize: '18px', fontWeight: 900, color: '#1A1F2E', fontFamily: 'Playfair Display, serif', margin: 0 }}>{item.name}</h4>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                            <span style={{ background: '#1E293B', color: '#fff', fontSize: '9.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '50px', fontFamily: 'monospace' }}>
                              {item.barcode_value || 'PENDING'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          type="button" 
                          onClick={() => setSelectedProductDetail(item)}
                          style={{ height: '36px', padding: '0 16px', background: '#fff', color: '#4B5563', borderRadius: '50px', border: '1.5px solid #E2DED6', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}
                        >
                          🔍 View
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setPrintJob({ type: 'single', item })}
                          style={{ height: '36px', padding: '0 16px', background: 'var(--teal)', color: '#fff', borderRadius: '50px', border: 'none', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}
                        >
                          🖨️ Print Labels
                        </button>
                      </div>
                    </div>

                    {/* Product Barcode Section */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
                        Product Barcode
                      </div>
                      {item.barcode_value ? (
                        <div style={{ background: '#F9F8F6', border: '1.5px solid #E2DED6', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <BarcodeSVG value={item.barcode_value} />
                          <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#6B7280', marginTop: '6px', letterSpacing: '0.5px' }}>
                            {item.barcode_value}
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '16px', textAlign: 'center', background: '#F9F8F6', borderRadius: '12px', color: '#6B7280' }}>
                          No barcode generated.
                        </div>
                      )}
                    </div>

                    {/* Individual Unit Barcodes */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#6B7280', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.5px' }}>
                        Individual Unit Barcodes (Showing {visibleUnits.length} of {unitsList.length})
                      </div>
                      {unitsList.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', border: '1.5px dashed #E2DED6', borderRadius: '12px', color: '#9CA3AF' }}>
                          No units created yet.
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                            {visibleUnits.map((u: any) => {
                              const isOut = u.status === 'checked_out' || u.status === 'out';
                              return (
                                <div 
                                  key={u.id} 
                                  style={{ border: '1.5px solid #E2DED6', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: '#fff' }}
                                >
                                  <div style={{ fontSize: '8px', fontWeight: 800, color: '#9CA3AF', letterSpacing: '0.5px' }}>› SKSSF</div>
                                  <BarcodeSVG value={u.barcode_value} />
                                  <div style={{ fontSize: '9.5px', fontFamily: 'monospace', fontWeight: 700, color: '#1A1F2E' }}>
                                    {u.barcode_value.split('-').slice(-2).join('-')}
                                  </div>
                                  <div style={{ 
                                    fontSize: '10px', fontWeight: 900, 
                                    color: isOut ? '#2563EB' : '#16A34A',
                                    display: 'flex', alignItems: 'center', gap: '3px'
                                  }}>
                                    {isOut ? '📤 Checked Out' : '✓ Available'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {remainingCount > 0 && (
                            <div 
                              onClick={() => setSelectedProductDetail(item)}
                              style={{ textAlign: 'center', marginTop: '14px', fontSize: '13px', color: 'var(--teal)', fontWeight: 800, cursor: 'pointer' }}
                            >
                              + {remainingCount} more units
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'scanner' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', alignItems: 'start' }} className="inv-2col">
              
              {/* Left Column: Viewfinder simulation */}
              <div style={{ background: '#1e293b', borderRadius: '24px', padding: '28px', color: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, letterSpacing: '-0.3px' }}>📷 Barcode Scanner</h3>
                </div>

                <div className="scan-mode-btns" style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                  <button 
                    onClick={() => { setScannerMode('checkout'); setScanLookupResult(null); }} 
                    style={{ 
                      flex: 1, 
                      padding: '12px', 
                      borderRadius: '12px', 
                      border: '1.5px solid rgba(255,255,255,0.15)', 
                      background: scannerMode === 'checkout' ? 'var(--teal)' : 'transparent', 
                      color: '#fff', 
                      fontSize: '13px', 
                      fontWeight: 800, 
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    📤 Check-Out Mode
                  </button>
                  <button 
                    onClick={() => { setScannerMode('checkin'); setScanLookupResult(null); }} 
                    style={{ 
                      flex: 1, 
                      padding: '12px', 
                      borderRadius: '12px', 
                      border: '1.5px solid rgba(255,255,255,0.15)', 
                      background: scannerMode === 'checkin' ? 'var(--teal)' : 'transparent', 
                      color: '#fff', 
                      fontSize: '13px', 
                      fontWeight: 800, 
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    📥 Check-In Mode
                  </button>
                </div>

                <div style={{ width: '100%', aspectRatio: '16/10', background: '#090d16', borderRadius: '16px', position: 'relative', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '60%', height: '50%', border: '2px dashed rgba(27, 184, 154, 0.4)', borderRadius: '12px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', left: 0, width: '100%', height: '3px', background: '#1BB89A', boxShadow: '0 0 10px #1BB89A', animation: 'scanLineAnim 2s linear infinite' }} />
                  </div>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '16px', fontWeight: 700 }}>viewfinder active (getUserMedia)</span>

                  <style>{`
                    @keyframes scanLineAnim {
                      0% { top: 10% }
                      50% { top: 90% }
                      100% { top: 10% }
                    }
                  `}</style>
                </div>

                <form onSubmit={handleBarcodeLookup} style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                  <input 
                    type="text" 
                    placeholder="Enter or scan barcode (SKSSF-2025-...)" 
                    value={manualBarcode} 
                    onChange={e => setManualBarcode(e.target.value)} 
                    style={{ flex: 1, height: '44px', background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#fff', padding: '0 16px', fontFamily: 'monospace', fontSize: '13px', outline: 'none' }}
                  />
                  <button type="submit" className="bsm s" style={{ height: '44px', borderRadius: '12px', padding: '0 20px' }}>Lookup</button>
                </form>

                <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '10px' }}>Simulate Scan Detection</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxHeight: '110px', overflowY: 'auto' }}>
                    {items.flatMap(item => (item.units || []).slice(0, 3).map((unit: any) => ({
                      barcode: unit.barcode_value,
                      label: `${item.name.split(' ')[0]} (${unit.barcode_value.split('-').pop() || unit.barcode_value})`
                    }))).map((sim, idx) => (
                      <button 
                        key={idx} 
                        onClick={() => handleSelectQuickScan(sim.barcode)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        ⚡ {sim.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div style={{ background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: '24px', padding: '28px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 900 }}>Scan Processing Details</h3>

                {scanError && (
                  <div style={{ background: '#fef2f2', border: '1.5px solid #fee2e2', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#b91c1c', fontSize: '13px', fontWeight: 700, marginBottom: '20px' }}>
                    <AlertTriangle size={16} /> {scanError}
                  </div>
                )}

                {scanLookupResult ? (
                  (() => {
                    const item = scanLookupResult.item;
                    const isUnit = scanLookupResult.type === 'unit';
                    const unit = scanLookupResult.unit;
                    const totalStock = item.total_stock || 0;
                    const availableStock = item.available_stock || 0;
                    const outStock = totalStock - availableStock;
                    const emoji = getProductEmoji(item.name, item.categories?.name || '');

                    return (
                      <div style={{ background: '#E6FCF5', border: '1.5px solid #c3fae8', borderRadius: '20px', padding: '24px', position: 'relative' }}>
                        
                        {/* Header info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '32px' }}>{emoji}</span>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0CA678' }}>
                                {item.name}
                              </h4>
                              <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748b', marginTop: '2px' }}>
                                SKU: {item.barcode_value}
                                {isUnit && (
                                  <span style={{ color: 'var(--teal)', fontWeight: 800, marginLeft: '6px' }}>
                                    • Unit: {unit.barcode_value}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <span style={{ 
                            padding: '4px 10px', 
                            borderRadius: '50px', 
                            background: '#C3FAE8', 
                            color: '#0CA678', 
                            fontSize: '11px', 
                            fontWeight: 900 
                          }}>
                            {availableStock} available
                          </span>
                        </div>

                        {/* Stats grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
                          <div style={{ background: 'rgba(0,0,0,0.03)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                            <div style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'Playfair Display, serif', color: '#1e293b' }}>{totalStock}</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontWeight: 700 }}>Total</div>
                          </div>
                          <div style={{ background: '#d3f9d8', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                            <div style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'Playfair Display, serif', color: '#2b8a3e' }}>{availableStock}</div>
                            <div style={{ fontSize: '11px', color: '#2b8a3e', marginTop: '2px', fontWeight: 700 }}>Available</div>
                          </div>
                          <div style={{ background: '#e7f5ff', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                            <div style={{ fontSize: '20px', fontWeight: 900, fontFamily: 'Playfair Display, serif', color: '#1c7ed6' }}>{outStock}</div>
                            <div style={{ fontSize: '11px', color: '#1c7ed6', marginTop: '2px', fontWeight: 700 }}>Out</div>
                          </div>
                        </div>

                        {/* Processing form fields */}
                        {scannerMode === 'checkout' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                            {/* Member Selection — hidden for member role, shown for admin/super */}
                            {profile?.role === 'member' ? (
                              <div style={{ background: 'rgba(13,115,119,0.06)', padding: '10px 14px', borderRadius: '10px', border: '1px solid #c3fae8', fontSize: '13px', color: '#0ca678', fontWeight: 700 }}>
                                📋 Requesting as: <strong>{profile?.name || 'Current Member'}</strong>
                              </div>
                            ) : (
                              <div>
                                <label className="fl2" style={{ color: '#2b2d42', fontWeight: 700 }}>Select Member *</label>
                                <select 
                                  value={scannerMemberId} 
                                  onChange={e => setScannerMemberId(e.target.value)} 
                                  className="sel2" 
                                  style={{ width: '100%', height: '42px', borderRadius: '10px', border: '1px solid #c3fae8', background: '#fff' }}
                                >
                                  <option value="">Choose member...</option>
                                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                              </div>
                            )}

                            <div>
                              <label className="fl2" style={{ color: '#2b2d42', fontWeight: 700 }}>Welfare Mission Package *</label>
                              <select 
                                value={scannerMission} 
                                onChange={e => setScannerMission(e.target.value)} 
                                className="sel2" 
                                style={{ width: '100%', height: '42px', borderRadius: '10px', border: '1px solid #c3fae8', background: '#fff' }}
                              >
                                {missionsList.map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            </div>
                            
                            <div>
                              <label className="fl2" style={{ color: '#2b2d42', fontWeight: 700 }}>Notes / Remarks (Optional)</label>
                              <input 
                                type="text" 
                                placeholder="E.g. pristine condition..." 
                                value={scanNotes}
                                onChange={e => setScanNotes(e.target.value)}
                                className="fi2" 
                                style={{ border: '1px solid #c3fae8', background: '#fff' }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ background: 'rgba(12, 166, 120, 0.08)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(12, 166, 120, 0.2)', fontSize: '13px', color: '#0ca678' }}>
                              <strong>Check In Return Match</strong>: Mark unit barcode <code>{unit?.barcode_value}</code> as returned and available.
                            </div>
                            
                            {unit?.current_checkout?.member && (
                              <div style={{ fontSize: '13px', color: '#334155' }}>
                                Borrowed by: <strong>{unit.current_checkout.member.name}</strong> ({unit.current_checkout.member.membership_no || 'No Member No'})
                              </div>
                            )}

                            <div>
                              <label className="fl2" style={{ color: '#2b2d42', fontWeight: 700 }}>Notes / Return Condition (Optional)</label>
                              <input 
                                type="text" 
                                placeholder="E.g., returned in good condition..." 
                                value={scanNotes}
                                onChange={e => setScanNotes(e.target.value)}
                                className="fi2" 
                                style={{ border: '1px solid #c3fae8', background: '#fff' }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button 
                            onClick={() => setScanLookupResult(null)} 
                            style={{ 
                              flex: 1, 
                              height: '44px', 
                              border: '1.5px solid #c3fae8', 
                              background: '#fff', 
                              color: '#0ca678', 
                              borderRadius: '50px', 
                              fontSize: '12px', 
                              fontWeight: 800,
                              cursor: 'pointer' 
                            }}
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={handleConfirmScannerAction} 
                            disabled={scanSubmitting || (scannerMode === 'checkout' && !scannerMemberId)}
                            className="bsm s" 
                            style={{ 
                              flex: 2, 
                              height: '44px', 
                              borderRadius: '50px', 
                              fontSize: '12px', 
                              background: 'var(--teal)', 
                              color: '#fff',
                              border: 'none',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                          >
                            {scanSubmitting ? (
                              'Confirming...'
                            ) : scannerMode === 'checkout' ? (
                              <>📤 Confirm Check Out</>
                            ) : (
                              <>📥 Confirm Check In</>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedProductDetail(item)}
                            style={{
                              height: '44px',
                              padding: '0 16px',
                              border: '1.5px solid #c3fae8',
                              background: '#fff',
                              color: '#0ca678',
                              borderRadius: '50px',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div style={{ padding: '40px', border: '2px dashed #e2e8f0', borderRadius: '16px', textAlign: 'center', color: '#94a3b8' }}>
                    <BarcodeIcon size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>Awaiting Barcode Scan Detection</div>
                    <p style={{ fontSize: '11px', marginTop: '4px' }}>Scan a barcode or lookup manually to process checkout/check-in.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ③ CURRENTLY CHECKED OUT TAB */}
          {activeTab === 'checkouts' && (() => {
            const myCheckouts = allCheckouts.filter(c => c.member_id === profile?.id);
            const activeLeases = myCheckouts.filter(c => c.status === 'active' && c.item_type_at_checkout === 'lease');
            const history = myCheckouts.filter(c => c.status === 'returned' || c.item_type_at_checkout === 'permanent');

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                
                {/* 1. Active Leases Section */}
                <div className="card" style={{ padding: '28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <span style={{ fontSize: '20px' }}>🕒</span>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>Active Leases</h3>
                  </div>

                  {activeLeases.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '14px', fontWeight: 600 }}>
                      No active leases found.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1.5px solid #f1f5f9', background: '#f8fafc' }}>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>ITEM</th>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>QTY</th>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>CHECKOUT DATE</th>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>EXPECTED RETURN</th>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>STATUS</th>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>ACTION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeLeases.map(c => {
                            const due = new Date(c.due_return_date || '');
                            const now = new Date();
                            due.setHours(0, 0, 0, 0);
                            now.setHours(0, 0, 0, 0);
                            const isOverdue = now > due;
                            const diffTime = Math.abs(now.getTime() - due.getTime());
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            
                            const statusText = isOverdue 
                              ? `OVERDUE BY ${diffDays} DAYS`
                              : `DUE RETURN IN ${diffDays} DAYS`;
                            
                            const statusBg = isOverdue ? '#fee2e2' : '#eff6ff';
                            const statusColor = isOverdue ? '#ef4444' : '#2563eb';

                            return (
                              <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '16px 14px' }}>
                                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.items?.name}</div>
                                  {c.unit?.barcode_value && (
                                    <div style={{ fontSize: '11px', color: '#0ca678', marginTop: '2px', fontWeight: 700 }}>
                                      Unit SKU: {c.unit.barcode_value}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '16px 14px', fontWeight: 800, color: '#334155' }}>{c.quantity}</td>
                                <td style={{ padding: '16px 14px', color: '#64748b' }}>
                                  {c.checkout_date ? new Date(c.checkout_date).toLocaleDateString() : '—'}
                                </td>
                                <td style={{ padding: '16px 14px', color: '#1e293b', fontWeight: 700 }}>
                                  {c.due_return_date ? new Date(c.due_return_date).toLocaleDateString() : '—'}
                                </td>
                                <td style={{ padding: '16px 14px' }}>
                                  <span style={{ 
                                    padding: '4px 10px', 
                                    borderRadius: '6px', 
                                    fontSize: '11px', 
                                    fontWeight: 800,
                                    background: statusBg,
                                    color: statusColor
                                  }}>
                                    {statusText}
                                  </span>
                                </td>
                                <td style={{ padding: '16px 14px', textAlign: 'right' }}>
                                  <button
                                    onClick={() => handleQuickReturn(c.id, 'good')}
                                    style={{
                                      padding: '6px 16px',
                                      borderRadius: '50px',
                                      background: '#0D7377',
                                      color: '#fff',
                                      border: 'none',
                                      fontWeight: 800,
                                      fontSize: '12px',
                                      cursor: 'pointer'
                                    }}
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

                {/* 2. Return Ledger & Grants History Section */}
                <div className="card" style={{ padding: '28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <span style={{ fontSize: '20px' }}>🛡️</span>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>Return Ledger & Grants History</h3>
                  </div>

                  {history.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '14px', fontWeight: 600 }}>
                      No return ledger or grant records found.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1.5px solid #f1f5f9', background: '#f8fafc' }}>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>ITEM</th>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>QTY</th>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>ALLOCATION</th>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>CHECK-OUT DATE</th>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>CHECK-IN DATE & TIME</th>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>CONDITION</th>
                            <th style={{ padding: '14px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map(c => {
                            const isPermanent = c.item_type_at_checkout === 'permanent';
                            const allocationText = isPermanent ? 'Permanent Grant' : 'Lease Return';
                            const actionDate = c.status === 'returned' ? c.actual_return_date : c.checkout_date;
                            
                            const statusText = c.status === 'returned' ? 'RETURNED' : 'ACTIVE';
                            const statusBg = c.status === 'returned' ? '#ecfdf5' : '#eff6ff';
                            const statusColor = c.status === 'returned' ? '#059669' : '#2563eb';

                            return (
                              <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '16px 14px' }}>
                                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.items?.name}</div>
                                  {c.unit?.barcode_value && (
                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                      SKU: {c.unit.barcode_value}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '16px 14px', fontWeight: 800, color: '#334155' }}>{c.quantity}</td>
                                <td style={{ padding: '16px 14px', color: '#475569', fontWeight: 600 }}>{allocationText}</td>
                                <td style={{ padding: '16px 14px', color: '#64748b' }}>
                                  {c.checkout_date ? new Date(c.checkout_date).toLocaleDateString() : '—'}
                                </td>
                                <td style={{ padding: '16px 14px', color: '#64748b' }}>
                                  {c.status === 'returned' && c.actual_return_date
                                    ? new Date(c.actual_return_date).toLocaleString()
                                    : '—'}
                                </td>
                                <td style={{ padding: '16px 14px' }}>
                                  {c.status === 'returned' ? (
                                    <span style={{ 
                                      padding: '3px 8px', 
                                      borderRadius: '6px', 
                                      fontSize: '11px', 
                                      fontWeight: 800, 
                                      background: '#fff7ed', 
                                      color: '#ea580c'
                                    }}>
                                      {String(c.return_condition || 'good').toUpperCase()}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td style={{ padding: '16px 14px', textAlign: 'right' }}>
                                  <span style={{ 
                                    padding: '4px 10px', 
                                    borderRadius: '6px', 
                                    fontSize: '11px', 
                                    fontWeight: 800,
                                    background: statusBg,
                                    color: statusColor
                                  }}>
                                    {statusText}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            );
          })()}

          {/* ④ MISSION PACKAGES TAB */}
          {activeTab === 'missions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              
              {/* Header Section */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '24px' }}>🎯</span>
                    <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#1A1F2E', fontFamily: 'Playfair Display, serif', margin: 0 }}>Mission Packages</h3>
                  </div>
                  <p style={{ fontSize: '13px', color: '#6B7280', margin: '4px 0 0 0' }}>Bundle products into welfare distribution missions and track dispatched items.</p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowCreateMissionModal(true)} 
                  style={{ height: '42px', padding: '0 20px', background: 'var(--teal)', color: '#fff', borderRadius: '50px', border: 'none', fontWeight: 800, fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <Plus size={16} /> Create Mission
                </button>
              </div>

              {/* Grid of Mission Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {missionsList.map((mission) => {
                   const dispatchedCount = allCheckouts.filter(c => {
                     if (c.mission_id) return c.mission_id === mission.id;
                     if (mission.name === 'Ramadan Welfare 2025' && (c.notes?.includes('Ramadan Welfare') || c.notes?.includes('Ramadan'))) return true;
                     if (mission.name === 'Student Support Drive 2025' && (c.notes?.includes('Student Support') || c.notes?.includes('Student'))) return true;
                     if (mission.name === 'Medical Relief Camp' && (c.notes?.includes('Medical Relief') || c.notes?.includes('Medical'))) return true;
                     if (mission.name === 'General Distribution' && (!c.notes?.includes('Ramadan') && !c.notes?.includes('Student') && !c.notes?.includes('Medical'))) return true;
                     return c.notes?.includes(mission.name) || c.notes === mission.name;
                   }).length;

                  return (
                    <div 
                      key={mission.id} 
                      onClick={() => setSelectedMissionDetail(mission)}
                      style={{ 
                        background: '#fff', 
                        border: '1.5px solid #E2DED6', 
                        borderRadius: '18px', 
                        padding: '24px', 
                        display: 'flex', 
                        flexDirection: 'column',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        boxShadow: '0 2px 8px rgba(13,115,119,.03)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(13,115,119,.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(13,115,119,.03)';
                      }}
                    >
                      {/* Top Header of Card */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                        <div style={{ width: '42px', height: '42px', background: 'var(--teal-pale, rgba(13, 115, 119, 0.08))', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
                          {mission.emoji || '🤝'}
                        </div>
                        <span style={{ 
                          padding: '3px 9px', 
                          borderRadius: '50px', 
                          fontSize: '11px', 
                          fontWeight: 900, 
                          background: '#E6FCF5', 
                          color: '#0CA678'
                        }}>
                          Active
                        </span>
                      </div>

                      <h4 style={{ fontSize: '17px', fontWeight: 900, color: '#1A1F2E', marginBottom: '6px' }}>{mission.name}</h4>
                      <p style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.5, flex: 1, marginBottom: '20px' }}>{mission.desc}</p>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F3F4F6', paddingTop: '16px', marginBottom: '16px' }}>
                        <span style={{ fontSize: '11.5px', color: '#9CA3AF', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Items Distributed</span>
                        <strong style={{ fontSize: '15px', color: 'var(--teal)', fontWeight: 900 }}>{dispatchedCount} Units</strong>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setScannerMode('checkout');
                          setScannerMission(mission.name);
                          setActiveTab('scanner');
                          setScanLookupResult(null);
                        }}
                        style={{
                          width: '100%',
                          height: '38px',
                          background: 'var(--teal)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50px',
                          fontWeight: 800,
                          fontSize: '12.5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#0B5F62'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--teal)'}
                      >
                        📷 Scan & Distribute
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Detailed Mission Distribution log */}
              <div className="card" style={{ background: '#fff', border: '1.5px solid #E2DED6', borderRadius: '24px', padding: '28px', boxShadow: '0 2px 12px rgba(13,115,119,.02)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 900, marginBottom: '16px', color: '#1A1F2E' }}>Mission Allocations Ledger</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1.5px solid #E2DED6', background: '#F9F8F6' }}>
                        <th style={{ padding: '12px 14px', fontWeight: 800, color: '#4B5563' }}>Item Unit</th>
                        <th style={{ padding: '12px 14px', fontWeight: 800, color: '#4B5563' }}>Assigned Member</th>
                        <th style={{ padding: '12px 14px', fontWeight: 800, color: '#4B5563' }}>Welfare Mission</th>
                        <th style={{ padding: '12px 14px', fontWeight: 800, color: '#4B5563' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allCheckouts.map(c => {
                        const isOverdue = c.status === 'active' && c.due_return_date && new Date(c.due_return_date) < new Date();
                        
                         let matchedMissionName = 'General Distribution';
                         if (c.mission_id) {
                           const found = missionsList.find(m => m.id === c.mission_id);
                           if (found) matchedMissionName = found.name;
                         } else if (c.notes) {
                           const found = missionsList.find(m => c.notes?.includes(m.name) || c.notes === m.name);
                           if (found) {
                             matchedMissionName = found.name;
                           } else {
                             if (c.notes.includes('Ramadan')) matchedMissionName = 'Ramadan Welfare 2025';
                             else if (c.notes.includes('Student')) matchedMissionName = 'Student Support Drive 2025';
                             else if (c.notes.includes('Medical')) matchedMissionName = 'Medical Relief Camp';
                           }
                         }

                        return (
                          <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontWeight: 800, color: '#1A1F2E' }}>{c.items?.name}</div>
                              {c.unit?.barcode_value && <div style={{ fontSize: '11px', color: 'var(--teal)', fontFamily: 'monospace' }}>{c.unit.barcode_value}</div>}
                            </td>
                            <td style={{ padding: '12px 14px', fontWeight: 700, color: '#4B5563' }}>{c.member?.name}</td>
                            <td style={{ padding: '12px 14px', color: '#4B5563' }}>{matchedMissionName}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{ 
                                padding: '3px 8px', borderRadius: '50px', fontSize: '10px', fontWeight: 900,
                                background: c.status === 'returned' ? '#E6FCF5' : isOverdue ? '#FFF5F5' : '#E7F5FF',
                                color: c.status === 'returned' ? '#0CA678' : isOverdue ? '#F03E3E' : '#1C7ED6'
                              }}>{c.status === 'returned' ? 'Returned' : isOverdue ? 'Overdue' : 'Dispatched'}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ⑤ REPORTS TAB */}
          {activeTab === 'reports' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px' }} className="inv-grid">
                <div style={{ background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: '20px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Catalogue Items</span>
                    <span style={{ fontSize: '20px' }}>📦</span>
                  </div>
                  <strong style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>{items.length} Types</strong>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Total products registered</div>
                </div>

                <div style={{ background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: '20px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Total Physical Units</span>
                    <span style={{ fontSize: '20px' }}>🏷️</span>
                  </div>
                  <strong style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>{items.reduce((acc, p) => acc + p.total_stock, 0)} Units</strong>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Barcoded items on catalog</div>
                </div>

                <div style={{ background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: '20px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Active Leases</span>
                    <span style={{ fontSize: '20px' }}>📤</span>
                  </div>
                  <strong style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>{allCheckouts.filter(c => c.status === 'active').length} Out</strong>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Units held by members</div>
                </div>

                <div style={{ background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: '20px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Damage Resolving</span>
                    <span style={{ fontSize: '20px' }}>⚠️</span>
                  </div>
                  <strong style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>{damageRecords.length} Flagged</strong>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Awaiting resolution reviews</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: '20px', padding: '20px 28px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 900 }}>Compile Workbook Reports</h3>
                  <p style={{ fontSize: '12px', color: '#64748b' }}>Generate consolidated spreadsheet reports of all items, stock levels, and active checkout ledgers.</p>
                </div>
                <button onClick={handleExportExcel} className="bsm s" style={{ height: '44px', borderRadius: '12px', background: '#059669', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileSpreadsheet size={15} /> Export Reports to Excel
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="inv-2col">
                <div className="card" style={{ background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: '24px', padding: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 900, marginBottom: '16px', color: '#dc2626' }}>⚠️ Low Stock Warnings</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {items.filter(item => item.available_stock <= 1).length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>All catalog stock levels are adequate.</div>
                    ) : (
                      items.filter(item => item.available_stock <= 1).map(item => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff5f5', border: '1px solid #fee2e2', borderRadius: '12px', padding: '12px 16px' }}>
                          <div>
                            <strong style={{ fontSize: '13.5px', color: '#991b1b' }}>{item.name}</strong>
                            <div style={{ fontSize: '11px', color: '#b91c1t', marginTop: '2px' }}>{item.categories?.name || 'General'}</div>
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 900, color: '#dc2626' }}>{item.available_stock} Left</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="card" style={{ background: '#fff', border: '1.5px solid #f1f5f9', borderRadius: '24px', padding: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 900, marginBottom: '16px' }}>👤 Member Holdings Summary</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {allCheckouts.filter(c => c.status === 'active').length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No items are currently checked out by members.</div>
                    ) : (
                      Array.from(new Map(allCheckouts.filter(c => c.status === 'active' && c.member).map(c => [c.member_id, c.member])).values())
                        .slice(0, 5)
                        .map((mem: any) => {
                          const holdCount = allCheckouts.filter(c => c.status === 'active' && c.member_id === mem.id).length;
                          return (
                            <div key={mem.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px' }}>
                              <div>
                                <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>{mem.name}</strong>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>{mem.membership_no || 'No Member No'}</div>
                              </div>
                              <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--teal)', background: '#e6fcf5', padding: '4px 10px', borderRadius: '8px' }}>{holdCount} items</span>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ⑥.B SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '24px' }}>⚙️</span>
                    <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#1A1F2E', fontFamily: 'Playfair Display, serif', margin: 0 }}>Inventory Settings</h3>
                  </div>
                  <p style={{ fontSize: '13px', color: '#6B7280', margin: '4px 0 0 0' }}>Configure default parameters, system metadata, and categories.</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="inv-2col">
                {/* Category Configuration Box */}
                <div className="card" style={{ background: '#fff', border: '1.5px solid #E2DED6', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: 900, color: '#1A1F2E', margin: 0 }}>Folder Category Configuration</h4>
                  <p style={{ fontSize: '12.5px', color: '#6B7280', margin: 0 }}>Create, rename, or structure item folders mapping to distributions.</p>
                  <button 
                    type="button" 
                    onClick={() => setShowCategoryModal(true)} 
                    style={{ height: '40px', background: 'var(--teal)', color: '#fff', borderRadius: '12px', border: 'none', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}
                  >
                    Manage Categories
                  </button>
                </div>

                {/* System Variables Config */}
                <div className="card" style={{ background: '#fff', border: '1.5px solid #E2DED6', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: 900, color: '#1A1F2E', margin: 0 }}>Lease Scheme Configurations</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>Default Lease Days</label>
                      <input type="number" defaultValue={30} className="fi2" style={{ marginTop: '4px' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>Auto-Overdue Notifications</label>
                      <select className="sel2" style={{ width: '100%', height: '42px', borderRadius: '10px', marginTop: '4px' }}>
                        <option value="enabled">Enabled (Send Email Alerts)</option>
                        <option value="disabled">Disabled (Manual queue check)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ⑥ DAMAGE QUEUE TAB */}
          {activeTab === 'damage_review' && (
            <div className="card" style={{ padding: '28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <ClipboardList style={{ color: 'var(--teal)' }} size={20} />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>Flagged Damage &amp; Loss Review Queue</h3>
              </div>

              {damageRecords.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13.5px', fontWeight: 600 }}>
                  🎉 Clear! No physical items currently flagged in the damage/loss review queue.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #f1f5f9', background: '#f8fafc' }}>
                        <th style={{ padding: '12px 14px', fontWeight: 900 }}>Member</th>
                        <th style={{ padding: '12px 14px', fontWeight: 900 }}>Item &amp; Unit SKU</th>
                        <th style={{ padding: '12px 14px', fontWeight: 900 }}>Observed Status</th>
                        <th style={{ padding: '12px 14px', fontWeight: 900 }}>Damage Notes</th>
                        <th style={{ padding: '12px 14px', fontWeight: 900, textAlign: 'right' }}>Resolution Options</th>
                      </tr>
                    </thead>
                    <tbody>
                      {damageRecords.map(rec => (
                        <tr key={rec.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '16px 14px' }}>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{rec.member?.name || 'Borrower'}</div>
                          </td>
                          <td style={{ padding: '16px 14px' }}>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{rec.items?.name}</div>
                            {rec.unit?.barcode_value && (
                              <div style={{ fontSize: '11.5px', color: 'var(--teal)', fontWeight: 800, fontFamily: 'monospace', marginTop: '2px' }}>
                                SKU: {rec.unit.barcode_value}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '16px 14px' }}>
                            <span style={{ 
                              padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase',
                              background: rec.return_condition === 'damaged' ? '#fff4e6' : '#fff5f5',
                              color: rec.return_condition === 'damaged' ? '#f76707' : '#fa5252'
                            }}>
                              {rec.return_condition}
                            </span>
                          </td>
                          <td style={{ padding: '16px 14px', color: '#475569' }}>
                            {rec.condition_notes || 'No remarks provided.'}
                          </td>
                          <td style={{ padding: '16px 14px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => handleResolveDamageRecord(rec.id, 'repaired')}
                                className="bsm s"
                                style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '8px' }}
                              >
                                Repaired &amp; Restock
                              </button>
                              <button
                                onClick={() => handleResolveDamageRecord(rec.id, 'writeoff')}
                                className="bsm r"
                                style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '8px', background: '#fee2e2', color: '#ef4444' }}
                              >
                                Write Off
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Product Detail Modal */}
      {selectedProductDetail && (() => {
        const unitsList = selectedProductDetail.units || [];
        const availableCount = unitsList.filter((u: any) => u.status === 'available').length;
        const checkedOutCount = unitsList.filter((u: any) => u.status === 'checked_out' || u.status === 'out').length;
        const itemCheckouts = allCheckouts.filter(c => c.item_id === selectedProductDetail.id);
        const reviewsList = (selectedProductDetail as any).reviews || [];

        return (
          <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
            <div className="modal inv-modal" style={{ maxWidth: '850px', width: '95%', borderRadius: '24px', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
              
              {/* Modal Head */}
              <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', fontWeight: 900, color: '#1A1F2E' }}>
                  {selectedProductDetail.name}
                </span>
                <button 
                  onClick={() => setSelectedProductDetail(null)} 
                  style={{ border: '1px solid #E2DED6', background: 'transparent', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* 2-Column Info block */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginBottom: '24px' }} className="inv-2col">
                {/* Left side: Photo or emoji container */}
                <div style={{ height: '180px', background: '#F4F1EB', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px', border: '1px solid #E2DED6', overflow: 'hidden' }}>
                  {selectedProductDetail.photo_url ? (
                    <img src={selectedProductDetail.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '72px' }}>{getProductEmoji(selectedProductDetail.name, selectedProductDetail.categories?.name || '')}</span>
                  )}
                </div>

                {/* Right side: Stats summary + barcode and action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Stats summary cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div style={{ background: '#F9F8F6', border: '1.5px solid #E2DED6', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#1A1F2E' }}>{selectedProductDetail.total_stock}</div>
                      <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700 }}>Total Units</div>
                    </div>
                    <div style={{ background: '#F0FDF4', border: '1.5px solid #DCFCE7', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#16A34A' }}>{availableCount}</div>
                      <div style={{ fontSize: '11px', color: '#15803D', fontWeight: 700 }}>Available</div>
                    </div>
                    <div style={{ background: '#EFF6FF', border: '1.5px solid #DBEAFE', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#2563EB' }}>{checkedOutCount}</div>
                      <div style={{ fontSize: '11px', color: '#1D4ED8', fontWeight: 700 }}>Checked Out</div>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {selectedProductDetail.item_type === 'lease' && (
                      <button 
                        type="button" 
                        onClick={() => {
                          setSelectedProductDetail(null);
                          setScannerMode('checkout');
                          setManualBarcode(selectedProductDetail.units?.[0]?.barcode_value || selectedProductDetail.barcode_value || '');
                          setActiveTab('scanner');
                          handleSelectQuickScan(selectedProductDetail.units?.[0]?.barcode_value || selectedProductDetail.barcode_value || '');
                        }} 
                        style={{ height: '38px', padding: '0 16px', background: '#FEF3C7', color: '#D97706', borderRadius: '50px', border: 'none', fontWeight: 800, fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                      >
                        📤 Check Out
                      </button>
                    )}
                    <button 
                      type="button" 
                      onClick={() => { setEditingItem(selectedProductDetail); setSelectedProductDetail(null); }} 
                      style={{ height: '38px', padding: '0 16px', background: '#fff', color: '#4B5563', borderRadius: '50px', border: '1.5px solid #E2DED6', fontWeight: 800, fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                    >
                      ✏️ Edit
                    </button>
                  </div>
                </div>
              </div>

              {/* Sub-tabs Nav bar */}
              <div style={{ display: 'flex', gap: '12px', borderBottom: '2px solid #F3F4F6', marginBottom: '16px', paddingBottom: '2px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedDetailTab('units')}
                  style={{
                    padding: '8px 16px', fontWeight: 800, fontSize: '13.5px', border: 'none', background: 'none',
                    borderBottom: selectedDetailTab === 'units' ? '3px solid var(--teal)' : '3px solid transparent',
                    color: selectedDetailTab === 'units' ? 'var(--teal)' : '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  📦 Units ({unitsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDetailTab('distribution')}
                  style={{
                    padding: '8px 16px', fontWeight: 800, fontSize: '13.5px', border: 'none', background: 'none',
                    borderBottom: selectedDetailTab === 'distribution' ? '3px solid var(--teal)' : '3px solid transparent',
                    color: selectedDetailTab === 'distribution' ? 'var(--teal)' : '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  📋 Distribution ({itemCheckouts.length})
                </button>
              </div>

              {/* Tab contents */}
              {selectedDetailTab === 'units' && (
                <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1.5px solid #E2DED6', borderRadius: '12px' }}>
                  {unitsList.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9B9B9B' }}>No physical units tracked for this item.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                      <thead>
                        <tr style={{ background: '#F9F8F6', borderBottom: '1px solid #E2DED6' }}>
                          <th style={{ padding: '8px 12px', fontWeight: 800 }}>Unit No</th>
                          <th style={{ padding: '8px 12px', fontWeight: 800 }}>Unit barcode SKU</th>
                          <th style={{ padding: '8px 12px', fontWeight: 800 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unitsList.map((u: any) => {
                          let statusColor = '#16A34A';
                          let statusBg = '#F0FDF4';
                          if (u.status === 'checked_out' || u.status === 'out') { statusColor = '#2563EB'; statusBg = '#EFF6FF'; }
                          else if (u.status === 'damaged') { statusColor = '#EA580C'; statusBg = '#FFF7ED'; }
                          else if (u.status === 'lost') { statusColor = '#DC2626'; statusBg = '#FEF2F2'; }

                          return (
                            <tr key={u.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 800 }}>#{String(u.unit_number).padStart(2, '0')}</td>
                              <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{u.barcode_value}</td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', background: statusBg, color: statusColor }}>
                                  {u.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {selectedDetailTab === 'distribution' && (
                <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1.5px solid #E2DED6', borderRadius: '12px' }}>
                  {itemCheckouts.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9B9B9B' }}>No checkout history recorded for this product.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                      <thead>
                        <tr style={{ background: '#F9F8F6', borderBottom: '1px solid #E2DED6' }}>
                          <th style={{ padding: '10px 12px', fontWeight: 800 }}>UNIT ID</th>
                          <th style={{ padding: '10px 12px', fontWeight: 800 }}>MEMBER</th>
                          <th style={{ padding: '10px 12px', fontWeight: 800 }}>MISSION</th>
                          <th style={{ padding: '10px 12px', fontWeight: 800 }}>CHECKOUT</th>
                          <th style={{ padding: '10px 12px', fontWeight: 800 }}>CHECK-IN</th>
                          <th style={{ padding: '10px 12px', fontWeight: 800 }}>ADMIN</th>
                          <th style={{ padding: '10px 12px', fontWeight: 800 }}>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemCheckouts.map((c: any) => {
                          const unitBar = c.unit?.barcode_value || '—';
                          const unitShort = unitBar.includes('-U') ? unitBar.split('-').slice(-2).join('-') : unitBar;
                          const isOut = c.status === 'active';

                          return (
                            <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                              <td style={{ padding: '12px' }}>
                                <span style={{ background: '#1E293B', color: '#fff', fontSize: '10.5px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', fontFamily: 'monospace' }}>
                                  {unitShort}
                                </span>
                              </td>
                              <td style={{ padding: '12px' }}>
                                <div style={{ fontWeight: 800, color: '#1E293B' }}>{c.member?.name || 'Unknown Member'}</div>
                                <div style={{ fontSize: '10.5px', color: '#9CA3AF' }}>{c.member?.membership_no || 'SKSSF-MEMB'}</div>
                              </td>
                              <td style={{ padding: '12px', color: '#4B5563' }}>
                                {c.notes?.includes('Ramadan') ? 'Ramadan Welfare' : c.notes?.includes('Student') ? 'Student Support' : c.notes?.includes('Medical') ? 'Medical Relief' : 'General Distribution'}
                              </td>
                              <td style={{ padding: '12px', color: '#4B5563' }}>{c.checkout_date}</td>
                              <td style={{ padding: '12px', color: '#4B5563' }}>{c.actual_return_date || '—'}</td>
                              <td style={{ padding: '12px', color: '#4B5563' }}>{c.admin?.name || 'Mohammed Ashraf'}</td>
                              <td style={{ padding: '12px' }}>
                                <span style={{ 
                                  padding: '4px 8px', borderRadius: '50px', fontSize: '10px', fontWeight: 900,
                                  background: isOut ? '#EFF6FF' : '#F0FDF4',
                                  color: isOut ? '#2563EB' : '#16A34A',
                                  display: 'inline-flex', alignItems: 'center', gap: '3px'
                                }}>
                                  {isOut ? '📤 Out' : '📥 In'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setSelectedProductDetail(null)} className="bsm s" style={{ height: '40px', borderRadius: '10px', padding: '0 24px', background: 'var(--teal)', color: '#fff' }}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal inv-modal" style={{ maxWidth: '520px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s ease' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900 }}>Create Catalog Product</span>
              <button onClick={() => setShowAddModal(false)} className="modal-close"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleAddItemSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2">Item Name *</label>
                <input type="text" placeholder="E.g., Medical Aid Kit Type A" value={newItemName} onChange={e => setNewItemName(e.target.value)} className="fi2" required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="inv-2col">
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="inv-2col">
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
                <label className="fl2">Product Photo</label>
                <input type="file" id="add-prod-photo-up" hidden accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setNewItemPhoto(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }} />
                <div 
                  onClick={() => document.getElementById('add-prod-photo-up')?.click()}
                  style={{ 
                    border: '2px dashed #e2e8f0', borderRadius: 14, padding: newItemPhoto ? 10 : 20, 
                    textAlign: 'center', cursor: 'pointer', background: '#f8fafc',
                    transition: 'all .2s', position: 'relative'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                >
                  {newItemPhoto ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={newItemPhoto} style={{ maxHeight: 100, borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} alt="Preview" />
                      <div style={{ position: 'absolute', top: -10, right: -10, background: 'var(--red)', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900 }} onClick={(e) => { e.stopPropagation(); setNewItemPhoto(''); }}>✕</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>📸</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Click to upload photo</div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="fl2">Internal Description</label>
                <textarea placeholder="Write detail specifications or logistics guidelines..." value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} className="ta2" rows={2} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                <input 
                  type="checkbox" 
                  id="add-pub-visible"
                  checked={newItemPublicVisible} 
                  onChange={e => setNewItemPublicVisible(e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--teal)', cursor: 'pointer' }}
                />
                <label htmlFor="add-pub-visible" style={{ fontSize: '13px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>Make visible in Public Catalog</label>
              </div>

              <div>
                <label className="fl2">Public Catalog Description</label>
                <textarea 
                  placeholder="Specifications displayed on the public browsing portal..." 
                  value={newItemPublicDesc} 
                  onChange={e => setNewItemPublicDesc(e.target.value)} 
                  className="ta2" 
                  rows={2} 
                />
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
          <div className="modal inv-modal" style={{ maxWidth: '520px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s ease' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900 }}>Edit Catalog Product</span>
              <button onClick={() => setEditingItem(null)} className="modal-close"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleEditItemSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2">Item Name *</label>
                <input type="text" placeholder="E.g., Medical Aid Kit Type A" value={editingItem.name} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} className="fi2" required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="inv-2col">
                <div>
                  <label className="fl2">Category *</label>
                  <select value={editingItem.category_id} onChange={e => setEditingItem({ ...editingItem, category_id: e.target.value })} className="sel2" style={{ width: '100%' }} required>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="fl2">Allocation Type *</label>
                  <select value={editingItem.item_type} disabled className="sel2" style={{ width: '100%', opacity: 0.65 }}>
                    <option value="lease">Lease / Return required</option>
                    <option value="permanent">Permanent grant / Aid package</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="inv-2col">
                <div>
                  <label className="fl2">Stock Count (Total) *</label>
                  <input type="number" min={0} disabled value={editingItem.total_stock} className="fi2" style={{ opacity: 0.65 }} />
                  <span style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px', display: 'block' }}>Use Adjust Stock to change counts.</span>
                </div>
                {editingItem.item_type === 'lease' && (
                  <div>
                    <label className="fl2">Lease Limit (Days)</label>
                    <input type="number" min={1} value={editingItem.lease_duration_days || 30} onChange={e => setEditingItem({ ...editingItem, lease_duration_days: Number(e.target.value) })} className="fi2" required />
                  </div>
                )}
              </div>

              <div>
                <label className="fl2">Product Photo</label>
                <input type="file" id="edit-prod-photo-up" hidden accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setEditingItem({ ...editingItem, photo_url: reader.result as string });
                    reader.readAsDataURL(file);
                  }
                }} />
                <div 
                  onClick={() => document.getElementById('edit-prod-photo-up')?.click()}
                  style={{ 
                    border: '2px dashed #e2e8f0', borderRadius: 14, padding: editingItem.photo_url ? 10 : 20, 
                    textAlign: 'center', cursor: 'pointer', background: '#f8fafc',
                    transition: 'all .2s', position: 'relative'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                >
                  {editingItem.photo_url ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={editingItem.photo_url} style={{ maxHeight: 100, borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} alt="Preview" />
                      <div style={{ position: 'absolute', top: -10, right: -10, background: 'var(--red)', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900 }} onClick={(e) => { e.stopPropagation(); setEditingItem({ ...editingItem, photo_url: null }); }}>✕</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 24, marginBottom: 6 }}>📸</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Click to upload photo</div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="fl2">Internal Description</label>
                <textarea placeholder="Write detail specifications or logistics guidelines..." value={editingItem.description || ''} onChange={e => setEditingItem({ ...editingItem, description: e.target.value })} className="ta2" rows={2} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                <input 
                  type="checkbox" 
                  id="edit-pub-visible"
                  checked={editingItem.public_visible || false} 
                  onChange={e => setEditingItem({ ...editingItem, public_visible: e.target.checked })} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--teal)', cursor: 'pointer' }}
                />
                <label htmlFor="edit-pub-visible" style={{ fontSize: '13px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>Make visible in Public Catalog</label>
              </div>

              <div>
                <label className="fl2">Public Catalog Description</label>
                <textarea 
                  placeholder="Specifications displayed on the public browsing portal..." 
                  value={editingItem.public_description || ''} 
                  onChange={e => setEditingItem({ ...editingItem, public_description: e.target.value })} 
                  className="ta2" 
                  rows={2} 
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setEditingItem(null)} style={{ flex: 1, height: '44px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={formSubmitting} className="bsm s" style={{ flex: 1, height: '44px', borderRadius: '12px' }}>
                  {formSubmitting ? 'Saving...' : 'Save Product Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {adjustingItem && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal inv-modal" style={{ maxWidth: '440px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.2s ease' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900 }}>Adjust Stock Levels</span>
              <button onClick={() => setAdjustingItem(null)} className="modal-close"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleAdjustStockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', fontSize: '13px', color: '#475569' }}>
                <strong>Product:</strong> {adjustingItem.name} <br />
                <strong>Current Stock Count:</strong> {adjustingItem.available_stock} Units
              </div>

              <div>
                <label className="fl2">New Available Stock Count *</label>
                <input 
                  type="number" 
                  min={0} 
                  value={adjustNewStock} 
                  onChange={e => setAdjustNewStock(Number(e.target.value))} 
                  className="fi2" 
                  required 
                />
              </div>

              <div>
                <label className="fl2">Reason for adjustment *</label>
                <textarea 
                  placeholder="E.g., damaged in transit, supplier correction..." 
                  value={adjustReason} 
                  onChange={e => setAdjustReason(e.target.value)} 
                  className="ta2" 
                  rows={3} 
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setAdjustingItem(null)} style={{ flex: 1, height: '42px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={formSubmitting} className="bsm s" style={{ flex: 1, height: '42px', borderRadius: '12px' }}>
                  {formSubmitting ? 'Adjusting...' : 'Apply Adjustments'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Override Checkout Modal */}
      {overrideCheckout && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal inv-modal" style={{ maxWidth: '480px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s ease' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '18px', fontWeight: 900 }}>Override Checkout Details</span>
              <button onClick={() => setOverrideCheckout(null)} className="modal-close"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleOverrideSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1.5px solid #e2e8f0', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><b>Borrower:</b> {overrideCheckout.member?.name}</div>
                <div><b>Product:</b> {overrideCheckout.items?.name}</div>
                {overrideCheckout.unit?.barcode_value && (
                  <div><b>Unit Barcode:</b> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{overrideCheckout.unit.barcode_value}</span></div>
                )}
                <div><b>Checkout Date:</b> {overrideCheckout.checkout_date}</div>
              </div>

              <div>
                <label className="fl2">Return Condition *</label>
                <select value={overrideCondition} onChange={e => setOverrideCondition(e.target.value as any)} className="sel2" style={{ width: '100%' }}>
                  <option value="good">Good / Repackaged</option>
                  <option value="damaged">Damaged unit storage</option>
                  <option value="lost">Lost / Unreturned writeoff</option>
                </select>
              </div>

              <div>
                <label className="fl2">Actual Return Date *</label>
                <input type="date" value={overrideDate} onChange={e => setOverrideDate(e.target.value)} className="fi2" required />
              </div>

              <div>
                <label className="fl2">Condition remarks &amp; notes</label>
                <textarea 
                  placeholder="Explain condition anomalies, lost writeoffs, or repair comments..." 
                  value={overrideNotes} 
                  onChange={e => setOverrideNotes(e.target.value)} 
                  className="ta2" 
                  rows={2} 
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setOverrideCheckout(null)} style={{ flex: 1, height: '42px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" disabled={formSubmitting} className="bsm s" style={{ flex: 1, height: '42px', borderRadius: '12px' }}>
                  {formSubmitting ? 'Applying...' : 'Save Override Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Categories modal */}
      {showCategoryModal && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal inv-modal" style={{ maxWidth: '520px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s ease' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900 }}>Manage Catalogue Categories</span>
              <button onClick={() => setShowCategoryModal(false)} className="modal-close"><X size={20} /></button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="fl2">New Category Name</label>
                  <input type="text" placeholder="E.g., Medical, Educational..." value={newCatName} onChange={e => setNewCatName(e.target.value)} className="fi2" required />
                </div>
                <button type="submit" disabled={catSubmitting} className="bsm s" style={{ height: '44px', borderRadius: '12px', padding: '0 20px' }}>
                  Add
                </button>
              </form>

              <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                {categories.length === 0 ? (
                  <div style={{ padding: '16px', color: '#94a3b8', textAlign: 'center' }}>No categories created.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px 14px', fontWeight: 800 }}>Category Name</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 700 }}>{c.name}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            {isSuper && (
                              <button 
                                onClick={() => handleDeleteCategory(c.id)}
                                style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', padding: '4px' }}
                                title="Delete Category"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Welfare Mission Details Modal */}
      {selectedMissionDetail && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal inv-modal" style={{ maxWidth: '800px', width: '90%', borderRadius: '24px', padding: '28px', background: '#fff', animation: 'slideUp 0.25s ease' }}>
            {/* Header */}
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="modal-title" style={{ fontSize: '22px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{selectedMissionDetail.emoji || '🎯'}</span> {selectedMissionDetail.name}
                </span>
                <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>
                  {allCheckouts.filter(c => {
                    if (selectedMissionDetail.name === 'Ramadan Welfare 2025' && (c.notes?.includes('Ramadan Welfare') || c.notes?.includes('Ramadan'))) return true;
                    if (selectedMissionDetail.name === 'Student Support Drive 2025' && (c.notes?.includes('Student Support') || c.notes?.includes('Student'))) return true;
                    if (selectedMissionDetail.name === 'Medical Relief Camp' && (c.notes?.includes('Medical Relief') || c.notes?.includes('Medical'))) return true;
                    if (selectedMissionDetail.name === 'General Distribution' && (!c.notes?.includes('Ramadan') && !c.notes?.includes('Student') && !c.notes?.includes('Medical'))) return true;
                    return c.notes?.includes(selectedMissionDetail.name) || c.notes === selectedMissionDetail.name;
                  }).length} items distributed under this mission
                </div>
              </div>
              <button onClick={() => setSelectedMissionDetail(null)} className="modal-close" style={{ border: '1px solid #e2e8f0', background: 'transparent', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            </div>
            
            {/* Table of items */}
            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '16px', margin: '20px 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569' }}>Product</th>
                    <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569' }}>Unit</th>
                    <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569' }}>Member</th>
                    <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569' }}>Date</th>
                    <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const missionCheckouts = allCheckouts.filter(c => {
                      if (selectedMissionDetail.name === 'Ramadan Welfare 2025' && (c.notes?.includes('Ramadan Welfare') || c.notes?.includes('Ramadan'))) return true;
                      if (selectedMissionDetail.name === 'Student Support Drive 2025' && (c.notes?.includes('Student Support') || c.notes?.includes('Student'))) return true;
                      if (selectedMissionDetail.name === 'Medical Relief Camp' && (c.notes?.includes('Medical Relief') || c.notes?.includes('Medical'))) return true;
                      if (selectedMissionDetail.name === 'General Distribution' && (!c.notes?.includes('Ramadan') && !c.notes?.includes('Student') && !c.notes?.includes('Medical'))) return true;
                      return c.notes?.includes(selectedMissionDetail.name) || c.notes === selectedMissionDetail.name;
                    });
                    
                    if (missionCheckouts.length === 0) {
                      return (
                        <tr>
                          <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                            No items distributed under this mission yet.
                          </td>
                        </tr>
                      );
                    }

                    return missionCheckouts.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1e293b' }}>
                          {c.items?.name}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {c.unit?.barcode_value ? (
                            <span style={{ background: '#1e293b', color: '#fff', padding: '3px 8px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '11px', fontWeight: 700 }}>
                              {c.unit.barcode_value}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#475569' }}>
                          {c.member?.name || 'Unknown Borrower'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#64748b' }}>
                          {c.checkout_date ? new Date(c.checkout_date).toISOString().split('T')[0] : '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ 
                            padding: '4px 10px', 
                            borderRadius: '50px', 
                            fontSize: '11px', 
                            fontWeight: 900,
                            background: c.status === 'returned' ? '#E6FCF5' : '#E7F5FF',
                            color: c.status === 'returned' ? '#0CA678' : '#1C7ED6'
                          }}>
                            {c.status === 'returned' ? 'Returned' : 'With Member'}
                          </span>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>

            {/* Footer actions */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setSelectedMissionDetail(null)} 
                style={{ height: '42px', padding: '0 20px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '50px', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
              >
                Close
              </button>
              <button 
                onClick={() => {
                  setScannerMode('checkout');
                  setScannerMission(selectedMissionDetail.name);
                  setActiveTab('scanner');
                  setScanLookupResult(null);
                  setSelectedMissionDetail(null);
                }}
                style={{ height: '42px', padding: '0 20px', background: 'var(--teal)', color: '#fff', borderRadius: '50px', border: 'none', fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                📷 Scan & Distribute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Mission Modal */}
      {showCreateMissionModal && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal inv-modal" style={{ maxWidth: '520px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s ease' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '20px', fontWeight: 900 }}>Create Welfare Mission</span>
              <button onClick={() => setShowCreateMissionModal(false)} className="modal-close"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleCreateMissionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2">Mission Name *</label>
                <input 
                  type="text" 
                  placeholder="E.g. Ramadan Welfare 2026, flood relief, etc." 
                  value={newMissionName} 
                  onChange={e => setNewMissionName(e.target.value)} 
                  className="fi2" 
                  required 
                />
              </div>

              <div>
                <label className="fl2">Description *</label>
                <textarea 
                  placeholder="Summarize the support goals and target regions..." 
                  value={newMissionDesc} 
                  onChange={e => setNewMissionDesc(e.target.value)} 
                  className="ta2" 
                  rows={3} 
                  required 
                />
              </div>


              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowCreateMissionModal(false)} style={{ flex: 1, height: '42px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" className="bsm s" style={{ flex: 1, height: '42px', borderRadius: '12px' }}>
                  Create Mission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Dynamic printable area for barcode labels */}
      <div id="print-section-root">
        {printJob && (() => {
          let labels: { barcode: string; name: string; category?: string }[] = [];
          if (printJob.type === 'single' && printJob.item) {
            const item = printJob.item;
            if (item.barcode_value) {
              labels.push({ barcode: item.barcode_value, name: item.name, category: item.categories?.name });
            }
            if (item.units) {
              item.units.forEach((u: any) => {
                if (u.barcode_value) {
                  labels.push({ barcode: u.barcode_value, name: `${item.name} (Unit)`, category: item.categories?.name });
                }
              });
            }
          } else if (printJob.type === 'all') {
            items.forEach((item) => {
              if (item.barcode_value) {
                labels.push({ barcode: item.barcode_value, name: item.name, category: item.categories?.name });
              }
              if (item.units) {
                item.units.forEach((u: any) => {
                  if (u.barcode_value) {
                    labels.push({ barcode: u.barcode_value, name: `${item.name} (Unit)`, category: item.categories?.name });
                  }
                });
              }
            });
          }

          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', background: '#fff', padding: '10px' }}>
              {labels.map((lbl, idx) => (
                <div key={idx} className="bc-label-print" style={{ border: '1px solid #ddd', padding: '12px', textAlign: 'center', background: '#fff', borderRadius: '8px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                    SKSSF eGov • {lbl.category || 'General'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                    <BarcodeSVG value={lbl.barcode} />
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '9px', color: '#0f172a', fontWeight: 'bold' }}>{lbl.barcode}</div>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>{lbl.name}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          #root, .ov, .modal {
            display: none !important;
          }
          #print-section-root {
            display: block !important;
            background: white !important;
            color: black !important;
            width: 100% !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
          }
          .bc-label-print {
            page-break-inside: avoid !important;
          }
        }
        @media screen {
          #print-section-root {
            display: none !important;
          }
        }
      `}} />

    </div>
  );
}
