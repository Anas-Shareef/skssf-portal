import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import SEOManager from './components/SEOManager';
import ProtectedRoute from './components/ProtectedRoute';
import LaunchPage from './pages/LaunchPage';
import PortalSelector from './pages/PortalSelector';
import RoleLogin from './pages/RoleLogin';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/dashboard/Dashboard';
import Admins from './pages/dashboard/Admins';
import Members from './pages/dashboard/Members';
import LoanManagement from './pages/dashboard/LoanManagement';
import Repayments from './pages/dashboard/Repayments';
import Sahachari from './pages/dashboard/Sahachari';
import Donations from './pages/dashboard/Donations';
import Reports from './pages/dashboard/Reports';
import Settings from './pages/dashboard/Settings';
import LoanApplication from './pages/dashboard/LoanApplication';
import Inventory from './pages/dashboard/Inventory';

function LegacyLoginRedirect() {
  const { role } = useParams<{ role: string }>();
  return <Navigate to={`/${role}/login`} replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SEOManager />
        <Routes>
          <Route path="/" element={<PortalSelector />} />
          <Route path="/portal" element={<Navigate to="/" replace />} />
          <Route path="/inagurate" element={<LaunchPage />} />
          <Route path="/login/member/register" element={<Navigate to="/member/register" replace />} />
          <Route path="/login/member/register/" element={<Navigate to="/member/register" replace />} />
          <Route path="/login/:role" element={<LegacyLoginRedirect />} />
          <Route path="/:role/login" element={<RoleLogin mode="login" />} />
          <Route path="/:role/register" element={<RoleLogin mode="register" />} />

          {/* Super Admin Dashboard Routes */}
          <Route
            path="/super-admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['super']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="admins" element={<Admins />} />
            <Route path="members" element={<Members />} />
            <Route path="loans" element={<LoanManagement />} />
            <Route path="repayments" element={<Repayments />} />
            <Route path="sahachari" element={<Sahachari />} />
            <Route path="donations" element={<Donations />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="apply" element={<LoanApplication />} />
            <Route path="inventory" element={<Inventory />} />
          </Route>

          {/* Admin Dashboard Routes */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="members" element={<Members />} />
            <Route path="loans" element={<LoanManagement />} />
            <Route path="repayments" element={<Repayments />} />
            <Route path="sahachari" element={<Sahachari />} />
            <Route path="donations" element={<Donations />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="apply" element={<LoanApplication />} />
            <Route path="inventory" element={<Inventory />} />
          </Route>

          {/* Member Dashboard Routes */}
          <Route
            path="/member/dashboard"
            element={
              <ProtectedRoute allowedRoles={['member']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="loans" element={<LoanManagement />} />
            <Route path="repayments" element={<Repayments />} />
            <Route path="sahachari" element={<Sahachari />} />
            <Route path="donations" element={<Donations />} />
            <Route path="settings" element={<Settings />} />
            <Route path="apply" element={<LoanApplication />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
