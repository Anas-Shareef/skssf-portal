import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Boxes,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardPenLine,
  Gift,
  HandHeart,
  LogOut,
  Menu,
  MoonStar,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
  Inbox,
  User,
  Vote,
  LayoutDashboard
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { localDb } from '../lib/localDb';
import { supabase } from '../lib/supabaseClient';

const SKSSF_LOGO = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik01MCA1TDg5IDI3LjdWNzIuM0w1MCA5NUwxMSA3Mi4zVjI3LjdMNTAgNVoiIGZpbGw9IndoaXRlIiBzdHJva2U9IiMxNDBCOEE2IiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTUwIDVMODkgMjcuN0w3My41IDM3TDUwIDE5LjVMMjYuNSAzN0wxMSAyNy43TDUwIDVaIiBmaWxsPSIjMDdBQUUxIi8+CjxwYXRoIGQ9Ik0xMSA3Mi4zTDUwIDk1TDg5IDcyLjNMODkgNjAuNUw1MCA4My41TDExIDYwLjVWMTtwIj4KPC9zdmc+`;

const buildNav = (role: string, isPanelCoordinator: boolean) => {
  const pending = localDb.getLoans().filter((l: any) => l.status === 'pending').length;

  const commonAdmin = [
    { sec: 'Main', items: [{ ic: BarChart3, lbl: 'Dashboard', path: '' }] },
    { sec: 'Loan Scheme', items: [{ ic: CircleDollarSign, lbl: 'Loan Management', path: '/loans', badge: pending, bc: 'r' }, { ic: CalendarCheck, lbl: 'Repayment Portal', path: '/repayments' }] },
    { sec: 'Finance', items: [{ ic: HandHeart, lbl: 'Sahachari', path: '/sahachari' }, { ic: Gift, lbl: 'Donations', path: '/donations' }] },
    { sec: 'Inventory', items: [{ ic: Boxes, lbl: 'Inventory & Catalog', path: '/inventory' }] },
    { sec: 'Reports', items: [{ ic: BarChart3, lbl: 'Reports & Export', path: '/reports' }, { ic: Settings, lbl: 'Settings', path: '/settings' }] },
  ];

  if (role === 'super') {
    return [
      commonAdmin[0],
      { sec: 'Administration', items: [{ ic: ShieldCheck, lbl: 'Manage Admins', path: '/admins' }, { ic: Users, lbl: 'Members', path: '/members' }] },
      ...commonAdmin.slice(1),
    ];
  }

  if (role === 'admin') {
    return [
      commonAdmin[0],
      { sec: 'Members', items: [{ ic: Users, lbl: 'My Members', path: '/members' }] },
      ...commonAdmin.slice(1),
    ];
  }

  if (role === 'coordinator') {
    const items = [
      { ic: BarChart3, lbl: 'Dashboard', path: '' },
      { ic: ClipboardPenLine, lbl: 'Review Queue', path: '/loans' }
    ];
    if (isPanelCoordinator) {
      items.push({ ic: Vote, lbl: 'Panel Votes', path: '/panel-votes' });
    }
    return [
      { sec: 'Main', items },
      { sec: 'Account', items: [{ ic: Settings, lbl: 'Settings', path: '/settings' }] }
    ];
  }

  // Member
  return [
    { sec: 'Main', items: [{ ic: BarChart3, lbl: 'My Dashboard', path: '' }] },
    { sec: 'Tasks', items: [
      { ic: Inbox, lbl: 'Requests Inbox', path: '/inbox' },
      { ic: CircleDollarSign, lbl: 'Loans I Filed', path: '/filed-loans' },
      { ic: CalendarCheck, lbl: 'Repayments', path: '/repayments' },
      { ic: ClipboardPenLine, lbl: 'New Application', path: '/apply' }
    ]},
    { sec: 'Logistics', items: [
      { ic: Boxes, lbl: 'Inventory', path: '/inventory/catalogue' }
    ]},
    { sec: 'Finance', items: [
      { ic: HandHeart, lbl: 'Sahachari', path: '/sahachari' },
      { ic: Gift, lbl: 'My Donations', path: '/donations' }
    ]},
    { sec: 'Account', items: [
      { ic: User, lbl: 'My Profile', path: '/profile' },
      { ic: Settings, lbl: 'Settings', path: '/settings' }
    ]}
  ];
};

const ROLE_LABELS: Record<string, { badge: string; avBg: string }> = {
  super: { badge: 'SUPER ADMIN', avBg: 'var(--teal)' },
  admin: { badge: 'ADMIN', avBg: 'var(--teal2)' },
  coordinator: { badge: 'COORDINATOR', avBg: '#6366f1' },
  member: { badge: 'MEMBER', avBg: 'var(--amber2)' },
};

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [showNotifs, setShowNotifs] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchNotifs = async () => {
    if (!profile) return;
    try {
      // Query from Supabase notifications table
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.db_id || profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifs();
    const handleUpdate = () => fetchNotifs();
    window.addEventListener('appDataUpdated', handleUpdate);
    return () => window.removeEventListener('appDataUpdated', handleUpdate);
  }, [profile]);

  const role = profile?.role || 'member';
  const prefix = role === 'super' ? '/super-admin/dashboard' : role === 'admin' ? '/admin/dashboard' : role === 'coordinator' ? '/coordinator/dashboard' : '/member/dashboard';
  
  const nav = buildNav(role, profile?.is_panel_coordinator || false);
  const roleLabel = ROLE_LABELS[role] || ROLE_LABELS.member;
  const initials = (profile?.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  const isActive = (path: string) => path === '' ? location.pathname === prefix : location.pathname.startsWith(`${prefix}${path}`);
  
  const getPageTitle = () => {
    if (location.pathname === prefix) return 'Dashboard';
    const seg = location.pathname.split('/').pop() || '';
    const t: Record<string, string> = {
      admins: 'Manage Admins',
      members: 'Members',
      loans: 'Loan Management',
      repayments: 'Repayments Portal',
      sahachari: 'Sahachari Scheme',
      donations: 'Donations',
      reports: 'Reports & Export',
      settings: 'Settings',
      apply: 'New Loan Application',
      inventory: 'Inventory & Catalogue',
      inbox: 'Requests Inbox',
      'filed-loans': 'Loans I Filed',
      profile: 'My Profile',
      'my-leases': 'My Leased Items',
      catalogue: 'Catalogue'
    };
    return t[seg] || seg;
  };

  const handleSignOut = () => {
    signOut();
    navigate('/');
  };

  const markAllRead = async () => {
    if (!profile) return;
    try {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', profile.db_id || profile.id)
        .is('read_at', null);
      fetchNotifs();
    } catch (e) {
      console.error(e);
    }
  };

  const isMobile = windowWidth < 640;
  const isTablet = windowWidth >= 640 && windowWidth < 1024;
  const isDesktop = windowWidth >= 1024;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: '"Outfit", "Inter", sans-serif' }}>
      
      {/* ─── SIDEBAR NAVIGATION (Desktop/Tablet) ─── */}
      {!isMobile && (
        <aside style={{
          width: isTablet ? '72px' : '260px',
          background: '#0d172a',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.2s',
          borderRight: '1px solid #1e293b',
          flexShrink: 0
        }}>
          {/* Sidebar Head */}
          <div style={{ padding: '24px 16px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: isTablet ? 'center' : 'flex-start' }}>
            <img src={SKSSF_LOGO} alt="SKSSF Logo" style={{ width: '32px', height: '32px' }} />
            {!isTablet && <span style={{ fontWeight: 950, fontSize: '16px', letterSpacing: '-0.3px' }}>SKSSF PORTAL</span>}
          </div>

          {/* Navigation Links */}
          <nav style={{ flex: 1, padding: '20px 10px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            {nav.map((g, gi) => (
              <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {!isTablet && <div style={{ fontSize: '10px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', paddingLeft: '12px', marginBottom: '4px' }}>{g.sec}</div>}
                {g.items.map((item: any, ii: number) => {
                  const Icon = item.ic;
                  const active = isActive(item.path);
                  return (
                    <Link
                      to={`${prefix}${item.path}`}
                      key={ii}
                      title={isTablet ? item.lbl : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isTablet ? 'center' : 'flex-start',
                        gap: '12px',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        color: active ? '#fff' : '#94a3b8',
                        background: active ? 'var(--teal)' : 'transparent',
                        textDecoration: 'none',
                        fontWeight: 800,
                        fontSize: '13.5px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Icon size={18} />
                      {!isTablet && <span>{item.lbl}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Sidebar Foot */}
          <div style={{ padding: '20px 10px', borderTop: '1px solid #1e293b' }}>
            <button
              onClick={handleSignOut}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isTablet ? 'center' : 'flex-start',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '12px',
                background: 'none',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '13.5px'
              }}
            >
              <LogOut size={18} />
              {!isTablet && <span>Logout</span>}
            </button>
          </div>
        </aside>
      )}

      {/* ─── MAIN CONTENT WRAPPER ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, paddingBottom: isMobile ? '70px' : 0 }}>
        
        {/* Top Header Bar */}
        <header style={{
          height: '64px',
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 50
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', margin: 0 }}>
            {getPageTitle()}
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Notification Bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowNotifs(!showNotifs)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', padding: '6px', borderRadius: '50%' }}
              >
                <Bell size={20} />
                {notifications.filter(n => !n.read_at).length > 0 && (
                  <span style={{ position: 'absolute', top: '2px', right: '2px', width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%' }} />
                )}
              </button>

              {/* Notification Dropdown Pop */}
              {showNotifs && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '40px',
                  width: '320px',
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
                  zIndex: 100,
                  maxHeight: '400px',
                  overflowY: 'auto'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
                    <span style={{ fontWeight: 900, fontSize: '13px' }}>Notifications</span>
                    <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>
                      Mark all as read
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                      🔔 No notifications yet.
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: n.read_at ? 'transparent' : 'rgba(13,115,119,0.04)' }}>
                        <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: n.read_at ? 500 : 800, lineHeight: 1.4 }}>{n.message}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>{new Date(n.created_at).toLocaleDateString()}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Profile Avatar Initials */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: roleLabel.avBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '13px' }}>
                {initials}
              </div>
            </div>
          </div>
        </header>

        {/* Content Outlet */}
        <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          <Outlet />
        </main>

        {/* ─── MOBILE BOTTOM TAB BAR ─── */}
        {isMobile && (
          <nav style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: '64px',
            background: '#fff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            zIndex: 100
          }}>
            <Link to={prefix} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: location.pathname === prefix ? 'var(--teal)' : '#94a3b8' }}>
              <LayoutDashboard size={20} />
              <span style={{ fontSize: '10px', fontWeight: 800 }}>Home</span>
            </Link>

            {role === 'member' ? (
              <>
                <Link to={`${prefix}/inbox`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: location.pathname.includes('/inbox') ? 'var(--teal)' : '#94a3b8' }}>
                  <Inbox size={20} />
                  <span style={{ fontSize: '10px', fontWeight: 800 }}>Inbox</span>
                </Link>
                <Link to={`${prefix}/apply`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: location.pathname.includes('/apply') ? 'var(--teal)' : '#94a3b8' }}>
                  <ClipboardPenLine size={20} />
                  <span style={{ fontSize: '10px', fontWeight: 800 }}>Apply</span>
                </Link>
                <Link to={`${prefix}/inventory/catalogue`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: location.pathname.includes('/inventory') ? 'var(--teal)' : '#94a3b8' }}>
                  <Boxes size={20} />
                  <span style={{ fontSize: '10px', fontWeight: 800 }}>Catalog</span>
                </Link>
                <Link to={`${prefix}/profile`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: location.pathname.includes('/profile') ? 'var(--teal)' : '#94a3b8' }}>
                  <User size={20} />
                  <span style={{ fontSize: '10px', fontWeight: 800 }}>Profile</span>
                </Link>
              </>
            ) : (
              <>
                <Link to={`${prefix}/loans`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: location.pathname.includes('/loans') ? 'var(--teal)' : '#94a3b8' }}>
                  <CircleDollarSign size={20} />
                  <span style={{ fontSize: '10px', fontWeight: 800 }}>Loans</span>
                </Link>
                <Link to={`${prefix}/repayments`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: location.pathname.includes('/repayments') ? 'var(--teal)' : '#94a3b8' }}>
                  <CalendarCheck size={20} />
                  <span style={{ fontSize: '10px', fontWeight: 800 }}>EMIs</span>
                </Link>
                <button onClick={handleSignOut} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <LogOut size={20} />
                  <span style={{ fontSize: '10px', fontWeight: 800 }}>Exit</span>
                </button>
              </>
            )}
          </nav>
        )}

      </div>
    </div>
  );
}
