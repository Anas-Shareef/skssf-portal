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

const compressImage = (file: File, callback: (base64: string) => void) => {
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      callback(dataUrl);
    };
    img.src = event.target?.result as string;
  };
  reader.readAsDataURL(file);
};

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

  return <svg ref={svgRef} data-barcode={value} style={{ maxWidth: '100%' }}></svg>;
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

export default function Inventory() {
  const { profile, hasPermission } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super';
  const isSuper = profile?.role === 'super';

  const tabPermissionMap: Record<string, string> = {
    catalogue: 'catalogue.view',
    barcodes: 'barcode.view',
    scanner: 'scanner.use',
    checkouts: 'checkout.view',
    missions: 'missions.view',
    reports: 'reports.view',
    settings: 'settings.view',
    damage_review: 'checkout.view'
  };

  const allowedTabs = ['catalogue', 'barcodes', 'scanner', 'checkouts', 'missions', 'reports', 'settings', 'damage_review'].filter(t => {
    const requiredPerm = tabPermissionMap[t];
    return profile?.role === 'super' || hasPermission(requiredPerm);
  });

  const defaultTab = allowedTabs[0] || 'catalogue';

  if (!isAdmin || allowedTabs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px', background: '#fff', borderRadius: 24, border: '1.5px solid #e2e8f0', maxWidth: 500, margin: '60px auto' }}>
        <div style={{ fontSize: 72, marginBottom: 20 }}>🛡️</div>
        <h1 style={{ fontSize: 24, fontWeight: 950, color: '#0f172a', margin: 0 }}>Access Restricted</h1>
        <p style={{ fontSize: 14, color: '#64748b', maxWidth: 400, margin: '12px auto 24px', lineHeight: 1.5 }}>
          {!isAdmin 
            ? 'The Inventory & Catalog Management page is reserved for authorized administrators only.' 
            : 'You do not have permission to view any inventory tabs.'}
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

  // State Declarations
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabParam = searchParams.get('tab') || defaultTab;
  const activeTab = (allowedTabs.includes(activeTabParam)
    ? activeTabParam
    : defaultTab) as 'catalogue' | 'barcodes' | 'scanner' | 'checkouts' | 'missions' | 'reports' | 'settings' | 'damage_review';

  const setActiveTab = (tab: 'catalogue' | 'barcodes' | 'scanner' | 'checkouts' | 'missions' | 'reports' | 'settings' | 'damage_review') => {
    setSearchParams({ tab });
  };
  const [viewMode, setViewMode] = useState<'gallery' | 'table' | 'barcodes'>('gallery');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [dashboardFilter, setDashboardFilter] = useState<'all' | 'low' | 'out'>('all');
  const [selectedStockStatus, setSelectedStockStatus] = useState<string>('all');
  const [selectedCondition, setSelectedCondition] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [sortField, setSortField] = useState<'name' | 'stock' | 'health'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
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
  const [printJob, setPrintJob] = useState<{ labels: { barcode: string; name: string; category?: string; productName: string }[]; groupMode: 'category' | 'product' | 'none' } | null>(null);

  // Reports Page State
  const [reportsDateRange, setReportsDateRange] = useState<'today' | 'yesterday' | 'last7' | 'last30' | 'last3m' | 'thisyear' | 'custom'>('last30');
  const [reportsCustomStart, setReportsCustomStart] = useState('');
  const [reportsCustomEnd, setReportsCustomEnd] = useState('');
  const [reportsBranch, setReportsBranch] = useState<string>('all');
  const [reportsCategory, setReportsCategory] = useState<string>('all');
  const [reportsSearch, setReportsSearch] = useState('');
  const [reportsSortField, setReportsSortField] = useState<'name' | 'sku' | 'category' | 'total' | 'available' | 'out' | 'txns'>('name');
  const [reportsSortOrder, setReportsSortOrder] = useState<'asc' | 'desc'>('asc');
  const [reportsQuickFilter, setReportsQuickFilter] = useState<'all' | 'healthy' | 'low' | 'out' | 'checked_out'>('all');
  const [selectedReportProductTxn, setSelectedReportProductTxn] = useState<InventoryItem | null>(null);
  const [showAllCategoriesInReports, setShowAllCategoriesInReports] = useState(false);
  const [showAllProductsInReports, setShowAllProductsInReports] = useState(false);
  const [checkoutWizardUnit, setCheckoutWizardUnit] = useState<any | null>(null);
  const [checkoutWizardMember, setCheckoutWizardMember] = useState('');
  const [checkoutWizardNotes, setCheckoutWizardNotes] = useState('');
  const [checkoutWizardDueReturn, setCheckoutWizardDueReturn] = useState('');
  const [checkoutWizardSubmitting, setCheckoutWizardSubmitting] = useState(false);
  const [checkoutWizardActive, setCheckoutWizardActive] = useState(false);
  const [scannerDemoMode, setScannerDemoMode] = useState(false);
  const [selectedUnitDetail, setSelectedUnitDetail] = useState<any | null>(null);
  const [showPrintOptionsModal, setShowPrintOptionsModal] = useState(false);
  const [printFilterTarget, setPrintFilterTarget] = useState<'both' | 'product_sku' | 'units_only'>('both');
  const [printFilterCategory, setPrintFilterCategory] = useState('all');
  const [printGroupMode, setPrintGroupMode] = useState<'category' | 'product'>('category');
  const [printJobSource, setPrintJobSource] = useState<{ type: 'all' | 'selected' | 'single'; selectedIds?: string[]; item?: InventoryItem } | null>(null);

  // Missions & Bundling State
  const [showCreateMissionModal, setShowCreateMissionModal] = useState(false);
  const [newMissionName, setNewMissionName] = useState('');
  const [newMissionDesc, setNewMissionDesc] = useState('');
  const [newMissionBundles, setNewMissionBundles] = useState<{ item_id: string; quantity: number }[]>([]);

  const [missionsList, setMissionsList] = useState<any[]>([]);

  const [missionsError, setMissionsError] = useState('');

  const loadMissions = async (silent = true) => {
    try {
      if (!silent) setRefreshing(true);
      setMissionsError('');
      const res = await fetch('/api/inventory?resource=missions', { headers: getHeaders() });
      const data = await res.json().catch(() => ({}));

      // DB migration not yet run — show banner but keep list empty (don't throw)
      if (data.migration_required) {
        setMissionsError(data.error || 'Database table missing — run 012_db_missions.sql migration');
        setMissionsList([]);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load welfare missions');
      }

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
      setMissionsError(e.message || 'Could not load missions');
    } finally {
      if (!silent) setRefreshing(false);
    }
  };

  // Scanner State
  const [scannerMode, setScannerMode] = useState<'checkout' | 'checkin'>('checkout');
  const [manualBarcode, setManualBarcode] = useState('');
  const [scanLookupResult, setScanLookupResult] = useState<any | null>(null);
  const [scanNotes, setScanNotes] = useState('');
  const [scannerMemberId, setScannerMemberId] = useState(profile?.id || '');
  const [scannerMission, setScannerMission] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

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
      }
    } catch (e) {
      console.warn("Failed to load profiles list:", e);
    }
  };

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
    // Stop camera when leaving scanner tab
    if (activeTab !== 'scanner' && cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
      setCameraActive(false);
    }
  }, [activeTab]);

  useEffect(() => {
    let active = true;
    let frameId: number;

    const detectFrame = async () => {
      if (!active || !cameraActive) return;
      try {
        if ('BarcodeDetector' in window) {
          const detector = new (window as any).BarcodeDetector({ formats: ['code_128', 'qr_code', 'ean_13'] });
          if (cameraVideoRef.current && cameraVideoRef.current.readyState >= 2) {
            const barcodes = await detector.detect(cameraVideoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              const detectedCode = barcodes[0].rawValue;
              if (cameraStreamRef.current) {
                cameraStreamRef.current.getTracks().forEach(t => t.stop());
                cameraStreamRef.current = null;
              }
              setCameraActive(false);
              setManualBarcode(detectedCode);
              handleSelectQuickScan(detectedCode);
              popToast('s', `Barcode detected: ${detectedCode}`);
              return;
            }
          }
        }
      } catch (e) {
        console.warn("Barcode detection error:", e);
      }
      if (cameraActive) {
        frameId = requestAnimationFrame(detectFrame);
      }
    };

    if (cameraActive) {
      frameId = requestAnimationFrame(detectFrame);
    }

    return () => {
      active = false;
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [cameraActive]);

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

  const handleEditCategory = (id: string, name: string) => {
    setEditingCategoryId(id);
    setEditingCategoryName(name);
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategoryName.trim() || !editingCategoryId) return;

    try {
      const res = await fetch('/api/inventory?resource=categories', {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ id: editingCategoryId, name: editingCategoryName.trim() })
      });
      if (res.ok) {
        popToast('s', 'Category updated successfully.');
        setEditingCategoryId(null);
        setEditingCategoryName('');
        loadCatalogue(false);
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update category');
      }
    } catch (err: any) {
      popToast('e', err.message);
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

  const handleCheckoutWizardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductDetail || !checkoutWizardUnit || !checkoutWizardMember) {
      popToast('e', 'Please select a unit and a borrower.');
      return;
    }

    try {
      setCheckoutWizardSubmitting(true);
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          resource: 'checkouts',
          item_id: selectedProductDetail.id,
          unit_id: checkoutWizardUnit.id,
          member_id: checkoutWizardMember,
          quantity: 1,
          notes: checkoutWizardNotes || 'Checkout from catalog drawer details',
          due_return_date: checkoutWizardDueReturn || null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');

      popToast('s', `Unit ${checkoutWizardUnit.barcode_value.split('-').slice(-1)[0]} checked out successfully!`);
      
      setCheckoutWizardActive(false);
      setCheckoutWizardUnit(null);
      setCheckoutWizardMember('');
      setCheckoutWizardNotes('');
      setCheckoutWizardDueReturn('');
      setSelectedProductDetail(null);

      loadCatalogue(false);
      loadCheckouts(false);
    } catch (err: any) {
      popToast('e', err.message || 'Error processing checkout');
    } finally {
      setCheckoutWizardSubmitting(false);
    }
  };

  const handleDrawerCheckIn = async (unit: any, returnCondition: 'good' | 'damaged' | 'lost' = 'good', notes: string = 'Check-in from catalog details') => {
    if (!unit.current_checkout_id) {
      popToast('e', 'No active checkout found for this unit.');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          resource: 'checkout-actions',
          action: 'checkin',
          id: unit.current_checkout_id,
          return_condition: returnCondition,
          condition_notes: notes
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');

      popToast('s', 'Physical unit checked in successfully!');
      setSelectedUnitDetail(null);
      setSelectedProductDetail(null);
      loadCatalogue(false);
      loadCheckouts(false);
    } catch (err: any) {
      popToast('e', err.message || 'Error returning unit');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUnitStatus = async (unitId: string, newStatus: 'available' | 'damaged' | 'lost' | 'archived') => {
    try {
      setLoading(true);
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          resource: 'checkout-actions',
          action: 'update-unit-condition',
          unit_id: unitId,
          status: newStatus
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update unit condition');

      popToast('s', `Unit status updated to ${newStatus} successfully!`);
      setSelectedUnitDetail(null);
      setSelectedProductDetail(null);
      loadCatalogue(false);
      loadCheckouts(false);
    } catch (err: any) {
      popToast('e', err.message || 'Error updating unit condition');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePrintJob = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!printJobSource) return;

    let targetItems: InventoryItem[] = [];
    if (printJobSource.type === 'single' && printJobSource.item) {
      targetItems = [printJobSource.item];
    } else if (printJobSource.type === 'selected' && printJobSource.selectedIds) {
      targetItems = items.filter(item => printJobSource.selectedIds?.includes(item.id));
    } else {
      targetItems = items;
    }

    if (printFilterCategory !== 'all') {
      targetItems = targetItems.filter(item => item.category_id === printFilterCategory);
    }

    let labels: { barcode: string; name: string; category?: string; productName: string }[] = [];

    targetItems.forEach(item => {
      if (printFilterTarget === 'both' || printFilterTarget === 'product_sku') {
        if (item.barcode_value) {
          labels.push({
            barcode: item.barcode_value,
            name: item.name,
            category: item.categories?.name || 'General',
            productName: item.name
          });
        }
      }

      if (printFilterTarget === 'both' || printFilterTarget === 'units_only') {
        if (item.units) {
          item.units.forEach((u: any) => {
            if (u.barcode_value) {
              labels.push({
                barcode: u.barcode_value,
                name: `${item.name} (Unit U${String(u.unit_number).padStart(2, '0')})`,
                category: item.categories?.name || 'General',
                productName: item.name
              });
            }
          });
        }
      }
    });

    if (labels.length === 0) {
      popToast('e', 'No barcodes matched your selected filters.');
      return;
    }

    setPrintJob({
      labels,
      groupMode: printGroupMode
    });

    setShowPrintOptionsModal(false);
  };

  // SheetJS Excel Report Export
  const handleExportExcel = () => {
    // 1. Catalog sheet
    const finalItems = items.filter(p => {
      const catMatch = reportsCategory === 'all' || p.category_id === reportsCategory;
      const searchMatch = !reportsSearch || 
        p.name.toLowerCase().includes(reportsSearch.toLowerCase()) || 
        (p.barcode_value && p.barcode_value.toLowerCase().includes(reportsSearch.toLowerCase()));
      return catMatch && searchMatch;
    });

    const catalogData = finalItems.map(p => {
      const branchStr = reportsBranch === 'all' ? 'All Branches' : reportsBranch === 'poyanad' ? 'Poyanad Central' : reportsBranch === 'brancha' ? 'Branch A' : reportsBranch === 'branchb' ? 'Branch B' : 'Branch C';
      return {
        'Item Name': p.name,
        'SKU Code': p.barcode_value || 'N/A',
        'Category': p.categories?.name || 'Uncategorized',
        'Type': p.item_type === 'lease' ? 'Lease' : 'Permanent',
        'Total Stock': p.total_stock,
        'Available': p.available_stock,
        'Checked Out': p.total_stock - p.available_stock,
        'Stock Status': p.available_stock === 0 ? 'Out of Stock' : p.available_stock <= 5 ? 'Low Stock' : 'Healthy',
        'Transactions (Period)': getProductTransactionsCount(p.id),
        'Branch Scope': branchStr
      };
    });

    // 2. Active Leases sheet
    const activeLeases = allCheckouts
      .filter(c => {
        if (reportsBranch !== 'all' && getBranchName(c) !== reportsBranch) return false;
        if (reportsCategory !== 'all' && c.items?.category_id !== reportsCategory) return false;
        if (!isDateInReportsRange(c.checkout_date)) return false;
        return true;
      })
      .map(c => ({
        'Distributor': c.member?.name || 'N/A',
        'Item Name': c.items?.name || 'N/A',
        'Unit SKU': c.unit?.barcode_value || 'N/A',
        'Qty': c.quantity,
        'Checkout Date': c.checkout_date,
        'Due Return Date': c.due_return_date || 'Permanent',
        'Status': c.status,
        'Notes': c.notes || ''
      }));

    const wb = XLSX.utils.book_new();
    const wsCatalog = XLSX.utils.json_to_sheet(catalogData);
    const wsLeases = XLSX.utils.json_to_sheet(activeLeases);

    XLSX.utils.book_append_sheet(wb, wsCatalog, 'Filtered Inventory Summary');
    XLSX.utils.book_append_sheet(wb, wsLeases, 'Filtered Leases Ledger');

    XLSX.writeFile(wb, `SKSSF_Inventory_Filtered_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    popToast('s', 'Filtered Excel inventory report exported successfully!');
  };

  // Helper for mock unit price
  const getMockUnitPrice = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('study') || n.includes('kit')) return 250;
    if (n.includes('quran')) return 400;
    if (n.includes('prayer') || n.includes('mat')) return 350;
    if (n.includes('first') || n.includes('medical') || n.includes('aid')) return 1200;
    if (n.includes('welfare') || n.includes('grocery') || n.includes('pack')) return 800;
    if (n.includes('wheelchair')) return 4500;
    if (n.includes('oxygen') || n.includes('cylinder')) return 7500;
    return 500; // default
  };

  const getMockSupplier = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('study') || n.includes('kit') || n.includes('bag')) return 'Al-Huda Educational Supplies';
    if (n.includes('quran') || n.includes('mat')) return 'Madina Book Stall';
    if (n.includes('first') || n.includes('medical') || n.includes('aid') || n.includes('oxygen') || n.includes('wheelchair')) return 'MedTech Systems';
    return 'SKSSF Relief Wing';
  };

  const getMockLocation = (item: InventoryItem) => {
    const cat = (item.categories?.name || 'Gen').toUpperCase().replace(/[^A-Z]/g, '');
    const rackLetter = cat.slice(0, 1) || 'A';
    const rackNo = (item.name.charCodeAt(0) % 5) + 1;
    const shelfNo = (item.name.charCodeAt(1) % 3) + 1;
    return {
      branch: 'Poyanad Central',
      rack: `Rack ${rackLetter}-${rackNo}`,
      shelf: `Shelf ${shelfNo}`
    };
  };

  const getMockCondition = (item: InventoryItem) => {
    if (item.available_stock === item.total_stock) return { text: 'Excellent', color: '#16a34a', bg: '#f0fdf4', emoji: '🟢' };
    if (item.available_stock > item.total_stock * 0.5) return { text: 'Good', color: '#16a34a', bg: '#f0fdf4', emoji: '🟢' };
    if (item.available_stock > 0) return { text: 'Repair Needed', color: '#ca8a04', bg: '#fef9c3', emoji: '🟡' };
    return { text: 'Damaged', color: '#dc2626', bg: '#fef2f2', emoji: '🔴' };
  };

  const getItemLastActivity = (itemId: string) => {
    const logs = allCheckouts.filter(c => c.item_id === itemId);
    if (logs.length === 0) return 'No activity';
    const sorted = [...logs].sort((a, b) => new Date(b.checkout_date).getTime() - new Date(a.checkout_date).getTime());
    const latest = sorted[0];
    const isReturn = latest.status === 'returned';
    const actionText = isReturn ? 'Checked In' : 'Checked Out';
    const dateStr = isReturn ? (latest.actual_return_date || latest.checkout_date) : latest.checkout_date;
    return `${actionText} ${new Date(dateStr).toLocaleDateString()}`;
  };

  // Filter Catalog
  const filteredCatalogue = items.filter(item => {
    const searchLower = search.toLowerCase();
    const matchesSearch = !search ||
      item.name.toLowerCase().includes(searchLower) ||
      (item.barcode_value && item.barcode_value.toLowerCase().includes(searchLower)) ||
      (item.description && item.description.toLowerCase().includes(searchLower)) ||
      (item.categories?.name && item.categories.name.toLowerCase().includes(searchLower)) ||
      getMockSupplier(item.name).toLowerCase().includes(searchLower);

    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesType = selectedType === 'all' || item.item_type === selectedType;

    // Dashboard filter (cards)
    let matchesDashboard = true;
    if (dashboardFilter === 'low') {
      matchesDashboard = item.total_stock > 0 && item.available_stock > 0 && item.available_stock <= 5;
    } else if (dashboardFilter === 'out') {
      matchesDashboard = item.total_stock > 0 && item.available_stock === 0;
    }

    // Advanced filters
    let matchesStockStatus = true;
    if (selectedStockStatus === 'healthy') {
      matchesStockStatus = item.available_stock > item.total_stock * 0.5;
    } else if (selectedStockStatus === 'moderate') {
      matchesStockStatus = item.available_stock > item.total_stock * 0.2 && item.available_stock <= item.total_stock * 0.5;
    } else if (selectedStockStatus === 'low') {
      matchesStockStatus = item.available_stock > 0 && item.available_stock <= 5;
    } else if (selectedStockStatus === 'out') {
      matchesStockStatus = item.available_stock === 0;
    }

    let matchesCondition = true;
    if (selectedCondition !== 'all') {
      const cond = getMockCondition(item).text.toLowerCase();
      matchesCondition = cond.includes(selectedCondition.toLowerCase()) || (selectedCondition === 'repair' && cond.includes('repair'));
    }

    let matchesLocation = true;
    if (selectedLocation !== 'all') {
      const loc = getMockLocation(item).rack.toLowerCase();
      matchesLocation = loc.includes(selectedLocation.toLowerCase());
    }

    let matchesSupplier = true;
    if (selectedSupplier !== 'all') {
      const sup = getMockSupplier(item.name).toLowerCase();
      matchesSupplier = sup.includes(selectedSupplier.toLowerCase());
    }

    return matchesSearch && matchesCategory && matchesType && matchesDashboard && matchesStockStatus && matchesCondition && matchesLocation && matchesSupplier;
  });

  const sortedCatalogue = [...filteredCatalogue].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (sortField === 'stock') {
      comparison = (a.total_stock || 0) - (b.total_stock || 0);
    } else if (sortField === 'health') {
      const hA = a.total_stock > 0 ? (a.available_stock / a.total_stock) : 0;
      const hB = b.total_stock > 0 ? (b.available_stock / b.total_stock) : 0;
      comparison = hA - hB;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
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

  const downloadBarcode = (barcodeValue: string) => {
    const svgEl = document.querySelector(`svg[data-barcode="${barcodeValue}"]`);
    if (!svgEl) {
      popToast('e', 'Barcode SVG element not found in DOM');
      return;
    }
    try {
      const svgString = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = svgEl.clientWidth || 150;
        canvas.height = svgEl.clientHeight || 60;
        const context = canvas.getContext('2d');
        context?.drawImage(image, 0, 0);
        const png = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = png;
        downloadLink.download = `${barcodeValue}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      };
      image.src = blobURL;
      popToast('s', `Barcode ${barcodeValue} downloaded successfully`);
    } catch (err) {
      popToast('e', 'Failed to generate PNG image from barcode SVG');
    }
  };

  const handleBulkExport = () => {
    const selectedItems = items.filter(i => selectedItemIds.includes(i.id));
    const data = selectedItems.map(p => ({
      'Item Name': p.name,
      'SKU Code': p.barcode_value || 'N/A',
      'Category': p.categories?.name || 'Uncategorized',
      'Type': p.item_type === 'lease' ? 'Lease' : 'Permanent',
      'Total Stock': p.total_stock,
      'Available': p.available_stock,
      'Checked Out': p.total_stock - p.available_stock,
      'Supplier': getMockSupplier(p.name),
      'Value': p.available_stock * getMockUnitPrice(p.name)
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Selected Inventory');
    XLSX.writeFile(wb, `SKSSF_Selected_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
    popToast('s', `Exported ${selectedItems.length} selected items to Excel!`);
  };

  const handleBulkPrint = () => {
    setPrintJob({ type: 'all' });
  };

  const handleBulkCheckout = () => {
    const firstId = selectedItemIds[0];
    const item = items.find(i => i.id === firstId);
    if (item) {
      setScannerMode('checkout');
      setManualBarcode(item.units?.[0]?.barcode_value || item.barcode_value || '');
      setActiveTab('scanner');
      handleSelectQuickScan(item.units?.[0]?.barcode_value || item.barcode_value || '');
    }
  };

  // 1. Helper to resolve checkout records by branch
  const getBranchName = (checkout: any) => {
    const memberName = checkout.member?.name || '';
    if (memberName.includes('Anas') || memberName.includes('Super')) return 'poyanad';
    if (memberName.toLowerCase().includes('ameer') || memberName.toLowerCase().includes('ashraf')) return 'brancha';
    if (memberName.toLowerCase().includes('rizwan')) return 'branchb';
    return 'branchc';
  };

  // 2. Helper to check if a date falls within selected reporting period
  const isDateInReportsRange = (dateStr: string | null) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const checkDate = new Date(dateStr);
    checkDate.setHours(0,0,0,0);

    switch (reportsDateRange) {
      case 'today':
        return checkDate.getTime() === today.getTime();
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return checkDate.getTime() === yesterday.getTime();
      }
      case 'last7': {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return checkDate.getTime() >= sevenDaysAgo.getTime() && checkDate.getTime() <= today.getTime();
      }
      case 'last30': {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return checkDate.getTime() >= thirtyDaysAgo.getTime() && checkDate.getTime() <= today.getTime();
      }
      case 'last3m': {
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        return checkDate.getTime() >= threeMonthsAgo.getTime() && checkDate.getTime() <= today.getTime();
      }
      case 'thisyear': {
        const startOfYear = new Date(today.getFullYear(), 0, 1);
        return checkDate.getTime() >= startOfYear.getTime() && checkDate.getTime() <= today.getTime();
      }
      case 'custom': {
        const start = reportsCustomStart ? new Date(reportsCustomStart) : null;
        const end = reportsCustomEnd ? new Date(reportsCustomEnd) : null;
        if (start) start.setHours(0,0,0,0);
        if (end) end.setHours(23,59,59,999);
        
        const time = date.getTime();
        if (start && end) {
          return time >= start.getTime() && time <= end.getTime();
        } else if (start) {
          return time >= start.getTime();
        } else if (end) {
          return time <= end.getTime();
        }
        return true;
      }
      default:
        return true;
    }
  };

  // 3. Transactions count in the period for a specific product
  const getProductTransactionsCount = (productId: string) => {
    return allCheckouts.filter(c => {
      if (c.item_id !== productId) return false;
      if (reportsBranch !== 'all' && getBranchName(c) !== reportsBranch) return false;
      const chkIn = isDateInReportsRange(c.checkout_date);
      const retIn = c.status === 'returned' && c.actual_return_date && isDateInReportsRange(c.actual_return_date);
      return chkIn || retIn;
    }).length;
  };

  // Filtered checkouts list based on branch/category
  const filteredCheckoutsForReport = allCheckouts.filter(c => {
    if (reportsBranch !== 'all' && getBranchName(c) !== reportsBranch) return false;
    if (reportsCategory !== 'all' && c.items?.category_id !== reportsCategory) return false;
    return true;
  });

  // Calculate report metrics
  const reportProducts = items.filter(p => {
    const catMatch = reportsCategory === 'all' || p.category_id === reportsCategory;
    const searchMatch = !reportsSearch || 
      p.name.toLowerCase().includes(reportsSearch.toLowerCase()) || 
      (p.barcode_value && p.barcode_value.toLowerCase().includes(reportsSearch.toLowerCase()));
    return catMatch && searchMatch;
  });

  const reportProductsCount = reportProducts.length;
  const reportTotalUnits = reportProducts.reduce((sum, p) => {
    const hasUnits = p.units && p.units.length > 0;
    return sum + (hasUnits ? p.units.length : (p.total_stock || 0));
  }, 0);
  const reportAvailableUnits = reportProducts.reduce((sum, p) => {
    const hasUnits = p.units && p.units.length > 0;
    return sum + (hasUnits ? p.units.filter((u: any) => u.status === 'available').length : (p.available_stock || 0));
  }, 0);
  const reportCheckedOutUnits = reportProducts.reduce((sum, p) => {
    const hasUnits = p.units && p.units.length > 0;
    return sum + (hasUnits ? p.units.filter((u: any) => u.status === 'checked_out' || u.status === 'out').length : Math.max(0, (p.total_stock || 0) - (p.available_stock || 0)));
  }, 0);

  // Checked In during selected period
  const reportCheckedInCount = filteredCheckoutsForReport.filter(c => 
    c.status === 'returned' && 
    c.actual_return_date && 
    isDateInReportsRange(c.actual_return_date) &&
    reportProducts.some(p => p.id === c.item_id)
  ).reduce((sum, c) => sum + (c.quantity || 1), 0);

  // Checkouts during selected period
  const reportCheckedOutInPeriod = filteredCheckoutsForReport.filter(c => 
    isDateInReportsRange(c.checkout_date) &&
    reportProducts.some(p => p.id === c.item_id)
  ).reduce((sum, c) => sum + (c.quantity || 1), 0);

  const reportTransactionsCount = filteredCheckoutsForReport.filter(c => {
    if (!reportProducts.some(p => p.id === c.item_id)) return false;
    const chkIn = isDateInReportsRange(c.checkout_date);
    const retIn = c.status === 'returned' && c.actual_return_date && isDateInReportsRange(c.actual_return_date);
    return chkIn || retIn;
  }).length;

  const reportLowStockCount = reportProducts.filter(p => {
    const hasUnits = p.units && p.units.length > 0;
    const total = hasUnits ? p.units.length : p.total_stock;
    const available = hasUnits ? p.units.filter((u: any) => u.status === 'available').length : p.available_stock;
    return total > 0 && available > 0 && available <= 5;
  }).length;
  const reportOutOfStockCount = reportProducts.filter(p => {
    const hasUnits = p.units && p.units.length > 0;
    const total = hasUnits ? p.units.length : p.total_stock;
    const available = hasUnits ? p.units.filter((u: any) => u.status === 'available').length : p.available_stock;
    return total > 0 && available === 0;
  }).length;

  // Filter summary list by reportsQuickFilter
  const summaryFilteredItems = reportProducts.filter(p => {
    const hasUnits = p.units && p.units.length > 0;
    const total = hasUnits ? p.units.length : p.total_stock;
    const available = hasUnits ? p.units.filter((u: any) => u.status === 'available').length : p.available_stock;
    const checkedOut = hasUnits ? p.units.filter((u: any) => u.status === 'checked_out' || u.status === 'out').length : (total - available);

    if (reportsQuickFilter === 'healthy') return available > 5;
    if (reportsQuickFilter === 'low') return available > 0 && available <= 5;
    if (reportsQuickFilter === 'out') return available === 0;
    if (reportsQuickFilter === 'checked_out') return checkedOut > 0;
    return true;
  });

  // Sort summary items
  const sortedSummaryItems = [...summaryFilteredItems].sort((a, b) => {
    let aVal: any = '';
    let bVal: any = '';

    switch (reportsSortField) {
      case 'name':
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case 'sku':
        aVal = (a.barcode_value || '').toLowerCase();
        bVal = (b.barcode_value || '').toLowerCase();
        break;
      case 'category':
        aVal = (a.categories?.name || '').toLowerCase();
        bVal = (b.categories?.name || '').toLowerCase();
        break;
      case 'total': {
        const hasA = a.units && a.units.length > 0;
        const hasB = b.units && b.units.length > 0;
        aVal = hasA ? a.units.length : (a.total_stock || 0);
        bVal = hasB ? b.units.length : (b.total_stock || 0);
        break;
      }
      case 'available': {
        const hasA = a.units && a.units.length > 0;
        const hasB = b.units && b.units.length > 0;
        aVal = hasA ? a.units.filter((u: any) => u.status === 'available').length : (a.available_stock || 0);
        bVal = hasB ? b.units.filter((u: any) => u.status === 'available').length : (b.available_stock || 0);
        break;
      }
      case 'out': {
        const hasA = a.units && a.units.length > 0;
        const hasB = b.units && b.units.length > 0;
        aVal = hasA ? a.units.filter((u: any) => u.status === 'checked_out' || u.status === 'out').length : Math.max(0, (a.total_stock || 0) - (a.available_stock || 0));
        bVal = hasB ? b.units.filter((u: any) => u.status === 'checked_out' || u.status === 'out').length : Math.max(0, (b.total_stock || 0) - (b.available_stock || 0));
        break;
      }
      case 'txns':
        aVal = getProductTransactionsCount(a.id);
        bVal = getProductTransactionsCount(b.id);
        break;
      default:
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
    }

    if (aVal < bVal) return reportsSortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return reportsSortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const displayedSummaryItems = showAllProductsInReports ? sortedSummaryItems : sortedSummaryItems.slice(0, 5);

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const branchText = reportsBranch === 'all' ? 'All Branches' : reportsBranch === 'poyanad' ? 'Poyanad Central' : reportsBranch === 'brancha' ? 'Branch A' : reportsBranch === 'branchb' ? 'Branch B' : 'Branch C';
    const dateText = reportsDateRange === 'last30' ? 'Last 30 Days' : reportsDateRange === 'today' ? 'Today' : reportsDateRange === 'yesterday' ? 'Yesterday' : reportsDateRange === 'last7' ? 'Last 7 Days' : reportsDateRange === 'last3m' ? 'Last 3 Months' : reportsDateRange === 'thisyear' ? 'This Year' : `Custom (${reportsCustomStart} to ${reportsCustomEnd})`;

    const content = `
      <html>
      <head>
        <title>Inventory Report - SKSSF Portal</title>
        <style>
          body { font-family: 'DM Sans', sans-serif; padding: 40px; color: #1e293b; }
          h1 { margin-bottom: 5px; }
          .subtitle { color: #64748b; font-size: 14px; margin-bottom: 30px; }
          .meta { margin-bottom: 30px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; background: #f8fafc; padding: 15px; border-radius: 12px; }
          .meta-item { font-size: 13px; }
          .meta-label { font-weight: 800; color: #475569; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border-bottom: 1px solid #e2e8f0; padding: 12px 10px; text-align: left; font-size: 13px; }
          th { background: #f1f5f9; font-weight: 800; color: #334155; }
          .status { font-weight: 800; }
          .status-healthy { color: #16a34a; }
          .status-low { color: #d97706; }
          .status-out { color: #dc2626; }
        </style>
      </head>
      <body>
        <h1>Inventory Stock Summary</h1>
        <div class="subtitle">Generated on ${new Date().toLocaleDateString()} • Period: ${dateText} • Branch: ${branchText}</div>
        
        <div class="meta">
          <div class="meta-item"><span class="meta-label">Total Products:</span> ${reportProductsCount}</div>
          <div class="meta-item"><span class="meta-label">Total Units:</span> ${reportTotalUnits}</div>
          <div class="meta-item"><span class="meta-label">Available Now:</span> ${reportAvailableUnits}</div>
          <div class="meta-item"><span class="meta-label">Checked Out:</span> ${reportCheckedOutUnits}</div>
          <div class="meta-item"><span class="meta-label">Checked In (Period):</span> ${reportCheckedInCount}</div>
          <div class="meta-item"><span class="meta-label">Total Transactions:</span> ${reportTransactionsCount}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Product Name</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Total Units</th>
              <th>Available</th>
              <th>Checked Out</th>
              <th>Status</th>
              <th>Txns</th>
            </tr>
          </thead>
          <tbody>
            ${sortedSummaryItems.map((p: any) => {
              const statusClass = p.available_stock === 0 ? 'status-out' : p.available_stock <= 5 ? 'status-low' : 'status-healthy';
              const statusText = p.available_stock === 0 ? 'Out of Stock' : p.available_stock <= 5 ? 'Low Stock' : 'Healthy';
              return `
                <tr>
                  <td><strong>${p.name}</strong></td>
                  <td><code>${p.barcode_value || '—'}</code></td>
                  <td>${p.categories?.name || 'Uncategorized'}</td>
                  <td>${p.total_stock}</td>
                  <td style="color:#16a34a;font-weight:700;">${p.available_stock}</td>
                  <td style="color:#2563eb;font-weight:700;">${p.total_stock - p.available_stock}</td>
                  <td class="status \${statusClass}">${statusText}</td>
                  <td>\${getProductTransactionsCount(p.id)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
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
      <div className="inv-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '32px', borderBottom: '2.5px solid #f1f5f9', paddingBottom: '2px', flexWrap: 'wrap' }}>
        {allowedTabs.includes('catalogue') && (
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
        )}
        {allowedTabs.includes('barcodes') && (
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
        )}
        {allowedTabs.includes('scanner') && (
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
        )}
        {allowedTabs.includes('checkouts') && (
          <button
            type="button"
            onClick={() => setActiveTab('checkouts')}
            style={{
              padding: '14px 20px', fontWeight: 800, fontSize: '14.5px', border: 'none', background: 'none',
              borderBottom: activeTab === 'checkouts' ? '3.5px solid var(--teal)' : '3.5px solid transparent',
              color: activeTab === 'checkouts' ? 'var(--teal)' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap'
            }}
          >
            📤 Currently Checked Out
          </button>
        )}
        {allowedTabs.includes('missions') && (
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
        )}
        {allowedTabs.includes('reports') && (
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
        )}
        {allowedTabs.includes('settings') && (
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
        )}
        {allowedTabs.includes('damage_review') && (
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
        )}
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
              {/* Dashboard Overview Cards */}
              <div className="catalogue-dashboard-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))',
                gap: '16px',
                marginBottom: '32px'
              }}>
                {/* Card 1: Total Products */}
                <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '18px', padding: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📦</div>
                    <span style={{ fontSize: '11px', fontWeight: 800, background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '20px' }}>Products</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '26px', fontWeight: 950, color: '#0f172a', lineHeight: 1.2 }}>{items.length}</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>Unique catalog entries</div>
                  </div>
                </div>

                {/* Card 2: Total Units */}
                <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '18px', padding: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📦</div>
                    <span style={{ fontSize: '11px', fontWeight: 800, background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '20px' }}>Total Units</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '26px', fontWeight: 950, color: '#0f172a', lineHeight: 1.2 }}>{items.reduce((s, p) => s + (p.total_stock || 0), 0)}</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>Quantity of all items</div>
                  </div>
                </div>

                {/* Card 3: Available Now */}
                <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '18px', padding: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>✅</div>
                    <span style={{ fontSize: '11px', fontWeight: 800, background: '#dcfce7', color: '#16a34a', padding: '3px 8px', borderRadius: '20px' }}>In Stock</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '26px', fontWeight: 950, color: '#16a34a', lineHeight: 1.2 }}>{items.reduce((s, p) => s + (p.available_stock || 0), 0)}</div>
                    <div style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 600 }}>Ready to issue</div>
                  </div>
                </div>

                {/* Card 4: Checked Out */}
                <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '18px', padding: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📤</div>
                    <span style={{ fontSize: '11px', fontWeight: 800, background: '#dbeafe', color: '#2563eb', padding: '3px 8px', borderRadius: '20px' }}>Issued</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '26px', fontWeight: 950, color: '#2563eb', lineHeight: 1.2 }}>{items.reduce((s, p) => s + Math.max(0, (p.total_stock || 0) - (p.available_stock || 0)), 0)}</div>
                    <div style={{ fontSize: '11.5px', color: '#1d4ed8', fontWeight: 600 }}>Currently checked out</div>
                  </div>
                </div>

                {/* Card 5: Checked In Today */}
                <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '18px', padding: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📥</div>
                    <span style={{ fontSize: '11px', fontWeight: 800, background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '20px' }}>Returned</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '26px', fontWeight: 950, color: '#15803d', lineHeight: 1.2 }}>
                      {allCheckouts.filter(c => c.status === 'returned' && c.actual_return_date && new Date(c.actual_return_date).toDateString() === new Date().toDateString()).reduce((s, c) => s + (c.quantity || 0), 0)}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#166534', fontWeight: 600 }}>Currently checked in</div>
                  </div>
                </div>
              </div>

              {/* Quick Action Toolbar */}
              <div className="catalogue-toolbar" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '14px',
                marginBottom: '20px',
                flexWrap: 'wrap',
                background: '#fff',
                padding: '16px 24px',
                borderRadius: '20px',
                border: '1.5px solid #f1f5f9',
                boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
              }}>
                {/* Left: Action buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button 
                    onClick={() => setShowAddModal(true)} 
                    className="bsm s" 
                    style={{ height: '38px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 800, background: 'var(--teal)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '0 16px' }}
                  >
                    <Plus size={14} /> Add Product
                  </button>
                  
                  {/* Bulk Import */}
                  <button 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.xlsx, .xls';
                      input.onchange = (e: any) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = async (evt: any) => {
                            try {
                              const bstr = evt.target.result;
                              const wb = XLSX.read(bstr, { type: 'binary' });
                              const wsname = wb.SheetNames[0];
                              const ws = wb.Sheets[wsname];
                              const data = XLSX.utils.sheet_to_json(ws);
                              popToast('s', `Successfully staged ${data.length} items for import!`);
                            } catch (err) {
                              popToast('e', 'Failed to parse Excel file');
                            }
                          };
                          reader.readAsBinaryString(file);
                        }
                      };
                      input.click();
                    }}
                    style={{ height: '38px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 800, background: '#f1f5f9', color: '#475569', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '0 16px' }}
                  >
                    📥 Bulk Import
                  </button>

                  {/* Export */}
                  <button 
                    onClick={handleExportExcel} 
                    style={{ height: '38px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 800, background: '#f1f5f9', color: '#475569', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '0 16px' }}
                  >
                    📤 Export
                  </button>

                  {/* Print Barcode */}
                  <button 
                    onClick={() => setViewMode('barcodes')} 
                    style={{ height: '38px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 800, background: '#f1f5f9', color: '#475569', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '0 16px' }}
                  >
                    🖨️ Print Barcode
                  </button>

                  {/* Bulk Checkout */}
                  <button 
                    onClick={() => {
                      if (selectedItemIds.length === 0) {
                        popToast('e', 'Select items from the table first');
                      } else {
                        handleBulkCheckout();
                      }
                    }} 
                    style={{ height: '38px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 800, background: '#fef3c7', color: '#d97706', border: '1.5px solid #fde68a', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '0 16px' }}
                  >
                    📦 Bulk Checkout
                  </button>

                  {/* Refresh */}
                  <button 
                    onClick={() => loadCatalogue(false)} 
                    style={{ height: '38px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 800, background: '#fff', color: '#475569', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '0 16px' }}
                  >
                    🔄 Refresh
                  </button>
                </div>

                {/* Right: View toggle and density switcher */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                    <button onClick={() => setViewMode('gallery')} style={{ padding: '6px 12px', fontSize: '11.5px', fontWeight: 800, border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', background: viewMode === 'gallery' ? '#fff' : 'transparent', color: viewMode === 'gallery' ? '#0f172a' : '#64748b' }}>
                      <Grid size={12} /> Gallery
                    </button>
                    <button onClick={() => setViewMode('table')} style={{ padding: '6px 12px', fontSize: '11.5px', fontWeight: 800, border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#0f172a' : '#64748b' }}>
                      <List size={12} /> Table
                    </button>
                  </div>

                  <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                    <button onClick={() => setDensity('comfortable')} style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 800, border: 'none', borderRadius: '8px', cursor: 'pointer', background: density === 'comfortable' ? '#fff' : 'transparent', color: density === 'comfortable' ? '#0f172a' : '#64748b' }}>
                      Comfortable
                    </button>
                    <button onClick={() => setDensity('compact')} style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 800, border: 'none', borderRadius: '8px', cursor: 'pointer', background: density === 'compact' ? '#fff' : 'transparent', color: density === 'compact' ? '#0f172a' : '#64748b' }}>
                      Compact
                    </button>
                  </div>
                </div>
              </div>

              {/* Advanced Filters Panel */}
              <div className="catalogue-filters-bar" style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '24px',
                flexWrap: 'wrap',
                alignItems: 'center'
              }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
                  <span style={{ position: 'absolute', left: '14px', top: '13px', color: '#94a3b8' }}>
                    <Search size={15} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search name, SKU, Supplier, Description..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ paddingLeft: '40px', width: '100%', height: '42px', borderRadius: '12px', fontSize: '13px', border: '1.5px solid #e2e8f0', outline: 'none' }}
                  />
                </div>

                {/* Categories */}
                <select 
                  value={selectedCategory} 
                  onChange={(e) => setSelectedCategory(e.target.value)} 
                  style={{ height: '42px', borderRadius: '12px', fontSize: '13px', border: '1.5px solid #e2e8f0', padding: '0 12px', background: '#fff', minWidth: '150px' }}
                >
                  <option value="all">All Categories</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                {/* Stock Status Dropdown */}
                <select 
                  value={selectedStockStatus} 
                  onChange={(e) => setSelectedStockStatus(e.target.value)} 
                  style={{ height: '42px', borderRadius: '12px', fontSize: '13px', border: '1.5px solid #e2e8f0', padding: '0 12px', background: '#fff', minWidth: '150px' }}
                >
                  <option value="all">Stock Health (All)</option>
                  <option value="healthy">🟢 Healthy</option>
                  <option value="moderate">🟡 Moderate</option>
                  <option value="low">🟠 Low Stock</option>
                  <option value="out">🔴 Out of Stock</option>
                </select>

                {/* Condition Filter */}
                <select 
                  value={selectedCondition} 
                  onChange={(e) => setSelectedCondition(e.target.value)} 
                  style={{ height: '42px', borderRadius: '12px', fontSize: '13px', border: '1.5px solid #e2e8f0', padding: '0 12px', background: '#fff', minWidth: '140px' }}
                >
                  <option value="all">Condition (All)</option>
                  <option value="excellent">🟢 Excellent</option>
                  <option value="good">🟢 Good</option>
                  <option value="repair">🟡 Repair Needed</option>
                  <option value="damaged">🔴 Damaged</option>
                </select>

                {/* Location Filter */}
                <select 
                  value={selectedLocation} 
                  onChange={(e) => setSelectedLocation(e.target.value)} 
                  style={{ height: '42px', borderRadius: '12px', fontSize: '13px', border: '1.5px solid #e2e8f0', padding: '0 12px', background: '#fff', minWidth: '130px' }}
                >
                  <option value="all">Location (All)</option>
                  <option value="E">Rack E</option>
                  <option value="R">Rack R</option>
                  <option value="H">Rack H</option>
                  <option value="A">Rack A</option>
                </select>

                {/* Supplier Filter */}
                <select 
                  value={selectedSupplier} 
                  onChange={(e) => setSelectedSupplier(e.target.value)} 
                  style={{ height: '42px', borderRadius: '12px', fontSize: '13px', border: '1.5px solid #e2e8f0', padding: '0 12px', background: '#fff', minWidth: '160px' }}
                >
                  <option value="all">Supplier (All)</option>
                  <option value="Al-Huda">Al-Huda Educational</option>
                  <option value="Madina">Madina Book Stall</option>
                  <option value="MedTech">MedTech Systems</option>
                  <option value="Relief">SKSSF Relief Wing</option>
                </select>

                {/* Sort Field */}
                <select 
                  value={`${sortField}-${sortOrder}`} 
                  onChange={(e) => {
                    const [field, order] = e.target.value.split('-');
                    setSortField(field as any);
                    setSortOrder(order as any);
                  }} 
                  style={{ height: '42px', borderRadius: '12px', fontSize: '13px', border: '1.5px solid #e2e8f0', padding: '0 12px', background: '#fff', minWidth: '150px' }}
                >
                  <option value="name-asc">Sort: A-Z</option>
                  <option value="name-desc">Sort: Z-A</option>
                  <option value="stock-asc">Sort: Stock (Low to High)</option>
                  <option value="stock-desc">Sort: Stock (High to Low)</option>
                  <option value="health-asc">Sort: Health (Critical First)</option>
                  <option value="health-desc">Sort: Health (Healthy First)</option>
                </select>

                {/* Clear filters action button */}
                {(selectedCategory !== 'all' || selectedStockStatus !== 'all' || selectedCondition !== 'all' || selectedLocation !== 'all' || selectedSupplier !== 'all' || search !== '' || dashboardFilter !== 'all') && (
                  <button 
                    onClick={() => {
                      setSelectedCategory('all');
                      setSelectedStockStatus('all');
                      setSelectedCondition('all');
                      setSelectedLocation('all');
                      setSelectedSupplier('all');
                      setSearch('');
                      setDashboardFilter('all');
                    }}
                    style={{ height: '42px', border: 'none', background: '#fef2f2', color: '#dc2626', borderRadius: '12px', padding: '0 16px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {sortedCatalogue.length === 0 ? (
                /* Empty States Redesign */
                <div className="card" style={{ padding: '80px 24px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
                  <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.4, color: 'var(--teal)' }} />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
                    {search || selectedCategory !== 'all' || selectedStockStatus !== 'all' || selectedCondition !== 'all' || selectedLocation !== 'all' || selectedSupplier !== 'all' || dashboardFilter !== 'all'
                      ? 'No products match your filters.'
                      : 'No inventory items found.'}
                  </h3>
                  <p style={{ margin: '6px 0 20px 0', fontSize: '14px', color: '#94a3b8' }}>
                    {search || selectedCategory !== 'all' || selectedStockStatus !== 'all' || selectedCondition !== 'all' || selectedLocation !== 'all' || selectedSupplier !== 'all' || dashboardFilter !== 'all'
                      ? 'Refine your query filters or clear parameters to view catalog lists.'
                      : 'Create custom warehouse catalog assets to begin issue logs.'}
                  </p>
                  
                  {search || selectedCategory !== 'all' || selectedStockStatus !== 'all' || selectedCondition !== 'all' || selectedLocation !== 'all' || selectedSupplier !== 'all' || dashboardFilter !== 'all' ? (
                    <button 
                      onClick={() => {
                        setSelectedCategory('all');
                        setSelectedStockStatus('all');
                        setSelectedCondition('all');
                        setSelectedLocation('all');
                        setSelectedSupplier('all');
                        setSearch('');
                        setDashboardFilter('all');
                      }}
                      className="bsm s"
                      style={{ padding: '10px 24px', height: '42px', borderRadius: '12px', fontSize: '13px', fontWeight: 800 }}
                    >
                      Clear Filters
                    </button>
                  ) : (
                    <button 
                      onClick={() => setShowAddModal(true)}
                      className="bsm s"
                      style={{ padding: '10px 24px', height: '42px', borderRadius: '12px', fontSize: '13px', fontWeight: 800 }}
                    >
                      Add Product
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* ① GALLERY VIEW */}
                  {viewMode === 'gallery' && (
                    <div className="cat-grid fu">
                      <style>{`
                        .cat-grid.fu {
                          display: grid;
                          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
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
                      `}</style>

                      {sortedCatalogue.map(item => {
                        const total = item.total_stock || 0;
                        const available = item.available_stock || 0;
                        const pctAvailable = total > 0 ? Math.round((available / total) * 100) : 0;
                        const stockColor = available > total * 0.5 ? '#16A34A' : available > 0 ? '#F0A500' : '#EF4444';
                        const stockLabel = available > total * 0.5 ? '✓ In Stock' : available > 0 ? '⚠ Low Stock' : '✕ Out of Stock';
                        const stockBdg = available > total * 0.5 ? 'bdg-g' : available > 0 ? 'bdg-a' : 'bdg-r';

                        return (
                          <div key={item.id} className="cat-card" onClick={() => setSelectedProductDetail(item)}>
                            <div className={`cc-img ${getCategoryBgClass(item.categories?.name || '')}`}>
                              {item.photo_url ? (
                                <img src={item.photo_url} alt={item.name} />
                              ) : (
                                <span style={{ fontSize: '64px' }}>
                                  {getProductEmoji(item.name, item.categories?.name || '')}
                                </span>
                              )}
                              <div className="cc-stock-bar">
                                <div className="cc-stock-fill" style={{ width: `${pctAvailable}%`, background: stockColor }} />
                              </div>
                              <div className="cc-hover-overlay">
                                <button className="cc-hover-btn" style={{ background: '#fff', color: 'var(--teal)' }} onClick={(e) => { e.stopPropagation(); setSelectedProductDetail(item); }}>📋 View Details</button>
                                {item.item_type === 'lease' && (
                                  <button className="cc-hover-btn" style={{ background: 'var(--teal)', color: '#fff' }} onClick={(e) => { e.stopPropagation(); handleSelectQuickScan(item.units?.[0]?.barcode_value || item.barcode_value || ''); }}>📤 Check Out</button>
                                )}
                              </div>
                            </div>
                            <div className="cc-body">
                              <div className="cc-cat">{item.categories?.name || 'Uncategorized'}</div>
                              <div className="cc-name">{item.name}</div>
                              <div className="cc-stats">
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Stock: {total}</span>
                                <span className={`bdg ${stockBdg}`}>{stockLabel}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '6px', marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                                <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); }} style={{ flex: 1, padding: '5px 0', fontSize: '11px', fontWeight: 800, border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer' }}>✏️ Edit</button>
                                <button onClick={(e) => { e.stopPropagation(); isSuper ? handleDeleteItem(item.id) : handleDeactivate(item.id); }} style={{ flex: 1, padding: '5px 0', fontSize: '11px', fontWeight: 800, border: `1px solid ${isSuper ? '#fecaca' : '#e2e8f0'}`, borderRadius: '8px', background: isSuper ? '#fef2f2' : '#fff', color: isSuper ? '#dc2626' : '#64748b', cursor: 'pointer' }}>{isSuper ? '🗑️ Del' : '👁️ Hide'}</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ② TABLE VIEW (Redesigned Enterprise Layout) */}
                  {viewMode === 'table' && (
                    <div className="card" style={{ padding: 0, borderRadius: '24px', overflow: 'visible', border: '1.5px solid #f1f5f9', background: '#fff' }}>
                      <div style={{ overflowX: 'auto', borderRadius: '24px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
                              <th style={{ padding: '16px 20px', width: '40px' }}>
                                <input type="checkbox" checked={selectedItemIds.length > 0 && selectedItemIds.length === sortedCatalogue.length} onChange={(e) => setSelectedItemIds(e.target.checked ? sortedCatalogue.map(i => i.id) : [])} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                              </th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569', minWidth: '220px', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 11 }}>Product Info</th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569' }}>Inventory</th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569' }}>Stock Health</th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569' }}>Location</th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569' }}>Condition</th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569', minWidth: '150px' }}>Barcode SKU</th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569' }}>Last Activity</th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569' }}>Status</th>
                              <th style={{ padding: '16px 20px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedCatalogue.map(item => {
                              const total = item.total_stock || 0;
                              const available = item.available_stock || 0;
                              const checkedOut = Math.max(0, total - available);
                              const pctAvailable = total > 0 ? Math.round((available / total) * 100) : 0;
                              let healthLabel = 'Out of Stock', healthColor = '#ef4444', healthBg = '#fef2f2', healthBorder = '#fecaca';
                              if (available > total * 0.5) { healthLabel = 'Healthy'; healthColor = '#16a34a'; healthBg = '#f0fdf4'; healthBorder = '#bbf7d0'; }
                              else if (available > total * 0.2) { healthLabel = 'Moderate'; healthColor = '#ca8a04'; healthBg = '#fef9c3'; healthBorder = '#fef08a'; }
                              else if (available > 0) { healthLabel = 'Low Stock'; healthColor = '#ea580c'; healthBg = '#fff7ed'; healthBorder = '#fed7aa'; }
                              const location = getMockLocation(item);
                              const condition = getMockCondition(item);
                              const lastActivity = getItemLastActivity(item.id);
                              let statusLabel = 'Active', statusColor = '#16a34a', statusBg = '#f0fdf4';
                              if (!item.is_active) { statusLabel = 'Archived'; statusColor = '#64748b'; statusBg = '#f1f5f9'; }
                              else if (available === 0) { statusLabel = 'Reserved'; statusColor = '#ca8a04'; statusBg = '#fef9c3'; }
                              else if (checkedOut > 0) { statusLabel = 'Issued'; statusColor = '#2563eb'; statusBg = '#eff6ff'; }
                              const isSelected = selectedItemIds.includes(item.id);
                              const isExpanded = expandedRowId === item.id;
                              const rowPadding = density === 'compact' ? '8px 20px' : '16px 20px';
                              return (
                                <React.Fragment key={item.id}>
                                  <tr onClick={() => setExpandedRowId(isExpanded ? null : item.id)} style={{ borderBottom: '1px solid #f1f5f9', background: isSelected ? 'rgba(13, 115, 119, 0.04)' : '#fff', cursor: 'pointer' }}>
                                    <td style={{ padding: rowPadding }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={(e) => setSelectedItemIds(e.target.checked ? [...selectedItemIds, item.id] : selectedItemIds.filter(id => id !== item.id))} style={{ cursor: 'pointer', width: '15px', height: '15px' }} /></td>
                                    <td style={{ padding: rowPadding, position: 'sticky', left: 0, background: isSelected ? '#f5fbfb' : '#fff', zIndex: 1 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '44px', height: '44px', background: getCategoryBgClass(item.categories?.name || ''), borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>{item.photo_url ? <img src={item.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getProductEmoji(item.name, item.categories?.name || '')}</div>
                                        <div><div style={{ fontWeight: 800, color: '#1e293b', fontSize: '13.5px' }}>{item.name}</div><div style={{ fontSize: '11px', color: '#64748b' }}>{item.description || 'No description listed.'}</div></div>
                                      </div>
                                    </td>
                                    <td style={{ padding: rowPadding }}><div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}><span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{total} Total</span><span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a' }}>{available} Avail</span><span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb' }}>{checkedOut} Out</span></div></td>
                                    <td style={{ padding: rowPadding }}><div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><div style={{ width: '110px', height: '6px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}><div style={{ width: `${pctAvailable}%`, height: '100%', background: healthColor }} /></div><span style={{ fontSize: '10px', fontWeight: 800, color: healthColor, background: healthBg, padding: '2px 8px', borderRadius: '20px' }}>{healthLabel}</span></div></td>
                                    <td style={{ padding: rowPadding }}><div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{location.rack}</span><span style={{ fontSize: '10.5px', color: '#64748b' }}>{location.shelf}</span></div></td>
                                    <td style={{ padding: rowPadding }}><span style={{ fontSize: '11px', fontWeight: 800, color: condition.color, background: condition.bg, padding: '4px 10px', borderRadius: '50px' }}>{condition.emoji} {condition.text}</span></td>
                                    <td style={{ padding: rowPadding }} onClick={(e) => e.stopPropagation()}>{item.barcode_value ? <BarcodeSVG value={item.barcode_value} /> : '—'}</td>
                                    <td style={{ padding: rowPadding }}><span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{lastActivity}</span></td>
                                    <td style={{ padding: rowPadding }}><span style={{ fontSize: '11px', fontWeight: 800, color: statusColor, background: statusBg, padding: '4px 10px', borderRadius: '50px' }}>{statusLabel}</span></td>
                                    <td style={{ padding: rowPadding, textAlign: 'right' }} onClick={(e) => e.stopPropagation()}><button onClick={() => setEditingItem(item)} style={{ border: '1.5px solid #e2e8f0', background: '#fff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer' }}>⋮</button></td>
                                  </tr>
                                  {isExpanded && <tr style={{ background: '#fcfbf9' }}><td colSpan={10} style={{ padding: '20px 24px' }}>Detailed row content...</td></tr>}
                                </React.Fragment>
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
                        <button onClick={() => setPrintJob({ type: 'selected', selectedIds: sortedCatalogue.map(i => i.id) })} className="bsm dark" style={{ height: '38px', borderRadius: '10px' }}>
                          <Printer size={13} /> Print Barcode Sheet
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                        {sortedCatalogue.map(item => (
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

                  {/* Bulk Actions Floating Toolbar */}
                  {selectedItemIds.length > 0 && (
                    <div className="bulk-toolbar" style={{
                      position: 'fixed',
                      bottom: '24px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'var(--teal)',
                      color: '#fff',
                      padding: '12px 24px',
                      borderRadius: '50px',
                      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      zIndex: 1000
                    }}>
                      <span style={{ fontWeight: 800, fontSize: '13.5px' }}>{selectedItemIds.length} items selected</span>
                      <div style={{ height: '20px', width: '1px', background: 'rgba(255,255,255,0.3)' }} />
                      <button onClick={handleBulkCheckout} style={{ background: 'transparent', border: 'none', color: '#fff', fontWeight: 800, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>📤 Checkout</button>
                      <button onClick={() => setPrintJob({ type: 'selected', selectedIds: selectedItemIds })} style={{ background: 'transparent', border: 'none', color: '#fff', fontWeight: 800, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>🖨️ Print Barcode</button>
                      <button onClick={handleExportExcel} style={{ background: 'transparent', border: 'none', color: '#fff', fontWeight: 800, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>📥 Export Selected</button>
                      <button onClick={() => { setSelectedItemIds([]); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '20px', fontWeight: 800, fontSize: '10.5px', cursor: 'pointer' }}>Clear</button>
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
                  onClick={() => { setPrintJobSource({ type: 'all' }); setShowPrintOptionsModal(true); }} 
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
                          onClick={() => { setPrintJobSource({ type: 'single', item }); setShowPrintOptionsModal(true); }}
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
                  {cameraActive ? (
                    <video
                      ref={cameraVideoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                    />
                  ) : (
                    <>
                      <div style={{ width: '60%', height: '50%', border: '2px dashed rgba(27, 184, 154, 0.4)', borderRadius: '12px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ position: 'absolute', left: 0, width: '100%', height: '3px', background: '#1BB89A', boxShadow: '0 0 10px #1BB89A', animation: 'scanLineAnim 2s linear infinite' }} />
                      </div>
                      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '16px', fontWeight: 700 }}>Camera off — click button below to activate</span>
                    </>
                  )}

                  <style>{`
                    @keyframes scanLineAnim {
                      0% { top: 10% }
                      50% { top: 90% }
                      100% { top: 10% }
                    }
                  `}</style>

                  {/* Camera overlay label when active */}
                  {cameraActive && (
                    <div style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: '#1BB89A', fontSize: '11px', fontWeight: 800, padding: '4px 12px', borderRadius: '50px', letterSpacing: '0.5px' }}>
                      📷 LIVE
                    </div>
                  )}
                </div>

                {/* Camera activate / stop button */}
                <button
                  type="button"
                  onClick={() => {
                    if (cameraActive) {
                      // Stop camera
                      if (cameraStreamRef.current) {
                        cameraStreamRef.current.getTracks().forEach(t => t.stop());
                        cameraStreamRef.current = null;
                      }
                      setCameraActive(false);
                    } else {
                      // Start camera
                      navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
                        .then(stream => {
                          cameraStreamRef.current = stream;
                          setCameraActive(true);
                          // Attach stream to video element after React renders it
                          setTimeout(() => {
                            if (cameraVideoRef.current) {
                              cameraVideoRef.current.srcObject = stream;
                            }
                          }, 100);
                        })
                        .catch(() => {
                          setScanError('Camera access denied or unavailable. Use manual barcode entry below.');
                        });
                    }
                  }}
                  style={{
                    marginTop: '14px',
                    width: '100%',
                    height: '42px',
                    borderRadius: '12px',
                    border: `1.5px solid ${cameraActive ? '#ef4444' : 'rgba(255,255,255,0.25)'}`,
                    background: cameraActive ? 'rgba(239,68,68,0.15)' : 'rgba(27,184,154,0.15)',
                    color: cameraActive ? '#ef4444' : '#1BB89A',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {cameraActive ? '⏹ Stop Camera' : '📷 Activate Camera'}
                </button>

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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Scanner Mode Options
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#1BB89A', fontWeight: 800, cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={scannerDemoMode} 
                        onChange={e => setScannerDemoMode(e.target.checked)} 
                        style={{ accentColor: '#1BB89A' }} 
                      />
                      Enable Demo Simulation
                    </label>
                  </div>
                  
                  {scannerDemoMode ? (
                    <>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginBottom: '10px' }}>Select any unit barcode to auto-populate the lookup</div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxHeight: '120px', overflowY: 'auto' }}>
                        {items.flatMap(item => (item.units || []).slice(0, 3).map((unit: any) => ({
                          barcode: unit.barcode_value,
                          label: `${item.name.substring(0, 10)} ${unit.barcode_value.split('-').slice(-1)[0] || ''}`,
                          status: unit.status
                        }))).slice(0, 18).map((sim, idx) => (
                          <button 
                            key={idx} 
                            onClick={() => { setManualBarcode(sim.barcode); handleSelectQuickScan(sim.barcode); }}
                            style={{ 
                              background: sim.status === 'available' ? 'rgba(27,184,154,0.12)' : 'rgba(255,255,255,0.06)', 
                              border: `1px solid ${sim.status === 'available' ? 'rgba(27,184,154,0.3)' : 'rgba(255,255,255,0.1)'}`, 
                              color: sim.status === 'available' ? '#1BB89A' : 'rgba(255,255,255,0.7)', 
                              padding: '6px 12px', 
                              borderRadius: '8px', 
                              fontSize: '11px', 
                              fontFamily: 'monospace', 
                              cursor: 'pointer', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '4px',
                              transition: 'all 0.2s'
                            }}
                          >
                            ⚡ {sim.label}
                          </button>
                        ))}
                        {items.flatMap(item => (item.units || [])).length === 0 && (
                          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>No units loaded yet. Add items first.</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10.5px', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
                      Demo simulated buttons hidden. Enable demo mode option above to simulate physical barcodes without camera.
                    </div>
                  )}
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
                    
                    const totalStock = item.units ? item.units.length : (item.total_stock || 0);
                    const availableStock = item.units 
                      ? item.units.filter((u: any) => u.status === 'available').length 
                      : (item.available_stock || 0);
                    const outStock = totalStock - availableStock;
                    const emoji = getProductEmoji(item.name, item.categories?.name || '');

                    return (
                      <div style={{ background: '#F8FAF6', border: '1.5px solid #E2DED6', borderRadius: '24px', padding: '24px', position: 'relative' }}>
                        
                        {/* Header info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '32px' }}>{emoji}</span>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#1A1F2E', fontFamily: 'Playfair Display, serif' }}>
                                {item.name}
                              </h4>
                              <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748b', marginTop: '2px' }}>
                                SKU: {item.barcode_value}
                                {isUnit && (
                                  <span style={{ color: 'var(--teal)', fontWeight: 800, marginLeft: '6px' }}>
                                    • Unit No: #{String(unit.unit_number).padStart(2, '0')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* If specific unit scanned, show unit details */}
                        {isUnit ? (
                          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Physical Unit status</span>
                              <span style={{ 
                                padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase',
                                background: unit.status === 'available' ? '#F0FDF4' : unit.status === 'checked_out' ? '#EFF6FF' : '#FFF7ED',
                                color: unit.status === 'available' ? '#16A34A' : unit.status === 'checked_out' ? '#2563EB' : '#EA580C'
                              }}>
                                {unit.status}
                              </span>
                            </div>

                            <div style={{ marginTop: '12px', fontSize: '12.5px', color: '#334155' }}>
                              <div>Barcode: <code style={{ fontFamily: 'monospace', fontWeight: 700 }}>{unit.barcode_value}</code></div>
                              <div style={{ marginTop: '4px' }}>Condition: <strong>{unit.status === 'damaged' ? '🔴 Damaged' : unit.status === 'lost' ? '❌ Lost' : '🟢 Good'}</strong></div>
                            </div>

                            {/* Current active lease borrower details */}
                            {unit.status === 'checked_out' && unit.current_checkout && (
                              <div style={{ marginTop: '14px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                                <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Borrower / Distributor</div>
                                <div style={{ fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                                  {unit.current_checkout.member?.name || 'Unknown User'}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px', fontSize: '11.5px', color: '#475569' }}>
                                  <div>Checkout Date: <strong>{unit.current_checkout.checkout_date}</strong></div>
                                  <div>Expected Return: <strong>{unit.current_checkout.due_return_date || 'Permanent'}</strong></div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* If general product SKU scanned */
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
                            <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                              <div style={{ fontSize: '18px', fontWeight: 900, color: '#1e293b' }}>{totalStock}</div>
                              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontWeight: 700 }}>Total Units</div>
                            </div>
                            <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                              <div style={{ fontSize: '18px', fontWeight: 900, color: '#16a34a' }}>{availableStock}</div>
                              <div style={{ fontSize: '10px', color: '#15803d', marginTop: '2px', fontWeight: 700 }}>Available</div>
                            </div>
                            <div style={{ background: '#eff6ff', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                              <div style={{ fontSize: '18px', fontWeight: 900, color: '#2563eb' }}>{outStock}</div>
                              <div style={{ fontSize: '10px', color: '#1d4ed8', marginTop: '2px', fontWeight: 700 }}>Out</div>
                            </div>
                          </div>
                        )}

                        {/* Processing form fields: Checkout details for available items */}
                        {((isUnit && unit.status === 'available') || (!isUnit && availableStock > 0)) && scannerMode === 'checkout' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                            <div>
                              <label className="fl2" style={{ color: '#2b2d42', fontWeight: 700 }}>Welfare Mission Package *</label>
                              <select 
                                value={scannerMission} 
                                onChange={e => setScannerMission(e.target.value)} 
                                className="sel2" 
                                style={{ width: '100%', height: '42px', borderRadius: '10px', border: '1px solid #c3fae8', background: '#fff' }}
                              >
                                {missionsList.length === 0 ? (
                                  <option value="">No missions available — run DB migration first</option>
                                ) : (
                                  missionsList.map(m => (
                                    <option key={m.id} value={m.id}>{m.emoji ? `${m.emoji} ` : ''}{m.name}</option>
                                  ))
                                )}
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
                        )}

                        {/* Action details for checked out / damaged units */}
                        {isUnit && unit.status === 'checked_out' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ background: 'rgba(12, 166, 120, 0.08)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(12, 166, 120, 0.2)', fontSize: '13px', color: '#0ca678' }}>
                              <strong>Check In Return Match</strong>: Return unit barcode <code>{unit.barcode_value}</code> to available stock.
                            </div>
                            <div>
                              <label className="fl2" style={{ color: '#2b2d42', fontWeight: 700 }}>Return condition condition notes</label>
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

                        {isUnit && (unit.status === 'damaged' || unit.status === 'lost') && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ background: '#fff7ed', padding: '12px 16px', borderRadius: '12px', border: '1px solid #ffedd5', fontSize: '13px', color: '#ea580c' }}>
                              <strong>Flagged Condition</strong>: This physical unit is currently marked as <strong>{unit.status}</strong>. Update status below to resolve.
                            </div>
                          </div>
                        )}

                        {/* Actions buttons */}
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button 
                            onClick={() => setScanLookupResult(null)} 
                            style={{ 
                              flex: 1, 
                              height: '44px', 
                              border: '1.5px solid #e2e8f0', 
                              background: '#fff', 
                              color: '#475569', 
                              borderRadius: '50px', 
                              fontSize: '12.5px', 
                              fontWeight: 800,
                              cursor: 'pointer' 
                            }}
                          >
                            Cancel
                          </button>
                          
                          {/* Unit Checkout / Check-in trigger */}
                          {(!isUnit || unit.status === 'available' || unit.status === 'checked_out') && (
                            <button 
                              onClick={handleConfirmScannerAction} 
                              disabled={scanSubmitting}
                              className="bsm s" 
                              style={{ 
                                flex: 2, 
                                height: '44px', 
                                borderRadius: '50px', 
                                fontSize: '12.5px', 
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
                              ) : (isUnit && unit.status === 'checked_out') ? (
                                <>📥 Confirm Return Check In</>
                              ) : (
                                <>📤 Confirm Lease Check Out</>
                              )}
                            </button>
                          )}

                          {/* Unit repair / writeoff trigger */}
                          {isUnit && (unit.status === 'damaged' || unit.status === 'lost') && (
                            <>
                              <button
                                onClick={() => handleUpdateUnitStatus(unit.id, 'available')}
                                style={{ flex: 1.5, height: '44px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '50px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                              >
                                🔧 Repair
                              </button>
                              <button
                                onClick={() => handleUpdateUnitStatus(unit.id, 'archived')}
                                style={{ flex: 1.5, height: '44px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '50px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                              >
                                ❌ Write Off
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedProductDetail(item)}
                            style={{
                              height: '44px',
                              padding: '0 16px',
                              border: '1.5px solid #e2e8f0',
                              background: '#fff',
                              color: '#475569',
                              borderRadius: '50px',
                              fontSize: '12.5px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            Details
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
          {activeTab === 'checkouts' && (
            <div className="card" style={{ padding: '28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              
              {/* Search & Filters */}
              <div className="inv-checkout-search-row" style={{ display: 'flex', gap: '14px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
                  <span style={{ position: 'absolute', left: '16px', top: '15px', color: '#94a3b8' }}>
                    <Search size={16} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search checkouts by distributor name, item, or barcode SKU..."
                    value={checkoutSearch}
                    onChange={(e) => setCheckoutSearch(e.target.value)}
                    className="fi2"
                    style={{ paddingLeft: '46px', width: '100%', height: '44px', borderRadius: '12px', fontSize: '13px' }}
                  />
                </div>
                
                <select
                  value={checkoutStatusFilter}
                  onChange={(e) => setCheckoutStatusFilter(e.target.value as any)}
                  className="sel2"
                  style={{ width: '180px', height: '44px', borderRadius: '12px', fontSize: '13px' }}
                >
                  <option value="all">All Records</option>
                  <option value="active">Active Checkouts</option>
                  <option value="overdue">Overdue Loans</option>
                  <option value="returned">Returned items</option>
                </select>
              </div>

              {filteredCheckouts.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13.5px', fontWeight: 600 }}>
                  No checkout matches found in ledger.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1.5px solid #f1f5f9', background: '#f8fafc' }}>
                        <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>Unit / Product</th>
                        <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>Distributor</th>
                        <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>Mission</th>
                        <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>Checkout Date</th>
                        <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>Days Out</th>
                        <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>Check-In Date & Time</th>
                        <th style={{ padding: '14px', fontWeight: 800, color: '#475569' }}>Checked In By</th>
                        <th style={{ padding: '14px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCheckouts.map(c => {
                        const daysOutVal = getDaysOutValue(c);
                        const isOverdue = daysOutVal !== '—' && daysOutVal !== '0d';
                        const daysColor = isOverdue ? '#dc2626' : '#2b8a3e';
                        const daysBg = isOverdue ? '#fff5f5' : '#e6fcf5';
                        const emoji = getProductEmoji(c.items?.name || '', c.items?.categories?.name || '');
                        
                        const getMissionName = (missionId: string | null, notes: string | null) => {
                          if (missionId) {
                            const found = missionsList.find(m => m.id === missionId);
                            if (found) return found.name;
                          }
                          if (!notes) return 'General Distribution';
                          if (notes.startsWith('Scanned checkout for ')) {
                            return notes.replace('Scanned checkout for ', '');
                          }
                          return 'General Distribution';
                        };

                        return (
                          <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            {/* Column 1: Unit / Product */}
                            <td style={{ padding: '16px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '18px' }}>{emoji}</span>
                                <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.items?.name || 'Loading Item...'}</div>
                              </div>
                              {c.unit?.barcode_value && (
                                <div style={{ 
                                  display: 'inline-block',
                                  background: '#1A1F2E', 
                                  color: '#fff', 
                                  padding: '3px 8px', 
                                  borderRadius: '6px', 
                                  fontFamily: 'monospace', 
                                  fontSize: '11px', 
                                  fontWeight: 800, 
                                  marginTop: '4px' 
                                }}>
                                  {c.unit.barcode_value}
                                </div>
                              )}
                            </td>
                            
                            {/* Column 2: Distributor */}
                            <td style={{ padding: '16px 14px' }}>
                              <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.member?.name || 'Distributor'}</div>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{c.member?.membership_no || 'No Membership No'}</div>
                            </td>

                            {/* Column 3: Mission */}
                            <td style={{ padding: '16px 14px', fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                              {getMissionName(c.mission_id, c.notes)}
                            </td>

                            {/* Column 4: Checkout Date */}
                            <td style={{ padding: '16px 14px', fontSize: '13px', color: '#64748b' }}>
                              {c.checkout_date ? new Date(c.checkout_date).toLocaleString() : 'N/A'}
                            </td>

                            {/* Column 5: Days Out */}
                            <td style={{ padding: '16px 14px' }}>
                              {c.status === 'active' ? (
                                <span style={{ 
                                  padding: '4px 10px', 
                                  borderRadius: '50px', 
                                  background: daysBg, 
                                  color: daysColor, 
                                  fontSize: '11.5px', 
                                  fontWeight: 900 
                                }}>
                                  {daysOutVal}
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>Returned</span>
                              )}
                            </td>

                            {/* Column 5.B: Check-In Date & Time */}
                            <td style={{ padding: '16px 14px', fontSize: '13px', color: '#64748b' }}>
                              {c.status === 'returned' && c.actual_return_date ? (
                                new Date(c.actual_return_date).toLocaleString()
                              ) : (
                                '—'
                              )}
                            </td>

                            {/* Column 6: Checked In By (name + role badge) */}
                            <td style={{ padding: '16px 14px', fontSize: '13px' }}>
                              {(() => {
                                if (!c.manually_returned_by) return <span style={{ color: '#94a3b8' }}>—</span>;
                                const found = members.find((m: any) => m.id === c.manually_returned_by);
                                if (!found) return <span style={{ color: '#64748b' }}>{c.manually_returned_by}</span>;
                                const roleColors: Record<string, { bg: string; color: string; label: string }> = {
                                  super:  { bg: '#fef3c7', color: '#92400e', label: 'Super Admin' },
                                  admin:  { bg: '#dbeafe', color: '#1e40af', label: 'Admin' },
                                  member: { bg: '#dcfce7', color: '#166534', label: 'Member' },
                                };
                                const badge = roleColors[found.role] ?? { bg: '#f1f5f9', color: '#475569', label: found.role };
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{found.name}</span>
                                    <span style={{
                                      display: 'inline-block', width: 'fit-content',
                                      padding: '2px 8px', borderRadius: '50px', fontSize: '11px',
                                      fontWeight: 700, background: badge.bg, color: badge.color,
                                      textTransform: 'capitalize', letterSpacing: '0.3px'
                                    }}>{badge.label}</span>
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Column 7: Actions */}
                            <td style={{ padding: '16px 14px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                {c.status === 'active' && (
                                  <button
                                    onClick={() => handleQuickReturn(c.id, 'good')}
                                    className="bsm s"
                                    style={{ padding: '6px 14px', borderRadius: '50px', fontSize: '11.5px', background: 'var(--teal)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer' }}
                                  >
                                    📥 Check In
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setOverrideCondition((c.return_condition as any) || 'good');
                                    setOverrideDate(c.actual_return_date ? c.actual_return_date.split('T')[0] : new Date().toISOString().split('T')[0]);
                                    setOverrideNotes(c.condition_notes || '');
                                    setOverrideCheckout(c);
                                  }}
                                  style={{ 
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    padding: '6px 12px', fontSize: '11.5px', fontWeight: 800, borderRadius: '50px', 
                                    border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer'
                                  }}
                                  title="Edit override / mark returned"
                                >
                                  <Edit2 size={11} /> Override
                                </button>
                              </div>
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

              {/* DB Error Banner */}
              {missionsError && (
                <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '20px', padding: '22px 26px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '24px', flexShrink: 0 }}>⚠️</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: '#991B1B', fontSize: '15px', marginBottom: '4px' }}>Database Migration Required</div>
                      <div style={{ fontSize: '13px', color: '#7F1D1D' }}>
                        The <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace' }}>welfare_missions</code> table does not exist in your Supabase database yet. Run the SQL below in your Supabase SQL Editor to fix this.
                      </div>
                    </div>
                  </div>
                  <pre style={{ background: '#1E293B', color: '#E2E8F0', padding: '16px 18px', borderRadius: '12px', fontSize: '12px', overflowX: 'auto', margin: '0 0 14px 0', lineHeight: 1.6, fontFamily: 'monospace' }}>{`-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS welfare_missions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  emoji        TEXT DEFAULT '🤝',
  description  TEXT NULL,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);
ALTER TABLE inventory_checkouts
  ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES welfare_missions(id) ON DELETE SET NULL;
ALTER TABLE welfare_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "welfare_missions_select" ON welfare_missions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "welfare_missions_all_admin" ON welfare_missions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super')));
INSERT INTO welfare_missions (name,emoji,description,status) VALUES
  ('Ramadan Welfare 2025','🌙','Welfare food packs distributed for the holy month.','active'),
  ('Student Support Drive 2025','📚','Stationery kits allocated for students.','active'),
  ('Medical Relief Camp','🚑','Healthcare supplies to medical teams.','active'),
  ('General Distribution','🤝','Standard distributions for local families.','active')
ON CONFLICT (name) DO NOTHING;`}</pre>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(`CREATE TABLE IF NOT EXISTS welfare_missions (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  name TEXT NOT NULL UNIQUE,\n  emoji TEXT DEFAULT '🤝',\n  description TEXT NULL,\n  status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),\n  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  completed_at TIMESTAMPTZ NULL\n);\nALTER TABLE inventory_checkouts ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES welfare_missions(id) ON DELETE SET NULL;\nALTER TABLE welfare_missions ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "welfare_missions_select" ON welfare_missions FOR SELECT TO authenticated USING (TRUE);\nCREATE POLICY "welfare_missions_all_admin" ON welfare_missions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super')));\nINSERT INTO welfare_missions (name,emoji,description,status) VALUES ('Ramadan Welfare 2025','🌙','Welfare food packs.','active'),('Student Support Drive 2025','📚','Stationery kits.','active'),('Medical Relief Camp','🚑','Healthcare supplies.','active'),('General Distribution','🤝','Standard distributions.','active') ON CONFLICT (name) DO NOTHING;`)}
                      style={{ height: '36px', padding: '0 16px', background: '#1E293B', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      📋 Copy SQL
                    </button>
                    <a
                      href="https://supabase.com/dashboard/project/_/sql/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ height: '36px', padding: '0 16px', background: '#3ECF8E', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                    >
                      🔗 Open Supabase SQL Editor
                    </a>
                    <button
                      type="button"
                      onClick={() => loadMissions(false)}
                      style={{ height: '36px', padding: '0 16px', background: '#F0FDF4', color: '#166534', border: '1.5px solid #DCFCE7', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      🔄 Retry After Running SQL
                    </button>
                  </div>
                </div>
              )}

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
                        if (c.notes) {
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
          {activeTab === 'reports' && (() => {
            const canView = profile?.role === 'super' || hasPermission('reports.view');
            const canExport = profile?.role === 'super' || hasPermission('reports.export');

            if (!canView) {
              return (
                <div style={{ padding: '40px', textAlign: 'center', background: '#fff', border: '1.5px solid #fee2e2', borderRadius: '24px' }}>
                  <AlertTriangle size={48} color="#dc2626" style={{ margin: '0 auto 16px auto' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#991b1b', margin: 0 }}>Access Denied</h3>
                  <p style={{ fontSize: '13px', color: '#b91c1c', marginTop: '8px' }}>You do not have the required permissions (`reports.view`) to view inventory analytics reports.</p>
                </div>
              );
            }

            const stockTotal = reportTotalUnits || 1;
            const availPercent = Math.round((reportAvailableUnits / stockTotal) * 100);
            const outPercent = Math.round((reportCheckedOutUnits / stockTotal) * 100);

            const categorySharesAll = categories.map(cat => {
              const catItems = items.filter(p => p.category_id === cat.id);
              const catUnits = catItems.reduce((sum, p) => sum + (p.total_stock || 0), 0);
              return { name: cat.name, units: catUnits };
            }).filter(cs => cs.units > 0).sort((a,b) => b.units - a.units);

            const categoryShares = showAllCategoriesInReports ? categorySharesAll : categorySharesAll.slice(0, 4);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                
                {/* Reports Header and Filters Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap', background: '#fff', border: '1.5px solid #E2DED6', borderRadius: '24px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.01)' }}>
                  <div>
                    <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#1a1f2e', fontFamily: 'Playfair Display, serif', margin: 0 }}>Inventory Reports</h2>
                    <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '4px', maxWidth: '600px', lineHeight: 1.4 }}>
                      Monitor inventory levels, stock availability, product usage, and transaction activity across the organization.
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Date filter */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>Date Range</span>
                      <select 
                        value={reportsDateRange} 
                        onChange={e => setReportsDateRange(e.target.value as any)} 
                        className="sel2" 
                        style={{ height: '38px', borderRadius: '10px', padding: '0 12px', border: '1px solid #c3fae8', background: '#fff', fontSize: '12.5px', fontWeight: 700 }}
                      >
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="last7">Last 7 Days</option>
                        <option value="last30">Last 30 Days</option>
                        <option value="last3m">Last 3 Months</option>
                        <option value="thisyear">This Year</option>
                        <option value="custom">Custom Range</option>
                      </select>
                    </div>

                    {reportsDateRange === 'custom' && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>Start Date</span>
                          <input type="date" value={reportsCustomStart} onChange={e => setReportsCustomStart(e.target.value)} className="fi2" style={{ height: '38px', border: '1px solid #c3fae8', fontSize: '12px', width: '130px', padding: '0 8px' }} />
                        </div>
                        <span style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>to</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>End Date</span>
                          <input type="date" value={reportsCustomEnd} onChange={e => setReportsCustomEnd(e.target.value)} className="fi2" style={{ height: '38px', border: '1px solid #c3fae8', fontSize: '12px', width: '130px', padding: '0 8px' }} />
                        </div>
                      </div>
                    )}

                    {/* Branch Filter */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>Branch</span>
                      <select 
                        value={reportsBranch} 
                        onChange={e => setReportsBranch(e.target.value)} 
                        className="sel2" 
                        style={{ height: '38px', borderRadius: '10px', padding: '0 12px', border: '1px solid #c3fae8', background: '#fff', fontSize: '12.5px', fontWeight: 700 }}
                        disabled={profile?.role !== 'super'}
                      >
                        <option value="all">All Branches</option>
                        <option value="poyanad">Poyanad Central</option>
                        <option value="brancha">Branch A</option>
                        <option value="branchb">Branch B</option>
                        <option value="branchc">Branch C</option>
                      </select>
                    </div>

                    {/* Category Filter */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>Category</span>
                      <select 
                        value={reportsCategory} 
                        onChange={e => setReportsCategory(e.target.value)} 
                        className="sel2" 
                        style={{ height: '38px', borderRadius: '10px', padding: '0 12px', border: '1px solid #c3fae8', background: '#fff', fontSize: '12.5px', fontWeight: 700 }}
                      >
                        <option value="all">All Categories</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
                      <button onClick={handlePrintReport} disabled={!canExport} className="bsm s" style={{ height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: '#475569', color: '#fff', opacity: canExport ? 1 : 0.6, cursor: canExport ? 'pointer' : 'not-allowed', border: 'none', fontSize: '12px', fontWeight: 800 }}>
                        <Printer size={14} /> Print PDF
                      </button>
                      <button onClick={handleExportExcel} disabled={!canExport} className="bsm s" style={{ height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: '#059669', color: '#fff', opacity: canExport ? 1 : 0.6, cursor: canExport ? 'pointer' : 'not-allowed', border: 'none', fontSize: '12px', fontWeight: 800 }}>
                        <FileSpreadsheet size={14} /> Export Excel
                      </button>
                    </div>
                  </div>
                </div>

                {/* Overview KPI Cards */}
                <div className="reports-dashboard-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '16px'
                }}>
                  {/* Total Products */}
                  <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '18px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.01)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📦</div>
                      <span style={{ fontSize: '11px', fontWeight: 800, background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '20px' }}>Total Products</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 950, color: '#0f172a', lineHeight: 1.2 }}>{reportProductsCount}</div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>Unique registered items</div>
                    </div>
                  </div>

                  {/* Total Units */}
                  <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '18px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.01)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🗃️</div>
                      <span style={{ fontSize: '11px', fontWeight: 800, background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '20px' }}>Total Units</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 950, color: '#0f172a', lineHeight: 1.2 }}>{reportTotalUnits}</div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>Combined catalog quantity</div>
                    </div>
                  </div>

                  {/* Available Now */}
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '18px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.01)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>✅</div>
                      <span style={{ fontSize: '11px', fontWeight: 800, background: '#dcfce7', color: '#16a34a', padding: '3px 8px', borderRadius: '20px' }}>Available Now</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 950, color: '#16a34a', lineHeight: 1.2 }}>{reportAvailableUnits}</div>
                      <div style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 600 }}>Ready to issue in stock</div>
                    </div>
                  </div>

                  {/* Checked Out */}
                  <div 
                    onClick={() => setReportsQuickFilter('checked_out')}
                    style={{ background: '#eff6ff', border: reportsQuickFilter === 'checked_out' ? '1.5px solid #2563eb' : '1.5px solid #bfdbfe', borderRadius: '18px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 10px rgba(0,0,0,0.01)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📤</div>
                      <span style={{ fontSize: '11px', fontWeight: 800, background: '#dbeafe', color: '#2563eb', padding: '3px 8px', borderRadius: '20px' }}>Checked Out</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 950, color: '#2563eb', lineHeight: 1.2 }}>{reportCheckedOutUnits}</div>
                      <div style={{ fontSize: '11.5px', color: '#1d4ed8', fontWeight: 600 }}>Currently issued units (Click to Filter)</div>
                    </div>
                  </div>

                  {/* Checked In Period */}
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '18px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.01)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📥</div>
                      <span style={{ fontSize: '11px', fontWeight: 800, background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '20px' }}>Checked In</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 950, color: '#15803d', lineHeight: 1.2 }}>{reportCheckedInCount}</div>
                      <div style={{ fontSize: '11.5px', color: '#166534', fontWeight: 600 }}>Returned during period</div>
                    </div>
                  </div>

                  {/* Transactions count */}
                  <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '18px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.01)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🔄</div>
                      <span style={{ fontSize: '11px', fontWeight: 800, background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '20px' }}>Transactions</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 950, color: '#0f172a', lineHeight: 1.2 }}>{reportTransactionsCount}</div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>Checkout &amp; check-in events</div>
                    </div>
                  </div>

                  {/* Low Stock count card */}
                  <div 
                    onClick={() => setReportsQuickFilter(reportsQuickFilter === 'low' ? 'all' : 'low')}
                    style={{ background: '#fff7ed', border: reportsQuickFilter === 'low' ? '1.5px solid #ea580c' : '1.5px solid #fed7aa', borderRadius: '18px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 10px rgba(0,0,0,0.01)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>⚠️</div>
                      <span style={{ fontSize: '11px', fontWeight: 800, background: '#ffedd5', color: '#ea580c', padding: '3px 8px', borderRadius: '20px' }}>Low Stock</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 950, color: '#ea580c', lineHeight: 1.2 }}>{reportLowStockCount}</div>
                      <div style={{ fontSize: '11.5px', color: '#c2410c', fontWeight: 600 }}>Quantity &le; 5 (Click to Filter)</div>
                    </div>
                  </div>

                  {/* Out of Stock card */}
                  <div 
                    onClick={() => setReportsQuickFilter(reportsQuickFilter === 'out' ? 'all' : 'out')}
                    style={{ background: '#fef2f2', border: reportsQuickFilter === 'out' ? '1.5px solid #dc2626' : '1.5px solid #fecaca', borderRadius: '18px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 10px rgba(0,0,0,0.01)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>❌</div>
                      <span style={{ fontSize: '11px', fontWeight: 800, background: '#fee2e2', color: '#dc2626', padding: '3px 8px', borderRadius: '20px' }}>Out of Stock</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 950, color: '#dc2626', lineHeight: 1.2 }}>{reportOutOfStockCount}</div>
                      <div style={{ fontSize: '11.5px', color: '#b91c1c', fontWeight: 600 }}>Zero availability (Click to Filter)</div>
                    </div>
                  </div>
                </div>

                {/* Inventory Analytics block */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                  {/* Stock Distribution */}
                  <div style={{ background: '#fff', border: '1.5px solid #E2DED6', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.01)' }}>
                    <h4 style={{ fontSize: '15px', fontWeight: 900, color: '#1A1F2E', margin: 0 }}>Stock Distribution</h4>
                    <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>Total units allocation breakdown</p>
                    
                    <div style={{ display: 'flex', height: '24px', borderRadius: '12px', overflow: 'hidden', background: '#f1f5f9', marginTop: '10px' }}>
                      <div style={{ width: `${availPercent}%`, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 900 }}>
                        {availPercent > 12 ? `${availPercent}% Available` : ''}
                      </div>
                      <div style={{ width: `${outPercent}%`, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 900 }}>
                        {outPercent > 12 ? `${outPercent}% Out` : ''}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '10px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>AVAILABLE STOCK</div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#10b981' }}>{reportAvailableUnits} Units ({availPercent}%)</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>CHECKED OUT</div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#3b82f6' }}>{reportCheckedOutUnits} Units ({outPercent}%)</div>
                      </div>
                    </div>
                  </div>

                  {/* Inventory by Category */}
                  <div style={{ background: '#fff', border: '1.5px solid #E2DED6', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.01)' }}>
                    <h4 style={{ fontSize: '15px', fontWeight: 900, color: '#1A1F2E', margin: 0 }}>Inventory by Category</h4>
                    <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>Registered units per division (Top 4)</p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                      {categoryShares.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12.5px', padding: '10px' }}>No category summary data found.</div>
                      ) : (
                        <>
                          {categoryShares.map(cs => {
                            const catPct = reportTotalUnits > 0 ? Math.round((cs.units / reportTotalUnits) * 100) : 0;
                            return (
                              <div key={cs.name}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 800, color: '#475569' }}>
                                  <span>{cs.name}</span>
                                  <span>{cs.units} Units ({catPct}%)</span>
                                </div>
                                <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', background: 'var(--teal)', width: `${catPct}%` }} />
                                </div>
                              </div>
                            );
                          })}

                          {categorySharesAll.length > 4 && (
                            <button
                              type="button"
                              onClick={() => setShowAllCategoriesInReports(!showAllCategoriesInReports)}
                              style={{ 
                                background: 'none', border: 'none', padding: '8px 0 0 0', color: 'var(--teal)', 
                                fontWeight: 800, fontSize: '12px', cursor: 'pointer', textAlign: 'left',
                                display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              {showAllCategoriesInReports ? 'Show Less Categories ▲' : `View More Categories (${categorySharesAll.length - 4} more) ▼`}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Checkout Activity */}
                  <div style={{ background: '#fff', border: '1.5px solid #E2DED6', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.01)' }}>
                    <h4 style={{ fontSize: '15px', fontWeight: 900, color: '#1A1F2E', margin: 0 }}>Checkout Activity</h4>
                    <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>Movements inside the reporting window</p>
                    
                    <div style={{ display: 'flex', alignItems: 'flex-end', height: '56px', gap: '12px', margin: '8px 0' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <div style={{ height: `${Math.max(6, Math.min(56, (reportCheckedOutInPeriod / (reportTransactionsCount || 1)) * 56))}px`, width: '100%', background: '#3b82f6', borderRadius: '4px' }} />
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Out ({reportCheckedOutInPeriod})</span>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <div style={{ height: `${Math.max(6, Math.min(56, (reportCheckedInCount / (reportTransactionsCount || 1)) * 56))}px`, width: '100%', background: '#10b981', borderRadius: '4px' }} />
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>In ({reportCheckedInCount})</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Net Stock Movement</span>
                      <strong style={{ fontSize: '14px', color: (reportCheckedOutInPeriod - reportCheckedInCount) >= 0 ? '#ef4444' : '#10b981' }}>
                        {(reportCheckedOutInPeriod - reportCheckedInCount) > 0 ? `+${reportCheckedOutInPeriod - reportCheckedInCount} Out` : `${reportCheckedOutInPeriod - reportCheckedInCount} Out`}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Product Inventory Summary Table Container */}
                <div style={{ background: '#fff', border: '1.5px solid #E2DED6', borderRadius: '24px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.01)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#1a1f2e', margin: 0 }}>Product Inventory Summary</h3>
                      <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '4px' }}>A detailed overview of inventory quantities, current availability, and product transaction activity.</p>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {/* Search box inside Reports */}
                      <div style={{ position: 'relative', width: '280px' }}>
                        <input 
                          type="text" 
                          placeholder="Search product or SKU..." 
                          value={reportsSearch} 
                          onChange={e => setReportsSearch(e.target.value)} 
                          className="fi2" 
                          style={{ height: '38px', borderRadius: '10px', border: '1px solid #c3fae8', background: '#fff', paddingLeft: '36px', fontSize: '12.5px' }} 
                        />
                        <Search size={14} style={{ position: 'absolute', left: '12px', top: '12px', color: '#868e96' }} />
                      </div>
                    </div>
                  </div>

                  {/* Quick Filters Tab bar */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <button onClick={() => setReportsQuickFilter('all')} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 800, cursor: 'pointer', background: reportsQuickFilter === 'all' ? 'var(--teal)' : '#f1f5f9', color: reportsQuickFilter === 'all' ? '#fff' : '#475569' }}>
                      All ({reportProducts.length})
                    </button>
                    <button onClick={() => setReportsQuickFilter('healthy')} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 800, cursor: 'pointer', background: reportsQuickFilter === 'healthy' ? 'var(--teal)' : '#f1f5f9', color: reportsQuickFilter === 'healthy' ? '#fff' : '#475569' }}>
                      🟢 Healthy ({reportProducts.filter(p => p.available_stock > 5).length})
                    </button>
                    <button onClick={() => setReportsQuickFilter('low')} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 800, cursor: 'pointer', background: reportsQuickFilter === 'low' ? 'var(--teal)' : '#f1f5f9', color: reportsQuickFilter === 'low' ? '#fff' : '#475569' }}>
                      🟡 Low Stock ({reportLowStockCount})
                    </button>
                    <button onClick={() => setReportsQuickFilter('out')} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 800, cursor: 'pointer', background: reportsQuickFilter === 'out' ? 'var(--teal)' : '#f1f5f9', color: reportsQuickFilter === 'out' ? '#fff' : '#475569' }}>
                      🔴 Out of Stock ({reportOutOfStockCount})
                    </button>
                    <button onClick={() => setReportsQuickFilter('checked_out')} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 800, cursor: 'pointer', background: reportsQuickFilter === 'checked_out' ? 'var(--teal)' : '#f1f5f9', color: reportsQuickFilter === 'checked_out' ? '#fff' : '#475569' }}>
                      📤 Checked Out ({reportProducts.filter(p => (p.total_stock - p.available_stock) > 0).length})
                    </button>
                  </div>

                  {/* Summary Table */}
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th onClick={() => { setReportsSortField('name'); setReportsSortOrder(reportsSortOrder === 'asc' ? 'desc' : 'asc'); }} style={{ padding: '14px', fontWeight: 800, color: '#334155', cursor: 'pointer' }}>
                            PRODUCT {reportsSortField === 'name' ? (reportsSortOrder === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => { setReportsSortField('sku'); setReportsSortOrder(reportsSortOrder === 'asc' ? 'desc' : 'asc'); }} style={{ padding: '14px', fontWeight: 800, color: '#334155', cursor: 'pointer' }}>
                            SKU {reportsSortField === 'sku' ? (reportsSortOrder === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => { setReportsSortField('category'); setReportsSortOrder(reportsSortOrder === 'asc' ? 'desc' : 'asc'); }} style={{ padding: '14px', fontWeight: 800, color: '#334155', cursor: 'pointer' }}>
                            CATEGORY {reportsSortField === 'category' ? (reportsSortOrder === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => { setReportsSortField('total'); setReportsSortOrder(reportsSortOrder === 'asc' ? 'desc' : 'asc'); }} style={{ padding: '14px', fontWeight: 800, color: '#334155', cursor: 'pointer', textAlign: 'center' }}>
                            TOTAL {reportsSortField === 'total' ? (reportsSortOrder === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => { setReportsSortField('available'); setReportsSortOrder(reportsSortOrder === 'asc' ? 'desc' : 'asc'); }} style={{ padding: '14px', fontWeight: 800, color: '#334155', cursor: 'pointer', textAlign: 'center' }}>
                            AVAILABLE {reportsSortField === 'available' ? (reportsSortOrder === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th onClick={() => { setReportsSortField('out'); setReportsSortOrder(reportsSortOrder === 'asc' ? 'desc' : 'asc'); }} style={{ padding: '14px', fontWeight: 800, color: '#334155', cursor: 'pointer', textAlign: 'center' }}>
                            OUT {reportsSortField === 'out' ? (reportsSortOrder === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th style={{ padding: '14px', fontWeight: 800, color: '#334155' }}>STATUS</th>
                          <th onClick={() => { setReportsSortField('txns'); setReportsSortOrder(reportsSortOrder === 'asc' ? 'desc' : 'asc'); }} style={{ padding: '14px', fontWeight: 800, color: '#334155', cursor: 'pointer', textAlign: 'center' }}>
                            TRANSACTIONS {reportsSortField === 'txns' ? (reportsSortOrder === 'asc' ? '▲' : '▼') : ''}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSummaryItems.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                              No products match the selected criteria.
                            </td>
                          </tr>
                        ) : (
                          displayedSummaryItems.map(p => {
                            const isOut = p.available_stock === 0;
                            const isLow = p.available_stock > 0 && p.available_stock <= 5;
                            const outCount = (p.total_stock || 0) - (p.available_stock || 0);
                            const txnsCount = getProductTransactionsCount(p.id);

                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }} className="tr-hover">
                                <td style={{ padding: '14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F4F1EB', border: '1px solid #E2DED6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                      {getProductEmoji(p.name, p.categories?.name || '')}
                                    </div>
                                    <button 
                                      type="button" 
                                      onClick={() => setSelectedProductDetail(p)} 
                                      style={{ background: 'none', border: 'none', padding: 0, color: '#1e293b', fontWeight: 900, textAlign: 'left', cursor: 'pointer', textDecoration: 'underline' }}
                                    >
                                      {p.name}
                                    </button>
                                  </div>
                                </td>
                                <td style={{ padding: '14px' }}>
                                  <span 
                                    onClick={() => handleCopySku(p.barcode_value || '')}
                                    title="Click to copy SKU"
                                    style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', fontFamily: 'monospace', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    {p.barcode_value || '—'}
                                  </span>
                                </td>
                                <td style={{ padding: '14px' }}>
                                  <span 
                                    onClick={() => setReportsCategory(p.category_id)}
                                    style={{ background: '#e6fcf5', color: '#0ca678', fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', cursor: 'pointer' }}
                                  >
                                    {p.categories?.name || 'General'}
                                  </span>
                                </td>
                                <td style={{ padding: '14px', textAlign: 'center', fontWeight: 700 }}>{p.total_stock}</td>
                                <td style={{ padding: '14px', textAlign: 'center', color: '#10b981', fontWeight: 800 }}>{p.available_stock}</td>
                                <td style={{ padding: '14px', textAlign: 'center', color: '#3b82f6', fontWeight: 800 }}>{outCount}</td>
                                <td style={{ padding: '14px' }}>
                                  {isOut ? (
                                    <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 900, background: '#fef2f2', color: '#dc2626' }}>🔴 Out of Stock</span>
                                  ) : isLow ? (
                                    <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 900, background: '#fff7ed', color: '#ca8a04' }}>🟡 Low Stock</span>
                                  ) : (
                                    <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 900, background: '#f0fdf4', color: '#16a34a' }}>🟢 Healthy</span>
                                  )}
                                </td>
                                <td style={{ padding: '14px', textAlign: 'center' }}>
                                  <button 
                                    onClick={() => setSelectedReportProductTxn(p)}
                                    style={{ background: '#f1f5f9', border: 'none', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, color: 'var(--teal)', cursor: 'pointer' }}
                                    title="View transactions history log"
                                  >
                                    {txnsCount} {txnsCount === 1 ? 'Txn' : 'Txns'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontSize: '12.5px', color: '#64748b' }}>
                    <span>Showing 1–{displayedSummaryItems.length} of {sortedSummaryItems.length} products</span>
                    {sortedSummaryItems.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setShowAllProductsInReports(!showAllProductsInReports)}
                        style={{
                          background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800,
                          fontSize: '12.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                      >
                        {showAllProductsInReports ? 'Show Less Products ▲' : `Show All Products (${sortedSummaryItems.length - 5} more) ▼`}
                      </button>
                    )}
                  </div>
                </div>

              </div>
            );
          })()}

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
                        <th style={{ padding: '12px 14px', fontWeight: 900 }}>Distributor</th>
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
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{rec.member?.name || 'Distributor'}</div>
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

      {/* Product Transactions History Drawer Modal */}
      {selectedReportProductTxn && (() => {
        const item = selectedReportProductTxn;
        const txns = allCheckouts.filter(c => {
          if (c.item_id !== item.id) return false;
          if (reportsBranch !== 'all' && getBranchName(c) !== reportsBranch) return false;
          const chkIn = isDateInReportsRange(c.checkout_date);
          const retIn = c.status === 'returned' && c.actual_return_date && isDateInReportsRange(c.actual_return_date);
          return chkIn || retIn;
        }).sort((a, b) => new Date(b.checkout_date).getTime() - new Date(a.checkout_date).getTime());

        return (
          <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1001, background: 'rgba(15, 23, 42, 0.4)' }}>
            <div className="modal inv-modal" style={{ maxWidth: '750px', width: '90%', borderRadius: '24px', padding: '28px', maxHeight: '80vh', overflowY: 'auto' }}>
              
              {/* Head */}
              <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '20px', fontWeight: 900, color: '#1A1F2E' }}>
                    Transaction History
                  </span>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{item.name} • SKU: {item.barcode_value}</div>
                </div>
                <button 
                  onClick={() => setSelectedReportProductTxn(null)} 
                  style={{ border: '1px solid #E2DED6', background: 'transparent', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Transactions list */}
              <div style={{ overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '16px', marginTop: '16px', maxHeight: '400px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>DATE</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>TYPE</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>QTY</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>DISTRIBUTOR</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>NOTES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
                          No transactions recorded during the selected period.
                        </td>
                      </tr>
                    ) : (
                      txns.map(t => {
                        const checkoutInPeriod = isDateInReportsRange(t.checkout_date);
                        const returnInPeriod = t.status === 'returned' && t.actual_return_date && isDateInReportsRange(t.actual_return_date);

                        return (
                          <React.Fragment key={t.id}>
                            {checkoutInPeriod && (
                              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '12px' }}>{t.checkout_date}</td>
                                <td style={{ padding: '12px' }}>
                                  <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 900, background: '#eff6ff', color: '#2563eb' }}>
                                    📤 Checkout
                                  </span>
                                </td>
                                <td style={{ padding: '12px', fontWeight: 700 }}>{t.quantity}</td>
                                <td style={{ padding: '12px' }}>{t.member?.name || 'Unknown Distributor'}</td>
                                <td style={{ padding: '12px', color: '#64748b' }}>{t.notes || '—'}</td>
                              </tr>
                            )}
                            {returnInPeriod && (
                              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '12px' }}>{t.actual_return_date ? t.actual_return_date.split('T')[0] : t.checkout_date}</td>
                                <td style={{ padding: '12px' }}>
                                  <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 900, background: '#f0fdf4', color: '#16a34a' }}>
                                    📥 Check-In
                                  </span>
                                </td>
                                <td style={{ padding: '12px', fontWeight: 700 }}>{t.quantity}</td>
                                <td style={{ padding: '12px' }}>{t.member?.name || 'Unknown Distributor'}</td>
                                <td style={{ padding: '12px', color: '#64748b' }}>{t.condition_notes || 'Scanned returned'}</td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setSelectedReportProductTxn(null)} className="bsm s" style={{ height: '38px', borderRadius: '10px', padding: '0 20px', background: 'var(--teal)', color: '#fff', border: 'none', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Product Detail Modal/Drawer */}
      {selectedProductDetail && (() => {
        const unitsList = selectedProductDetail.units || [];
        const hasPhysicalUnits = unitsList.length > 0;
        
        // Dynamic counts computed from unit arrays
        const totalCount = hasPhysicalUnits ? unitsList.length : selectedProductDetail.total_stock;
        const availableCount = hasPhysicalUnits
          ? unitsList.filter((u: any) => u.status === 'available').length
          : selectedProductDetail.available_stock;
        const checkedOutCount = hasPhysicalUnits
          ? unitsList.filter((u: any) => u.status === 'checked_out' || u.status === 'out').length
          : Math.max(0, (selectedProductDetail.total_stock ?? 0) - (selectedProductDetail.available_stock ?? 0));
        
        const damagedCount = unitsList.filter((u: any) => u.status === 'damaged').length;
        const lostCount = unitsList.filter((u: any) => u.status === 'lost').length;
        const goodCount = totalCount - damagedCount - lostCount;

        const itemCheckouts = allCheckouts.filter(c => c.item_id === selectedProductDetail.id);
        
        return (
          <div className="drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedProductDetail(null); }}>
            <style>{`
              @keyframes slideInRight {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @media (min-width: 769px) {
                .drawer-container {
                  position: fixed;
                  right: 0;
                  top: 0;
                  bottom: 0;
                  width: 600px;
                  max-width: 100%;
                  height: 100vh;
                  max-height: 100vh;
                  border-radius: 24px 0 0 24px;
                  animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                  display: flex;
                  flex-direction: column;
                  background: #fff;
                  box-shadow: -10px 0 30px rgba(15, 23, 42, 0.15);
                  z-index: 1010;
                  padding: 28px;
                  overflow-y: auto;
                  border-left: 1.5px solid #E2DED6;
                }
                .drawer-overlay {
                  position: fixed;
                  inset: 0;
                  background: rgba(15, 23, 42, 0.4);
                  display: flex;
                  justify-content: flex-end;
                  align-items: stretch;
                  z-index: 1000;
                  animation: fadeIn 0.2s ease-out;
                }
              }
              @media (max-width: 768px) {
                .drawer-container {
                  position: fixed;
                  inset: 0;
                  width: 100%;
                  height: 100vh;
                  background: #fff;
                  z-index: 1010;
                  padding: 20px;
                  overflow-y: auto;
                }
                .drawer-overlay {
                  position: fixed;
                  inset: 0;
                  background: #fff;
                  z-index: 1000;
                }
              }
            `}</style>

            <div className="drawer-container">
              
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ margin: 0, fontFamily: 'Playfair Display, serif', fontSize: '22px', fontWeight: 900, color: '#1a1f2e' }}>
                    {checkoutWizardActive ? 'Confirm Unit Checkout' : selectedUnitDetail ? 'Unit Status Details' : 'Product Inventory details'}
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                    {selectedProductDetail.name} • SKU: {selectedProductDetail.barcode_value || '—'}
                  </span>
                </div>
                <button 
                  onClick={() => {
                    if (selectedUnitDetail) {
                      setSelectedUnitDetail(null);
                    } else if (checkoutWizardActive) {
                      setCheckoutWizardActive(false);
                      setCheckoutWizardUnit(null);
                    } else {
                      setSelectedProductDetail(null);
                    }
                  }} 
                  style={{ border: '1px solid #E2DED6', background: 'transparent', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* VIEW 1: CHECKOUT WIZARD FLOW */}
              {checkoutWizardActive ? (() => {
                const defaultDays = selectedProductDetail.lease_duration_days || 30;
                const calculatedDate = new Date();
                calculatedDate.setDate(calculatedDate.getDate() + defaultDays);
                const defaultReturnDate = calculatedDate.toISOString().split('T')[0];

                return (
                  <form onSubmit={handleCheckoutWizardSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Selected Unit for Lease</div>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a', marginTop: '4px', fontFamily: 'monospace' }}>
                        {checkoutWizardUnit ? checkoutWizardUnit.barcode_value : 'First Available Unit'}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 850, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                        Borrowing Member *
                      </label>
                      <select 
                        value={checkoutWizardMember} 
                        onChange={e => setCheckoutWizardMember(e.target.value)} 
                        className="sel2" 
                        style={{ width: '100%', height: '42px', borderRadius: '10px', border: '1.5px solid #c3fae8', background: '#fff', fontSize: '13px', fontWeight: 700 }}
                        required
                      >
                        <option value="">-- Choose Member --</option>
                        {members.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.membership_no || 'No Member No'})</option>
                        ))}
                      </select>
                    </div>

                    {selectedProductDetail.item_type === 'lease' && (
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 850, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                          Expected Return Date
                        </label>
                        <input 
                          type="date" 
                          value={checkoutWizardDueReturn || defaultReturnDate} 
                          onChange={e => setCheckoutWizardDueReturn(e.target.value)} 
                          className="fi2" 
                          style={{ border: '1.5px solid #c3fae8', background: '#fff', fontSize: '13.5px', height: '42px', borderRadius: '10px' }} 
                        />
                      </div>
                    )}

                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 850, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                        Remarks &amp; Notes
                      </label>
                      <textarea 
                        placeholder="Provide details about condition or comments..." 
                        value={checkoutWizardNotes} 
                        onChange={e => setCheckoutWizardNotes(e.target.value)} 
                        className="fi2" 
                        style={{ border: '1.5px solid #c3fae8', background: '#fff', fontSize: '13px', minHeight: '80px', borderRadius: '10px', padding: '10px' }} 
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button 
                        type="button" 
                        onClick={() => { setCheckoutWizardActive(false); setCheckoutWizardUnit(null); }} 
                        style={{ flex: 1, height: '44px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}
                      >
                        Back
                      </button>
                      <button 
                        type="submit" 
                        disabled={checkoutWizardSubmitting}
                        className="bsm s" 
                        style={{ flex: 2, height: '44px', background: 'var(--teal)', color: '#fff', borderRadius: '12px', border: 'none', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {checkoutWizardSubmitting ? 'Processing...' : 'Confirm Checkout'}
                      </button>
                    </div>
                  </form>
                );
              })() : selectedUnitDetail ? (() => {
                
                // VIEW 2: INDIVIDUAL UNIT DETAILS DISPLAY
                const u = selectedUnitDetail;
                const co = allCheckouts.find(c => c.unit_id === u.id && c.status === 'active');
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '18px', padding: '20px' }}>
                      <div style={{ fontSize: '36px' }}>
                        {u.status === 'available' ? '🟢' : u.status === 'checked_out' ? '🔵' : u.status === 'damaged' ? '🟠' : '🔴'}
                      </div>
                      <div>
                        <strong style={{ fontSize: '16px', color: '#0f172a' }}>Unit #{String(u.unit_number).padStart(2, '0')}</strong>
                        <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#64748b', marginTop: '2px' }}>SKU Code: {u.barcode_value}</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Current Status</span>
                        <div style={{ marginTop: '4px' }}>
                          <span style={{ 
                            padding: '4px 10px', borderRadius: '50px', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase',
                            background: u.status === 'available' ? '#f0fdf4' : u.status === 'checked_out' ? '#eff6ff' : '#fff7ed',
                            color: u.status === 'available' ? '#16a34a' : u.status === 'checked_out' ? '#2563eb' : '#ea580c'
                          }}>
                            {u.status}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Physical Condition</span>
                        <div style={{ marginTop: '4px', fontSize: '13.5px', fontWeight: 800, color: '#334155' }}>
                          {u.status === 'damaged' ? '🔴 Damaged' : u.status === 'lost' ? '❌ Lost' : '🟢 Good'}
                        </div>
                      </div>
                    </div>

                    {co && (
                      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>Current Lease Holder</div>
                        <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#1e3a8a' }}>{co.member?.name || 'Distributor'}</div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Issued Date</span>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>{co.checkout_date}</div>
                          </div>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Due Return Date</span>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>{co.due_return_date || 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Operational Action Buttons based on status */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
                      {u.status === 'available' && hasPermission('checkout.create') && (
                        <button
                          onClick={() => { setCheckoutWizardUnit(u); setCheckoutWizardActive(true); }}
                          style={{ height: '44px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                        >
                          📤 Check Out Unit
                        </button>
                      )}
                      
                      {u.status === 'checked_out' && co && hasPermission('checkout.return') && (
                        <button
                          onClick={() => handleDrawerCheckIn(u, 'good', 'Scanned returned from details drawer')}
                          style={{ height: '44px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                        >
                          📥 Return &amp; Check In
                        </button>
                      )}

                      {u.status === 'checked_out' && co && hasPermission('checkout.return') && (
                        <button
                          onClick={() => handleDrawerCheckIn(u, 'damaged', 'Marked returned in damaged condition')}
                          style={{ height: '44px', background: '#f97316', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                        >
                          ⚠️ Return as Damaged
                        </button>
                      )}

                      {(u.status === 'damaged' || u.status === 'lost') && hasPermission('checkout.force_return') && (
                        <button
                          onClick={() => handleUpdateUnitStatus(u.id, 'available')}
                          style={{ height: '44px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                        >
                          🔧 Repaired &amp; Restock to Available
                        </button>
                      )}

                      {(u.status === 'damaged' || u.status === 'lost') && hasPermission('checkout.force_return') && (
                        <button
                          onClick={() => handleUpdateUnitStatus(u.id, 'archived')}
                          style={{ height: '44px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '12px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                        >
                          ❌ Write Off / Archive Asset
                        </button>
                      )}

                      <button
                        onClick={() => setSelectedUnitDetail(null)}
                        style={{ height: '44px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}
                      >
                        Back to Product Info
                      </button>
                    </div>
                  </div>
                );
              })() : (
                
                // VIEW 3: STANDARD PRODUCT INFO & STATS & UNITS TABLE
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* Photo or emoji block */}
                  <div style={{ height: '200px', background: '#F4F1EB', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '72px', border: '1px solid #E2DED6', overflow: 'hidden' }}>
                    {selectedProductDetail.photo_url ? (
                      <img src={selectedProductDetail.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span>{getProductEmoji(selectedProductDetail.name, selectedProductDetail.categories?.name || '')}</span>
                    )}
                  </div>

                  {/* Info Metadata */}
                  <div>
                    <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '10px', fontWeight: 800, textTransform: 'uppercase' }}>
                      {selectedProductDetail.item_type} asset
                    </span>
                    <p style={{ fontSize: '13px', color: '#475569', marginTop: '8px', lineHeight: 1.5 }}>
                      {selectedProductDetail.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* KPI stock indicators */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: 950, color: '#0f172a' }}>{totalCount}</div>
                      <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700, marginTop: '2px' }}>Total Units</div>
                    </div>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: 950, color: '#16a34a' }}>{availableCount}</div>
                      <div style={{ fontSize: '10.5px', color: '#15803d', fontWeight: 700, marginTop: '2px' }}>Available</div>
                    </div>
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: 950, color: '#2563eb' }}>{checkedOutCount}</div>
                      <div style={{ fontSize: '10.5px', color: '#1d4ed8', fontWeight: 700, marginTop: '2px' }}>Checked Out</div>
                    </div>
                  </div>

                  {/* Dynamic stock quality breakdown */}
                  {hasPhysicalUnits && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', background: '#fafafa', padding: '12px', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
                      <div style={{ textAlign: 'center', fontSize: '11px', color: '#16a34a', fontWeight: 800 }}>🟢 {goodCount} Good</div>
                      <div style={{ textAlign: 'center', fontSize: '11px', color: '#ea580c', fontWeight: 800 }}>🟠 {damagedCount} Damaged</div>
                      <div style={{ textAlign: 'center', fontSize: '11px', color: '#dc2626', fontWeight: 800 }}>🔴 {lostCount} Lost</div>
                    </div>
                  )}

                  {/* Actions buttons */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {hasPermission('scanner.use') && (
                      <button 
                        type="button" 
                        onClick={() => {
                          setSelectedProductDetail(null);
                          setScannerMode('checkout');
                          setManualBarcode(unitsList[0]?.barcode_value || selectedProductDetail.barcode_value || '');
                          setActiveTab('scanner');
                          handleSelectQuickScan(unitsList[0]?.barcode_value || selectedProductDetail.barcode_value || '');
                        }}
                        style={{ flex: 1, height: '40px', background: '#fff', color: 'var(--teal)', border: '1.5px solid var(--teal)', borderRadius: '12px', fontWeight: 800, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        📷 Scan Unit
                      </button>
                    )}

                    {selectedProductDetail.item_type === 'lease' && hasPermission('checkout.create') && availableCount > 0 && (
                      <button 
                        type="button" 
                        onClick={() => { setCheckoutWizardActive(true); }}
                        style={{ flex: 1.5, height: '40px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        📤 Lease Checkout
                      </button>
                    )}
                  </div>

                  {/* Units lists */}
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 900, color: '#1a1f2e', margin: '0 0 10px 0' }}>Quick Scan / Units List</h4>
                    <p style={{ fontSize: '11.5px', color: '#64748b', margin: '0 0 12px 0' }}>Select any physical instance to inspect status or trigger leases.</p>
                    
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
                      {unitsList.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                          No physical unit assets mapped to this SKU catalog entry.
                        </div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>UNIT</th>
                              <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>BARCODE</th>
                              <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569' }}>STATUS</th>
                              <th style={{ padding: '10px 12px', fontWeight: 800, color: '#475569', textAlign: 'right' }}>ACTION</th>
                            </tr>
                          </thead>
                          <tbody>
                            {unitsList.map((u: any) => {
                              const isOut = u.status === 'checked_out' || u.status === 'out';
                              const isDmg = u.status === 'damaged' || u.status === 'lost';
                              
                              return (
                                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px 12px', fontWeight: 800 }}>U{String(u.unit_number).padStart(2, '0')}</td>
                                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#475569' }}>
                                    {u.barcode_value.split('-').slice(-2).join('-')}
                                  </td>
                                  <td style={{ padding: '10px 12px' }}>
                                    <span style={{ 
                                      padding: '3px 8px', borderRadius: '6px', fontSize: '9.5px', fontWeight: 900, textTransform: 'uppercase',
                                      background: isOut ? '#EFF6FF' : isDmg ? '#FFF7ED' : '#F0FDF4',
                                      color: isOut ? '#2563EB' : isDmg ? '#EA580C' : '#16A34A'
                                    }}>
                                      {u.status}
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                    {u.status === 'available' ? (
                                      <button 
                                        type="button"
                                        onClick={() => { setCheckoutWizardUnit(u); setCheckoutWizardActive(true); }}
                                        style={{ background: '#F0FDF4', border: 'none', color: '#16A34A', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}
                                      >
                                        Scan
                                      </button>
                                    ) : (
                                      <button 
                                        type="button"
                                        onClick={() => { setSelectedUnitDetail(u); }}
                                        style={{ background: '#f1f5f9', border: 'none', color: '#475569', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}
                                      >
                                        View
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                </div>
              )}

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
                    compressImage(file, (base64) => setNewItemPhoto(base64));
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
                    compressImage(file, (base64) => setEditingItem({ ...editingItem, photo_url: base64 }));
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
                <div><b>Distributor:</b> {overrideCheckout.member?.name}</div>
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
                          {editingCategoryId === c.id ? (
                            <td colSpan={2} style={{ padding: '8px 14px' }}>
                              <form onSubmit={handleUpdateCategory} style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                                <input 
                                  type="text" 
                                  value={editingCategoryName} 
                                  onChange={e => setEditingCategoryName(e.target.value)} 
                                  className="fi2" 
                                  style={{ flex: 1, height: '32px', padding: '0 8px', fontSize: '12.5px' }} 
                                  required 
                                  autoFocus 
                                />
                                <button type="submit" className="bsm s" style={{ height: '32px', padding: '0 12px', background: 'var(--teal)', fontSize: '11px', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                                  Save
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => setEditingCategoryId(null)} 
                                  className="bsm s" 
                                  style={{ height: '32px', padding: '0 12px', background: '#94a3b8', fontSize: '11px', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                >
                                  Cancel
                                </button>
                              </form>
                            </td>
                          ) : (
                            <>
                              <td style={{ padding: '12px 14px', fontWeight: 700 }}>{c.name}</td>
                              <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                <button 
                                  onClick={() => handleEditCategory(c.id, c.name)}
                                  style={{ border: 'none', background: 'transparent', color: 'var(--teal)', cursor: 'pointer', display: 'inline-flex', padding: '4px', marginRight: '8px', fontSize: '12px' }}
                                  title="Edit Category"
                                >
                                  ✏️ Edit
                                </button>
                                <button 
                                  onClick={() => handleDeleteCategory(c.id)}
                                  style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', padding: '4px' }}
                                  title="Delete Category"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </>
                          )}
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
                    if (c.mission_id) return c.mission_id === selectedMissionDetail.id;
                    if (selectedMissionDetail.name === 'Ramadan Welfare 2025' && (c.notes?.includes('Ramadan Welfare') || c.notes?.includes('Ramadan'))) return true;
                    if (selectedMissionDetail.name === 'Student Support Drive 2025' && (c.notes?.includes('Student Support') || c.notes?.includes('Student'))) return true;
                    if (selectedMissionDetail.name === 'Medical Relief Camp' && (c.notes?.includes('Medical Relief') || c.notes?.includes('Medical') || c.notes?.toLowerCase().includes('medical'))) return true;
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
                    <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569' }}>Distributor</th>
                    <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569' }}>Date</th>
                    <th style={{ padding: '12px 14px', fontWeight: 800, color: '#475569' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const missionCheckouts = allCheckouts.filter(c => {
                      if (c.mission_id) return c.mission_id === selectedMissionDetail.id;
                      if (selectedMissionDetail.name === 'Ramadan Welfare 2025' && (c.notes?.includes('Ramadan Welfare') || c.notes?.includes('Ramadan'))) return true;
                      if (selectedMissionDetail.name === 'Student Support Drive 2025' && (c.notes?.includes('Student Support') || c.notes?.includes('Student'))) return true;
                      if (selectedMissionDetail.name === 'Medical Relief Camp' && (c.notes?.includes('Medical Relief') || c.notes?.includes('Medical') || c.notes?.toLowerCase().includes('medical'))) return true;
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
                          {c.member?.name || 'Unknown Distributor'}
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
                            {c.status === 'returned' ? 'Returned' : 'With Customer'}
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
      {/* Barcode Print Options Modal */}
      {showPrintOptionsModal && (
        <div className="ov" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, background: 'rgba(15, 23, 42, 0.4)' }}>
          <div className="modal inv-modal" style={{ maxWidth: '480px', width: '90%', borderRadius: '24px', padding: '28px', animation: 'slideUp 0.25s ease' }}>
            <div className="modal-head" style={{ border: 'none', padding: '0 0 16px 0', marginBottom: '8px' }}>
              <span className="modal-title" style={{ fontSize: '18px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                🖨️ Barcode Print Options
              </span>
              <button onClick={() => setShowPrintOptionsModal(false)} className="modal-close"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleGeneratePrintJob} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Target items type */}
              <div>
                <label className="fl2" style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b', marginBottom: '8px', display: 'block' }}>Barcodes Target Filter</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                    <input 
                      type="radio" 
                      name="printTarget" 
                      checked={printFilterTarget === 'both'} 
                      onChange={() => setPrintFilterTarget('both')}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span>Print Both (Product SKUs &amp; Unit Codes)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                    <input 
                      type="radio" 
                      name="printTarget" 
                      checked={printFilterTarget === 'product_sku'} 
                      onChange={() => setPrintFilterTarget('product_sku')}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span>Product SKU Barcodes Only (for shelves)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                    <input 
                      type="radio" 
                      name="printTarget" 
                      checked={printFilterTarget === 'units_only'} 
                      onChange={() => setPrintFilterTarget('units_only')}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span>Individual Unit Barcodes Only (for items)</span>
                  </label>
                </div>
              </div>

              {/* Category Filter Dropdown (only show if not single item print) */}
              {printJobSource?.type !== 'single' && (
                <div>
                  <label className="fl2" style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b', marginBottom: '6px', display: 'block' }}>Category Filter</label>
                  <select 
                    value={printFilterCategory} 
                    onChange={e => setPrintFilterCategory(e.target.value)} 
                    className="sel2" 
                    style={{ width: '100%', height: '42px', borderRadius: '12px' }}
                  >
                    <option value="all">All Categories</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Grouping Style */}
              <div>
                <label className="fl2" style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b', marginBottom: '8px', display: 'block' }}>Grouping &amp; Separation Style</label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                    <input 
                      type="radio" 
                      name="printGroupMode" 
                      checked={printGroupMode === 'category'} 
                      onChange={() => setPrintGroupMode('category')}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span>Group by Category</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                    <input 
                      type="radio" 
                      name="printGroupMode" 
                      checked={printGroupMode === 'product'} 
                      onChange={() => setPrintGroupMode('product')}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span>Group by Product</span>
                  </label>
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowPrintOptionsModal(false)} style={{ flex: 1, height: '44px', border: '1.5px solid #e2e8f0', background: '#fff', borderRadius: '12px', fontWeight: 800 }}>Cancel</button>
                <button type="submit" className="bsm s" style={{ flex: 1, height: '44px', borderRadius: '12px', background: 'var(--teal)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer' }}>
                  🖨️ Generate &amp; Print
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dynamic printable area for barcode labels */}
      <div id="print-section-root">
        {printJob && (() => {
          // Group labels by selected groupMode
          const groupsMap: { [key: string]: typeof printJob.labels } = {};
          printJob.labels.forEach(lbl => {
            const groupName = printJob.groupMode === 'category' 
              ? (lbl.category || 'General') 
              : (lbl.productName || 'General');
            if (!groupsMap[groupName]) {
              groupsMap[groupName] = [];
            }
            groupsMap[groupName].push(lbl);
          });

          return (
            <div style={{ width: '100%', background: '#fff' }}>
              {Object.entries(groupsMap).map(([groupName, groupLabels]) => (
                <div key={groupName} className="print-category-section" style={{ pageBreakInside: 'avoid', marginBottom: '35px' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 900, borderBottom: '2px solid #334155', paddingBottom: '6px', marginBottom: '14px', textTransform: 'uppercase', color: '#1e293b', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📦 {printJob.groupMode === 'category' ? 'Category' : 'Product'}: {groupName} ({groupLabels.length} Barcodes)
                  </h3>
                  <div className="print-category-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                    {groupLabels.map((lbl, idx) => (
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
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body {
            visibility: hidden;
            background: white !important;
            color: black !important;
          }
          #print-section-root, #print-section-root * {
            visibility: visible;
          }
          #print-section-root {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
          }
          .print-category-section {
            page-break-inside: avoid !important;
            margin-bottom: 35px !important;
          }
          .print-category-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 15px !important;
          }
          .bc-label-print {
            page-break-inside: avoid !important;
            border: 1px solid #ddd !important;
            padding: 12px !important;
            text-align: center !important;
            background: #fff !important;
            border-radius: 8px !important;
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
