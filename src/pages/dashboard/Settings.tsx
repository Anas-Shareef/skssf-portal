import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { localDb, syncFromBackend } from '../../lib/localDb';
import ConfirmDialog from '../../components/ConfirmDialog';

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
