/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are validated and shaped by the tracking endpoint. */
import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Copy, Edit3, LockKeyhole, SearchCheck, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'form' | 'otp' | 'details'>('form');
  const [sessionToken, setSessionToken] = useState('');
  const [application, setApplication] = useState<TrackingApplication | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [witnessProgress, setWitnessProgress] = useState<WitnessProgress | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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

  const requestOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const data = await callApi({ action: 'send', reference: reference.trim().toUpperCase(), phone: cleanPhone });
      setPhone(cleanPhone);
      setStage('otp');
      setNotice(data.message || 'If the details match, a verification code has been sent.');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await callApi({ action: 'verify', reference: reference.trim().toUpperCase(), phone, otp });
      setSessionToken(data.sessionToken);
      await loadDetails(data.sessionToken);
      setStage('details');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const loadDetails = async (token = sessionToken) => {
    const data = await callApi({ action: 'details' }, token);
    setApplication(data.application);
    setHistory(data.history || []);
    setEvents(data.events || []);
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
          <p style={{ color: '#64748b', margin: 0, lineHeight: 1.6 }}>{stage === 'details' ? 'Only information recorded for your verified application is shown below.' : 'Verify your application reference and registered mobile number to continue.'}</p>
        </header>

        {error && <div role="alert" style={alertStyle('#fef2f2', '#b91c1c')}>{error}</div>}
        {notice && <div role="status" style={alertStyle('#ecfdf5', '#047857')}>{notice}</div>}

        {stage !== 'details' ? (
          <section style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '22px' }}><div style={iconStyle}><ShieldCheck size={22} /></div><div><h2 style={sectionTitle}>{stage === 'otp' ? 'Enter verification code' : 'Verify your identity'}</h2><p style={muted}>{stage === 'otp' ? 'The code expires shortly and can only be used once.' : 'We will send a one-time code without revealing whether a reference exists.'}</p></div></div>
            {stage === 'form' ? <form onSubmit={requestOtp} style={formGrid}>
              <label style={labelStyle}>Application reference<input required value={reference} onChange={e => setReference(e.target.value.toUpperCase())} placeholder="SKSSF-LN-2026-000125" style={inputStyle} autoComplete="off" /></label>
              <label style={labelStyle}>Registered mobile number<input required inputMode="numeric" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="10-digit mobile number" style={inputStyle} autoComplete="tel" /></label>
              <button disabled={busy} type="submit" style={primaryButton}>{busy ? 'Sending…' : 'Send verification code'} <ArrowLeft size={16} style={{ transform: 'rotate(180deg)' }} /></button>
            </form> : <form onSubmit={verifyOtp} style={formGrid}>
              <div style={{ color: '#475569', fontSize: '13px' }}>Code sent to the registered mobile number for <strong>{reference.toUpperCase()}</strong>.</div>
              <label style={labelStyle}>6-digit verification code<input required inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="000000" style={inputStyle} autoComplete="one-time-code" /></label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}><button disabled={busy} type="submit" style={primaryButton}>{busy ? 'Verifying…' : 'Verify and view application'}</button><button type="button" onClick={() => { setStage('form'); setOtp(''); setError(''); setNotice(''); }} style={secondaryButton}>Use different details</button></div>
            </form>}
          </section>
        ) : application && (
          editing ? <EditApplication data={editData} setField={setField} setWitness={setWitness} onSubmit={saveEdit} onCancel={() => setEditing(false)} busy={busy} /> : <DetailsView application={application} events={events} history={history} witnessProgress={witnessProgress} onEdit={startEditing} onCopy={() => navigator.clipboard?.writeText(application.reference).then(() => setNotice('Reference copied.'))} />
        )}
      </div>
    </main>
  );
}

function DetailsView({ application, events, history, witnessProgress, onEdit, onCopy }: { application: TrackingApplication; events: any[]; history: any[]; witnessProgress: WitnessProgress | null; onEdit: () => void; onCopy: () => void }) {
  const a = application.applicant; const l = application.loan;
  return <div style={{ display: 'grid', gap: '18px' }}>
    <section style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}><div><div style={eyebrow}>CURRENT STATUS</div><h2 style={{ margin: '7px 0 4px', color: '#0f172a' }}>{application.status.label}</h2><div style={muted}>Last updated {dateTime(application.updated_at)}</div></div><div style={{ textAlign: 'right' }}><div style={eyebrow}>REFERENCE</div><div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '7px' }}><strong style={{ color: '#0f766e', fontFamily: 'monospace' }}>{application.reference}</strong><button type="button" onClick={onCopy} aria-label="Copy reference" style={smallButton}><Copy size={15} /></button></div></div></section>
    {application.editable && <div style={{ ...alertStyle('#eff6ff', '#1d4ed8'), display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}><span>Your application can be edited until it is forwarded for review.</span><button type="button" onClick={onEdit} style={secondaryButton}><Edit3 size={15} /> Edit application</button></div>}
    {!application.editable && <div style={alertStyle('#f8fafc', '#475569')}><LockKeyhole size={15} style={{ verticalAlign: 'middle', marginRight: '7px' }} /> Editing is locked after forwarding to the review workflow.</div>}
    <WitnessProgressBlock progress={witnessProgress} />
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
