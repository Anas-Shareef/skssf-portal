import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SEO_MAP: Record<string, string> = {
  '/': 'SKSSF eGov | Unified Admin Portal',
  '/login/super-admin': 'Super Admin Login | SKSSF',
  '/login/admin': 'Admin Login | SKSSF',
  '/login/member': 'Member Access | SKSSF',
  '/dashboard': 'Dashboard | SKSSF eGov',
  '/dashboard/inventory': 'Inventory & Mission Control | SKSSF',
  '/dashboard/loans': 'Welfare Loan Management | SKSSF',
  '/dashboard/members': 'Member Directory | SKSSF',
  '/dashboard/reports': 'Analytics & Reports | SKSSF',
  '/dashboard/sahachari': 'Sahachari Aid Tracker | SKSSF',
};

export default function SEOManager() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    const title = SEO_MAP[path] || SEO_MAP[Object.keys(SEO_MAP).find(k => path.startsWith(k) && k !== '/') || '/'] || 'SKSSF eGov';
    document.title = title;
  }, [location]);

  return null;
}
