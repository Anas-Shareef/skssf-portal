import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle, Copy } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import LoanApplicationWizard from '../features/loan-application/LoanApplicationWizard';
import { buildSubmissionPayload } from '../features/loan-application/payload';
import type { LoanApplicationDraft, SubmitOutcome } from '../features/loan-application/types';

type ReferralMember = { id?: string; name?: string; member_unique_code?: string; code?: string };

export default function PublicLoanRequest() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<ReferralMember | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [refNumber, setRefNumber] = useState('');

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
      } catch {
        setError('This link is invalid. Please contact the SKSSF member who shared it with you.');
      } finally {
        setLoading(false);
      }
    }
    loadMember();
  }, [code]);

  const submit = async (draft: LoanApplicationDraft): Promise<SubmitOutcome> => {
    const res = await fetch('/api/submit-loan-application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...buildSubmissionPayload(draft, 'public'),
        referral_code: code || null
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'The application could not be saved. Please try again.');
    }
    return {
      reference: data.reference || '',
      requestId: data.record?.id || null,
      loanId: data.loan?.id || null,
      witnesses: data.witnesses || []
    };
  };

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
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', margin: '6px 0' }}>
              <div style={{ fontSize: '24px', fontWeight: 950, color: 'var(--teal)', fontFamily: 'monospace' }}>{refNumber || 'Reference unavailable'}</div>
              {refNumber && <button type="button" onClick={() => navigator.clipboard?.writeText(refNumber)} aria-label="Copy application reference" style={{ border: 0, background: '#ecfdf5', color: '#0f766e', borderRadius: '8px', padding: '7px', cursor: 'pointer' }}><Copy size={17} /></button>}
            </div>
            <div style={{ fontSize: '12px', color: '#475569' }}>Submitted for committee review under referral: <b>{member?.name}</b></div>
          </div>

          <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.5, margin: '0 0 12px 0' }}>
            Thank you for applying. Your application has been logged and sent to representative <b>{member?.name}</b> and the SKSSF Poyanad Branch committee for review.
          </p>

          <p style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.55, margin: '0 0 24px 0', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px' }}>
            Your loan application has been submitted successfully. We are waiting for the witness verification responses. No action is required from you.
          </p>

          <div style={{ display: 'grid', gap: '10px' }}>
            <button onClick={() => navigate(code ? `/request/${encodeURIComponent(code)}/track` : '/request/track')} className="bsm s" style={{ width: '100%', padding: '14px', borderRadius: '14px', fontWeight: 900, background: '#0f766e' }}>
              Track This Application
            </button>
            <button onClick={() => window.location.reload()} className="bsm s" style={{ width: '100%', padding: '14px', borderRadius: '14px', fontWeight: 900, background: '#0f172a' }}>
              Submit Another Application
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '32px 16px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>
        <LoanApplicationWizard
          mode="public"
          memberName={member?.name || null}
          memberCode={member?.member_unique_code || member?.code || null}
          submit={submit}
          onSuccess={outcome => {
            setRefNumber(outcome.reference);
            setSuccess(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>
    </div>
  );
}
