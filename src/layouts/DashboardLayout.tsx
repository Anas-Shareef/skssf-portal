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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { localDb } from '../lib/localDb';

const SKSSF_LOGO = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik01MCA1TDg5IDI3LjdWNzIuM0w1MCA5NUwxMSA3Mi4zVjI3LjdMNTAgNVoiIGZpbGw9IndoaXRlIiBzdHJva2U9IiMxNDBCOEE2IiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggZD0iTTUwIDVMODkgMjcuN0w3My41IDM3TDUwIDE5LjVMMjYuNSAzN0wxMSAyNy43TDUwIDVaIiBmaWxsPSIjMDdBQUUxIi8+CjxwYXRoIGQ9Ik0xMSA3Mi4zTDUwIDk1TDg5IDcyLjNMODkgNjAuNUw1MCA4My41TDExIDYwLjVWMTcuM1oiIGZpbGw9IiMxNUEzNEEiLz4KPGcgY2xhc3M9Im1vc3F1ZSI+CjxwYXRoIGQ9Ik0zOCA3MEg2M0w2Mi41IDQ4QzYyLjUgNDggNTggMzggNTAgMzhDNDIgMzggMzcuNSA0OCAzNy41IDQ4TDY4IDcwWiIgZmlsbD0iIzMzMyIvPgo8cmVjdCB4PSIzNCIgeT0iNDgiIHdpZHRoPSIzIiBoZWlnaHQ9IjI1IiBmaWxsPSIjMzMzIi8+CjxjaXJjbGUgY3g9IjM1LjUiIGN5PSI0NyIgcj0iMS41IiBmaWxsPSIjMzMzIi8+CjwvZz4KPHBhdGggZD0iTTcwIDM1QzcwIDM4LjMxMzcgNjcuMzEzNyA0MSA2NCA0MUM2MC42ODYzIDQxIDU4IDM4LjMxMzcgNTggMzVDNTggMzEuNjg2MyA2MC42ODYzIDI5IDY0IDI5QzY3LjMxMzcgMjkgNzAgMzEuNjg2MyA3MCAzNVoiIGZpbGw9IiMzMzMiLz4KPC9zdmc+`;

const buildNav = (role: string) => {
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

  return [
    { sec: 'Main', items: [{ ic: BarChart3, lbl: 'My Dashboard', path: '' }] },
    { sec: 'Loan', items: [{ ic: CircleDollarSign, lbl: 'My Loans', path: '/loans' }, { ic: CalendarCheck, lbl: 'Repayment Portal', path: '/repayments' }, { ic: ClipboardPenLine, lbl: 'New Application', path: '/apply' }] },
    { sec: 'Finance', items: [{ ic: HandHeart, lbl: 'Sahachari', path: '/sahachari' }, { ic: Gift, lbl: 'My Donations', path: '/donations' }] },
    { sec: 'Account', items: [{ ic: Settings, lbl: 'Settings', path: '/settings' }] },
  ];
};

const ROLE_LABELS: Record<string, { badge: string; avBg: string }> = {
  super: { badge: 'SUPER ADMIN', avBg: 'var(--teal)' },
  admin: { badge: 'ADMIN', avBg: 'var(--teal2)' },
  member: { badge: 'MEMBER', avBg: 'var(--amber2)' },
};

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [showNotifs, setShowNotifs] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [, setDataVersion] = useState(0);
  const [pConfig, setPConfig] = useState(() => localDb.getPortalConfig());
  const [dismissedNotifs, setDismissedNotifs] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  const fetchNotifs = async () => {
    try {
      const list = await localDb.getNotifications();
      setNotifications(list);
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifs();
    const handleDataUpdate = () => {
      setPConfig(localDb.getPortalConfig());
      setDataVersion((value) => value + 1);
      fetchNotifs();
    };
    window.addEventListener('portalConfigUpdated', handleDataUpdate);
    window.addEventListener('appDataUpdated', handleDataUpdate);
    return () => {
      window.removeEventListener('portalConfigUpdated', handleDataUpdate);
      window.removeEventListener('appDataUpdated', handleDataUpdate);
    };
  }, []);

  const role = profile?.role || 'member';
  const prefix = role === 'super' ? '/super-admin/dashboard' : role === 'admin' ? '/admin/dashboard' : '/member/dashboard';
  const nav = buildNav(role);
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
      repayments: 'Repayment Portal',
      sahachari: 'Sahachari Scheme',
      donations: 'Donations',
      reports: 'Reports & Export',
      settings: 'Settings',
      apply: 'New Loan Application',
      inventory: 'Inventory & Catalog',
    };
    return t[seg] || seg;
  };

  const handleSignOut = () => {
    signOut();
    navigate('/');
  };

  const allLoans = localDb.getLoans();
  const recentLogs = allLoans
    .flatMap((l: any) => (l.audit || []).map((a: any) => ({ ...a, loanId: l.id, loanAmt: l.amt })))
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const pendingRepaymentCount = (role === 'admin' || role === 'super') ? allLoans.reduce((count: number, loan: any) => {
    if (role === 'super' || loan.branch === profile?.branch) {
      return count + (loan.repayments || []).filter((r: any) => r.request?.status === 'pending').length;
    }
    return count;
  }, 0) : 0;

  const memberRepaymentNotifs = role === 'member' ? allLoans
    .filter((loan: any) => loan.applicant_id === profile?.id || loan.memId === profile?.id)
    .flatMap((loan: any) => (loan.repayments || []).map((r: any, idx: number) => ({ loan, r, idx })))
    .filter(({ loan, r, idx }: any) =>
      (r.request?.status === 'approved' || r.request?.status === 'rejected') &&
      r.request?.reviewedAt &&
      !dismissedNotifs.includes(`${loan.id}-${idx}`)
    ) : [];

  return (
    <div id="s-dash" className="dashboard-layout screen active" style={{ display: 'flex', flexDirection: 'row', minHeight: '100vh' }}>
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sb-head">
          <div className="sb-logo">
            <div className="sb-logo-ic" style={{ background: '#fff', overflow: 'hidden', padding: '3px' }}>
              <img src={SKSSF_LOGO} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <div className="sb-logo-txt">{pConfig.orgName.split(' ')[0]} {pConfig.orgName.split(' ')[1] || ''}</div>
              <div className="sb-logo-sub">{pConfig.orgName.split(' ').slice(2).join(' ') || 'Unit Portal'}</div>
            </div>
          </div>
          <div className="sb-user">
            <div className="sb-av" style={{ background: profile?.avatar ? 'transparent' : roleLabel.avBg, overflow: 'hidden' }}>
              {profile?.avatar ? <img src={profile.avatar} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
            </div>
            <div>
              <div className="sb-uname">{profile?.name || 'User'}</div>
              <div className="sb-uemail">{profile?.email || ''}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <div className="sb-badge" style={{ margin: 0 }}>{roleLabel.badge}</div>
                <button 
                  title="Force refresh data from server"
                  onClick={() => {
                    if (window.confirm('Clear local cache and re-sync from server?')) {
                      Object.keys(localStorage).forEach(k => {
                        if (k.startsWith('db_') || k === 'portal_config') localStorage.removeItem(k);
                      });
                      window.location.reload();
                    }
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, opacity: 0.6, display: 'flex' }}
                >🔄</button>
              </div>
            </div>
          </div>
        </div>

        <nav className="sb-nav">
          {nav.map((g, gi) => (
            <div key={gi}>
              <div className="sb-sec">{g.sec}</div>
              {g.items.map((item: any, ii: number) => {
                const Icon = item.ic;
                return (
                  <Link to={`${prefix}${item.path}`} key={ii} onClick={() => setIsSidebarOpen(false)} className={`ni ${isActive(item.path) ? 'on' : ''}`} style={{ textDecoration: 'none' }}>
                    <span className="ni-ic"><Icon size={17} /></span>
                    {item.lbl}
                    {item.badge > 0 && <span className={`ni-badge ${item.bc || 't'}`}>{item.badge}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          <button className="ni logout" onClick={handleSignOut}>
            <span className="ni-ic"><LogOut size={17} /></span>Logout
          </button>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="ico-btn menu-btn" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <div className="tb-title">{getPageTitle()}</div>
          </div>
          <div className="tb-right">
            <button className="ico-btn" onClick={() => setShowNotifs(!showNotifs)} aria-label="Notifications" style={{ position: 'relative' }}>
              <Bell size={18} />
              {notifications.filter((n: any) => !n.is_read).length > 0 && (
                <div style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  background: 'var(--red)', color: '#fff', fontSize: '9px', fontWeight: 800,
                  borderRadius: '50%', minWidth: '14px', height: '14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '2px', border: '1.5px solid #fff'
                }}>
                  {notifications.filter((n: any) => !n.is_read).length}
                </div>
              )}
            </button>
            <button className="ico-btn" aria-label="Search"><Search size={18} /></button>

            {showNotifs && (
              <div className="notif-pop show" style={{ width: '320px', maxHeight: '400px', overflowY: 'auto' }}>
                <div className="np-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--dark)' }}>Notifications</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {notifications.filter((n: any) => !n.is_read).length > 0 && (
                      <button 
                        style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        onClick={async () => {
                          await localDb.markNotificationsAsRead();
                          fetchNotifs();
                        }}
                      >
                        Mark all as read
                      </button>
                    )}
                    <button className="icon-clear" onClick={() => setShowNotifs(false)} style={{ display: 'flex' }}><X size={14} /></button>
                  </div>
                </div>
                {notifications.length === 0 ? (
                  <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                    🔔 No notifications yet.
                  </div>
                ) : (
                  notifications.map((n: any) => {
                    const icon = n.type === 'overdue' ? '⚠️' : (n.type === 'urgent' ? '⏳' : 'ℹ️');
                    const bg = n.type === 'overdue' ? '#fee2e2' : (n.type === 'urgent' ? '#fef3c7' : '#e0f2fe');
                    
                    return (
                      <div 
                        key={n.id} 
                        onClick={async () => {
                          if (!n.is_read) {
                            await localDb.markNotificationsAsRead();
                            fetchNotifs();
                          }
                          setShowNotifs(false);
                          navigate(`${prefix}/repayments?loanId=${n.loan_id}`);
                        }}
                        style={{
                          display: 'flex', gap: '10px', padding: '12px 14px',
                          borderBottom: '1px solid var(--border2)', cursor: 'pointer',
                          background: n.is_read ? 'transparent' : 'var(--teal-pale)',
                          transition: 'background 0.2s',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '14px', flexShrink: 0
                        }}>
                          {icon}
                        </div>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ fontSize: '12px', fontWeight: n.is_read ? 500 : 700, color: 'var(--dark)', lineHeight: '1.4' }}>
                            {n.message}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Ref: {n.loan_id}</span>
                            <span>{new Date(n.created_at).toLocaleDateString('en-GB')}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </header>

        <main className="main">
          <div className="mp">
            {(role === 'admin' || role === 'super') && pendingRepaymentCount > 0 && (
              <div className="notice-banner">
                <CheckCircle2 size={20} />
                <span>You have <b>{pendingRepaymentCount}</b> repayment submission{pendingRepaymentCount > 1 ? 's' : ''} waiting for review.</span>
                <Link to={`${prefix}/repayments`}>Review Now <ChevronRight size={14} /></Link>
              </div>
            )}

            {role === 'member' && memberRepaymentNotifs.slice(0, 2).map(({ loan, r, idx }: any) => (
              <div key={`${loan.id}-${idx}`} className={`notice-banner ${r.request.status === 'approved' ? 'success' : 'danger'}`}>
                <span>
                  <b>{r.request.status === 'approved' ? 'Payment Approved' : 'Payment Rejected'}</b>
                  <span style={{ marginLeft: 6 }}>EMI #{idx + 1} for {loan.id} was {r.request.status}.</span>
                </span>
                <button className="icon-clear" onClick={() => setDismissedNotifs((p: string[]) => [...p, `${loan.id}-${idx}`])}><X size={16} /></button>
              </div>
            ))}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
