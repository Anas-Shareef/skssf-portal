import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { localDb } from '../../lib/localDb';
import ConfirmDialog from '../../components/ConfirmDialog';
import SignaturePad from '../../components/SignaturePad';
import { api } from '../../lib/api';

export default function LoanApplication() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const members = useMemo(() => localDb.getUsers().filter((u: any) => u.role === 'member'), []);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const isAdminOrSuper = profile?.role === 'super' || profile?.role === 'admin';

  // --- Step 1: Personal (Pre-filled but EDITABLE) ---
  const [personal, setPersonal] = useState({
    name: '',
    fatherName: '',
    dob: '',
    occupation: '',
    memberNo: '',
    address: '',
    phone: '',
    whatsapp: '',
    salary: '',
    aadhaar: ''
  });

  // Pre-fill from profile
  useEffect(() => {
    if (profile && profile.role === 'member') {
      setPersonal(prev => ({
        ...prev,
        name: prev.name || profile.name || '',
        occupation: prev.occupation || profile.occupation || '',
        memberNo: prev.memberNo || (profile as any).memberNo || '',
        phone: prev.phone || (profile as any).phone || '',
        whatsapp: prev.whatsapp || (profile as any).phone || '',
        dob: prev.dob || (profile as any).dob || '',
        fatherName: prev.fatherName || (profile as any).fatherName || '',
        address: prev.address || (profile as any).addr || '',
        aadhaar: prev.aadhaar || (profile as any).aadhaar || '',
      }));
    }
  }, [profile]);

  const updatePers = (f: string, v: string) => setPersonal(p => ({ ...p, [f]: v }));
  
  const age = useMemo(() => {
    if (!personal.dob) return '—';
    const birthDate = new Date(personal.dob);
    if (isNaN(birthDate.getTime())) return '—';
    const today = new Date();
    let ageValue = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      ageValue--;
    }
    return ageValue + ' years';
  }, [personal.dob]);

  // --- Step 2: Loan Details ---
  const [loanAmt, setLoanAmt] = useState<number>(0);
  const [loanType, setLoanType] = useState('');
  const [loanDesc, setLoanDesc] = useState('');
  const [tenure, setTenure] = useState<number>(0);

  const emi = useMemo(() => {
    if (!tenure || tenure === 0) return 0;
    return Math.round(loanAmt / tenure);
  }, [loanAmt, tenure]);

  const amountInWords = useMemo(() => {
    if (loanAmt === 0) return 'Zero Rupees Only';
    return (loanAmt).toLocaleString('en-IN') + ' Rupees Only';
  }, [loanAmt]);

  // --- Step 3: Declaration & Witnesses ---
  const [signature, setSignature] = useState('');
  const [sigMode, setSigMode] = useState<'upload' | 'draw'>('draw');
  const [witnesses, setWitnesses] = useState<any[]>([
    { name: '', email: '', signature: '', otpSent: false, otpVerified: false, otpCode: '', inputOtp: '', timer: 0 },
    { name: '', email: '', signature: '', otpSent: false, otpVerified: false, otpCode: '', inputOtp: '', timer: 0 }
  ]);

  // Update timers for resending OTP
  useEffect(() => {
    const interval = setInterval(() => {
      setWitnesses(prev => prev.map(w => w.timer > 0 ? { ...w, timer: w.timer - 1 } : w));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const hasBackendSession = () => !!sessionStorage.getItem('active_api_token');

  const generateOtpSignatureSeal = (name: string, email: string, code: string) => {
    const cleanName = name.replace(/[^a-zA-Z0-9 ]/g, '');
    const cleanEmail = email.replace(/[^a-zA-Z0-9@._-]/g, '');
    const dateStr = new Date().toLocaleString();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100">
      <rect width="298" height="98" x="1" y="1" rx="12" fill="%23f0fdf4" stroke="%2310b981" stroke-width="2" stroke-dasharray="4"/>
      <text x="150" y="32" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="%23047857" text-anchor="middle">✓ OTP WITNESS SIGNATURE</text>
      <text x="150" y="52" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="%231f2937" text-anchor="middle">NAME: ${cleanName.toUpperCase()}</text>
      <text x="150" y="70" font-family="system-ui, sans-serif" font-size="9.5" fill="%234b5563" text-anchor="middle">EMAIL: ${cleanEmail}</text>
      <text x="150" y="86" font-family="system-ui, sans-serif" font-size="8.5" fill="%236b7280" text-anchor="middle">Verified with OTP (${code}) on ${dateStr}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${svg}`;
  };

  const sendWitnessOtp = async (idx: number) => {
    const wit = witnesses[idx];
    if (!wit.name.trim() || !wit.email.trim()) {
      alert('Please fill name and email first.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(wit.email.trim())) {
      alert('Please enter a valid email address.');
      return;
    }

    try {
      if (hasBackendSession()) {
        const selectedMember = isAdminOrSuper ? members.find((m: any) => m.id === selectedMemberId) : null;
        const applicantName = selectedMember ? (selectedMember.name || personal.name) : (profile?.name || personal.name || '');
        const applicantEmail = selectedMember ? (selectedMember.email || '') : (profile?.email || '');

        const res: any = await api.post('/loans/otp/send', {
          email: wit.email.trim(),
          name: wit.name,
          applicantName,
          applicantEmail
        });
        const updated = [...witnesses];
        updated[idx] = {
          ...wit,
          otpSent: true,
          otpCode: res.otp || '',
          timer: 30
        };
        setWitnesses(updated);
      } else {
        const updated = [...witnesses];
        updated[idx] = {
          ...wit,
          otpSent: true,
          otpCode: '123456',
          timer: 30
        };
        setWitnesses(updated);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to send OTP.');
    }
  };

  const verifyWitnessOtp = async (idx: number) => {
    const wit = witnesses[idx];
    if (!wit.inputOtp || wit.inputOtp.length !== 6) {
      alert('Please enter 6-digit OTP code.');
      return;
    }

    try {
      if (hasBackendSession()) {
        await api.post('/loans/otp/verify', {
          email: wit.email.trim(),
          code: wit.inputOtp
        });
      } else {
        if (wit.inputOtp !== wit.otpCode) {
          throw new Error('Invalid mock OTP code.');
        }
      }

      const updated = [...witnesses];
      const seal = generateOtpSignatureSeal(wit.name, wit.email.trim(), wit.inputOtp);
      updated[idx] = {
        ...wit,
        otpVerified: true,
        signature: seal
      };
      setWitnesses(updated);
    } catch (e: any) {
      alert(e.message || 'OTP verification failed.');
    }
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('File size too large. Max 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setSignature(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleWitnessSigUpload = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => updateWitness(idx, 'signature', reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const updateWitness = (idx: number, field: string, val: string) => {
    const newW = [...witnesses];
    (newW[idx] as any)[field] = val;
    setWitnesses(newW);
  };

  // --- Step Validation ---
  const isStep1Valid = !!(
    (!isAdminOrSuper || selectedMemberId) &&
    personal.name?.trim() &&
    personal.fatherName?.trim() &&
    personal.dob &&
    personal.occupation?.trim() &&
    personal.memberNo?.trim() &&
    personal.address?.trim() &&
    personal.phone?.trim() &&
    personal.aadhaar?.trim()
  );
  const isStep2Valid = loanAmt > 0 && !!(loanType && loanDesc?.trim() && tenure > 0);
  const isStep3Valid = !!(signature && witnesses[0].name.trim() && witnesses[0].email?.trim() && witnesses[0].otpVerified && witnesses[1].name.trim() && witnesses[1].email?.trim() && witnesses[1].otpVerified);

  // --- Final Submission ---
  const [showConfirm, setShowConfirm] = useState(false);

  const submitLoan = async () => {
    setIsSubmitting(true);
    const repayments = [];
    const today = new Date();
    for (let i = 1; i <= tenure; i++) {
        const dueDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
        repayments.push({
          due: dueDate.toISOString().split('T')[0],
          amt: i === tenure ? loanAmt - (emi * (tenure - 1)) : emi,
          paid: null
        });
    }

    const finalApplicantId = isAdminOrSuper ? selectedMemberId : profile?.id;
    const finalDbId = isAdminOrSuper
      ? members.find((m: any) => m.id === selectedMemberId)?.db_id
      : profile?.db_id;
    const finalBranch = isAdminOrSuper
      ? (members.find((m: any) => m.id === selectedMemberId)?.branch || '')
      : (profile?.branch || '');

    localDb.addLoan({
      applicant_id: finalApplicantId,
      db_id: finalDbId,
      branch: finalBranch,
      ...personal,
      amt: loanAmt,
      purpose: loanType,
      purpDesc: loanDesc,
      months: tenure,
      repayments,
      signature,
      witnesses,
      status: 'pending'
    });

    await new Promise(r => setTimeout(r, 800)); // Simulate processing
    const prefix = profile?.role === 'super' ? '/super-admin/dashboard' : profile?.role === 'admin' ? '/admin/dashboard' : '/member/dashboard';
    navigate(`${prefix}/loans`);
  };

  return (
    <>
      <div className="loan-head fu">
        <h1 style={{ fontWeight: 900, fontSize: '36px' }}>പലിശരഹിത വായ്പ അപേക്ഷ</h1>
        <p>Interest-Free Loan Application Form — SKSSF Poyanad Branch (Reg: 2773)</p>
      </div>

      <div className="sw-bar fu fu1">
        {[
          { n: 1, l: 'Personal' },
          { n: 2, l: 'Loan Details' },
          { n: 3, l: 'Declaration' },
          { n: 4, l: 'Review' }
        ].map(s => (
          <div key={s.n} className={`sw-step ${step === s.n ? 'active' : step > s.n ? 'done' : ''}`}>
            <div className="sw-c">{step > s.n ? '✓' : s.n}</div>
            <div className="sw-l">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="card fu fu2" style={{ maxWidth: '820px', margin: '0 auto', padding: '40px', minHeight: '500px' }}>
        
        {/* STEP 1: PERSONAL */}
        {step === 1 && (
          <div className="fstep on">
            <div className="review-hd" style={{ marginBottom: '25px' }}>👤 Personal Information</div>
            {isAdminOrSuper && (
              <div style={{ marginBottom: '25px', background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1.5px solid var(--border)' }}>
                <label className="fl2" style={{ fontWeight: '700', color: 'var(--teal)', marginBottom: '8px' }}>Select Member to Apply For *</label>
                <select
                  className="sel2"
                  value={selectedMemberId}
                  onChange={e => {
                    const id = e.target.value;
                    setSelectedMemberId(id);
                    const m = members.find((u: any) => u.id === id);
                    if (m) {
                      setPersonal({
                        name: m.name || '',
                        fatherName: m.fname || '',
                        dob: m.dob || '',
                        occupation: m.occupation || '',
                        memberNo: m.memberNo || '',
                        address: m.addr || '',
                        phone: m.phone || '',
                        whatsapp: m.phone || '',
                        salary: String(m.salary || ''),
                        aadhaar: m.aadhaar || '',
                      });
                    } else {
                      setPersonal({
                        name: '',
                        fatherName: '',
                        dob: '',
                        occupation: '',
                        memberNo: '',
                        address: '',
                        phone: '',
                        whatsapp: '',
                        salary: '',
                        aadhaar: ''
                      });
                    }
                  }}
                  style={{ border: '2px solid var(--teal)', fontWeight: '600' }}
                >
                  <option value="">-- Choose Member --</option>
                  {members.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.memberNo || 'No ID'} · {m.branch})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="fgrid">
              <div className="fg2"><label className="fl2">Applicant's Name <span className="req">*</span></label><input className="fi2" value={personal.name} onChange={e => updatePers('name', e.target.value)} placeholder="Full Name" /></div>
              <div className="fg2"><label className="fl2">Father's Name <span className="req">*</span></label><input className="fi2" value={personal.fatherName} onChange={e => updatePers('fatherName', e.target.value)} placeholder="Father's Name" /></div>
              
              <div className="fg2"><label className="fl2">Date of Birth <span className="req">*</span></label><input className="fi2" type="date" value={personal.dob} onChange={e => updatePers('dob', e.target.value)} /></div>
              <div className="fg2"><label className="fl2">Age (System Calc)</label><input className="fi2 fi-ro" value={age} readOnly /></div>
              
              <div className="fg2"><label className="fl2">Occupation <span className="req">*</span></label><input className="fi2" value={personal.occupation} onChange={e => updatePers('occupation', e.target.value)} placeholder="Farmer / Driver etc." /></div>
              <div className="fg2"><label className="fl2">Membership Number <span className="req">*</span></label><input className="fi2" value={personal.memberNo} onChange={e => updatePers('memberNo', e.target.value)} placeholder="SKSSF-XXXX" /></div>
              
              <div className="fg2 full"><label className="fl2">Full Address <span className="req">*</span></label><textarea className="ta2" value={personal.address} onChange={e => updatePers('address', e.target.value)} placeholder="House Name, Place, Pin" /></div>
              
              <div className="fg2"><label className="fl2">Mobile Number <span className="req">*</span></label><div className="fi2w"><span className="fic">📱</span><input className="fi2 wp" type="tel" value={personal.phone} onChange={e => updatePers('phone', e.target.value)} placeholder="9988776655" /></div></div>
              <div className="fg2"><label className="fl2">WhatsApp Number</label><div className="fi2w"><span className="fic">💬</span><input className="fi2 wp" value={personal.whatsapp} onChange={e => updatePers('whatsapp', e.target.value)} placeholder="WhatsApp No" /></div></div>
              
              <div className="fg2"><label className="fl2">Monthly Income (₹)</label><div className="fi2w"><span className="fic">₹</span><input className="fi2 wp" type="number" value={personal.salary} onChange={e => updatePers('salary', e.target.value)} placeholder="10000" /></div></div>
              <div className="fg2"><label className="fl2">Aadhaar No. <span className="req">*</span></label><input className="fi2" value={personal.aadhaar} onChange={e => updatePers('aadhaar', e.target.value)} placeholder="12-digit Aadhaar No" maxLength={12} /></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: '30px' }}>
              {!isStep1Valid && <div style={{ fontSize: '11px', color: 'var(--red)', marginBottom: '8px', fontWeight: 600 }}>Please fill all fields marked with *</div>}
              <button disabled={!isStep1Valid} className="bsm s" style={{ padding: '12px 30px', opacity: isStep1Valid ? 1 : 0.5 }} onClick={() => setStep(2)}>Continue to Loan Details →</button>
            </div>
          </div>
        )}

        {/* STEP 2: LOAN DETAILS */}
        {step === 2 && (
          <div className="fstep on">
             <div className="review-hd" style={{ marginBottom: '25px' }}>💰 Loan Details</div>
             <div className="fgrid">
                <div className="fg2"><label className="fl2">Loan Amount Requested (₹) <span className="req">*</span></label><div className="fi2w"><span className="fic">₹</span><input className="fi2 wp" type="number" value={loanAmt === 0 ? '' : loanAmt} onChange={e => setLoanAmt(Number(e.target.value))} placeholder="e.g. 25000" /></div><div className="amt-words">{amountInWords}</div></div>
                <div className="fg2"><label className="fl2">Loan Purpose <span className="req">*</span></label><select className="sel2" value={loanType} onChange={e => setLoanType(e.target.value)}><option value="">— Choose Purpose —</option><option>Medical / Health Emergency</option><option>Education Fees</option><option>Marriage Assistance</option><option>Small Business Debt Relief</option><option>Home Repair / Essential</option><option>Other</option></select></div>
                <div className="fg2 full"><label className="fl2">Reason / Details <span className="req">*</span></label><textarea className="ta2" value={loanDesc} onChange={e => setLoanDesc(e.target.value)} placeholder="Briefly describe why you need this loan..." /></div>
             </div>

             <div style={{ marginTop: '25px' }}>
                <label className="fl2">Repayment Period <span className="req">*</span></label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginTop: '10px' }}>
                  {[3, 6, 9, 12].map(m => (
                    <div key={m} className={`rcard ${tenure === m ? 'rt' : ''}`} style={{ padding: '15px' }} onClick={() => setTenure(m)}>
                      <input type="radio" checked={tenure === m} readOnly style={{ accentColor: 'var(--teal)' }} />
                      <div style={{ marginLeft: '10px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700 }}>{m} Months</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{m} installments</div>
                      </div>
                    </div>
                  ))}
                </div>
             </div>

             <div className="emi-box" style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', padding: '18px 24px', borderRadius: '16px', marginTop: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                   <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Estimated EMI</div>
                   <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--teal)' }}>₹{emi.toLocaleString()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                   <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>{tenure || 0} Month Period</div>
                   <div style={{ fontSize: '11px', color: '#64748b' }}>No Interest · No Admin Fees</div>
                </div>
             </div>

             <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px', alignItems: 'center' }}>
              <button className="bsm g" onClick={() => setStep(1)}>← Previous</button>
              <div style={{ textAlign: 'right' }}>
                {!isStep2Valid && <div style={{ fontSize: '11px', color: 'var(--red)', marginBottom: '8px', fontWeight: 600 }}>Please complete loan details</div>}
                <button disabled={!isStep2Valid} className="bsm s" style={{ padding: '12px 30px', opacity: isStep2Valid ? 1 : 0.5 }} onClick={() => setStep(3)}>Continue to Declaration →</button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: DECLARATION */}
        {step === 3 && (
          <div className="fstep on">
            <div className="review-hd" style={{ marginBottom: '25px' }}>📜 Declaration & Legal</div>
            <div className="decl-box" style={{ background: '#fefce8', color: '#854d0e', border: '1px solid #fde68a', padding: '20px', borderRadius: '12px', lineHeight: '1.6', marginBottom: '24px' }}>
              SKSSF Poyanad ശാഖയുടെ പലിശരഹിത വായ്പയിൽ ആവശ്യത്തിനായി <b>₹{loanAmt.toLocaleString()} (Rupees {amountInWords.replace(' Rupees Only', '')})</b> തുക എനിക്ക് അനുവദിച്ചു തരണമെന്നും പണം തിരിച്ചടക്കുന്നതിൽ വല്ല വീഴ്ചയും കാണിച്ചാൽ കമ്മിറ്റിയുടെ തീരുമാനം അംഗീകരിക്കാൻ ഞാൻ തയ്യാറാണ്.
            </div>

            {/* APPLICANT SIGNATURE CHOICE */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <label className="fl2" style={{ marginBottom: 0 }}>Applicant Signature <span className="req">*</span></label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setSigMode('draw')} className={`bsm ${sigMode === 'draw' ? 'o' : 'g'}`} style={{ fontSize: '10px', padding: '4px 10px' }}>✏️ Draw</button>
                  <button onClick={() => setSigMode('upload')} className={`bsm ${sigMode === 'upload' ? 'o' : 'g'}`} style={{ fontSize: '10px', padding: '4px 10px' }}>📎 Upload</button>
                </div>
              </div>

              {sigMode === 'draw' ? (
                <SignaturePad onSave={setSignature} placeholder="Draw your signature here..." />
              ) : (
                <div className="sig-zone" onClick={() => document.getElementById('sig-up')?.click()} style={{ border: '2px dashed #cbd5e1', borderRadius: '12px', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: signature ? '#fff' : '#f8fafc', transition: 'all .2s' }}>
                  {signature ? (
                    <img src={signature} alt="Signature" style={{ maxHeight: '100px' }} />
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px' }}>📁</div>
                      <div style={{ fontWeight: 700, marginTop: '5px', fontSize: '13px' }}>Upload Scanned Signature</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>PNG/JPG format (Click to browse)</div>
                    </div>
                  )}
                  <input type="file" id="sig-up" hidden accept="image/*" onChange={handleSignatureUpload} />
                </div>
              )}
              {signature && <div style={{ fontSize: '10px', color: 'var(--teal)', fontWeight: 800, marginTop: '6px' }}>✓ Signature Recorded</div>}
            </div>

            {/* WITNESSES SECTION */}
            <div style={{ marginTop: '30px' }}>
              <div className="fl2" style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 800 }}>Guarantors / Witnesses <span className="req">* (2 Required)</span></div>
              <div className="witness-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
                {witnesses.map((w, i) => (
                  <div key={i} style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal)' }}>WITNESS #{i+1}</div>
                      {w.otpVerified && (
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '2px 8px', borderRadius: '8px' }}>✓ OTP VERIFIED</span>
                      )}
                    </div>
                    <label className="fl2" style={{ fontSize: '11px' }}>Full Name</label>
                    <input 
                      className="fi2" 
                      style={{ marginBottom: '10px' }} 
                      value={w.name} 
                      onChange={e => updateWitness(i, 'name', e.target.value)} 
                      placeholder="Witness Name" 
                      disabled={w.otpVerified || w.otpSent} 
                    />
                    <label className="fl2" style={{ fontSize: '11px' }}>Email Address</label>
                    <input 
                      type="email"
                      className="fi2" 
                      style={{ marginBottom: '12px' }} 
                      value={w.email || ''} 
                      onChange={e => updateWitness(i, 'email', e.target.value)} 
                      placeholder="witness@example.com" 
                      disabled={w.otpVerified || w.otpSent} 
                    />

                    {w.otpVerified ? (
                      <div style={{ textAlign: 'center', padding: '10px 0' }}>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', padding: '10px', display: 'flex', justifyContent: 'center' }}>
                          <img src={w.signature} alt="Verified Badge" style={{ height: '60px' }} />
                        </div>
                        <button 
                          className="bsm g" 
                          style={{ marginTop: '10px', width: '100%', fontSize: '11px' }}
                          onClick={() => {
                            const updated = [...witnesses];
                            updated[i] = { ...w, otpSent: false, otpVerified: false, otpCode: '', inputOtp: '', signature: '', timer: 0 };
                            setWitnesses(updated);
                          }}
                        >
                          Change / Reset Witness
                        </button>
                      </div>
                    ) : (
                      <div>
                        {!w.otpSent ? (
                          <button 
                            className="bsm s" 
                            style={{ width: '100%', padding: '10px', fontWeight: 700 }}
                            onClick={() => sendWitnessOtp(i)}
                            disabled={!w.name.trim() || !w.email?.trim()}
                          >
                            Send Verification OTP
                          </button>
                        ) : (
                          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label className="fl2" style={{ fontSize: '10px', margin: 0, fontWeight: 800 }}>Enter 6-Digit OTP</label>
                              <span style={{ fontSize: '10px', color: '#64748b' }}>
                                {w.timer > 0 ? `Resend in ${w.timer}s` : 'Ready to resend'}
                              </span>
                            </div>
                            <input 
                              type="text" 
                              maxLength={6} 
                              className="fi2" 
                              style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '16px', fontWeight: 800 }} 
                              placeholder="000000"
                              value={w.inputOtp || ''}
                              onChange={e => updateWitness(i, 'inputOtp', e.target.value.replace(/[^0-9]/g, ''))}
                            />
                            

                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                              <button 
                                className="bsm s" 
                                style={{ flex: 1, padding: '6px', fontSize: '11px' }}
                                onClick={() => verifyWitnessOtp(i)}
                              >
                                Verify OTP
                              </button>
                              <button 
                                className="bsm o" 
                                style={{ padding: '6px 12px', fontSize: '11px' }}
                                onClick={() => sendWitnessOtp(i)}
                                disabled={w.timer > 0}
                              >
                                Resend
                              </button>
                              <button 
                                className="bsm g" 
                                style={{ padding: '6px 12px', fontSize: '11px' }}
                                onClick={() => {
                                  const updated = [...witnesses];
                                  updated[i] = { ...w, otpSent: false, inputOtp: '', timer: 0 };
                                  setWitnesses(updated);
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px', alignItems: 'center' }}>
              <button className="bsm g" onClick={() => setStep(2)}>← Previous</button>
              <div style={{ textAlign: 'right' }}>
                {!isStep3Valid && <div style={{ fontSize: '11px', color: 'var(--red)', marginBottom: '8px', fontWeight: 600 }}>Please enter names, email addresses, and verify OTP for both witnesses.</div>}
                <button disabled={!isStep3Valid} className="bsm s" style={{ padding: '12px 30px', opacity: isStep3Valid ? 1 : 0.5 }} onClick={() => setStep(4)}>Review Final Application →</button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: REVIEW */}
        {step === 4 && (
          <div className="fstep on">
            <div className="review-hd" style={{ marginBottom: '25px' }}>🔍 Final Review</div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '24px' }}>
              <div>
                <div className="review-card" style={{ marginBottom: '20px', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ background: '#f8fafc', padding: '10px 15px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 800, color: 'var(--teal)' }}>PERSONAL PROFILE</div>
                  <div className="review-grid" style={{ padding: '15px' }}>
                    <div className="review-item"><span className="review-lbl">Name</span><span className="review-val">{personal.name}</span></div>
                    <div className="review-item"><span className="review-lbl">Father's Name</span><span className="review-val">{personal.fatherName}</span></div>
                    <div className="review-item"><span className="review-lbl">DOB</span><span className="review-val">{personal.dob} ({age})</span></div>
                    <div className="review-item"><span className="review-lbl">Aadhaar</span><span className="review-val">{personal.aadhaar}</span></div>
                    <div className="review-item" style={{ gridColumn: '1/-1' }}><span className="review-lbl">Address</span><span className="review-val">{personal.address}</span></div>
                  </div>
                </div>

                <div className="review-card" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ background: '#f8fafc', padding: '10px 15px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 800, color: 'var(--teal)' }}>LOAN SUMMARY</div>
                  <div className="review-grid" style={{ padding: '15px' }}>
                    <div className="review-item"><span className="review-lbl">Amount</span><span className="review-val" style={{ color: 'var(--teal)', fontWeight: 900 }}>₹{loanAmt.toLocaleString()}</span></div>
                    <div className="review-item"><span className="review-lbl">Purpose</span><span className="review-val">{loanType}</span></div>
                    <div className="review-item"><span className="review-lbl">EMIs</span><span className="review-val">{tenure} Months</span></div>
                    <div className="review-item"><span className="review-lbl">EMI Amount</span><span className="review-val">₹{emi.toLocaleString()}</span></div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ background: 'var(--bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '15px', textTransform: 'uppercase' }}>Consensus Signatures</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                       <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <img src={signature} alt="Applicant" style={{ height: '40px', borderBottom: '1px solid #000' }} />
                          <div style={{ fontSize: '10px' }}><b>Applicant</b><br/>{personal.name}</div>
                       </div>
                       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div style={{ textAlign: 'center' }}>
                             <img src={witnesses[0].signature} alt="Wit1" style={{ height: '50px', maxWidth: '100%', borderBottom: '1px solid #ccc' }} />
                             <div style={{ fontSize: '9px', marginTop: '4px' }}><b>Witness 1</b><br/>{witnesses[0].name}</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                             <img src={witnesses[1].signature} alt="Wit2" style={{ height: '50px', maxWidth: '100%', borderBottom: '1px solid #ccc' }} />
                             <div style={{ fontSize: '9px', marginTop: '4px' }}><b>Witness 2</b><br/>{witnesses[1].name}</div>
                          </div>
                       </div>
                    </div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <button className="bsm s" style={{ background: 'var(--teal)', color: '#fff', padding: '15px', width: '100%', fontSize: '15px', fontWeight: 700, marginBottom: '10px' }} onClick={() => setShowConfirm(true)}>
                    Confirm & Submit Application
                  </button>
                  <button className="bsm g" style={{ width: '100%' }} onClick={() => setStep(3)}>← Back to Edit</button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      <ConfirmDialog
        open={showConfirm}
        icon="📝"
        title="Confirm Submission"
        message={`You are submitting a loan application for ₹${loanAmt.toLocaleString()}. This cannot be edited once under committee review.`}
        confirmLabel={isSubmitting ? "Processing..." : "Yes, Submit Now"}
        cancelLabel="Wait, check again"
        onConfirm={submitLoan}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
