import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Phone, MapPin, IndianRupee, CheckCircle, AlertCircle, ArrowLeft, ShieldCheck, FileText, Check, Clock, Edit3, RotateCcw } from 'lucide-react';
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

  // 6-Step Wizard Navigation (1..6)
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Personal Information
  const [fullName, setFullName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('Male');
  const [phone, setPhone] = useState('');
  const [sameWhatsapp, setSameWhatsapp] = useState(true);
  const [whatsapp, setWhatsapp] = useState('');
  const [addressHouse, setAddressHouse] = useState('');
  const [addressPlace, setAddressPlace] = useState('');
  const [addressPost, setAddressPost] = useState('');
  const [addressPin, setAddressPin] = useState('');
  const [addressDistrict, setAddressDistrict] = useState('Kannur');

  // Step 2: Employment & Financial Information
  const [occupation, setOccupation] = useState('Employee');
  const [otherOccupation, setOtherOccupation] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [incomeSource, setIncomeSource] = useState('');
  const [existingDebts, setExistingDebts] = useState(false);
  const [existingDebtsDetail, setExistingDebtsDetail] = useState('');

  // Step 3: Loan Specifications
  const [amountRequested, setAmountRequested] = useState('');
  const [purposeCategory, setPurposeCategory] = useState('Medical / ചികിത്സ');
  const [otherPurpose, setOtherPurpose] = useState('');
  const [purposeDetail, setPurposeDetail] = useState('');
  const [repaymentMonths, setRepaymentMonths] = useState('3');

  // Step 4: Witness / Guarantor Information
  const [witness1Name, setWitness1Name] = useState('');
  const [witness1Phone, setWitness1Phone] = useState('');
  const [witness1MemNo, setWitness1MemNo] = useState('');
  const [witness2Name, setWitness2Name] = useState('');
  const [witness2Phone, setWitness2Phone] = useState('');
  const [witness2MemNo, setWitness2MemNo] = useState('');

  // Step 5: Declaration & Digital Signature
  const [confirmTruth, setConfirmTruth] = useState(false);
  const [confirmSchedule, setConfirmSchedule] = useState(false);
  const [signatureData, setSignatureData] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    async function loadMember() {
      if (!code) {
        setLoading(false);
        return;
      }
      try {
        const cleanCode = code.trim().toUpperCase();
        
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

  // Sync WhatsApp number if sameWhatsapp checkbox is checked
  useEffect(() => {
    if (sameWhatsapp) {
      setWhatsapp(phone);
    }
  }, [sameWhatsapp, phone]);

  // Canvas Signature Drawing Methods
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setSignatureData('');
  };

  // Step Validations
  const validateStep = (step: number): string | null => {
    if (step === 1) {
      if (!fullName.trim() || fullName.trim().length < 3) return 'Applicant Full Name is required (min 3 chars).';
      if (!fatherName.trim() || fatherName.trim().length < 3) return "Father's Name is required (min 3 chars).";
      if (!dob) return 'Date of Birth is required.';
      
      const dobDate = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - dobDate.getFullYear();
      const m = today.getMonth() - dobDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;
      if (age < 18) return 'Applicant must be at least 18 years old.';

      if (!phone.trim() || !/^\d{10}$/.test(phone.trim())) return 'Please enter a valid 10-digit Phone Number.';
      if (!sameWhatsapp && (!whatsapp.trim() || !/^\d{10}$/.test(whatsapp.trim()))) return 'Please enter a valid 10-digit WhatsApp Number.';

      if (!addressHouse.trim()) return 'House Name / Number is required.';
      if (!addressPlace.trim()) return 'Place / Area is required.';
      if (!addressPost.trim()) return 'Post Office is required.';
      if (!addressPin.trim() || !/^\d{6}$/.test(addressPin.trim())) return 'Please enter a valid 6-digit PIN Code.';
    }

    if (step === 2) {
      const inc = parseFloat(monthlyIncome);
      if (isNaN(inc) || inc < 1000) return 'Please enter a valid monthly income amount (min ₹1,000).';
      if (occupation === 'Other' && !otherOccupation.trim()) return 'Please specify your occupation.';
      if (!incomeSource.trim()) return 'Source of income is required.';
      if (existingDebts && !existingDebtsDetail.trim()) return 'Please provide details of existing debts.';
    }

    if (step === 3) {
      const amt = parseFloat(amountRequested);
      if (isNaN(amt) || amt < 1000) return 'Loan amount must be at least ₹1,000.';
      if (amt > 50000) return 'Requested amount exceeds branch maximum limit of ₹50,000.';
      if (!purposeDetail.trim() || purposeDetail.trim().length < 20) return 'Please describe the purpose in detail (min 20 characters).';
    }

    if (step === 4) {
      if (!witness1Name.trim() || witness1Name.trim().length < 3) return 'Witness/Guarantor 1 Name is required.';
      if (!witness1Phone.trim() || !/^\d{10}$/.test(witness1Phone.trim())) return 'Please enter a valid 10-digit Phone number for Witness 1.';
      if (!witness2Name.trim() || witness2Name.trim().length < 3) return 'Witness/Guarantor 2 Name is required.';
      if (!witness2Phone.trim() || !/^\d{10}$/.test(witness2Phone.trim())) return 'Please enter a valid 10-digit Phone number for Witness 2.';
    }

    if (step === 5) {
      if (!confirmTruth || !confirmSchedule) return 'You must accept both declaration confirmations before proceeding.';
    }

    return null;
  };

  const handleNextStep = () => {
    const err = validateStep(currentStep);
    if (err) {
      alert(err);
      return;
    }
    setCurrentStep(prev => Math.min(6, prev + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrevStep = () => {
    setCurrentStep(prev => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    const err = validateStep(5);
    if (err) {
      alert(err);
      return;
    }

    setSubmitting(true);
    try {
      const fullAddressStr = `${addressHouse.trim()}, ${addressPlace.trim()}, ${addressPost.trim()} P.O., ${addressDistrict} - ${addressPin.trim()}`;
      const finalCategory = purposeCategory === 'Other / മറ്റ് ആവശ്യങ്ങൾ' ? `Other: ${otherPurpose.trim()}` : purposeCategory;
      const finalOccupation = occupation === 'Other' ? `Other: ${otherOccupation.trim()}` : occupation;
      const amtVal = parseFloat(amountRequested);
      const monthsVal = parseInt(repaymentMonths);

      const generatedRef = `PYD-IL-2026-${Math.floor(10000 + Math.random() * 90000)}`;
      setRefNumber(generatedRef);

      const fullDetailsSummary = `Father: ${fatherName.trim()}\nCategory: ${finalCategory}\nDetails: ${purposeDetail.trim()}\nPeriod: ${monthsVal} Months\nOccupation: ${finalOccupation} (${employerName ? employerName.trim() : 'N/A'})\nIncome: ₹${monthlyIncome} (${incomeSource.trim()})\nDebts: ${existingDebts ? existingDebtsDetail.trim() : 'None'}\nWitness 1: ${witness1Name.trim()} (${witness1Phone.trim()})\nWitness 2: ${witness2Name.trim()} (${witness2Phone.trim()})\nDOB: ${dob} (${gender})`;

      let insertedRecord: any = null;

      // Primary serverless submission
      try {
        const res = await fetch('/api/submit-loan-application', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicant_name: fullName.trim(),
            applicant_phone: phone.trim(),
            applicant_address: fullAddressStr,
            amount: amtVal,
            months: monthsVal,
            purpose: fullDetailsSummary,
            submitted_by_member_id: member ? member.id : null
          })
        });

        if (res.ok) {
          const apiData = await res.json();
          if (apiData.success) {
            insertedRecord = apiData.record || true;
          }
        }
      } catch (apiErr) {
        console.warn('API submission fallback to direct Supabase client insert:', apiErr);
      }

      // Direct client fallback if API endpoint was bypassed
      if (!insertedRecord) {
        const payload: any = {
          loan_no: generatedRef,
          name: fullName.trim(),
          amount: amtVal,
          amt: amtVal,
          loan_amount_requested: amtVal,
          loan_amount_approved: amtVal,
          requester_name: fullName.trim(),
          requester_phone: phone.trim(),
          requester_address: fullAddressStr,
          purpose: fullDetailsSummary.slice(0, 220),
          repayment_period_months: monthsVal,
          submitted_by_member_id: member ? member.id : null,
          status: 'pending'
        };

        const { data: dbData, error: dbErr } = await supabase
          .from('loans')
          .insert([payload])
          .select();

        if (dbErr) {
          // Alternative request table insert
          await supabase.from('loan_requests').insert([{
            applicant_name: fullName.trim(),
            applicant_phone: phone.trim(),
            requester_name: fullName.trim(),
            requester_phone: phone.trim(),
            requester_address: fullAddressStr,
            loan_amount_requested: amtVal,
            loan_purpose_category: finalCategory,
            loan_purpose_detail: purposeDetail.trim(),
            repayment_period_months: monthsVal,
            referred_member_id: member ? member.id : null,
            status: 'submitted'
          }]);
        }
      }

      setSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      alert(err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Monthly EMI Calculation
  const reqAmtNum = parseFloat(amountRequested) || 0;
  const tenureMonths = parseInt(repaymentMonths) || 3;
  const calculatedEMI = reqAmtNum > 0 ? Math.round(reqAmtNum / tenureMonths) : 0;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', color: 'var(--teal)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Loading Poyanad Loan Portal...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', padding: '24px' }}>
        <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '36px', textAlign: 'center', borderRadius: '24px', background: '#fff', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05)' }}>
          <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', margin: '0 0 10px 0' }}>Invalid Link</h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 24px 0', lineHeight: 1.6 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', padding: '24px' }}>
        <div className="card" style={{ maxWidth: '520px', width: '100%', padding: '40px', textAlign: 'center', borderRadius: '28px', background: '#fff', border: '2px solid #bbf7d0' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#dcfce7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle size={36} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 950, color: '#0f172a', margin: '0 0 8px 0' }}>Application Submitted!</h2>
          <p style={{ fontSize: '13px', color: '#166534', fontWeight: 700, margin: 0 }}>SKSSF Poyanad Branch — Interest-Free Loan</p>

          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1.5px solid #e2e8f0', margin: '24px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Your Application Reference No.</div>
            <div style={{ fontSize: '24px', fontWeight: 950, color: 'var(--teal)', fontFamily: 'monospace', margin: '6px 0' }}>{refNumber}</div>
            <div style={{ fontSize: '12px', color: '#475569' }}>Submitted for committee review under referral: <b>{member?.name}</b></div>
          </div>

          <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.5, margin: '0 0 24px 0' }}>
            Thank you for applying. Your application has been logged and sent to representative <b>{member?.name}</b> and the SKSSF Poyanad Branch committee for review.
          </p>

          <button onClick={() => window.location.reload()} className="bsm s" style={{ width: '100%', padding: '14px', borderRadius: '14px', fontWeight: 900, background: '#0f172a' }}>
            Submit Another Application
          </button>
        </div>
      </div>
    );
  }

  const stepsList = [
    { num: 1, title: 'Personal', sub: 'അപേക്ഷകൻ' },
    { num: 2, title: 'Employment', sub: 'തൊഴിൽ' },
    { num: 3, title: 'Loan Specs', sub: 'വായ്പ' },
    { num: 4, title: 'Guarantors', sub: 'സാക്ഷി' },
    { num: 5, title: 'Declaration', sub: 'ഒപ്പ്' },
    { num: 6, title: 'Review', sub: 'പരിശോധന' }
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '32px 16px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>
        
        {/* BRANCH HEADER BANNER */}
        <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '24px', padding: '28px', color: '#fff', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px' }}>
                <ShieldCheck size={14} color="#38bdf8" /> REG NO: 2773 • POYANAD BRANCH
              </div>
              <h1 style={{ fontSize: '22px', fontWeight: 950, margin: '10px 0 4px 0', letterSpacing: '-0.3px' }}>
                SKSSF Poyanad Branch Interest-Free Loan
              </h1>
              <p style={{ fontSize: '13px', opacity: 0.85, margin: 0 }}>
                അനാഥത്വമില്ലാത്ത നാടിനായി പലിശരഹിത വായ്പാ പദ്ധതി അപേക്ഷ
              </p>
            </div>

            {member && (
              <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px 14px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.15)', fontSize: '12px' }}>
                <div style={{ opacity: 0.7, fontSize: '10px', textTransform: 'uppercase', fontWeight: 800 }}>Referred By Member</div>
                <div style={{ fontWeight: 900, color: '#38bdf8', marginTop: '2px' }}>✓ {member.name} ({member.member_unique_code || member.code})</div>
              </div>
            )}
          </div>
        </div>

        {/* 6-STEP WIZARD PROGRESS BAR */}
        <div className="card" style={{ background: '#fff', borderRadius: '20px', padding: '16px 20px', marginBottom: '24px', border: '1.5px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', overflowX: 'auto', gap: '12px' }}>
            {stepsList.map(s => {
              const isActive = currentStep === s.num;
              const isDone = currentStep > s.num;
              return (
                <div key={s.num} onClick={() => isDone && setCurrentStep(s.num)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '80px', cursor: isDone ? 'pointer' : 'default' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: isActive ? '#0f172a' : isDone ? '#10b981' : '#f1f5f9',
                    color: isActive || isDone ? '#fff' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '13px',
                    transition: 'all 0.2s',
                    boxShadow: isActive ? '0 4px 12px rgba(15,23,42,0.2)' : 'none'
                  }}>
                    {isDone ? <Check size={18} /> : s.num}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: isActive ? 900 : 700, color: isActive ? '#0f172a' : '#64748b', marginTop: '6px', textAlign: 'center' }}>
                    {s.title}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* MAIN WIZARD STEP CONTAINER */}
        <div className="card" style={{ background: '#fff', borderRadius: '24px', padding: '32px', border: '1.5px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.03)' }}>
          
          {/* STEP 1: PERSONAL INFORMATION */}
          {currentStep === 1 && (
            <div>
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={20} color="var(--teal)" /> 01 — അപേക്ഷകന്റെ വിവരങ്ങൾ (Applicant Information)
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Enter full personal identity details as per official records</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Applicant Full Name * (അപേക്ഷകന്റെ പേര്)</label>
                  <input
                    type="text"
                    placeholder="Complete legal name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>

                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Father's / Guardian's Name * (പിതാവിന്റെ/രക്ഷിതാവിന്റെ പേര്)</label>
                  <input
                    type="text"
                    placeholder="Father's full name"
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Date of Birth * (ജനന തീയതി)</label>
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
                    <label className="fl2" style={{ fontWeight: 800 }}>Gender * (സ്ത്രീ / പുരുഷൻ)</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="sel2"
                      style={{ width: '100%', height: '42px' }}
                    >
                      <option value="Male">Male / പുരുഷൻ</option>
                      <option value="Female">Female / സ്ത്രീ</option>
                      <option value="Other">Other / മറ്റ്</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Mobile Phone Number (10 digits) * (ഫോൺ നമ്പർ)</label>
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

                <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={sameWhatsapp}
                      onChange={(e) => setSameWhatsapp(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--teal)' }}
                    />
                    ☑ WhatsApp number is the same as mobile number
                  </label>
                </div>

                {!sameWhatsapp && (
                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>WhatsApp Number *</label>
                    <input
                      type="tel"
                      maxLength={10}
                      placeholder="WhatsApp mobile number"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
                      className="fi2"
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                )}

                {/* Structured Address */}
                <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '16px', border: '1px solid #e2e8f0', marginTop: '6px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Full Address Details (മേൽവിലാസം)</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label className="fl2" style={{ fontWeight: 800 }}>House Name / House No. *</label>
                      <input
                        type="text"
                        placeholder="e.g. Baitul Noor, House No. 42"
                        value={addressHouse}
                        onChange={(e) => setAddressHouse(e.target.value)}
                        className="fi2"
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label className="fl2" style={{ fontWeight: 800 }}>Place / Area *</label>
                        <input
                          type="text"
                          placeholder="e.g. Poyanad"
                          value={addressPlace}
                          onChange={(e) => setAddressPlace(e.target.value)}
                          className="fi2"
                          style={{ width: '100%' }}
                          required
                        />
                      </div>
                      <div>
                        <label className="fl2" style={{ fontWeight: 800 }}>Post Office *</label>
                        <input
                          type="text"
                          placeholder="e.g. Mambram P.O."
                          value={addressPost}
                          onChange={(e) => setAddressPost(e.target.value)}
                          className="fi2"
                          style={{ width: '100%' }}
                          required
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label className="fl2" style={{ fontWeight: 800 }}>PIN Code (6 digits) *</label>
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="670741"
                          value={addressPin}
                          onChange={(e) => setAddressPin(e.target.value.replace(/\D/g, ''))}
                          className="fi2"
                          style={{ width: '100%' }}
                          required
                        />
                      </div>
                      <div>
                        <label className="fl2" style={{ fontWeight: 800 }}>District *</label>
                        <input
                          type="text"
                          value={addressDistrict}
                          onChange={(e) => setAddressDistrict(e.target.value)}
                          className="fi2"
                          style={{ width: '100%' }}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: EMPLOYMENT & FINANCIAL INFORMATION */}
          {currentStep === 2 && (
            <div>
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={20} color="var(--teal)" /> 02 — തൊഴിൽ & സാമ്പത്തിക വിവരങ്ങൾ (Employment & Financials)
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Provide accurate details of your livelihood and monthly earnings</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Occupation * (തൊഴിൽ)</label>
                  <select
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    className="sel2"
                    style={{ width: '100%', height: '42px' }}
                  >
                    <option value="Employee">Employee / ജീവനക്കാരൻ</option>
                    <option value="Business">Business / വ്യാപാരി</option>
                    <option value="Self-employed">Self-employed / സ്വയംതൊഴിൽ</option>
                    <option value="Daily wage">Daily Wage / ദിനബത്ത</option>
                    <option value="Driver">Driver / ഡ്രൈവർ</option>
                    <option value="Farmer">Farmer / കർഷകൻ</option>
                    <option value="Student">Student / വിദ്യാർത്ഥി</option>
                    <option value="Other">Other / മറ്റ് തൊഴിൽ</option>
                  </select>
                </div>

                {occupation === 'Other' && (
                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Specify Occupation *</label>
                    <input
                      type="text"
                      placeholder="Specify your exact job role"
                      value={otherOccupation}
                      onChange={(e) => setOtherOccupation(e.target.value)}
                      className="fi2"
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Employer / Business Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="Company or business name"
                    value={employerName}
                    onChange={(e) => setEmployerName(e.target.value)}
                    className="fi2"
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Monthly Income (₹) * (മാസ വരുമാനം)</label>
                    <input
                      type="number"
                      min={1000}
                      placeholder="₹ Amount"
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                      className="fi2"
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Income Source / Details *</label>
                    <input
                      type="text"
                      placeholder="e.g. Salary, Shop sales"
                      value={incomeSource}
                      onChange={(e) => setIncomeSource(e.target.value)}
                      className="fi2"
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                </div>

                {/* Existing Debts */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 800, color: '#0f172a', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={existingDebts}
                      onChange={(e) => setExistingDebts(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--teal)' }}
                    />
                    Do you have any existing loans or debts? (നിലവിൽ വായ്പകൾ ഉണ്ടോ)
                  </label>

                  {existingDebts && (
                    <div style={{ marginTop: '12px' }}>
                      <label className="fl2" style={{ fontWeight: 800 }}>Existing Debts Details *</label>
                      <textarea
                        placeholder="Specify existing loan amounts, bank/person, and monthly dues..."
                        value={existingDebtsDetail}
                        onChange={(e) => setExistingDebtsDetail(e.target.value)}
                        className="ta2"
                        rows={2}
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: LOAN SPECIFICATIONS */}
          {currentStep === 3 && (
            <div>
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IndianRupee size={20} color="var(--teal)" /> 03 — വായ്പാ വിവരങ്ങൾ (Loan Specifications)
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Specify loan amount, category, and preferred repayment period</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Requested Loan Amount (₹) * (അഭ്യർത്ഥിക്കുന്ന തുക - Max ₹50,000)</label>
                  <input
                    type="number"
                    min={1000}
                    max={50000}
                    placeholder="₹ Enter amount (e.g. 30000)"
                    value={amountRequested}
                    onChange={(e) => setAmountRequested(e.target.value)}
                    className="fi2"
                    style={{ width: '100%', fontSize: '16px', fontWeight: 800, color: 'var(--teal)' }}
                    required
                  />
                </div>

                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Loan Purpose Category * (ആവശ്യം)</label>
                  <select
                    value={purposeCategory}
                    onChange={(e) => setPurposeCategory(e.target.value)}
                    className="sel2"
                    style={{ width: '100%', height: '42px' }}
                  >
                    <option value="Medical / ചികിത്സ">Medical Relief & Healthcare / ചികിത്സാ ധനസഹായം</option>
                    <option value="Education / വിദ്യാഭ്യാസം">Educational Support / വിദ്യാഭ്യാസ ധനസഹായം</option>
                    <option value="Marriage / വിവാഹം">Marriage Assistance / വിവാഹ ധനസഹായം</option>
                    <option value="Housing / വീട്">Housing & Shelter Repair / വീട് നിർമ്മാണം/അറ്റകുറ്റപ്പണി</option>
                    <option value="Business / ബിസിനസ്">Small Business & Livelihood / ചെറുകിട കച്ചവടം</option>
                    <option value="Emergency / അടിയന്തര ആവശ്യം">Emergency Support / അടിയന്തര ആവശ്യം</option>
                    <option value="Family Need / കുടുംബ ആവശ്യങ്ങൾ">Family Need / കുടുംബ ആവശ്യങ്ങൾ</option>
                    <option value="Other / മറ്റ് ആവശ്യങ്ങൾ">Other Purpose / മറ്റ് ആവശ്യങ്ങൾ</option>
                  </select>
                </div>

                {purposeCategory === 'Other / മറ്റ് ആവശ്യങ്ങൾ' && (
                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Specify Purpose Category *</label>
                    <input
                      type="text"
                      placeholder="Specify your loan category"
                      value={otherPurpose}
                      onChange={(e) => setOtherPurpose(e.target.value)}
                      className="fi2"
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Detailed Purpose Explanation * (വിശദീകരണം - Min 20 chars)</label>
                  <textarea
                    placeholder="Provide detailed justification of why loan is required..."
                    value={purposeDetail}
                    onChange={(e) => setPurposeDetail(e.target.value)}
                    className="ta2"
                    rows={3}
                    style={{ width: '100%' }}
                    required
                  />
                </div>

                {/* Repayment Period Radio Cards */}
                <div>
                  <label className="fl2" style={{ fontWeight: 800, marginBottom: '8px', display: 'block' }}>Repayment Period * (തിരിച്ചടവ് കാലാവധി)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {['1', '2', '3'].map(m => {
                      const isSel = repaymentMonths === m;
                      return (
                        <div
                          key={m}
                          onClick={() => setRepaymentMonths(m)}
                          style={{
                            padding: '16px',
                            borderRadius: '16px',
                            border: isSel ? '2px solid var(--teal)' : '1.5px solid #e2e8f0',
                            background: isSel ? '#f0fdf4' : '#fff',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ fontSize: '18px', fontWeight: 950, color: isSel ? '#166534' : '#0f172a' }}>{m} Month{m !== '1' ? 's' : ''}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>({m} മാസം)</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Automatic Installment Calculation Card */}
                {reqAmtNum > 0 && (
                  <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '20px', border: '1.5px solid #bbf7d0', marginTop: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#166534', textTransform: 'uppercase', marginBottom: '10px' }}>
                      ⚡ Automatic Repayment Installment Summary
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
                      <div style={{ background: '#fff', padding: '12px', borderRadius: '12px' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Total Loan</div>
                        <div style={{ fontSize: '16px', fontWeight: 950, color: '#0f172a', marginTop: '2px' }}>₹{reqAmtNum.toLocaleString()}</div>
                      </div>
                      <div style={{ background: '#fff', padding: '12px', borderRadius: '12px' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Interest (പലിശ)</div>
                        <div style={{ fontSize: '16px', fontWeight: 950, color: '#10b981', marginTop: '2px' }}>₹0 (Interest-Free)</div>
                      </div>
                      <div style={{ background: '#fff', padding: '12px', borderRadius: '12px' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Monthly Payment</div>
                        <div style={{ fontSize: '16px', fontWeight: 950, color: 'var(--teal)', marginTop: '2px' }}>₹{calculatedEMI.toLocaleString()} / mo</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: WITNESS / GUARANTOR INFORMATION */}
          {currentStep === 4 && (
            <div>
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={20} color="var(--teal)" /> 04 — സാക്ഷി / ജാമ്യക്കാരൻ (Witness / Guarantor Details)
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Provide two verified branch witnesses or guarantors for reference</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Witness 1 */}
                <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Witness / Guarantor 1 (ഒന്നാം സാക്ഷി)</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label className="fl2" style={{ fontWeight: 800 }}>Full Name *</label>
                      <input
                        type="text"
                        placeholder="Witness 1 name"
                        value={witness1Name}
                        onChange={(e) => setWitness1Name(e.target.value)}
                        className="fi2"
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label className="fl2" style={{ fontWeight: 800 }}>Mobile Phone (10 digits) *</label>
                        <input
                          type="tel"
                          maxLength={10}
                          placeholder="Mobile number"
                          value={witness1Phone}
                          onChange={(e) => setWitness1Phone(e.target.value.replace(/\D/g, ''))}
                          className="fi2"
                          style={{ width: '100%' }}
                          required
                        />
                      </div>
                      <div>
                        <label className="fl2" style={{ fontWeight: 800 }}>Membership No. (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. MBR-00125"
                          value={witness1MemNo}
                          onChange={(e) => setWitness1MemNo(e.target.value)}
                          className="fi2"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Witness 2 */}
                <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Witness / Guarantor 2 (രണ്ടാം സാക്ഷി)</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label className="fl2" style={{ fontWeight: 800 }}>Full Name *</label>
                      <input
                        type="text"
                        placeholder="Witness 2 name"
                        value={witness2Name}
                        onChange={(e) => setWitness2Name(e.target.value)}
                        className="fi2"
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label className="fl2" style={{ fontWeight: 800 }}>Mobile Phone (10 digits) *</label>
                        <input
                          type="tel"
                          maxLength={10}
                          placeholder="Mobile number"
                          value={witness2Phone}
                          onChange={(e) => setWitness2Phone(e.target.value.replace(/\D/g, ''))}
                          className="fi2"
                          style={{ width: '100%' }}
                          required
                        />
                      </div>
                      <div>
                        <label className="fl2" style={{ fontWeight: 800 }}>Membership No. (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. MBR-00140"
                          value={witness2MemNo}
                          onChange={(e) => setWitness2MemNo(e.target.value)}
                          className="fi2"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: DECLARATION & DIGITAL SIGNATURE */}
          {currentStep === 5 && (
            <div>
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={20} color="var(--teal)" /> 05 — സത്യവാങ്മൂലം & ഒപ്പ് (Declaration & Digital Signature)
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Review the branch declaration and digitally sign your application</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '18px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
                  <b>സത്യവാങ്മൂലം (Declaration Text):</b>
                  <p style={{ margin: '6px 0 0 0' }}>
                    മുകളിൽ നൽകിയിട്ടുള്ള എല്ലാ വിവരങ്ങളും എന്റെ അറിവിലും വിശ്വസത്തിലും സത്യവും ശരിയുമാണെന്ന് ഞാൻ ഉറപ്പുനൽകുന്നു. SKSSF പൊയനാട് ശാഖാ പലിശരഹിത വായ്പാ പദ്ധതി അനുസരിച്ചുള്ള തിരിച്ചടവ് ഷെഡ്യൂൾ പ്രകാരം നിശ്ചിത ഗഡുക്കൾ കൃത്യമായി അടച്ചുതീർത്തുകൊള്ളാമെന്ന് ഞാൻ സമ്മതിക്കുന്നു.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={confirmTruth}
                      onChange={(e) => setConfirmTruth(e.target.checked)}
                      style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: 'var(--teal)' }}
                    />
                    <span>I confirm that the information provided in this application is true and correct. (വിവരങ്ങൾ സത്യസന്ധമാണെന്ന് ഉറപ്പുനൽകുന്നു)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={confirmSchedule}
                      onChange={(e) => setConfirmSchedule(e.target.checked)}
                      style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: 'var(--teal)' }}
                    />
                    <span>I agree to repay the approved loan according to the repayment schedule decided by SKSSF Poyanad Branch. (തിരിച്ചടവ് ഷെഡ്യൂൾ പാലിക്കുമെന്ന് സമ്മതിക്കുന്നു)</span>
                  </label>
                </div>

                {/* HTML5 Canvas Signature Pad */}
                <div style={{ background: '#fff', padding: '18px', borderRadius: '18px', border: '1.5px solid #e2e8f0', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="fl2" style={{ fontWeight: 800, margin: 0 }}>Applicant Digital Signature * (അപേക്ഷകന്റെ ഒപ്പ്)</label>
                    <button type="button" onClick={clearSignature} style={{ background: '#f1f5f9', border: 'none', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', color: '#64748b' }}>
                      Clear Signature
                    </button>
                  </div>

                  <div style={{ border: '2px dashed #cbd5e1', borderRadius: '14px', background: '#f8fafc', overflow: 'hidden' }}>
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={140}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      style={{ width: '100%', height: '140px', touchAction: 'none', cursor: 'crosshair' }}
                    />
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', textAlign: 'center' }}>Use mouse or touch finger to draw your signature inside the box above</div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: REVIEW & SUBMIT */}
          {currentStep === 6 && (
            <div>
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle size={20} color="var(--teal)" /> 06 — അപേക്ഷാ പരിശോധന (Application Final Review)
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Verify all details before final submission to SKSSF Poyanad Branch</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Summary Card 1: Personal */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>1. Applicant Identity</h4>
                    <button type="button" onClick={() => setCurrentStep(1)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>Edit</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: '#334155' }}>
                    <div><b>Name:</b> {fullName}</div>
                    <div><b>Father:</b> {fatherName}</div>
                    <div><b>DOB / Gender:</b> {dob} ({gender})</div>
                    <div><b>Mobile:</b> {phone}</div>
                    <div style={{ gridColumn: 'span 2' }}><b>Address:</b> {addressHouse}, {addressPlace}, {addressPost} P.O., {addressDistrict} - {addressPin}</div>
                  </div>
                </div>

                {/* Summary Card 2: Employment */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>2. Employment & Income</h4>
                    <button type="button" onClick={() => setCurrentStep(2)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>Edit</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: '#334155' }}>
                    <div><b>Occupation:</b> {occupation === 'Other' ? otherOccupation : occupation}</div>
                    <div><b>Employer:</b> {employerName || 'N/A'}</div>
                    <div><b>Monthly Income:</b> ₹{Number(monthlyIncome).toLocaleString()}</div>
                    <div><b>Income Source:</b> {incomeSource}</div>
                  </div>
                </div>

                {/* Summary Card 3: Loan */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>3. Loan Specifications</h4>
                    <button type="button" onClick={() => setCurrentStep(3)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>Edit</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: '#334155' }}>
                    <div><b>Requested Amount:</b> <span style={{ color: 'var(--teal)', fontWeight: 900 }}>₹{Number(amountRequested).toLocaleString()}</span></div>
                    <div><b>Repayment Period:</b> {repaymentMonths} Months</div>
                    <div><b>Category:</b> {purposeCategory}</div>
                    <div><b>Interest:</b> <span style={{ color: '#10b981', fontWeight: 900 }}>₹0 (Interest-Free)</span></div>
                    <div style={{ gridColumn: 'span 2' }}><b>Detailed Purpose:</b> {purposeDetail}</div>
                  </div>
                </div>

                {/* Summary Card 4: Witnesses */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>4. Witnesses & Guarantors</h4>
                    <button type="button" onClick={() => setCurrentStep(4)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>Edit</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: '#334155' }}>
                    <div><b>Witness 1:</b> {witness1Name} ({witness1Phone})</div>
                    <div><b>Witness 2:</b> {witness2Name} ({witness2Phone})</div>
                  </div>
                </div>

                {/* Signature Preview */}
                {signatureData && (
                  <div style={{ background: '#fff', padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Attached Digital Signature</div>
                    <img src={signatureData} alt="Signature" style={{ maxHeight: '60px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '4px' }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WIZARD NAVIGATION FOOTER BUTTONS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                className="bsm g"
                style={{ padding: '12px 20px', borderRadius: '12px', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                ← Back
              </button>
            ) : <div />}

            {currentStep < 6 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="bsm s"
                style={{ padding: '12px 24px', borderRadius: '12px', fontWeight: 900, fontSize: '14px', background: '#0f172a' }}
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="bsm s"
                style={{ padding: '14px 28px', borderRadius: '14px', fontWeight: 950, fontSize: '15px', background: '#10b981' }}
              >
                {submitting ? 'Submitting Application...' : 'Submit Application to Poyanad Committee ✓'}
              </button>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
