import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { localDb } from '../../lib/localDb';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function Donations() {
  const { profile } = useAuth();
  const isMember = profile?.role === 'member';

  const [campaigns, setCampaigns] = useState<any[]>(() => localDb.getCampaigns());
  const [donations, setDonations] = useState<any[]>(() => localDb.getDonations());
  
  const [showLogDonation, setShowLogDonation] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [donorName, setDonorName] = useState(profile?.name || '');
  const [donorType, setDonorType] = useState(isMember ? 'Member' : 'Well-wisher');
  const [donationAmt, setDonationAmt] = useState('');
  const [confirmLog, setConfirmLog] = useState(false);

  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampTitle, setNewCampTitle] = useState('');
  const [newCampTarget, setNewCampTarget] = useState('');

  const refreshData = () => {
    setCampaigns(localDb.getCampaigns());
    setDonations(localDb.getDonations());
  };

  const handleAddDonation = () => {
    localDb.addDonation({
      campaignId: selectedCampaignId,
      donor: donorName,
      donorType: donorType,
      amt: Number(donationAmt)
    });
    refreshData();
    setShowLogDonation(false);
    setConfirmLog(false);
    setDonationAmt('');
  };

  const handleAddCampaign = () => {
    localDb.addCampaign({
      title: newCampTitle,
      target: Number(newCampTarget)
    });
    refreshData();
    setShowNewCampaign(false);
    setNewCampTitle('');
    setNewCampTarget('');
  };

  const selectedCampaignName = campaigns.find(c => c.id === selectedCampaignId)?.title || 'Selected Mission';

  return (
    <>
      <div className="pg-hd">
        <div>
          <div className="pg-title">🎁 Special Donations</div>
          <div className="pg-sub">Manage missions and track specific donation collections.</div>
        </div>
        {!isMember && (
          <div className="pg-acts">
            <button className="bsm s" onClick={() => setShowNewCampaign(true)}>+ New Mission</button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '16px' }} className="fu">
        {campaigns.map((c: any) => {
          const campDons = donations.filter(d => d.campaignId === c.id);
          const collected = campDons.reduce((s, d) => s + (d.amt || 0), 0);
          const target = c.target || 1;
          const prog = Math.min((collected / target) * 100, 100);
          
          return (
            <div className="card" key={c.id}>
              <div className="card-hd" style={{ marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>Mission</div>
                  <div className="card-title" style={{ fontSize: '18px' }}>{c.title}</div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <span className={`bdg ${c.stat === 'Active' ? 'bdg-g' : 'bdg-b'}`}>{c.stat}</span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', alignSelf: 'center' }}>{c.dt}</span>
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: 'var(--dark2)', marginBottom: '5px', marginTop: '16px' }}>
                <span>Achieved: ₹{collected.toLocaleString()}</span>
                <span>Target: ₹{target.toLocaleString()}</span>
              </div>
              <div className="prog-wrap">
                <div className="prog-bar" style={{ width: `${prog}%`, background: prog >= 100 ? 'var(--green)' : 'var(--teal)' }}></div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '16px' }}>
                {campDons.length} donations recorded for this mission
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="bsm s" style={{ padding: '8px 16px' }} onClick={() => { setSelectedCampaignId(c.id); setShowLogDonation(true); }}>
                  Log Donation
                </button>
                <button className="bsm g" style={{ padding: '8px 16px' }} onClick={() => alert('Sharing mission details...')}>Share</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card fu" style={{ marginTop: '16px' }}>
        <div className="card-hd">
          <div className="card-title">Recent Donation Logs</div>
          <button className="bsm g" style={{ fontSize: '11px' }} onClick={() => alert('Exporting donations...')}>Export CSV</button>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Donor</th><th>Mission</th><th>Amount</th><th>Date</th></tr></thead>
            <tbody>
              {donations.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>No donations logged yet.</td></tr>
              ) : (
                [...donations].reverse().slice(0, 10).map((d: any) => (
                  <tr key={d.id}>
                    <td><b>{d.donor}</b><br /><span style={{ fontSize: '11px', color: 'var(--muted)' }}>{d.donorType}</span></td>
                    <td>{campaigns.find(c => c.id === d.campaignId)?.title || 'Unknown'}</td>
                    <td style={{ fontWeight: 600 }}>₹{(d.amt || 0).toLocaleString()}</td>
                    <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{d.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Donation Modal */}
      {showLogDonation && (
        <div className="ov" onClick={e => { if ((e.target as HTMLElement).classList.contains('ov')) setShowLogDonation(false); }}>
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div className="modal-head">
              <div className="modal-title">Log New Donation</div>
              <button className="modal-close" onClick={() => setShowLogDonation(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="fgrid">
                <div className="fg2 full">
                  <label className="fl2">Mission</label>
                  <select className="sel2" value={selectedCampaignId} onChange={e => setSelectedCampaignId(e.target.value)}>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div className="fg2 full">
                  <label className="fl2">Donor Name</label>
                  <input className="fi2" value={donorName} onChange={e => setDonorName(e.target.value)} placeholder="Full Name" />
                </div>
                <div className="fg2 full">
                  <label className="fl2">Donor Type</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['Member', 'Well-wisher', 'Corporate'].map(t => (
                      <button key={t} className={`bsm ${donorType === t ? 's' : 'g'}`} style={{ flex: 1, fontSize: '11px' }} onClick={() => setDonorType(t)}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="fg2 full">
                  <label className="fl2">Amount (₹) *</label>
                  <input type="number" className="fi2" value={donationAmt} onChange={e => setDonationAmt(e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <button className="bsm s" style={{ width: '100%', padding: '12px', marginTop: '20px' }} onClick={() => setConfirmLog(true)} disabled={!donationAmt}>
                💾 Record Donation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Mission Modal */}
      {showNewCampaign && (
        <div className="ov" onClick={e => { if ((e.target as HTMLElement).classList.contains('ov')) setShowNewCampaign(false); }}>
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div className="modal-head">
              <div className="modal-title">Create New Mission</div>
              <button className="modal-close" onClick={() => setShowNewCampaign(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="fgrid">
                <div className="fg2 full">
                  <label className="fl2">Mission Title *</label>
                  <input className="fi2" value={newCampTitle} onChange={e => setNewCampTitle(e.target.value)} placeholder="e.g. Flood Relief 2025" />
                </div>
                <div className="fg2 full">
                  <label className="fl2">Target Amount (₹) *</label>
                  <input type="number" className="fi2" value={newCampTarget} onChange={e => setNewCampTarget(e.target.value)} placeholder="50000" />
                </div>
              </div>
              <button className="bsm s" style={{ width: '100%', padding: '12px', marginTop: '20px' }} onClick={handleAddCampaign} disabled={!newCampTitle || !newCampTarget}>
                🚀 Launch Mission
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmLog}
        icon="💝"
        title="Record this Donation?"
        message={`Confirming ₹${Number(donationAmt).toLocaleString()} donation from ${donorName} for "${selectedCampaignName}".`}
        confirmLabel="Yes, Record"
        cancelLabel="Cancel"
        onConfirm={handleAddDonation}
        onCancel={() => setConfirmLog(false)}
      />
    </>
  );
}
