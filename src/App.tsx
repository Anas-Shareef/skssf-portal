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
import ResetPassword from './pages/ResetPassword';
import PublicLoanRequest from './pages/PublicLoanRequest';

// Member sub-pages
import MemberInbox from './pages/dashboard/MemberInbox';
import FiledLoans from './pages/dashboard/FiledLoans';
import FiledLoanDetail from './pages/dashboard/FiledLoanDetail';
import MemberRepayments from './pages/dashboard/MemberRepayments';
import MemberInventory from './pages/dashboard/MemberInventory';
import MemberProfile from './pages/dashboard/MemberProfile';

// Coordinator pages
import CoordinatorDashboard from './pages/coordinator/CoordinatorDashboard';
import CoordinatorLoans from './pages/coordinator/CoordinatorLoans';
import CoordinatorLoanDetail from './pages/coordinator/CoordinatorLoanDetail';
import PanelVotes from './pages/coordinator/PanelVotes';

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
          {/* ── Public routes ── */}
          <Route path="/" element={<PortalSelector />} />
          <Route path="/portal" element={<Navigate to="/" replace />} />
          <Route path="/inagurate" element={<LaunchPage />} />
          <Route path="/login/member/register" element={<Navigate to="/member/register" replace />} />
          <Route path="/login/member/register/" element={<Navigate to="/member/register" replace />} />
          <Route path="/login/:role" element={<LegacyLoginRedirect />} />
          <Route path="/:role/login" element={<RoleLogin mode="login" />} />
          <Route path="/:role/register" element={<RoleLogin mode="register" />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* Public loan request — works with or without member code */}
          <Route path="/request" element={<PublicLoanRequest />} />
          <Route path="/request/:code" element={<PublicLoanRequest />} />

          {/* ── Super Admin Dashboard ── */}
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

          {/* ── Admin Dashboard ── */}
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

          {/* ── Coordinator Dashboard ── */}
          <Route
            path="/coordinator/dashboard"
            element={
              <ProtectedRoute allowedRoles={['coordinator']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CoordinatorDashboard />} />
            <Route path="loans" element={<CoordinatorLoans />} />
            <Route path="loans/:id" element={<CoordinatorLoanDetail />} />
            <Route path="panel-votes" element={<PanelVotes />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* ── Member Dashboard ── */}
          <Route
            path="/member/dashboard"
            element={
              <ProtectedRoute allowedRoles={['member', 'admin', 'super']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            {/* Inbox — incoming public loan requests */}
            <Route path="inbox" element={<MemberInbox />} />
            {/* Filed loans (was /loans) */}
            <Route path="filed-loans" element={<FiledLoans />} />
            <Route path="filed-loans/:id" element={<FiledLoanDetail />} />
            {/* Legacy redirect */}
            <Route path="loans" element={<Navigate to="/member/dashboard/filed-loans" replace />} />
            {/* Repayments scoped to member's loans */}
            <Route path="repayments" element={<MemberRepayments />} />
            {/* Inventory */}
            <Route path="inventory" element={<MemberInventory />} />
            <Route path="inventory/catalogue" element={<Navigate to="/member/dashboard/inventory" replace />} />
            <Route path="inventory/my-leases" element={<Navigate to="/member/dashboard/inventory" replace />} />
            {/* Profile */}
            <Route path="profile" element={<MemberProfile />} />
            {/* Other */}
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
