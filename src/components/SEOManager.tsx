import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SEO_MAP: Record<string, string> = {
  '/': 'SKSSF eGov | Unified Admin Portal',
  '/inagurate': 'Inauguration | SKSSF',
  '/login/super-admin': 'Super Admin Login | SKSSF',
  '/login/admin': 'Admin Login | SKSSF',
  '/login/member': 'Member Access | SKSSF',
};

export default function SEOManager() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    let title = SEO_MAP[path];

    if (!title) {
      if (path.endsWith('/inventory')) title = 'Inventory & Mission Control | SKSSF';
      else if (path.endsWith('/loans')) title = 'Welfare Loan Management | SKSSF';
      else if (path.endsWith('/members')) title = 'Member Directory | SKSSF';
      else if (path.endsWith('/reports')) title = 'Analytics & Reports | SKSSF';
      else if (path.endsWith('/sahachari')) title = 'Sahachari Aid Tracker | SKSSF';
      else if (path.endsWith('/repayments')) title = 'Repayments | SKSSF';
      else if (path.endsWith('/donations')) title = 'Donations | SKSSF';
      else if (path.endsWith('/settings')) title = 'Settings | SKSSF';
      else if (path.endsWith('/apply')) title = 'Apply for Loan | SKSSF';
      else if (path.endsWith('/admins')) title = 'Manage Admins | SKSSF';
      else if (path.startsWith('/super-admin/dashboard')) title = 'Super Admin Dashboard | SKSSF eGov';
      else if (path.startsWith('/admin/dashboard')) title = 'Admin Dashboard | SKSSF eGov';
      else if (path.startsWith('/member/dashboard')) title = 'Member Dashboard | SKSSF eGov';
      else title = 'SKSSF eGov';
    }

    document.title = title;
  }, [location]);

  return null;
}
