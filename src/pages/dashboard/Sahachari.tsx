import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { localDb } from '../../lib/localDb';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function Sahachari() {
  const { profile } = useAuth();
  const role = profile?.role || 'member';
  const isMember = role === 'member';
  const isAdmin = role === 'admin';
  const isSuper = role === 'super';

  const [users, setUsers] = useState<any[]>(() => localDb.getUsers());
  const [selectedYear, setSelectedYear] = useState('2024 - 2025');
  const [search, setSearch] = useState('');
  
  const [logModal, setLogModal] = useState<{ open: boolean; user?: any; month?: number } | null>(null);

  const currentMonth = new Date().getMonth() + 1; // 1 to 12

  const refreshData = () => setUsers(localDb.getUsers());

  // Scope: Admins see their branch, Members see ONLY themselves, Super sees all
  const filteredUsers = users.filter((u: any) => {
    if (u.role !== 'member') return false;
    const matchBranch = isSuper || (isAdmin && u.branch === profile?.branch);
    const matchMe = isMember && (u.id === profile?.id || u.email === profile?.email);
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.memberNo?.toLowerCase().includes(search.toLowerCase());
    return (matchBranch || matchMe) && matchSearch;
  });

  // Calculate stats based on scoped users
  const activeMembers = filteredUsers.length;
  const monthTarget = activeMembers * 50;
  const collectedThisMonth = filteredUsers.reduce((sum, u) => sum + (u.sahachari_paid?.includes(currentMonth) ? 50 : 0), 0);
  const totalBalance = filteredUsers.reduce((sum, u) => sum + (u.sahachari_paid?.length || 0) * 50, 0);
  const collectionsRate = monthTarget > 0 ? Math.round((collectedThisMonth / monthTarget) * 100) : 0;
  const defaultersCount = filteredUsers.filter(u => {
    const paidCount = u.sahachari_paid?.length || 0;
    return paidCount < currentMonth;
  }).length;

  const handleLogPay = () => {
    if (logModal?.user && logModal.month !== undefined) {
      localDb.logSahachari(logModal.user.id, logModal.month);
      refreshData();
      setLogModal(null);
    }
  };

  return (
    <>
      <div className="pg-hd">
        <div>
          <div className="pg-title">🤝 Sahachari Updates</div>
          <div className="pg-sub">Manage monthly ₹50 welfare fund contributions.</div>
        </div>
      </div>
      
      <div className="stats-row fu">
        <div className="sc">
          <div className="sc-top">
            <div className="sc-ic g">✅</div>
            <span className={`sc-trend ${collectionsRate >= 70 ? 'up' : 'dn'}`}>{collectionsRate}%</span>
          </div>
          <div className="sc-num">₹{collectedThisMonth.toLocaleString()}</div>
          <div className="sc-lbl">Collected this month</div>
        </div>
        <div className="sc">
          <div className="sc-top">
            <div className="sc-ic r">❗</div>
            <span className="sc-trend dn">{defaultersCount} missed</span>
          </div>
          <div className="sc-num">₹{(defaultersCount * 50).toLocaleString()}</div>
          <div className="sc-lbl">Outstanding dues</div>
        </div>
        <div className="sc">
          <div className="sc-top">
            <div className="sc-ic t">🤝</div>
          </div>
          <div className="sc-num">₹{totalBalance.toLocaleString()}</div>
          <div className="sc-lbl">Total Fund {isMember ? 'My' : ''} Balance</div>
        </div>
        <div className="sc">
          <div className="sc-top">
            <div className="sc-ic p">📅</div>
          </div>
          <div className="sc-num">{new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}</div>
          <div className="sc-lbl">Reporting Period</div>
        </div>
      </div>

      <div className="card fu">
        <div className="card-hd">
          <div className="card-title">
            {isMember ? 'My Payment History' : `Member Payments (${filteredUsers.length} members)`}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!isMember && (
              <div className="fiw" style={{ maxWidth: '180px' }}>
                <span className="fic">🔍</span>
                <input className="fi" placeholder="Search member..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '6px 10px 6px 32px', fontSize: '13px' }} />
              </div>
            )}
            <select className="sel2" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ padding: '7px 14px', fontSize: '13px' }}>
              <option>2024 - 2025</option>
              <option>2023 - 2024</option>
            </select>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Member INFO</th>
                <th style={{ minWidth: '320px' }}>Jan - Dec Monthly Tracking (₹50)</th>
                <th>Status</th>
                {!isMember && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                    No members found matching your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(m => {
                  const paidCount = m.sahachari_paid?.length || 0;
                  const isDefaulter = paidCount < currentMonth;
                  return (
                    <tr key={m.id}>
                      <td>
                        <div><b>{m.name}</b></div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{m.memberNo} · {m.branch}</div>
                      </td>
                      <td>
                        <div className="sah-grid">
                          {[...Array(12)].map((_, i) => {
                            const monthNum = i + 1;
                            const isPaid = m.sahachari_paid?.includes(monthNum);
                            const isPast = monthNum < currentMonth;
                            
                            let cellClass = 'sah-up';
                            if (isPaid) cellClass = 'sah-paid';
                            else if (isPast) cellClass = 'sah-miss';
                            else if (monthNum === currentMonth) cellClass = 'sah-current';

                            return (
                              <div 
                                key={i} 
                                className={`sah-cell ${cellClass}`}
                                onClick={() => !isPaid && !isMember && setLogModal({ open: true, user: m, month: monthNum })}
                                style={{ cursor: !isPaid && !isMember ? 'pointer' : 'default' }}
                                title={isPaid ? 'Paid' : isPast ? 'Missed' : 'Upcoming'}
                              >
                                M{monthNum}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td>
                        {isDefaulter ? (
                          <span className="bdg bdg-r">Arrears: {currentMonth - paidCount}</span>
                        ) : (
                          <span className="bdg bdg-g">Up to date</span>
                        )}
                      </td>
                      {!isMember && (
                        <td>
                          <button 
                            className="bsm s" 
                            style={{ fontSize: '11px', padding: '5px 10px' }}
                            onClick={() => setLogModal({ open: true, user: m, month: currentMonth })}
                            disabled={m.sahachari_paid?.includes(currentMonth)}
                          >
                            {m.sahachari_paid?.includes(currentMonth) ? '✓ Paid' : 'Log Pay'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!logModal?.open}
        icon="🤝"
        title="Log Sahachari Payment?"
        message={`Record ₹50 payment for ${logModal?.user?.name} for the month of M${logModal?.month}?`}
        confirmLabel="Yes, Log Payment"
        cancelLabel="Cancel"
        onConfirm={handleLogPay}
        onCancel={() => setLogModal(null)}
      />
    </>
  );
}
