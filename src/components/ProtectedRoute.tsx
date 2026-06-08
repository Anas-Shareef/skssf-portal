import { Navigate } from 'react-router-dom';
import { MoonStar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: ('super' | 'admin' | 'member')[] }) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}><MoonStar size={32} /></div>
          <div style={{ color: 'var(--muted)', fontSize: '14px' }}>Loading portal...</div>
        </div>
      </div>
    );
  }

  if (!profile) return <Navigate to="/" replace />;

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
