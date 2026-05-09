import React, { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import * as XLSX from 'xlsx';
import { localDb } from '../../lib/localDb';
import { useAuth } from '../../contexts/AuthContext';
import BarcodeScanner from '../../components/BarcodeScanner';

// ─── BARCODE RENDERER ───
const BarcodeImg = ({ value, width = 1.5, height = 50, fontSize = 12, hideText = false }: any) => {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128", width, height, fontSize, displayValue: !hideText,
          background: "transparent", lineColor: "#0f172a", margin: 0
        });
      } catch (e) { /* invalid barcode value */ }
    }
  }, [value, width, height, fontSize, hideText]);
  return <svg ref={svgRef} style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }}></svg>;
};

export default function Inventory() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'super' || profile?.role === 'admin';

  // Core data state
  const [view, setView] = useState<'products' | 'kits' | 'missions' | 'history'>('products');
  const [productMode, setProductMode] = useState<'gallery' | 'table'>('gallery');
  const [products, setProducts] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [kits, setKits] = useState<any[]>([]);
  const [missions, setMissions] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  // Modal flags
  const [isAdding, setIsAdding] = useState(false);
  const [isKitting, setIsKitting] = useState(false);
  const [isAddingMission, setIsAddingMission] = useState(false);
  const [isEditingMission, setIsEditingMission] = useState(false);
  const [missionToEdit, setMissionToEdit] = useState<any>(null);
  const [isMissionSuccess, setIsMissionSuccess] = useState(false);
  const [activeProduct, setActiveProduct] = useState<any>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [editingKit, setEditingKit] = useState<any>(null);
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  const [prefillMissionId, setPrefillMissionId] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [toast, setToast] = useState<{t: 's'|'e', m: string}|null>(null);
  const [dialog, setDialog] = useState<any>(null);
  const [unitSearch, setUnitSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [kitSearch, setKitSearch] = useState('');
  const [missionSearch, setMissionSearch] = useState('');

  // New product form
  const [np, setNp] = useState({ name: '', category: 'Education', total_quantity: 1, photo: '' });

  // Kit assembly form state (kept at top level — no hooks-in-callbacks)
  const [kitName, setKitName] = useState('');
  const [kitSelections, setKitSelections] = useState<Record<string, number>>({});
  const [selectedPrintIds, setSelectedPrintIds] = useState<string[]>([]);

  const refresh = () => {
    setProducts(localDb.getProducts());
    setUnits(localDb.getUnits());
    setKits(localDb.getKits());
    setMissions(localDb.getCampaigns());
    setTransactions(localDb.getInventoryTransactions());
  };

  const [isSubmittingMission, setIsSubmittingMission] = useState(false);
  const [printTarget, setPrintTarget] = useState<{ productId?: string, kitId?: string } | null>(null);

  const [selectedKitsForMission, setSelectedKitsForMission] = useState<string[]>([]);
  useEffect(() => { refresh(); }, []);

  const getProductUnits = (p: any) => {
    if (!p) return [];
    const pid = String(p.id);
    const pdid = p._id ? String(p._id) : null;
    return units.filter(u => 
      String(u.product_id) === pid || 
      (pdid && String(u.product_db_id) === pdid) ||
      (pdid && String(u.product_id) === pdid)
    );
  };

  const popToast = (t: 's'|'e', m: string) => {
    setToast({ t, m });
    setTimeout(() => setToast(null), 3500);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNp(p => ({ ...p, photo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    localDb.saveProduct(np);
    setIsAdding(false);
    refresh();
    setNp({ name: '', category: 'Education', total_quantity: 1, photo: '' });
    popToast('s', `Product "${np.name}" created successfully!`);
  };

  const handlePrint = () => {
    if (selectedPrintIds.length > 0) {
      setPrintTarget({ productId: selectedPrintIds });
      setTimeout(() => {
        window.print();
        setTimeout(() => setPrintTarget(null), 1500);
      }, 600);
    } else {
      window.print();
    }
  };

  const togglePrintSelect = (id: string) => {
    setSelectedPrintIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const getProductForUnit = (u: any) => {
    return products.find(p => 
      String(p.id) === String(u.product_id) || 
      (p._id && String(p._id) === String(u.product_id)) ||
      (p._id && String(p._id) === String(u.product_db_id))
    );
  };

  // --- Kit assembly helpers ---
  const unitsInOtherKits = kits.filter(k => !editingKit || k.id !== editingKit.id).flatMap(k => k.child_units);
  const availableUnits = units.filter((u: any) => u.status === 'available' && !unitsInOtherKits.includes(u._id) && !unitsInOtherKits.includes(u.id));
  const grouped: Record<string, { product: any; units: any[] }> = {};
  availableUnits.forEach((u: any) => {
    const prod = getProductForUnit(u);
    if (!prod) return;
    const pid = String(prod.id);
    if (!grouped[pid]) grouped[pid] = { product: prod, units: [] };
    grouped[pid].units.push(u);
  });

  const exportUnitsToExcel = (p: any, ulist: any[]) => {
    const data = ulist.map(u => ({
      'Unit Code': u.unit_code,
      'Barcode': u.barcode,
      'Status': u.status.toUpperCase(),
      'Location': u.status === 'checked_out' ? (localDb.getUserById(u.current_holder_id)?.name || 'Member') : 'Warehouse',
      'Last Update': new Date(u.updated_at).toLocaleString()
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Units");
    XLSX.writeFile(wb, `${p.name}_Units.xlsx`);
  };

  const printUnits = (pId?: string, kId?: string) => {
    setPrintTarget(pId ? { productId: pId } : kId ? { kitId: kId } : null);
    setTimeout(() => {
      window.print();
      // Keep target for a bit so print dialog picks it up, 
      // but clear it after a short delay so normal UI isn't affected
      setTimeout(() => setPrintTarget(null), 1500);
    }, 600);
  };



  const toggleKitQty = (pid: string, delta: number) => {
    setKitSelections(prev => {
      const cur = prev[pid] || 0;
      const max = grouped[pid]?.units.length || 0;
      return { ...prev, [pid]: Math.min(Math.max(0, cur + delta), max) };
    });
  };

  const selectedUnitIds: string[] = [];
  Object.entries(kitSelections).forEach(([pid, qty]) => {
    if (qty > 0 && grouped[pid]) {
      grouped[pid].units.slice(0, qty).forEach((u: any) => selectedUnitIds.push(u.id));
    }
  });
  const totalSelected = Object.values(kitSelections).reduce((a, b) => a + b, 0);

  const handleExport = (type: 'inventory' | 'missions' | 'products') => {
    try {
      let data: any[] = [];
      let filename = '';

      if (type === 'products') {
        data = products.map(p => ({
          'ID': p.id || p._id,
          'Product Name': p.name,
          'Category': p.category,
          'SKU/Barcode': p.sku || p.product_no,
          'Total Quantity': p.total_quantity,
          'Available Units': getProductUnits(p).filter(u => u.status === 'available').length,
          'Base Unit': p.unit || 'Items'
        }));
        filename = `SKSSF_Product_Catalog_${new Date().toISOString().split('T')[0]}.xlsx`;
      } else if (type === 'inventory') {
        data = units.map(u => {
          const p = getProductForUnit(u);
          return {
            'SKU': p?.sku || p?.id || '?',
            'Product Name': p?.name || '?',
            'Unit Code': u.unit_code,
            'Status': u.status,
            'Current Holder': localDb.getUserById(u.current_holder_id)?.name || 'Warehouse',
            'Mission': localDb.getCampaigns().find((c: any) => c.id === u.current_mission_id)?.title || 'N/A',
            'Last Sync': new Date(u.checkoutDate || u.created_at).toLocaleString()
          };
        });
        filename = `SKSSF_Inventory_State_${new Date().toISOString().split('T')[0]}.xlsx`;
      } else if (type === 'missions') {
        const deployed = units.filter(u => u.status === 'checked_out');
        data = deployed.map(u => {
          const p = getProductForUnit(u);
          const camp = localDb.getCampaigns().find((c: any) => c.id === u.current_mission_id);
          return {
            'Mission Name': camp?.title || camp?.name || 'Unknown',
            'Product': p?.name || '?',
            'Asset Barcode': u.barcode,
            'Assigned To': localDb.getUserById(u.current_holder_id)?.name || 'Local Lead',
            'Checkout Date': u.checkoutDate ? new Date(u.checkoutDate).toLocaleDateString() : '?',
            'Days Out': u.checkoutDate ? Math.floor((Date.now() - new Date(u.checkoutDate).getTime()) / 86400000) : 0
          };
        });
        filename = `SKSSF_Mission_Deployment_${new Date().toISOString().split('T')[0]}.xlsx`;
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Report");
      XLSX.writeFile(wb, filename);
      popToast('s', `Report "${filename}" exported!`);
    } catch (e) {
      popToast('e', 'Export failed.');
    }
  };

  const seedDemoData = () => {
    try {
      popToast('s', '🔨 Building Demo Environment...');
      
      // 1. Create Product & Units
      const newProd = localDb.saveProduct({ 
        name: '🔦 Emergency Flashlight', 
        category: 'Medical', 
        total_quantity: 6,
        photo: 'https://images.unsplash.com/photo-1540340061722-9293d5163008?auto=format&fit=crop&q=80&w=200'
      });
      
      // 2. Create Mission
      const mid = localDb.addCampaign({ 
        title: '🌊 Flood Relief Demo', 
        goal: 100, 
        received: 0, 
        note: 'Live demonstration mission' 
      });

      // 3. Assemble Kit (using 3 units)
      const freshUnits = localDb.getUnits().filter(u => u.product_id === newProd.id);
      const kitUnitIds = freshUnits.slice(0, 3).map(u => u.id);
      const demoKit = localDb.createKit('🚑 First Aid Kit (Demo)', kitUnitIds);

      // 4. Deploy Items
      const demoMember = { id: 'M-DEMO', name: 'Faris Abdulrahman' };
      
      // Deploy single unit (the 4th one)
      const singleUnit = freshUnits[3];
      localDb.processBarcodeScan(singleUnit.barcode, 'checkout', 'Admin Demo', demoMember.id, demoMember.name, mid, 'manual');
      
      // Deploy the Kit
      localDb.processBarcodeScan(demoKit.barcode, 'checkout', 'Admin Demo', demoMember.id, demoMember.name, mid, 'manual');

      // 5. Force UI Refresh
      refresh();
      popToast('s', '🚀 Demo Ready! Click "Missions" to see the deployment.');
      
      // Auto-switch to missions after a short delay
      setTimeout(() => setView('missions'), 1500);

    } catch (err) {
      console.error(err);
      popToast('e', 'Demo failed to build. Check console.');
    }
  };

  const setUnitStatus = (uid: string, status: any) => {
    if (status === 'damaged' || status === 'lost') {
      setDialog({
        type: 'prompt',
        title: `Mark as ${status.toUpperCase()}`,
        message: `Please provide a reason or note for marking this unit as ${status}:`,
        onConfirm: (note: string) => {
          executeStatusUpdate(uid, status, note);
          setDialog(null);
        },
        onCancel: () => setDialog(null)
      });
    } else {
      executeStatusUpdate(uid, status, '');
    }
  };

  const executeStatusUpdate = (uid: string, status: any, note: string) => {
    if (localDb.updateUnitStatus(uid, status, profile?.name || 'Admin', note)) {
      // Immediate local state refresh
      setUnits(localDb.getUnits());
      setProducts(localDb.getProducts());

      if (activeProduct) {
        const updated = localDb.getProducts().find((p: any) => String(p.id) === String(activeProduct.id));
        setActiveProduct(updated);
      }
      popToast('s', `Unit status updated to: ${status}`);
      refresh(); // Sync with backend in background
    } else {
      popToast('e', 'Failed to update unit status. (Unit not found in local cache)');
    }
  };

  const handleUpdateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    localDb.updateProduct(editingProduct.id, editingProduct);
    setEditingProduct(null);
    if (activeProduct && String(activeProduct.id) === String(editingProduct.id)) {
       setActiveProduct({...activeProduct, ...editingProduct});
    }
    popToast('s', 'Product details updated.');
    refresh();
  };

  const handleUpdateUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit) return;
    localDb.updateUnit(editingUnit.id, editingUnit);
    setEditingUnit(null);
    popToast('s', 'Unit details updated.');
    refresh();
  };

  const handleSaveKit = () => {
    if (!kitName.trim() || selectedUnitIds.length === 0) return;
    if (editingKit) {
      localDb.updateKit(editingKit.id, kitName.trim(), selectedUnitIds);
    } else {
      localDb.createKit(kitName.trim(), selectedUnitIds);
    }
    setIsKitting(false);
    setEditingKit(null);
    setKitName('');
    setKitSelections({});
    refresh();
    popToast('s', `🧰 Kit "${kitName}" ${editingKit ? 'updated' : 'assembled'} with ${selectedUnitIds.length} items!`);
    setView('kits');
  };

  const handleEditKit = (kit: any) => {
    setEditingKit(kit);
    setKitName(kit.name);
    
    // Calculate kitSelections based on products in the kit
    const selections: Record<string, number> = {};
    kit.child_units.forEach((uid: string) => {
      const unit = units.find(u => u.id === uid || u._id === uid);
      if (unit) {
        const prod = getProductForUnit(unit);
        if (prod) {
          const pid = String(prod.id);
          selections[pid] = (selections[pid] || 0) + 1;
        }
      }
    });
    
    setKitSelections(selections);
    setIsKitting(true);
  };

  const handleDeleteProduct = (id: string, name: string) => {
    if (!profile || profile.role !== 'super') {
      popToast('e', 'Only Super Admin can delete products.');
      return;
    }
    setDialog({
      type: 'confirm',
      title: 'Delete Product',
      message: `⚠️ Are you sure you want to delete "${name}"? This will remove all associated units and cannot be undone.`,
      onConfirm: () => {
        const res = localDb.deleteProduct(id);
        if (res.success) {
          popToast('s', `Product "${name}" deleted.`);
          refresh();
        } else {
          popToast('e', res.error || 'Failed to delete.');
        }
        setDialog(null);
      },
      onCancel: () => setDialog(null)
    });
  };

  const handleDeleteMission = (id: string, name: string) => {
    if (!profile || profile.role !== 'super') {
      popToast('e', 'Only Super Admin can delete missions.');
      return;
    }
    setDialog({
      type: 'confirm',
      title: 'Delete Mission',
      message: `⚠️ Are you sure you want to delete Mission "${name}"? All deployed assets will be automatically returned to the warehouse.`,
      onConfirm: () => {
        const res = localDb.deleteCampaign(id);
        if (res.success) {
          popToast('s', `Mission "${name}" deleted and assets recovered.`);
          refresh();
        } else {
          popToast('e', 'Failed to delete mission.');
        }
        setDialog(null);
      },
      onCancel: () => setDialog(null)
    });
  };

  if (!isAdmin) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Unauthorized.</div>;

  return (
    <>
      {/* ─── PRINT LAYOUT (shown only on Ctrl+P) ─── */}
      <div className="print-only">
        {kits.length > 0 && (!printTarget || printTarget.kitId) && (
          <div style={{ marginBottom: 40, pageBreakAfter: 'always' }}>
            <h1 style={{ margin: '0 0 20px', fontSize: 22 }}>🧰 Kit Master Barcodes</h1>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {kits.filter(kit => !printTarget || (printTarget.kitId && (Array.isArray(printTarget.kitId) ? printTarget.kitId.includes(kit.id) : printTarget.kitId === kit.id))).map((kit: any) => (
                <div key={kit.id} style={{ border: '3px solid #000', padding: 16, textAlign: 'center', borderRadius: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2 }}>⬛ SKSSF MASTER KIT ⬛</div>
                  <BarcodeImg value={kit.barcode} width={1.2} height={60} hideText={false} />
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{kit.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {products.filter(p => !printTarget || (printTarget.productId && (Array.isArray(printTarget.productId) ? printTarget.productId.includes(p.id) : printTarget.productId === p.id))).map(p => {
          const ulist = getProductUnits(p);
          return (
            <div key={p.id} style={{ marginBottom: 40, pageBreakAfter: 'always' }}>
              <h1 style={{ margin: '0 0 10px', fontSize: 20 }}>{p.name} — Unit Barcodes</h1>
              <div style={{ marginBottom: 20, color: '#555' }}>SKU: {p.sku}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {ulist.map((u: any) => (
                  <div key={u.id} style={{ border: '1px solid #ccc', padding: 14, textAlign: 'center', borderRadius: 8, pageBreakInside: 'avoid' }}>
                    <div style={{ fontSize: 9, fontWeight: 800 }}>SKSSF INVENTORY ASSET</div>
                    <BarcodeImg value={u.barcode} width={1.2} height={55} hideText={false} />
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── MAIN UI ─── */}
      <div className="no-print">

        {/* Page Header */}
        <div className="pg-hd fu" style={{ marginBottom: 24 }}>
          <div>
            <div className="pg-title">📦 Inventory & Catalog</div>
            <div className="pg-sub">Manage assets, assemble kits, generate barcodes, and rapidly deploy to missions.</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="bsm s" onClick={() => setShowScanner(true)}>📷 Scan Item</button>
            <button className="bsm o" style={{ background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', color: '#fff', border: 'none' }} onClick={() => setIsAddingMission(true)}>📍 Add Mission</button>
            <button className="bsm o" style={{ background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', color: '#fff', border: 'none' }} onClick={() => setIsKitting(true)}>🧰 Assemble Kit</button>
            <button className="bsm s" onClick={() => setIsAdding(true)}>+ Add Product</button>
          </div>
        </div>

        {/* Tab Toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: '#f1f5f9', borderRadius: 12, padding: 4, width: 'fit-content' }}>
          {[
            { id: 'products', icon: '📦', label: 'Products' },
            { id: 'kits', icon: '🧰', label: `Kits ${kits.length > 0 ? `(${kits.length})` : ''}` },
            { id: 'missions', icon: '📍', label: `Missions ${missions.length > 0 ? `(${missions.length})` : ''}` },
            { id: 'history', icon: '📜', label: 'History' }
          ].map(v => (
            <button key={v.id} onClick={() => setView(v.id as any)} style={{
              background: view === v.id ? '#fff' : 'transparent',
              color: view === v.id ? '#0f172a' : '#64748b',
              padding: '8px 18px', borderRadius: 10, border: 'none',
              fontWeight: view === v.id ? 800 : 500, cursor: 'pointer', transition: 'all .2s',
              boxShadow: view === v.id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
            }}>
              {v.icon} {v.label}
            </button>
          ))}
        </div>

        {/* ══ STATS SUMMARY ══ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 32 }}>
          {[
            { label: 'Total Products', value: products.length, icon: '📦', color: '#7c3aed' },
            { label: 'Total Units', value: units.length, icon: '🔢', color: '#0d7377' },
            { label: 'Available Now', value: units.filter(u => u.status === 'available').length, icon: '✅', color: '#10b981' },
            { label: 'Active Deployments', value: units.filter(u => u.status === 'checked_out').length, icon: '📤', color: '#2563eb' },
            { label: 'Low Stock Alerts', value: products.filter(p => {
                const av = units.filter(u => String(u.product_id) === String(p.id) && u.status === 'available').length;
                return av <= p.total_quantity * 0.2 && p.total_quantity > 0;
              }).length, icon: '⚠️', color: '#f59e0b' }
          ].map((s, idx) => (
            <div key={idx} style={{ background: '#fff', borderRadius: 20, padding: '20px 24px', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: `${s.color}15`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ══ PRODUCTS VIEW ══ */}
        {view === 'products' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div className="inv-ctrls" style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', borderRadius: 20 }}>
                <span style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', fontSize: 18, opacity: 0.5 }}>🔍</span>
                <input 
                  className="fi2" 
                  style={{ paddingLeft: 50, height: 50, borderRadius: 20, border: '1.5px solid #eef2f6', fontSize: 14, background: '#fff' }} 
                  placeholder="Search products..." 
                  value={unitSearch}
                  onChange={e => setUnitSearch(e.target.value)}
                />
              </div>
              
              <div className="inv-actions-group" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {selectedPrintIds.length > 0 && (
                  <button className="bsm r" style={{ fontSize: 11, padding: '8px 16px', borderRadius: 8, background: '#fee2e2', color: '#ef4444' }} onClick={() => setSelectedPrintIds([])}>
                    Clear Selection ({selectedPrintIds.length})
                  </button>
                )}
                
                <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 12, padding: 4, height: 44, alignItems: 'center' }}>
                  <button className="bsm-mini" style={{ background: '#fff', border: '1px solid #eef2f6' }} onClick={() => handleExport('products')}>📊 Export</button>
                  <button className="bsm-mini" style={{ 
                    background: selectedPrintIds.length > 0 ? 'var(--teal)' : '#fff', 
                    color: selectedPrintIds.length > 0 ? '#fff' : 'var(--teal)',
                    border: '1px solid #eef2f6'
                  }} onClick={handlePrint}>
                    🖨️ {selectedPrintIds.length > 0 ? `Print (${selectedPrintIds.length})` : 'Print'}
                  </button>
                </div>
                
                <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 12, height: 44, alignItems: 'center' }}>
                  <button onClick={() => setProductMode('gallery')} className={`toggle-btn ${productMode === 'gallery' ? 'on' : ''}`}>🖼️ Grid</button>
                  <button onClick={() => setProductMode('table')} className={`toggle-btn ${productMode === 'table' ? 'on' : ''}`}>📋 List</button>
                </div>
              </div>
            </div>

            {productMode === 'gallery' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
                {products.filter(p => {
                  const searchStr = `${p.name} ${p.category} ${p.sku} ${p.product_no}`.toLowerCase();
                  return searchStr.includes(unitSearch.toLowerCase());
                }).map((p: any) => {
                  const ulist = getProductUnits(p);
                  const available = ulist.filter(u => u.status === 'available').length;
                  const isLow = available <= p.total_quantity * 0.2 && available < p.total_quantity;
                  return (
                    <div key={p.id} className="inv-card" onClick={() => setActiveProduct(p)} style={{
                      background: '#fff', borderRadius: 20, overflow: 'hidden',
                      border: `1.5px solid ${selectedPrintIds.includes(p.id) ? 'var(--teal)' : isLow ? '#fde68a' : '#e2e8f0'}`,
                      cursor: 'pointer', transition: 'all .3s ease', position: 'relative',
                      boxShadow: selectedPrintIds.includes(p.id) ? '0 8px 24px rgba(13, 115, 119, 0.15)' : 'none'
                    }}>
                      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 11 }} onClick={e => { e.stopPropagation(); togglePrintSelect(p.id); }}>
                        <div style={{ 
                          width: 24, height: 24, borderRadius: 6, border: '2px solid #fff', background: selectedPrintIds.includes(p.id) ? 'var(--teal)' : 'rgba(255,255,255,0.3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 900
                        }}>
                          {selectedPrintIds.includes(p.id) && '✓'}
                        </div>
                      </div>
                      <div style={{ height: 160, background: p.photo ? `url(${p.photo}) center/cover` : 'linear-gradient(135deg,#f1f5f9,#e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        {!p.photo && <span style={{ fontSize: 52, opacity: 0.4 }}>📦</span>}
                        {isLow && !selectedPrintIds.includes(p.id) && <div style={{ position: 'absolute', bottom: 12, right: 12, background: '#f59e0b', color: '#fff', fontSize: 10, fontWeight: 900, padding: '3px 10px', borderRadius: 99 }}>⚠️ LOW STOCK</div>}
                        {profile?.role === 'super' && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteProduct(p.id, p.name); }}
                            style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(239,68,68,0.9)', color: '#fff', border: 'none', width: 32, height: 32, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, zIndex: 10 }}
                          >🗑️</button>
                        )}
                      </div>
                      <div style={{ padding: '18px 20px' }}>
                        <div style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{p.category}</div>
                        <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', margin: '4px 0 6px', lineHeight: 1.2 }}>{p.name}</div>
                        
                        {/* Status Distribution Bar */}
                        <div style={{ display: 'flex', height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                          <div style={{ width: `${(available/p.total_quantity)*100}%`, background: '#10b981', transition: 'width 0.4s' }} />
                          <div style={{ width: `${(ulist.filter(u => u.status === 'checked_out').length / p.total_quantity)*100}%`, background: '#2563eb', transition: 'width 0.4s' }} />
                          <div style={{ width: `${(ulist.filter(u => ['damaged','lost'].includes(u.status)).length / p.total_quantity)*100}%`, background: '#f59e0b', transition: 'width 0.4s' }} />
                        </div>

                        <div style={{ display: 'flex', gap: 10, fontSize: 11, marginBottom: 14 }}>
                          <span style={{ color: '#64748b', fontWeight: 700 }}>Total: {p.total_quantity}</span>
                          <span style={{ color: '#166534', fontWeight: 700 }}>Available: {available}</span>
                        </div>
                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, textAlign: 'center' }}>
                          <BarcodeImg value={p.sku} width={1} height={28} fontSize={9} />
                        </div>
                      </div>
                      <div className="inv-overlay">View Units</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card tbl-wrap" style={{ padding: 0, border: '1.5px solid #eef2f6', borderRadius: 24 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #eef2f6' }}>
                      <th style={{ padding: '16px 24px', width: 40 }}>
                        <input type="checkbox" onChange={e => {
                          const visibleIds = products.filter(p => {
                            const searchStr = `${p.name} ${p.category} ${p.sku} ${p.product_no}`.toLowerCase();
                            return searchStr.includes(unitSearch.toLowerCase());
                          }).map(p => p.id);
                          if (e.target.checked) setSelectedPrintIds(prev => [...new Set([...prev, ...visibleIds])]);
                          else setSelectedPrintIds(prev => prev.filter(id => !visibleIds.includes(id)));
                        }} checked={products.length > 0 && products.filter(p => {
                          const searchStr = `${p.name} ${p.category} ${p.sku} ${p.product_no}`.toLowerCase();
                          return searchStr.includes(unitSearch.toLowerCase());
                        }).every(p => selectedPrintIds.includes(p.id))} />
                      </th>
                      <th style={{ padding: '16px 24px', fontSize: 11, fontWeight: 800, color: '#64748b', textAlign: 'left', width: 80, textTransform: 'uppercase', letterSpacing: 1 }}>Photo</th>
                      {['Product', 'Category', 'SKU', 'Inventory Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '16px 24px', fontSize: 11, fontWeight: 800, color: '#64748b', textAlign: h === 'Actions' ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.filter(p => {
                      const searchStr = `${p.name} ${p.category} ${p.sku} ${p.product_no}`.toLowerCase();
                      return searchStr.includes(unitSearch.toLowerCase());
                    }).map((p: any) => {
                      const ulist = getProductUnits(p);
                      const available = ulist.filter(u => u.status === 'available').length;
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: selectedPrintIds.includes(p.id) ? '#f0f9fa' : 'transparent' }} className="table-row-hover">
                          <td style={{ padding: '14px 24px' }}>
                            <input type="checkbox" checked={selectedPrintIds.includes(p.id)} onChange={() => togglePrintSelect(p.id)} />
                          </td>
                          <td style={{ padding: '14px 24px' }}>
                            <div style={{ width: 52, height: 52, borderRadius: 14, background: p.photo ? `url(${p.photo}) center/cover` : 'linear-gradient(135deg,#f1f5f9,#e2e8f0)', border: '1px solid #eef2f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {!p.photo && <span style={{ fontSize: 20 }}>📦</span>}
                            </div>
                          </td>
                          <td style={{ padding: '14px 24px' }}>
                            <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Unit: {p.unit || 'Items'}</div>
                          </td>
                          <td style={{ padding: '14px 24px' }}>
                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{p.category}</span>
                          </td>
                          <td style={{ padding: '14px 24px', fontSize: 13, fontFamily: 'monospace', color: '#64748b', fontWeight: 600 }}>{p.sku || p.product_no}</td>
                          <td style={{ padding: '14px 24px' }}>
                            <div style={{ display: 'flex', gap: 10 }}>
                              <div style={{ background: available > 0 ? '#ecfdf5' : '#fef2f2', color: available > 0 ? '#059669' : '#dc2626', padding: '6px 12px', borderRadius: 10, fontSize: 11, fontWeight: 800 }}>
                                {available} / {p.total_quantity} READY
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '14px 24px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                              <button className="bsm s" style={{ fontSize: 12, padding: '10px 20px', borderRadius: 12, fontWeight: 800 }} onClick={() => setActiveProduct(p)}>Track Units</button>
                              {profile?.role === 'super' && (
                                <button className="bsm r" style={{ padding: '10px', background: '#fee2e2', color: '#ef4444', borderRadius: 12, border: 'none', cursor: 'pointer' }} onClick={() => handleDeleteProduct(p.id, p.name)}>🗑️</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            
            {products.length === 0 && (
              <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                No products found in inventory.
              </div>
            )}
          </div>
        )}

        {/* ══ MISSIONS VIEW ══ */}
        {view === 'missions' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
               <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0 }}>Mission Control Center</h2>
               <div style={{ position: 'relative', width: 300 }}>
                 <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                 <input 
                   className="fi2" 
                   style={{ paddingLeft: 44, borderRadius: 16, border: '1.5px solid #eef2f6' }} 
                   placeholder="Search missions..." 
                   value={missionSearch}
                   onChange={e => setMissionSearch(e.target.value)}
                 />
               </div>
               <button className="bsm s" style={{ padding: '12px 24px', borderRadius: 14 }} onClick={() => { setSelectedKitsForMission([]); setIsAddingMission(true); }}>
                 📍 Launch New Mission
               </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 28 }}>
              {missions.filter(m => (m.title || m.name || '').toLowerCase().includes(missionSearch.toLowerCase())).map((camp: any) => {
                const campUnits = units.filter((u: any) => u.current_mission_id === camp.id || u.current_mission_id === camp.campaign_no);
                const missionTitle = camp.title || camp.name || 'Untitled Mission';
                const missionIcon = missionTitle.toLowerCase().includes('flood') ? '🌊' : 
                                    missionTitle.toLowerCase().includes('relief') ? '📦' :
                                    missionTitle.toLowerCase().includes('medical') ? '🏥' :
                                    missionTitle.toLowerCase().includes('education') ? '📚' : '📍';
                
                return (
                  <div key={camp.id} style={{ 
                    background: '#fff', borderRadius: 32, border: '1.5px solid #eef2f6', 
                    overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.04)', 
                    transition: 'all 0.3s ease', position: 'relative' 
                  }} className="mission-card">
                    <div style={{ 
                      padding: '30px', 
                      background: 'linear-gradient(135deg, #0f172a, #1e293b)', 
                      color: '#fff', position: 'relative', overflow: 'hidden' 
                    }}>
                      {/* Background Decoration */}
                      <div style={{ position: 'absolute', right: -20, top: -20, fontSize: 120, opacity: 0.1, pointerEvents: 'none' }}>{missionIcon}</div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, background: 'rgba(20,184,166,0.2)', color: '#2dd4bf', padding: '4px 10px', borderRadius: 6 }}>{camp.status || 'ACTIVE'}</span>
                            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, background: 'rgba(255,255,255,0.1)', color: '#94a3b8', padding: '4px 10px', borderRadius: 6 }}>{camp.campaign_no || 'NO-REF'}</span>
                          </div>
                          <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>{missionIcon} {missionTitle}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 16 }}>Started: {camp.period || 'Recently'}</div>
                          
                          {/* Mission Fulfillment Progress */}
                          <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 800, color: '#94a3b8' }}>
                             <span>MISSION FULFILLMENT</span>
                             <span>{campUnits.length}% Goal</span>
                          </div>
                          <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, campUnits.length)}%`, height: '100%', background: '#2dd4bf', boxShadow: '0 0 10px rgba(45, 212, 191, 0.4)' }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setMissionToEdit(camp); setIsEditingMission(true); }}
                            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', width: 40, height: 40, borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                          >✏️</button>
                          {profile?.role === 'super' && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteMission(camp.id, missionTitle); }}
                              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', width: 40, height: 40, borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.3)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                            >🗑️</button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '30px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
                        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: 20, textAlign: 'center', border: '1px solid #f1f5f9' }}>
                          <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginBottom: 2 }}>{campUnits.length}</div>
                          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Assets Deployed</div>
                        </div>
                        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: 20, textAlign: 'center', border: '1px solid #f1f5f9' }}>
                          <div style={{ fontSize: 28, fontWeight: 900, color: '#0d7377', marginBottom: 2 }}>{new Set(campUnits.map(u => u.product_id)).size}</div>
                          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Product Types</div>
                        </div>
                      </div>

                      <div style={{ marginBottom: 28 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 1 }}>Live Inventory Breakdown</div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#0d7377', background: '#f0fdfa', padding: '4px 10px', borderRadius: 8 }}>
                            Impact Score: {Math.round(campUnits.length * 1.5)}
                          </div>
                        </div>
                        
                        {campUnits.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                              {Array.from(new Set(campUnits.map(u => products.find(p => p.id === u.product_id)?.name))).map((name, i) => {
                                const count = campUnits.filter(u => products.find(p => p.id === u.product_id)?.name === name).length;
                                return (
                                  <div key={i} style={{ 
                                    display: 'flex', alignItems: 'center', gap: 8, 
                                    background: '#fff', border: '1.5px solid #f1f5f9', 
                                    padding: '6px 14px', borderRadius: 12, fontSize: 12, fontWeight: 700, color: '#334155' 
                                  }}>
                                    <span style={{ color: '#0d7377' }}>📦</span>
                                    {name}
                                    <span style={{ background: '#0f172a', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 6, marginLeft: 4 }}>{count}</span>
                                  </div>
                                );
                              })}
                            </div>
                            
                            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #eef2f6', overflow: 'hidden' }}>
                              <div style={{ padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #eef2f6', fontSize: 11, fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>
                                Physical Assets Tracking
                              </div>
                              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                {campUnits.map((u: any) => {
                                  const p = products.find(prod => String(prod.id) === String(u.product_id) || (prod._id && String(prod._id) === String(u.product_id)));
                                  const holder = localDb.getUserById(u.current_holder_id);
                                  return (
                                    <div key={u.id} style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
                                      <div>
                                        <div style={{ fontWeight: 800, fontSize: 13, color: '#1e293b' }}>{p?.name || 'Item'}</div>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                          <span style={{ fontSize: 10, fontWeight: 700, color: '#0d7377', fontFamily: 'monospace' }}>{u.unit_code}</span>
                                          <span style={{ fontSize: 10, color: '#64748b' }}>👤 {holder?.name || 'Member'}</span>
                                        </div>
                                      </div>
                                      <button 
                                        onClick={() => {
                                          localDb.processBarcodeScan(u.barcode, 'checkin', profile?.name || 'Admin', '', '', '', 'manual');
                                          refresh();
                                          popToast('s', `Unit ${u.unit_code} returned to inventory.`);
                                        }}
                                        style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #dcfce7', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                                      >
                                        Check-in
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', padding: '32px 20px', background: '#f8fafc', borderRadius: 20, color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0' }}>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                            Ready for deployment.<br/>Use quick scan to begin.
                          </div>
                        )}
                      </div>

                      <button 
                        onClick={() => { setPrefillMissionId(camp.campaign_no || camp.id); setShowScanner(true); }}
                        style={{ 
                          width: '100%', padding: '16px', borderRadius: 18, border: 'none', 
                          background: '#0d7377', color: '#fff', fontWeight: 800, fontSize: 14,
                          cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                          boxShadow: '0 4px 12px rgba(13, 115, 119, 0.2)'
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                      >
                        ⚡ Quick Scan Deployment
                      </button>
                    </div>
                  </div>
                );
              })}
              {missions.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 100, background: '#fff', borderRadius: 40, border: '2px dashed #e2e8f0' }}>
                  <div style={{ fontSize: 80, marginBottom: 24 }}>📍</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a' }}>Mission Control Empty</div>
                  <div style={{ color: '#64748b', marginTop: 12, marginBottom: 32, maxWidth: 400, margin: '12px auto 32px', lineHeight: 1.6 }}>
                    Create your first mission to start tracking disaster relief or charity operations in the field.
                  </div>
                  <button className="bsm s" style={{ padding: '16px 40px', fontSize: 16, borderRadius: 20 }} onClick={() => setIsAddingMission(true)}>📍 Launch New Mission</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ KITS VIEW ══ */}
        {view === 'kits' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ background: '#fff', padding: '12px 20px', borderRadius: 14, border: '1.5px solid #eef2f6' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Total Inventory</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{units.length}</div>
                </div>
                <div style={{ background: '#fff', padding: '12px 20px', borderRadius: 14, border: '1.5px solid #eef2f6' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Units in Kits</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--indigo)' }}>{kits.reduce((acc: number, k: any) => acc + (k.child_units?.length || 0), 0)}</div>
                </div>
                <div style={{ background: '#fff', padding: '12px 20px', borderRadius: 14, border: '1.5px solid #eef2f6' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Remaining Loose Units</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#10b981' }}>{units.filter((u: any) => u.status === 'available' && !kits.some(k => k.child_units?.includes(u._id) || k.child_units?.includes(u.id))).length}</div>
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 280, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>🔍</span>
                <input 
                  type="text" 
                  placeholder="Search kits by name or barcode..." 
                  style={{ width: '100%', padding: '12px 16px 12px 42px', borderRadius: 12, border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 14, fontWeight: 500, transition: 'all 0.2s' }}
                  value={kitSearch}
                  onChange={(e) => setKitSearch(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="bsm g" style={{ borderRadius: 12, background: '#fff', border: '1.5px solid #e2e8f0' }} onClick={() => handleExport('kits')}>📊 Export Excel</button>
                <button className="bsm g" style={{ borderRadius: 12, background: '#fff', border: '1.5px solid #e2e8f0' }} onClick={() => {
                  const filtered = kits.filter((k: any) => 
                    k.name.toLowerCase().includes(kitSearch.toLowerCase()) || 
                    k.barcode.toLowerCase().includes(kitSearch.toLowerCase())
                  );
                  printUnits(undefined, filtered.map((k: any) => k.id));
                }}>🖨️ Print All</button>
                <button className="bsm s" style={{ padding: '12px 24px', borderRadius: 12 }} onClick={() => setIsKitting(true)}>+ Assemble New Kit</button>
              </div>
            </div>

            {(() => {
              const filteredKits = kits.filter((k: any) => 
                k.name.toLowerCase().includes(kitSearch.toLowerCase()) || 
                k.barcode.toLowerCase().includes(kitSearch.toLowerCase())
              );

              if (filteredKits.length === 0) return (
                <div style={{ textAlign: 'center', padding: '80px 20px', background: '#fff', borderRadius: 24, border: '1.5px dashed #e2e8f0' }}>
                  <div style={{ fontSize: 64, marginBottom: 20 }}>🧰</div>
                  <div style={{ fontWeight: 900, fontSize: 22, color: '#0f172a', marginBottom: 8 }}>{kitSearch ? 'No matching kits' : 'No Kits Assembled'}</div>
                  <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 28, maxWidth: 400, margin: '0 auto 28px' }}>
                    Bundle items into Kits to expedite check-outs. Scan one barcode to deploy an entire package of resources.
                  </div>
                  {!kitSearch && <button className="bsm s" style={{ padding: '12px 30px' }} onClick={() => setIsKitting(true)}>Assemble Your First Kit</button>}
                </div>
              );

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 24 }}>
                  {filteredKits.map((kit: any) => {
                    const childUnits = units.filter((u: any) => {
                      const cids = kit.child_units || [];
                      return cids.some((cid: any) => String(cid) === String(u._id) || String(cid) === String(u.id));
                    });
                    const allAvailable = childUnits.length > 0 && childUnits.every((u: any) => u.status === 'available');
                    const allOut = childUnits.length > 0 && childUnits.every((u: any) => u.status === 'checked_out');
                    const byProduct: Record<string, { name: string; count: number; photo?: string }> = {};
                    childUnits.forEach((u: any) => {
                      const prod = products.find((p: any) => String(p.id) === String(u.product_id) || (p._id && String(p._id) === String(u.product_id)));
                      if (!byProduct[u.product_id]) byProduct[u.product_id] = { name: prod?.name || '?', count: 0, photo: prod?.photo };
                      byProduct[u.product_id].count++;
                    });

                    return (
                      <div key={kit.id} style={{ 
                        background: '#fff', borderRadius: 24, overflow: 'hidden', 
                        border: '1.5px solid #eef2f6', boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        position: 'relative'
                      }} className="kit-card">
                        <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)', padding: '24px', color: '#fff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2, background: 'rgba(20,184,166,0.2)', color: 'var(--teal3)', padding: '3px 8px', borderRadius: 4 }}>MASTER KIT</div>
                                <div style={{
                                  padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 900,
                                  background: allAvailable ? 'rgba(34,197,94,0.15)' : allOut ? 'rgba(239,68,68,0.15)' : 'rgba(240,165,0,0.15)',
                                  color: allAvailable ? '#4ade80' : allOut ? '#f87171' : '#fbbf24',
                                  border: '1px solid currentColor'
                                }}>
                                  {allAvailable ? 'READY' : allOut ? 'DEPLOYED' : 'PARTIAL'}
                                </div>
                              </div>
                              <div style={{ fontSize: 20, fontWeight: 900 }}>{kit.name}</div>
                              <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{kit.barcode}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button 
                                onClick={() => handleEditKit(kit)}
                                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                title="Edit Kit"
                              >✏️</button>
                              <button 
                                onClick={() => printUnits(undefined, kit.id)}
                                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                title="Print Labels"
                              >🖨️</button>
                              {profile?.role === 'super' && (
                                <button 
                                  onClick={() => {
                                    setDialog({
                                      type: 'confirm',
                                      title: 'Delete Kit?',
                                      message: `Are you sure you want to dismantle ${kit.name}? Individual items will remain in inventory.`,
                                      onConfirm: () => { localDb.deleteKit(kit.id); setDialog(null); popToast('s', 'Kit dismantled'); refresh(); },
                                      onCancel: () => setDialog(null)
                                    });
                                  }}
                                  style={{ background: 'rgba(239,68,68,0.2)', border: 'none', color: '#f87171', width: 34, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  title="Dismantle Kit"
                                >🗑️</button>
                              )}
                            </div>
                          </div>
                          <div style={{ background: '#fff', borderRadius: 16, padding: '12px', textAlign: 'center' }}>
                            <BarcodeImg value={kit.barcode} width={1.4} height={48} fontSize={0} hideText />
                          </div>
                        </div>
                        <div style={{ padding: '20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Composition ({childUnits.length} Units)</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {Object.values(byProduct).map((item, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9' }}>
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: item.photo ? `url(${item.photo}) center/cover` : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                                  {!item.photo && '📦'}
                                </div>
                                <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{item.name}</div>
                                <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', color: '#0f172a', fontWeight: 900, fontSize: 12, padding: '2px 10px', borderRadius: 8 }}>×{item.count}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── DEPLOYED ASSETS BY MISSION ── */}
            {(() => {
              const campaigns = localDb.getCampaigns();
              const deployedUnits = units.filter((u: any) => u.status === 'checked_out' && u.current_mission_id);
              if (!deployedUnits.length) return null;
              
              const missionCounts = campaigns.map((c: any) => ({
                id: c.id,
                name: c.title || c.name,
                count: deployedUnits.filter((u: any) => u.current_mission_id === c.id).length
              })).filter((c: any) => c.count > 0);

              return (
                <div style={{ marginTop: 48 }}>
                  {/* Deployment Stats Summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 30 }}>
                    <div style={{ background: '#fff', borderRadius: 20, padding: '24px', border: '1.5px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Total Assets Deployed</div>
                      <div style={{ fontSize: 32, fontWeight: 900, color: '#ef4444', marginTop: 8 }}>{deployedUnits.length}</div>
                      <div style={{ height: 4, background: '#f1f5f9', borderRadius: 10, marginTop: 12, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, (deployedUnits.length / units.length) * 100)}%`, height: '100%', background: '#ef4444' }} />
                      </div>
                    </div>
                    {missionCounts.map((m: any, i: number) => (
                      <div key={i} style={{ background: '#fff', borderRadius: 20, padding: '24px', border: '1.5px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{m.name}</div>
                        <div style={{ fontSize: 32, fontWeight: 900, color: '#0d7377', marginTop: 8 }}>{m.count} <span style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8' }}>items</span></div>
                        <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700, marginTop: 10 }}>Active Mission Support</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontWeight: 900, fontSize: 20, color: '#0f172a', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                    📍 Mission-Wise Live Deployment
                    <span style={{ background: '#fee2e2', color: '#ef4444', fontSize: 12, fontWeight: 800, padding: '3px 12px', borderRadius: 99 }}>Real-time Tracking</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 24 }}>
                    {campaigns.map((camp: any) => {
                      const campUnits = deployedUnits.filter((u: any) => u.current_mission_id === camp.id);
                      if (!campUnits.length) return null;
                      return (
                        <div key={camp.id} style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.04)' }}>
                          <div style={{ padding: '18px 22px', background: 'linear-gradient(90deg,#0d7377,#14A085)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 800, letterSpacing: 1 }}>CONNECTED TO MISSION</div>
                              <div style={{ fontWeight: 900, fontSize: 18 }}>{camp.title || camp.name || 'Unnamed Campaign'}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '5px 16px', borderRadius: 99, fontSize: 14, fontWeight: 900 }}>{campUnits.length} Assets</span>
                              {profile?.role === 'super' && (
                                <button 
                                  onClick={() => handleDeleteMission(camp.id, camp.title || camp.name)}
                                  style={{ background: 'rgba(239,68,68,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, width: 34, height: 34, cursor: 'pointer' }}
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            {campUnits.map((u: any) => {
                              const prod = products.find((p: any) => p.id === u.product_id);
                              const holder = localDb.getUserById(u.current_holder_id);
                              const daysOut = Math.floor((Date.now() - new Date(u.checkoutDate).getTime()) / 86400000);
                              return (
                                <div key={u.id} style={{ padding: '14px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{prod?.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                                       <span style={{ background: '#e2e8f0', padding: '1px 8px', borderRadius: 4, fontFamily: 'monospace', fontWeight: 600 }}>{u.unit_code}</span>
                                       <span>• Assigned: {holder?.name || 'Local Lead'}</span>
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 12, color: daysOut > 14 ? '#ef4444' : '#14b8a6', fontWeight: 900 }}>{daysOut === 0 ? 'Recently Out' : `${daysOut}d deployed`}</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{new Date(u.checkoutDate).toLocaleDateString()}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ══ HISTORY VIEW ══ */}
        {view === 'history' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: '#fff', borderBottom: '2.5px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>🔍</span>
                <input 
                  type="text" 
                  placeholder="Search activity log..." 
                  style={{ width: '100%', padding: '10px 16px 10px 42px', borderRadius: 12, border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 14, fontWeight: 500 }}
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <button 
                  className="bsm g" 
                  onClick={seedDemoData} 
                  style={{ background: '#f0fdf4', color: '#0d9488', border: '1px solid #ccfbf1', padding: '10px 20px', borderRadius: 12, fontSize: 13 }}
                >
                  🧪 Seed Demo Data
                </button>
                {profile?.role === 'super' && (
                  <button 
                    className="bsm r" 
                    style={{ padding: '10px 20px', fontSize: 13 }}
                    onClick={() => {
                      setDialog({
                        type: 'confirm',
                        title: 'Clear Transaction History?',
                        message: '⚠️ This will permanently delete ALL inventory transaction logs. This action cannot be undone.',
                        onConfirm: () => {
                          localDb.clearAllHistory();
                          refresh();
                          setDialog(null);
                          popToast('s', 'Transaction logs cleared.');
                        },
                        onCancel: () => setDialog(null)
                      });
                    }}
                  >
                    🗑️ Clear All
                  </button>
                )}
              </div>
            </div>
            <div className="tbl-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['TIMESTAMP', 'EVENT', 'PRODUCT & UNIT', 'MEMBER / MISSION', 'ADMIN'].map(h => (
                    <th key={h} style={{ padding: '14px 20px', fontSize: 11, fontWeight: 800, color: '#64748b', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = transactions.filter(tx => {
                    const prod = products.find(p => String(p.id) === String(tx.product_id) || (p._id && String(p._id) === String(tx.product_id)));
                    const unit = units.find(u => String(u.id) === String(tx.unit_id) || (u._id && String(u._id) === String(tx.unit_id)));
                    const search = historySearch.toLowerCase();
                    return tx.note.toLowerCase().includes(search) ||
                           (tx.barcode && tx.barcode.toLowerCase().includes(search)) ||
                           (unit?.unit_code && unit.unit_code.toLowerCase().includes(search)) ||
                           (tx.memberName && tx.memberName.toLowerCase().includes(search)) ||
                           (prod?.name && prod.name.toLowerCase().includes(search));
                  });
                  return [...filtered].reverse().map((tx: any) => {
                    const prod = products.find(p => String(p.id) === String(tx.product_id) || (p._id && String(p._id) === String(tx.product_id)));
                    const unit = units.find(u => String(u.id) === String(tx.unit_id) || (u._id && String(u._id) === String(tx.unit_id)));
                    return (
                      <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 20px', fontSize: 12, color: '#64748b' }}>{new Date(tx.timestamp).toLocaleString()}</td>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{ 
                            background: tx.type === 'checkout' ? '#fee2e2' : tx.type === 'checkin' ? '#dcfce7' : '#f1f5f9',
                            color: tx.type === 'checkout' ? '#991b1b' : tx.type === 'checkin' ? '#166534' : '#475569',
                            padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, textTransform: 'uppercase'
                          }}>
                            {tx.type}
                          </span>
                          <div style={{ fontSize: 11, marginTop: 4, color: '#64748b' }}>{tx.note}</div>
                        </td>
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{prod?.name || 'Unknown Product'}</div>
                          <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700, fontFamily: 'monospace' }}>{unit?.unit_code || tx.barcode || 'N/A'}</div>
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: 12 }}>
                          {tx.memberName && <div style={{ fontWeight: 700 }}>👤 {tx.memberName}</div>}
                          {tx.missionId && <div style={{ color: 'var(--teal)', fontWeight: 600 }}>📍 {localDb.getCampaigns().find((c: any) => c.id === tx.missionId)?.title || 'Mission'}</div>}
                          {!tx.memberName && !tx.missionId && <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: 12, fontWeight: 600 }}>{tx.adminBy}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
            </div>
            {transactions.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>No transaction records found.</div>}
          </div>
        )}
        {isAdding && (
          <div className="rp-modal">
            <div className="rp-modal-inner" style={{ maxWidth: 520 }}>
              <div className="rp-modal-hd">
                <div style={{ fontWeight: 900, fontSize: 18 }}>Add New Product</div>
                <button onClick={() => setIsAdding(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>✕</button>
              </div>
              <div className="rp-modal-body">
                <form id="npForm" onSubmit={handleAddProduct} className="fgrid">
                  <div className="fg2 full">
                    <label className="fl2">Product Name *</label>
                    <input className="fi2" required value={np.name} onChange={e => setNp(p => ({...p, name: e.target.value}))} placeholder="e.g. Ramadan Relief Pack" />
                  </div>
                  <div className="fg2">
                    <label className="fl2">Category</label>
                    <select className="sel2" value={np.category} onChange={e => setNp(p => ({...p, category: e.target.value}))}>
                      <option>Education</option><option>Religious</option><option>Medical</option><option>Welfare</option><option>Food</option>
                    </select>
                  </div>
                  <div className="fg2">
                    <label className="fl2">Initial Quantity</label>
                    <input className="fi2" type="number" min="1" required value={np.total_quantity} onChange={e => setNp(p => ({...p, total_quantity: parseInt(e.target.value)}))} />
                  </div>
                  <div className="fg2 full">
                    <label className="fl2">Product Image</label>
                    <input type="file" id="prod-photo-up" hidden accept="image/*" onChange={handlePhotoUpload} />
                    <div 
                      onClick={() => document.getElementById('prod-photo-up')?.click()}
                      style={{ 
                        border: '2px dashed #99f6e4', borderRadius: 14, padding: 20, 
                        textAlign: 'center', cursor: 'pointer', background: '#f0fdfa',
                        transition: 'all .2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#99f6e4'}
                    >
                      {np.photo ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <img src={np.photo} style={{ maxHeight: 120, borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} alt="Preview" />
                          <div style={{ position: 'absolute', top: -10, right: -10, background: 'var(--red)', color: '#fff', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }} onClick={(e) => { e.stopPropagation(); setNp(p => ({ ...p, photo: '' })); }}>✕</div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
                          <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--teal)' }}>Upload Product Photo</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>JPEG, PNG supported</div>
                        </div>
                      )}
                    </div>
                  </div>
                </form>
              </div>
              <div className="rp-modal-ft">
                <button className="bsm g" onClick={() => setIsAdding(false)}>Cancel</button>
                <button className="bsm s" form="npForm" type="submit">✅ Create & Auto-Generate Barcodes</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ PRODUCT DETAIL / UNITS MODAL ══ */}
        {activeProduct && (() => {
          const p = activeProduct;
          const ulist = getProductUnits(p);
          return (
            <div className="rp-modal">
              <div className="rp-modal-inner" style={{ maxWidth: 780, width: '92%', padding: 0, overflow: 'hidden' }}>
                {/* Header Section */}
                <div style={{ background: '#0f172a', padding: '24px 28px', position: 'relative', display: 'flex', gap: 28, color: '#fff' }}>
                  <button onClick={() => { setActiveProduct(null); setExpandedUnit(null); }} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>✕</button>
                  <div style={{ width: 120, height: 120, borderRadius: 20, background: p.photo ? `url(${p.photo}) center/cover` : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', boxShadow: '0 8px 20px rgba(0,0,0,0.3)' }}>
                    {!p.photo && <span style={{ fontSize: 48 }}>📦</span>}
                  </div>
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--teal3)', textTransform: 'uppercase', letterSpacing: 2, background: 'rgba(20,184,166,0.15)', padding: '3px 10px', borderRadius: 50 }}>{p.category}</div>
                      <button onClick={() => setEditingProduct(p)} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}>Edit Product</button>
                    </div>
                    <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -0.5 }}>{p.name}</div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
                      <div style={{ background: 'rgba(255,255,255,0.06)', padding: '6px 14px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ opacity: 0.5, fontWeight: 600 }}>SKU: </span><b style={{ color: 'var(--teal3)', fontFamily: 'monospace' }}>{p.product_no || p.id}</b>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.06)', padding: '6px 14px', borderRadius: 10, fontSize: 13, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ opacity: 0.5, fontWeight: 600 }}>Total: </span><b>{p.total_quantity}</b> {p.unit}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats & Search Area */}
                <div style={{ padding: '24px 28px', background: '#fff', borderBottom: '1px solid #eef2f6' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                    <div style={{ background: '#f0fdf4', padding: '14px', borderRadius: 12, border: '1px solid #dcfce7' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', opacity: 0.7, textTransform: 'uppercase', marginBottom: 2 }}>Available</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#166534' }}>{ulist.filter(u => u.status === 'available').length}</div>
                    </div>
                    <div style={{ background: '#eff6ff', padding: '14px', borderRadius: 12, border: '1px solid #dbeafe' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', opacity: 0.7, textTransform: 'uppercase', marginBottom: 2 }}>Deployed</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#1e40af' }}>{ulist.filter(u => u.status === 'checked_out').length}</div>
                    </div>
                    <div style={{ background: '#fff7ed', padding: '14px', borderRadius: 12, border: '1px solid #ffedd5' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#9a3412', opacity: 0.7, textTransform: 'uppercase', marginBottom: 2 }}>Damaged</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#9a3412' }}>{ulist.filter(u => u.status === 'damaged').length}</div>
                    </div>
                    <div style={{ background: '#fef2f2', padding: '14px', borderRadius: 12, border: '1px solid #fee2e2' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', opacity: 0.7, textTransform: 'uppercase', marginBottom: 2 }}>Lost</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#991b1b' }}>{ulist.filter(u => u.status === 'lost').length}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>🔍</span>
                      <input 
                        type="text" 
                        placeholder="Search units..." 
                        style={{ width: '100%', padding: '12px 16px 12px 42px', borderRadius: 12, border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 14, fontWeight: 500, transition: 'all 0.2s' }}
                        value={unitSearch}
                        onChange={(e) => setUnitSearch(e.target.value)}
                      />
                    </div>
                    <button className="bsm s" style={{ borderRadius: 12, padding: '0 20px' }} onClick={() => printUnits(p.id)}>Print Labels</button>
                    <button className="bsm g" style={{ borderRadius: 12, padding: '0 20px', background: '#f1f5f9', color: '#475569' }} onClick={() => exportUnitsToExcel(p, ulist)}>Export Excel</button>
                  </div>
                </div>

                {/* Units List Area */}
                <div style={{ padding: '24px 28px', maxHeight: '52vh', overflowY: 'auto', background: '#f8fafc' }}>
                  {(() => {
                    const filtered = ulist.filter(u => 
                      u.unit_code.toLowerCase().includes(unitSearch.toLowerCase()) || 
                      (u.barcode && u.barcode.toLowerCase().includes(unitSearch.toLowerCase()))
                    );

                    if (filtered.length === 0) return (
                      <div style={{ padding: '60px 20px', textAlign: 'center', background: '#fff', borderRadius: 20, border: '2px dashed #e2e8f0' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                        <div style={{ fontWeight: 800, fontSize: 18, color: '#1e293b' }}>No units found</div>
                      </div>
                    );

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {filtered.map((u: any) => {
                          const isExpanded = expandedUnit === u.id;
                          const unitTxs = transactions.filter(t => t.unit_id === u._id || t.unit_id === u.id).sort((a,b) => new Date(b.happened_at).getTime() - new Date(a.happened_at).getTime());
                          
                          return (
                            <div key={u.id} style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #eef2f6', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', transition: 'all 0.2s' }}>
                              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 24, cursor: 'pointer' }} onClick={() => setExpandedUnit(isExpanded ? null : u.id)}>
                                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 14, border: '1px solid #f1f5f9' }}>
                                  <BarcodeImg value={u.barcode || u.id} height={28} width={1.2} fontSize={0} hideText />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 900, fontSize: 17, color: '#0f172a' }}>{u.unit_no || u.id}</div>
                                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                    <span style={{ 
                                      background: u.status === 'available' ? '#ecfdf5' : u.status === 'checked_out' ? '#eff6ff' : '#fef2f2',
                                      color: u.status === 'available' ? '#059669' : u.status === 'checked_out' ? '#2563eb' : '#dc2626',
                                      padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, textTransform: 'uppercase'
                                    }}>
                                      {u.status}
                                    </span>
                                    {u.status === 'checked_out' && (
                                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>📍 {missions.find(m => m.id === u.current_mission_id || m.campaign_no === u.current_mission_id)?.title || 'Field'}</span>
                                    )}
                                  </div>
                                </div>
                                
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                  {u.status !== 'checked_out' && (
                                    <select 
                                      className="fi2" 
                                      style={{ padding: '8px 14px', fontSize: 12, width: 'auto', borderRadius: 10, cursor: 'pointer', fontWeight: 800 }}
                                      value={u.status}
                                      onClick={e => e.stopPropagation()}
                                      onChange={(e) => { e.stopPropagation(); setUnitStatus(u.id, e.target.value); }}
                                    >
                                      <option value="available">✅ Available</option>
                                      <option value="damaged">🚨 Damaged</option>
                                      <option value="lost">🔍 Lost</option>
                                    </select>
                                  )}
                                  <span style={{ fontSize: 18, opacity: 0.4 }}>{isExpanded ? '🔼' : '🔽'}</span>
                                </div>
                              </div>

                              {isExpanded && (
                                <div style={{ padding: '0 24px 24px', background: '#fcfdfe', borderTop: '1px solid #f1f5f9' }}>
                                  <div style={{ paddingTop: 20 }}>
                                    <div style={{ fontSize: 11, fontWeight: 900, color: '#94a3b8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1.5 }}>🛣️ Deployment Journey</div>
                                    <div style={{ position: 'relative', paddingLeft: 24, borderLeft: '2px dashed #cbd5e1', marginLeft: 6 }}>
                                      {unitTxs.length > 0 ? unitTxs.map((t: any, idx: number) => (
                                        <div key={idx} style={{ position: 'relative', marginBottom: 20 }}>
                                          <div style={{ 
                                            position: 'absolute', left: -32, top: 4, width: 14, height: 14, borderRadius: '50%', 
                                            background: t.type === 'checkout' ? '#2563eb' : t.type === 'checkin' ? '#059669' : '#f59e0b', 
                                            border: '3px solid #fcfdfe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8
                                          }}>{t.method === 'scan' ? '📱' : '🛠️'}</div>
                                          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
                                            {t.type === 'checkout' ? `📤 Checked Out to ${t.memberName || t.member_name || 'Member'}` : t.type === 'checkin' ? '📥 Checked In' : '⚙️ Inventory Sync'}
                                          </div>
                                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                            {new Date(t.timestamp || t.happened_at).toLocaleString()} by <span style={{ fontWeight: 700 }}>{t.adminBy || t.admin_by}</span>
                                            {t.method && <span style={{ marginLeft: 8, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 9 }}>via {t.method.toUpperCase()}</span>}
                                          </div>
                                          {t.missionId && (
                                            <div style={{ fontSize: 11, color: '#0d7377', fontWeight: 700, marginTop: 4 }}>
                                              📍 Mission: {missions.find(m => m.id === t.missionId || m.campaign_no === t.missionId)?.title || 'Field Operation'}
                                            </div>
                                          )}
                                          {t.note && <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 }}>"{t.note}"</div>}
                                        </div>
                                      )) : (
                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>No deployment history for this unit.</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ══ KIT ASSEMBLY MODAL ══ */}
        {isKitting && (
          <div className="rp-modal">
            <div className="rp-modal-inner" style={{ maxWidth: 580, width: '95%', padding: 0, overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)', padding: '20px 24px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--teal3)', fontWeight: 900, letterSpacing: 2, marginBottom: 4 }}>KIT ASSEMBLY</div>
                  <div style={{ fontWeight: 900, fontSize: 20 }}>{editingKit ? '✏️ Edit Kit Contents' : '🧰 Assemble New Kit'}</div>
                </div>
                <button onClick={() => { setIsKitting(false); setEditingKit(null); setKitName(''); setKitSelections({}); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>

              <div style={{ padding: '22px 24px', maxHeight: '65vh', overflowY: 'auto', background: '#f8fafc' }}>
                <div style={{ marginBottom: 22 }}>
                  <label style={{ display: 'block', fontWeight: 800, fontSize: 13, color: '#0f172a', marginBottom: 8 }}>Kit Name *</label>
                  <input
                    className="fi2"
                    value={kitName}
                    onChange={e => setKitName(e.target.value)}
                    placeholder="e.g. Ramadan Relief Package Alpha"
                    style={{ fontSize: 15, fontWeight: 600 }}
                  />
                </div>

                <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', marginBottom: 12 }}>📦 Bill of Materials — Select Items</div>

                {Object.keys(grouped).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)', background: '#fff', borderRadius: 12, border: '1.5px dashed #e2e8f0' }}>
                    No available units to bundle. Add products first.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.entries(grouped).map(([pid, data]) => {
                      const qty = kitSelections[pid] || 0;
                      return (
                        <div key={pid} style={{
                          background: '#fff', borderRadius: 14, padding: '14px 18px',
                          border: qty > 0 ? '2px solid var(--teal)' : '1.5px solid #e2e8f0',
                          transition: 'all .2s'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{data.product.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                                {data.product.category} &bull; <b>{data.units.length}</b> units available
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                              <button onClick={() => toggleKitQty(pid, -1)} disabled={qty === 0} style={{
                                width: 34, height: 34, borderRadius: '50%',
                                border: '1.5px solid #e2e8f0', background: qty === 0 ? '#f8fafc' : '#fff',
                                cursor: qty === 0 ? 'not-allowed' : 'pointer', fontSize: 20, color: '#475569',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700
                              }}>−</button>
                              <span style={{ fontWeight: 900, fontSize: 20, color: qty > 0 ? 'var(--teal)' : '#94a3b8', minWidth: 22, textAlign: 'center' }}>{qty}</span>
                              <button onClick={() => toggleKitQty(pid, 1)} disabled={qty >= data.units.length} style={{
                                width: 34, height: 34, borderRadius: '50%', border: 'none',
                                background: qty >= data.units.length ? '#f1f5f9' : 'var(--teal)',
                                cursor: qty >= data.units.length ? 'not-allowed' : 'pointer', fontSize: 20,
                                color: qty >= data.units.length ? '#94a3b8' : '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700
                              }}>+</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ padding: '16px 24px', background: '#fff', borderTop: '1.5px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {totalSelected > 0
                    ? <><b style={{ color: 'var(--teal)', fontSize: 15 }}>{totalSelected}</b> unit{totalSelected > 1 ? 's' : ''} selected</>
                    : 'Select items to bundle into this kit'}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="bsm g" onClick={() => { setIsKitting(false); setEditingKit(null); setKitName(''); setKitSelections({}); }}>Cancel</button>
                  <button
                    onClick={handleSaveKit}
                    disabled={!kitName.trim() || totalSelected === 0}
                    style={{
                      background: (!kitName.trim() || totalSelected === 0) ? '#e2e8f0' : 'var(--teal)',
                      color: (!kitName.trim() || totalSelected === 0) ? '#94a3b8' : '#fff',
                      padding: '9px 20px', borderRadius: 50, border: 'none',
                      fontWeight: 800, fontSize: 13, cursor: (!kitName.trim() || totalSelected === 0) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {editingKit ? '💾 Save Changes' : '🧰 Seal Kit & Generate Barcode'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ ADD MISSION MODAL ══ */}
      {(isAddingMission || isEditingMission) && (
        <div className="rp-modal">
          <div className="rp-modal-inner" style={{ maxWidth: 460, overflow: 'hidden' }}>
            {!isMissionSuccess ? (
                <>
                  <div className="rp-modal-hd">
                    <div style={{ fontWeight: 800 }}>{isEditingMission ? '⚙️ Edit Mission' : 'Create New Mission'}</div>
                    <button onClick={() => { setIsAddingMission(false); setIsEditingMission(false); setMissionToEdit(null); }} className="cls-btn">×</button>
                  </div>
                  <form style={{ padding: 24 }} onSubmit={async (e: any) => {
                    e.preventDefault();
                    const name = e.target.mName.value;
                    const goal = Number(e.target.mGoal.value);
                    const note = e.target.mNote.value;
                    if (!name) return;
                    
                    setIsSubmittingMission(true);
                    
                    if (isEditingMission && missionToEdit) {
                      localDb.updateCampaign(missionToEdit.id, { title: name, goal, note });
                    } else {
                      const mid = localDb.addCampaign({ title: name, goal, received: 0, note });
                      for (const kid of selectedKitsForMission) {
                        const kit = kits.find(k => k.id === kid);
                        if (kit) {
                          localDb.processBarcodeScan(kit.barcode, 'checkout', profile?.name || 'Admin', '', '', mid, 'manual');
                        }
                      }
                    }

                    await new Promise(r => setTimeout(r, 600));
                    setIsSubmittingMission(false);
                    setIsMissionSuccess(true);
                    refresh();
                    
                    setTimeout(() => {
                      setIsAddingMission(false);
                      setIsEditingMission(false);
                      setMissionToEdit(null);
                      setIsMissionSuccess(false);
                      setSelectedKitsForMission([]);
                      setView('missions');
                    }, 1200);
                  }}>
                    <div className="fg">
                      <label className="fl2">Mission Title *</label>
                      <input name="mName" defaultValue={missionToEdit?.title || missionToEdit?.name || ''} className="fi2" required placeholder="e.g. Flood Relief 2026 Phase 1" disabled={isSubmittingMission} />
                    </div>

                    <div className="fg" style={{ marginTop: 16 }}>
                      <label className="fl2">Mission Goal (Units)</label>
                      <input name="mGoal" type="number" defaultValue={missionToEdit?.goal || 0} className="fi2" placeholder="e.g. 500" disabled={isSubmittingMission} />
                    </div>

                    <div className="fg" style={{ marginTop: 16 }}>
                      <label className="fl2">Operational Notes</label>
                      <textarea name="mNote" defaultValue={missionToEdit?.note || ''} className="fi2" style={{ minHeight: 80, paddingTop: 12 }} placeholder="Details about location, requirements..." disabled={isSubmittingMission} />
                    </div>

                    {!isEditingMission && (
                      <div className="fg" style={{ marginTop: 16 }}>
                        <label className="fl2">Deploy Kits Immediately (Optional)</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, maxHeight: 150, overflowY: 'auto', padding: '8px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                          {kits.length > 0 ? kits.map((kit: any) => {
                            const isSelected = selectedKitsForMission.includes(kit.id);
                            return (
                              <div 
                                key={kit.id} 
                                onClick={() => {
                                  if (isSelected) setSelectedKitsForMission(prev => prev.filter(id => id !== kit.id));
                                  else setSelectedKitsForMission(prev => [...prev, kit.id]);
                                }}
                                style={{ 
                                  padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                  background: isSelected ? '#0d7377' : '#fff',
                                  color: isSelected ? '#fff' : '#475569',
                                  border: '1px solid',
                                  borderColor: isSelected ? '#0d7377' : '#e2e8f0',
                                  transition: 'all 0.2s'
                                }}
                              >
                                📦 {kit.name}
                              </div>
                            );
                          }) : (
                            <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 8px' }}>No kits available to deploy.</div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="rp-modal-ft" style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                      <button type="button" className="bsm g" onClick={() => { setIsAddingMission(false); setIsEditingMission(false); setMissionToEdit(null); }} disabled={isSubmittingMission} style={{ flex: 1 }}>Cancel</button>
                      <button type="submit" className="bsm s" disabled={isSubmittingMission} style={{ flex: 2 }}>
                        {isSubmittingMission ? 'Processing...' : isEditingMission ? 'Save Changes' : 'Create Mission'}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div style={{ padding: '60px 40px', textAlign: 'center', animation: 'scaleIn 0.3s ease' }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dcfce7', color: '#10b981', fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    ✅
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Mission {isEditingMission ? 'Updated' : 'Created'}!</div>
                  <div style={{ color: '#64748b', marginTop: 8 }}>Redirecting you to the missions list...</div>
                </div>
            )}
          </div>
        </div>
      )}


      {/* ══ EDIT PRODUCT MODAL ══ */}
      {editingProduct && (
        <div className="ov" style={{ zIndex: 10000 }}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-head">
              <div className="modal-title">Edit Product Details</div>
              <button className="modal-close" onClick={() => setEditingProduct(null)}>✕</button>
            </div>
            <form onSubmit={handleUpdateProduct}>
              <div className="modal-body">
                <div className="fg">
                  <label className="fl2">Product Name</label>
                  <input className="fi2" value={editingProduct.name} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} required />
                </div>
                <div className="fg">
                  <label className="fl2">Category</label>
                  <select className="sel2" value={editingProduct.category} onChange={e => setEditingProduct({...editingProduct, category: e.target.value})} required>
                    <option value="Education">Education</option>
                    <option value="Medical">Medical</option>
                    <option value="Relief">Relief</option>
                    <option value="Office">Office</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl2">Unit Label (e.g. Box, Piece)</label>
                  <input className="fi2" value={editingProduct.unit} onChange={e => setEditingProduct({...editingProduct, unit: e.target.value})} placeholder="e.g. Unit, Pkt" />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="fg" style={{ flex: 1 }}>
                    <label className="fl2">Total Quantity</label>
                    <input type="number" className="fi2" value={editingProduct.total_quantity} onChange={e => setEditingProduct({...editingProduct, total_quantity: Number(e.target.value)})} />
                  </div>
                  <div className="fg" style={{ flex: 1 }}>
                    <label className="fl2">Available Quantity</label>
                    <input type="number" className="fi2" value={editingProduct.available_quantity} onChange={e => setEditingProduct({...editingProduct, available_quantity: Number(e.target.value)})} />
                  </div>
                </div>
                <div className="fg">
                  <label className="fl2">Product Image</label>
                  <input type="file" id="edit-prod-photo-up" hidden accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setEditingProduct({...editingProduct, photo: reader.result as string});
                      reader.readAsDataURL(file);
                    }
                  }} />
                  <div 
                    onClick={() => document.getElementById('edit-prod-photo-up')?.click()}
                    style={{ 
                      border: '2px dashed #e2e8f0', borderRadius: 14, padding: editingProduct.photo ? 10 : 20, 
                      textAlign: 'center', cursor: 'pointer', background: '#f8fafc',
                      transition: 'all .2s', position: 'relative'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                  >
                    {editingProduct.photo ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img src={editingProduct.photo} style={{ maxHeight: 100, borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} alt="Preview" />
                        <div style={{ position: 'absolute', top: -10, right: -10, background: 'var(--red)', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900 }} onClick={(e) => { e.stopPropagation(); setEditingProduct({...editingProduct, photo: ''}); }}>✕</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>📸</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Click to update photo</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="bsm g" onClick={() => setEditingProduct(null)}>Cancel</button>
                <button type="submit" className="bsm s">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ EDIT UNIT MODAL ══ */}
      {editingUnit && (
        <div className="ov" style={{ zIndex: 10001 }}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-head">
              <div className="modal-title">Edit Physical Unit</div>
              <button className="modal-close" onClick={() => setEditingUnit(null)}>✕</button>
            </div>
            <form onSubmit={handleUpdateUnit}>
              <div className="modal-body">
                <div className="fg">
                  <label className="fl2">Unit Number / Code</label>
                  <input className="fi2" value={editingUnit.unit_no} onChange={e => setEditingUnit({...editingUnit, unit_no: e.target.value})} required />
                </div>
                <div className="fg">
                  <label className="fl2">Barcode String</label>
                  <input className="fi2" value={editingUnit.barcode} onChange={e => setEditingUnit({...editingUnit, barcode: e.target.value})} required />
                </div>
                <div style={{ fontSize: 11, color: '#ef4444', background: '#fef2f2', padding: '10px 14px', borderRadius: 10, marginTop: 12, lineHeight: 1.5 }}>
                  <b>⚠️ Warning:</b> Modifying the barcode string will invalidate existing physical labels. Ensure you reprint the barcode after saving.
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="bsm g" onClick={() => setEditingUnit(null)}>Cancel</button>
                <button type="submit" className="bsm s">Update Unit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ SCANNER ══ */}
      {showScanner && (
        <BarcodeScanner
          initialMissionId={prefillMissionId}
          onClose={() => { setShowScanner(false); setPrefillMissionId(null); }}
          onScanSuccess={(res) => {
            const msg = res.isKit
              ? `🧰 Kit "${res.kit?.name}" — ${res.processedUnits?.length} items done!`
              : `✅ ${res.processedUnits?.[0]?.unit_code || 'Item'} processed`;
            popToast('s', msg);
            setShowScanner(false);
            setPrefillMissionId(null);
            refresh();
          }}
        />
      )}

      {/* ══ CUSTOM DIALOG (Alert/Confirm/Prompt Replacement) ══ */}
      {dialog && (
        <div className="ov" style={{ zIndex: 20000 }}>
          <div className="modal" style={{ maxWidth: 460, animation: 'scaleIn 0.3s ease' }}>
            <div className="modal-head" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', border: 'none' }}>
              <div className="modal-title" style={{ color: '#fff' }}>{dialog.title}</div>
            </div>
            <div className="modal-body" style={{ padding: '24px 30px' }}>
              <div style={{ fontSize: 15, color: '#475569', lineHeight: 1.6, marginBottom: dialog.type === 'prompt' ? 20 : 0 }}>
                {dialog.message}
              </div>
              {dialog.type === 'prompt' && (
                <div className="fg">
                  <input 
                    autoFocus
                    className="fi2" 
                    placeholder="Type your note here..." 
                    style={{ fontSize: 15, padding: '14px 18px', borderRadius: 12 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') dialog.onConfirm((e.target as any).value);
                      if (e.key === 'Escape') dialog.onCancel();
                    }}
                  />
                </div>
              )}
            </div>
            <div className="modal-foot" style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '16px 24px' }}>
              <button className="bsm g" onClick={dialog.onCancel} style={{ padding: '10px 24px' }}>Cancel</button>
              <button 
                className={`bsm ${dialog.title.toLowerCase().includes('delete') ? 'r' : 's'}`}
                style={{ padding: '10px 24px' }}
                onClick={() => {
                  if (dialog.type === 'prompt') {
                    const val = (document.querySelector('.fi2[placeholder="Type your note here..."]') as any)?.value;
                    dialog.onConfirm(val || '');
                  } else {
                    dialog.onConfirm();
                  }
                }}
              >
                {dialog.type === 'prompt' ? 'Submit' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TOAST ══ */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.t === 's' ? '#0d7377' : '#ef4444', color: '#fff',
          padding: '14px 28px', borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          zIndex: 2000, display: 'flex', alignItems: 'center', gap: 12, animation: 'fadeUp .3s ease',
          maxWidth: 400, fontSize: 14, fontWeight: 600
        }}>
          {toast.m}
        </div>
      )}
      {/* ─── GLOBAL RESPONSIVE STYLES ─── */}
      <style>{`
        .bsm-mini {
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s;
        }
        .toggle-btn {
          padding: 8px 12px;
          border-radius: 8px;
          border: none;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          background: transparent;
          color: #64748b;
        }
        .toggle-btn.on {
          background: #fff;
          color: var(--teal);
          box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }

        @media (max-width: 1024px) {
          .pg-hd {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 20px !important;
          }
          .pg-hd > div:last-child {
            width: 100%;
            display: grid !important;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 10px;
          }
          .inv-ctrls {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 16px !important;
          }
          .inv-actions-group {
            justify-content: space-between;
          }
        }

        @media (max-width: 768px) {
          .tbl-wrap {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            border-radius: 16px !important;
          }
          table {
            min-width: 900px;
          }
        }

        @media (max-width: 600px) {
          .inv-actions-group {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            width: 100%;
          }
          .inv-actions-group > div {
            width: 100%;
            justify-content: center;
          }
          .toggle-btn, .bsm-mini {
            flex: 1;
          }
          div[style*="background: rgb(241, 245, 249)"] {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </>
  );
}
