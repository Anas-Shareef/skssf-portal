import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Phone, MapPin, IndianRupee, CheckCircle, AlertCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function PublicLoanRequest() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refNumber, setRefNumber] = useState('');

  // Form Fields - Section A: Personal Information
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('Male');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [addressHouse, setAddressHouse] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressPin, setAddressPin] = useState('');
  const [aadhaarLast4, setAadhaarLast4] = useState('');

  // Section B: Loan Details
  const [amountRequested, setAmountRequested] = useState('');
  const [purposeCategory, setPurposeCategory] = useState('Medical');
  const [purposeDetail, setPurposeDetail] = useState('');
  const [repaymentMonths, setRepaymentMonths] = useState('12');
  const [existingDebts, setExistingDebts] = useState(false);
  const [existingDebtsDetail, setExistingDebtsDetail] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [incomeSource, setIncomeSource] = useState('');

  // Section C: Declaration
  const [declarationAgreed, setDeclarationAgreed] = useState(false);

  useEffect(() => {
    async function loadMember() {
      if (!code) {
        setLoading(false);
        return;
      }
      try {
        const cleanCode = code.trim().toUpperCase();
        
        // 1. Try serverless API resolution (bypasses RLS & avoids PostgREST 406 header issue)
        try {
          const res = await fetch(`/api/resolve-member-code?code=${encodeURIComponent(cleanCode)}`);
          if (res.ok) {
            const result = await res.json();
            if (result.success && result.member) {
              setMember(result.member);
              setLoading(false);
              return;
            }
          }
        } catch (apiErr) {
          console.warn('API member code lookup fallback to client query:', apiErr);
        }

        // 2. Client-side query fallback using .limit(1) instead of .single() to prevent 406 error
        const { data, error: fetchErr } = await supabase
          .from('profiles')
          .select('id, name, member_unique_code, code')
          .or(`member_unique_code.ilike.${cleanCode},code.ilike.${cleanCode}`)
          .limit(1);

        if (fetchErr || !data || data.length === 0) {
          setError('This link is invalid. Please contact the SKSSF member who shared it with you.');
        } else {
          setMember(data[0]);
        }
      } catch (err: any) {
        setError('This link is invalid. Please contact the SKSSF member who shared it with you.');
      } finally {
        setLoading(false);
      }
    }
    loadMember();
  }, [code]);

  const validateForm = (): string | null => {
    if (!fullName.trim() || fullName.trim().length < 3) return 'Full Name is required (minimum 3 characters).';
    if (!dob) return 'Date of Birth is required.';

    // Validate 18+
    const dobDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - dobDate.getFullYear();
    const m = today.getMonth() - dobDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;
    if (age < 18) return 'Applicant must be at least 18 years old.';

    if (!phone.trim() || !/^\d{10}$/.test(phone.trim())) return 'Please enter a valid 10-digit Phone Number.';
    if (whatsapp.trim() && !/^\d{10}$/.test(whatsapp.trim())) return 'Please enter a valid 10-digit WhatsApp Number.';
    if (!addressHouse.trim()) return 'House / Building address is required.';
    if (!addressStreet.trim()) return 'Street / Area is required.';
    if (!addressCity.trim()) return 'City / Town is required.';
    if (!addressPin.trim() || !/^\d{6}$/.test(addressPin.trim())) return 'Please enter a valid 6-digit PIN Code.';

    const amt = parseFloat(amountRequested);
    if (isNaN(amt) || amt < 1000) return 'Loan amount must be at least ₹1,000.';

    if (!purposeDetail.trim() || purposeDetail.trim().length < 20) return 'Please describe the purpose of loan in detail (minimum 20 characters).';

    const months = parseInt(repaymentMonths);
    if (isNaN(months) || months < 1 || months > 36) return 'Repayment period must be between 1 and 36 months.';

    if (existingDebts && !existingDebtsDetail.trim()) return 'Please provide details of your existing loans or debts.';

    const inc = parseFloat(monthlyIncome);
    if (isNaN(inc) || inc <= 0) return 'Please enter a valid monthly income amount.';

    if (!incomeSource.trim()) return 'Source of income is required.';
    if (!declarationAgreed) return 'You must agree to the declaration before submitting.';

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const fullAddressStr = `${addressHouse.trim()}, ${addressStreet.trim()}, ${addressCity.trim()} - ${addressPin.trim()}`;
      
      const fullDetailsSummary = `Category: ${purposeCategory}\nDetails: ${purposeDetail.trim()}\nPeriod: ${repaymentMonths} Months\nIncome: ₹${monthlyIncome} (${incomeSource.trim()})\nDebts: ${existingDebts ? existingDebtsDetail.trim() : 'None'}\nDOB: ${dob} (${gender})`;

      let insertedRecord: any = null;

      // Tier 1: Extended PRD schema insert (using status: 'pending' to satisfy Postgres check constraint)
      const tier1Payload: any = {
        referred_member_id: member ? member.id : null,
        referred_member_name: member ? member.name : '',
        applicant_name: fullName.trim(),
        applicant_dob: dob,
        applicant_gender: gender,
        applicant_phone: phone.trim(),
        applicant_whatsapp: whatsapp.trim() || phone.trim(),
        applicant_address_house: addressHouse.trim(),
        applicant_address_street: addressStreet.trim(),
        applicant_address_city: addressCity.trim(),
        applicant_address_pin: addressPin.trim(),
        applicant_aadhaar_last4: aadhaarLast4.trim(),
        loan_amount_requested: parseFloat(amountRequested),
        loan_purpose_category: purposeCategory,
        loan_purpose_detail: purposeDetail.trim(),
        repayment_period_months: parseInt(repaymentMonths),
        existing_debts: existingDebts,
        existing_debts_detail: existingDebts ? existingDebtsDetail.trim() : null,
        monthly_income: parseFloat(monthlyIncome),
        income_source: incomeSource.trim(),
        declaration_agreed: true,
        status: 'pending',
        
        requester_name: fullName.trim(),
        requester_phone: phone.trim(),
        requester_address: fullAddressStr,
        approximate_amount: parseFloat(amountRequested),
        reason: fullDetailsSummary
      };

      const { data: t1Data, error: t1Err } = await supabase
        .from('loan_requests')
        .insert([tier1Payload])
        .select();

      if (!t1Err && t1Data && t1Data.length > 0) {
        insertedRecord = t1Data[0];
      } else {
        console.warn('Tier 1 insert failed, trying Tier 2 legacy schema with status=pending:', t1Err?.message);
        
        // Tier 2: Legacy schema using referred_member_id with status=pending
        const tier2Payload: any = {
          referred_member_id: member ? member.id : null,
          referred_member_name: member ? member.name : '',
          requester_name: fullName.trim(),
          requester_phone: phone.trim(),
          requester_address: fullAddressStr,
          approximate_amount: parseFloat(amountRequested),
          reason: fullDetailsSummary,
          status: 'pending'
        };

        const { data: t2Data, error: t2Err } = await supabase
          .from('loan_requests')
          .insert([tier2Payload])
          .select();

        if (!t2Err && t2Data && t2Data.length > 0) {
          insertedRecord = t2Data[0];
        } else {
          console.warn('Tier 2 insert failed, trying Tier 3 ultra-minimal schema without status key:', t2Err?.message);

          // Tier 3: Ultra-minimal payload omitting status key to rely on Postgres table DEFAULT value
          const tier3Payload: any = {
            requester_name: fullName.trim(),
            requester_phone: phone.trim(),
            requester_address: fullAddressStr,
            approximate_amount: parseFloat(amountRequested),
            reason: `Referred By: ${member ? member.name : 'N/A'}\n${fullDetailsSummary}`
          };

          const { data: t3Data, error: t3Err } = await supabase
            .from('loan_requests')
            .insert([tier3Payload])
            .select();

          if (t3Err) {
            throw new Error(t3Err.message || 'Submission failed. Please try again.');
          }

          insertedRecord = t3Data ? t3Data[0] : null;
        }
      }

      const generatedRef = insertedRecord?.id ? `REF-${String(insertedRecord.id).slice(0, 8).toUpperCase()}` : 'REF-SUBMITTED';
      setRefNumber(generatedRef);
      setSuccess(true);
    } catch (err: any) {
      alert(err.message || 'Submission failed. Please check your network connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc', color: 'var(--teal)' }}>
        <div className="spinner" style={{ fontSize: '15px', fontWeight: 800 }}>Loading Loan Application Form...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc', padding: '20px' }}>
        <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '40px 24px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 20px 40px rgba(0,0,0,0.03)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', margin: '0 auto 20px' }}>
            <AlertCircle size={32} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Invalid Application Link</h2>
          <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.5, marginTop: '12px' }}>
            {error}
          </p>
          <button onClick={() => navigate('/')} className="bsm s" style={{ marginTop: '24px', width: '100%', padding: '12px' }}>
            Go to Portal Home
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc', padding: '20px' }}>
        <div className="card" style={{ maxWidth: '520px', width: '100%', padding: '40px 28px', textAlign: 'center', borderRadius: '24px', background: '#fff', border: '1.5px solid #f1f5f9', boxShadow: '0 20px 40px rgba(0,0,0,0.04)' }}>
          <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', margin: '0 auto 20px' }}>
            <CheckCircle size={38} />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 950, color: '#0f172a', margin: 0 }}>Loan Application Submitted</h2>
          
          <div style={{ margin: '16px 0', padding: '10px 16px', background: '#f1f5f9', borderRadius: '12px', display: 'inline-block' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reference Number</span>
            <div style={{ fontSize: '18px', fontWeight: 950, color: 'var(--teal)', fontFamily: 'monospace', marginTop: '2px' }}>{refNumber}</div>
          </div>

          <p style={{ color: '#475569', fontSize: '14px', lineHeight: 1.6, marginTop: '8px' }}>
            Your loan application has been submitted successfully to <b>{member ? member.name : 'SKSSF Representative'}</b>. They will review your application and contact you shortly to discuss next steps.
          </p>

          <div style={{ marginTop: '24px', padding: '16px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0', textAlign: 'left', fontSize: '13px', color: '#64748b' }}>
            <strong>Need Help?</strong> You can quote reference number <b>{refNumber}</b> when speaking to your representative.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 16px 60px' }}>
      
      {/* Header Bar */}
      <div style={{ maxWidth: '640px', width: '100%', marginBottom: '20px' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#64748b', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <ArrowLeft size={16} /> Back to Portal Home
        </button>
      </div>

      <div className="card" style={{ maxWidth: '640px', width: '100%', padding: '32px 28px', borderRadius: '24px', background: '#fff', border: '1.5px solid #e2e8f0', boxShadow: '0 20px 40px rgba(0,0,0,0.03)' }}>
        
        {/* Main Branding Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px', borderBottom: '1px solid #f1f5f9', paddingBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '1px' }}>SKSSF E-Governance</div>
          <h1 style={{ fontSize: '24px', fontWeight: 950, color: '#0f172a', margin: '4px 0 0 0' }}>Loan Application Form</h1>
          
          {member ? (
            <div style={{ marginTop: '12px', padding: '10px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px', display: 'inline-block', color: '#166534', fontSize: '13px', fontWeight: 700 }}>
              This application will be submitted to your SKSSF representative: <b>{member.name}</b>. Please fill in all details accurately.
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Please complete all sections to submit your loan request.</p>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* SECTION A — Personal Information */}
          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="var(--teal)" /> Section A — Personal Information
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Full Name *</label>
                <input
                  type="text"
                  placeholder="Enter complete legal name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="fi2"
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Date of Birth *</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Gender *</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="sel2"
                    style={{ width: '100%', height: '42px' }}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Phone Number (10 digits) *</label>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="Mobile number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>WhatsApp Number (Optional)</label>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="If different"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                    className="fi2"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>House / Building Address *</label>
                <input
                  type="text"
                  placeholder="House number, building name"
                  value={addressHouse}
                  onChange={(e) => setAddressHouse(e.target.value)}
                  className="fi2"
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Street / Area *</label>
                  <input
                    type="text"
                    placeholder="Locality"
                    value={addressStreet}
                    onChange={(e) => setAddressStreet(e.target.value)}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>City / Town *</label>
                  <input
                    type="text"
                    placeholder="City"
                    value={addressCity}
                    onChange={(e) => setAddressCity(e.target.value)}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>PIN Code *</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="6 digits"
                    value={addressPin}
                    onChange={(e) => setAddressPin(e.target.value.replace(/\D/g, ''))}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION B — Loan Details */}
          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IndianRupee size={18} color="var(--teal)" /> Section B — Loan Details
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Loan Amount Requested (₹) *</label>
                  <input
                    type="number"
                    min={1000}
                    placeholder="Min ₹1,000"
                    value={amountRequested}
                    onChange={(e) => setAmountRequested(e.target.value)}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Repayment Period (Months) *</label>
                  <input
                    type="number"
                    min={1}
                    max={36}
                    placeholder="1 - 36 months"
                    value={repaymentMonths}
                    onChange={(e) => setRepaymentMonths(e.target.value)}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Purpose Category *</label>
                <select
                  value={purposeCategory}
                  onChange={(e) => setPurposeCategory(e.target.value)}
                  className="sel2"
                  style={{ width: '100%', height: '42px' }}
                >
                  <option value="Medical">Medical Relief & Healthcare</option>
                  <option value="Education">Educational Support</option>
                  <option value="Business">Small Business & Livelihood</option>
                  <option value="Home Repair">Home Repair / Shelter</option>
                  <option value="Other">Other Purpose</option>
                </select>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Purpose Details * (Min 20 chars)</label>
                <textarea
                  placeholder="Explain clearly why the loan is needed..."
                  value={purposeDetail}
                  onChange={(e) => setPurposeDetail(e.target.value)}
                  className="ta2"
                  rows={3}
                  style={{ width: '100%' }}
                  required
                />
                <div style={{ fontSize: '11px', color: purposeDetail.trim().length < 20 ? 'var(--red)' : '#64748b', fontWeight: 700, textAlign: 'right', marginTop: '2px' }}>
                  {purposeDetail.trim().length}/20 chars min
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Monthly Income (₹) *</label>
                  <input
                    type="number"
                    placeholder="Average monthly income"
                    value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(e.target.value)}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Source of Income *</label>
                  <input
                    type="text"
                    placeholder="E.g. Daily wage, shop owner"
                    value={incomeSource}
                    onChange={(e) => setIncomeSource(e.target.value)}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Do you have existing loans or debts? *</label>
                <div style={{ display: 'flex', gap: '20px', margin: '6px 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="existingDebts"
                      checked={existingDebts === false}
                      onChange={() => setExistingDebts(false)}
                    />
                    No existing debts
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="existingDebts"
                      checked={existingDebts === true}
                      onChange={() => setExistingDebts(true)}
                    />
                    Yes, I have existing debts
                  </label>
                </div>

                {existingDebts && (
                  <textarea
                    placeholder="Detail existing loan amounts, lenders, or monthly obligation..."
                    value={existingDebtsDetail}
                    onChange={(e) => setExistingDebtsDetail(e.target.value)}
                    className="ta2"
                    rows={2}
                    style={{ width: '100%', marginTop: '6px' }}
                    required
                  />
                )}
              </div>
            </div>
          </div>

          {/* SECTION C — Declaration */}
          <div style={{ background: '#f8fafc', padding: '18px 20px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="var(--teal)" /> Section C — Declaration
            </h3>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: '#334155', cursor: 'pointer', lineHeight: 1.5 }}>
              <input
                type="checkbox"
                checked={declarationAgreed}
                onChange={(e) => setDeclarationAgreed(e.target.checked)}
                style={{ marginTop: '3px', width: '16px', height: '16px', cursor: 'pointer' }}
                required
              />
              <span>
                I declare that all information provided is true and accurate. I understand that providing false information may result in the rejection of my application.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || !declarationAgreed || purposeDetail.trim().length < 20}
            className="bsm s"
            style={{ width: '100%', padding: '16px', fontSize: '16px', fontWeight: 900, borderRadius: '16px' }}
          >
            {submitting ? 'Submitting Application...' : 'Submit Loan Application'}
          </button>
        </form>

      </div>
    </div>
  );
}
