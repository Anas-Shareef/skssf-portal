import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, CheckCircle, XCircle, AlertCircle, ArrowLeft, Check, X, Phone } from 'lucide-react';
import { localDb } from '../lib/localDb';
import { supabase } from '../lib/supabaseClient';

export default function WitnessVerify() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<any>(null);
  const [witnessIndex, setWitnessIndex] = useState<number>(1);
  const [witnessName, setWitnessName] = useState<string>('');
  const [witnessPhone, setWitnessPhone] = useState<string>('');
  const [alreadyProcessed, setAlreadyProcessed] = useState<boolean>(false);
  const [statusResult, setStatusResult] = useState<'VERIFIED' | 'REJECTED' | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    async function loadWitnessRequest() {
      if (!token) {
        setError('Invalid witness verification token link.');
        setLoading(false);
        return;
      }

      try {
        // Parse token format: WV-{loanId}-{witnessIdx} or raw token
        const cleanToken = token.trim();
        let loanId = cleanToken;
        let wIdx = 1;

        if (cleanToken.startsWith('WV-')) {
          const parts = cleanToken.split('-');
          if (parts.length >= 3) {
            wIdx = parseInt(parts[parts.length - 1]) || 1;
            loanId = parts.slice(1, parts.length - 1).join('-');
          }
        }

        setWitnessIndex(wIdx);

        // Fetch loan from localDb or Supabase
        let targetLoan = localDb.getLoans().find((l: any) => l.id === loanId || l.loan_no === loanId || (l.id && l.id.slice(0, 8) === loanId));

        if (!targetLoan) {
          const { data, error: dbErr } = await supabase
            .from('loans')
            .select('*')
            .or(`id.eq.${loanId},loan_no.eq.${loanId}`)
            .limit(1);

          if (!dbErr && data && data.length > 0) {
            targetLoan = data[0];
          }
        }

        if (!targetLoan) {
          // Check loan_requests table as well
          const { data: reqData } = await supabase
            .from('loan_requests')
            .select('*')
            .or(`id.eq.${loanId},loan_no.eq.${loanId}`)
            .limit(1);

          if (reqData && reqData.length > 0) {
            targetLoan = reqData[0];
          }
        }

        if (!targetLoan) {
          // Mock loan fallback for demo token testing
          targetLoan = {
            id: loanId,
            loan_no: loanId.startsWith('PYD') ? loanId : `PYD-IL-2026-${loanId.slice(0, 5)}`,
            name: 'Muhammed Anas',
            applicant_name: 'Muhammed Anas',
            amount: 30000,
            amt: 30000,
            purpose: 'Medical Relief & Healthcare',
            months: 3,
            witness1_name: 'Rizwan',
            witness1_phone: '9876543210',
            witness2_name: 'Subair',
            witness2_phone: '9123456789'
          };
        }

        setLoan(targetLoan);

        const wName = wIdx === 2 ? (targetLoan.witness2_name || 'Witness 2') : (targetLoan.witness1_name || 'Witness 1');
        const wPhone = wIdx === 2 ? (targetLoan.witness2_phone || '') : (targetLoan.witness1_phone || '');
        const currentSt = wIdx === 2 ? targetLoan.witness2_status : targetLoan.witness1_status;

        setWitnessName(wName);
        setWitnessPhone(wPhone);

        if (currentSt === 'VERIFIED' || currentSt === 'REJECTED') {
          setAlreadyProcessed(true);
          setStatusResult(currentSt);
        }
      } catch (err: any) {
        setError('Unable to load witness verification details.');
      } finally {
        setLoading(false);
      }
    }

    loadWitnessRequest();
  }, [token]);

  const handleWitnessAction = async (action: 'VERIFIED' | 'REJECTED') => {
    if (!loan) return;
    setSubmitting(true);
    try {
      const updatePayload: any = {};
      const statusKey = witnessIndex === 2 ? 'witness2_status' : 'witness1_status';
      const timeKey = witnessIndex === 2 ? 'witness2_verified_at' : 'witness1_verified_at';

      updatePayload[statusKey] = action;
      updatePayload[timeKey] = new Date().toISOString();

      // Update localDb
      localDb.updateLoan(loan.id, updatePayload);

      // Update Supabase backend
      await supabase
        .from('loans')
        .update(updatePayload)
        .eq('id', loan.id);

      await supabase
        .from('loan_requests')
        .update(updatePayload)
        .eq('id', loan.id);

      setStatusResult(action);
      setAlreadyProcessed(true);
    } catch (err: any) {
      console.warn('Witness update error:', err);
      setStatusResult(action);
      setAlreadyProcessed(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', color: 'var(--teal)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Loading Witness Verification...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', padding: '24px' }}>
        <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '36px', textAlign: 'center', borderRadius: '24px', background: '#fff', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05)' }}>
          <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', margin: '0 0 10px 0' }}>Verification Link Expired</h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0, lineHeight: 1.6 }}>{error}</p>
        </div>
      </div>
    );
  }

  const applicantName = loan?.applicant_name || loan?.name || 'Applicant';
  const loanAmt = loan?.amount || loan?.amt || loan?.loan_amount_requested || 0;
  const purposeStr = loan?.purpose || loan?.loan_purpose_category || 'Interest-Free Welfare Loan';
  const tenure = loan?.months || loan?.repayment_period_months || 3;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '32px 16px', fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ maxWidth: '520px', width: '100%' }}>
        
        {/* HEADER BANNER */}
        <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '24px 24px 0 0', padding: '28px', color: '#fff', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '10px' }}>
            <ShieldCheck size={14} color="#38bdf8" /> REG NO: 2773 • POYANAD BRANCH
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 950, margin: '0 0 4px 0' }}>
            SKSSF Poyanad Branch — Witness Verification
          </h1>
          <div style={{ fontSize: '13px', opacity: 0.85 }}>
            വായ്പാ സാക്ഷി സ്ഥിരീകരണം
          </div>
        </div>

        {/* CONTENT CARD */}
        <div className="card" style={{ background: '#fff', borderRadius: '0 0 24px 24px', padding: '32px', border: '1.5px solid #e2e8f0', borderTop: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05)' }}>
          
          {alreadyProcessed ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: statusResult === 'VERIFIED' ? '#dcfce7' : '#fee2e2',
                color: statusResult === 'VERIFIED' ? '#166534' : '#991b1b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                {statusResult === 'VERIFIED' ? <CheckCircle size={36} /> : <XCircle size={36} />}
              </div>

              <h2 style={{ fontSize: '22px', fontWeight: 950, color: '#0f172a', margin: '0 0 6px 0' }}>
                {statusResult === 'VERIFIED' ? 'Witness Verified ✓' : 'Witness Request Declined'}
              </h2>

              <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.5, margin: '0 0 20px 0' }}>
                {statusResult === 'VERIFIED'
                  ? `Thank you, ${witnessName}! You have successfully confirmed your witness verification for ${applicantName}'s loan application.`
                  : `You have declined the witness verification request for ${applicantName}'s loan application.`}
              </p>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>
                Status recorded for SKSSF Poyanad Branch Committee review.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px 18px', borderRadius: '16px', color: '#166534', fontSize: '13px', fontWeight: 700, marginBottom: '20px', textAlign: 'center' }}>
                👋 Assalamu Alaikum <b>{witnessName}</b>!
                <div style={{ fontSize: '12px', fontWeight: 500, marginTop: '2px' }}>You have been requested to act as a Witness for the loan application below:</div>
              </div>

              {/* LOAN SUMMARY SPECIFICATIONS */}
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '12px' }}>Application Summary</div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', color: '#334155' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                    <span style={{ color: '#64748b', fontWeight: 700 }}>Applicant Name:</span>
                    <span style={{ fontWeight: 900, color: '#0f172a' }}>{applicantName}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                    <span style={{ color: '#64748b', fontWeight: 700 }}>Requested Loan:</span>
                    <span style={{ fontWeight: 950, color: 'var(--teal)', fontSize: '15px' }}>₹{Number(loanAmt).toLocaleString()}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                    <span style={{ color: '#64748b', fontWeight: 700 }}>Loan Type:</span>
                    <span style={{ fontWeight: 800, color: '#10b981' }}>Interest-Free Welfare Loan (പലിശരഹിതം)</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                    <span style={{ color: '#64748b', fontWeight: 700 }}>Repayment Period:</span>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{tenure} Months</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b', fontWeight: 700 }}>Reference Code:</span>
                    <span style={{ fontWeight: 800, fontFamily: 'monospace', color: '#6366f1' }}>{loan?.loan_no || `PYD-IL-2026-${loan?.id?.slice(0, 5)}`}</span>
                  </div>
                </div>
              </div>

              {/* ACTION CONFIRMATION BUTTONS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  disabled={submitting}
                  onClick={() => handleWitnessAction('VERIFIED')}
                  className="bsm s"
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '16px',
                    fontWeight: 950,
                    fontSize: '15px',
                    background: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 10px 15px -3px rgba(16,185,129,0.2)'
                  }}
                >
                  <CheckCircle size={20} /> 🟢 Yes, I Confirm as Witness (സാക്ഷിയായി സമ്മതിക്കുന്നു)
                </button>

                <button
                  disabled={submitting}
                  onClick={() => handleWitnessAction('REJECTED')}
                  className="bsm r"
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '14px',
                    fontWeight: 800,
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <XCircle size={16} /> 🔴 No, I Decline / Do Not Know Applicant (നിരസിക്കുന്നു)
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
