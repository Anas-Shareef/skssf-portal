import { useEffect, useState } from 'react';

interface Props {
  onComplete: () => void;
}

export default function LaunchPreloader({ onComplete }: Props) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'bismillah' | 'cinematic'>('bismillah');

  useEffect(() => {
    // Phase 1: Bismillah duration
    const bismillahTimer = setTimeout(() => {
      setPhase('cinematic');
    }, 2000);

    // Phase 2: Progress bar duration
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(onComplete, 800); // Small delay after 100% for impact
          return 100;
        }
        return prev + 0.8; // Smooth fill
      });
    }, 20);

    return () => {
      clearTimeout(bismillahTimer);
      clearInterval(interval);
    };
  }, [onComplete]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      background: '#040b09', // Deep dark atmospheric void
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      color: '#fff',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Background Bokeh Highlights */}
      <div className="bokeh" style={{ position: 'absolute', top: '20%', left: '10%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(20,184,166,0.05), transparent 70%)', filter: 'blur(80px)' }} />
      <div className="bokeh" style={{ position: 'absolute', bottom: '10%', right: '5%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(13,115,119,0.05), transparent 70%)', filter: 'blur(100px)' }} />

      {/* Floating Particles Container */}
      <div className="particles-container">
        {[...Array(20)].map((_, i) => (
          <div key={i} className="particle" style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 5}s`,
            width: `${Math.random() * 3 + 1}px`,
            height: `${Math.random() * 3 + 1}px`,
          }} />
        ))}
      </div>

      {phase === 'bismillah' ? (
        /* Phase 1: Bismillah reveal */
        <div style={{ 
          fontSize: '48px', 
          fontWeight: 400, 
          textAlign: 'center',
          animation: 'bismillahReveal 2s ease-in-out forwards',
          fontFamily: "'Amiri', serif",
          color: '#f2f0eb'
        }}>
          بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
        </div>
      ) : (
        /* Phase 2: Cinematic UI */
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          width: '100%', 
          maxWidth: '400px',
          animation: 'fadeIn 1s ease-out'
        }}>
          {/* Logo/Title */}
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <div style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '4px', color: '#14b8a6', marginBottom: '8px', opacity: 0.8 }}>SYSTEM INITIALIZATION</div>
            <div style={{ fontSize: '28px', fontWeight: 950, letterSpacing: '2px', color: '#fff', textShadow: '0 0 20px rgba(20,184,166,0.3)' }}>SKSSF E-GOVERNMENT</div>
          </div>

          {/* Liquid Progress Bar */}
          <div style={{ 
            width: '100%', 
            height: '4px', 
            background: 'rgba(255,255,255,0.05)', 
            borderRadius: '10px', 
            position: 'relative',
            overflow: 'hidden',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.05)'
          }}>
            <div style={{ 
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #0D7377, #14b8a6, #5eead4)',
              boxShadow: '0 0 15px rgba(20,184,166,0.8)',
              transition: 'width 0.1s linear'
            }} />
          </div>

          {/* Status Line */}
          <div style={{ 
            marginTop: '24px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            width: '100%',
            fontSize: '11px',
            fontWeight: 700,
            color: '#94a3b8',
            letterSpacing: '1px'
          }}>
            <div className="pulse-text">DIGITAL TRANSFORMATION</div>
            <div>{Math.round(progress)}%</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bismillahReveal {
          0% { opacity: 0; transform: scale(0.9) translateY(10px); filter: blur(10px); }
          50% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); text-shadow: 0 0 30px rgba(242,240,235,0.5); }
          100% { opacity: 0; transform: scale(1.05) translateY(-5px); filter: blur(5px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .particle {
          position: absolute;
          bottom: -10%;
          background: #14b8a6;
          border-radius: 50%;
          opacity: 0;
          animation: floatUp 5s infinite ease-in;
          filter: blur(1px);
        }
        @keyframes floatUp {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          20% { opacity: 0.5; }
          80% { opacity: 0.3; }
          100% { transform: translateY(-100vh) scale(0.5); opacity: 0; }
        }
        .pulse-text {
          animation: pulseOpacity 2s infinite;
        }
        @keyframes pulseOpacity {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; color: #14b8a6; }
        }
      `}</style>
    </div>
  );
}
