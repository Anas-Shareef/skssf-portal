import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const SKSSF_LOGO = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik01MCA1TDg5IDI3LjdWNzIuM0w1MCA5NUwxMSA3Mi4zVjI3LjdMNTAgNVoiIGZpbGw9IndoaXRlIiBzdHJva2U9IiMxNDBCOEE2IiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTUwIDVMODkgMjcuN0w3My41IDM3TDUwIDE5LjVMMjYuNSAzN0wxMSAyNy43TDUwIDVaIiBmaWxsPSIjMDdBQUUxIi8+CjxwYXRoIGQ9Ik0xMSA3Mi4zTDUwIDk1TDg5IDcyLjNMODkgNjAuNUw1MCA4My41TDExIDYwLjVWMTcuM1oiIGZpbGw9IiMxNUEzNEEiLz4KPGcgY2xhc3M9Im1vc3F1ZSI+CjxwYXRoIGQ9Ik0zOCA3MEg2M0w2Mi41IDQ4QzYyLjUgNDggNTggMzggNTAgMzhDNDIgMzggMzcuNSA0OCAzNy41IDQ4TDY4IDcwWiIgZmlsbD0iIzMzMyIvPgo8cmVjdCB4PSIzNCIgeT0iNDgiIHdpZHRoPSIzIiBoZWlnaHQ9IjI1IiBmaWxsPSIjMzMzIi8+CjxjaXJjbGUgY3g9IjM1LjUiIGN5PSI0NyIgcj0iMS41IiBmaWxsPSIjMzMzIi8+CjwvZz4KPHBhdGggZD0iTTcwIDM1QzcwIDM4LjMxMzcgNjcuMzEzNyA0MSA2NCA0MUM2MC42ODYzIDQxIDU4IDM4LjMxMzcgNTggMzVDNTggMzEuNjg2MyA2MC42ODYzIDI5IDY0IDI5QzY3LjMxMzcgMjkgNzAgMzEuNjg2MyA3MCAzNVoiIGZpbGw9IiMzMzMiLz4KPC9zdmc+`;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase sends the user back with tokens in the URL hash after clicking the reset email link.
  // We need to detect the session that gets set automatically.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setSessionReady(true);
      }
    });

    // Also check if there's already an active session (e.g. page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPass.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPass !== confirmPass) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPass });
      if (updateError) { setError(updateError.message); setLoading(false); return; }

      // Also update the backend via service-role key to keep localDb in sync
      await fetch('/api/reset-own-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: (await supabase.auth.getUser()).data.user?.email,
          newPassword: newPass,
        }),
      }).catch(() => {}); // non-critical if this fails — Supabase Auth is already updated

      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
      fontFamily: "'Outfit', 'Inter', sans-serif", padding: '20px',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: '24px',
        padding: '48px 40px', width: '100%', maxWidth: '440px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
      }}>
        {/* Logo + Title */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '16px',
            background: 'rgba(255,255,255,0.1)', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src={SKSSF_LOGO} alt="SKSSF" style={{ width: '44px', height: '44px', objectFit: 'contain' }} />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
            {done ? 'Password Updated!' : 'Set New Password'}
          </div>
          <div style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.55)' }}>
            {done ? 'You can now sign in with your new password.' : 'SKSSF Poyanad Branch Portal'}
          </div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
            }}>
              <CheckCircle size={32} color="#22c55e" />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', marginBottom: '28px', lineHeight: 1.6 }}>
              Your password has been changed successfully. Please sign in with your new password.
            </p>
            <button
              onClick={() => navigate('/admin/login')}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: 'linear-gradient(135deg, #07AAE1, #0a8fc0)',
                color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Go to Sign In →
            </button>
          </div>
        ) : !sessionReady ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '14px', padding: '20px 0' }}>
            <div style={{ marginBottom: '12px', fontSize: '28px' }}>⏳</div>
            Verifying reset link… please wait.
            <br /><br />
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
              If this page stays here, your reset link may have expired.{' '}
              <button
                onClick={() => navigate('/admin/login')}
                style={{ background: 'none', border: 'none', color: '#07AAE1', cursor: 'pointer', fontSize: '12px' }}
              >
                Go back and try again.
              </button>
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: '10px', padding: '12px 16px', marginBottom: '20px',
                color: '#fca5a5', fontSize: '13.5px',
              }}>
                {error}
              </div>
            )}

            {/* New Password */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.75)', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                New Password
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }}>
                  <Lock size={16} />
                </span>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  placeholder="Min 6 characters"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  style={{
                    width: '100%', padding: '13px 44px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: '14px', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{
                  position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0,
                }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div style={{ marginBottom: '28px' }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.75)', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }}>
                  <Lock size={16} />
                </span>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPass}
                  onChange={e => setConfirmPass(e.target.value)}
                  placeholder="Repeat password"
                  required
                  autoComplete="new-password"
                  style={{
                    width: '100%', padding: '13px 44px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: '14px', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{
                  position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0,
                }}>
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: loading ? 'rgba(7,170,225,0.5)' : 'linear-gradient(135deg, #07AAE1, #0a8fc0)',
                color: '#fff', fontSize: '15px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all .2s',
              }}
            >
              {loading ? '⏳ Updating…' : '🔒 Set New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
