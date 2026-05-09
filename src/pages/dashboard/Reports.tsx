import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { localDb } from '../../lib/localDb';
import { Navigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function Reports() {
  const { profile } = useAuth();
  const currentRole = profile?.role || 'member';
  const branchFilter = currentRole === 'admin' ? profile?.branch : null;
  
  const [rptType, setRptType] = useState('loan');
  const [fromDate, setFromDate] = useState('2025-01-01');
  const [toDate, setToDate] = useState('2025-12-31');
  const [selectedBranch, setSelectedBranch] = useState(branchFilter || 'All Branches');
  const [confirmExport, setConfirmExport] = useState(false);
  
  const [selStatus, setSelStatus] = useState({
    Pending: true, Approved: true, Completed: true, Rejected: true, Overdue: true
  });
  
  if (currentRole === 'member') {
    return <Navigate to="/dashboard" replace />;
  }

  const downloadExcel = () => {
    const allLoans = localDb.getLoans();
    const filteredLoans = allLoans.filter((l: any) => {
      const matchBranch = selectedBranch === 'All Branches' || l.branch === selectedBranch;
      const matchDate = (!fromDate || l.submittedDate >= fromDate) && (!toDate || l.submittedDate <= toDate);
      const st = l.status.charAt(0).toUpperCase() + l.status.slice(1);
      const matchStatus = (selStatus as any)[st] || false;
      return matchBranch && matchDate && (currentRole === 'super' || l.branch === branchFilter) && matchStatus;
    });

    const allMembers = localDb.getUsers().filter((u: any) => u.role === 'member');
    const filteredMembers = allMembers.filter((m: any) => {
      const matchBranch = selectedBranch === 'All Branches' || m.branch === selectedBranch;
      return matchBranch && (currentRole === 'super' || m.branch === branchFilter);
    });

    // 1. Loan Summary Sheet
    const summaryData = filteredLoans.map((l: any) => ({
      'App No.': l.id,
      'Member Name': l.name,
      'Membership No.': l.memNo,
      'Branch': l.branch,
      'Amount': l.amt,
      'Purpose': l.purpose,
      'Applied Date': l.submittedDate,
      'Repayment Period': `${l.months} Months`,
      'EMI Amount': Math.round(l.amt / l.months),
      'Status': l.status,
      'Approved By': l.audit?.find((a: any) => a.action === 'Approved')?.by || '-',
      'Approval Date': l.audit?.find((a: any) => a.action === 'Approved')?.date || '-',
      'Disbursed Date': l.disbursedDate || '-',
      'Notes': l.adminNote || '-'
    }));
    const ws1 = XLSX.utils.json_to_sheet(summaryData);

    // 2. Repayments Tracker Sheet
    const repayData = filteredLoans.filter((l: any) => ['approved', 'completed'].includes(l.status)).map((l: any) => {
      const emi = Math.round(l.amt / l.months);
      const paidAmt = l.repayments?.filter((r: any) => r.paid).reduce((s: number, r: any) => s + r.amt, 0) || 0;
      
      const row: any = {
        'App No.': l.id,
        'Member Name': l.name,
        'Total Amount': l.amt,
        'EMI Amount': emi,
        'Months': l.months
      };

      for (let i = 0; i < 3; i++) {
        const rep = l.repayments?.[i];
        row[`Month ${i+1} Due`] = rep?.due || '-';
        row[`Month ${i+1} Paid`] = rep?.paid_date || '-';
        row[`Month ${i+1} Status`] = (!rep) ? '-' : (rep.paid ? 'Paid' : 'Due');
      }
      
      row['Outstanding Balance'] = l.amt - paidAmt;
      row['Completion %'] = Math.round((paidAmt / (l.amt || 1)) * 100) + '%';
      row['Overall Status'] = l.status;
      
      return row;
    });
    const ws2 = XLSX.utils.json_to_sheet(repayData);

    // 3. Pending Loans (Not yet fully repaid)
    const pendingData = filteredLoans.filter((l: any) => l.status === 'approved').map((l: any) => {
      const paidAmt = l.repayments?.filter((r: any) => r.paid).reduce((s: number, r: any) => s + r.amt, 0) || 0;
      return {
        'App No.': l.id,
        'Name': l.name,
        'Amount': l.amt,
        'Disbursed Date': l.disbursedDate,
        'Amount Paid': paidAmt,
        'Amount Due': l.amt - paidAmt,
        'Months Overdue': 0, 
        'Contact': l.mob
      };
    });
    const ws3 = XLSX.utils.json_to_sheet(pendingData);

    // 4. Monthly Summary
    const totalDisbursed = filteredLoans.filter((l: any) => ['approved', 'completed'].includes(l.status)).reduce((s: number, l: any) => s + l.amt, 0);
    const monthlyData = [{
      'Period': `${fromDate} to ${toDate}`,
      'New Applications': filteredLoans.length,
      'Approved': filteredLoans.filter((l: any)=>l.status==='approved' || l.status==='completed').length,
      'Rejected': filteredLoans.filter((l: any)=>l.status==='rejected').length,
      'Total Disbursed (₹)': totalDisbursed,
      'Active Members': filteredMembers.length
    }];
    const ws4 = XLSX.utils.json_to_sheet(monthlyData);

    // Create workbook and append sheets
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Loan Summary");
    XLSX.utils.book_append_sheet(wb, ws2, "Repayments");
    XLSX.utils.book_append_sheet(wb, ws3, "Pending Loans");
    XLSX.utils.book_append_sheet(wb, ws4, "Overview");

    XLSX.writeFile(wb, `SKSSF_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    setConfirmExport(false);
  };

  return (
    <>
      <div className="pg-hd">
        <div>
          <div className="pg-title">📊 Reports & Analytics</div>
          <div className="pg-sub">Generate and download branch reports in Excel format.</div>
        </div>
      </div>

      <div className="report-form fu" style={{ maxWidth: '800px', margin: '0 20px', background: 'white', padding: '30px', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div style={{ marginBottom: '22px' }}>
          <label className="fl2">Select Report Type</label>
          <div className="rtype" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className={`rtype-opt ${rptType === 'loan' ? 'sel' : ''}`} style={{ padding: '20px', border: '2px solid', borderColor: rptType === 'loan' ? 'var(--teal)' : 'var(--border)', borderRadius: '10px', cursor: 'pointer', background: rptType === 'loan' ? 'var(--teal-pale)' : 'white' }} onClick={() => setRptType('loan')}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--teal)', marginBottom: '4px' }}>Full Loan Report (All Sheets)</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Includes Summary, Repayments, Pending, Monthly</div>
            </div>
            <div className={`rtype-opt ${rptType === 'member' ? 'sel' : ''}`} style={{ padding: '20px', border: '2px solid', borderColor: rptType === 'member' ? 'var(--teal)' : 'var(--border)', borderRadius: '10px', cursor: 'pointer', background: rptType === 'member' ? 'var(--teal-pale)' : 'white', opacity: 0.6 }} onClick={() => setRptType('member')}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--teal)', marginBottom: '4px' }}>Member Directory</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Full active member list (Coming Soon)</div>
            </div>
          </div>
        </div>
        
        <div className="fgrid t3" style={{ marginTop: '24px' }}>
          <div className="fg2">
            <label className="fl2">Filter by Branch</label>
            <select className="sel2" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} disabled={currentRole === 'admin'}>
              <option>All Branches</option>
              <option>Poyanad Central</option>
              <option>Malappuram North</option>
              <option>Thrissur East</option>
              <option>Kannur West</option>
            </select>
          </div>
          <div className="fg2">
            <label className="fl2">From Date</label>
            <input type="date" className="fi2" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="fg2">
            <label className="fl2">To Date</label>
            <input type="date" className="fi2" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
        </div>
        
        <div className="fgrid" style={{ marginTop: '24px' }}>
          <div className="fg2 full">
            <label className="fl2">Filter by Status</label>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
               {Object.keys(selStatus).map(s => (
                 <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                   <input 
                    type="checkbox" 
                    checked={(selStatus as any)[s]} 
                    onChange={e => setSelStatus({...selStatus, [s]: e.target.checked})}
                  /> {s}
                 </label>
               ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '30px', paddingTop: '24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px' }}>
          <button className="bsm s" style={{ padding: '12px 24px', fontSize: '14px' }} onClick={() => setConfirmExport(true)}>📥 Download Excel</button>
          <button className="bsm g" style={{ padding: '12px 24px', fontSize: '14px' }} onClick={() => alert('Printing Preview...')}>🖨️ Print Preview</button>
        </div>
      </div>

      <ConfirmDialog 
        open={confirmExport}
        icon="📊"
        title="Generate Excel Report?"
        message={`This will generate a multi-sheet report for "${selectedBranch}" from ${fromDate} to ${toDate}.`}
        confirmLabel="Generate & Download"
        cancelLabel="Cancel"
        onConfirm={downloadExcel}
        onCancel={() => setConfirmExport(false)}
      />
    </>
  );
}
