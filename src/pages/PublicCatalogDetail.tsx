import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, AlertCircle, Printer, Tag, Settings, Layers } from 'lucide-react';
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
  lease_duration_days: number | null;
  categories: { id: string; name: string } | null;
}

interface PhysicalUnit {
  id: string;
  unit_number: number;
  barcode_value: string;
  status: 'available' | 'checked_out' | 'damaged' | 'lost';
}

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

const availabilityInfo = (item: CatalogItem) => {
  const pct = item.total_stock > 0 ? item.available_stock / item.total_stock : 0;
  if (item.available_stock === 0) return { label: 'Currently Unavailable', color: '#ef4444', bg: '#fee2e2', icon: 'x' };
  if (pct <= 0.25) return { label: 'Limited Availability', color: '#f59e0b', bg: '#fef3c7', icon: 'warn' };
  return { label: 'Available Now', color: '#059669', bg: '#d1fae5', icon: 'check' };
};

const AvailIcon = ({ type, size = 16 }: { type: string; size?: number }) => {
  if (type === 'check') return <CheckCircle size={size} />;
  if (type === 'x') return <XCircle size={size} />;
  return <AlertCircle size={size} />;
};

export default function PublicCatalogDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [units, setUnits] = useState<PhysicalUnit[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'units' | 'print' | 'reviews'>('details');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [catalogRes, settingsRes] = await Promise.all([
          fetch(`/api/inventory?resource=public-catalog&id=${itemId}`),
          fetch('/api/inventory?resource=org-settings')
        ]);
        if (!catalogRes.ok) {
          setError('Item not found or not publicly available.');
          return;
        }
        const catalogData = await catalogRes.json();
        const settingsData = await settingsRes.json();
        setItem(catalogData.item);
        setUnits(catalogData.units || []);
        setReviews(catalogData.reviews || []);
        setWhatsappNumber(settingsData.settings?.catalog_whatsapp || '');
      } catch (e: any) {
        setError('Failed to load item details.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [itemId]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = sessionStorage.getItem('active_api_token') || '';
    if (!token) {
      alert('Please log in to submit a review.');
      return;
    }
    try {
      setReviewSubmitting(true);
      const res = await fetch('/api/inventory?resource=reviews', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          item_id: itemId,
          rating,
          review_text: reviewText
        })
      });
      if (res.ok) {
        alert('Thank you! Review submitted successfully.');
        setReviewText('');
        // Reload details to update reviews list
        const detailRes = await fetch(`/api/inventory?resource=public-catalog&id=${itemId}`);
        const detailData = await detailRes.json();
        setReviews(detailData.reviews || []);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to submit review');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleRequest = () => {
    if (!item) return;
    if (!whatsappNumber) {
      alert('Contact information not available. Please reach out to SKSSF directly.');
      return;
    }
    const details = [
      `📦 *${item.name}*`,
      `Category: ${item.categories?.name || 'General'}`,
      `Type: ${item.item_type === 'permanent' ? 'Permanent Grant' : 'Lease'}`,
      item.item_type === 'lease' && item.lease_duration_days
        ? `Lease Duration: ${item.lease_duration_days} days`
        : null,
    ].filter(Boolean).join('\n');

    const msg = encodeURIComponent(
      `Hello SKSSF,\n\nI would like to request the following item:\n\n${details}\n\nPlease let me know the availability and process.\n\nThank you.`
    );
    window.open(`https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${msg}`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const getUnitStatusBadge = (status: string) => {
    if (status === 'available') return { label: 'Available', color: '#059669', bg: '#e6fcf5', icon: 'check' };
    if (status === 'checked_out') return { label: 'Checked Out', color: '#1c7ed6', bg: '#e7f5ff', icon: 'out' };
    if (status === 'damaged') return { label: 'Damaged', color: '#f76707', bg: '#fff4e6', icon: 'warn' };
    return { label: 'Lost', color: '#fa5252', bg: '#fff5f5', icon: 'lost' };
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

        .pcd-nav { background: #fff; border-bottom: 1.5px solid var(--card-border); position: sticky; top: 0; z-index: 100; }
        .pcd-nav-inner { max-width: 1100px; margin: 0 auto; padding: 0 24px; height: 66px; display: flex; align-items: center; justify-content: space-between; }
        .pcd-back { display: flex; align-items: center; gap: 8px; padding: 9px 18px; background: #fff; border: 1.5px solid var(--card-border); color: #475569; border-radius: 50px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 700; cursor: pointer; transition: all .2s; text-decoration: none; }
        .pcd-back:hover { border-color: var(--teal); color: var(--teal); transform: translateX(-2px); }
        .pcd-logo-name { font-family: 'Poppins', sans-serif; font-size: 17px; font-weight: 800; color: var(--dark); }

        .pcd-main { max-width: 1100px; margin: 0 auto; padding: 48px 24px 80px; }
        .pcd-breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #94a3b8; margin-bottom: 32px; }
        .pcd-breadcrumb a { color: #94a3b8; text-decoration: none; }
        .pcd-breadcrumb a:hover { color: var(--teal); }

        /* Tabs bar */
        .pcd-tabs { display: flex; gap: 8px; border-bottom: 2px solid var(--card-border); padding-bottom: 2px; marginBottom: 32px; }
        .pcd-tab-btn { padding: 12px 24px; border: none; background: transparent; font-size: 14px; font-weight: 800; color: var(--muted); cursor: pointer; border-bottom: 3px solid transparent; display: flex; align-items: center; gap: 8px; transition: all .2s; }
        .pcd-tab-btn.active { color: var(--teal); border-bottom-color: var(--teal); }
        .pcd-tab-btn:hover:not(.active) { color: var(--teal); }

        .pcd-layout { display: grid; grid-template-columns: 1fr 440px; gap: 40px; align-items: start; }
        @media (max-width: 900px) { .pcd-layout { grid-template-columns: 1fr; } }

        .pcd-img-box { background: #fff; border-radius: 24px; border: 1.5px solid var(--card-border); overflow: hidden; aspect-ratio: 4/3; display: flex; align-items: center; justify-content: center; font-size: 96px; }
        .pcd-img-box img { width: 100%; height: 100%; object-fit: cover; }

        .pcd-info { position: sticky; top: 90px; }
        .pcd-info-card { background: #fff; border-radius: 24px; border: 1.5px solid var(--card-border); padding: 32px; }

        .pcd-eyebrow { font-size: 11px; font-weight: 800; color: var(--teal); text-transform: uppercase; letter-spacing: .8px; margin-bottom: 10px; }
        .pcd-name { font-family: 'Poppins', sans-serif; font-size: 28px; font-weight: 800; color: #0f172a; margin-bottom: 16px; line-height: 1.2; }

        .pcd-badges { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
        .pcd-badge { padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; }
        .pcd-badge.permanent { background: #d1fae5; color: #065f46; }
        .pcd-badge.lease { background: #fef3c7; color: #92400e; }
        .pcd-avail-badge { display: flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; }

        .pcd-desc { font-size: 14px; color: #475569; line-height: 1.75; margin-bottom: 24px; }

        .pcd-details-box { background: #F8F7F4; border-radius: 16px; padding: 20px; margin-bottom: 28px; }
        .pcd-details-title { font-size: 12px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 14px; }
        .pcd-detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--card-border); font-size: 13px; }
        .pcd-detail-row:last-child { border-bottom: none; }
        .pcd-detail-label { color: #64748b; font-weight: 500; }
        .pcd-detail-val { color: var(--dark); font-weight: 700; }

        .pcd-ref { font-size: 11px; color: #94a3b8; font-family: monospace; margin-bottom: 28px; }

        .pcd-request-btn { width: 100%; height: 56px; background: #25D366; color: #fff; border: none; border-radius: 16px; font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: all .2s; box-shadow: 0 6px 20px rgba(37,211,102,.35); }
        .pcd-request-btn:hover { background: #1fba59; transform: translateY(-2px); box-shadow: 0 10px 28px rgba(37,211,102,.45); }
        .pcd-request-btn:disabled { background: #e2e8f0; color: #94a3b8; cursor: default; box-shadow: none; transform: none; }

        .pcd-note { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 12px; }

        /* Units table styles */
        .pcd-units-wrap { background: #fff; border: 1.5px solid var(--card-border); border-radius: 20px; overflow: hidden; }
        .pcd-units-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13.5px; }
        .pcd-units-table th { background: #f8fafc; padding: 14px 20px; font-weight: 800; color: #475569; border-bottom: 1.5px solid var(--card-border); text-transform: uppercase; font-size: 10.5px; }
        .pcd-units-table td { padding: 14px 20px; border-bottom: 1px solid var(--card-border); color: #334155; }
        .pcd-units-table tr:last-child td { border-bottom: none; }
        .pcd-unit-status { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 700; }

        /* Labels list for print */
        .pcd-print-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-top: 16px; }
        .pcd-print-tile { background: #fff; border: 1.5px solid var(--card-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; align-items: center; text-align: center; }

        .pcd-skeleton { background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 24px; }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

        @media print {
          body { background: #fff; color: #000; }
          .pcd-nav, .pcd-breadcrumb, .pcd-tabs, .pcd-layout, footer, .pcd-back, .pcd-print-actions { display: none !important; }
          .pcd-main { padding: 0 !important; max-width: 100% !important; }
          .pcd-print-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 10px !important; }
          .pcd-print-tile { border: 1px solid #000 !important; border-radius: 0 !important; page-break-inside: avoid; }
        }
      `}</style>

      {/* NAV */}
      <nav className="pcd-nav">
        <div className="pcd-nav-inner">
          <button className="pcd-back" onClick={() => navigate('/catalog')}>
            <ArrowLeft size={14} /> Back to Catalog
          </button>
          <div className="pcd-logo-name">SKSSF Portal</div>
        </div>
      </nav>

      <main className="pcd-main">
        {/* Breadcrumb */}
        <div className="pcd-breadcrumb">
          <a href="/catalog">Catalog</a>
          <span>›</span>
          <span>{item?.categories?.name || 'Item'}</span>
          <span>›</span>
          <span style={{ color: '#475569' }}>{item?.name || '...'}</span>
        </div>



        {loading ? (
          <div className="pcd-layout">
            <div className="pcd-skeleton" style={{ aspectRatio: '4/3' }} />
            <div className="pcd-skeleton" style={{ height: 480 }} />
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🔍</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Item Not Found</h2>
            <p style={{ color: '#94a3b8', marginBottom: 24 }}>{error}</p>
            <button className="pcd-back" onClick={() => navigate('/catalog')}>
              <ArrowLeft size={14} /> Return to Catalog
            </button>
          </div>
        ) : item ? (
          <>
            {/* DETAILS */}
            {activeTab === 'details' && (
              <div className="pcd-layout">
                {/* Image */}
                <div className="pcd-img-box">
                  {item.photo_url
                    ? <img src={item.photo_url} alt={item.name} />
                    : (item.item_type === 'lease' ? '🛠️' : '📦')
                  }
                </div>

                {/* Info Panel */}
                <div className="pcd-info">
                  <div className="pcd-info-card">
                    <div className="pcd-eyebrow">{item.categories?.name || 'General'}</div>
                    <div className="pcd-name">{item.name}</div>

                    {/* Badges */}
                    <div className="pcd-badges">
                      <span className={`pcd-badge ${item.item_type}`}>
                        {item.item_type === 'permanent' ? '🟢 Permanent Grant' : '🟡 Lease'}
                      </span>
                      {(() => {
                        const avail = availabilityInfo(item);
                        return (
                          <span className="pcd-avail-badge" style={{ background: avail.bg, color: avail.color }}>
                            <AvailIcon type={avail.icon} size={13} />
                            {avail.label}
                          </span>
                        );
                      })()}
                    </div>

                    {/* Description */}
                    <p className="pcd-desc">
                      {item.public_description || 'This community resource is managed by SKSSF and available to eligible members and beneficiaries.'}
                    </p>

                    {/* Details box */}
                    <div className="pcd-details-box">
                      <div className="pcd-details-title">Item Details</div>
                      <div className="pcd-detail-row">
                        <span className="pcd-detail-label">Category</span>
                        <span className="pcd-detail-val">{item.categories?.name || '—'}</span>
                      </div>
                      <div className="pcd-detail-row">
                        <span className="pcd-detail-label">Allocation Type</span>
                        <span className="pcd-detail-val">
                          {item.item_type === 'permanent' ? 'Permanent Grant' : 'Lease / Temporary'}
                        </span>
                      </div>
                      {item.item_type === 'lease' && item.lease_duration_days && (
                        <div className="pcd-detail-row">
                          <span className="pcd-detail-label">Lease Duration</span>
                          <span className="pcd-detail-val">{item.lease_duration_days} days</span>
                        </div>
                      )}
                      <div className="pcd-detail-row">
                        <span className="pcd-detail-label">Availability</span>
                        <span className="pcd-detail-val">{availabilityInfo(item).label}</span>
                      </div>
                    </div>

                    {/* CTA */}
                    <button
                      className="pcd-request-btn"
                      onClick={handleRequest}
                      disabled={item.available_stock === 0}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      {item.available_stock === 0 ? 'Currently Unavailable' : 'Request via WhatsApp'}
                    </button>
                    <p className="pcd-note">
                      Clicking will open WhatsApp with a pre-filled message to our team.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </main>

      {/* Footer */}
      <footer style={{ background: '#0f172a', color: '#94a3b8', textAlign: 'center', padding: '32px 24px', fontSize: 13 }}>
        <strong style={{ color: '#fff' }}>SKSSF Community Resource Portal</strong>
        <p style={{ marginTop: 8 }}>All resources are subject to availability · Samastha Kerala Sunni Students Federation</p>
      </footer>
    </>
  );
}
