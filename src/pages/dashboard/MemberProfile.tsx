import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { User, Mail, Phone, MapPin, Copy, Check } from 'lucide-react';

export default function MemberProfile() {
  const { profile, refreshProfile } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bio, setBio] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({
    filed: 0,
    approved: 0,
    repaymentsCount: 0
  });
  const [toast, setToast] = useState<{ type: 's' | 'e'; msg: string } | null>(null);

  const showToast = (type: 's' | 'e', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (profile) {
      setPhoneNumber(profile.phone || '');
      setBio(profile.bio || '');

      // Load stats
      async function loadStats() {
        try {
          const { count: filedCount } = await supabase
            .from('loans')
            .select('*', { count: 'exact', head: true })
            .eq('submitted_by_member_id', profile.db_id || profile.id);

          const { count: approvedCount } = await supabase
            .from('loans')
            .select('*', { count: 'exact', head: true })
            .eq('submitted_by_member_id', profile.db_id || profile.id)
            .eq('workflow_status', 'APPROVED');

          const { count: repCount } = await supabase
            .from('repayment_installments')
            .select('*, loans!inner(*)', { count: 'exact', head: true })
            .eq('loans.submitted_by_member_id', profile.db_id || profile.id)
            .eq('status', 'PAID');

          setStats({
            filed: filedCount || 0,
            approved: approvedCount || 0,
            repaymentsCount: repCount || 0
          });
        } catch (err) {
          console.error('Failed to load profile stats:', err);
        }
      }
      loadStats();
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          phone: phoneNumber.trim(),
          bio: bio.trim()
        })
        .eq('id', profile?.auth_uid || profile?.id);

      if (error) throw error;
      showToast('s', 'Profile updated successfully!');
      refreshProfile();
    } catch (err: any) {
      showToast('e', err.message || 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  const shareUrl = `${window.location.origin}/request/${profile?.member_unique_code || 'MBR-N/A'}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 1000, background: toast.type === 's' ? '#0f172a' : 'var(--red)', color: '#fff', padding: '14px 24px', borderRadius: '16px', fontWeight: 700, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {toast.type === 's' ? '✅' : '⚠️'} {toast.msg}
        </div>
      )}

      <h1 className="pg-title" style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', marginBottom: '24px' }}>My Public Profile</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px', flexWrap: 'wrap' }}>
        
        {/* Left Side: Profile Edit & Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Main User Panel */}
          <div className="card" style={{ padding: '28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal) 0%, var(--teal2) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', color: '#fff', fontWeight: 900 }}>
              {profile?.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 900, margin: 0 }}>{profile?.name}</h2>
              <span className="bdg bdg-a" style={{ marginTop: '6px', display: 'inline-block' }}>HELPER MEMBER</span>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Member Code: <b>{profile?.member_unique_code || 'MBR-N/A'}</b></div>
            </div>
          </div>

          {/* Stats Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {[
              { label: 'Loans Filed', value: stats.filed },
              { label: 'Loans Approved', value: stats.approved },
              { label: 'Repayments Logged', value: stats.repaymentsCount }
            ].map((s, i) => (
              <div key={i} className="card" style={{ padding: '16px', borderRadius: '16px', background: '#fff', border: '1.5px solid #f1f5f9', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 950, color: 'var(--teal)' }}>{s.value}</div>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginTop: '4px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Edit Form */}
          <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: 900 }}>Edit Contact details</h3>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2">Phone Number</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }}><Phone size={16} /></span>
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="fi2"
                    style={{ paddingLeft: '40px', width: '100%' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="fl2">Bio / Remarks</label>
                <textarea
                  placeholder="Tell us about yourself or your unit role..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="ta2"
                  rows={4}
                />
              </div>

              <button type="submit" disabled={saving} className="bsm s" style={{ padding: '12px', alignSelf: 'flex-start' }}>
                Save Profile Updates
              </button>
            </form>
          </div>

        </div>

        {/* Right Side: QR Code & Share Link */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 900 }}>Share Public Link</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Requesters can use this code link to submit loan requests directly to your inbox.</p>
            
            {/* QR display */}
            <div style={{ width: '180px', height: '180px', margin: '0 auto 20px', padding: '10px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareUrl)}`}
                alt="QR Code Link"
                style={{ width: '100%', height: '100%' }}
              />
            </div>

            {/* Link Copy Bar */}
            <div style={{ display: 'flex', gap: '8px', background: '#f8fafc', padding: '8px 12px', borderRadius: '12px', border: '1px solid #e2e8f0', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                {shareUrl}
              </span>
              <button
                onClick={handleCopy}
                style={{ background: copied ? '#10b981' : 'var(--teal)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
