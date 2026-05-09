import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, Phone, User, UserRoundPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

const SKSSF_LOGO = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik01MCA1TDg5IDI3LjdWNzIuM0w1MCA5NUwxMSA3Mi4zVjI3LjdMNTAgNVoiIGZpbGw9IndoaXRlIiBzdHJva2U9IiMxNDBCOEE2IiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTUwIDVMODkgMjcuN0w3My41IDM3TDUwIDE5LjVMMjYuNSAzN0wxMSAyNy43TDUwIDVaIiBmaWxsPSIjMDdBQUUxIi8+CjxwYXRoIGQ9Ik0xMSA3Mi4zTDUwIDk1TDg5IDcyLjNMODkgNjAuNUw1MCA4My41TDExIDYwLjVWMTcuM1oiIGZpbGw9IiMxNUEzNEEiLz4KPGcgY2xhc3M9Im1vc3F1ZSI+CjxwYXRoIGQ9Ik0zOCA3MEg2M0w2Mi41IDQ4QzYyLjUgNDggNTggMzggNTAgMzhDNDIgMzggMzcuNSA0OCAzNy41IDQ4TDY4IDcwWiIgZmlsbD0iIzMzMyIvPgo8cmVjdCB4PSIzNCIgeT0iNDgiIHdpZHRoPSIzIiBoZWlnaHQ9IjI1IiBmaWxsPSIjMzMzIi8+CjxjaXJjbGUgY3g9IjM1LjUiIGN5PSI0NyIgcj0iMS41IiBmaWxsPSIjMzMzIi8+CjwvZz4KPHBhdGggZD0iTTcwIDM1QzcwIDM4LjMxMzcgNjcuMzEzNyA0MSA2NCA0MUM2MC42ODYzIDQxIDU4IDM4LjMxMzcgNTggMzVDNTggMzEuNjg2MyA2MC42ODYzIDI5IDY0IDI5QzY3LjMxMzcgMjkgNzAgMzEuNjg2MyA3MCAzNVoiIGZpbGw9IiMzMzMiLz4KPC9zdmc+`;

const ROLE_CFG: Record<string, { headline: React.ReactNode; copy: string; label: string }> = {
  'super-admin': {
    headline: <>Authority<br />starts here</>,
    copy: 'System owner access for administrator control, approvals, and unit configuration.',
    label: 'Super Admin Portal',
  },
  admin: {
    headline: <>Serve with<br />purpose</>,
    copy: 'Review loan requests, manage members, and keep unit operations moving.',
    label: 'Admin Portal',
  },
  member: {
    headline: <>Your journey<br />begins here</>,
    copy: 'Apply for support, track repayments, and stay connected to unit services.',
    label: 'Member Portal',
  },
};

export default function RoleLogin() {
  const { role } = useParams<{ role: string }>();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [tab, setTab] = useState<'si' | 'su'>('si');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');

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
    const ok = await signIn(siEmail.current?.value || '', siPass.current?.value || '');
    if (ok) navigate('/dashboard');
    else setError('Invalid email or password. Please try again.');
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
        branch: suBranch.current?.value || '',
        member_no: suMemNo.current?.value || '',
        password,
      });
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please try again.');
      return;
    }

    const ok = await signIn(email, password);
    if (ok) navigate('/dashboard');
    else {
      setTab('si');
      setError('Registered successfully. Please sign in.');
    }
  };

  return (
    <div id="s-login" className="screen active" style={{ display: 'flex', minHeight: '100vh', flexDirection: 'row' }}>
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
              <button className={`tab ${tab === 'si' ? 'on' : ''}`} onClick={() => { setTab('si'); setError(''); }}>Sign In</button>
              <button className={`tab ${tab === 'su' ? 'on' : ''}`} onClick={() => { setTab('su'); setError(''); }}>Register</button>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          {tab === 'si' ? (
            <form onSubmit={doLogin}>
              <div className="fg">
                <label className="flbl">Email Address</label>
                <div className="fiw">
                  <span className="fic"><Mail size={16} /></span>
                  <input className="fi" type="email" required placeholder="your@email.com" ref={siEmail} />
                </div>
              </div>
              <div className="fg">
                <label className="flbl">Password</label>
                <div className="fiw">
                  <span className="fic"><Lock size={16} /></span>
                  <input className="fi" type={showPass ? 'text' : 'password'} required placeholder="Password" ref={siPass} />
                  <button type="button" className="eye" onClick={() => setShowPass(!showPass)} aria-label="Toggle password visibility">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="frow">
                <label className="rem"><input type="checkbox" defaultChecked /> Remember me</label>
                <span className="frgt">Reset Password?</span>
              </div>
              <button type="submit" className="btn-login">Sign In <ArrowRight size={16} /></button>
              <div className="div">or</div>
              <div className="lfoot">Different role? <button type="button" onClick={() => navigate('/')}>Back to Portal</button></div>
            </form>
          ) : (
            <form onSubmit={doRegister}>
              <div className="fg">
                <label className="flbl">Full Name *</label>
                <div className="fiw"><span className="fic"><User size={16} /></span><input className="fi" required placeholder="Full name" ref={suName} /></div>
              </div>
              <div className="fg">
                <label className="flbl">Email *</label>
                <div className="fiw"><span className="fic"><Mail size={16} /></span><input className="fi" type="email" required placeholder="your@email.com" ref={suEmail} /></div>
              </div>
              <div className="fg">
                <label className="flbl">Mobile *</label>
                <div className="fiw"><span className="fic"><Phone size={16} /></span><input className="fi" type="tel" required placeholder="+91 XXXXX XXXXX" ref={suPhone} /></div>
              </div>
              <div className="fg">
                <label className="flbl">Membership No. (if known)</label>
                <div className="fiw"><span className="fic"><UserRoundPlus size={16} /></span><input className="fi" placeholder="SKSSF-XXXX" ref={suMemNo} /></div>
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
                  <input className="fi" type={showPass ? 'text' : 'password'} required placeholder="Min 6 characters" minLength={6} ref={suPass} />
                  <button type="button" className="eye" onClick={() => setShowPass(!showPass)} aria-label="Toggle password visibility">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="btn-login">Create Account <ArrowRight size={16} /></button>
              <div className="div">or</div>
              <div className="lfoot">Have an account? <button type="button" onClick={() => { setTab('si'); setError(''); }}>Sign In</button></div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
