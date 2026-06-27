import { useRef, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, Phone, User, UserRoundPlus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { supabase } from '../lib/supabaseClient';

const SKSSF_LOGO = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik01MCA1TDg5IDI3LjdWNzIuM0w1MCA5NUwxMSA3Mi4zVjI3LjdMNTAgNVoiIGZpbGw9IndoaXRlIiBzdHJva2U9IiMxNDBCOEE2IiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTUwIDVMODkgMjcuN0w3My41IDM3TDUwIDE5LjVMMjYuNSAzN0wxMSAyNy43TDUwIDVaIiBmaWxsPSIjMDdBQUUxIi8+CjxwYXRoIGQ9Ik0xMSA3Mi4zTDUwIDk1TDg5IDcyLjNMODkgNjAuNUw1MCA4My41TDExIDYwLjVWMTcuM1oiIGZpbGw9IiMxNUEzNEEiLz4KPGcgY2xhc3M9Im1vc3F1ZSI+CjxwYXRoIGQ9Ik0zOCA3MEg2M0w2Mi41IDQ4QzYyLjUgNDggNTggMzggNTAgMzhDNDIgMzggMzcuNSA0OCAzNy41IDQ4TDY4IDcwWiIgZmlsbD0iIzMzMyIvPgo8cmVjdCB4PSIzNCIgeT0iNDgiIHdpZHRoPSIzIiBoZWlnaHQ9IjI1IiBmaWxsPSIjMzMzIi8+CjxjaXJjbGUgY3g9IjM1LjUiIGN5PSI0NyIgcj0iMS41IiBmaWxsPSIjMzMzIi8+CjwvZz4KPHBhdGggZD0iTTcwIDM1QzcwIDM4LjMxMzcgNjcuMzEzNyA0MSA2NCA0MUM2MC42ODYzIDQxIDU4IDM4LjMxMzcgNTggMzVDNTggMzEuNjg2MyA2MC42ODYzIDI5IDY0IDI5QzY3LjMxMzcgMjkgNzAgMzEuNjg2MyA3MCAzNVoiIGZpbGw9IiMzMzMiLz4KPC9zdmc+`;

const ROLE_CFG: Record<string, { headline: React.ReactNode; copy: string; label: string }> = {
  'super-admin': {
    headline: <>Authority<br className="br-desktop" />starts here</>,
    copy: 'System owner access for administrator control, approvals, and unit configuration.',
    label: 'Super Admin Portal',
  },
  admin: {
    headline: <>Serve with<br className="br-desktop" />purpose</>,
    copy: 'Review loan requests, manage members, and keep unit operations moving.',
    label: 'Admin Portal',
  },
  member: {
    headline: <>Your journey<br className="br-desktop" />begins here</>,
    copy: 'Apply for support, track repayments, and stay connected to unit services.',
    label: 'Member Portal',
  },
};

interface RoleLoginProps {
  mode?: 'login' | 'register';
}

export default function RoleLogin({ mode = 'login' }: RoleLoginProps) {
  const { role } = useParams<{ role: string }>();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [tab, setTab] = useState<'si' | 'su'>(mode === 'register' ? 'su' : 'si');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [emailVal, setEmailVal] = useState('');
  const [passVal, setPassVal] = useState('');
  // Reset password modal
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    setTab(mode === 'register' ? 'su' : 'si');
  }, [mode]);

  const siEmail = useRef<HTMLInputElement>(null);
  const siPass = useRef<HTMLInputElement>(null);
  const suName = useRef<HTMLInputElement>(null);
  const suEmail = useRef<HTMLInputElement>(null);
  const suPhone = useRef<HTMLInputElement>(null);
  const suMemNo = useRef<HTMLInputElement>(null);
  const suBranch = useRef<HTMLSelectElement>(null);
  const suPass = useRef<HTMLInputElement>(null);
  const r = role && ROLE_CFG[role] ? ROLE_CFG[role] : ROLE_CFG.member;

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const ok = await signIn(emailVal, passVal);
    if (ok) {
      const prefix = role === 'super-admin' ? '/super-admin/dashboard' : role === 'admin' ? '/admin/dashboard' : '/member/dashboard';
      navigate(prefix);
    }
    else setError('Invalid email or password. Please try again.');
  };

  const doResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) { setResetError('Please enter your email address.'); return; }
    setResetStatus('loading');
    setResetError('');
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: redirectUrl,
      });
      if (resetErr) {
        setResetError(resetErr.message);
        setResetStatus('error');
      } else {
        setResetStatus('sent');
      }
    } catch (err: any) {
      setResetError(err?.message || 'Failed to send reset email.');
      setResetStatus('error');
    }
  };

  const closeResetModal = () => {
    setShowReset(false);
    setResetEmail('');
    setResetStatus('idle');
    setResetError('');
  };

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const email = suEmail.current?.value || '';
    const password = suPass.current?.value || '';
    try {
      await api.post('/auth/register', {
        role: 'member',
        name: suName.current?.value || '',
        email,
        phone: suPhone.current?.value || '',
        unit: suBranch.current?.value || '',
        member_no: suMemNo.current?.value || '',
        password,
      });
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please try again.');
      return;
    }

    const ok = await signIn(email, password);
    if (ok) {
      const prefix = role === 'super-admin' ? '/super-admin/dashboard' : role === 'admin' ? '/admin/dashboard' : '/member/dashboard';
      navigate(prefix);
    }
    else {
      setEmailVal(email);
      setPassVal(password);
      setTab('si');
      setError('Registered successfully. Please sign in.');
    }
  };

  return (
    <>
    <div id="s-login" className="login-screen screen active">
      <div className="ll">
        <button className="ll-back" onClick={() => navigate('/')}><ArrowLeft size={15} /> Back to Home</button>
        <div className="ll-body">
          <div className="ll-badge">
            <div className="ll-badge-ic" style={{ background: '#fff', overflow: 'hidden' }}>
              <img src={SKSSF_LOGO} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }} />
            </div>
            <div>
              <div className="ll-badge-name">SKSSF eGov</div>
              <div className="ll-badge-sub">{r.label}</div>
            </div>
          </div>
          <div className="ll-h">{r.headline}</div>
          <div className="ll-p">{r.copy}</div>
        </div>
        <div className="ll-foot">© {new Date().getFullYear()} SKSSF Poyanad Unit · Reg: 2773</div>
      </div>

      <div className="lr">
        <div className="lbox">
          <div className="lbox-title">Welcome back</div>
          <div className="lbox-sub">Sign in to continue to your {r.label}</div>

          {role === 'member' && (
            <div className="tabs">
              <button className={`tab ${tab === 'si' ? 'on' : ''}`} onClick={() => { navigate(`/${role}/login`); setError(''); }}>Sign In</button>
              <button className={`tab ${tab === 'su' ? 'on' : ''}`} onClick={() => { navigate(`/${role}/register`); setError(''); }}>Register</button>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          {tab === 'si' ? (
            <form onSubmit={doLogin}>
              <div className="fg">
                <label className="flbl">Email Address</label>
                <div className="fiw">
                  <span className="fic"><Mail size={16} /></span>
                  <input
                    className="fi"
                    type="email"
                    required
                    placeholder="your@email.com"
                    ref={siEmail}
                    autoComplete="username"
                    value={emailVal}
                    onChange={(e) => setEmailVal(e.target.value)}
                  />
                </div>
              </div>
              <div className="fg">
                <label className="flbl">Password</label>
                <div className="fiw">
                  <span className="fic"><Lock size={16} /></span>
                  <input
                    className="fi"
                    type={showPass ? 'text' : 'password'}
                    required
                    placeholder="Password"
                    ref={siPass}
                    autoComplete="current-password"
                    value={passVal}
                    onChange={(e) => setPassVal(e.target.value)}
                  />
                  <button type="button" className="eye" onClick={() => setShowPass(!showPass)} aria-label="Toggle password visibility">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="frow">
                <label className="rem"><input type="checkbox" defaultChecked /> Remember me</label>
                <button type="button" className="frgt" onClick={() => { setResetEmail(emailVal); setShowReset(true); }}>
                  Reset Password?
                </button>
              </div>
              <button type="submit" className="btn-login">Sign In <ArrowRight size={16} /></button>
              <div className="div">or</div>
              <div className="lfoot">Different role? <button type="button" onClick={() => navigate('/')}>Back to Portal</button></div>
            </form>
          ) : (
            <form onSubmit={doRegister}>
              <div className="fg">
                <label className="flbl">Full Name *</label>
                <div className="fiw"><span className="fic"><User size={16} /></span><input className="fi" required placeholder="Full name" ref={suName} autoComplete="name" /></div>
              </div>
              <div className="fg">
                <label className="flbl">Email *</label>
                <div className="fiw"><span className="fic"><Mail size={16} /></span><input className="fi" type="email" required placeholder="your@email.com" ref={suEmail} autoComplete="username" /></div>
              </div>
              <div className="fg">
                <label className="flbl">Mobile *</label>
                <div className="fiw"><span className="fic"><Phone size={16} /></span><input className="fi" type="tel" required placeholder="+91 XXXXX XXXXX" ref={suPhone} autoComplete="tel" /></div>
              </div>
              <div className="fg">
                <label className="flbl">Membership No. (if known)</label>
                <div className="fiw"><span className="fic"><UserRoundPlus size={16} /></span><input className="fi" placeholder="SKSSF-XXXX" ref={suMemNo} autoComplete="off" /></div>
              </div>
              <div className="fg">
                <label className="flbl">Unit *</label>
                <select className="fi" required ref={suBranch} style={{ padding: '12px 14px', appearance: 'auto' }}>
                  <option value="">Select Unit</option>
                  <option>Poyanad Central</option>
                  <option>Malappuram North</option>
                  <option>Thrissur East</option>
                  <option>Kannur West</option>
                </select>
              </div>
              <div className="fg">
                <label className="flbl">Password *</label>
                <div className="fiw">
                  <span className="fic"><Lock size={16} /></span>
                  <input className="fi" type={showPass ? 'text' : 'password'} required placeholder="Min 6 characters" minLength={6} ref={suPass} autoComplete="new-password" />
                  <button type="button" className="eye" onClick={() => setShowPass(!showPass)} aria-label="Toggle password visibility">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="btn-login">Create Account <ArrowRight size={16} /></button>
              <div className="div">or</div>
              <div className="lfoot">Have an account? <button type="button" onClick={() => { navigate(`/${role}/login`); setError(''); }}>Sign In</button></div>
            </form>
          )}
        </div>
      </div>

      <style>{`
        .login-screen {
          display: flex;
          min-height: 100vh;
        }
        @media (max-width: 900px) {
          .login-screen {
            flex-direction: column;
          }
          .ll {
            min-height: auto !important;
            padding: 40px 20px !important;
          }
          .ll-h {
            font-size: 32px !important;
            line-height: 1.1 !important;
          }
          .br-desktop {
            display: none;
          }
          .lr {
            padding: 40px 20px !important;
          }
          .lbox {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>

      {/* ── Reset Password Modal ── */}
      {showReset && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        }} onClick={(e) => { if (e.target === e.currentTarget) closeResetModal(); }}>
          <div style={{
            background: '#fff', borderRadius: '20px', padding: '36px 32px',
            width: '100%', maxWidth: '420px', boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
            position: 'relative', animation: 'scaleIn .2s ease',
          }}>
            <button onClick={closeResetModal} style={{
              position: 'absolute', top: '16px', right: '16px',
              background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: '4px',
            }}><X size={20} /></button>

            {resetStatus === 'sent' ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
                <div style={{ fontSize: '19px', fontWeight: 700, color: '#111', marginBottom: '10px' }}>Check your email</div>
                <p style={{ color: '#555', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
                  We sent a password reset link to <strong>{resetEmail}</strong>.<br />
                  Click the link in the email to set a new password.
                </p>
                <p style={{ color: '#888', fontSize: '12.5px', marginBottom: '20px' }}>
                  Didn't receive it? Check your spam folder, or wait a minute and try again.
                </p>
                <button onClick={closeResetModal} style={{
                  padding: '11px 28px', borderRadius: '10px', border: 'none',
                  background: 'linear-gradient(135deg, #07AAE1, #0a8fc0)',
                  color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '14px',
                }}>Done</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '19px', fontWeight: 700, color: '#111', marginBottom: '6px' }}>Reset Password</div>
                  <div style={{ fontSize: '13.5px', color: '#666' }}>Enter your email and we'll send you a reset link.</div>
                </div>

                {resetError && (
                  <div style={{
                    background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px',
                    padding: '11px 14px', marginBottom: '18px', color: '#dc2626', fontSize: '13.5px',
                  }}>{resetError}</div>
                )}

                <form onSubmit={doResetPassword}>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#333', marginBottom: '8px' }}>Email Address</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#aaa' }}>
                        <Mail size={15} />
                      </span>
                      <input
                        type="email" required
                        value={resetEmail}
                        onChange={e => setResetEmail(e.target.value)}
                        placeholder="your@email.com"
                        autoComplete="email"
                        style={{
                          width: '100%', padding: '12px 14px 12px 38px', borderRadius: '10px',
                          border: '1.5px solid #e5e7eb', fontSize: '14px', boxSizing: 'border-box',
                          outline: 'none', color: '#111',
                        }}
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={resetStatus === 'loading'} style={{
                    width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
                    background: resetStatus === 'loading' ? '#93c5fd' : 'linear-gradient(135deg, #07AAE1, #0a8fc0)',
                    color: '#fff', fontSize: '14.5px', fontWeight: 600,
                    cursor: resetStatus === 'loading' ? 'not-allowed' : 'pointer',
                  }}>
                    {resetStatus === 'loading' ? '⏳ Sending…' : '📧 Send Reset Link'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
