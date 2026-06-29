import React, { useState, useRef, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { localDb } from '../../lib/localDb';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function Members() {
  const { profile } = useAuth();
  const currentRole = profile?.role || 'member';

  const prefix = currentRole === 'super' ? '/super-admin/dashboard' : currentRole === 'admin' ? '/admin/dashboard' : '/member/dashboard';
  if (currentRole === 'member') {
    return <Navigate to={prefix} replace />;
  }

  // Live from localDb
  const [members, setMembers] = useState<any[]>(() =>
    localDb.getUsers().filter((u: any) => u.role === 'member')
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewMember, setViewMember] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [saveError, setSaveError] = useState('');
  const [confirm, setConfirm] = useState<{ open: boolean; type: 'single' | 'bulk' | 'export'; member?: any } | null>(null);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [avatar, setAvatar] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  // Filter fields
  const [fName, setFName] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fBranch, setFBranch] = useState('');
  const [fType, setFType] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fSah, setFSah] = useState('');

  // Add member form refs
  const nameRef = useRef<HTMLInputElement>(null);
  const fnameRef = useRef<HTMLInputElement>(null);
  const dobRef = useRef<HTMLInputElement>(null);
  const genderRef = useRef<HTMLSelectElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const addrRef = useRef<HTMLTextAreaElement>(null);
  const occupRef = useRef<HTMLInputElement>(null);
  const salaryRef = useRef<HTMLInputElement>(null);
  const branchRef = useRef<HTMLSelectElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLInputElement>(null);
  const mustChangeRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLInputElement>(null);

  const refresh = () => setMembers(localDb.getUsers().filter((u: any) => u.role === 'member'));

  // Auto-refresh when backend sync completes (triggered by Settings save, etc.)
  useEffect(() => {
    const handleDataUpdate = () => {
      setMembers(localDb.getUsers().filter((u: any) => u.role === 'member'));
    };
    window.addEventListener('appDataUpdated', handleDataUpdate);
    return () => window.removeEventListener('appDataUpdated', handleDataUpdate);
  }, []);


  // Branch filter for admins
  const branchFilter = currentRole === 'admin' ? (profile?.branch || null) : null;
  const allMembers = branchFilter
    ? members.filter(m => m.branch === branchFilter)
    : members;

  const filteredMembers = allMembers.filter(m => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (m.name || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (m.memberNo || '').toLowerCase().includes(q) ||
      (m.branch || '').toLowerCase().includes(q);
    const matchName   = !fName   || (m.name  || '').toLowerCase().includes(fName.toLowerCase());
    const matchEmail  = !fEmail  || (m.email || '').toLowerCase().includes(fEmail.toLowerCase());
    const matchPhone  = !fPhone  || (m.phone || '').toLowerCase().includes(fPhone.toLowerCase());
    const matchBranch = !fBranch || m.branch === fBranch;
    const matchType   = !fType   || m.type   === fType;
    const matchStatus = !fStatus || (fStatus === 'active' ? m.active : !m.active);
    const matchSah    = !fSah    || (fSah === 'current' ? (m.sah_miss||[]).length === 0 : (m.sah_miss||[]).length > 0);
    return matchSearch && matchName && matchEmail && matchPhone && matchBranch && matchType && matchStatus && matchSah;
  });

  const activeFilterCount = [fName,fEmail,fPhone,fBranch,fType,fStatus,fSah].filter(Boolean).length;
  const clearFilters = () => { setFName(''); setFEmail(''); setFPhone(''); setFBranch(''); setFType(''); setFStatus(''); setFSah(''); };

  const allSelected = filteredMembers.length > 0 && filteredMembers.every(m => selectedEmails.includes(m.email));
  const toggleAll = () => setSelectedEmails(allSelected ? [] : filteredMembers.map(m => m.email));
  const toggleOne = (email: string) => setSelectedEmails(prev =>
    prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
  );

  const doExportCSV = () => {
    const rows = [['Name','Email','Phone','Branch','Member No','Join Date','Status']];
    filteredMembers.forEach(m => rows.push([m.name,m.email,m.phone||'',m.branch||'',m.memberNo||'',m.joinDate||'',m.active?'Active':'Inactive']));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='members.csv'; a.click();
  };

  const chipStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    background: 'var(--teal-pale)', border: '1px solid var(--teal-pale2)',
    color: 'var(--teal2)', borderRadius: '20px', padding: '3px 10px',
    fontSize: '12px', fontWeight: 500,
  };
  const chipX: React.CSSProperties = {
    cursor: 'pointer', fontWeight: 700, marginLeft: '2px',
    color: 'var(--teal)', fontSize: '14px', lineHeight: 1,
  };

  const handleSave = () => {
    setSaveError('');
    const email = emailRef.current?.value?.trim() || '';
    const name = nameRef.current?.value?.trim() || '';
    const pass = passRef.current?.value?.trim() || '';

    if (!name || !email || (!editingMember && !pass)) {
      setSaveError('Name, email, and password are required.');
      return;
    }

    const memberData = {
      role: 'member',
      name,
      fname: fnameRef.current?.value || '',
      dob: dobRef.current?.value || '',
      gender: genderRef.current?.value || 'Male',
      phone: phoneRef.current?.value || '',
      email,
      avatar,
      addr: addrRef.current?.value || '',
      occupation: occupRef.current?.value || '',
      salary: parseFloat(salaryRef.current?.value || '0'),
      branch: branchRef.current?.value || (branchFilter || 'Poyanad Central'),
      type: typeRef.current?.value || 'Regular',
      pass: pass || undefined,
      active: activeRef.current ? activeRef.current.checked : (editingMember ? editingMember.active : true),
      memberNo: editingMember ? editingMember.memberNo : `SKSSF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      joinDate: editingMember ? editingMember.joinDate : new Date().toISOString().split('T')[0],
      sahachari_paid: editingMember ? editingMember.sahachari_paid : [],
      sah_miss: editingMember ? editingMember.sah_miss : [],
      total_donated: editingMember ? editingMember.total_donated : 0,
      assigned_zone: zoneRef.current?.value || '',
      must_change_password: mustChangeRef.current ? mustChangeRef.current.checked : true,
      created_by: profile?.id || null,
    };

    if (editingMember) {
      localDb.updateUser(editingMember.id, memberData);
    } else {
      if (localDb.getUsers().find((u: any) => u.email === email)) {
        setSaveError('An account with this email already exists.');
        return;
      }
      localDb.saveUser(memberData);
    }

    refresh();
    // Notify other pages (member Settings) that data has changed
    window.dispatchEvent(new Event('appDataUpdated'));
    setShowAddModal(false);
    setEditingMember(null);
    setAvatar('');
  };

  const openEdit = (m: any) => {
    // Always read the freshest data from localDb to pick up any self-edits from the member
    const fresh = localDb.getUsers().find((u: any) => u.id === m.id) || m;
    setEditingMember(fresh);
    setAvatar(fresh.avatar || '');
    setShowAddModal(true);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAvatar(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Get loans for a given member id (match by any of the stored id fields)
  const getLoans = (memId: string) =>
    localDb.getLoans().filter((l: any) =>
      l.memId === memId ||
      l.applicant_id === memId ||
      l.submitted_by_member_id === memId
    );

  return (
    <>
      <div className="pg-hd">
        <div>
          <div className="pg-title">👥 Members</div>
          <div className="pg-sub">
            {currentRole === 'super' ? 'All member accounts across units' : `Unit members — ${branchFilter}`}
          </div>
        </div>
        <div className="pg-acts">
          <button className="bsm s" onClick={() => { setSaveError(''); setShowAddModal(true); }}>+ Add Member</button>
        </div>
      </div>

      <div className="card fu">
        <div className="card-hd">
          <div className="card-title">Member Directory ({filteredMembers.length}/{allMembers.length})</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div className="fiw" style={{ maxWidth: '220px' }}>
              <span className="fic">🔍</span>
              <input
                className="fi"
                placeholder="Quick search…"
                value={search}
                onChange={e => { setSearch(e.target.value); setSelectedEmails([]); }}
                style={{ padding: '7px 10px 7px 36px', fontSize: '13px' }}
              />
            </div>
            <button
              className={`bsm ${showFilters ? 's' : 'g'}`}
              style={{ fontSize: '12px', padding: '7px 14px', position: 'relative' }}
              onClick={() => setShowFilters(v => !v)}
            >
              🔎 Filters {activeFilterCount > 0 && <span style={{ background: 'var(--red)', color: '#fff', borderRadius: '10px', fontSize: '10px', padding: '1px 6px', marginLeft: '4px' }}>{activeFilterCount}</span>}
            </button>
            <button className="bsm g" onClick={() => setConfirm({ open: true, type: 'export' })}>⬇ Export CSV</button>
          </div>
        </div>

        {/* FILTER PANEL */}
        {showFilters && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '5px' }}>Name</label>
                <input className="fi2" placeholder="e.g. Faris" value={fName} onChange={e => setFName(e.target.value)} style={{ padding: '7px 10px', fontSize: '12.5px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '5px' }}>Email</label>
                <input className="fi2" placeholder="e.g. @gmail.com" value={fEmail} onChange={e => setFEmail(e.target.value)} style={{ padding: '7px 10px', fontSize: '12.5px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '5px' }}>Phone</label>
                <input className="fi2" placeholder="e.g. 98765" value={fPhone} onChange={e => setFPhone(e.target.value)} style={{ padding: '7px 10px', fontSize: '12.5px' }} />
              </div>
              {currentRole === 'super' && (
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '5px' }}>Unit</label>
                  <select className="sel2" value={fBranch} onChange={e => setFBranch(e.target.value)} style={{ padding: '7px 10px', fontSize: '12.5px' }}>
                    <option value="">All Units</option>
                    <option>Poyanad Central</option>
                    <option>Malappuram North</option>
                    <option>Thrissur East</option>
                    <option>Kannur West</option>
                  </select>
                </div>
              )}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '5px' }}>Membership Type</label>
                <select className="sel2" value={fType} onChange={e => setFType(e.target.value)} style={{ padding: '7px 10px', fontSize: '12.5px' }}>
                  <option value="">All Types</option>
                  <option>Regular</option><option>Student</option><option>Associate</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '5px' }}>Status</label>
                <select className="sel2" value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ padding: '7px 10px', fontSize: '12.5px' }}>
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '5px' }}>Sahachari</label>
                <select className="sel2" value={fSah} onChange={e => setFSah(e.target.value)} style={{ padding: '7px 10px', fontSize: '12.5px' }}>
                  <option value="">All</option>
                  <option value="current">✅ Current</option>
                  <option value="arrears">⚠️ In Arrears</option>
                </select>
              </div>
            </div>
            {/* Active filter chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              {activeFilterCount > 0 && (
                <>
                  {fName   && <span style={chipStyle}>Name: <b>{fName}</b> <span onClick={() => setFName('')}   style={chipX}>×</span></span>}
                  {fEmail  && <span style={chipStyle}>Email: <b>{fEmail}</b> <span onClick={() => setFEmail('')}  style={chipX}>×</span></span>}
                  {fPhone  && <span style={chipStyle}>Phone: <b>{fPhone}</b> <span onClick={() => setFPhone('')}  style={chipX}>×</span></span>}
                  {fBranch && <span style={chipStyle}>Unit: <b>{fBranch}</b> <span onClick={() => setFBranch('')} style={chipX}>×</span></span>}
                  {fType   && <span style={chipStyle}>Type: <b>{fType}</b> <span onClick={() => setFType('')}   style={chipX}>×</span></span>}
                  {fStatus && <span style={chipStyle}>Status: <b>{fStatus}</b> <span onClick={() => setFStatus('')} style={chipX}>×</span></span>}
                  {fSah    && <span style={chipStyle}>Sahachari: <b>{fSah}</b> <span onClick={() => setFSah('')}   style={chipX}>×</span></span>}
                  <button className="bsm r" style={{ fontSize: '11px', padding: '3px 10px' }} onClick={clearFilters}>Clear All</button>
                </>
              )}
              {activeFilterCount === 0 && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>No active filters — all members shown.</span>}
            </div>
          </div>
        )}

        {/* Bulk action bar */}
        {selectedEmails.length > 0 && (
          <div style={{ padding: '10px 20px', background: 'var(--teal-pale)', borderBottom: '1px solid var(--teal-pale2)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--teal)' }}>
              {selectedEmails.length} member{selectedEmails.length > 1 ? 's' : ''} selected
            </span>
            <button
              className="bsm r"
              style={{ fontSize: '12px', padding: '5px 14px' }}
              onClick={() => setConfirm({ open: true, type: 'bulk' })}
            >
              🗑 Delete Selected
            </button>
            <button
              className="bsm g"
              style={{ fontSize: '12px', padding: '5px 14px' }}
              onClick={() => setSelectedEmails([])}
            >
              ✕ Clear
            </button>
          </div>
        )}

        {filteredMembers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>👥</div>
            <div>{search ? `No results for "${search}"` : 'No members yet. Add one above or via the Member Portal registration.'}</div>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                  </th>
                  <th>Mem. No.</th>
                  <th>Unique Code</th>
                  <th>Name</th>
                  {currentRole === 'super' && <th>Unit</th>}
                  <th>Type</th>
                  <th>Loans</th>
                  <th>Sahachari</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m: any, i: number) => {
                  const mLoans = getLoans(m.id || m.email);
                  const activeL = mLoans.filter((l: any) => l.status === 'approved').length;
                  return (
                    <tr key={i} style={{ background: selectedEmails.includes(m.email) ? 'var(--teal-pale)' : '' }}>
                      <td>
                        <input type="checkbox" checked={selectedEmails.includes(m.email)} onChange={() => toggleOne(m.email)} style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ fontSize: '11.5px', fontWeight: 600 }}>{m.memberNo || '—'}</td>
                      <td style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--teal)' }}>{m.member_unique_code || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="sb-av" style={{ width: '32px', height: '32px', fontSize: '12px', background: m.avatar ? 'transparent' : 'var(--teal-pale)' }}>
                            {m.avatar ? <img src={m.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : m.name.charAt(0)}
                          </div>
                          <div>
                            <b>{m.name}</b><br />
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{m.email}</span>
                          </div>
                        </div>
                      </td>
                      {currentRole === 'super' && <td style={{ fontSize: '12px' }}>{m.branch || '—'}</td>}
                      <td>
                        <span className={`bdg ${m.type === 'Regular' ? 'bdg-t' : m.type === 'Student' ? 'bdg-g' : 'bdg-p'}`}>
                          {m.type || 'Regular'}
                        </span>
                      </td>
                      <td>
                        {activeL > 0
                          ? <span className="bdg bdg-a">{activeL} Active</span>
                          : <span className="bdg bdg-gr">{mLoans.length} Total</span>}
                      </td>
                      <td>
                        {(m.sah_miss || []).length === 0
                          ? <span className="bdg bdg-g">✅ Current</span>
                          : <span className="bdg bdg-r">{m.sah_miss.length} missed</span>}
                      </td>
                      <td>
                        <span className={`bdg ${m.active ? 'bdg-g' : 'bdg-gr'}`}>{m.active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td style={{ display: 'flex', gap: '6px' }}>
                        <span
                          style={{ color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
                          onClick={() => { setViewMember(m); setActiveTab('overview'); }}
                        >
                          View →
                        </span>
                        <span
                          style={{ color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, fontSize: '12px', marginLeft: '6px' }}
                          onClick={() => openEdit(m)}
                        >
                          Edit
                        </span>
                        <span
                          style={{ color: 'var(--red)', cursor: 'pointer', fontWeight: 600, fontSize: '12px', marginLeft: '6px' }}
                          onClick={() => setConfirm({ open: true, type: 'single', member: m })}
                        >
                          🗑
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD MEMBER MODAL */}
      {showAddModal && (
        <div className="ov" onClick={e => { if ((e.target as HTMLElement).classList.contains('ov')) setShowAddModal(false); }}>
          <div className="modal wide">
            <div className="modal-head">
              <div className="modal-title">{editingMember ? 'Edit Member Details' : 'Add New Member'}</div>
              <button className="modal-close" onClick={() => { setShowAddModal(false); setEditingMember(null); }}>✕</button>
            </div>
            <div className="modal-body">
              {saveError && (
                <div style={{ background: 'var(--red-pale)', border: '1px solid rgba(239,68,68,.3)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: 'var(--red)', marginBottom: '16px', fontWeight: 500 }}>
                  ⚠️ {saveError}
                </div>
              )}
              <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <div className="sb-av" style={{ width: '100px', height: '100px', fontSize: '32px', background: avatar ? 'transparent' : 'var(--teal-pale)', border: '2px solid var(--teal)' }}>
                    {avatar ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : '?'}
                  </div>
                  <label className="bsm s" style={{ fontSize: '11px', padding: '6px 14px', cursor: 'pointer' }}>
                    📸 Upload
                    <input type="file" hidden accept="image/*" onChange={handleAvatarChange} />
                  </label>
                  {avatar && <button className="bsm r" style={{ fontSize: '11px', padding: '6px 14px' }} onClick={() => setAvatar('')}>Remove</button>}
                </div>

                <div className="fgrid" style={{ flex: 1 }}>
                  <div className="fg2"><label className="fl2">Full Name *</label><input className="fi2" defaultValue={editingMember?.name} placeholder="Full name" ref={nameRef} /></div>
                  <div className="fg2"><label className="fl2">Father's Name</label><input className="fi2" defaultValue={editingMember?.fname} placeholder="Father's name" ref={fnameRef} /></div>
                  <div className="fg2"><label className="fl2">Date of Birth</label><input className="fi2" type="date" defaultValue={editingMember?.dob} ref={dobRef} /></div>
                  <div className="fg2">
                    <label className="fl2">Gender</label>
                    <select className="sel2" defaultValue={editingMember?.gender || 'Male'} ref={genderRef}><option>Male</option><option>Female</option><option>Other</option></select>
                  </div>
                  <div className="fg2"><label className="fl2">Phone *</label><input className="fi2" type="tel" defaultValue={editingMember?.phone} placeholder="+91 XXXXX XXXXX" ref={phoneRef} /></div>
                  <div className="fg2"><label className="fl2">Login Email *</label><input className="fi2" type="email" defaultValue={editingMember?.email} placeholder="member@email.com" ref={emailRef} /></div>
                  <div className="fg2"><label className="fl2">Occupation</label><input className="fi2" defaultValue={editingMember?.occupation} placeholder="Teacher, Business, etc." ref={occupRef} /></div>
                  <div className="fg2"><label className="fl2">Monthly Income</label><input className="fi2" type="number" defaultValue={editingMember?.salary} placeholder="0" ref={salaryRef} /></div>
                  <div className="fg2">
                    <label className="fl2">Membership Type</label>
                    <select className="sel2" defaultValue={editingMember?.type || 'Regular'} ref={typeRef}><option>Regular</option><option>Student</option><option>Associate</option></select>
                  </div>
                  <div className="fg2">
                    <label className="fl2">Unit</label>
                    <select className="sel2" ref={branchRef} disabled={currentRole === 'admin'} defaultValue={editingMember?.branch || branchFilter || 'Poyanad Central'}>
                      <option>Poyanad Central</option><option>Malappuram North</option>
                      <option>Thrissur East</option><option>Kannur West</option>
                    </select>
                  </div>
                  <div className="fg2"><label className="fl2">Assigned Zone</label><input className="fi2" defaultValue={editingMember?.assigned_zone} placeholder="e.g. Zone A" ref={zoneRef} /></div>
                  <div className="fg2"><label className="fl2">{editingMember ? 'New Password (leave blank for no change)' : 'Login Password *'}</label><input className="fi2" ref={passRef} placeholder={editingMember ? '••••••••' : 'Min 6 characters'} /></div>
                  
                  <div className="fg2" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0' }}>
                    <input type="checkbox" id="mustChangePass" defaultChecked={editingMember ? !!editingMember.must_change_password : true} ref={mustChangeRef} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    <label htmlFor="mustChangePass" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>Force password change</label>
                  </div>
                  <div className="fg2" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0' }}>
                    <input type="checkbox" id="isActiveUser" defaultChecked={editingMember ? !!editingMember.active : true} ref={activeRef} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    <label htmlFor="isActiveUser" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>Account Active</label>
                  </div>

                  <div className="fg2 full"><label className="fl2">Address</label><textarea className="ta2" rows={2} defaultValue={editingMember?.addr} placeholder="Full address" ref={addrRef}></textarea></div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="bsm g" onClick={() => { setShowAddModal(false); setEditingMember(null); }}>Cancel</button>
              <button className="bsm s" onClick={handleSave}>{editingMember ? 'Update Member Details' : 'Create Member Account →'}</button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MEMBER PROFILE MODAL */}
      {viewMember && (
        <div className="ov" onClick={e => { if ((e.target as HTMLElement).classList.contains('ov')) setViewMember(null); }}>
          <div className="modal wide" style={{ maxWidth: '800px' }}>
            <div className="modal-head" style={{ paddingBottom: 0 }}>
              <div>
                <div className="modal-title">PROFILE — {viewMember.name}</div>
                <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                  {viewMember.memberNo} | {viewMember.active ? 'Active' : 'Inactive'} | {viewMember.branch}
                </div>
              </div>
              <button className="modal-close" onClick={() => setViewMember(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '20px', padding: '0 24px', borderBottom: '1px solid var(--border)', marginTop: '16px' }}>
              {['overview', 'loan history', 'sahachari'].map(t => (
                <div
                  key={t}
                  style={{ padding: '12px 0', textTransform: 'capitalize', cursor: 'pointer', fontWeight: activeTab === t ? 600 : 400, color: activeTab === t ? 'var(--teal)' : 'var(--muted)', borderBottom: activeTab === t ? '2px solid var(--teal)' : '2px solid transparent' }}
                  onClick={() => setActiveTab(t)}
                >
                  {t}
                </div>
              ))}
            </div>

            <div className="modal-body" style={{ minHeight: '280px', background: 'var(--bg2)' }}>
              {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="card">
                    <div style={{ fontWeight: 600, marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Personal Details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px', fontSize: '13px' }}>
                      <span style={{ color: 'var(--muted)' }}>Phone:</span> <span>{viewMember.phone || '—'}</span>
                      <span style={{ color: 'var(--muted)' }}>Email:</span> <span>{viewMember.email}</span>
                      <span style={{ color: 'var(--muted)' }}>DOB:</span> <span>{viewMember.dob || '—'}</span>
                      <span style={{ color: 'var(--muted)' }}>Address:</span> <span>{viewMember.addr || '—'}</span>
                      <span style={{ color: 'var(--muted)' }}>Occupation:</span> <span>{viewMember.occupation || '—'}</span>
                      <span style={{ color: 'var(--muted)' }}>Join Date:</span> <span>{viewMember.joinDate || '—'}</span>
                    </div>
                  </div>
                  <div className="card">
                    <div style={{ fontWeight: 600, marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Engagement</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                      <span style={{ color: 'var(--muted)' }}>Total Loans:</span>
                      <span>{getLoans(viewMember.id || viewMember.email).length}</span>
                      <span style={{ color: 'var(--muted)' }}>Active Loan:</span>
                      <span>{getLoans(viewMember.id || viewMember.email).filter((l: any) => l.status === 'approved').length > 0 ? 'Yes' : 'None'}</span>
                      <span style={{ color: 'var(--muted)' }}>Sahachari:</span>
                      <span>{(viewMember.sah_miss || []).length === 0 ? '✅ Current' : '⚠️ Arrears'}</span>
                      <span style={{ color: 'var(--muted)' }}>Donations:</span>
                      <span>₹{viewMember.total_donated || 0}</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'loan history' && (
                <div className="card">
                  <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '8px', color: 'var(--muted)', textAlign: 'left' }}>App No</th>
                        <th style={{ padding: '8px', color: 'var(--muted)', textAlign: 'left' }}>Amount</th>
                        <th style={{ padding: '8px', color: 'var(--muted)', textAlign: 'left' }}>Purpose</th>
                        <th style={{ padding: '8px', color: 'var(--muted)', textAlign: 'left' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getLoans(viewMember.id || viewMember.email).map((l: any) => (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 8px', fontWeight: 600 }}>{l.id}</td>
                          <td style={{ padding: '10px 8px' }}>₹{l.amt?.toLocaleString()}</td>
                          <td style={{ padding: '10px 8px' }}>{l.purpose}</td>
                          <td style={{ padding: '10px 8px' }}>
                            <span className={`bdg ${l.status === 'approved' ? 'bdg-g' : l.status === 'pending' ? 'bdg-a' : 'bdg-r'}`}>{l.status}</span>
                          </td>
                        </tr>
                      ))}
                      {getLoans(viewMember.id || viewMember.email).length === 0 && (
                        <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>No loans found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'sahachari' && (
                <div className="card">
                  <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--muted)' }}>Month-by-month contribution grid</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
                    {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((mo, i) => {
                      const mnum = i + 1;
                      const isPaid = (viewMember.sahachari_paid || []).includes(mnum);
                      const isMissed = (viewMember.sah_miss || []).includes(mnum);
                      return (
                        <div key={mo} style={{
                          background: isPaid ? 'var(--green)' : isMissed ? 'var(--red)' : 'var(--bg2)',
                          color: isPaid || isMissed ? '#fff' : 'var(--muted)',
                          padding: '14px', textAlign: 'center', borderRadius: '6px', fontSize: '14px', fontWeight: 600
                        }}>
                          {mo}
                          <div style={{ fontSize: '10px', fontWeight: 400, marginTop: '4px', opacity: 0.85 }}>
                            {isPaid ? 'Paid' : isMissed ? 'Missed' : 'Upcoming'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DIALOGS */}
      <ConfirmDialog
        open={!!confirm?.open}
        danger={confirm?.type !== 'export'}
        icon={confirm?.type === 'export' ? '📥' : confirm?.type === 'bulk' ? '🗑️' : '🗑️'}
        title={
          confirm?.type === 'export' ? 'Export Member Data?'
          : confirm?.type === 'bulk' ? `Delete ${selectedEmails.length} Members?`
          : 'Delete Member Account?'
        }
        message={
          confirm?.type === 'export'
            ? `This will export ${filteredMembers.length} member record(s) as a CSV file.`
            : confirm?.type === 'bulk'
            ? `You are about to permanently delete ${selectedEmails.length} selected member accounts. This cannot be undone.`
            : `Permanently delete "${confirm?.member?.name}"? This cannot be undone.`
        }
        confirmLabel={
          confirm?.type === 'export' ? 'Download CSV'
          : confirm?.type === 'bulk' ? `Delete ${selectedEmails.length}`
          : 'Yes, Delete'
        }
        cancelLabel="Cancel"
        onConfirm={() => {
          if (confirm?.type === 'export') {
            doExportCSV();
          } else if (confirm?.type === 'bulk') {
            localDb.getUsers()
              .filter((u: any) => selectedEmails.includes(u.email))
              .forEach((u: any) => localDb.deleteUser(u.id));
            setSelectedEmails([]);
            refresh();
          } else {
            if (confirm?.member?.id) localDb.deleteUser(confirm.member.id);
            refresh();
          }
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
