import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Landmark, Globe } from 'lucide-react';
import LaunchPreloader from '../components/LaunchPreloader';
import { useState } from 'react';

const sayyidPhoto = "/src/assets/jifri thangal.jpg";

const SKSSF_LOGO = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik01MCA1TDg5IDI3LjdWNzIuM0w1MCA5NUwxMSA3Mi4zVjI3LjdMNTAgNVoiIGZpbGw9IndoaXRlIiBzdHJva2U9IiMxNDBCOEE2IiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTUwIDVMODkgMjcuN0w3My41IDM3TDUwIDE5LjVMMjYuNSAzN0wxMSAyNy43TDUwIDVaIiBmaWxsPSIjMDdBQUUxIi8+CjxwYXRoIGQ9Ik0xMSA3Mi4zTDUwIDk1TDg5IDcyLjNMODkgNjAuNUw1MCA4My41TDExIDYwLjVWMTcuM1oiIGZpbGw9IiMxNUEzNEEiLz4KPGcgY2xhc3M9Im1vc3F1ZSI+CjxwYXRoIGQ9Ik0zOCA3MEg2M0w2Mi41IDQ4QzYyLjUgNDggNTggMzggNTAgMzhDNDIgMzggMzcuNSA0OCAzNy41IDQ4TDY4IDcwWiIgZmlsbD0iIzMzMyIvPgo8cmVjdCB4PSIzNCIgeT0iNDgiIHdpZHRoPSIzIiBoZWlnaHQ9IjI1IiBmaWxsPSIjMzMzIi8+CjxjaXJjbGUgY3g9IjM1LjUiIGN5PSI0NyIgcj0iMS41IiBmaWxsPSIjMzMzIi8+CjwvZz4KPHBhdGggZD0iTTcwIDM1QzcwIDM4LjMxMzcgNjcuMzEzNyA0MSA2NCA0MUM2MC42ODYzIDQxIDU4IDM4LjMxMzcgNTggMzVDNTggMzEuNjg2MyA2MC42ODYzIDI5IDY0IDI5QzY3LjMxMzcgMjkgNzAgMzEuNjg2MyA3MCAzNVoiIGZpbGw9IiMzMzMiLz4KPC9zdmc+`;

export default function LaunchPage() {
  const navigate = useNavigate();
  const [isLaunching, setIsLaunching] = useState(false);

  if (isLaunching) {
    return <LaunchPreloader onComplete={() => navigate('/portal')} />;
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f2f0eb', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Poppins', sans-serif",
      padding: '40px'
    }}>
      {/* Texture Layer */}
      <div className="l-grid" style={{ position: 'absolute', inset: 0, opacity: 0.4, pointerEvents: 'none' }}></div>
      <div style={{ 
        position: 'absolute', 
        top: '-10%', 
        left: '-10%', 
        width: '600px', 
        height: '600px', 
        background: 'radial-gradient(circle, rgba(13,115,119,0.03), transparent 70%)', 
        borderRadius: '50%', 
        filter: 'blur(100px)' 
      }}></div>

      <div style={{ 
        position: 'relative', 
        zIndex: 10, 
        width: '100%', 
        maxWidth: '1100px',
        display: 'flex',
        flexDirection: 'column',
        gap: '60px'
      }}>
        
        {/* Main Content Split */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1.2fr 0.8fr', 
          gap: '80px', 
          alignItems: 'center' 
        }}>
          
          {/* Left Side: Ceremonial Content */}
          <div style={{ animation: 'fadeInLeft 1s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '30px' }}>
              <div style={{ 
                width: '60px', height: '60px', background: '#fff', 
                borderRadius: '15px', boxShadow: '0 8px 25px rgba(13,115,119,0.1)',
                padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <img src={SKSSF_LOGO} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>SKSSF E-GOVERNMENT</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#0D7377', letterSpacing: '2px' }}>OFFICIAL PORTAL</div>
              </div>
            </div>

            <h2 style={{ 
              fontSize: '14px', 
              fontWeight: 800, 
              color: '#0D7377', 
              textTransform: 'uppercase', 
              letterSpacing: '5px', 
              marginBottom: '20px',
              opacity: 0.8
            }}>
              Digital Inauguration
            </h2>

            <h1 style={{ 
              fontSize: '56px', 
              fontWeight: 950, 
              color: '#0f172a', 
              lineHeight: 1.1, 
              marginBottom: '24px',
              letterSpacing: '-2px'
            }}>
              Official Launching <br /> Ceremony
            </h1>

            <p style={{ 
              fontSize: '18px', 
              color: '#64748b', 
              lineHeight: 1.6, 
              marginBottom: '40px',
              maxWidth: '500px'
            }}>
              Witness the digital transformation of SKSSF Poyanad Unit infrastructure, officially inaugurated by:
            </p>

            {/* Name Presentation Card */}
            <div style={{ 
              background: '#fff', 
              padding: '30px', 
              borderRadius: '24px', 
              border: '1.5px solid #e2e8f0',
              boxShadow: '0 20px 40px rgba(0,0,0,0.03)',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}>
              <div style={{ width: '4px', height: '60px', background: '#0D7377', borderRadius: '4px' }}></div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', marginBottom: '4px' }}>
                  Sayyid Jifri Muthukkoya Thangal
                </div>
                <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Landmark size={14} /> President, Samastha Kerala Jam'iyyathul Ulama
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Portrait Presentation */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center',
            animation: 'fadeInRight 1.2s ease-out'
          }}>
            <div style={{ position: 'relative' }}>
              <div style={{ 
                width: '400px', 
                height: '460px', 
                borderRadius: '32px', 
                overflow: 'hidden',
                boxShadow: '0 40px 80px rgba(13,115,119,0.15)',
                border: '8px solid #fff',
                background: '#e2e8f0'
              }}>
                <img 
                  src={sayyidPhoto} 
                  alt="Sayyid" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} 
                />
              </div>
              <div style={{ 
                position: 'absolute', 
                bottom: '30px', 
                left: '-30px', 
                background: '#fff', 
                padding: '15px 25px', 
                borderRadius: '20px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                border: '1.5px solid #f1f5f9'
              }}>
                <ShieldCheck size={20} color="#0D7377" />
                <span style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>OFFICIAL INAUGURATOR</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Section: Launch Button */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: '20px',
          animation: 'fadeInUp 1s ease-out 0.5s both'
        }}>
          <div style={{ 
            fontSize: '12px', 
            fontWeight: 800, 
            color: '#64748b', 
            letterSpacing: '3px',
            textTransform: 'uppercase'
          }}>
            Proceed to the digital interface
          </div>
          <button 
            onClick={() => setIsLaunching(true)}
            className="btn-launch-perfect"
            style={{ 
              padding: '24px 80px', 
              fontSize: '20px', 
              fontWeight: 900, 
              borderRadius: '60px',
              border: 'none', 
              background: 'linear-gradient(135deg, #0D7377 0%, #14b8a6 100%)',
              color: '#fff', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '15px',
              boxShadow: '0 20px 40px rgba(13,115,119,0.3)',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            Launch Website <ArrowRight size={24} />
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '30px', marginTop: '10px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>
                <Globe size={14} /> GLOBAL ACCESS
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>
                <ShieldCheck size={14} /> SECURE ENCRYPTION
             </div>
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: '30px', color: '#64748b', fontSize: '12px', fontWeight: 600, letterSpacing: '1px' }}>
        © {new Date().getFullYear()} SKSSF POYANAD UNIT · DIGITAL INFRASTRUCTURE
      </div>

      <style>{`
        @keyframes fadeInLeft {
          from { opacity: 0; transform: translateX(-40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeInRight {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .btn-launch-perfect:hover {
          transform: translateY(-8px);
          box-shadow: 0 30px 60px rgba(13,115,119,0.4);
        }
        .btn-launch-perfect:active {
          transform: scale(0.96);
        }
      `}</style>
    </div>
  );
}
