import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, CheckCircle, XCircle, AlertCircle, Grid, List, Barcode as BarcodeIcon, Printer } from 'lucide-react';
import JsBarcode from 'jsbarcode';

interface CatalogItem {
  id: string;
  name: string;
  item_type: 'lease' | 'permanent';
  available_stock: number;
  total_stock: number;
  photo_url: string | null;
  public_description: string | null;
  barcode_value: string | null;
  categories: { id: string; name: string } | null;
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

// Fetch from the public catalog endpoint
const fetchPublicCatalog = async (search = '', category_id = '') => {
  const params = new URLSearchParams({ resource: 'public-catalog' });
  if (search) params.set('search', search);
  if (category_id) params.set('category_id', category_id);
  const res = await fetch(`/api/inventory?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to load catalog');
  return res.json();
};

const fetchOrgSettings = async () => {
  const res = await fetch('/api/inventory?resource=org-settings');
  if (!res.ok) return { settings: {} };
  return res.json();
};

const availabilityInfo = (item: CatalogItem) => {
  const pct = item.total_stock > 0 ? item.available_stock / item.total_stock : 0;
  if (item.available_stock === 0) return { label: 'Unavailable', color: '#ef4444', bg: '#fee2e2', icon: 'x' };
  if (pct <= 0.25) return { label: 'Limited Stock', color: '#f59e0b', bg: '#fef3c7', icon: 'warn' };
  return { label: 'Available', color: '#059669', bg: '#d1fae5', icon: 'check' };
};

const AvailIcon = ({ type, size = 14 }: { type: string; size?: number }) => {
  if (type === 'check') return <CheckCircle size={size} />;
  if (type === 'x') return <XCircle size={size} />;
  return <AlertCircle size={size} />;
};

export default function PublicCatalog() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [viewMode, setViewMode] = useState<'gallery' | 'table' | 'barcodes'>('gallery');
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Derive unique categories from loaded items
  const categories = Array.from(
    new Map(
      items
        .filter(i => i.categories)
        .map(i => [i.categories!.id, i.categories!])
    ).values()
  );

  const load = async (q = search, cat = selectedCategory) => {
    try {
      setLoading(true);
      const [catalogData, settingsData] = await Promise.all([
        fetchPublicCatalog(q, cat),
        fetchOrgSettings()
      ]);
      setItems(catalogData.items || []);
      setWhatsappNumber(settingsData.settings?.catalog_whatsapp || '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => load(val, selectedCategory), 350);
  };

  const handleCategory = (id: string) => {
    setSelectedCategory(id);
    load(search, id);
  };

  const handleRequest = (item: CatalogItem) => {
    if (!whatsappNumber) {
      alert('Contact information not available. Please reach out to SKSSF directly.');
      return;
    }
    const msg = encodeURIComponent(
      `Hello SKSSF,\n\nI'd like to request the following item from the catalog:\n\n📦 *${item.name}*\nType: ${item.item_type === 'permanent' ? 'Permanent Grant' : 'Lease'}\nCategory: ${item.categories?.name || 'General'}\n\nPlease let me know the availability and next steps.\n\nThank you.`
    );
    window.open(`https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${msg}`, '_blank');
  };

  const handlePrintBarcodes = () => {
    window.print();
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700;800&family=Poppins:wght@700;800;900&display=swap');
        
        :root {
          --teal: #0D7377;
          --teal-hover: #14A085;
          --dark: #0f172a;
          --muted: #64748b;
          --bg: #F2F0EB;
          --card-border: #E2DED6;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--dark); }

        .pc-nav { background: #fff; border-bottom: 1.5px solid var(--card-border); position: sticky; top: 0; z-index: 100; }
        .pc-nav-inner { max-width: 1280px; margin: 0 auto; padding: 0 24px; height: 66px; display: flex; align-items: center; justify-content: space-between; }
        .pc-logo { display: flex; align-items: center; gap: 12px; text-decoration: none; }
        .pc-logo-mark { width: 40px; height: 40px; background: var(--teal); border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #fff; flex-shrink: 0; }
        .pc-logo-name { font-family: 'Poppins', sans-serif; font-size: 17px; font-weight: 800; color: var(--dark); }
        .pc-logo-sub { font-size: 10px; color: var(--muted); margin-top: 1px; }
        .pc-nav-login { display: flex; align-items: center; gap: 8px; padding: 9px 18px; background: var(--teal); color: #fff; border: none; border-radius: 50px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; transition: all .2s; }
        .pc-nav-login:hover { background: var(--teal-hover); transform: translateY(-1px); }

        .pc-hero { background: linear-gradient(135deg, var(--teal) 0%, #0a5a5e 50%, var(--teal) 100%); color: #fff; padding: 72px 24px 80px; text-align: center; position: relative; overflow: hidden; }
        .pc-hero::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px); background-size: 28px 28px; pointer-events: none; }
        .pc-hero-tag { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.2); border-radius: 50px; padding: 6px 16px; font-size: 12px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; margin-bottom: 22px; }
        .pc-hero-dot { width: 8px; height: 8px; background: #F0A500; border-radius: 50%; animation: blink 2s infinite; }
        @keyframes blink { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.4)} }
        .pc-hero h1 { font-family: 'Poppins', sans-serif; font-size: clamp(36px, 5vw, 58px); font-weight: 900; line-height: 1.08; margin-bottom: 14px; position: relative; }
        .pc-hero h1 em { font-style: normal; color: #F0A500; }
        .pc-hero p { font-size: 16px; color: rgba(255,255,255,.8); max-width: 520px; margin: 0 auto 36px; line-height: 1.7; position: relative; }
        .pc-search-wrap { max-width: 600px; margin: 0 auto; position: relative; }
        .pc-search-icon { position: absolute; left: 20px; top: 50%; transform: translateY(-50%); color: #6B7280; }
        .pc-search-input { width: 100%; height: 58px; padding: 0 20px 0 52px; border-radius: 18px; border: none; font-size: 15px; font-family: 'DM Sans', sans-serif; color: #1A1F2E; background: #fff; box-shadow: 0 8px 32px rgba(0,0,0,.18); outline: none; }
        
        .pc-main { max-width: 1280px; margin: 0 auto; padding: 48px 24px; }
        .pc-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
        .pc-section-title { font-size: 22px; font-weight: 800; color: var(--dark); }
        
        /* View Switcher Pills */
        .pc-view-switchers { display: flex; background: #fff; border: 1.5px solid var(--card-border); padding: 4px; border-radius: 12px; }
        .pc-view-btn { padding: 8px 14px; display: flex; align-items: center; gap: 6px; border: none; border-radius: 8px; font-size: 12px; font-weight: 700; background: transparent; color: var(--muted); cursor: pointer; transition: all .2s; }
        .pc-view-btn.active { background: var(--teal); color: #fff; }
        .pc-view-btn:hover:not(.active) { color: var(--teal); background: #f8fafc; }

        .pc-cat-rail { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 36px; scrollbar-width: none; }
        .pc-cat-rail::-webkit-scrollbar { display: none; }
        .pc-cat-pill { flex-shrink: 0; padding: 9px 18px; border-radius: 50px; font-size: 13px; font-weight: 700; border: 1.5px solid var(--card-border); background: #fff; color: #475569; cursor: pointer; transition: all .2s; white-space: nowrap; }
        .pc-cat-pill.active { background: var(--teal); border-color: var(--teal); color: #fff; box-shadow: 0 4px 14px rgba(13,115,119,.35); }

        /* Gallery Grid Layout */
        .pc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
        .pc-card { background: #fff; border-radius: 22px; border: 1.5px solid var(--card-border); overflow: hidden; cursor: pointer; transition: all .25s cubic-bezier(.34,1.56,.64,1); position: relative; display: flex; flex-direction: column; }
        .pc-card:hover { transform: translateY(-5px); box-shadow: 0 20px 48px rgba(13,115,119,.13); border-color: var(--teal); }
        .pc-card-img { height: 200px; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-size: 64px; position: relative; overflow: hidden; }
        .pc-card-img img { width: 100%; height: 100%; object-fit: cover; }
        .pc-card-type { position: absolute; top: 14px; right: 14px; padding: 5px 12px; border-radius: 8px; font-size: 10px; font-weight: 900; letter-spacing: .5px; text-transform: uppercase; }
        .pc-card-type.permanent { background: #d1fae5; color: #065f46; }
        .pc-card-type.lease { background: #fef3c7; color: #92400e; }
        .pc-card-body { padding: 20px 22px 22px; display: flex; flex-direction: column; flex: 1; }
        .pc-card-eyebrow { font-size: 10px; font-weight: 800; color: var(--teal); text-transform: uppercase; letter-spacing: .8px; margin-bottom: 6px; }
        .pc-card-name { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 8px; line-height: 1.25; }
        .pc-card-desc { font-size: 13px; color: var(--muted); line-height: 1.5; margin-bottom: 16px; flex: 1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .pc-card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
        .pc-avail { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 20px; }
        .pc-request-btn { display: flex; align-items: center; gap: 6px; padding: 9px 16px; background: var(--teal); color: #fff; border: none; border-radius: 10px; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 700; cursor: pointer; transition: all .2s; }
        .pc-request-btn:hover { background: var(--teal-hover); transform: translateY(-1px); box-shadow: 0 4px 14px rgba(13,115,119,.35); }

        /* Table View Layout */
        .pc-table-wrap { background: #fff; border: 1.5px solid var(--card-border); border-radius: 20px; overflow: hidden; margin-top: 16px; }
        .pc-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13.5px; }
        .pc-table th { background: #f8fafc; padding: 16px 20px; font-weight: 800; color: #475569; border-bottom: 1.5px solid var(--card-border); text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
        .pc-table td { padding: 16px 20px; border-bottom: 1px solid var(--card-border); color: #334155; }
        .pc-table tr:last-child td { border-bottom: none; }
        .pc-table tr:hover td { background: #f8fafc; }
        .pc-table-badge { display: inline-block; padding: 4px 10px; borderRadius: 6px; fontSize: 11px; fontWeight: 700; }
        .pc-table-badge.permanent { background: #e6fcf5; color: #0ca678; }
        .pc-table-badge.lease { background: #fff9db; color: #f59f00; }

        /* Barcodes Grid Print View */
        .pc-barcodes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
        .pc-barcode-tile { background: #fff; border: 1.5px solid var(--card-border); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .pc-barcode-title { font-size: 13px; font-weight: 800; margin-bottom: 8px; color: var(--dark); height: 38px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

        .pc-empty { text-align: center; padding: 100px 24px; }
        .pc-empty-icon { font-size: 64px; margin-bottom: 16px; }
        .pc-empty h3 { font-size: 20px; font-weight: 800; color: #1e293b; margin-bottom: 8px; }
        .pc-empty p { font-size: 14px; color: var(--muted); }

        .pc-skeleton { background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 22px; height: 360px; }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

        .pc-footer { background: #0f172a; color: #94a3b8; text-align: center; padding: 40px 24px; font-size: 13px; margin-top: 80px; }
        .pc-footer strong { color: #fff; }
        .pc-footer-links { display: flex; justify-content: center; gap: 24px; margin-top: 16px; flex-wrap: wrap; }
        .pc-footer-link { color: #94a3b8; text-decoration: none; font-size: 12px; transition: color .2s; }
        .pc-footer-link:hover { color: var(--teal); }

        @media print {
          body { background: #fff; color: #000; font-size: 12px; }
          .pc-nav, .pc-hero, .pc-cat-rail, .pc-section-head, .pc-footer, .pc-request-btn, .pc-view-switchers { display: none !important; }
          .pc-main { padding: 0 !important; max-width: 100% !important; }
          .pc-barcodes-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 10px !important; }
          .pc-barcode-tile { border: 1px solid #000 !important; border-radius: 0 !important; page-break-inside: avoid; }
        }

        @media (max-width: 640px) {
          .pc-hero { padding: 48px 16px 56px; }
          .pc-main { padding: 32px 16px; }
          .pc-grid { grid-template-columns: 1fr; }
          .pc-nav-inner { padding: 0 16px; }
        }
      `}</style>

      {/* NAV */}
      <nav className="pc-nav">
        <div className="pc-nav-inner">
          <a href="/" className="pc-logo">
            <div className="pc-logo-mark">🌿</div>
            <div>
              <div className="pc-logo-name">SKSSF Portal</div>
              <div className="pc-logo-sub">SAMASTHA KERALA SUNNI STUDENTS FEDERATION</div>
            </div>
          </a>
          <a href="/member/login" className="pc-nav-login">
            Member Login <ArrowRight size={14} />
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section className="pc-hero">
        <div className="pc-hero-tag">
          <span className="pc-hero-dot" />
          <span>Community Resource Catalog</span>
        </div>
        <h1>Browse Our <em>Resource</em><br />Catalog</h1>
        <p>
          Explore available supplies, equipment, and aid packages managed by SKSSF.
          Filter by category and request items directly via WhatsApp.
        </p>
        <div className="pc-search-wrap">
          <Search size={18} className="pc-search-icon" />
          <input
            type="text"
            className="pc-search-input"
            placeholder="Search by item name..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
      </section>

      {/* MAIN */}
      <main className="pc-main">

        {/* Category filter rail */}
        <div className="pc-cat-rail">
          <button
            className={`pc-cat-pill ${selectedCategory === '' ? 'active' : ''}`}
            onClick={() => handleCategory('')}
          >
            All Items
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`pc-cat-pill ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => handleCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Section header */}
        <div className="pc-section-head">
          <div>
            <div className="pc-section-title">
              {selectedCategory
                ? categories.find(c => c.id === selectedCategory)?.name || 'Items'
                : 'All Resources'}
            </div>
            {!loading && (
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                {items.length} item{items.length !== 1 ? 's' : ''} found
              </div>
            )}
          </div>

          {/* View Toggles & Print options */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {viewMode === 'barcodes' && (
              <button 
                onClick={handlePrintBarcodes} 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', border: '1.5px solid var(--card-border)', background: '#fff', borderRadius: '12px', fontSize: '12.5px', fontWeight: 800, color: 'var(--teal)', cursor: 'pointer' }}
              >
                <Printer size={14} /> Print Labels
              </button>
            )}
            <div className="pc-view-switchers">
              <button className={`pc-view-btn ${viewMode === 'gallery' ? 'active' : ''}`} onClick={() => setViewMode('gallery')}>
                <Grid size={14} /> Gallery
              </button>
              <button className={`pc-view-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>
                <List size={14} /> Table
              </button>
              <button className={`pc-view-btn ${viewMode === 'barcodes' ? 'active' : ''}`} onClick={() => setViewMode('barcodes')}>
                <BarcodeIcon size={14} /> Barcodes
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="pc-grid">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="pc-skeleton" />)}
          </div>
        ) : error ? (
          <div className="pc-empty">
            <div className="pc-empty-icon">⚠️</div>
            <h3>Could not load catalog</h3>
            <p>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="pc-empty">
            <div className="pc-empty-icon">📦</div>
            <h3>No items found</h3>
            <p>
              {search
                ? `No results for "${search}". Try a different search term.`
                : 'No items are currently available in this category.'}
            </p>
          </div>
        ) : (
          <>
            {/* ① GALLERY VIEW */}
            {viewMode === 'gallery' && (
              <div className="pc-grid">
                {items.map(item => {
                  const avail = availabilityInfo(item);
                  return (
                    <div
                      key={item.id}
                      className="pc-card"
                      onClick={() => navigate(`/catalog/${item.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && navigate(`/catalog/${item.id}`)}
                    >
                      <div className="pc-card-img">
                        {item.photo_url ? (
                          <img src={item.photo_url} alt={item.name} />
                        ) : (
                          item.item_type === 'lease' ? '🛠️' : '📦'
                        )}
                        <span className={`pc-card-type ${item.item_type}`}>
                          {item.item_type === 'permanent' ? 'Permanent' : 'Lease'}
                        </span>
                      </div>

                      <div className="pc-card-body">
                        <div className="pc-card-eyebrow">{item.categories?.name || 'General'}</div>
                        <div className="pc-card-name">{item.name}</div>
                        <div className="pc-card-desc">
                          {item.public_description || 'Community resource item. Click to view details and request.'}
                        </div>

                        <div className="pc-card-footer">
                          <div
                            className="pc-avail"
                            style={{ background: avail.bg, color: avail.color }}
                          >
                            <AvailIcon type={avail.icon} size={12} />
                            {avail.label}
                          </div>
                          <button
                            className="pc-request-btn"
                            onClick={e => { e.stopPropagation(); handleRequest(item); }}
                          >
                            📲 Request
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
              <div className="pc-table-wrap">
                <table className="pc-table">
                  <thead>
                    <tr>
                      <th>Product Info</th>
                      <th>Category</th>
                      <th>Barcode SKU</th>
                      <th>Status</th>
                      <th>Availability</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const avail = availabilityInfo(item);
                      return (
                        <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/catalog/${item.id}`)}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', overflow: 'hidden' }}>
                                {item.photo_url ? <img src={item.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (item.item_type === 'lease' ? '🛠️' : '📦')}
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, color: '#1e293b' }}>{item.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{item.item_type === 'permanent' ? 'Permanent Grant' : 'Lease'}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#475569' }}>{item.categories?.name || 'General'}</span>
                          </td>
                          <td style={{ minWidth: '150px' }}>
                            {item.barcode_value ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <BarcodeSVG value={item.barcode_value} />
                              </div>
                            ) : '—'}
                          </td>
                          <td>
                            <span className={`pc-table-badge ${item.item_type}`}>
                              {item.item_type === 'permanent' ? 'Permanent' : 'Lease'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: avail.color }}>
                              <AvailIcon type={avail.icon} size={14} />
                              {item.available_stock} / {item.total_stock} Available
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                            <button
                              className="pc-request-btn"
                              style={{ display: 'inline-flex', padding: '8px 14px' }}
                              onClick={() => handleRequest(item)}
                            >
                              📲 Request
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ③ BARCODES PRINT VIEW */}
            {viewMode === 'barcodes' && (
              <div className="pc-barcodes-grid">
                {items.map(item => (
                  <div key={item.id} className="pc-barcode-tile">
                    <div style={{ fontSize: '9px', fontWeight: 900, color: 'var(--teal)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>
                      SKSSF COMMUNITY SERVICE
                    </div>
                    <div className="pc-barcode-title">{item.name}</div>
                    {item.barcode_value ? (
                      <BarcodeSVG value={item.barcode_value} />
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>No Barcode</span>
                    )}
                    <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, marginTop: '4px' }}>
                      {item.categories?.name || 'General'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* FOOTER */}
      <footer className="pc-footer">
        <strong>SKSSF Community Resource Portal</strong>
        <p style={{ marginTop: 8 }}>Samastha Kerala Sunni Students Federation · All resources are subject to availability</p>
        <div className="pc-footer-links">
          <a href="/" className="pc-footer-link">Portal Home</a>
          <a href="/member/login" className="pc-footer-link">Member Login</a>
          <a href="/admin/login" className="pc-footer-link">Admin Login</a>
        </div>
      </footer>
    </>
  );
}
