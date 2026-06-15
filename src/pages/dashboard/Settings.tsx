import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { localDb, syncFromBackend } from '../../lib/localDb';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useLocation } from 'react-router-dom';

// ---------- Section wrapper ----------
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="card fu" style={{ marginBottom: 0 }}>
      <div className="card-hd" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '20px' }}>{icon}</div>
          <div className="card-title" style={{ marginBottom: 0 }}>{title}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

// ---------- Toggle row ----------
function ToggleRow({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--dark)' }}>{label}</div>
        {sub && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{sub}</div>}
      </div>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer', flexShrink: 0,
          background: checked ? 'var(--teal)' : 'var(--border)',
          position: 'relative', transition: 'background .2s',
        }}
      >
        <div style={{
          position: 'absolute', width: '18px', height: '18px', borderRadius: '50%',
          background: '#fff', top: '3px', left: checked ? '23px' : '3px',
          transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.2)',
        }} />
      </div>
    </div>
  );
}

// ---------- Info row ----------
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
      <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ color: 'var(--dark)', fontWeight: 600 }}>{value || '—'}</span>
    </div>
  );
}

export default function Settings() {
  const { profile, signOut, refreshProfile } = useAuth();
  const role = profile?.role || 'member';
  const location = useLocation();

  // Profile edit
  const nameRef  = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const occRef   = useRef<HTMLInputElement>(null);
  const addrRef  = useRef<HTMLTextAreaElement>(null);

  // Portal config
  const [pConfig, setPConfig] = useState(() => localDb.getPortalConfig());
  const [orgLogo, setOrgLogo] = useState(pConfig.orgLogo || '');
  const [orgScale, setOrgScale] = useState(pConfig.orgScale || 1.0);

  // Reviewer management state
  const [reviewerConfig, setReviewerConfig] = useState(() => localDb.getPortalConfig());
  const [reviewerSearch, setReviewerSearch] = useState('');
  const allAdmins = localDb.getUsers().filter((u: any) => u.role === 'admin');
  const refreshReviewerConfig = () => setReviewerConfig(localDb.getPortalConfig());

  // Scroll to reviewer section if hash matches
  useEffect(() => {
    if (location.hash === '#reviewer-management') {
      setTimeout(() => {
        const el = document.getElementById('reviewer-management');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }
  }, [location.hash]);

  const [avatar, setAvatar] = useState(profile?.avatar || '');

  // Sync state if profile updates (e.g. after refreshProfile)
  useEffect(() => {
    if (profile?.avatar !== undefined) {
      setAvatar(profile.avatar || '');
    }
  }, [profile?.avatar]);

  // Password change
  const curPassRef  = useRef<HTMLInputElement>(null);
  const newPassRef  = useRef<HTMLInputElement>(null);
  const confPassRef = useRef<HTMLInputElement>(null);

  // Portal settings (super admin)
  const orgNameRef   = useRef<HTMLInputElement>(null);
  const maxLoanRef   = useRef<HTMLInputElement>(null);
  const sahAmtRef    = useRef<HTMLInputElement>(null);

  // Toast
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Notifications toggles
  const [notifLoan,  setNotifLoan]  = useState(true);
  const [notifSah,   setNotifSah]   = useState(true);
  const [notifEmail, setNotifEmail] = useState(false);

  // Super-admin toggles
  const [allowReg,    setAllowReg]    = useState(true);
  const [twoFA,       setTwoFA]       = useState(false);
  const [maintenace,  setMaintenance] = useState(false);

  const [confirmLogout, setConfirmLogout] = useState(false);

  const saveProfile = () => {
    if (!profile) return;
    const updates = {
      name: nameRef.current?.value || profile.name,
      email: emailRef.current?.value || profile.email,
      phone: phoneRef.current?.value || (profile as any).phone,
      occupation: occRef.current?.value || (profile as any).occupation,
      addr: addrRef.current?.value || (profile as any).addr,
      avatar: avatar
    };
    
    localDb.updateUser(profile.id, updates);
    refreshProfile();
    showToast('✅ Profile updated successfully!');
  };

  const handleOrgLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setOrgLogo(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const savePortalConfig = () => {
    const updates = {
      orgName: orgNameRef.current?.value || pConfig.orgName,
      maxLoan: Number(maxLoanRef.current?.value) || pConfig.maxLoan,
      sahAmt: Number(sahAmtRef.current?.value) || pConfig.sahAmt,
      orgLogo: orgLogo,
      orgScale: orgScale
    };
    const newConfig = localDb.updatePortalConfig(updates);
    setPConfig(newConfig);
    showToast('✅ Portal configuration saved!');
    // Trigger a custom event to notify DashboardLayout
    window.dispatchEvent(new Event('portalConfigUpdated'));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setAvatar(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAvatar = () => setAvatar('');

  const changePassword = () => {
    if (!profile) return;
    const cur  = curPassRef.current?.value || '';
    const next = newPassRef.current?.value || '';
    const conf = confPassRef.current?.value || '';
    const all  = localDb.getUsers();
    const me   = all.find((u: any) => u.email === profile.email);
    if (!me) { showToast('❌ User not found.'); return; }
    if (me.pass && me.pass !== cur)  { showToast('❌ Current password is incorrect.'); return; }
    if (next.length < 6)         { showToast('❌ New password must be at least 6 characters.'); return; }
    if (next !== conf)           { showToast('❌ Passwords do not match.'); return; }
    localDb.updateUser(me.id, { pass: next });
    if (curPassRef.current)  curPassRef.current.value  = '';
    if (newPassRef.current)  newPassRef.current.value  = '';
    if (confPassRef.current) confPassRef.current.value = '';
    refreshProfile();
    showToast('✅ Password changed successfully!');
  };

  return (
    <>
      <div className="pg-hd">
        <div>
          <div className="pg-title">⚙️ Settings</div>
          <div className="pg-sub">
            {role === 'super' ? 'System configuration, account management and portal-wide settings.'
            : role === 'admin' ? 'Manage your account details, security, and notification preferences.'
            : 'Manage your personal profile, security, and notification preferences.'}
          </div>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
          background: toast.startsWith('✅') ? 'var(--green)' : 'var(--red)',
          color: '#fff', borderRadius: '12px', padding: '12px 22px',
          fontSize: '13.5px', fontWeight: 600, boxShadow: '0 8px 30px rgba(0,0,0,.15)',
          animation: 'scaleIn .2s ease',
        }}>{toast}</div>
      )}

      <div className="settings-grid fu" style={{ display: 'grid', gap: '18px', gridTemplateColumns: role === 'super' ? '1fr 1fr' : '1fr 1fr' }}>

        {/* ═══════════════════════════
            PROFILE — all roles
        ═══════════════════════════ */}
        <Section title="Profile Information" icon="👤">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px', position: 'relative' }}>
            <div className="sb-av" style={{ width: '100px', height: '100px', fontSize: '32px', position: 'relative', overflow: 'hidden', background: avatar ? 'transparent' : 'var(--teal-pale)', border: '2px solid var(--teal)' }}>
              {avatar ? (
                <img src={avatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                profile?.name?.charAt(0) || 'U'
              )}
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <label className="bsm s" style={{ cursor: 'pointer', padding: '6px 14px', fontSize: '11px' }}>
                📸 Change Photo
                <input type="file" hidden accept="image/*" onChange={handleAvatarChange} />
              </label>
              {avatar && <button className="bsm r" style={{ padding: '6px 14px', fontSize: '11px' }} onClick={removeAvatar}>🗑 Remove</button>}
            </div>
          </div>

          <div className="fgrid">
            <div className="fg2 full">
              <label className="fl2">Full Name</label>
              <input className="fi2" defaultValue={profile?.name || ''} ref={nameRef} />
            </div>
            <div className="fg2 full">
              <label className="fl2">Login Email</label>
              <input className="fi2" defaultValue={profile?.email || ''} ref={emailRef} />
            </div>
            <div className="fg2">
              <label className="fl2">Phone Number</label>
              <input className="fi2" defaultValue={(profile as any)?.phone || ''} ref={phoneRef} />
            </div>
            <div className="fg2">
              <label className="fl2">Occupation</label>
              <input className="fi2" defaultValue={(profile as any)?.occupation || ''} ref={occRef} placeholder="e.g. Teacher, Business" />
            </div>
            {role === 'member' && (
              <div className="fg2 full">
                <label className="fl2">Address</label>
                <textarea className="ta2" rows={2} defaultValue={(profile as any)?.addr || ''} ref={addrRef} />
              </div>
            )}
          </div>
          <div style={{ marginTop: '18px' }}>
            <button className="bsm s" style={{ width: '100%' }} onClick={saveProfile}>💾 Save Profile</button>
          </div>
        </Section>

        {/* ═══════════════════════════
            SECURITY — all roles
        ═══════════════════════════ */}
        <Section title="Security & Password" icon="🔐">
          <div className="fgrid">
            <div className="fg2 full">
              <label className="fl2">Current Password</label>
              <input className="fi2" type="password" placeholder="••••••••" ref={curPassRef} />
            </div>
            <div className="fg2 full">
              <label className="fl2">New Password</label>
              <input className="fi2" type="password" placeholder="Min 6 characters" ref={newPassRef} />
            </div>
            <div className="fg2 full">
              <label className="fl2">Confirm New Password</label>
              <input className="fi2" type="password" placeholder="••••••••" ref={confPassRef} />
            </div>
          </div>
          <div style={{ marginTop: '18px' }}>
            <button className="bsm o" style={{ width: '100%' }} onClick={changePassword}>🔑 Update Password</button>
          </div>
        </Section>

        {/* ═══════════════════════════
            NOTIFICATIONS — all roles
        ═══════════════════════════ */}
        <Section title="Notifications" icon="🔔">
          <ToggleRow
            label="Loan Status Updates"
            sub="Get notified when your loan status changes"
            checked={notifLoan}
            onChange={setNotifLoan}
          />
          <ToggleRow
            label="Sahachari Reminders"
            sub="Monthly payment due reminders"
            checked={notifSah}
            onChange={setNotifSah}
          />
          <ToggleRow
            label="Email Notifications"
            sub="Receive important updates via email"
            checked={notifEmail}
            onChange={setNotifEmail}
          />
        </Section>

        {/* ═══════════════════════════
            MEMBER — account info
        ═══════════════════════════ */}
        {role === 'member' && (
          <Section title="My Account Details" icon="🪪">
            <InfoRow label="Member ID"    value={(profile as any)?.memberNo || '—'} />
            <InfoRow label="Unit"          value={(profile as any)?.branch   || '—'} />
            <InfoRow label="Member Type"   value={(profile as any)?.type     || '—'} />
            <InfoRow label="Date Joined"   value={(profile as any)?.joinDate || '—'} />
            <InfoRow label="Gender"        value={(profile as any)?.gender   || '—'} />
            <InfoRow label="Occupation"    value={(profile as any)?.occupation || '—'} />
            <div style={{ marginTop: '20px' }}>
              <button className="bsm r" style={{ width: '100%' }} onClick={() => setConfirmLogout(true)}>🚪 Sign Out</button>
            </div>
          </Section>
        )}

        {/* ═══════════════════════════
            ADMIN — branch & perms view
        ═══════════════════════════ */}
        {role === 'admin' && (
          <Section title="My Admin Details" icon="🛡️">
            <InfoRow label="Email"         value={profile?.email  || '—'} />
            <InfoRow label="Unit"          value={(profile as any)?.branch || '—'} />
            <InfoRow label="Designation"   value={(profile as any)?.desig  || '—'} />
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--dark2)', marginBottom: '10px' }}>Current Permissions</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { lbl: '💰 Loan Approval',    key: 'loan' },
                  { lbl: '👥 Member Management', key: 'member' },
                  { lbl: '📊 View Reports',      key: 'reports' },
                  { lbl: '⚙️ Edit Settings',     key: 'settings' },
                  { lbl: '🤝 Sahachari',         key: 'sahachari' },
                  { lbl: '🎁 Donations',         key: 'donations' },
                ].map(p => {
                  const has = (profile as any)?.perms?.[p.key];
                  return (
                    <div key={p.key} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '9px 12px', borderRadius: '8px',
                      background: has ? 'var(--green-pale)' : 'var(--red-pale)',
                      fontSize: '12.5px', fontWeight: 600,
                      color: has ? 'var(--green)' : 'var(--red)',
                    }}>
                      <span>{has ? '✓' : '✗'}</span> {p.lbl}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop: '20px' }}>
              <button className="bsm r" style={{ width: '100%' }} onClick={() => setConfirmLogout(true)}>🚪 Sign Out</button>
            </div>
          </Section>
        )}

        {/* ═══════════════════════════
            SUPER ADMIN — Portal Config
        ═══════════════════════════ */}
        {role === 'super' && (
          <>
            <Section title="Portal Configuration" icon="🏛️">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
                <div className="sb-logo-ic" style={{ width: '80px', height: '80px', borderRadius: '15px', fontSize: '32px', background: orgLogo ? 'transparent' : 'var(--teal)', overflow: 'hidden', padding: '5px' }}>
                  {orgLogo ? (
                    <img
                      src={orgLogo}
                      alt="Logo"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${orgScale})` }}
                    />
                  ) : '☽'}
                </div>
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                  <label className="bsm o" style={{ cursor: 'pointer', padding: '5px 12px', fontSize: '11px' }}>
                    Upload Logo
                    <input type="file" hidden accept="image/*" onChange={handleOrgLogoChange} />
                  </label>
                  {orgLogo && <button className="bsm r" style={{ padding: '5px 12px', fontSize: '11px' }} onClick={() => setOrgLogo('')}>Remove</button>}
                </div>

                {orgLogo && (
                  <div style={{ marginTop: '14px', width: '100%', maxWidth: '200px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', fontWeight: 600, marginBottom: '5px' }}>
                      <span>Logo Scale</span>
                      <span>{orgScale.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.05"
                      value={orgScale}
                      onChange={(e) => setOrgScale(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--teal)' }}
                    />
                  </div>
                )}
              </div>
              <div className="fgrid">
                <div className="fg2 full">
                  <label className="fl2">Organisation Name</label>
                  <input className="fi2" defaultValue={pConfig.orgName} ref={orgNameRef} />
                </div>
                <div className="fg2">
                  <label className="fl2">Max Loan Amount (₹)</label>
                  <input className="fi2" type="number" defaultValue={pConfig.maxLoan} ref={maxLoanRef} />
                </div>
                <div className="fg2">
                  <label className="fl2">Monthly Sahachari (₹)</label>
                  <input className="fi2" type="number" defaultValue={pConfig.sahAmt} ref={sahAmtRef} />
                </div>
              </div>
              <div style={{ marginTop: '18px' }}>
                <button className="bsm s" style={{ width: '100%' }} onClick={savePortalConfig}>💾 Save Configuration</button>
              </div>
            </Section>

            <Section title="Access Control" icon="🔒">
              <ToggleRow
                label="Allow Member Self-Registration"
                sub="Members can create accounts via the Member Portal"
                checked={allowReg}
                onChange={setAllowReg}
              />
              <ToggleRow
                label="Two-Factor Authentication"
                sub="Require OTP for admin logins"
                checked={twoFA}
                onChange={setTwoFA}
              />
              <ToggleRow
                label="Maintenance Mode"
                sub="Disable portal access for all non-super users"
                checked={maintenace}
                onChange={setMaintenance}
              />
              {maintenace && (
                <div style={{ marginTop: '12px', background: 'var(--amber-pale)', border: '1px solid rgba(240,165,0,.3)', borderRadius: '10px', padding: '12px 14px', fontSize: '12.5px', color: 'var(--amber2)', fontWeight: 500 }}>
                  ⚠️ Maintenance mode is ON — only Super Admin can access the portal.
                </div>
              )}
            </Section>

            {/* ══════════════════════════════════════════
                REVIEWER & APPROVAL MANAGEMENT — super only
            ══════════════════════════════════════════ */}
            <div id="reviewer-management" style={{ gridColumn: '1 / -1', scrollMarginTop: '80px' }}>
              <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
                borderRadius: 24, padding: '32px 36px',
                border: '1.5px solid rgba(20,184,166,0.3)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 16,
                    background: 'linear-gradient(135deg, var(--teal), #0891b2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                    boxShadow: '0 8px 20px rgba(20,184,166,0.3)'
                  }}>🛡️</div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 950, color: '#fff', letterSpacing: 0.3 }}>Reviewer &amp; Approval Management</div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 3 }}>Authorize admins to audit loan applications and verify repayment requests</div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <div style={{ background: 'rgba(20,184,166,0.15)', color: '#14b8a6', padding: '6px 16px', borderRadius: 20, fontSize: 11, fontWeight: 900 }}>
                      {(reviewerConfig.authorizedReviewers || []).length} Active Reviewer{(reviewerConfig.authorizedReviewers || []).length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                  {/* LEFT: Reviewer Pool Management */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 16 }}>Authorize Reviewer (Predictive Search)</div>

                    {/* Search input */}
                    <div style={{ position: 'relative', marginBottom: 16 }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🔍</span>
                      <input
                        className="fi2"
                        list="settings-admin-list"
                        placeholder="Type admin name or designation..."
                        value={reviewerSearch}
                        onChange={e => setReviewerSearch(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const val = reviewerSearch.trim();
                            const found = allAdmins.find((a: any) =>
                              a.name === val ||
                              `${a.name} (${a.desig})` === val ||
                              a.name.toLowerCase().includes(val.toLowerCase())
                            );
                            if (found) {
                              if (!(reviewerConfig.authorizedReviewers || []).includes(found.id)) {
                                localDb.toggleReviewerPool(found.id);
                                refreshReviewerConfig();
                                showToast(`✅ ${found.name} authorized as reviewer!`);
                              } else {
                                showToast(`ℹ️ ${found.name} is already an authorized reviewer.`);
                              }
                              setReviewerSearch('');
                            }
                          }
                        }}
                        style={{ paddingLeft: 40, background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 12 }}
                      />
                      <datalist id="settings-admin-list">
                        {allAdmins
                          .filter((a: any) => !(reviewerConfig.authorizedReviewers || []).includes(a.id))
                          .map((a: any) => (
                            <option key={a.id} value={`${a.name} (${a.desig})`} />
                          ))}
                      </datalist>
                    </div>

                    {/* Suggestion chips for non-authorized admins */}
                    {allAdmins.filter((a: any) => !(reviewerConfig.authorizedReviewers || []).includes(a.id)).length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>Available Admins (click to authorize)</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {allAdmins
                            .filter((a: any) => !(reviewerConfig.authorizedReviewers || []).includes(a.id))
                            .map((a: any) => (
                              <button
                                key={a.id}
                                onClick={() => {
                                  localDb.toggleReviewerPool(a.id);
                                  refreshReviewerConfig();
                                  showToast(`✅ ${a.name} authorized as reviewer!`);
                                }}
                                style={{
                                  padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                                  color: '#94a3b8', cursor: 'pointer', transition: 'all .2s'
                                }}
                                onMouseOver={e => { (e.target as HTMLElement).style.background = 'rgba(20,184,166,0.15)'; (e.target as HTMLElement).style.color = '#14b8a6'; }}
                                onMouseOut={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.target as HTMLElement).style.color = '#94a3b8'; }}
                              >
                                + {a.name}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Active Reviewer Pool */}
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase' }}>Active Reviewer Pool</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {allAdmins
                        .filter((a: any) => (reviewerConfig.authorizedReviewers || []).includes(a.id))
                        .map((a: any) => {
                          const inDefault = (reviewerConfig.defaultCommittee || []).includes(a.id);
                          return (
                            <div key={a.id} style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              background: 'rgba(20,184,166,0.08)', border: '1.5px solid rgba(20,184,166,0.2)',
                              borderRadius: 14, padding: '10px 16px'
                            }}>
                              <div className="sb-av" style={{ width: 34, height: 34, fontSize: 13, background: 'rgba(20,184,166,0.2)', flexShrink: 0, overflow: 'hidden' }}>
                                {a.avatar ? <img src={a.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : a.name[0]}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>{a.name}</div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>{a.desig} · {a.branch}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{
                                  padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 800,
                                  background: 'rgba(20,184,166,0.15)', color: '#14b8a6', border: '1px solid rgba(20,184,166,0.3)'
                                }}>🛡️ Reviewer</span>
                                <button
                                  onClick={() => {
                                    localDb.toggleReviewerPool(a.id);
                                    refreshReviewerConfig();
                                    showToast(`ℹ️ ${a.name} removed from reviewer pool.`);
                                  }}
                                  style={{
                                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                                    color: '#f87171', borderRadius: 20, fontSize: 10, fontWeight: 800,
                                    padding: '3px 10px', cursor: 'pointer'
                                  }}
                                >Revoke</button>
                              </div>
                            </div>
                          );
                        })}
                      {(reviewerConfig.authorizedReviewers || []).length === 0 && (
                        <div style={{ textAlign: 'center', padding: '24px', color: '#475569', fontSize: 12, fontStyle: 'italic', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.1)' }}>
                          No reviewers authorized yet. Use the search above to add reviewers.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT: Default Committee + Consensus Policy */}
                  <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 32, display: 'flex', flexDirection: 'column', gap: 28 }}>

                    {/* Default Committee */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Default Committee (Auto-Assigned)</div>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 14 }}>These reviewers are automatically assigned to every new loan and repayment request.</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {allAdmins
                          .filter((a: any) => (reviewerConfig.authorizedReviewers || []).includes(a.id))
                          .map((a: any) => {
                            const inDefault = (reviewerConfig.defaultCommittee || []).includes(a.id);
                            return (
                              <button
                                key={a.id}
                                onClick={() => {
                                  const cur = reviewerConfig.defaultCommittee || [];
                                  const next = cur.includes(a.id)
                                    ? cur.filter((id: string) => id !== a.id)
                                    : [...cur, a.id];
                                  localDb.updatePortalConfig({ defaultCommittee: next });
                                  refreshReviewerConfig();
                                }}
                                style={{
                                  padding: '8px 18px', borderRadius: 14, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                                  border: inDefault ? '1.5px solid rgba(20,184,166,0.6)' : '1px solid rgba(255,255,255,0.12)',
                                  background: inDefault ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.04)',
                                  color: inDefault ? '#14b8a6' : '#64748b', transition: 'all .2s'
                                }}
                              >
                                {inDefault ? '✓ ' : ''}{a.name}
                              </button>
                            );
                          })}
                        {(reviewerConfig.authorizedReviewers || []).length === 0 && (
                          <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>Authorize reviewers first to configure the default committee.</div>
                        )}
                      </div>
                    </div>

                    {/* Consensus Policy — Loans */}
                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '20px' }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>📋 Loan Approval Consensus</div>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 16 }}>Number of reviewer signatures required to approve a loan application.</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {[1,2,3,4,5].map(n => {
                          const active = (reviewerConfig.loanApprovalsNeeded || 2) === n;
                          return (
                            <button
                              key={n}
                              onClick={() => { localDb.updatePortalConfig({ loanApprovalsNeeded: n }); refreshReviewerConfig(); showToast(`✅ Loan approval threshold set to ${n}`); }}
                              style={{
                                width: 48, height: 48, borderRadius: 12, fontSize: 16, fontWeight: 900, cursor: 'pointer',
                                border: active ? '2px solid var(--teal)' : '1px solid rgba(255,255,255,0.12)',
                                background: active ? 'var(--teal)' : 'rgba(255,255,255,0.04)',
                                color: active ? '#fff' : '#64748b', transition: 'all .2s'
                              }}
                            >{n}</button>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: 10, fontSize: 11, color: '#475569' }}>
                        {(reviewerConfig.loanApprovalsNeeded || 2) === 1 ? '⚡ Fast approval — single reviewer' : (reviewerConfig.loanApprovalsNeeded || 2) <= 2 ? '🔐 Dual-signature secure' : '🔒 High-security multi-signature'}
                      </div>
                    </div>

                    {/* Consensus Policy — Repayments */}
                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '20px' }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>💳 Repayment Verification Consensus</div>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 16 }}>Number of reviewer signatures required to approve a repayment submission.</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {[1,2,3,4,5].map(n => {
                          const active = (reviewerConfig.repaymentApprovalsNeeded || 1) === n;
                          return (
                            <button
                              key={n}
                              onClick={() => { localDb.updatePortalConfig({ repaymentApprovalsNeeded: n }); refreshReviewerConfig(); showToast(`✅ Repayment approval threshold set to ${n}`); }}
                              style={{
                                width: 48, height: 48, borderRadius: 12, fontSize: 16, fontWeight: 900, cursor: 'pointer',
                                border: active ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.12)',
                                background: active ? '#6366f1' : 'rgba(255,255,255,0.04)',
                                color: active ? '#fff' : '#64748b', transition: 'all .2s'
                              }}
                            >{n}</button>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: 10, fontSize: 11, color: '#475569' }}>
                        {(reviewerConfig.repaymentApprovalsNeeded || 1) === 1 ? '⚡ Fast approval — single reviewer' : (reviewerConfig.repaymentApprovalsNeeded || 1) <= 2 ? '🔐 Dual-signature secure' : '🔒 High-security multi-signature'}
                      </div>
                    </div>

                    {/* Info box */}
                    <div style={{ background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: 14, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#14b8a6', marginBottom: 6 }}>ℹ️ How Reviewer Authorization Works</div>
                      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
                        Authorized reviewers can <b style={{ color: '#94a3b8' }}>sign loan applications</b> in the Loan Management page and <b style={{ color: '#94a3b8' }}>verify repayment proofs</b> in the Repayment Portal. The Super Admin can always override regardless of committee assignment.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Section title="System Overview" icon="📊">
              <InfoRow label="Total Members" value={`${localDb.getUsers().filter((u: any) => u.role === 'member').length} registered`} />
              <InfoRow label="Total Admins"  value={`${localDb.getUsers().filter((u: any) => u.role === 'admin').length} accounts`} />
              <InfoRow label="Total Loans"   value={`${localDb.getLoans().length} applications`} />
              <InfoRow label="Pending Loans" value={`${localDb.getLoans().filter((l: any) => l.status === 'pending').length} awaiting action`} />
              <InfoRow label="Data Source"  value="Laravel API / database" />
            </Section>

            <Section title="Danger Zone" icon="⚠️">
              <div style={{ background: 'var(--red-pale)', border: '1px solid rgba(239,68,68,.2)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--red)', marginBottom: '6px' }}>Reset Portal Data</div>
                <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginBottom: '14px' }}>
                  Clears all loan records, member registrations, and admin accounts (except Super Admin). This cannot be undone.
                </div>
                <button
                  className="bsm r"
                  style={{ width: '100%' }}
                  onClick={async () => {
                    if (!window.confirm('Type RESET to confirm')) return;
                    const ok = localDb.resetPortalData();
                    if (!ok) {
                      showToast('❌ Reset failed. Please sign in again.');
                      return;
                    }
                    await syncFromBackend();
                    showToast('✅ Portal data reset from backend.');
                  }}
                >
                  🗑 Reset All Data
                </button>
              </div>
              <div style={{ marginTop: '12px' }}>
                <button className="bsm r" style={{ width: '100%' }} onClick={() => setConfirmLogout(true)}>🚪 Sign Out</button>
              </div>
            </Section>
          </>
        )}
      </div>

      {/* Sign out confirm */}
      <ConfirmDialog
        open={confirmLogout}
        icon="🚪"
        danger={false}
        title="Sign Out?"
        message="You will be returned to the portal selector. You can log back in anytime."
        confirmLabel="Yes, Sign Out"
        cancelLabel="Stay"
        onConfirm={() => { signOut(); window.location.href = '/'; }}
        onCancel={() => setConfirmLogout(false)}
      />
    </>
  );
}
