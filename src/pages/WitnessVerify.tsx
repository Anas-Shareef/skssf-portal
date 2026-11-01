import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle, Loader2, ShieldCheck, XCircle } from 'lucide-react';

type WitnessInfo = {
  index: number;
  name: string | null;
  maskedPhone: string | null;
  status: 'PENDING' | 'VERIFIED' | 'DECLINED' | 'EXPIRED' | 'REVOKED';
  issuedAt?: string | null;
  expiresAt?: string | null;
  respondedAt?: string | null;
  responseNote?: string | null;
};

type ApplicationInfo = {
  reference: string | null;
  applicantName: string | null;
};

const cardStyle = {
  background: '#fff',
  borderRadius: '24px',
  padding: '32px',
  border: '1.5px solid #e2e8f0',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.06)',
  maxWidth: '640px',
  width: '100%',
  margin: '0 auto'
} as const;

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null;

export default function WitnessVerify() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [witness, setWitness] = useState<WitnessInfo | null>(null);
  const [application, setApplication] = useState<ApplicationInfo | null>(null);
  const [consentNotice, setConsentNotice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState<'VERIFIED' | 'DECLINED' | null>(null);
  const [result, setResult] = useState<'VERIFIED' | 'DECLINED' | null>(null);
  const [resultAt, setResultAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setError('This witness verification link is not valid.');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/track-application', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'witness_view', token })
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || 'This witness verification link is not valid.');
          return;
        }
        setWitness(data.witness || null);
        setApplication(data.application || null);
        setConsentNotice(data.consentNotice || '');
      } catch {
        if (!cancelled) setError('Witness verification is temporarily unavailable. Please try again later.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const respond = async (decision: 'VERIFIED' | 'DECLINED') => {
    if (!token) return;
    setSubmitting(decision);
    setError('');
    try {
      const res = await fetch('/api/track-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'witness_respond', token, decision })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Unable to record your response.');
        if (data.status) setWitness(previous => (previous ? { ...previous, status: data.status } : previous));
        return;
      }
      setResult(data.status === 'DECLINED' ? 'DECLINED' : 'VERIFIED');
      setResultAt(data.respondedAt || new Date().toISOString());
      setWitness(previous => (previous ? { ...previous, status: decision, respondedAt: data.respondedAt || new Date().toISOString() } : previous));
    } catch {
      setError('Witness verification is temporarily unavailable. Please try again later.');
    } finally {
      setSubmitting(null);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '32px 16px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto 20px auto' }}>
        <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '24px', padding: '24px 28px', color: '#fff' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px' }}>
            <ShieldCheck size={14} color="#38bdf8" /> REG NO: 2773 • POYANAD BRANCH
          </div>
          <h1 style={{ fontSize: '21px', fontWeight: 950, margin: '10px 0 4px 0' }}>Witness Verification</h1>
          <p style={{ fontSize: '13px', opacity: 0.85, margin: 0 }}>SKSSF Poyanad Branch — Interest-Free Loan</p>
        </div>
      </div>
      {children}
      <p style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', marginTop: '20px' }}>
        SKSSF Poyanad Branch does not ask for money, OTPs or passwords through this page.
      </p>
    </div>
  );

  if (loading) {
    return shell(
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#0f766e', fontWeight: 800 }}>
          <Loader2 size={20} className="spin" /> Checking this verification link…
        </div>
      </div>
    );
  }

  if (error && !witness) {
    return shell(
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <AlertCircle size={46} color="#ef4444" style={{ margin: '0 auto 14px' }} />
        <h2 style={{ fontSize: '20px', fontWeight: 950, color: '#0f172a', margin: '0 0 8px 0' }}>Link not available</h2>
        <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6, margin: 0 }}>{error}</p>
        <p style={{ fontSize: '12.5px', color: '#94a3b8', lineHeight: 1.6, margin: '14px 0 0 0' }}>
          Verification links are single-use and expire automatically. Ask the applicant or the SKSSF member who contacted you to issue a new link.
        </p>
      </div>
    );
  }

  const alreadyAnswered = witness?.status === 'VERIFIED' || witness?.status === 'DECLINED';
  const unavailable = witness?.status === 'EXPIRED' || witness?.status === 'REVOKED';

  if (result || alreadyAnswered) {
    const finalStatus = result || witness?.status;
    const declined = finalStatus === 'DECLINED';
    return shell(
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        {declined
          ? <XCircle size={52} color="#dc2626" style={{ margin: '0 auto 14px' }} />
          : <CheckCircle size={52} color="#16a34a" style={{ margin: '0 auto 14px' }} />}
        <h2 style={{ fontSize: '22px', fontWeight: 950, color: '#0f172a', margin: '0 0 8px 0' }}>
          {declined ? 'Response recorded — declined' : 'Response recorded — consent given'}
        </h2>
        <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.65, margin: '0 0 18px 0' }}>
          {declined
            ? 'You have declined to act as a witness for this application. The SKSSF branch and the applicant can see this response.'
            : 'Thank you. You have agreed to act as a witness for this application. The SKSSF branch and the applicant can see this response.'}
        </p>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', textAlign: 'left', fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
          <div><b>Application:</b> {application?.reference || 'Not available'}</div>
          <div><b>Applicant:</b> {application?.applicantName || 'Not available'}</div>
          <div><b>Witness:</b> {witness?.name || 'Not recorded'}</div>
          <div><b>Recorded:</b> {formatDate(resultAt || witness?.respondedAt) || 'Just now'}</div>
        </div>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '16px 0 0 0', lineHeight: 1.6 }}>
          This page confirms a link-based response only. It is not independent proof that the WhatsApp number belongs to you.
        </p>
      </div>
    );
  }

  if (unavailable) {
    return shell(
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <AlertCircle size={46} color="#f59e0b" style={{ margin: '0 auto 14px' }} />
        <h2 style={{ fontSize: '20px', fontWeight: 950, color: '#0f172a', margin: '0 0 8px 0' }}>
          {witness?.status === 'REVOKED' ? 'This link was replaced' : 'This link has expired'}
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6, margin: 0 }}>
          Ask the SKSSF member who contacted you to issue a new verification link.
        </p>
      </div>
    );
  }

  return shell(
    <div style={cardStyle}>
      <h2 style={{ fontSize: '20px', fontWeight: 950, color: '#0f172a', margin: '0 0 6px 0' }}>
        Confirm your witness responsibility
      </h2>
      <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.6, margin: '0 0 20px 0' }}>
        You have been named as a witness / guarantor for an interest-free loan application at SKSSF Poyanad Branch. Please review the details below and record your response.
      </p>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', display: 'grid', gap: '10px', fontSize: '13.5px', color: '#334155' }}>
        <div><b>Applicant:</b> {application?.applicantName || 'Not available'}</div>
        <div><b>Application reference:</b> <span style={{ fontFamily: 'monospace', color: '#0f766e', fontWeight: 800 }}>{application?.reference || 'Not available'}</span></div>
        <div><b>Your registered name:</b> {witness?.name || 'Not recorded'}</div>
        <div><b>Contact on record:</b> {witness?.maskedPhone || 'Not recorded'}</div>
        {witness?.expiresAt && <div><b>Link expires:</b> {formatDate(witness.expiresAt)}</div>}
      </div>

      <div style={{ margin: '18px 0', fontSize: '13px', color: '#475569', lineHeight: 1.7 }}>
        As a witness you confirm that you know the applicant and that the information you are aware of is accurate. The branch may contact you while reviewing this application. You are not being asked to repay the loan.
      </div>

      {error && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '12px 14px', fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '1fr 1fr' }}>
        <button
          type="button"
          onClick={() => respond('VERIFIED')}
          disabled={submitting !== null}
          style={{ border: 0, borderRadius: '14px', padding: '15px 16px', background: '#16a34a', color: '#fff', fontWeight: 900, fontSize: '14px', cursor: submitting ? 'wait' : 'pointer', opacity: submitting && submitting !== 'VERIFIED' ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
        >
          {submitting === 'VERIFIED' ? <Loader2 size={17} className="spin" /> : <CheckCircle size={17} />}
          I Agree
        </button>
        <button
          type="button"
          onClick={() => respond('DECLINED')}
          disabled={submitting !== null}
          style={{ border: '1.5px solid #fecaca', borderRadius: '14px', padding: '15px 16px', background: '#fff', color: '#b91c1c', fontWeight: 900, fontSize: '14px', cursor: submitting ? 'wait' : 'pointer', opacity: submitting && submitting !== 'DECLINED' ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
        >
          {submitting === 'DECLINED' ? <Loader2 size={17} className="spin" /> : <XCircle size={17} />}
          I Do Not Agree
        </button>
      </div>

      <p style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.6, margin: '16px 0 0 0' }}>
        {consentNotice || 'This link records your consent response. It does not independently prove that the WhatsApp number belongs to you.'} Your response is stored once with a server timestamp and cannot be changed afterwards.
      </p>
    </div>
  );
}
