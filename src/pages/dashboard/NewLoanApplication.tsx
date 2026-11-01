import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Copy, FileText, MessageCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import LoanApplicationWizard from '../../features/loan-application/LoanApplicationWizard';
import { buildSubmissionPayload } from '../../features/loan-application/payload';
import type { LoanApplicationDraft, SubmitOutcome, WitnessLink } from '../../features/loan-application/types';

const cardStyle = { background: '#fff', borderRadius: '24px', border: '1.5px solid #e2e8f0', padding: '24px' } as const;

const normalizeWhatsappNumber = (value: string | null | undefined) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

const witnessMessage = (witness: WitnessLink, applicantName: string, reference: string) => [
  `Assalamu Alaikum ${witness.name || 'Witness'},`,
  '',
  'SKSSF Poyanad Branch (Reg No: 2773) — Interest-Free Loan',
  '',
  `${applicantName || 'An applicant'} has named you as a witness / guarantor for loan application ${reference}.`,
  '',
  'Please open your personal verification link to confirm or decline:',
  witness.url || '(link unavailable — please ask the member to issue a new one)',
  '',
  'The link can be used once and expires automatically. If you did not expect this message, please ignore it.'
].join('\n');

export default function NewLoanApplication() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [dirty, setDirty] = useState(false);
  const [outcome, setOutcome] = useState<(SubmitOutcome & { applicantName: string }) | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [sharedIndexes, setSharedIndexes] = useState<Set<number>>(new Set());
  const clientRequestId = useRef<string>(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `cid-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  const memberName = profile?.name || 'Member';
  const memberCode = profile?.member_unique_code || profile?.code || '';

  const handleDirtyChange = useCallback((value: boolean) => setDirty(value), []);

  const handleCancel = () => {
    if (dirty && !window.confirm('Discard this application? Any information you have entered will be lost.')) return;
    navigate('/member/dashboard/filed-loans');
  };

  const submit = async (draft: LoanApplicationDraft): Promise<SubmitOutcome> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');

    const res = await fetch('/api/submit-loan-application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        ...buildSubmissionPayload(draft, 'member'),
        client_request_id: clientRequestId.current
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'The application could not be saved. Please try again.');
    }
    return {
      reference: data.reference || '',
      requestId: data.requestId || data.record?.id || null,
      loanId: data.loanId || data.loan?.id || null,
      witnesses: data.witnesses || [],
      witnessVerificationAvailable: data.witnessVerificationAvailable !== false,
      applicantName: draft.fullName.trim()
    };
  };

  const handleSuccess = (result: SubmitOutcome) => {
    setOutcome(result);
    setDirty(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openWhatsapp = (witness: WitnessLink) => {
    if (!outcome) return;
    const number = normalizeWhatsappNumber(witness.phone);
    if (!number || !witness.url) return;
    const url = `https://wa.me/${number}?text=${encodeURIComponent(witnessMessage(witness, outcome.applicantName, outcome.reference))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyLink = async (witness: WitnessLink, index: number) => {
    if (!witness.url) return;
    try {
      await navigator.clipboard?.writeText(witness.url);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2500);
    } catch {
      /* clipboard is optional */
    }
  };

  const markShared = async (witness: WitnessLink) => {
    if (!outcome?.loanId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/get-member-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          loanId: outcome.loanId,
          action: 'witness_shared',
          witnessIndex: witness.index,
          channel: 'whatsapp'
        })
      });
      if (res.ok) setSharedIndexes(previous => new Set(previous).add(witness.index));
    } catch {
      /* marking shared is optional and never blocks the member */
    }
  };

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
      <div>
        <button
          type="button"
          onClick={handleCancel}
          style={{ background: 'none', border: 'none', color: '#64748b', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginBottom: '8px', padding: 0 }}
        >
          <ArrowLeft size={16} /> Back to Filed Loans
        </button>
        <h1 style={{ fontSize: '26px', fontWeight: 950, color: '#0f172a', margin: 0 }}>New Loan Application</h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0', maxWidth: '680px', lineHeight: 1.5 }}>
          File a complete application on behalf of the person requesting the loan. The applicant remains the loan requester; you are recorded as the filing member.
        </p>
      </div>
      <button type="button" onClick={handleCancel} className="bsm g" style={{ padding: '10px 18px', borderRadius: '12px', fontWeight: 800 }}>
        Cancel
      </button>
    </div>
  );

  if (outcome) {
    const witnesses = outcome.witnesses || [];
    return (
      <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px', maxWidth: '900px' }}>
        {header}

        <div style={{ ...cardStyle, border: '2px solid #bbf7d0', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#dcfce7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <CheckCircle size={34} />
          </div>
          <h2 style={{ fontSize: '23px', fontWeight: 950, color: '#0f172a', margin: '0 0 6px 0' }}>Application submitted</h2>
          <p style={{ fontSize: '13px', color: '#166534', fontWeight: 700, margin: 0 }}>Filed by {memberName}{memberCode ? ` (${memberCode})` : ''}</p>

          <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '18px', border: '1.5px solid #e2e8f0', margin: '22px 0' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Application Reference</div>
            <div style={{ fontSize: '24px', fontWeight: 950, color: 'var(--teal)', fontFamily: 'monospace', marginTop: '4px' }}>{outcome.reference || 'Reference unavailable'}</div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {outcome.loanId && (
              <button type="button" onClick={() => navigate(`/member/dashboard/filed-loans/${outcome.loanId}`)} className="bsm s" style={{ padding: '12px 20px', borderRadius: '12px', fontWeight: 900, background: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={16} /> Open filed application
              </button>
            )}
            <button type="button" onClick={() => navigate('/member/dashboard/filed-loans')} className="bsm g" style={{ padding: '12px 20px', borderRadius: '12px', fontWeight: 800 }}>
              Back to Filed Loans
            </button>
          </div>
        </div>

        <div style={{ ...cardStyle, marginTop: '20px' }}>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} color="var(--teal)" /> Witness verification links
          </h3>
          <p style={{ fontSize: '12.5px', color: '#64748b', margin: '0 0 16px 0', lineHeight: 1.55 }}>
            Send each witness their own link. The link records their consent response; it does not prove that the WhatsApp number belongs to them, and this portal cannot confirm WhatsApp delivery.
          </p>

          {outcome.witnessVerificationAvailable === false ? (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: '12px', padding: '12px 14px', fontSize: '13px', fontWeight: 700 }}>
              Witness verification is not enabled on this deployment yet. The witness details were saved with the application.
            </div>
          ) : witnesses.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#64748b' }}>No witness links were issued. Open the filed application to issue them.</div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {witnesses.map(witness => (
                <div key={witness.index} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '14px' }}>Witness {witness.index}: {witness.name || '—'}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      {witness.phone ? `+91 ${witness.phone}` : 'No number recorded'}
                      {witness.expiresAt ? ` · Link expires ${new Date(witness.expiresAt).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => copyLink(witness, witness.index)}
                      className="bsm g"
                      style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Copy size={14} /> {copiedIndex === witness.index ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openWhatsapp(witness)}
                      disabled={!witness.url || !witness.phone}
                      className="bsm s"
                      style={{ padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 900, background: '#25D366', borderColor: '#25D366', display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: witness.url && witness.phone ? 1 : 0.5 }}
                    >
                      <MessageCircle size={15} /> Send WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => markShared(witness)}
                      disabled={sharedIndexes.has(witness.index)}
                      className="bsm g"
                      style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '5px', opacity: sharedIndexes.has(witness.index) ? 0.6 : 1 }}
                    >
                      <CheckCircle size={14} /> {sharedIndexes.has(witness.index) ? 'Marked shared' : 'Mark as shared'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.5s ease', padding: '24px', maxWidth: '900px' }}>
      {header}
      <LoanApplicationWizard
        mode="member"
        memberName={memberName}
        memberCode={memberCode}
        submit={submit}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
        onDirtyChange={handleDirtyChange}
        submitLabel="File Application to Review Panel ✓"
      />
    </div>
  );
}
