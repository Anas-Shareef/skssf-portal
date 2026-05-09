import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SEOManager />
        <Routes>
          <Route path="/" element={<LaunchPage />} />
          <Route path="/portal" element={<PortalSelector />} />
          <Route path="/login/:role" element={<RoleLogin />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
