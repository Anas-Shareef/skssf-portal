import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, Copy, MessageCircle, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

type WitnessRow = {
  index: number;
  name: string | null;
  maskedPhone: string | null;
  relationship: string | null;
  memberNo: string | null;
  status: string;
  hasActiveLink: boolean;
  issuedAt: string | null;
  expiresAt: string | null;
  firstViewedAt: string | null;
  respondedAt: string | null;
  sharedAt: string | null;
  shareChannel: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  responseNote: string | null;
};

type VerificationEvent = {
  id: string;
  event_type: string;
  actor_type: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type Progress = { verifiedCount: number; requiredCount: number; overall: string };

type Props = {
  loanId: string;
  applicantName: string;
  reference: string;
};

const statusChip = (status: string) => {
  if (status === 'VERIFIED') return { label: 'Consent given', color: '#166534', background: '#dcfce7' };
  if (status === 'DECLINED') return { label: 'Declined', color: '#991b1b', background: '#fee2e2' };
  if (status === 'EXPIRED') return { label: 'Link expired', color: '#92400e', background: '#fef3c7' };
  if (status === 'REVOKED') return { label: 'Link replaced', color: '#475569', background: '#e2e8f0' };
  return { label: 'Awaiting response', color: '#92400e', background: '#fef3c7' };
};

const overallLabel = (progress: Progress | null) => {
  if (!progress) return 'Loading witness status…';
  switch (progress.overall) {
    case 'ALL_VERIFIED': return 'All required witnesses verified';
    case 'PARTIALLY_VERIFIED': return 'Partially verified';
    case 'DECLINED': return 'Witness declined';
    case 'EXPIRED': return 'Verification expired';
    default: return 'Waiting for witness verification';
  }
};

const format = (value: string | null) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null);

const eventLabel = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/^./, character => character.toUpperCase());

const normalizeWhatsappNumber = (value: string | null | undefined) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `91${digits}` : digits;
};

const buildMessage = (witness: WitnessRow, applicantName: string, reference: string, url: string) => [
  `Assalamu Alaikum ${witness.name || 'Witness'},`,
  '',
  'SKSSF Poyanad Branch (Reg No: 2773) — Interest-Free Loan',
  '',
  `${applicantName} has named you as a witness / guarantor for loan application ${reference}.`,
  '',
  'Please open your personal verification link to confirm or decline:',
  url,
  '',
  'The link can be used once and expires automatically. If you did not expect this message, please ignore it.'
].join('\n');

export default function WitnessVerificationPanel({ loanId, applicantName, reference }: Props) {
  const [loading, setLoading] = useState(true);
  const [witnesses, setWitnesses] = useState<WitnessRow[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [events, setEvents] = useState<VerificationEvent[]>([]);
  const [error, setError] = useState('');
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [prepared, setPrepared] = useState<Record<number, { url: string; expiresAt: string }>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
    const res = await fetch('/api/get-member-inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ loanId, ...body })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to load witness verification records.');
    return data;
  }, [loanId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await call({ action: 'witness_status' });
      setWitnesses(data.witnesses || []);
      setProgress(data.progress || null);
      setEvents(data.events || []);
    } catch (err: any) {
      setError(err.message || 'Unable to load witness verification records.');
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);

  const sendWhatsapp = async (witness: WitnessRow) => {
    if (witness.hasActiveLink) {
      const proceed = window.confirm('A verification link was already issued for this witness. Sending again will revoke the previous link so the older message stops working. Continue?');
      if (!proceed) return;
    }
    setBusyIndex(witness.index);
    setError('');
    setNotice('');
    try {
      const data = await call({ action: 'witness_link', witnessIndex: witness.index });
      const link = data.link;
      if (!link?.url) throw new Error('The verification link could not be created.');
      setPrepared(previous => ({ ...previous, [witness.index]: { url: link.url, expiresAt: link.expiresAt } }));

      const number = normalizeWhatsappNumber(link.phone);
      if (number) {
        const message = buildMessage(witness, applicantName, reference, link.url);
        window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
        setNotice(`WhatsApp opened for ${witness.name || 'the witness'}. Opening WhatsApp does not confirm delivery — use “Mark as shared” after sending.`);
      } else {
        setNotice('No mobile number is recorded for this witness. Copy the link and share it manually.');
      }
      await load();
    } catch (err: any) {
      setError(err.message || 'Unable to prepare the witness link.');
    } finally {
      setBusyIndex(null);
    }
  };

  const markShared = async (witness: WitnessRow) => {
    setBusyIndex(witness.index);
    setError('');
    try {
      await call({ action: 'witness_shared', witnessIndex: witness.index, channel: 'whatsapp' });
      setNotice(`Recorded that the link for ${witness.name || 'the witness'} was shared manually. This is not a delivery confirmation.`);
      await load();
    } catch (err: any) {
      setError(err.message || 'Unable to record the share action.');
    } finally {
      setBusyIndex(null);
    }
  };

  const copyLink = async (witness: WitnessRow) => {
    const link = prepared[witness.index]?.url;
    if (!link) return;
    try {
      await navigator.clipboard?.writeText(link);
      setCopied(witness.index);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      /* clipboard is optional */
    }
  };

  return (
    <div className="card" style={{ padding: '24px', borderRadius: '24px', background: '#fff', border: '1.5px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} color="var(--teal)" /> Section E — Witness Verification
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748b', lineHeight: 1.5 }}>
            Send each witness their own secure, single-use link. Responses are recorded by the server.
          </p>
        </div>
        <button type="button" onClick={load} className="bsm g" style={{ padding: '7px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }} title="Refresh witness status">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '6px 12px', borderRadius: '999px', background: progress?.overall === 'ALL_VERIFIED' ? '#dcfce7' : progress?.overall === 'DECLINED' ? '#fee2e2' : '#fef3c7', color: progress?.overall === 'ALL_VERIFIED' ? '#166534' : progress?.overall === 'DECLINED' ? '#991b1b' : '#92400e', fontSize: '12px', fontWeight: 900, marginBottom: '16px' }}>
        {progress?.overall === 'ALL_VERIFIED' ? <CheckCircle size={14} /> : progress?.overall === 'DECLINED' ? <XCircle size={14} /> : <Clock size={14} />}
        {overallLabel(progress)}{progress ? ` · ${progress.verifiedCount}/${progress.requiredCount}` : ''}
      </div>

      {error && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '11px 13px', fontSize: '12.5px', fontWeight: 700, marginBottom: '14px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <AlertCircle size={16} style={{ flex: '0 0 auto', marginTop: '1px' }} /> {error}
        </div>
      )}
      {notice && (
        <div role="status" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: '12px', padding: '11px 13px', fontSize: '12.5px', fontWeight: 700, marginBottom: '14px' }}>
          {notice}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: '13px', color: '#64748b', padding: '12px 0' }}>Loading witness verification records…</div>
      ) : witnesses.length === 0 ? (
        <div style={{ fontSize: '13px', color: '#64748b' }}>No witness details were recorded for this application.</div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {witnesses.map(witness => {
            const chip = statusChip(witness.status);
            const lastActivity = witness.respondedAt || witness.sharedAt || witness.firstViewedAt || witness.issuedAt;
            const link = prepared[witness.index];
            return (
              <div key={witness.index} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: '220px' }}>
                    <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '14px' }}>
                      Witness {witness.index}: {witness.name || '—'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                      {witness.maskedPhone || 'No number recorded'}
                      {witness.relationship ? ` · ${witness.relationship}` : ''}
                      {witness.memberNo ? ` · Member ${witness.memberNo}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 900, color: chip.color, background: chip.background, padding: '2px 9px', borderRadius: '7px' }}>{chip.label}</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: witness.hasActiveLink ? '#1e40af' : '#64748b', background: witness.hasActiveLink ? '#dbeafe' : '#f1f5f9', padding: '2px 9px', borderRadius: '7px' }}>
                        {witness.hasActiveLink ? 'Link active' : 'No active link'}
                      </span>
                      {witness.sharedAt && <span style={{ fontSize: '11px', fontWeight: 800, color: '#166534' }}>Marked shared</span>}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '8px', lineHeight: 1.5 }}>
                      Last activity: {format(lastActivity) || 'No activity yet'}
                      {witness.expiresAt && witness.hasActiveLink ? ` · Expires ${format(witness.expiresAt)}` : ''}
                      {witness.revokedReason ? ` · Replaced (${witness.revokedReason})` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', minWidth: '160px' }}>
                    <button
                      type="button"
                      onClick={() => sendWhatsapp(witness)}
                      disabled={busyIndex === witness.index || witness.status === 'DECLINED'}
                      className="bsm s"
                      style={{ padding: '8px 13px', borderRadius: '10px', fontSize: '12px', fontWeight: 900, background: '#25D366', borderColor: '#25D366', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: busyIndex === witness.index || witness.status === 'DECLINED' ? 0.55 : 1 }}
                    >
                      <MessageCircle size={14} /> {witness.hasActiveLink ? 'Send WhatsApp again' : 'Send WhatsApp'}
                    </button>
                    {link && (
                      <button
                        type="button"
                        onClick={() => copyLink(witness)}
                        className="bsm g"
                        style={{ padding: '8px 13px', borderRadius: '10px', fontSize: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <Copy size={14} /> {copied === witness.index ? 'Copied' : 'Copy link'}
                      </button>
                    )}
                    {link && (
                      <button
                        type="button"
                        onClick={() => markShared(witness)}
                        disabled={busyIndex === witness.index}
                        className="bsm g"
                        style={{ padding: '8px 13px', borderRadius: '10px', fontSize: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <CheckCircle size={14} /> Mark as shared
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: '14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '11px 13px', fontSize: '11.5px', color: '#92400e', lineHeight: 1.6 }}>
        Opening WhatsApp only prepares a message in your own app. This portal cannot confirm that the message was delivered or read, and a link response is not independent proof that the WhatsApp number belongs to the witness.
      </div>

      {events.length > 0 && (
        <details style={{ marginTop: '16px' }}>
          <summary style={{ cursor: 'pointer', fontSize: '12.5px', fontWeight: 900, color: '#475569' }}>
            Verification history ({events.length})
          </summary>
          <div style={{ marginTop: '10px', display: 'grid', gap: '7px' }}>
            {events.map(event => (
              <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11.5px', color: '#64748b', borderBottom: '1px solid #f1f5f9', paddingBottom: '5px' }}>
                <span style={{ fontWeight: 800, color: '#334155' }}>{eventLabel(event.event_type)}</span>
                <span>{event.actor_type} · {format(event.created_at)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
