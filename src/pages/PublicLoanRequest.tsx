import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Phone, MapPin, IndianRupee, Briefcase, FileText, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';

export default function PublicLoanRequest() {
  const { member_code } = useParams<{ member_code: string }>();
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
  const [category, setCategory] = useState('personal');
  const [detail, setDetail] = useState('');
  const [income, setIncome] = useState('');
  const [dependents, setDependents] = useState('0');
  const [hasLoans, setHasLoans] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [hasCollateral, setHasCollateral] = useState(false);
  const [collateralDesc, setCollateralDesc] = useState('');
  const [tenure, setTenure] = useState('12');
  const [documentUrl, setDocumentUrl] = useState('');

  useEffect(() => {
    async function loadMember() {
      if (!member_code) {
        setError('No member link provided.');
        setLoading(false);
        return;
      }
      try {
        const res = await api.get<any>(`/request/${member_code}`);
        if (res && res.data) {
          setMember(res.data);
        } else {
          setError('Invalid helper link. Please check the URL.');
        }
      } catch (err: any) {
        setError('Invalid helper link or helper not found.');
      } finally {
        setLoading(false);
      }
    }
    loadMember();
  }, [member_code]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setDocumentUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !address || !amount || !income) {
      alert('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        member_id: member.id,
        requester_name: name,
        requester_phone: phone,
        requester_address: address,
        loan_amount_requested: parseFloat(amount),
        loan_purpose_category: category,
        loan_purpose_detail: detail,
        monthly_income: parseFloat(income),
        dependents_count: parseInt(dependents) || 0,
        has_existing_loans: hasLoans,
        existing_loan_amount: hasLoans ? parseFloat(loanAmount) || 0 : 0,
        has_collateral: hasCollateral,
        collateral_description: hasCollateral ? collateralDesc : '',
        preferred_tenure_months: parseInt(tenure) || 12,
        document_url: documentUrl,
        status: 'new'
      };

      await api.post('/member/inbox', payload);
      setSuccess(true);
    } catch (err: any) {
      alert(err.message || 'Failed to submit loan request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--slate-50)' }}>
        <div style={{ fontSize: '16px', color: 'var(--slate-600)', fontWeight: 600 }}>Loading member portal...</div>
      </div>
    );
  }

  if (error || !member) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        <div style={{ background: '#fff', padding: '40px', borderRadius: '24px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)', maxWidth: '480px', width: '100%', textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <div style={{ background: '#fef2f2', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <AlertCircle size={32} color="#ef4444" />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', marginBottom: '12px' }}>Link Invalid or Expired</h1>
          <p style={{ fontSize: '14.5px', color: '#64748b', lineHeight: 1.6, marginBottom: '32px' }}>
            {error || 'This loan requester form is not linked to any active member.'}
          </p>
          <button onClick={() => navigate('/')} style={{ background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}>
            <ArrowLeft size={16} /> Back to Homepage
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        <div style={{ background: '#fff', padding: '40px', borderRadius: '24px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)', maxWidth: '540px', width: '100%', textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <div style={{ background: '#ecfdf5', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle size={32} color="#10b981" />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', marginBottom: '12px' }}>Request Filed Successfully!</h1>
          <p style={{ fontSize: '15px', color: '#475569', lineHeight: 1.6, marginBottom: '20px' }}>
            Thank you. Your loan request has been successfully queued in the inbox of helper <b>{member.name}</b> ({member.branch || 'Local Branch'}).
          </p>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', textAlign: 'left', marginBottom: '32px' }}>
            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>What happens next?</div>
            <ol style={{ fontSize: '13.5px', color: '#334155', paddingLeft: '20px', lineHeight: 1.6, margin: 0 }}>
              <li style={{ marginBottom: '6px' }}>The helper will review your request details and documents.</li>
              <li style={{ marginBottom: '6px' }}>If everything is in order, the helper will forward your request directly to the branch coordinator queue.</li>
              <li>You will receive a phone call updates on the number <b>{phone}</b>.</li>
            </ol>
          </div>
          <button onClick={() => navigate('/')} style={{ background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '12px', padding: '12px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <ArrowLeft size={16} /> Return to Homepage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', padding: '40px 16px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-block', background: 'var(--teal-pale)', color: 'var(--teal)', padding: '6px 16px', borderRadius: '20px', fontSize: '12.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
            SKSSF eGov Portal
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 950, color: '#0f172a', margin: 0 }}>Submit Loan Request</h1>
          <p style={{ fontSize: '14.5px', color: '#64748b', marginTop: '6px' }}>
            Filing on behalf of helper: <span style={{ color: 'var(--teal)', fontWeight: 700 }}>{member.name}</span> ({member.branch})
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: '24px', padding: '32px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px' }}>Requester Profile Details</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#344054', display: 'block', marginBottom: '6px' }}>Full Name *</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '10px', color: '#98a2b3' }}><User size={16} /></span>
                <input className="fi" required placeholder="Faris Rahman" value={name} onChange={e => setName(e.target.value)} style={{ paddingLeft: '38px', borderRadius: '10px' }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#344054', display: 'block', marginBottom: '6px' }}>Mobile Number *</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '10px', color: '#98a2b3' }}><Phone size={16} /></span>
                <input className="fi" required type="tel" placeholder="+91 XXXXX XXXXX" value={phone} onChange={e => setPhone(e.target.value)} style={{ paddingLeft: '38px', borderRadius: '10px' }} />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ fontSize: '13px', fontWeight: 700, color: '#344054', display: 'block', marginBottom: '6px' }}>Full Address *</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '10px', color: '#98a2b3' }}><MapPin size={16} /></span>
              <textarea required placeholder="House Name, Street, Post Office, PIN Code" value={address} onChange={e => setAddress(e.target.value)} style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: '10px', border: '1.5px solid #e2e8f0', minHeight: '80px', fontSize: '14px', outline: 'none' }}></textarea>
            </div>
          </div>

          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px' }}>Request Particulars</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#344054', display: 'block', marginBottom: '6px' }}>Requested Amount (₹) *</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '10px', color: '#98a2b3' }}><IndianRupee size={15} /></span>
                <input className="fi" required type="number" placeholder="e.g. 25000" value={amount} onChange={e => setAmount(e.target.value)} style={{ paddingLeft: '38px', borderRadius: '10px' }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#344054', display: 'block', marginBottom: '6px' }}>Purpose Category *</label>
              <select className="fi" value={category} onChange={e => setCategory(e.target.value)} style={{ borderRadius: '10px', height: '39px', padding: '0 10px' }}>
                <option value="medical">Medical Treatment 🏥</option>
                <option value="education">Education Fees 🎓</option>
                <option value="business">Small Business Startup 💼</option>
                <option value="housing">House Repair 🏠</option>
                <option value="personal">Personal Urgent Need 🔑</option>
                <option value="other">Other Needs 📝</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '13px', fontWeight: 700, color: '#344054', display: 'block', marginBottom: '6px' }}>Purpose Specifics (Optional)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '10px', color: '#98a2b3' }}><FileText size={16} /></span>
              <textarea placeholder="Please describe exactly what this loan support will be used for..." value={detail} onChange={e => setDetail(e.target.value)} style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: '10px', border: '1.5px solid #e2e8f0', minHeight: '60px', fontSize: '14px', outline: 'none' }}></textarea>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#344054', display: 'block', marginBottom: '6px' }}>Monthly Household Income (₹) *</label>
              <input className="fi" required type="number" placeholder="e.g. 15000" value={income} onChange={e => setIncome(e.target.value)} style={{ borderRadius: '10px' }} />
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#344054', display: 'block', marginBottom: '6px' }}>Number of Dependents</label>
              <input className="fi" type="number" min="0" value={dependents} onChange={e => setDependents(e.target.value)} style={{ borderRadius: '10px' }} />
            </div>
          </div>

          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px' }}>Additional Status</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <input type="checkbox" id="hasLoansCheck" checked={hasLoans} onChange={e => setHasLoans(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                <label htmlFor="hasLoansCheck" style={{ fontSize: '13.5px', fontWeight: 700, color: '#344054', cursor: 'pointer' }}>Do you have other active loans?</label>
              </div>
              {hasLoans && (
                <input className="fi" type="number" placeholder="Outstanding Loan Amount (₹)" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} style={{ borderRadius: '10px' }} />
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <input type="checkbox" id="hasCollateralCheck" checked={hasCollateral} onChange={e => setHasCollateral(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                <label htmlFor="hasCollateralCheck" style={{ fontSize: '13.5px', fontWeight: 700, color: '#344054', cursor: 'pointer' }}>Can you offer collateral support?</label>
              </div>
              {hasCollateral && (
                <input className="fi" placeholder="e.g. Gold, Land documents, etc." value={collateralDesc} onChange={e => setCollateralDesc(e.target.value)} style={{ borderRadius: '10px' }} />
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#344054', display: 'block', marginBottom: '6px' }}>Preferred Repayment Tenure (Months)</label>
              <select className="fi" value={tenure} onChange={e => setTenure(e.target.value)} style={{ borderRadius: '10px', height: '39px', padding: '0 10px' }}>
                <option value="6">6 Months</option>
                <option value="12">12 Months (Default)</option>
                <option value="18">18 Months</option>
                <option value="24">24 Months</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#344054', display: 'block', marginBottom: '6px' }}>Upload Support Documents (Optional)</label>
              <input type="file" accept="image/*,application/pdf" onChange={handleFileChange} style={{ fontSize: '12px', marginTop: '6px' }} />
            </div>
          </div>

          <button type="submit" disabled={submitting} style={{ width: '100%', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '14px', padding: '14px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
            {submitting ? 'Submitting request...' : 'File Loan Request →'}
          </button>
        </form>
      </div>
    </div>
  );
}
