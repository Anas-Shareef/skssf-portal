import { useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, GraduationCap, Landmark, MoonStar, ShieldCheck } from 'lucide-react';
import heroImage from '../assets/hero.png';

const SKSSF_LOGO = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik01MCA1TDg5IDI3LjdWNzIuM0w1MCA5NUwxMSA3Mi4zVjI3LjdMNTAgNVoiIGZpbGw9IndoaXRlIiBzdHJva2U9IiMxNDBCOEE2IiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTUwIDVMODkgMjcuN0w3My41IDM3TDUwIDE5LjVMMjYuNSAzN0wxMSAyNy43TDUwIDVaIiBmaWxsPSIjMDdBQUUxIi8+CjxwYXRoIGQ9Ik0xMSA3Mi4zTDUwIDk1TDg5IDcyLjNMODkgNjAuNUw1MCA4My41TDExIDYwLjVWMTcuM1oiIGZpbGw9IiMxNUEzNEEiLz4KPGcgY2xhc3M9Im1vc3F1ZSI+CjxwYXRoIGQ9Ik0zOCA3MEg2M0w2Mi41IDQ4QzYyLjUgNDggNTggMzggNTAgMzhDNDIgMzggMzcuNSA0OCAzNy41IDQ4TDY4IDcwWiIgZmlsbD0iIzMzMyIvPgo8cmVjdCB4PSIzNCIgeT0iNDgiIHdpZHRoPSIzIiBoZWlnaHQ9IjI1IiBmaWxsPSIjMzMzIi8+CjxjaXJjbGUgY3g9IjM1LjUiIGN5PSI0NyIgcj0iMS41IiBmaWxsPSIjMzMzIi8+CjwvZz4KPHBhdGggZD0iTTcwIDM1QzcwIDM4LjMxMzcgNjcuMzEzNyA0MSA2NCA0MUM2MC42ODYzIDQxIDU4IDM4LjMxMzcgNTggMzVDNTggMzEuNjg2MyA2MC42ODYzIDI5IDY0IDI5QzY3LjMxMzcgMjkgNzAgMzEuNjg2MyA3MCAzNVoiIGZpbGw9IiMzMzMiLz4KPC9zdmc+`;

export default function PortalSelector() {
  const navigate = useNavigate();

  return (
    <div id="s-land" className="screen active" style={{ 
      display: 'flex', 
      minHeight: '100vh', 
      flexDirection: 'column', 
      background: 'var(--bg)', 
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Premium Animated Blobs */}
      <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(13,115,119,0.08), transparent 70%)', borderRadius: '50%', filter: 'blur(60px)', animation: 'pulse 10s infinite' }} />
      <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(20,160,133,0.06), transparent 70%)', borderRadius: '50%', filter: 'blur(60px)', animation: 'pulse 15s infinite' }} />
      
      <div className="l-media" style={{ backgroundImage: `url(${heroImage})`, opacity: 0.04, filter: 'grayscale(1) brightness(1.2)' }} />
      
      <div className="l-inner flex-1 flex flex-col" style={{ position: 'relative', zIndex: 10 }}>
        <nav className="l-nav fu fu1" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="logo">
            <div className="logo-mark" style={{ boxShadow: '0 0 20px rgba(13,115,119,0.15)', background: '#fff', overflow: 'hidden' }}>
              <img src={SKSSF_LOGO} alt="SKSSF Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '2px' }} />
            </div>
            <div>
              <div className="logo-name" style={{ letterSpacing: '-0.02em', color: 'var(--dark)' }}>SKSSF <span style={{ color: 'var(--teal)' }}>eGov</span></div>
              <div className="logo-sub" style={{ color: 'var(--muted)' }}>Poyanad Unit · Reg: 2773</div>
            </div>
          </div>
          <div className="nav-pill" style={{ background: 'var(--teal-pale)', borderColor: 'var(--teal-pale2)', color: 'var(--teal)' }}>
            System Status: <span style={{ color: '#10b981', marginLeft: 6, fontWeight: 700 }}>● Online</span>
          </div>
        </nav>

        <div className="hero flex-1" style={{ padding: '80px 0' }}>
          <div style={{ maxWidth: 600 }}>
            <div className="hero-tag fu fu2" style={{ background: 'var(--teal-pale)', borderColor: 'var(--teal-pale2)' }}>
              <div className="hero-dot" style={{ background: 'var(--teal)' }}></div>
              <span style={{ color: 'var(--teal)', fontWeight: 700 }}>Unified Admin Console</span>
            </div>
            <h1 className="hero-h1 fu fu2" style={{ fontSize: '72px', marginBottom: 20, color: 'var(--dark)' }}>
              Management <br />
              <em style={{ textShadow: '0 0 30px rgba(13,115,119,0.1)', color: 'var(--teal)' }}>Perfected.</em>
            </h1>
            <p className="hero-p fu fu3" style={{ fontSize: '18px', lineHeight: 1.6, maxWidth: 500, marginBottom: 40, color: 'var(--muted)' }}>
              The all-in-one digital infrastructure for SKSSF unit administration. Securely manage inventory, welfare loans, and mission deployment.
            </p>
            <div className="hero-btns fu fu3">
              <button className="btn-solid" onClick={() => navigate('/login/admin')} style={{ padding: '16px 32px', fontSize: 15, background: 'var(--teal)', color: '#fff' }}>
                Enter Admin Portal <ArrowRight size={18} />
              </button>
              <button className="btn-ghost" onClick={() => navigate('/login/member')} style={{ padding: '16px 32px', fontSize: 15, borderColor: 'var(--border2)', color: 'var(--dark)' }}>Member Access</button>
            </div>

            <div className="hero-kpi fu fu4" style={{ gap: 48 }}>
              <div>
                <div className="kpi-n" style={{ fontSize: 32, color: 'var(--dark)' }}>0%</div>
                <div className="kpi-l" style={{ color: 'var(--muted)' }}>Interest Rate</div>
              </div>
              <div style={{ width: 1, height: 40, background: 'var(--border)' }} />
              <div>
                <div className="kpi-n" style={{ fontSize: 32, color: 'var(--dark)' }}>Live</div>
                <div className="kpi-l" style={{ color: 'var(--muted)' }}>Real-time Sync</div>
              </div>
              <div style={{ width: 1, height: 40, background: 'var(--border)' }} />
              <div>
                <div className="kpi-n" style={{ fontSize: 32, color: 'var(--dark)' }}>SSL</div>
                <div className="kpi-l" style={{ color: 'var(--muted)' }}>Encrypted</div>
              </div>
            </div>
          </div>

          <div className="role-stack fu fu4" style={{ gap: 16 }}>
            <button className="rcard rt" onClick={() => navigate('/login/super-admin')} style={{ padding: '24px', background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--dark)' }}>
              <div className="rc-ic t" style={{ background: 'var(--teal-pale)', color: 'var(--teal)' }}><ShieldCheck size={26} /></div>
              <div>
                <div className="rc-title" style={{ color: 'var(--dark)', fontSize: 18 }}>Super Admin</div>
                <div className="rc-desc" style={{ color: 'var(--muted)' }}>Full system oversight and settings.</div>
              </div>
              <div className="rc-arr"><ArrowRight size={18} /></div>
            </button>

            <button className="rcard rg" onClick={() => navigate('/login/admin')} style={{ padding: '24px', background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--dark)' }}>
              <div className="rc-ic g" style={{ background: 'var(--green-pale)', color: 'var(--green)' }}><Landmark size={26} /></div>
              <div>
                <div className="rc-title" style={{ color: 'var(--dark)', fontSize: 18 }}>Unit Admin</div>
                <div className="rc-desc" style={{ color: 'var(--muted)' }}>Manage daily operations and members.</div>
              </div>
              <div className="rc-arr"><ArrowRight size={18} /></div>
            </button>

            <button className="rcard ra" onClick={() => navigate('/login/member')} style={{ padding: '24px', background: 'var(--white)', borderColor: 'var(--border)', color: 'var(--dark)' }}>
              <div className="rc-ic a" style={{ background: 'var(--amber-pale)', color: 'var(--amber2)' }}><GraduationCap size={26} /></div>
              <div>
                <div className="rc-title" style={{ color: 'var(--dark)', fontSize: 18 }}>Member</div>
                <div className="rc-desc" style={{ color: 'var(--muted)' }}>Self-service applications and history.</div>
              </div>
              <div className="rc-arr"><ArrowRight size={18} /></div>
            </button>
          </div>
        </div>
      </div>
      
      <div className="landing-strip" style={{ background: 'var(--bg2)', backdropFilter: 'blur(10px)', borderTop: '1px solid var(--border)', color: 'var(--muted)', padding: '20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', boxShadow: '0 0 10px rgba(13,115,119,0.3)' }} />
          <span style={{ fontSize: 13, letterSpacing: '0.01em', fontWeight: 600 }}>Secure Infrastructure: Loan Approvals · Sahachari Tracking · Donations · Reports · Inventory · Real-time Sync</span>
        </div>
      </div>
    </div>
  );
}
