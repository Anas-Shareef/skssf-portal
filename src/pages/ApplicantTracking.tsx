/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are validated and shaped by the tracking endpoint. */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Clock3, Copy, Edit3, FileSearch, LockKeyhole, RotateCcw, SearchCheck, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type TrackingMode = 'reference' | 'mobile';

type TrackingMatch = {
  sessionToken: string;
  reference: string | null;
  applicantName: string | null;
  submittedAt: string | null;
};

type RepaymentRow = {
  installment_number: number;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  payment_date: string | null;
  status: string;
};

type TrackingApplication = {
  reference: string;
  applicant: Record<string, any>;
  loan: Record<string, any>;
  witnesses: Array<Record<string, any>>;
  status: { code: string; label: string; stage: string };
  submitted_at: string;
  updated_at: string;
  current_version: number;
  editable: boolean;
};

type WitnessProgress = {
  overall: string;
  verifiedCount: number;
  requiredCount: number;
  witnesses: Array<{
    index: number;
    name: string | null;
    status: string | null;
    issuedAt?: string | null;
    expiresAt?: string | null;
    respondedAt?: string | null;
    sharedAt?: string | null;
  }>;
};

const display = (value: any) => value === null || value === undefined || value === '' ? 'Not recorded' : String(value);
const dateTime = (value: any) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
const money = (value: any) => value === null || value === undefined || value === '' ? 'Not recorded' : `₹${Number(value).toLocaleString('en-IN')}`;

export default function ApplicantTracking() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<TrackingMode>('reference');
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [otpCells, setOtpCells] = useState<string[]>(() => Array(6).fill(''));
  const [stage, setStage] = useState<'form' | 'otp' | 'select' | 'details'>('form');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [matches, setMatches] = useState<TrackingMatch[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const [sessionToken, setSessionToken] = useState('');
  const [application, setApplication] = useState<TrackingApplication | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [repayments, setRepayments] = useState<RepaymentRow[]>([]);
  const [witnessProgress, setWitnessProgress] = useState<WitnessProgress | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const otp = otpCells.join('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const callApi = async (body: Record<string, any>, token = '') => {
    const response = await fetch('/api/track-application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to complete verification.');
    return data;
  };

  const resetVerification = () => {
    setOtpCells(Array(6).fill(''));
    setCooldown(0);
    setMaskedPhone('');
    setMatches([]);
    setError('');
    setNotice('');
  };

  const sendCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const data = await callApi(mode === 'reference'
        ? { action: 'send', mode, reference: reference.trim().toUpperCase() }
        : { action: 'send', mode, phone: cleanPhone });
      setPhone(cleanPhone);
      setOtpCells(Array(6).fill(''));
      setMaskedPhone(data.maskedPhone || '');
      setStage('otp');
      setCooldown(60);
      setNotice(data.message || 'If the details match, a verification code has been sent.');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otp.length !== 6) { setError('Enter the 6-digit verification code.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await callApi({
        action: 'verify',
        mode,
        ...(mode === 'reference' ? { reference: reference.trim().toUpperCase() } : { phone: phone.replace(/\D/g, '') }),
        otp
      });
      const found: TrackingMatch[] = data.applications || [];
      if (!found.length) throw new Error('Verification failed or expired.');
      setMatches(found);
      if (found.length === 1) {
        setSessionToken(found[0].sessionToken);
        await loadDetails(found[0].sessionToken);
        setStage('details');
      } else {
        setStage('select');
      }
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const selectApplication = async (match: TrackingMatch) => {
    setBusy(true); setError('');
    try {
      setSessionToken(match.sessionToken);
      await loadDetails(match.sessionToken);
      setStage('details');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const loadDetails = async (token = sessionToken) => {
    const data = await callApi({ action: 'details' }, token);
    setApplication(data.application);
    setHistory(data.history || []);
    setEvents(data.events || []);
    setRepayments(data.repayments || []);
    setWitnessProgress(data.witnessProgress || null);
  };

  const startEditing = () => {
    if (!application) return;
    const a = application.applicant;
    const l = application.loan;
    setEditData({
      applicant_name: a.name || '', applicant_phone: a.phone || '', applicant_whatsapp: a.whatsapp || '',
      applicant_dob: a.dob || '', applicant_gender: a.gender || '', applicant_father_name: a.father_name || '',
      requester_address: a.address || '', applicant_address_house: a.address_house || '', applicant_address_street: a.address_street || '',
      applicant_address_city: a.address_city || '', applicant_address_pin: a.address_pin || '', applicant_occupation: l.occupation || '',
      applicant_employer_name: l.employer || '', loan_amount_requested: l.requested_amount || '', loan_purpose_category: l.purpose_category || '',
      loan_purpose_detail: l.purpose_details || '', repayment_period_months: l.repayment_period_months || '', monthly_income: l.monthly_income || '',
      income_source: l.income_source || '', existing_debts: !!l.existing_debts, existing_debts_detail: l.existing_debts_detail || '',
      witnesses: (application.witnesses.length >= 2 ? application.witnesses : [{}, {}]).slice(0, 2).map(w => ({ name: w.name || '', phone: w.phone || '', member_no: w.member_no || '' }))
    });
    setError(''); setNotice(''); setEditing(true);
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      await callApi({ action: 'edit', expectedVersion: application?.current_version, changes: editData }, sessionToken);
      await loadDetails();
      setEditing(false);
      setNotice('Your application changes were saved and added to its history.');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const setField = (key: string, value: any) => setEditData(previous => ({ ...previous, [key]: value }));
  const setWitness = (index: number, key: string, value: string) => setEditData(previous => ({ ...previous, witnesses: previous.witnesses.map((w: any, i: number) => i === index ? { ...w, [key]: value } : w) }));

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', padding: '28px 16px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: '980px', margin: '0 auto' }}>
        <button type="button" onClick={() => navigate(-1)} style={backButton}><ArrowLeft size={16} /> Back to loan services</button>
        <header style={{ margin: '18px 0 22px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#0f766e', fontWeight: 900, fontSize: '12px', letterSpacing: '.08em' }}><SearchCheck size={18} /> SECURE APPLICANT TRACKING</div>
          <h1 style={{ color: '#0f172a', margin: '10px 0 7px', fontSize: 'clamp(26px, 5vw, 40px)', letterSpacing: '-.04em' }}>{stage === 'details' ? 'Application details' : 'Track your application'}</h1>
          <p style={{ color: '#64748b', margin: 0, lineHeight: 1.6 }}>{stage === 'details' ? 'Only information recorded for your verified application is shown below.' : stage === 'select' ? 'Choose the application you want to open.' : 'Choose how you would like to find your loan application.'}</p>
        </header>

        {error && <div role="alert" style={alertStyle('#fef2f2', '#b91c1c')}>{error}</div>}
        {notice && <div role="status" style={alertStyle('#ecfdf5', '#047857')}>{notice}</div>}

        {stage === 'form' && (
          <section style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}><div style={iconStyle}><ShieldCheck size={22} /></div><div><h2 style={sectionTitle}>Verify your identity</h2><p style={muted}>We will send a one-time code without revealing whether a reference exists.</p></div></div>
            <div style={modeGrid}>
              <ModeCard active={mode === 'reference'} icon={<FileSearch size={20} />} title="Application Reference" subtitle="I have my application reference number." onClick={() => { setMode('reference'); setError(''); setNotice(''); }} />
              <ModeCard active={mode === 'mobile'} icon={<Smartphone size={20} />} title="Mobile Number" subtitle="Find applications using my registered mobile number." onClick={() => { setMode('mobile'); setError(''); setNotice(''); }} />
            </div>
            <form onSubmit={sendCode} style={{ ...formGrid, marginTop: '18px' }}>
              {mode === 'reference'
                ? <label style={labelStyle}>Application Reference Number<input required value={reference} onChange={e => setReference(e.target.value.toUpperCase())} placeholder="SKSSF-LN-2026-12345678" style={inputStyle} autoComplete="off" /></label>
                : <label style={labelStyle}>Registered Mobile Number<input required inputMode="numeric" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="Enter your 10-digit registered mobile number" style={inputStyle} autoComplete="tel" /></label>}
              <button disabled={busy} type="submit" style={primaryButton}>{busy ? 'Sending…' : 'Send Verification Code'} <ArrowRight size={16} /></button>
              <p style={{ ...muted, margin: 0 }}>Your identity will be verified using a one-time password sent to your registered mobile number.</p>
              <p style={{ ...muted, margin: 0 }}>If your application has no registered mobile number, contact the SKSSF branch office for secure assistance.</p>
            </form>
          </section>
        )}

        {stage === 'otp' && (
          <section style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}><div style={iconStyle}><ShieldCheck size={22} /></div><div><h2 style={sectionTitle}>Enter verification code</h2><p style={muted}>The code expires in 5 minutes and can only be used once.</p></div></div>
            <form onSubmit={verifyOtp} style={formGrid}>
              <div style={{ color: '#475569', fontSize: '13px' }}>Verification code sent to <strong>{maskedPhone || 'your registered mobile number'}</strong>.</div>
              <OtpInput cells={otpCells} onChange={setOtpCells} disabled={busy} />
              <button disabled={busy || otp.length !== 6} type="submit" style={primaryButton}>{busy ? 'Verifying…' : 'Verify & Track Application'}</button>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button disabled={busy || cooldown > 0} type="button" onClick={() => sendCode()} style={secondaryButton}><RotateCcw size={15} /> {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</button>
                <button type="button" onClick={() => { resetVerification(); setStage('form'); }} style={secondaryButton}>Change tracking method</button>
              </div>
            </form>
          </section>
        )}

        {stage === 'select' && (
          <section style={cardStyle}>
            <h2 style={sectionTitle}>Choose an application</h2>
            <p style={muted}>{matches.length} applications are registered to this mobile number. Select one to view its tracking details.</p>
            <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
              {matches.map(match => (
                <button key={match.sessionToken} type="button" disabled={busy} onClick={() => selectApplication(match)} style={matchRowStyle}>
                  <span style={{ display: 'grid', gap: '3px', textAlign: 'left' }}>
                    <strong style={{ color: '#0f766e', fontFamily: 'monospace', fontSize: '14px' }}>{match.reference || 'Reference pending'}</strong>
                    <span style={{ color: '#475569', fontSize: '13px' }}>{display(match.applicantName)} · Submitted {dateTime(match.submittedAt)}</span>
                  </span>
                  <ArrowRight size={18} color="#0f766e" />
                </button>
              ))}
            </div>
          </section>
        )}

        {stage === 'details' && application && (
          editing ? <EditApplication data={editData} setField={setField} setWitness={setWitness} onSubmit={saveEdit} onCancel={() => setEditing(false)} busy={busy} /> : <DetailsView application={application} events={events} history={history} repayments={repayments} witnessProgress={witnessProgress} onEdit={startEditing} onCopy={() => navigator.clipboard?.writeText(application.reference).then(() => setNotice('Reference copied.'))} />
        )}
      </div>
    </main>
  );
}

function DetailsView({ application, events, history, repayments, witnessProgress, onEdit, onCopy }: { application: TrackingApplication; events: any[]; history: any[]; repayments: RepaymentRow[]; witnessProgress: WitnessProgress | null; onEdit: () => void; onCopy: () => void }) {
  const a = application.applicant; const l = application.loan;
  return <div style={{ display: 'grid', gap: '18px' }}>
    <section style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}><div><div style={eyebrow}>CURRENT STATUS</div><h2 style={{ margin: '7px 0 4px', color: '#0f172a' }}>{application.status.label}</h2><div style={muted}>Last updated {dateTime(application.updated_at)}</div></div><div style={{ textAlign: 'right' }}><div style={eyebrow}>REFERENCE</div><div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '7px' }}><strong style={{ color: '#0f766e', fontFamily: 'monospace' }}>{application.reference}</strong><button type="button" onClick={onCopy} aria-label="Copy reference" style={smallButton}><Copy size={15} /></button></div></div></section>
    <ProgressTimeline application={application} events={events} witnessProgress={witnessProgress} />
    {application.editable && <div style={{ ...alertStyle('#eff6ff', '#1d4ed8'), display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}><span>Your application can be edited until it is forwarded for review.</span><button type="button" onClick={onEdit} style={secondaryButton}><Edit3 size={15} /> Edit application</button></div>}
    {!application.editable && <div style={alertStyle('#f8fafc', '#475569')}><LockKeyhole size={15} style={{ verticalAlign: 'middle', marginRight: '7px' }} /> Editing is locked after forwarding to the review workflow.</div>}
    <WitnessProgressBlock progress={witnessProgress} />
    {repayments.length > 0 && <RepaymentSchedule rows={repayments} />}
    <InfoSection title="Personal details" icon={<UserRound size={18} />} items={[["Name", a.name], ["Registered mobile", a.phone], ["WhatsApp", a.whatsapp], ["Date of birth", a.dob], ["Gender", a.gender], ["Father / guardian", a.father_name], ["Address", [a.address_house, a.address_street, a.address_city, a.address_pin].filter(Boolean).join(', ') || a.address]]} />
    <InfoSection title="Loan specifications" icon={<Clock3 size={18} />} items={[["Requested amount", money(l.requested_amount)], ["Repayment period", l.repayment_period_months ? `${l.repayment_period_months} months` : null], ["Monthly income", money(l.monthly_income)], ["Income source", l.income_source], ["Occupation", l.occupation], ["Purpose category", l.purpose_category], ["Purpose details", l.purpose_details], ["Existing debts", l.existing_debts ? `Yes${l.existing_debts_detail ? ` — ${l.existing_debts_detail}` : ''}` : 'No']]} />
    <section style={cardStyle}><h2 style={sectionTitle}>Witness verifications</h2>{application.witnesses.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginTop: '15px' }}>{application.witnesses.map((w, i) => <div key={i} style={{ padding: '15px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0' }}><strong>Witness {i + 1}</strong><div style={valueLine}>Name: {display(w.name)}</div><div style={valueLine}>Mobile: {display(w.phone)}</div><div style={valueLine}>Membership: {display(w.member_no)}</div><div style={valueLine}>Verification: {display(w.status)}</div></div>)}</div> : <p style={muted}>No witness information was provided with this application.</p>}</section>
    <section style={cardStyle}><h2 style={sectionTitle}>Application history</h2>{events.length ? <div style={{ marginTop: '15px', display: 'grid', gap: '12px' }}>{events.map((event, i) => <div key={`${event.created_at}-${i}`} style={{ display: 'flex', gap: '11px' }}><CheckCircle2 size={18} color="#0f766e" style={{ flex: '0 0 auto', marginTop: '2px' }} /><div><strong style={{ color: '#0f172a' }}>{event.status_code.replaceAll('_', ' ')}</strong><div style={muted}>{dateTime(event.created_at)}{event.applicant_visible_note ? ` — ${event.applicant_visible_note}` : ''}</div></div></div>)}</div> : <p style={muted}>No applicant-visible history events are recorded yet.</p>}{history.length > 1 && <p style={{ ...muted, marginTop: '16px' }}>Application versions recorded: {history.length}</p>}</section>
  </div>;
}

function WitnessProgressBlock({ progress }: { progress: WitnessProgress | null }) {
  const statusLabel = (status: string | null | undefined) => {
    switch (status) {
      case 'VERIFIED': return 'Verified';
      case 'DECLINED': return 'Declined';
      case 'EXPIRED': return 'Link expired';
      case 'REVOKED': return 'Link replaced';
      default: return 'Awaiting response';
    }
  };
  const statusColor = (status: string | null | undefined) => {
    if (status === 'VERIFIED') return '#166534';
    if (status === 'DECLINED') return '#991b1b';
    if (status === 'EXPIRED' || status === 'REVOKED') return '#92400e';
    return '#1e40af';
  };
  const witnesses = progress?.witnesses || [];
  return <section style={cardStyle}>
    <h2 style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={18} /> Witness verification progress</h2>
    <p style={{ ...muted, color: '#0f766e', fontWeight: 700, background: '#ecfdf5', borderRadius: '12px', padding: '12px 14px', marginTop: '12px' }}>
      Your loan application has been submitted successfully. We are waiting for the witness verification responses. No action is required from you.
    </p>
    {witnesses.length ? <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
      {witnesses.map(witness => <div key={witness.index} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '13px 15px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div>
          <div style={{ color: '#0f172a', fontWeight: 800 }}>Witness {witness.index}: {display(witness.name)}</div>
          <div style={{ ...muted, marginTop: '2px' }}>{witness.respondedAt ? `Responded ${dateTime(witness.respondedAt)}` : witness.status === 'PENDING' || !witness.status ? 'Waiting for their response' : 'No response recorded'}</div>
        </div>
        <div style={{ alignSelf: 'center', color: statusColor(witness.status), fontWeight: 900, fontSize: '13px' }}>{statusLabel(witness.status)}</div>
      </div>)}
    </div> : <p style={muted}>Witness verification details will appear here once they are issued.</p>}
    {progress && <p style={{ ...muted, marginTop: '12px' }}>{progress.verifiedCount} of {progress.requiredCount} witnesses verified. This section is read-only; the member who filed your application manages the verification links.</p>}
  </section>;
}

function InfoSection({ title, icon, items }: { title: string; icon: React.ReactNode; items: Array<[string, any]> }) {
  return <section style={cardStyle}><h2 style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>{icon}{title}</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginTop: '17px' }}>{items.map(([label, value]) => <div key={label}><div style={eyebrow}>{label}</div><div style={valueLine}>{display(value)}</div></div>)}</div></section>;
}

function EditApplication({ data, setField, setWitness, onSubmit, onCancel, busy }: { data: Record<string, any>; setField: (key: string, value: any) => void; setWitness: (index: number, key: string, value: string) => void; onSubmit: (event: React.FormEvent) => void; onCancel: () => void; busy: boolean }) {
  const input = (key: string, label: string, type = 'text') => <label style={labelStyle}>{label}<input required={['applicant_name', 'applicant_phone', 'loan_amount_requested', 'repayment_period_months', 'monthly_income', 'loan_purpose_detail'].includes(key)} type={type} value={data[key] ?? ''} onChange={e => setField(key, e.target.value)} style={inputStyle} /></label>;
  return <form onSubmit={onSubmit} style={{ ...cardStyle, display: 'grid', gap: '18px' }}><div><div style={eyebrow}>EDIT APPLICATION</div><h2 style={{ ...sectionTitle, marginTop: '6px' }}>Update your submitted information</h2><p style={muted}>Changes are saved as a new application version. Review forwarding will lock further applicant edits.</p></div><div style={editGrid}>{input('applicant_name', 'Full name')}{input('applicant_phone', 'Mobile number', 'tel')}{input('applicant_whatsapp', 'WhatsApp number', 'tel')}{input('applicant_dob', 'Date of birth', 'date')}{input('applicant_gender', 'Gender')}{input('applicant_father_name', 'Father / guardian')}{input('applicant_address_house', 'House / number')}{input('applicant_address_street', 'Street / place')}{input('applicant_address_city', 'City / district')}{input('applicant_address_pin', 'PIN code')}{input('applicant_occupation', 'Occupation')}{input('applicant_employer_name', 'Employer')}{input('loan_amount_requested', 'Requested amount', 'number')}{input('repayment_period_months', 'Repayment months', 'number')}{input('monthly_income', 'Monthly income', 'number')}{input('income_source', 'Income source')}{input('loan_purpose_category', 'Purpose category')}<label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Address details<textarea value={data.requester_address ?? ''} onChange={e => setField('requester_address', e.target.value)} style={textareaStyle} /></label><label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Purpose details<textarea required value={data.loan_purpose_detail ?? ''} onChange={e => setField('loan_purpose_detail', e.target.value)} style={textareaStyle} /></label><label style={{ ...labelStyle, gridColumn: '1 / -1', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '9px' }}><input type="checkbox" checked={!!data.existing_debts} onChange={e => setField('existing_debts', e.target.checked)} /> Existing debts</label>{data.existing_debts && <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Existing debt details<textarea value={data.existing_debts_detail ?? ''} onChange={e => setField('existing_debts_detail', e.target.value)} style={textareaStyle} /></label>}</div><div><h3 style={{ ...sectionTitle, fontSize: '16px' }}>Witnesses</h3><div style={editGrid}>{[0, 1].map(i => <React.Fragment key={i}>{<div style={{ gridColumn: '1 / -1', color: '#0f766e', fontWeight: 900 }}>Witness {i + 1}</div>}{<label style={labelStyle}>Name<input required value={data.witnesses?.[i]?.name ?? ''} onChange={e => setWitness(i, 'name', e.target.value)} style={inputStyle} /></label>}{<label style={labelStyle}>Mobile<input required value={data.witnesses?.[i]?.phone ?? ''} onChange={e => setWitness(i, 'phone', e.target.value.replace(/\D/g, ''))} style={inputStyle} /></label>}{<label style={labelStyle}>Membership number<input value={data.witnesses?.[i]?.member_no ?? ''} onChange={e => setWitness(i, 'member_no', e.target.value)} style={inputStyle} /></label>}</React.Fragment>)}</div></div><div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}><button disabled={busy} type="submit" style={primaryButton}>{busy ? 'Saving…' : 'Save application changes'}</button><button type="button" onClick={onCancel} style={secondaryButton}>Cancel</button></div></form>;
}

function ModeCard({ active, icon, title, subtitle, onClick }: { active: boolean; icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} style={{ ...modeCardStyle, borderColor: active ? '#0f766e' : '#dbe4ea', background: active ? '#ecfdf5' : '#fff', boxShadow: active ? '0 0 0 2px rgba(15,118,110,.15)' : 'none' }}>
    <span style={{ ...iconStyle, width: '38px', height: '38px', borderRadius: '11px', background: active ? '#0f766e' : '#ecfdf5', color: active ? '#fff' : '#0f766e' }}>{icon}</span>
    <span style={{ display: 'grid', gap: '3px', textAlign: 'left' }}>
      <strong style={{ color: '#0f172a', fontSize: '14px' }}>{title}</strong>
      <span style={{ color: '#64748b', fontSize: '12px', lineHeight: 1.45 }}>{subtitle}</span>
    </span>
  </button>;
}

function OtpInput({ cells, onChange, disabled }: { cells: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const setAt = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) { const next = cells.slice(); next[index] = ''; onChange(next); return; }
    const next = cells.slice();
    for (let i = 0; i < digits.length && index + i < 6; i += 1) next[index + i] = digits[i];
    onChange(next);
    refs.current[Math.min(index + digits.length, 5)]?.focus();
  };
  const onKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !cells[index] && index > 0) {
      event.preventDefault();
      const next = cells.slice(); next[index - 1] = ''; onChange(next);
      refs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < 5) refs.current[index + 1]?.focus();
  };
  return <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }} role="group" aria-label="6-digit verification code">
    {cells.map((cell, index) => <input
      key={index}
      ref={element => { refs.current[index] = element; }}
      value={cell}
      disabled={disabled}
      inputMode="numeric"
      autoComplete={index === 0 ? 'one-time-code' : 'off'}
      maxLength={6}
      aria-label={`Verification code digit ${index + 1}`}
      onChange={event => setAt(index, event.target.value)}
      onKeyDown={event => onKeyDown(index, event)}
      onPaste={event => { event.preventDefault(); setAt(0, event.clipboardData.getData('text')); }}
      style={otpCellStyle}
    />)}
  </div>;
}

const TIMELINE_STEPS = [
  'Application Submitted',
  'Awaiting Verification',
  'Under Member Review',
  'Submitted to Administration',
  'Under Super Admin Review',
  'Approved / Rejected',
  'Loan Disbursement'
];

const stageIndexOf = (code: string) => {
  if (code === 'DISBURSED' || code === 'REPAYMENT_COMPLETE') return 6;
  if (code === 'APPROVED' || code === 'REJECTED' || code === 'CANCELLED') return 5;
  if (code === 'UNDER_SUPERADMIN_REVIEW') return 4;
  if (code === 'UNDER_ADMIN_REVIEW' || code === 'FORWARDED_TO_ADMIN') return 3;
  return 2;
};

function ProgressTimeline({ application, events, witnessProgress }: { application: TrackingApplication; events: any[]; witnessProgress: WitnessProgress | null }) {
  const code = application.status.code;
  const eventDates = new Map<string, string>();
  for (const event of events || []) {
    if (event?.status_code && !eventDates.has(event.status_code)) eventDates.set(event.status_code, event.created_at);
  }
  const witnessDone = !witnessProgress || witnessProgress.requiredCount === 0 || witnessProgress.verifiedCount >= witnessProgress.requiredCount;
  const reached = Math.min(stageIndexOf(code), witnessDone ? 6 : 1);
  const stepDate = (index: number) => {
    if (index === 0) return eventDates.get('SUBMITTED') || application.submitted_at;
    if (index === 2) return eventDates.get('UNDER_MEMBER_REVIEW') || eventDates.get('FORWARDED_TO_ADMIN') || null;
    if (index === 3) return eventDates.get('UNDER_ADMIN_REVIEW') || null;
    if (index === 4) return eventDates.get('UNDER_SUPERADMIN_REVIEW') || null;
    if (index === 5) return eventDates.get('APPROVED') || eventDates.get('REJECTED') || null;
    if (index === 6) return eventDates.get('DISBURSED') || null;
    return null;
  };
  const stepLabel = (index: number) => {
    if (index !== 5) return TIMELINE_STEPS[index];
    if (code === 'APPROVED') return 'Approved';
    if (code === 'REJECTED') return 'Rejected';
    if (code === 'CANCELLED') return 'Application Cancelled';
    return TIMELINE_STEPS[index];
  };

  return <section style={cardStyle}>
    <h2 style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: '8px' }}><Clock3 size={18} /> Application progress</h2>
    <p style={muted}>This timeline reflects the status records saved for your application. It never advances on its own.</p>
    <ol style={{ listStyle: 'none', margin: '18px 0 0', padding: 0, display: 'grid', gap: '2px' }}>
      {TIMELINE_STEPS.map((_, index) => {
        const state = index < reached ? 'done' : index === reached ? 'current' : 'pending';
        const date = stepDate(index);
        return <li key={index} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: '12px', paddingBottom: index === TIMELINE_STEPS.length - 1 ? 0 : '14px', position: 'relative' }}>
          <div style={{ display: 'grid', justifyItems: 'center', position: 'relative' }}>
            {state === 'done' ? <CheckCircle2 size={20} color="#0f766e" /> : state === 'current' ? <Circle size={20} color="#0f766e" fill="#ccfbf1" /> : <Circle size={20} color="#cbd5e1" />}
            {index < TIMELINE_STEPS.length - 1 && <span style={{ position: 'absolute', top: '22px', bottom: '-14px', width: '2px', background: index < reached ? '#99f6e4' : '#e2e8f0' }} />}
          </div>
          <div style={{ paddingTop: '1px' }}>
            <div style={{ color: state === 'pending' ? '#94a3b8' : '#0f172a', fontWeight: state === 'current' ? 900 : 700, fontSize: '14px' }}>{stepLabel(index)}</div>
            <div style={{ ...muted, marginTop: '1px' }}>{date ? dateTime(date) : state === 'current' ? 'In progress' : state === 'done' ? 'Completed' : 'Pending'}</div>
          </div>
        </li>;
      })}
    </ol>
  </section>;
}

function RepaymentSchedule({ rows }: { rows: RepaymentRow[] }) {
  return <section style={cardStyle}>
    <h2 style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: '8px' }}><Clock3 size={18} /> Repayment schedule</h2>
    <p style={muted}>Recorded instalments for your approved loan.</p>
    <div style={{ overflowX: 'auto', marginTop: '14px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '520px' }}>
        <thead>
          <tr>{['#', 'Due date', 'Amount due', 'Paid', 'Status'].map(heading => <th key={heading} style={{ textAlign: 'left', padding: '9px 10px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '10px', letterSpacing: '.08em', textTransform: 'uppercase' }}>{heading}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(row => <tr key={row.installment_number}>
            <td style={cellStyle}>{row.installment_number}</td>
            <td style={cellStyle}>{dateTime(row.due_date)}</td>
            <td style={cellStyle}>{money(row.amount_due)}</td>
            <td style={cellStyle}>{money(row.amount_paid)}</td>
            <td style={cellStyle}>{display(row.status)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

const cellStyle: React.CSSProperties = { padding: '10px', borderBottom: '1px solid #f1f5f9', color: '#1e293b' };
const modeGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' };
const modeCardStyle: React.CSSProperties = { display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '16px', borderRadius: '16px', border: '1px solid #dbe4ea', cursor: 'pointer', textAlign: 'left', font: 'inherit' };
const matchRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '15px', borderRadius: '14px', border: '1px solid #dbe4ea', background: '#fff', cursor: 'pointer', font: 'inherit' };
const otpCellStyle: React.CSSProperties = { width: '46px', height: '54px', textAlign: 'center', fontSize: '22px', fontWeight: 900, border: '1px solid #cbd5e1', borderRadius: '12px', color: '#0f172a', background: '#fff', fontFamily: 'inherit' };

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #dbe4ea', borderRadius: '20px', padding: '22px', boxShadow: '0 10px 24px rgba(15,23,42,.04)' };
const formGrid: React.CSSProperties = { display: 'grid', gap: '16px' };
const editGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' };
const sectionTitle: React.CSSProperties = { margin: 0, color: '#0f172a', fontSize: '19px', letterSpacing: '-.02em' };
const muted: React.CSSProperties = { color: '#64748b', fontSize: '13px', lineHeight: 1.55, margin: '5px 0 0' };
const labelStyle: React.CSSProperties = { display: 'grid', gap: '7px', color: '#334155', fontSize: '13px', fontWeight: 800 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '11px 12px', color: '#0f172a', font: 'inherit', background: '#fff' };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: '80px', resize: 'vertical' };
const primaryButton: React.CSSProperties = { border: 0, borderRadius: '11px', padding: '12px 16px', background: '#0f766e', color: '#fff', fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };
const secondaryButton: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: '11px', padding: '11px 15px', background: '#fff', color: '#334155', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px' };
const backButton: React.CSSProperties = { border: 0, background: 'transparent', color: '#0f766e', fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px', padding: 0 };
const smallButton: React.CSSProperties = { border: 0, background: '#ecfdf5', color: '#0f766e', borderRadius: '7px', padding: '5px', cursor: 'pointer', display: 'inline-flex' };
const eyebrow: React.CSSProperties = { color: '#64748b', fontSize: '10px', fontWeight: 900, letterSpacing: '.09em', textTransform: 'uppercase' };
const valueLine: React.CSSProperties = { color: '#1e293b', fontSize: '14px', marginTop: '5px', lineHeight: 1.55, whiteSpace: 'pre-wrap' };
const iconStyle: React.CSSProperties = { width: '42px', height: '42px', borderRadius: '13px', display: 'grid', placeItems: 'center', color: '#0f766e', background: '#ecfdf5' };
const alertStyle = (background: string, color: string): React.CSSProperties => ({ background, color, borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px', lineHeight: 1.5 });
