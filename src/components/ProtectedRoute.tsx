import { Navigate } from 'react-router-dom';
import { MoonStar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ 
  children, 
  allowedRoles,
  requiredPermission
}: { 
  children: React.ReactNode; 
  allowedRoles?: ('super' | 'admin' | 'coordinator' | 'member')[]; 
  requiredPermission?: string;
}) {
  const { profile, loading, hasPermission } = useAuth();

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

  if (requiredPermission && !hasPermission(requiredPermission)) {
    // Return a clean 403 styling
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#1e293b', marginBottom: '8px' }}>403 - Access Denied</h2>
          <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>You do not have permission to view this page.</p>
          <a href="/" style={{ padding: '10px 20px', background: 'var(--teal)', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontWeight: 700 }}>Go to Home</a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
