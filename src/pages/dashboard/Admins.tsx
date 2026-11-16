import { useState, useRef, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { localDb } from '../../lib/localDb';
import ConfirmDialog from '../../components/ConfirmDialog';
import { PERMISSION_MODULES, DEFAULT_ADMIN_PERMISSIONS, effectiveLoanPermissions, effectiveRepaymentPermissions } from '../../lib/permissions';

export default function Admins() {
  const { profile } = useAuth();
  const currentRole = profile?.role || 'member';

  // Live state from localDb (reloads on every action)
  const [admins, setAdmins] = useState<any[]>(() =>
    localDb.getUsers().filter((u: any) => u.role === 'admin')
  );
  const [showModal, setShowModal] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<{ open: boolean; type: 'delete' | 'toggle'; admin: any } | null>(null);
  const [editingAdmin, setEditingAdmin] = useState<any | null>(null);
  const [avatar, setAvatar] = useState('');

  useEffect(() => {
    const handleDataUpdate = () => {
      setAdmins(localDb.getUsers().filter((u: any) => u.role === 'admin'));
    };
    window.addEventListener('appDataUpdated', handleDataUpdate);
    return () => window.removeEventListener('appDataUpdated', handleDataUpdate);
  }, []);

  // Form refs
  const nameRef = useRef<HTMLInputElement>(null);
  const designRef = useRef<HTMLSelectElement>(null);
  const branchRef = useRef<HTMLSelectElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  const [selectedPerms, setSelectedPerms] = useState<Record<string, boolean>>({});
  const [isReviewer, setIsReviewer] = useState(false);

  const togglePermission = (key: string) => {
    setSelectedPerms(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // ── Loan & Repayment Governance ──────────────────────────────────────────
  // These four toggles are persisted twice: as `perms` JSON keys (always
  // available) and as the new boolean profile columns (once the migration has
  // run). The generic module list hides this module to avoid duplicate
  // controls; the dedicated block below is the single source of truth.
  const GOVERNANCE_TOGGLES = [
    { column: 'can_review_loans', key: 'loans.review', viewKey: 'loans.view', icon: '🔎', label: 'Loan Application Review', hint: 'Verify documents and recommend an amount.' },
    { column: 'can_approve_loans', key: 'loans.approve', viewKey: 'loans.view', icon: '✅', label: 'Loan Final Approval', hint: 'Approve / reject and set the approved amount.' },
    { column: 'can_review_repayments', key: 'repayments.review', viewKey: 'repayments.view', icon: '📄', label: 'Repayment Review', hint: 'Review member repayment submissions.' },
    { column: 'can_verify_repayments', key: 'repayments.verify', viewKey: 'repayments.view', icon: '🏦', label: 'Repayment Verification', hint: 'Verify payments and update the balance.' }
  ] as const;

  const governanceOn = (column: string) => {
    const toggle = GOVERNANCE_TOGGLES.find(t => t.column === column);
    if (!toggle) return false;
    // An explicit perms entry always wins, so unchecking a governance toggle is
    // sticky even while the legacy "Authorized Reviewer" flag is on.
    if (Object.prototype.hasOwnProperty.call(selectedPerms, toggle.key)) {
      return selectedPerms[toggle.key] === true;
    }
    return column === 'can_approve_loans' && isReviewer;
  };

  const toggleGovernance = (column: string) => {
    const toggle = GOVERNANCE_TOGGLES.find(t => t.column === column);
    if (!toggle) return;
    setSelectedPerms(prev => {
      const next = !prev[toggle.key];
      return {
        ...prev,
        [toggle.key]: next,
        ...(next ? { [toggle.viewKey]: true } : {})
      };
    });
  };

  const governancePayload = () => {
    const loan = effectiveLoanPermissions({ role: 'admin', perms: selectedPerms, is_approver: isReviewer });
    const repay = effectiveRepaymentPermissions({ role: 'admin', perms: selectedPerms, is_approver: isReviewer });
    return {
      can_review_loans: loan.canReview,
      can_approve_loans: loan.canApprove,
      can_review_repayments: repay.canReview,
      can_verify_repayments: repay.canVerify
    };
  };

  const prefix = currentRole === 'super' ? '/super-admin/dashboard' : currentRole === 'admin' ? '/admin/dashboard' : '/member/dashboard';
  if (currentRole !== 'super') {
    return <Navigate to={prefix} replace />;
  }

  const activeCount = admins.filter(a => a.active).length;
  const inactiveCount = admins.filter(a => !a.active).length;

  const handleSave = () => {
    setSaveError('');
    const email = emailRef.current?.value?.trim() || '';
    const name = nameRef.current?.value?.trim() || '';
    const pass = passRef.current?.value?.trim() || '';

    if (!name || !email || (!editingAdmin && !pass)) {
      setSaveError('Name, email, and password are required.');
      return;
    }

    const adminData = {
      role: 'admin',
      name,
      email,
      avatar,
      phone: phoneRef.current?.value || '',
      branch: branchRef.current?.value || 'Poyanad Central',
      desig: designRef.current?.value || 'President',
      pass: pass || undefined,
      active: editingAdmin ? editingAdmin.active : true,
      is_approver: isReviewer,
      ...governancePayload(),
      perms: {
        ...selectedPerms,
        isReviewer
      }
    };

    let savedAdminId = '';
    if (editingAdmin) {
      localDb.updateUser(editingAdmin.id, adminData);
      savedAdminId = editingAdmin.id;
    } else {
      // Check for duplicate email only on create
      if (localDb.getUsers().find((u: any) => u.email === email)) {
        setSaveError('An account with this email already exists.');
        return;
      }
      savedAdminId = localDb.saveUser(adminData);
    }

    setAdmins(localDb.getUsers().filter((u: any) => u.role === 'admin'));
    // Notify other pages (admin Settings) that data has changed
    window.dispatchEvent(new Event('appDataUpdated'));
    setShowModal(false);
    setEditingAdmin(null);
    setAvatar('');
  };

  const openEdit = (admin: any) => {
    // Always read the freshest data from localDb to pick up any self-edits from the admin
    const fresh = localDb.getUsers().find((u: any) => u.id === admin.id) || admin;
    setEditingAdmin(fresh);
    setAvatar(fresh.avatar || '');
    // Seed governance keys from the effective permissions so legacy approvers
    // (is_approver = true, no explicit key yet) show their true authority. Only
    // materialise a key when the profile already carries an explicit signal
    // (perms JSON entry or the new boolean column); otherwise the legacy
    // fallback stays intact so marking "Authorized Reviewer" still works.
    const loan = effectiveLoanPermissions(fresh);
    const repay = effectiveRepaymentPermissions(fresh);
    const existingPerms = fresh.perms || {};
    const seeded: Record<string, boolean> = { ...DEFAULT_ADMIN_PERMISSIONS, ...existingPerms };
    const seedIfSignalled = (key: string, column: string, value: boolean) => {
      const hasPerm = Object.prototype.hasOwnProperty.call(existingPerms, key);
      const hasColumn = typeof fresh[column] === 'boolean';
      if (hasPerm || hasColumn) seeded[key] = value;
    };
    seedIfSignalled('loans.review', 'can_review_loans', loan.canReview);
    seedIfSignalled('loans.approve', 'can_approve_loans', loan.canApprove);
    seedIfSignalled('repayments.review', 'can_review_repayments', repay.canReview);
    seedIfSignalled('repayments.verify', 'can_verify_repayments', repay.canVerify);
    seeded['loans.view'] = loan.canView;
    seeded['repayments.view'] = repay.canView;
    setSelectedPerms(seeded);
    setIsReviewer(!!fresh.is_approver);
    setShowModal(true);
  };


  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAvatar(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleDelete = (admin: any) => {
    setConfirm({ open: true, type: 'delete', admin });
  };

  const handleToggleActive = (admin: any) => {
    setConfirm({ open: true, type: 'toggle', admin });
  };

  const handleConfirm = () => {
    if (!confirm) return;
    if (confirm.type === 'delete') {
      localDb.deleteUser(confirm.admin.id);
      setAdmins(localDb.getUsers().filter((u: any) => u.role === 'admin'));
    } else {
      localDb.updateUser(confirm.admin.id, { active: !confirm.admin.active });
      setAdmins(localDb.getUsers().filter((u: any) => u.role === 'admin'));
    }
    setConfirm(null);
  };

  const filteredAdmins = admins.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase()) ||
    a.branch?.toLowerCase().includes(search.toLowerCase()) ||
    (a.desig || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="pg-hd">
        <div>
          <div className="pg-title">🛡️ Manage Admins</div>
          <div className="pg-sub">Create and manage admin accounts. Created admins can log in at the Admin Portal.</div>
        </div>
        <div className="pg-acts">
          <button className="bsm s" onClick={() => { 
            setSaveError(''); 
            setEditingAdmin(null);
            setAvatar('');
            setSelectedPerms(DEFAULT_ADMIN_PERMISSIONS);
            setIsReviewer(false);
            setShowModal(true); 
          }}>+ Create Admin</button>
        </div>
      </div>

      <div className="stats-row fu" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="sc">
          <div className="sc-top"><div className="sc-ic p">🛡️</div><span className="sc-trend up">Total</span></div>
          <div className="sc-num">{admins.length}</div>
          <div className="sc-lbl">Total Admins</div>
        </div>
        <div className="sc">
          <div className="sc-top"><div className="sc-ic g">✅</div><span className="sc-trend up">Active</span></div>
          <div className="sc-num">{activeCount}</div>
          <div className="sc-lbl">Active Admins</div>
        </div>
        <div className="sc">
          <div className="sc-top"><div className="sc-ic r">⛔</div><span className="sc-trend dn">Inactive</span></div>
          <div className="sc-num">{inactiveCount}</div>
          <div className="sc-lbl">Inactive Admins</div>
        </div>
      </div>

      <div className="card fu">
        <div className="card-hd">
          <div className="card-title">All Admin Accounts ({admins.length})</div>
          <div className="fiw" style={{ maxWidth: '260px' }}>
            <span className="fic">🔍</span>
            <input
              className="fi"
              placeholder="Search by name, email, branch…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '7px 10px 7px 36px', fontSize: '13px' }}
            />
          </div>
        </div>
        {admins.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🛡️</div>
            <div>No admin accounts yet. Create one above.</div>
          </div>
        ) : filteredAdmins.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
            No results for "<b>{search}</b>"
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Branch</th>
                  <th>Login Email</th>
                  <th>Phone</th>
                  <th>Permissions</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdmins.map((a: any, idx: number) => (
                  <tr key={idx}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="sb-av" style={{ width: '32px', height: '32px', fontSize: '12px', background: a.avatar ? 'transparent' : 'var(--teal-pale)' }}>
                          {a.avatar ? <img src={a.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : a.name.charAt(0)}
                        </div>
                        <b>{a.name}</b>
                      </div>
                    </td>
                    <td>
                      <span className={`bdg ${a.desig === 'President' ? 'bdg-t' : a.desig === 'Secretary' ? 'bdg-g' : a.desig === 'Treasurer' ? 'bdg-a' : 'bdg-p'}`}>
                        {a.desig || 'Admin'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px' }}>{a.branch || '—'}</td>
                    <td style={{ fontSize: '12px' }}>{a.email}</td>
                    <td style={{ fontSize: '12px' }}>{a.phone || '—'}</td>
                    <td style={{ fontSize: '11.5px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {effectiveLoanPermissions(a).canReview && <span className="bdg bdg-t" style={{ fontSize: 10 }}>🔎 Review</span>}
                        {effectiveLoanPermissions(a).canApprove && <span className="bdg bdg-g" style={{ fontSize: 10 }}>✅ Approve</span>}
                        {effectiveRepaymentPermissions(a).canReview && <span className="bdg bdg-p" style={{ fontSize: 10 }}>📄 Repay Review</span>}
                        {effectiveRepaymentPermissions(a).canVerify && <span className="bdg bdg-a" style={{ fontSize: 10 }}>🏦 Verify</span>}
                        {a.perms?.['inventory.view'] && <span className="bdg bdg-gr" style={{ fontSize: 10 }}>📦 Inventory</span>}
                        {a.perms?.['members.view'] && <span className="bdg bdg-gr" style={{ fontSize: 10 }}>👥 Members</span>}
                        {!effectiveLoanPermissions(a).canAct && !effectiveRepaymentPermissions(a).canView && !a.perms?.['inventory.view'] && !a.perms?.['members.view'] && <span style={{ color: 'var(--muted)' }}>None</span>}
                      </div>
                      {a.is_approver && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'linear-gradient(135deg, rgba(20,184,166,.12), rgba(13,115,119,.08))',
                          color: 'var(--teal)', fontSize: 10, fontWeight: 800,
                          padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(20,184,166,.25)',
                          marginTop: 4
                        }}>
                          🛡️ Legacy Reviewer
                        </span>
                      )}
                    </td>
                    <td><span className={`bdg ${a.active ? 'bdg-g' : 'bdg-gr'}`}>{a.active ? 'Active' : 'Inactive'}</span></td>
                    <td style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className={`bsm ${a.active ? 'r' : 's'}`}
                        style={{ fontSize: '11px', padding: '5px 10px' }}
                        onClick={() => handleToggleActive(a)}
                      >
                        {a.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="bsm g"
                        style={{ fontSize: '11px', padding: '5px 10px' }}
                        onClick={() => openEdit(a)}
                      >
                        Edit
                      </button>
                      <button
                        className="bsm r"
                        style={{ fontSize: '11px', padding: '5px 10px' }}
                        onClick={() => handleDelete(a)}
                      >
                        🗑 Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="ov" onClick={e => { if ((e.target as HTMLElement).classList.contains('ov')) setShowModal(false); }}>
          <div className="modal wide">
            <div className="modal-head">
              <div className="modal-title">{editingAdmin ? 'Edit Admin Account' : 'Create Admin Account'}</div>
              <button className="modal-close" onClick={() => { setShowModal(false); setEditingAdmin(null); }}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--teal-pale)', border: '1px solid var(--teal-pale2)', borderRadius: '10px', padding: '13px 15px', marginBottom: '18px', fontSize: '13px', color: 'var(--teal2)' }}>
                🛡️ The admin will use the email and password below to log in via the Admin Portal.
              </div>

              {saveError && (
                <div style={{ background: 'var(--red-pale)', border: '1px solid rgba(239,68,68,.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: 'var(--red)', marginBottom: '16px', fontWeight: 500 }}>
                  ⚠️ {saveError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <div className="sb-av" style={{ width: '80px', height: '80px', fontSize: '24px', background: avatar ? 'transparent' : 'var(--teal-pale)', border: '2px solid var(--teal)' }}>
                    {avatar ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : '?'}
                  </div>
                  <label className="bsm s" style={{ fontSize: '10px', padding: '4px 10px', cursor: 'pointer' }}>
                    Upload Photo
                    <input type="file" hidden accept="image/*" onChange={handleAvatarChange} />
                  </label>
                  {avatar && <button className="bsm r" style={{ fontSize: '10px', padding: '4px 10px' }} onClick={() => setAvatar('')}>Remove</button>}
                </div>

                <div className="fgrid" style={{ flex: 1 }}>
                  <div className="fg2"><label className="fl2">Full Name *</label><input className="fi2" defaultValue={editingAdmin?.name} placeholder="Admin's full name" ref={nameRef} required /></div>
                  <div className="fg2">
                    <label className="fl2">Designation *</label>
                    <select className="sel2" defaultValue={editingAdmin?.desig || 'President'} ref={designRef}>
                      <option>President</option><option>Secretary</option><option>Joint Secretary</option>
                      <option>Treasurer</option><option>Co-ordinator</option><option>Vice President</option>
                    </select>
                  </div>
                  <div className="fg2">
                    <label className="fl2">Branch Assignment *</label>
                    <select className="sel2" defaultValue={editingAdmin?.branch || 'Poyanad Central'} ref={branchRef}>
                      <option>Poyanad Central</option><option>Malappuram North</option>
                      <option>Kozhikode East</option><option>Kannur West</option><option>Thrissur East</option>
                    </select>
                  </div>
                  <div className="fg2"><label className="fl2">Login Email *</label><input className="fi2" type="email" defaultValue={editingAdmin?.email} placeholder="admin@skssf.org" ref={emailRef} required /></div>
                  <div className="fg2"><label className="fl2">Phone</label><input className="fi2" type="tel" defaultValue={editingAdmin?.phone} placeholder="+91 XXXXX XXXXX" ref={phoneRef} /></div>
                  <div className="fg2">
                    <label className="fl2">{editingAdmin ? 'New Password (leave blank to keep current)' : 'Temporary Password *'}</label>
                    <input className="fi2" defaultValue={editingAdmin ? '' : 'SKSSF@1234'} ref={passRef} required={!editingAdmin} />
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark2)', margin: '14px 0 10px' }}>Access Permissions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '350px', overflowY: 'auto', paddingRight: '6px' }}>
                {PERMISSION_MODULES.filter(mod => mod.name !== 'Loan & Repayment Governance').map((mod, idx, arr) => (
                  <div key={idx} style={{ borderBottom: idx < arr.length - 1 ? '1px solid #e2e8f0' : 'none', paddingBottom: '16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                      <span>{mod.icon}</span> {mod.name}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '9px' }}>
                      {mod.items.map((p) => {
                        const checked = !!selectedPerms[p.key];
                        return (
                          <label key={p.key} className="cb-row" style={{ background: 'var(--bg)', borderRadius: '9px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input 
                              type="checkbox" 
                              checked={checked} 
                              onChange={() => togglePermission(p.key)}
                            /> 
                            <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--dark)' }}>{p.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                
                {/* Loan & Repayment Governance */}
                <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <span>⚖️</span> Loan &amp; Repayment Governance
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Review and approval are independent. Only an admin with <b>Loan Final Approval</b> can approve a loan or set the approved amount.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px' }}>
                    {GOVERNANCE_TOGGLES.map(toggle => {
                      const checked = governanceOn(toggle.column);
                      return (
                        <label key={toggle.column} className="cb-row" style={{ background: checked ? 'var(--teal-pale)' : 'var(--bg)', border: checked ? '1px solid var(--teal)' : '1px solid transparent', borderRadius: '9px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleGovernance(toggle.column)} style={{ marginTop: '2px' }} />
                          <span style={{ display: 'grid', gap: '2px' }}>
                            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--dark)' }}>{toggle.icon} {toggle.label}</span>
                            <span style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.4 }}>{toggle.hint}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Legacy / Special permissions */}
                <div style={{ paddingTop: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    🛡️ Special Role Settings
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '9px' }}>
                    <label className="cb-row" style={{ background: 'var(--bg)', borderRadius: '9px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="checkbox" 
                        checked={!!selectedPerms['loan']} 
                        onChange={() => togglePermission('loan')}
                      /> 
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--dark)' }}>💰 Loan Approval</span>
                    </label>
                    <label className="cb-row" style={{ background: 'var(--bg)', borderRadius: '9px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="checkbox" 
                        checked={!!selectedPerms['sahachari']} 
                        onChange={() => togglePermission('sahachari')}
                      /> 
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--dark)' }}>🤝 Sahachari</span>
                    </label>
                    <label className="cb-row" style={{ background: 'var(--bg)', borderRadius: '9px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="checkbox" 
                        checked={!!selectedPerms['donations']} 
                        onChange={() => togglePermission('donations')}
                      /> 
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--dark)' }}>🎁 Donations</span>
                    </label>
                    <label className="cb-row" style={{ background: 'var(--bg)', borderRadius: '9px', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="checkbox" 
                        checked={isReviewer} 
                        onChange={() => setIsReviewer(!isReviewer)}
                      /> 
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--dark)' }}>🛡️ Authorized Reviewer</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="bsm g" onClick={() => { setShowModal(false); setEditingAdmin(null); }}>Cancel</button>
              <button className="bsm s" onClick={handleSave}>{editingAdmin ? 'Update Account' : 'Create Admin Account →'}</button>
            </div>
          </div>
        </div>
      )}
      {/* ELEGANT CONFIRM DIALOG */}
      <ConfirmDialog
        open={!!confirm?.open}
        danger={confirm?.type === 'delete'}
        icon={confirm?.type === 'delete' ? '🗑️' : confirm?.admin?.active ? '⛔' : '✅'}
        title={
          confirm?.type === 'delete'
            ? 'Delete Admin Account?'
            : confirm?.admin?.active ? 'Deactivate Admin?' : 'Activate Admin?'
        }
        message={
          confirm?.type === 'delete'
            ? `You are about to permanently delete the account for "${confirm?.admin?.name}". This action cannot be undone.`
            : confirm?.admin?.active
              ? `"${confirm?.admin?.name}" will no longer be able to log in. You can reactivate anytime.`
              : `"${confirm?.admin?.name}" will regain portal access immediately.`
        }
        confirmLabel={confirm?.type === 'delete' ? 'Yes, Delete' : confirm?.admin?.active ? 'Deactivate' : 'Activate'}
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
