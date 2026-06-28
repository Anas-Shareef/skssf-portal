import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Phone, MapPin, IndianRupee, HelpCircle, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabaseClient';

export default function PublicLoanRequest() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [referredMemberName, setReferredMemberName] = useState('');

  useEffect(() => {
    async function loadMember() {
      if (!code) {
        setLoading(false);
        return;
      }
      try {
        // Fetch referred member by code
        const { data, error: fetchErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('member_unique_code', code)
          .single();

        if (fetchErr || !data) {
          setError('Invalid helper link. Please check the URL.');
        } else {
          setMember(data);
          setReferredMemberName(data.name);
        }
      } catch (err: any) {
        setError('Invalid helper link or helper not found.');
      } finally {
        setLoading(false);
      }
    }
    loadMember();
  }, [code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !address.trim() || !amount.trim() || !reason.trim()) {
      alert('Please fill in all required fields.');
      return;
    }
    if (reason.trim().length < 20) {
      alert('Reason for loan must be at least 20 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        requester_name: name.trim(),
        requester_phone: phone.trim(),
        requester_address: address.trim(),
        approximate_amount: parseFloat(amount),
        reason: reason.trim(),
        referred_member_name: referredMemberName.trim() || (member ? member.name : ''),
        referred_member_id: member ? member.db_id || member.id : null,
        status: 'DRAFT_UNASSIGNED'
      };

      await api.post('/member/inbox', payload);
      setSuccess(true);
    } catch (err: any) {
      alert(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc', color: 'var(--teal)' }}>
        <div className="spinner">Loading Public Loan Portal...</div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc', padding: '20px' }}>
        <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '40px 24px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 20px 40px rgba(0,0,0,0.03)' }}>
          <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', margin: '0 auto 20px' }}>
            <CheckCircle size={36} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Request Submitted</h2>
          <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.5, marginTop: '12px' }}>
            Your preliminary loan request has been successfully queued. An SKSSF helper member will review your details and contact you for verification shortly.
          </p>
          <button onClick={() => navigate('/')} className="bsm s" style={{ marginTop: '24px', width: '100%', padding: '12px' }}>
            Return to Portal Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      
      {/* Back to Portal Selector */}
      <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#64748b', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', alignSelf: 'center' }}>
        <ArrowLeft size={16} /> Back to Portal Home
      </button>

      <div className="card" style={{ maxWidth: '580px', width: '100%', padding: '32px 24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 20px 40px rgba(0,0,0,0.02)' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 950, color: '#0f172a', margin: 0 }}>SKSSF Public Loan Portal</h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Submit a preliminary request. No login credentials required.</p>
          
          {member && (
            <div style={{ marginTop: '14px', padding: '8px 16px', background: 'rgba(13,115,119,0.06)', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--teal)', fontSize: '13px', fontWeight: 800 }}>
              <span>📍</span> Referred by Helper Member: <b>{member.name}</b>
            </div>
          )}
        </div>

        {error ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fef2f2', border: '1.5px solid #fecaca', padding: '16px', borderRadius: '16px', color: '#991b1b', marginBottom: '20px' }}>
            <AlertCircle size={20} />
            <div style={{ fontSize: '13px', fontWeight: 800 }}>{error}</div>
          </div>
        ) : null}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label className="fl2" style={{ fontWeight: 800 }}>Full Name *</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }}><User size={16} /></span>
              <input
                type="text"
                placeholder="Enter your complete legal name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="fi2"
                style={{ paddingLeft: '40px', width: '100%' }}
                required
              />
            </div>
          </div>

          <div>
            <label className="fl2" style={{ fontWeight: 800 }}>Phone Number *</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }}><Phone size={16} /></span>
              <input
                type="text"
                placeholder="Enter active WhatsApp or mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="fi2"
                style={{ paddingLeft: '40px', width: '100%' }}
                required
              />
            </div>
          </div>

          <div>
            <label className="fl2" style={{ fontWeight: 800 }}>Home Address *</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }}><MapPin size={16} /></span>
              <textarea
                placeholder="Complete street address for verification visits"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="ta2"
                style={{ paddingLeft: '40px', width: '100%' }}
                rows={3}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <label className="fl2" style={{ fontWeight: 800 }}>Approximate Amount *</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }}><IndianRupee size={16} /></span>
                <input
                  type="number"
                  placeholder="₹ Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="fi2"
                  style={{ paddingLeft: '40px', width: '100%' }}
                  required
                />
              </div>
            </div>

            {!member && (
              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Referring Member Name</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }}><HelpCircle size={16} /></span>
                  <input
                    type="text"
                    placeholder="Helper Name (Optional)"
                    value={referredMemberName}
                    onChange={(e) => setReferredMemberName(e.target.value)}
                    className="fi2"
                    style={{ paddingLeft: '40px', width: '100%' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="fl2" style={{ fontWeight: 800 }}>Reason for Loan *</label>
            <textarea
              placeholder="Provide detail on why the loan is required. Minimum 20 characters."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="ta2"
              rows={4}
              required
            />
            <div style={{ fontSize: '11px', color: reason.trim().length < 20 ? 'var(--red)' : '#64748b', fontWeight: 700, alignSelf: 'flex-end', marginTop: '4px', textAlign: 'right' }}>
              {reason.trim().length}/20 chars min
            </div>
          </div>

          <button type="submit" disabled={submitting || reason.trim().length < 20} className="bsm s" style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: 900, marginTop: '10px' }}>
            {submitting ? 'Submitting Application...' : 'Submit Loan Request'}
          </button>
        </form>

      </div>
    </div>
  );
}
