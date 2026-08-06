import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Copy, Share2, ExternalLink, QrCode, Download, Check, MessageSquare, Inbox, Send, ShieldAlert, PlusCircle } from 'lucide-react';

export default function LoanApplication() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [memberCode, setMemberCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const qrRef = useRef<HTMLImageElement | null>(null);

  // Link Stats
  const [stats, setStats] = useState({
    totalReceived: 0,
    pendingInbox: 0,
    submittedToAdmin: 0
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (profile) {
      const code = profile.member_unique_code || profile.member_code || `MBR-${(profile.db_id || profile.id || '001').slice(0, 4).toUpperCase()}`;
      setMemberCode(code);
      loadLinkStats(profile.db_id || profile.id);
    }
  }, [profile]);

  async function loadLinkStats(memberId: string) {
    try {
      const { data, error } = await supabase
        .from('loan_requests')
        .select('id, status')
        .or(`member_id.eq.${memberId},referred_member_id.eq.${memberId}`);

      if (error) throw error;

      const total = (data || []).length;
      const pending = (data || []).filter(r => r.status === 'NEW' || r.status === 'REVIEWED' || r.status === 'DRAFT_UNASSIGNED' || r.status === 'DRAFT').length;
      const submitted = (data || []).filter(r => r.status === 'SUBMITTED' || r.status === 'CONVERTED').length;

      setStats({
        totalReceived: total,
        pendingInbox: pending,
        submittedToAdmin: submitted
      });
    } catch (err) {
      console.error('Error loading link stats:', err);
    }
  }

  // Construct full request URL
  const requestUrl = memberCode
    ? `${window.location.origin}/request/${memberCode}`
    : `${window.location.origin}/request`;

  // QR Code URL via QuickChart API
  const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(requestUrl)}&size=240&margin=2`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(requestUrl);
    setCopied(true);
    showToast('Link copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadQr = () => {
    const link = document.createElement('a');
    link.href = qrImageUrl;
    link.download = `SKSSF_Request_QR_${memberCode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('QR Code download started!');
  };

  const shareText = `Apply for an SKSSF Loan directly through my representative link: ${requestUrl}`;

  const handleWhatsAppShare = () => {
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, '_blank');
  };

  const handleSmsShare = () => {
    const smsUrl = `sms:?body=${encodeURIComponent(shareText)}`;
    window.open(smsUrl, '_blank');
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 2000, background: '#0f172a', color: '#fff', padding: '14px 24px', borderRadius: '16px', fontWeight: 700, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
          ✅ {toast}
        </div>
      )}

      {/* Header */}
      <div className="pg-hd" style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 className="pg-title" style={{ fontSize: '26px', fontWeight: 950, color: '#0f172a', margin: 0 }}>
          Share Your Loan Application Link
        </h1>
        <p className="pg-sub" style={{ fontSize: '14px', color: '#64748b', marginTop: '6px', maxWidth: '560px', margin: '6px auto 0' }}>
          Share this unique link with anyone who wants to apply for an SKSSF loan through you. When they fill the form, their application will land directly in your inbox.
        </p>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
        <div className="card" style={{ padding: '20px', textAlign: 'center', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total Applications Received</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: 'var(--teal)', marginTop: '4px' }}>{stats.totalReceived}</div>
        </div>
        <div className="card" style={{ padding: '20px', textAlign: 'center', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Pending in Inbox</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#f59e0b', marginTop: '4px' }}>{stats.pendingInbox}</div>
        </div>
        <div className="card" style={{ padding: '20px', textAlign: 'center', borderRadius: '20px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Submitted to Admin</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#10b981', marginTop: '4px' }}>{stats.submittedToAdmin}</div>
        </div>
      </div>

      {/* Main Link Display Card */}
      <div className="card" style={{ padding: '32px', borderRadius: '24px', background: '#fff', border: '1.5px solid #e2e8f0', boxShadow: '0 20px 40px rgba(0,0,0,0.03)', marginBottom: '28px' }}>
        
        <div style={{ fontSize: '13px', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>
          YOUR UNIQUE APPLICANT REQUEST LINK
        </div>

        {/* Input Box + Copy Button */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <input
            type="text"
            readOnly
            value={requestUrl}
            className="fi2"
            style={{ flex: 1, minWidth: '260px', padding: '14px 18px', fontSize: '15px', fontWeight: 800, color: 'var(--teal)', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '16px' }}
          />
          <button
            onClick={handleCopyLink}
            className="bsm s"
            style={{ padding: '14px 24px', borderRadius: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', background: copied ? '#10b981' : '#0f172a' }}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        {/* Action Buttons Row */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '28px' }}>
          <button
            onClick={handleWhatsAppShare}
            style={{ flex: 1, padding: '12px 18px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px' }}
          >
            <MessageSquare size={16} /> Share via WhatsApp
          </button>

          <button
            onClick={handleSmsShare}
            style={{ flex: 1, padding: '12px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px' }}
          >
            <Send size={16} /> Share via SMS
          </button>

          <a
            href={requestUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: '12px 18px', background: '#f1f5f9', color: '#334155', borderRadius: '14px', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px' }}
          >
            <ExternalLink size={16} /> Preview Form
          </a>
        </div>

        {/* QR Code Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', background: '#f8fafc', padding: '24px', borderRadius: '20px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <div style={{ background: '#fff', padding: '12px', borderRadius: '16px', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <img
              ref={qrRef}
              src={qrImageUrl}
              alt="Applicant Request QR Code"
              style={{ width: '140px', height: '140px', display: 'block' }}
            />
          </div>

          <div style={{ flex: 1, minWidth: '220px' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>Scan & Share QR Code</h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
              Applicants can scan this QR code directly using their mobile camera to open your loan application form instantly.
            </p>

            <button
              onClick={handleDownloadQr}
              className="bsm g"
              style={{ marginTop: '14px', padding: '10px 18px', borderRadius: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
            >
              <Download size={16} /> Download QR Code (PNG)
            </button>
          </div>
        </div>

      </div>

      {/* Nav to Inbox */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={() => navigate('/member/dashboard/inbox')}
          style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, cursor: 'pointer', fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Inbox size={16} /> Go to Applications Inbox →
        </button>
      </div>

    </div>
  );
}
