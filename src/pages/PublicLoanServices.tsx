import React from 'react';
import { FilePlus2, SearchCheck, ShieldCheck, ArrowRight } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

export default function PublicLoanServices() {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const cleanCode = code?.trim() || '';

  const goToApplication = () => navigate(cleanCode ? `/request/${encodeURIComponent(cleanCode)}/apply` : '/request/apply');
  const goToTracking = () => navigate(cleanCode ? `/request/${encodeURIComponent(cleanCode)}/track` : '/request/track');

  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f8fafc 0%, #eef6f5 100%)', padding: '28px 16px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: '980px', margin: '0 auto' }}>
        <header style={{ background: '#0f172a', color: '#fff', borderRadius: '28px', padding: '32px clamp(22px, 5vw, 56px)', boxShadow: '0 24px 50px rgba(15,23,42,.14)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '14px', display: 'grid', placeItems: 'center', background: '#0d9488' }}><ShieldCheck size={25} /></div>
            <div>
              <div style={{ fontSize: '11px', letterSpacing: '.12em', fontWeight: 900, color: '#99f6e4' }}>SKSSF PORTAL</div>
              <div style={{ fontSize: '14px', fontWeight: 800 }}>Poyanad Branch Loan Services</div>
            </div>
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', lineHeight: 1.05, margin: '0 0 12px', letterSpacing: '-.04em' }}>How can we help?</h1>
          <p style={{ maxWidth: '600px', margin: 0, color: '#cbd5e1', lineHeight: 1.65, fontSize: '15px' }}>Apply for an interest-free loan or securely check the progress of an application you have already submitted.</p>
        </header>

        <section aria-label="Loan services" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '24px' }}>
          <ServiceCard
            icon={<FilePlus2 size={28} />}
            accent="#0f766e"
            title="Apply for a Loan"
            description="Submit a new loan application with your personal, financial and witness verification information."
            action="Start Loan Application"
            onClick={goToApplication}
          />
          <ServiceCard
            icon={<SearchCheck size={28} />}
            accent="#1d4ed8"
            title="Track My Application"
            description="Use your application reference and registered mobile number to view status and permitted details."
            action="Track Application"
            onClick={goToTracking}
          />
        </section>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', margin: '22px 4px 0', color: '#64748b', fontSize: '12px', lineHeight: 1.55 }}>
          <ShieldCheck size={16} color="#0f766e" style={{ flex: '0 0 auto', marginTop: '2px' }} />
          <span>Tracking requires a one-time verification code sent to the registered mobile number. Keep your application reference private.</span>
        </div>
      </div>
    </main>
  );
}

function ServiceCard({ icon, accent, title, description, action, onClick }: { icon: React.ReactNode; accent: string; title: string; description: string; action: string; onClick: () => void }) {
  return (
    <article style={{ background: '#fff', border: '1px solid #dbe4ea', borderRadius: '24px', padding: '28px', minHeight: '260px', display: 'flex', flexDirection: 'column', boxShadow: '0 14px 30px rgba(15,23,42,.06)' }}>
      <div style={{ width: '56px', height: '56px', borderRadius: '18px', display: 'grid', placeItems: 'center', color: accent, background: `${accent}12`, marginBottom: '22px' }}>{icon}</div>
      <h2 style={{ margin: '0 0 10px', color: '#0f172a', fontSize: '22px', letterSpacing: '-.02em' }}>{title}</h2>
      <p style={{ margin: 0, color: '#64748b', lineHeight: 1.65, fontSize: '14px' }}>{description}</p>
      <button type="button" onClick={onClick} style={{ marginTop: 'auto', alignSelf: 'flex-start', border: 0, borderRadius: '12px', padding: '12px 16px', background: accent, color: '#fff', fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        {action} <ArrowRight size={16} />
      </button>
    </article>
  );
}
