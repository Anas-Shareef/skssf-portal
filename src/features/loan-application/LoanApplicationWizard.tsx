import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle,
  FileText,
  IndianRupee,
  ShieldCheck,
  User
} from 'lucide-react';
import {
  GENDER_OPTIONS,
  OCCUPATION_OPTIONS,
  OTHER_PURPOSE_VALUE,
  PURPOSE_OPTIONS,
  REPAYMENT_MONTH_OPTIONS,
  WIZARD_STEPS
} from './options';
import { emptyDraft } from './types';
import type { FilingMode, LoanApplicationDraft, SubmitOutcome } from './types';
import { validateStep } from './validation';

export type LoanApplicationWizardProps = {
  mode: FilingMode;
  memberName?: string | null;
  memberCode?: string | null;
  initialDraft?: Partial<LoanApplicationDraft>;
  submit: (draft: LoanApplicationDraft) => Promise<SubmitOutcome>;
  onSuccess: (outcome: SubmitOutcome) => void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  submitLabel?: string;
};

const sectionTitleStyle = {
  fontSize: '18px',
  fontWeight: 950,
  color: '#0f172a',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
} as const;

const sectionHintStyle = { fontSize: '12px', color: '#64748b', marginTop: '4px' } as const;

const groupHeadingStyle = {
  margin: '0 0 12px 0',
  fontSize: '13px',
  fontWeight: 900,
  color: '#0f172a',
  textTransform: 'uppercase'
} as const;

export default function LoanApplicationWizard({
  mode,
  memberName,
  memberCode,
  initialDraft,
  submit,
  onSuccess,
  onCancel,
  onDirtyChange,
  submitLabel
}: LoanApplicationWizardProps) {
  const [draft, setDraft] = useState<LoanApplicationDraft>({ ...emptyDraft, ...initialDraft });
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const touchedRef = useRef(false);

  function setField<K extends keyof LoanApplicationDraft>(key: K, value: LoanApplicationDraft[K]) {
    touchedRef.current = true;
    setDraft(previous => ({ ...previous, [key]: value }));
  }

  // Keep the WhatsApp number in sync while "same as mobile" is checked.
  useEffect(() => {
    if (draft.sameWhatsapp) setDraft(previous => (previous.whatsapp === previous.phone ? previous : { ...previous, whatsapp: previous.phone }));
  }, [draft.sameWhatsapp, draft.phone]);

  useEffect(() => {
    if (touchedRef.current) onDirtyChange?.(true);
  }, [draft, onDirtyChange]);

  const goToStep = (step: number) => {
    setCurrentStep(step);
    setError('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextStep = () => {
    const problem = validateStep(currentStep, draft, mode);
    if (problem) {
      setError(problem);
      return;
    }
    goToStep(Math.min(6, currentStep + 1));
  };

  const handlePrevStep = () => goToStep(Math.max(1, currentStep - 1));

  const handleSubmit = async () => {
    for (let step = 1; step <= 6; step += 1) {
      const problem = validateStep(step, draft, mode);
      if (problem) {
        setCurrentStep(step);
        setError(problem);
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    setSubmitting(true);
    setError('');
    try {
      const outcome = await submit(draft);
      onSuccess(outcome);
    } catch (err: any) {
      setError(err?.message || 'The application could not be saved. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const amountValue = parseFloat(draft.amountRequested) || 0;
  const tenureMonths = parseInt(draft.repaymentMonths) || 3;
  const calculatedEMI = amountValue > 0 ? Math.round(amountValue / tenureMonths) : 0;
  const isMember = mode === 'member';

  return (
    <div>
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

          {memberName && (
            <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px 14px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.15)', fontSize: '12px', maxWidth: '280px' }}>
              <div style={{ opacity: 0.7, fontSize: '10px', textTransform: 'uppercase', fontWeight: 800 }}>
                {isMember ? 'Filing as Member' : 'Referred By Member'}
              </div>
              <div style={{ fontWeight: 900, color: '#38bdf8', marginTop: '2px' }}>✓ {memberName}{memberCode ? ` (${memberCode})` : ''}</div>
              {isMember && (
                <div style={{ marginTop: '6px', fontSize: '11px', opacity: 0.85, lineHeight: 1.45 }}>
                  Enter the details of the person requesting the loan. Your member identity is recorded as the filing agent, not as the applicant.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 6-STEP WIZARD PROGRESS BAR */}
      <div className="card" style={{ background: '#fff', borderRadius: '20px', padding: '16px 20px', marginBottom: '24px', border: '1.5px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', overflowX: 'auto', gap: '12px' }}>
          {WIZARD_STEPS.map(step => {
            const isActive = currentStep === step.num;
            const isDone = currentStep > step.num;
            return (
              <div
                key={step.num}
                onClick={() => isDone && goToStep(step.num)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '80px', cursor: isDone ? 'pointer' : 'default' }}
              >
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
                  {isDone ? <Check size={18} /> : step.num}
                </div>
                <div style={{ fontSize: '11px', fontWeight: isActive ? 900 : 700, color: isActive ? '#0f172a' : '#64748b', marginTop: '6px', textAlign: 'center' }}>
                  {step.title}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 16px', borderRadius: '14px', marginBottom: '18px', fontSize: '13px', fontWeight: 700, lineHeight: 1.5 }}>
          <AlertCircle size={18} style={{ flex: '0 0 auto', marginTop: '1px' }} />
          <span>{error}</span>
        </div>
      )}

      {/* MAIN WIZARD STEP CONTAINER */}
      <div className="card" style={{ background: '#fff', borderRadius: '24px', padding: '32px', border: '1.5px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.03)' }}>

        {/* STEP 1: PERSONAL INFORMATION */}
        {currentStep === 1 && (
          <div>
            <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={sectionTitleStyle}>
                <User size={20} color="var(--teal)" /> 01 — അപേക്ഷകന്റെ വിവരങ്ങൾ (Applicant Information)
              </h3>
              <div style={sectionHintStyle}>Enter full personal identity details as per official records</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Applicant Full Name * (അപേക്ഷകന്റെ പേര്)</label>
                <input
                  type="text"
                  placeholder="Complete legal name"
                  value={draft.fullName}
                  onChange={e => setField('fullName', e.target.value)}
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
                  value={draft.fatherName}
                  onChange={e => setField('fatherName', e.target.value)}
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
                    value={draft.dob}
                    onChange={e => setField('dob', e.target.value)}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Gender * (സ്ത്രീ / പുരുഷൻ)</label>
                  <select
                    value={draft.gender}
                    onChange={e => setField('gender', e.target.value)}
                    className="sel2"
                    style={{ width: '100%', height: '42px' }}
                  >
                    {GENDER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Mobile Phone Number (10 digits) * (ഫോൺ നമ്പർ)</label>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="Mobile number"
                  value={draft.phone}
                  onChange={e => setField('phone', e.target.value.replace(/\D/g, ''))}
                  className="fi2"
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={draft.sameWhatsapp}
                    onChange={e => setField('sameWhatsapp', e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--teal)' }}
                  />
                  ☑ WhatsApp number is the same as mobile number
                </label>
              </div>

              {!draft.sameWhatsapp && (
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>WhatsApp Number *</label>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="WhatsApp mobile number"
                    value={draft.whatsapp}
                    onChange={e => setField('whatsapp', e.target.value.replace(/\D/g, ''))}
                    className="fi2"
                    style={{ width: '100%' }}
                    required
                  />
                </div>
              )}

              {/* Structured Address */}
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '16px', border: '1px solid #e2e8f0', marginTop: '6px' }}>
                <h4 style={groupHeadingStyle}>Full Address Details (മേൽവിലാസം)</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>House Name / House No. *</label>
                    <input
                      type="text"
                      placeholder="e.g. Baitul Noor, House No. 42"
                      value={draft.addressHouse}
                      onChange={e => setField('addressHouse', e.target.value)}
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
                        value={draft.addressPlace}
                        onChange={e => setField('addressPlace', e.target.value)}
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
                        value={draft.addressPost}
                        onChange={e => setField('addressPost', e.target.value)}
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
                        value={draft.addressPin}
                        onChange={e => setField('addressPin', e.target.value.replace(/\D/g, ''))}
                        className="fi2"
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                    <div>
                      <label className="fl2" style={{ fontWeight: 800 }}>District *</label>
                      <input
                        type="text"
                        value={draft.addressDistrict}
                        onChange={e => setField('addressDistrict', e.target.value)}
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
              <h3 style={sectionTitleStyle}>
                <FileText size={20} color="var(--teal)" /> 02 — തൊഴിൽ & സാമ്പത്തിക വിവരങ്ങൾ (Employment & Financials)
              </h3>
              <div style={sectionHintStyle}>Provide accurate details of the applicant's livelihood and monthly earnings</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Occupation * (തൊഴിൽ)</label>
                <select
                  value={draft.occupation}
                  onChange={e => setField('occupation', e.target.value)}
                  className="sel2"
                  style={{ width: '100%', height: '42px' }}
                >
                  {OCCUPATION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              {draft.occupation === 'Other' && (
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Specify Occupation *</label>
                  <input
                    type="text"
                    placeholder="Specify the exact job role"
                    value={draft.otherOccupation}
                    onChange={e => setField('otherOccupation', e.target.value)}
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
                  value={draft.employerName}
                  onChange={e => setField('employerName', e.target.value)}
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
                    value={draft.monthlyIncome}
                    onChange={e => setField('monthlyIncome', e.target.value)}
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
                    value={draft.incomeSource}
                    onChange={e => setField('incomeSource', e.target.value)}
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
                    checked={draft.existingDebts}
                    onChange={e => setField('existingDebts', e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--teal)' }}
                  />
                  Do you have any existing loans or debts? (നിലവിൽ വായ്പകൾ ഉണ്ടോ)
                </label>

                {draft.existingDebts && (
                  <div style={{ marginTop: '12px' }}>
                    <label className="fl2" style={{ fontWeight: 800 }}>Existing Debts Details *</label>
                    <textarea
                      placeholder="Specify existing loan amounts, bank/person, and monthly dues..."
                      value={draft.existingDebtsDetail}
                      onChange={e => setField('existingDebtsDetail', e.target.value)}
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
              <h3 style={sectionTitleStyle}>
                <IndianRupee size={20} color="var(--teal)" /> 03 — വായ്പാ വിവരങ്ങൾ (Loan Specifications)
              </h3>
              <div style={sectionHintStyle}>Specify loan amount, category, and preferred repayment period</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Requested Loan Amount (₹) * (അഭ്യർത്ഥിക്കുന്ന തുക - Max ₹50,000)</label>
                <input
                  type="number"
                  min={1000}
                  max={50000}
                  placeholder="₹ Enter amount (e.g. 30000)"
                  value={draft.amountRequested}
                  onChange={e => setField('amountRequested', e.target.value)}
                  className="fi2"
                  style={{ width: '100%', fontSize: '16px', fontWeight: 800, color: 'var(--teal)' }}
                  required
                />
              </div>

              <div>
                <label className="fl2" style={{ fontWeight: 800 }}>Loan Purpose Category * (ആവശ്യം)</label>
                <select
                  value={draft.purposeCategory}
                  onChange={e => setField('purposeCategory', e.target.value)}
                  className="sel2"
                  style={{ width: '100%', height: '42px' }}
                >
                  {PURPOSE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              {draft.purposeCategory === OTHER_PURPOSE_VALUE && (
                <div>
                  <label className="fl2" style={{ fontWeight: 800 }}>Specify Purpose Category *</label>
                  <input
                    type="text"
                    placeholder="Specify the loan category"
                    value={draft.otherPurpose}
                    onChange={e => setField('otherPurpose', e.target.value)}
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
                  value={draft.purposeDetail}
                  onChange={e => setField('purposeDetail', e.target.value)}
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
                  {REPAYMENT_MONTH_OPTIONS.map(month => {
                    const isSelected = draft.repaymentMonths === month;
                    return (
                      <div
                        key={month}
                        onClick={() => setField('repaymentMonths', month)}
                        style={{
                          padding: '16px',
                          borderRadius: '16px',
                          border: isSelected ? '2px solid var(--teal)' : '1.5px solid #e2e8f0',
                          background: isSelected ? '#f0fdf4' : '#fff',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ fontSize: '18px', fontWeight: 950, color: isSelected ? '#166534' : '#0f172a' }}>{month} Month{month !== '1' ? 's' : ''}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>({month} മാസം)</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Automatic Installment Calculation Card */}
              {amountValue > 0 && (
                <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '20px', border: '1.5px solid #bbf7d0', marginTop: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#166534', textTransform: 'uppercase', marginBottom: '10px' }}>
                    ⚡ Automatic Repayment Installment Summary
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
                    <div style={{ background: '#fff', padding: '12px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Total Loan</div>
                      <div style={{ fontSize: '16px', fontWeight: 950, color: '#0f172a', marginTop: '2px' }}>₹{amountValue.toLocaleString()}</div>
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
              <h3 style={sectionTitleStyle}>
                <User size={20} color="var(--teal)" /> 04 — സാക്ഷി / ജാമ്യക്കാരൻ (Witness / Guarantor Details)
              </h3>
              <div style={sectionHintStyle}>Provide two verified branch witnesses or guarantors for reference</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Witness 1 */}
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                <h4 style={groupHeadingStyle}>Witness / Guarantor 1 (ഒന്നാം സാക്ഷി)</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Full Name *</label>
                    <input
                      type="text"
                      placeholder="Witness 1 name"
                      value={draft.witness1Name}
                      onChange={e => setField('witness1Name', e.target.value)}
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
                        value={draft.witness1Phone}
                        onChange={e => setField('witness1Phone', e.target.value.replace(/\D/g, ''))}
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
                        value={draft.witness1MemNo}
                        onChange={e => setField('witness1MemNo', e.target.value)}
                        className="fi2"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Relationship to Applicant (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Neighbour, relative, community member"
                      value={draft.witness1Relationship}
                      onChange={e => setField('witness1Relationship', e.target.value)}
                      className="fi2"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </div>

              {/* Witness 2 */}
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                <h4 style={groupHeadingStyle}>Witness / Guarantor 2 (രണ്ടാം സാക്ഷി)</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Full Name *</label>
                    <input
                      type="text"
                      placeholder="Witness 2 name"
                      value={draft.witness2Name}
                      onChange={e => setField('witness2Name', e.target.value)}
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
                        value={draft.witness2Phone}
                        onChange={e => setField('witness2Phone', e.target.value.replace(/\D/g, ''))}
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
                        value={draft.witness2MemNo}
                        onChange={e => setField('witness2MemNo', e.target.value)}
                        className="fi2"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="fl2" style={{ fontWeight: 800 }}>Relationship to Applicant (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Neighbour, relative, community member"
                      value={draft.witness2Relationship}
                      onChange={e => setField('witness2Relationship', e.target.value)}
                      className="fi2"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.55, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '14px', padding: '12px 14px' }}>
                Each witness will receive a separate secure verification link. The link records their consent response; it is not independent proof that the WhatsApp number belongs to them.
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: DECLARATION */}
        {currentStep === 5 && (
          <div>
            <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={sectionTitleStyle}>
                <ShieldCheck size={20} color="var(--teal)" /> 05 — സത്യവാങ്മൂലം (Declaration)
              </h3>
              <div style={sectionHintStyle}>Review the branch declaration before submitting the application</div>
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
                    checked={draft.confirmTruth}
                    onChange={e => setField('confirmTruth', e.target.checked)}
                    style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: 'var(--teal)' }}
                  />
                  <span>I confirm that the information provided in this application is true and correct. (വിവരങ്ങൾ സത്യസന്ധമാണെന്ന് ഉറപ്പുനൽകുന്നു)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={draft.confirmSchedule}
                    onChange={e => setField('confirmSchedule', e.target.checked)}
                    style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: 'var(--teal)' }}
                  />
                  <span>I agree to repay the approved loan according to the repayment schedule decided by SKSSF Poyanad Branch. (തിരിച്ചടവ് ഷെഡ്യൂൾ പാലിക്കുമെന്ന് സമ്മതിക്കുന്നു)</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: REVIEW & SUBMIT */}
        {currentStep === 6 && (
          <div>
            <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={sectionTitleStyle}>
                <CheckCircle size={20} color="var(--teal)" /> 06 — അപേക്ഷാ പരിശോധന (Application Final Review)
              </h3>
              <div style={sectionHintStyle}>Verify all details before final submission to SKSSF Poyanad Branch</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isMember && (
                <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '16px', border: '1.5px solid #bfdbfe' }}>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase' }}>Member filing details</h4>
                  <p style={{ margin: '6px 0 12px 0', fontSize: '12px', color: '#1e40af', lineHeight: 1.5 }}>
                    You are filing this application on behalf of <b>{draft.fullName || 'the applicant'}</b>. Your member identity is stored as the filing agent; the applicant remains the person named above.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label className="fl2" style={{ fontWeight: 800 }}>Your Relationship to the Applicant *</label>
                      <input
                        type="text"
                        placeholder="e.g. Relative, neighbour, community member"
                        value={draft.memberRelationship}
                        onChange={e => setField('memberRelationship', e.target.value)}
                        className="fi2"
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                    <div>
                      <label className="fl2" style={{ fontWeight: 800 }}>Member Assessment Notes * (Min 20 chars)</label>
                      <textarea
                        placeholder="Your assessment of the applicant's request, background and credibility..."
                        value={draft.memberNotes}
                        onChange={e => setField('memberNotes', e.target.value)}
                        className="ta2"
                        rows={3}
                        style={{ width: '100%' }}
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Card 1: Personal */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>1. Applicant Identity</h4>
                  <button type="button" onClick={() => goToStep(1)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>Edit</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: '#334155' }}>
                  <div><b>Name:</b> {draft.fullName}</div>
                  <div><b>Father:</b> {draft.fatherName}</div>
                  <div><b>DOB / Gender:</b> {draft.dob} ({draft.gender})</div>
                  <div><b>Mobile:</b> {draft.phone}</div>
                  <div style={{ gridColumn: 'span 2' }}><b>Address:</b> {draft.addressHouse}, {draft.addressPlace}, {draft.addressPost} P.O., {draft.addressDistrict} - {draft.addressPin}</div>
                </div>
              </div>

              {/* Summary Card 2: Employment */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>2. Employment & Income</h4>
                  <button type="button" onClick={() => goToStep(2)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>Edit</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: '#334155' }}>
                  <div><b>Occupation:</b> {draft.occupation === 'Other' ? draft.otherOccupation : draft.occupation}</div>
                  <div><b>Employer:</b> {draft.employerName || 'N/A'}</div>
                  <div><b>Monthly Income:</b> ₹{Number(draft.monthlyIncome).toLocaleString()}</div>
                  <div><b>Income Source:</b> {draft.incomeSource}</div>
                </div>
              </div>

              {/* Summary Card 3: Loan */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>3. Loan Specifications</h4>
                  <button type="button" onClick={() => goToStep(3)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>Edit</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: '#334155' }}>
                  <div><b>Requested Amount:</b> <span style={{ color: 'var(--teal)', fontWeight: 900 }}>₹{Number(draft.amountRequested).toLocaleString()}</span></div>
                  <div><b>Repayment Period:</b> {draft.repaymentMonths} Months</div>
                  <div><b>Category:</b> {draft.purposeCategory}</div>
                  <div><b>Interest:</b> <span style={{ color: '#10b981', fontWeight: 900 }}>₹0 (Interest-Free)</span></div>
                  <div style={{ gridColumn: 'span 2' }}><b>Detailed Purpose:</b> {draft.purposeDetail}</div>
                </div>
              </div>

              {/* Summary Card 4: Witnesses */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>4. Witnesses & Guarantors</h4>
                  <button type="button" onClick={() => goToStep(4)} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>Edit</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: '#334155' }}>
                  <div><b>Witness 1:</b> {draft.witness1Name} ({draft.witness1Phone})</div>
                  <div><b>Witness 2:</b> {draft.witness2Name} ({draft.witness2Phone})</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* WIZARD NAVIGATION FOOTER BUTTONS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px', borderTop: '1px solid #f1f5f9', paddingTop: '20px', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                className="bsm g"
                style={{ padding: '12px 20px', borderRadius: '12px', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                ← Back
              </button>
            ) : null}
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="bsm g"
                style={{ padding: '12px 20px', borderRadius: '12px', fontWeight: 800, fontSize: '13px' }}
              >
                Cancel
              </button>
            ) : null}
          </div>

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
              style={{ padding: '14px 28px', borderRadius: '14px', fontWeight: 950, fontSize: '15px', background: '#10b981', opacity: submitting ? 0.75 : 1 }}
            >
              {submitting ? 'Submitting Application...' : (submitLabel || 'Submit Application to Poyanad Committee ✓')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
