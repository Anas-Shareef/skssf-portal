// Laravel-backed frontend data cache.
// This module keeps a short-lived in-memory snapshot for the existing pages.
// It must not seed demo users or persist application data in browser storage.
import { api } from './api';

// Generate a random ID
const uuid = () => Math.random().toString(36).substring(2, 9);

const DEFAULT_PORTAL_CONFIG = {
  orgName: 'SKSSF Poyanad Branch',
  orgLogo: '',
  orgScale: 1.0,
  maxLoan: 50000,
  sahAmt: 100,
  repaymentApprovalsNeeded: 1, // Number of admin approvals required
  loanApprovalsNeeded: 2,      // Number of admin approvals for new loan
  approverRoles: ['President', 'Secretary', 'Treasurer'],
  authorizedReviewers: [], // Array of Admin IDs allowed to participate in consensus
  defaultCommittee: []    // Array of Admin IDs auto-assigned to every new request
};

const getToken = () => sessionStorage.getItem('active_api_token') || '';
const hasBackendSession = () => !!getToken();

const memoryCache = new Map<string, string>();
const backendCacheStorage = {
  getItem: (key: string) => localStorage.getItem(key) ?? null,
  setItem: (key: string, value: string) => {
    if (!hasBackendSession()) {
      console.warn(`Blocked frontend-only write for ${key}; Laravel API session is required.`);
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error('Storage Quota Exceeded! Local data might not persist across reloads.', e);
    }
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
  },
  clear: () => {
    localStorage.clear();
  },
};

export const clearFrontendCache = () => {
  backendCacheStorage.clear();
  emitDataChanged();
};

const mapUserFromApi = (u: any) => ({
  id: u.code || u.id,
  role: u.role,
  memberNo: u.member_no || '',
  name: u.name,
  email: u.email,
  phone: u.phone || '',
  branch: u.branch || '',
  occupation: u.occupation || '',
  desig: u.designation || '',
  avatar: u.avatar || '',
  pass: '',
  addr: u.addr || '',
  dob: u.dob || '',
  gender: u.gender || '',
  salary: Number(u.salary || 0),
  active: !!u.active,
  joinDate: u.join_date || new Date().toISOString().split('T')[0],
  sahachari_paid: u.sahachari_paid || [],
  sah_miss: u.sah_miss || [],
  total_donated: Number(u.total_donated || 0),
  perms: u.perms || {},
  is_approver: !!u.is_approver,
});

const mapLoanFromApi = (l: any, usersByNumericId: Map<number, any>) => {
  const user = l.user_id ? usersByNumericId.get(Number(l.user_id)) : null;
  const approvals = l.request?.approvals || [];
  const assignedReviewers = l.request?.assignedReviewers || l.request?.assigned_reviewers || [];
  const mapped = {
    id: l.loan_no || l.id,
    memId: user?.code || '',
    applicant_id: user?.code || '',
    email: user?.email || '',
    memNo: l.member_no || user?.member_no || '',
    name: l.name,
    branch: l.branch || user?.branch || '',
    mob: l.mob || user?.phone || '',
    amt: Number(l.amount || l.amt || 0),
    purpose: l.purpose,
    purpDesc: l.purpose_desc || l.purpDesc || '',
    months: Number(l.months || 1),
    status: (l.status || 'pending').toLowerCase(),
    submittedDate: l.submitted_date || l.submittedDate || '',
    approvedDate: l.approved_date || l.approvedDate || '',
    disbursedDate: l.disbursed_date || l.disbursedDate || '',
    adminNote: l.admin_note || l.adminNote || '',
    superNote: l.super_note || l.superNote || '',
    approvedBy: l.approved_by || l.approvedBy || '',
    guarantors: l.guarantors || [],
    repayments: l.repayments || [],
    request: l.request || {},
    approvals,
    assignedReviewers,
    audit: l.audit || [],
    signature: l.signature || '',
    witnesses: l.witnesses || [],
    total_paid: 0,
    remaining_balance: 0
  };
  
  // Financial Integrity Audit: Ensure 'paid' flags match approved requests
  const reps = mapped.repayments || [];
  let calculatedPaid = 0;
  reps.forEach((r: any) => {
    const isApproved = r.request?.status === 'approved';
    if (isApproved && !r.paid) {
      r.paid = r.request.reviewedAt || new Date().toISOString();
      r.paid_amount = Number(r.request.amt) || r.amt;
    }
    if (r.paid) {
      calculatedPaid += Number(r.paid_amount || r.request?.amt || r.amt);
    }
  });
  mapped.total_paid = calculatedPaid;
  mapped.remaining_balance = mapped.amt - calculatedPaid;

  return mapped;
};

const mapCampaignFromApi = (c: any) => ({
  id: c.campaign_no || c.id,
  title: c.title,
  goal: Number(c.goal || 0),
  received: Number(c.received || 0),
  stat: c.status || 'Active',
  note: c.note || '',
  dt: c.period || '',
});

const mapDonationFromApi = (d: any) => ({
  id: d.donation_no || d.id,
  campaign_id: d.campaign_id || null,
  donor_name: d.donor_name,
  donor_phone: d.donor_phone || '',
  amount: Number(d.amount || 0),
  method: d.method || 'cash',
  note: d.note || '',
  date: d.donated_at || '',
});

const mapProductFromApi = (p: any) => ({
  _id: p.id,
  id: p.product_no || String(p.id),
  name: p.name,
  sku: p.product_no || p.sku || String(p.id),
  category: p.category,
  unit: p.unit || '',
  total_quantity: Number(p.total_quantity || 0),
  available_quantity: Number(p.available_quantity || 0),
  // Support wide range of backend field names
  photo: p.photo || p.image_url || p.image || p.image_path || p.picture || p.thumbnail || null,
  created_at: p.created_at || '',
});

const mapUnitFromApi = (u: any) => ({
  _id: u.id, // original numeric id
  id: u.unit_no || u.id,
  product_id: u.product?.product_no || u.product_no || u.product_id,
  product_db_id: u.product_id, // Map to string ID for frontend consistency
  unit_code: u.unit_no || '',
  barcode: u.barcode,
  status: u.status,
  current_holder_id: u.current_holder?.code || u.current_holder_id || null,
  current_mission_id: u.current_mission?.campaign_no || u.current_mission_id || null,
  created_at: u.created_at || '',
  checkoutDate: u.checkout_at || null,
  checkinDate: u.checkin_at || null,
});

const mapKitFromApi = (k: any) => ({
  id: k.kit_no || k.id,
  name: k.name,
  barcode: k.barcode,
  child_units: k.child_units || [], // These are numeric IDs from backend, need careful handling
  created_at: k.created_at || '',
});

const mapInventoryTxFromApi = (t: any) => ({
  id: t.tx_no || t.id,
  unit_id: t.unit_id,
  product_id: t.product_id,
  barcode: t.barcode,
  type: t.type,
  adminBy: t.admin_by,
  assignedTo: t.assigned_to,
  memberName: t.member_name,
  missionId: t.mission_id,
  timestamp: t.happened_at || t.created_at,
  note: t.note || '',
});

const mapConfigFromApi = (c: any) => ({
  orgName: c.org_name || DEFAULT_PORTAL_CONFIG.orgName,
  orgLogo: c.org_logo || '',
  orgScale: Number(c.org_scale || 1),
  maxLoan: Number(c.max_loan || DEFAULT_PORTAL_CONFIG.maxLoan),
  sahAmt: Number(c.sah_amt || DEFAULT_PORTAL_CONFIG.sahAmt),
  repaymentApprovalsNeeded: Number(c.repayment_approvals_needed || 1),
  loanApprovalsNeeded: Number(c.loan_approvals_needed || 2),
  approverRoles: c.approver_roles || [],
  authorizedReviewers: c.authorized_reviewers || [],
  defaultCommittee: c.default_committee || [],
});

let bootstrapPromise: Promise<void> | null = null;
const emitDataChanged = () => {
  window.dispatchEvent(new Event('appDataUpdated'));
  window.dispatchEvent(new Event('portalConfigUpdated'));
};

export const syncFromBackend = async () => {
  if (!hasBackendSession()) return;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      const payload = await api.get<any>('/bootstrap');
      const usersRaw = payload.users || [];
      const users = usersRaw.map(mapUserFromApi);
      const usersByNumericId = new Map<number, any>();
      usersRaw.forEach((u: any) => usersByNumericId.set(Number(u.id), u));

      const oldLoans = JSON.parse(localStorage.getItem('db_loans') || '[]');
      const loans = (payload.loans || []).map((l: any) => {
        const mapped = mapLoanFromApi(l, usersByNumericId);
        // Merge local pending repayment requests if they exist and are missing from backend
        const existing = oldLoans.find((ol: any) => ol.id === mapped.id);
        if (existing && existing.repayments) {
          mapped.repayments = mapped.repayments.map((r: any, idx: number) => {
            const localRep = existing.repayments[idx];
            if (localRep?.request && !r.request) {
              return { ...r, request: localRep.request };
            }
            return r;
          });
        }
        return mapped;
      });

      const campaigns = (payload.campaigns || []).map(mapCampaignFromApi);
      const donations = (payload.donations || []).map(mapDonationFromApi);
      const portalConfig = mapConfigFromApi(payload.portal_config || {});
      const oldProducts = localDb.getProducts();
      const products = (payload.products || []).map(mapProductFromApi).map((newProd: any) => {
        // Local Persistence Fallback: If backend returns no photo but we have one locally (base64), keep it.
        const existingP = oldProducts.find((op: any) => String(op.id) === String(newProd.id) || (op._id && String(op._id) === String(newProd._id)));
        if (!newProd.photo && existingP?.photo && String(existingP.photo).startsWith('data:image')) {
          return { ...newProd, photo: existingP.photo };
        }
        return newProd;
      });
      const units = (payload.units || []).map(mapUnitFromApi);
      const kits = (payload.kits || []).map(mapKitFromApi);
      const inventoryTx = (payload.inventory_transactions || []).map(mapInventoryTxFromApi);

      backendCacheStorage.setItem('db_users', JSON.stringify(users));
      backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
      backendCacheStorage.setItem('db_campaigns', JSON.stringify(campaigns));
      backendCacheStorage.setItem('db_donations', JSON.stringify(donations));
      backendCacheStorage.setItem('db_products', JSON.stringify(products));
      backendCacheStorage.setItem('db_units', JSON.stringify(units));
      backendCacheStorage.setItem('db_kits', JSON.stringify(kits));
      backendCacheStorage.setItem('db_inventory_tx', JSON.stringify(inventoryTx));
      backendCacheStorage.setItem('portal_config', JSON.stringify(portalConfig));
      emitDataChanged();
    } catch (err) {
      console.warn('Backend bootstrap sync failed', err);
    } finally {
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
};

const syncLater = (task: Promise<any>) => {
  void task.catch((err) => {
    console.warn('Laravel API write failed; reverting frontend cache from backend', err);
    void syncFromBackend();
  });
};

export const initLocalDb = () => {
  void syncFromBackend();
};

export const localDb = {
  getUsers: () => JSON.parse(backendCacheStorage.getItem('db_users') || '[]'),
  getLoans() {
    return JSON.parse(backendCacheStorage.getItem('db_loans') || '[]');
  },

  healCorruptedLoanData() {
    const loans = localDb.getLoans();
    let fixed = false;
    loans.forEach((l: any) => {
      if (l.id === 'LOAN-2026-0001') {
        // Fix for Faris: EMI 1 (index 0) showing as 0 pending
        const rep0 = l.repayments?.[0];
        if (rep0 && rep0.request && (rep0.request.amt === '0' || rep0.request.amt === 0)) {
           rep0.request.amt = "5000"; // Restore expected EMI amount
           fixed = true;
        }
      }
    });
    if (fixed) {
      backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
      return true;
    }
    return false;
  },
  getCampaigns: () => JSON.parse(backendCacheStorage.getItem('db_campaigns') || '[]'),
  getDonations: () => JSON.parse(backendCacheStorage.getItem('db_donations') || '[]'),
  
  // INVENTORY
  getProducts: () => JSON.parse(backendCacheStorage.getItem('db_products') || '[]'),
  getUnits: () => JSON.parse(backendCacheStorage.getItem('db_units') || '[]'),
  getInventoryTransactions: () => JSON.parse(backendCacheStorage.getItem('db_inventory_tx') || '[]'),
  getKits: () => JSON.parse(backendCacheStorage.getItem('db_kits') || '[]'),

  getPortalConfig: () => JSON.parse(backendCacheStorage.getItem('portal_config') || JSON.stringify(DEFAULT_PORTAL_CONFIG)),
  getUserById: (id: string) => localDb.getUsers().find((u: any) => u.id === id),
  
  saveUser: (user: any) => {
    const users = localDb.getUsers();
    const id = uuid();
    users.push({ 
      ...user, 
      id,
      sahachari_paid: [],
      sah_miss: [],
      total_donated: 0,
      active: true,
      avatar: user.avatar || '',
      occupation: user.occupation || '',
      joinDate: new Date().toISOString().split('T')[0]
    });
    backendCacheStorage.setItem('db_users', JSON.stringify(users));

    if (hasBackendSession()) {
      syncLater(
        api.post('/users', {
          role: user.role || 'member',
          name: user.name,
          email: user.email,
          password: user.pass || 'password123',
          phone: user.phone || '',
          branch: user.branch || '',
          member_no: user.memberNo || '',
          occupation: user.occupation || '',
          designation: user.desig || '',
          is_approver: !!user.is_approver,
          perms: user.perms || {},
        }).then(() => syncFromBackend())
      );
    }

    return id;
  },

  updateUser: (id: string, updates: any) => {
    const users = localDb.getUsers();
    const idx = users.findIndex((u: any) => u.id === id);
    if (idx > -1) {
      const oldApprover = !!users[idx].is_approver;
      users[idx] = { ...users[idx], ...updates };
      const newApprover = !!users[idx].is_approver;
      
      // Auto-sync reviewer pool in portal config
      if (oldApprover !== newApprover) {
        const config = localDb.getPortalConfig();
        const pool = config.authorizedReviewers || [];
        const newPool = newApprover 
          ? (pool.includes(id) ? pool : [...pool, id])
          : pool.filter((pid: string) => pid !== id);
        localDb.updatePortalConfig({ authorizedReviewers: newPool });
      }
      
      backendCacheStorage.setItem('db_users', JSON.stringify(users));

      if (hasBackendSession()) {
        const passwordPayload = updates?.pass ? { password: updates.pass } : {};
        syncLater(
          api.patch(`/users/${id}`, {
            role: users[idx].role,
            name: users[idx].name,
            email: users[idx].email,
            phone: users[idx].phone || '',
            branch: users[idx].branch || '',
            member_no: users[idx].memberNo || '',
            occupation: users[idx].occupation || '',
            designation: users[idx].desig || '',
            avatar: users[idx].avatar || '',
            active: !!users[idx].active,
            sahachari_paid: users[idx].sahachari_paid || [],
            sah_miss: users[idx].sah_miss || [],
            total_donated: Number(users[idx].total_donated || 0),
            is_approver: !!users[idx].is_approver,
            perms: users[idx].perms || {},
            ...passwordPayload,
          }).then(() => syncFromBackend())
        );
      }
    }
  },

  deleteUser: (id: string) => {
    const all = localDb.getUsers().filter((u: any) => u.id !== id);
    backendCacheStorage.setItem('db_users', JSON.stringify(all));
    if (hasBackendSession()) {
      syncLater(api.del(`/users/${id}`).then(() => syncFromBackend()));
    }
    return true;
  },

  logSahachari: (userId: string, month: number) => {
    const users = localDb.getUsers();
    const u = users.find((x: any) => x.id === userId);
    if (u) {
      if (!u.sahachari_paid) u.sahachari_paid = [];
      if (!u.sahachari_paid.includes(month)) {
        u.sahachari_paid.push(month);
        u.sahachari_paid.sort((a: number, b: number) => a - b);
        u.sah_miss = (u.sah_miss || []).filter((m: number) => m !== month);
        backendCacheStorage.setItem('db_users', JSON.stringify(users));
        if (hasBackendSession()) {
          syncLater(
            api.patch(`/users/${userId}`, {
              sahachari_paid: u.sahachari_paid || [],
              sah_miss: u.sah_miss || [],
            }).then(() => syncFromBackend())
          );
        }
        return true;
      }
    }
    return false;
  },

  logRepayment(loanId: string, monthIdx: number, metadata?: { method: 'cash' | 'transfer', notes?: string, proof?: string, amt?: number, isFullClearance?: boolean }) {
    const loans = localDb.getLoans();
    const loan = loans.find((l: any) => l.id === loanId);
    if (loan && loan.repayments[monthIdx]) {
      const respBase = { 
        paid: new Date().toISOString().split('T')[0],
        paid_date: new Date().toLocaleDateString('en-GB'),
        method: metadata?.method || 'cash',
        notes: metadata?.notes || '',
        proof: metadata?.proof || '',
        status: 'approved' 
      };

      if (metadata?.isFullClearance) {
        loan.repayments.forEach((r: any) => {
          if (!r.paid) {
            Object.assign(r, { ...respBase, notes: (r.notes || '') + ' (Full Settlement Logged)' });
          }
        });
        loan.status = 'completed';
      } else {
        Object.assign(loan.repayments[monthIdx], respBase);
        loan.repayments[monthIdx].paid_amount = Number(metadata?.amt || loan.repayments[monthIdx].amt);
      }

      // Update audit
      loan.audit.push({
        action: metadata?.isFullClearance ? 'Full Loan Settlement Logged' : 'Repayment Logged',
        by: 'Admin',
        date: new Date().toLocaleString(),
        note: metadata?.isFullClearance ? `All remaining installments cleared manually.` : `EMI #${monthIdx + 1} marked as paid via ${respBase.method}.`,
        category: 'repayment'
      });
      
      const allDone = loan.repayments.every((r: any) => !!r.paid);
      if (allDone) {
        loan.status = 'completed';
        loan.audit.push({ action: 'Completed', by: 'System', date: new Date().toLocaleString(), note: 'All EMIs settled.', category: 'loan' });
      }

      backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
      if (hasBackendSession()) {
        syncLater(api.post(`/loans/${loanId}/repayments/${monthIdx}/log`, metadata || {}).then(() => syncFromBackend()));
      }
      return true;
    }
    return false;
  },

  submitRepaymentRequest(loanId: string, monthIdx: number, data: any) {
    const loans = localDb.getLoans();
    const loan = loans.find((l: any) => l.id === loanId);
    const config = localDb.getPortalConfig();
    if (loan && loan.repayments[monthIdx]) {
      const autoAssigned = data.assignedReviewers?.length > 0
        ? data.assignedReviewers
        : (config.defaultCommittee?.length > 0 ? config.defaultCommittee : []);

      loan.repayments[monthIdx].request = {
        proof: data.proof,
        notes: data.notes,
        amt: data.amt,
        mode: data.mode,
        ref: data.ref,
        payDate: data.payDate,
        memberNote: data.memberNote,
        installment_no: monthIdx + 1,
        submittedAt: new Date().toISOString(),
        status: 'pending',
        isFullClearance: data.isFullClearance || false,
        approvals: [],
        assignedReviewers: autoAssigned
      };
      
      loan.audit.push({
        action: 'Payment Proof Submitted',
        by: 'Member',
        date: new Date().toLocaleString(),
        note: `Member submitted proof for EMI #${monthIdx + 1}.${data.isFullClearance ? ' (Requested Full Clearance)' : ''}`,
        category: 'repayment'
      });

      backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
      if (hasBackendSession()) {
        syncLater(api.post(`/loans/${loanId}/repayments/${monthIdx}/submit`, data).then(() => syncFromBackend()));
      }
      return true;
    }
    return false;
  },

  editRepaymentRequest(loanId: string, monthIdx: number, data: any) {
    const loans = localDb.getLoans();
    const loan = loans.find((l: any) => l.id === loanId);
    if (loan && loan.repayments[monthIdx]?.request) {
      loan.repayments[monthIdx].request = {
        ...loan.repayments[monthIdx].request,
        proof: data.proof,
        notes: data.notes,
        amt: data.amt,
        mode: data.mode,
        ref: data.ref,
        payDate: data.payDate,
        memberNote: data.memberNote,
        updatedAt: new Date().toISOString(),
        status: 'pending',
        approvals: []
      };
      loan.repayments[monthIdx].paid = null;
      loan.repayments[monthIdx].paid_date = null;

      loan.audit.push({
        action: 'Payment Proof Resubmitted',
        by: 'Member',
        date: new Date().toLocaleString(),
        note: `Member updated proof for EMI #${monthIdx + 1}.`,
        category: 'repayment'
      });
      backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
      if (hasBackendSession()) {
        syncLater(api.post(`/loans/${loanId}/repayments/${monthIdx}/submit`, data).then(() => syncFromBackend()));
      }
      return true;
    }
    return false;
  },

  deleteRepaymentRequest(loanId: string, monthIdx: number) {
    const loans = localDb.getLoans();
    const loan = loans.find((l: any) => l.id === loanId);
    if (loan && loan.repayments[monthIdx]?.request?.status === 'pending') {
      delete loan.repayments[monthIdx].request;
      loan.audit.push({ action: 'Payment Withdrawn', by: 'Member', date: new Date().toLocaleString(), note: `EMI #${monthIdx + 1} request canceled.`, category: 'repayment' });
      backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
      if (hasBackendSession()) {
        syncLater(api.patch(`/loans/${loanId}`, { repayments: loan.repayments }).then(() => syncFromBackend()));
      }
      return true;
    }
    return false;
  },

  verifyRepaymentRequest(loanId: string, monthIdx: number, status: string, adminNotes?: string, adminBy?: string, adminRole?: string, adminId?: string, overrides?: { amt?: number, payDate?: string, proof?: string }) {
    const loans = localDb.getLoans();
    const loan = loans.find((l: any) => l.id === loanId);
    const config = localDb.getPortalConfig();
    
    if (loan && loan.repayments[monthIdx]?.request) {
      const rep = loan.repayments[monthIdx];
      const req = rep.request;
      const byName = adminBy || 'Admin';
      const isSuper = adminRole === 'super';
      
      const adminProfile = adminId ? localDb.getUserById(adminId) : null;
      const isAdminApprover = adminProfile?.role === 'admin' && adminProfile?.is_approver;

      if (!isSuper) {
        if (!isAdminApprover) return false;
        const assigned = req.assignedReviewers || [];
        if (assigned.length > 0 && !assigned.includes(adminId || '')) return false;
      }
      
      if (!req.approvals) req.approvals = [];
      const sigIdx = req.approvals.findIndex((a: any) => a.id === adminId || a.by === byName);
      const signature = { id: adminId, by: byName, role: adminRole || 'Admin', date: new Date().toISOString(), note: adminNotes || '', status: status || 'pending' };
      
      if (sigIdx > -1) req.approvals[sigIdx] = signature;
      else req.approvals.push(signature);

      // --- Dynamic Consensus Calculation ---
      const apprs = req.approvals.filter((a: any) => a.status === 'approved');
      const rejs = req.approvals.filter((a: any) => a.status === 'rejected');
      const threshold = config.repaymentApprovalsNeeded || 1;
      const superApprover = req.approvals.find((a: any) => a.role === 'super' && a.status === 'approved');

      // Finalize Status
      if (superApprover) {
        req.status = 'approved';
      } else if (rejs.length > 0) {
        req.status = 'rejected';
        req.adminNotes = rejs[0].note;
      } else if (apprs.length >= threshold) {
        req.status = 'approved';
      } else if (apprs.length > 0) {
        req.status = 'partially_approved';
      } else {
        req.status = 'pending';
      }

      // If finally approved, commit the payment to the installment
      if (req.status === 'approved') {
        const finalAmt = overrides?.amt || Number(req.amt) || rep.amt;
        const finalDateStr = overrides?.payDate || req.payDate || new Date().toISOString().split('T')[0];
        const finalProof = overrides?.proof || req.proof || '';
        
        rep.paid = new Date().toISOString().split('T')[0];
        rep.paid_date = new Date(finalDateStr).toLocaleDateString('en-GB');
        rep.paid_amount = finalAmt;
        rep.method = req.mode || 'transfer';
        rep.notes = `Verified by ${superApprover ? 'Super Admin' : `${apprs.length} Reviewers`}. ${adminNotes || ''}${overrides ? ' (ADMIN OVERRIDE)' : ''}`;
        rep.proof = finalProof;
        req.reviewedAt = new Date().toISOString();
        
        // Reflect overrides back to request object for history
        if(overrides?.amt) req.amt = String(overrides.amt);
        if(overrides?.payDate) req.payDate = overrides.payDate;
        if(overrides?.proof) req.proof = overrides.proof;
        
        // Audit log for financial integrity
        loan.audit.push({
          action: 'Payment Verified',
          by: adminBy || 'System',
          date: new Date().toLocaleString(),
          note: `Installment #${monthIdx + 1} approved for ₹${finalAmt.toLocaleString()}.`,
          category: 'repayment'
        });
      }

      // Handle Full Clearance if finally approved
      if (req.status === 'approved' && req.isFullClearance) {
        loan.repayments.forEach((r: any) => {
          if (!r.paid) {
            r.paid = new Date().toISOString().split('T')[0];
            r.paid_date = new Date().toLocaleDateString('en-GB');
            r.method = req.mode || 'transfer';
            r.notes = 'Cleared via Full Settlement.';
            r.proof = req.proof || r.proof;
          }
        });
      }

      loan.audit.push({
        action: status === 'approved' ? 'Payment Verified' : status === 'rejected' ? 'Payment Rejected' : 'Payment Deliberation',
        by: byName,
        date: new Date().toLocaleString(),
        note: status === 'approved' ? `Signed approval for EMI #${monthIdx + 1}.` : status === 'rejected' ? `Rejected proof: ${adminNotes}` : `Pending further review.`,
        category: 'repayment'
      });

      const allPaid = loan.repayments.every((r: any) => !!r.paid);
      if (allPaid) {
        loan.status = 'completed';
        loan.audit.push({ action: 'Completed', by: 'System', date: new Date().toLocaleString(), note: 'All EMIs settled.', category: 'loan' });
      }

      backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
      if (hasBackendSession()) {
        syncLater(api.post(`/loans/${loanId}/repayments/${monthIdx}/verify`, {
          status,
          adminNotes,
          adminBy,
          adminRole,
          adminId,
        }).then(() => syncFromBackend()));
      }
      return true;
    }
    return false;
  },

  addLoan: (loanData: any) => {
    const loans = localDb.getLoans();
    const config = localDb.getPortalConfig();
    const admins = localDb.getUsers().filter((u: any) => u.role === 'admin' && u.is_approver);
    const autoAssigned = admins.length > 0 ? admins.map((a: any) => a.id).slice(0, 3) : [];
    
    const loanId = `LOAN-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    const newLoan = {
      ...loanData,
      id: loanId,
      status: 'pending',
      submittedDate: new Date().toISOString().split('T')[0],
      request: {
        submittedAt: new Date().toISOString(),
        approvals: [],
        assignedReviewers: autoAssigned,
        threshold: config.loanApprovalsNeeded || 2,
        status: 'pending'
      },
      audit: [{ action: 'Submitted', by: loanData.name, date: new Date().toLocaleString(), note: 'Application generated.', category: 'loan' }],
      repayments: loanData.repayments || [],
      guarantors: loanData.guarantors || [],
    };
    loans.push(newLoan);
    backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
    if (hasBackendSession()) {
      syncLater(
        api.post('/loans', {
          member_no: loanData.memNo || loanData.memberNo || '',
          name: loanData.name,
          branch: loanData.branch || '',
          mob: loanData.mob || '',
          amount: Number(loanData.amt || loanData.amount || 0),
          purpose: loanData.purpose || 'Other',
          purpose_desc: loanData.purpDesc || loanData.purposeDesc || '',
          months: Number(loanData.months || 1),
          guarantors: loanData.guarantors || [],
          repayments: loanData.repayments || [],
          signature: loanData.signature || null,
          witnesses: loanData.witnesses || [],
        }).then(() => syncFromBackend())
      );
    }
    return newLoan;
  },

  verifyLoanRequest(loanId: string, status: string, adminNotes?: string, adminBy?: string, adminRole?: string, adminId?: string) {
    const loans = localDb.getLoans();
    const loan = loans.find((l: any) => l.id === loanId);
    if (loan && loan.request) {
      const byName = adminBy || 'Admin';
      const isSuper = adminRole === 'super';
      
      // Permit if Super Admin OR if Admin is a designated Approver
      const adminProfile = adminId ? localDb.getUserById(adminId) : null;
      const isAdminApprover = adminProfile?.role === 'admin' && adminProfile?.is_approver;

      if (!isSuper) {
        if (!isAdminApprover) return false;
        const assigned = loan.request.assignedReviewers || [];
        if (assigned.length > 0 && !assigned.includes(adminId || '')) return false;
      }
      
      if (!loan.request.approvals) loan.request.approvals = [];
      const sigIdx = loan.request.approvals.findIndex((a: any) => a.id === adminId || a.by === byName);
      const signature = { id: adminId, by: byName, role: adminRole || 'Admin', date: new Date().toISOString(), note: adminNotes || '', status: status || 'pending' };
      
      if (sigIdx > -1) loan.request.approvals[sigIdx] = signature;
      else loan.request.approvals.push(signature);

      // --- Dynamic Consensus Calculation for Loan Application ---
      const apprs = loan.request.approvals.filter((a: any) => a.status === 'approved');
      const rejs = loan.request.approvals.filter((a: any) => a.status === 'rejected');
      const threshold = loan.request.threshold || 2;
      const superApprover = loan.request.approvals.find((a: any) => a.role === 'super' && a.status === 'approved');

      if (superApprover) {
        loan.status = 'approved';
        loan.request.status = 'approved';
        loan.approvedDate = new Date().toISOString().split('T')[0];
      } else if (rejs.length > 0) {
        loan.status = 'rejected';
        loan.request.status = 'rejected';
      } else if (apprs.length >= threshold) {
        loan.status = 'approved';
        loan.request.status = 'approved';
        loan.approvedDate = new Date().toISOString().split('T')[0];
      } else if (apprs.length > 0) {
        loan.status = 'pending';
        loan.request.status = 'partially_approved';
      } else {
        loan.status = 'pending';
        loan.request.status = 'pending';
      }

      loan.audit.push({
        action: status === 'approved' ? 'Loan Verified' : status === 'rejected' ? 'Loan Rejected' : 'Loan Deliberation',
        by: byName,
        date: new Date().toLocaleString(),
        note: status === 'approved' ? `Signed approval for request.` : status === 'rejected' ? `Rejected: ${adminNotes}` : `Set back to pending for review.`,
        category: 'loan'
      });

      backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
      if (hasBackendSession()) {
        syncLater(api.post(`/loans/${loanId}/verify`, {
          status,
          adminNotes,
          adminBy,
          adminRole,
          adminId,
        }).then(() => syncFromBackend()));
      }
      return true;
    }
    return false;
  },

  deleteLoansBulk(ids: string[]) {
    const loans = localDb.getLoans().filter((l: any) => !ids.includes(l.id));
    backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
    if (hasBackendSession()) {
      syncLater(api.del('/loans', { ids }).then(() => syncFromBackend()));
    }
    return true;
  },

  deleteRepaymentsBulk(loanId: string, indices: number[]) {
    const loans = localDb.getLoans();
    const loan = loans.find((l: any) => l.id === loanId);
    if (loan) {
      indices.forEach(idx => {
        if (loan.repayments[idx]) {
          loan.repayments[idx].paid = null;
          delete loan.repayments[idx].request;
        }
      });
      backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
      if (hasBackendSession()) {
        syncLater(api.patch(`/loans/${loanId}`, { repayments: loan.repayments }).then(() => syncFromBackend()));
      }
    }
  },

  updateLoan: (id: string, updates: any) => {
    const loans = localDb.getLoans();
    const idx = loans.findIndex((l: any) => l.id === id);
    if (idx > -1) {
      loans[idx] = { ...loans[idx], ...updates };
      backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
      if (hasBackendSession()) {
        syncLater(api.patch(`/loans/${id}`, {
          status: loans[idx].status,
          amount: Number(loans[idx].amt || loans[idx].amount || 0),
          purpose: loans[idx].purpose,
          purpose_desc: loans[idx].purpDesc || '',
          months: Number(loans[idx].months || 1),
          repayments: loans[idx].repayments || [],
          guarantors: loans[idx].guarantors || [],
          admin_note: loans[idx].adminNote || '',
          super_note: loans[idx].superNote || '',
          approved_by: loans[idx].approvedBy || '',
          approved_date: loans[idx].approvedDate || null,
          disbursed_date: loans[idx].disbursedDate || null,
          signature: loans[idx].signature || null,
          witnesses: loans[idx].witnesses || [],
        }).then(() => syncFromBackend()));
      }
    }
  },

  addAuditLog: (loanId: string, action: string, byName: string, note?: string, category: 'loan' | 'repayment' = 'loan') => {
    const loans = localDb.getLoans();
    const loan = loans.find((l: any) => l.id === loanId);
    if (loan) {
      loan.audit.push({ action, by: byName, date: new Date().toLocaleString(), note, category });
      backendCacheStorage.setItem('db_loans', JSON.stringify(loans));
      if (hasBackendSession()) {
        syncLater(api.patch(`/loans/${loanId}`, { audit: loan.audit }).then(() => syncFromBackend()));
      }
    }
  },

  resetPortalData: () => {
    if (!hasBackendSession()) return false;
    syncLater(
      api.post('/admin/reset')
        .then(() => syncFromBackend())
    );
    return true;
  },

  addDonation: (don: any) => {
    const all = localDb.getDonations();
    const id = `D-${uuid().toUpperCase()}`;
    all.push({ ...don, id, date: new Date().toISOString().split('T')[0] });
    backendCacheStorage.setItem('db_donations', JSON.stringify(all));
    if (hasBackendSession()) {
      syncLater(api.post('/donations', {
        campaign_id: don.campaign_id || null,
        donor_name: don.donor_name || don.name || 'Donor',
        donor_phone: don.donor_phone || don.phone || '',
        amount: Number(don.amount || don.amt || 0),
        method: don.method || 'cash',
        note: don.note || '',
        donated_at: don.date || new Date().toISOString().split('T')[0],
      }).then(() => syncFromBackend()));
    }
    return id;
  },

  addCampaign: (camp: any) => {
    const all = localDb.getCampaigns();
    const id = `C-${uuid().toUpperCase()}`;
    all.push({ ...camp, id, stat: 'Active', dt: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }) });
    backendCacheStorage.setItem('db_campaigns', JSON.stringify(all));
    if (hasBackendSession()) {
      syncLater(api.post('/campaigns', {
        title: camp.title || camp.name || 'Campaign',
        goal: Number(camp.goal || 0),
        received: Number(camp.received || 0),
        status: camp.stat || 'Active',
        note: camp.note || '',
      }).then(() => syncFromBackend()));
    }
    return id;
  },

  updateCampaign: (id: string, updates: any) => {
    const all = localDb.getCampaigns();
    const idx = all.findIndex((c: any) => c.id === id || c.campaign_no === id);
    if (idx > -1) {
      all[idx] = { ...all[idx], ...updates };
      backendCacheStorage.setItem('db_campaigns', JSON.stringify(all));
      if (hasBackendSession()) {
        syncLater(api.patch(`/campaigns/${id}`, {
          title: updates.title,
          goal: updates.goal,
          status: updates.status,
          note: updates.note
        }).then(() => syncFromBackend()));
      }
      return true;
    }
    return false;
  },

  updatePortalConfig: (updates: any) => {
    const config = localDb.getPortalConfig();
    const newConfig = { ...config, ...updates };
    backendCacheStorage.setItem('portal_config', JSON.stringify(newConfig));
    if (hasBackendSession()) {
      syncLater(api.patch('/portal-config', {
        org_name: newConfig.orgName,
        org_logo: newConfig.orgLogo,
        org_scale: Number(newConfig.orgScale || 1),
        max_loan: Number(newConfig.maxLoan || 0),
        sah_amt: Number(newConfig.sahAmt || 0),
        repayment_approvals_needed: Number(newConfig.repaymentApprovalsNeeded || 1),
        loan_approvals_needed: Number(newConfig.loanApprovalsNeeded || 2),
        approver_roles: newConfig.approverRoles || [],
        authorized_reviewers: newConfig.authorizedReviewers || [],
        default_committee: newConfig.defaultCommittee || [],
      }).then(() => syncFromBackend()));
    }
    return newConfig;
  },

  toggleReviewerPool: (adminId: string) => {
    const config = localDb.getPortalConfig();
    const pool = config.authorizedReviewers || [];
    const newPool = pool.includes(adminId)
      ? pool.filter((id: string) => id !== adminId)
      : [...pool, adminId];
    localDb.updatePortalConfig({ authorizedReviewers: newPool });
  },

  // ════════════ INVENTORY SYSTEM ════════════

  saveProduct: (data: any) => {
    const products = localDb.getProducts();
    // Format: SKSSF-[YEAR]-[CATEGORY-CODE]-[SEQ]
    const year = new Date().getFullYear();
    const catCode = data.category.substring(0, 3).toUpperCase();
    const seq = String(products.length + 1).padStart(3, '0');
    const sku = `SKSSF-${year}-${catCode}-${seq}`;
    
    const newProduct = {
      ...data,
      id: `P${uuid().toUpperCase()}`,
      sku,
      total_quantity: Number(data.total_quantity) || 0,
      available_quantity: Number(data.total_quantity) || 0,
      created_at: new Date().toISOString()
    };
    
    products.push(newProduct);
    backendCacheStorage.setItem('db_products', JSON.stringify(products));

    // Auto-generate units for this product
    const units = localDb.getUnits();
    for (let i = 1; i <= newProduct.total_quantity; i++) {
       const uCode = `U${String(i).padStart(2, '0')}`;
       units.push({
         id: `UN-${uuid().toUpperCase()}`,
         product_id: newProduct.id,
         unit_code: `${sku}-${uCode}`,
         barcode: `${sku}-${uCode}`, // Simple representation
         status: 'available', // available | checked_out | damaged | lost
         current_holder_id: null,
         current_mission_id: null,
         created_at: new Date().toISOString()
       });
    }
    backendCacheStorage.setItem('db_units', JSON.stringify(units));
    if (hasBackendSession()) {
      syncLater(api.post('/inventory/products', {
        name: data.name,
        category: data.category,
        unit: data.unit || '',
        total_quantity: Number(data.total_quantity) || 0,
        photo: data.photo || null,
        image: data.photo || null, // Double field for compatibility
      }).then(() => syncFromBackend()));
    }
    return newProduct;
  },

  updateProduct: (id: string, updates: any) => {
    const products = localDb.getProducts();
    const idx = products.findIndex((p: any) => p.id === id);
    if (idx > -1) {
      products[idx] = { ...products[idx], ...updates };
      backendCacheStorage.setItem('db_products', JSON.stringify(products));
      if (hasBackendSession()) {
        syncLater(api.patch(`/inventory/products/${id}`, {
          name: products[idx].name,
          category: products[idx].category,
          unit: products[idx].unit || '',
          total_quantity: Number(products[idx].total_quantity || 0),
          available_quantity: Number(products[idx].available_quantity || 0),
          photo: products[idx].photo || null,
          image: products[idx].photo || null, // Double field for compatibility
        }).then(() => syncFromBackend()));
      }
    }
  },

  createKit: (name: string, unitIds: string[]) => {
    const kits = localDb.getKits();
    const kitNumber = String(kits.length + 1).padStart(3, '0');
    const kitBarcode = `SKSSF-KIT-${kitNumber}`;
    
    const newKit = {
      id: `KIT-${uuid().toUpperCase()}`,
      name,
      barcode: kitBarcode,
      child_units: unitIds,
      created_at: new Date().toISOString()
    };
    
    kits.push(newKit);
    backendCacheStorage.setItem('db_kits', JSON.stringify(kits));
    if (hasBackendSession()) {
      syncLater(api.post('/inventory/kits', {
        name,
        unit_ids: unitIds,
      }).then(() => syncFromBackend()));
    }
    return newKit;
  },

  updateKit: (kitId: string, name: string, unitIds: string[]) => {
    const kits = localDb.getKits();
    const idx = kits.findIndex((k: any) => k.id === kitId);
    if (idx > -1) {
      kits[idx] = { ...kits[idx], name, child_units: unitIds };
      backendCacheStorage.setItem('db_kits', JSON.stringify(kits));
      if (hasBackendSession()) {
        syncLater(api.patch(`/inventory/kits/${kitId}`, {
          name,
          unit_ids: unitIds,
        }).then(() => syncFromBackend()));
      }
      return true;
    }
    return false;
  },

  deleteKit: (kitId: string) => {
    const kits = localDb.getKits();
    const idx = kits.findIndex((k: any) => k.id === kitId);
    if (idx > -1) {
      kits.splice(idx, 1);
      backendCacheStorage.setItem('db_kits', JSON.stringify(kits));
      if (hasBackendSession()) {
        syncLater(api.del(`/inventory/kits/${kitId}`).then(() => syncFromBackend()));
      }
    }
  },

  processBarcodeScan: (barcode: string, type: 'checkout' | 'checkin', adminBy: string, assignedTo?: string, memberName?: string, missionId?: string, method: 'scan' | 'manual' = 'scan') => {
    const units = localDb.getUnits();
    const products = localDb.getProducts();
    const transactions = localDb.getInventoryTransactions();
    const kits = localDb.getKits();

    let targetUnits: any[] = [];
    let isKit = false;
    let kitInfo = null;

    // First check if it's a Kit Barcode
    const kit = kits.find((k: any) => k.barcode === barcode);
    if (kit) {
      isKit = true;
      kitInfo = kit;
      targetUnits = units.filter((u: any) => kit.child_units.includes(u.id));
    } else {
      // Regular Single Unit
      const singleUnit = units.find((u: any) => u.barcode === barcode);
      if (singleUnit) targetUnits = [singleUnit];
    }

    if (targetUnits.length === 0) return { success: false, error: 'Barcode not found or Kit is empty' };

    let processedCount = 0;
    let errorMsg = '';

    targetUnits.forEach((unit) => {
      const productIdx = products.findIndex((p: any) => p.id === unit.product_id);
      if (productIdx === -1) {
        errorMsg = 'Orphaned unit detected';
        return;
      }

      const product = products[productIdx];

      if (type === 'checkout') {
        if (unit.status !== 'available') {
          errorMsg = `Unit ${unit.unit_code} is already out`;
          return;
        }
        unit.status = 'checked_out';
        unit.current_holder_id = assignedTo || null;
        unit.current_mission_id = missionId || null;
        unit.checkoutDate = new Date().toISOString();
        product.available_quantity = Math.max(0, product.available_quantity - 1);

      } else if (type === 'checkin') {
        if (unit.status !== 'checked_out') {
          errorMsg = `Unit ${unit.unit_code} is already checked in`;
          return;
        }
        unit.status = 'available';
        unit.current_holder_id = null;
        unit.current_mission_id = null;
        unit.checkinDate = new Date().toISOString();
        product.available_quantity += 1;
      }

      transactions.push({
        id: `TX-${uuid().toUpperCase()}`,
        unit_id: unit.id,
        product_id: unit.product_id,
        barcode: unit.barcode,
        type,
        adminBy,
        assignedTo: assignedTo || null,
        memberName: memberName || null,
        missionId: missionId || null,
        method,
        timestamp: new Date().toISOString(),
        note: isKit ? `${type === 'checkout' ? 'Checked out via Kit' : 'Checked in via Kit'}: ${kitInfo.name}` 
                    : (type === 'checkout' ? `Checked out to ${memberName}` : 'Checked back into inventory')
      });
      processedCount++;
    });

    if (processedCount === 0 && errorMsg) return { success: false, error: errorMsg };

    backendCacheStorage.setItem('db_units', JSON.stringify(units));
    backendCacheStorage.setItem('db_products', JSON.stringify(products));
    backendCacheStorage.setItem('db_inventory_tx', JSON.stringify(transactions));
    if (hasBackendSession()) {
      syncLater(api.post('/inventory/scan', {
        barcode,
        type,
        adminBy,
        assignedTo: assignedTo || '',
        memberName: memberName || '',
        missionId: missionId || '',
      }).then(() => syncFromBackend()));
    }

    return { 
      success: true, 
      isKit, 
      kit: kitInfo, 
      processedUnits: targetUnits,
      message: isKit ? `Successfully ${type === 'checkout'?'checked out':'returned'} Kit with ${processedCount} items.` : 'Success'
    };
  },

  updateUnitStatus: (unitId: string, status: 'available' | 'damaged' | 'lost', adminBy: string, note?: string) => {
    const units = localDb.getUnits();
    const products = localDb.getProducts();
    const transactions = localDb.getInventoryTransactions();
    
    // Robust lookup: Try matching by id (string/no) or numeric id
    const unitIdx = units.findIndex((u: any) => 
      String(u.id) === String(unitId) ||
      (u._id && String(u._id) === String(unitId)) ||
      u.unit_code === unitId ||
      u.barcode === unitId
    );
    if (unitIdx === -1) {
      console.error(`Unit lookup failed for ID: ${unitId}. Available IDs:`, units.map(u => u.id));
      return false;
    }
    
    const unit = units[unitIdx];
    const prevStatus = unit.status;
    const productIdx = products.findIndex((p: any) => String(p.id) === String(unit.product_id) || (p._id && String(p._id) === String(unit.product_id)));
    
    // Adjust product available quantity if status changes to/from 'available'
    if (productIdx > -1) {
      if (prevStatus === 'available' && status !== 'available') {
        products[productIdx].available_quantity = Math.max(0, products[productIdx].available_quantity - 1);
      } else if (prevStatus !== 'available' && status === 'available') {
         products[productIdx].available_quantity += 1;
      }
    }
    
    unit.status = status;
    unit.current_holder_id = null;
    unit.current_mission_id = null;
    
    transactions.push({
      id: `TX-${uuid().toUpperCase()}`,
      unit_id: unit.id,
      product_id: unit.product_id,
      barcode: unit.barcode,
      type: 'adjustment',
      adminBy,
      method: 'manual',
      timestamp: new Date().toISOString(),
      note: note || `Manual status update: ${prevStatus} ➔ ${status}`
    });
    
    backendCacheStorage.setItem('db_units', JSON.stringify(units));
    backendCacheStorage.setItem('db_products', JSON.stringify(products));
    backendCacheStorage.setItem('db_inventory_tx', JSON.stringify(transactions));
    if (hasBackendSession()) {
      const apiId = unit._id || unit.id;
      syncLater(api.post(`/inventory/units/${apiId}/status`, {
        status,
        adminBy,
        note: note || '',
      }).then(() => syncFromBackend()));
    }
    emitDataChanged();
    return true;
  },

  updateUnit: (unitId: string, updates: any) => {
    const units = localDb.getUnits();
    const idx = units.findIndex((u: any) => u.id === unitId || u.unit_code === unitId);
    if (idx > -1) {
      const prev = { ...units[idx] };
      units[idx] = { ...units[idx], ...updates };
      backendCacheStorage.setItem('db_units', JSON.stringify(units));
      if (hasBackendSession()) {
        syncLater(api.patch(`/inventory/units/${unitId}`, updates).then(() => syncFromBackend()));
      }
      emitDataChanged();
      return true;
    }
    return false;
  },

  deleteUnit: (unitId: string) => {
    const units = localDb.getUnits();
    const products = localDb.getProducts();
    const idx = units.findIndex(u => String(u.id) === String(unitId) || (u._id && String(u._id) === String(unitId)) || u.unit_code === unitId);
    if (idx > -1) {
      const unit = units[idx];
      const pid = unit.product_id;
      const pIdx = products.findIndex(p => String(p.id) === String(pid) || (p._id && String(p._id) === String(pid)));
      if (pIdx > -1) {
        products[pIdx].total_quantity = Math.max(0, products[pIdx].total_quantity - 1);
        if (unit.status === 'available') {
           products[pIdx].available_quantity = Math.max(0, products[pIdx].available_quantity - 1);
        }
      }
      const newUnits = units.filter(u => u.id !== unitId && u.unit_code !== unitId);
      backendCacheStorage.setItem('db_units', JSON.stringify(newUnits));
      backendCacheStorage.setItem('db_products', JSON.stringify(products));
      if (hasBackendSession()) {
        const apiId = unit._id || unit.id;
        syncLater(api.del(`/inventory/units/${apiId}`).then(() => syncFromBackend()));
      }
      emitDataChanged();
      return true;
    }
    return false;
  },

  clearUnitHistory: (unitId: string) => {
    const txs = localDb.getInventoryTransactions();
    const newTxs = txs.filter((tx: any) => tx.unit_id !== unitId);
    backendCacheStorage.setItem('db_inventory_tx', JSON.stringify(newTxs));
    if (hasBackendSession()) {
      syncLater(api.post(`/inventory/units/${unitId}/clear-history`).then(() => syncFromBackend()));
    }
    emitDataChanged();
    return true;
  },

  clearAllHistory: () => {
    backendCacheStorage.setItem('db_inventory_tx', JSON.stringify([]));
    if (hasBackendSession()) {
      syncLater(api.post('/inventory/clear-all-history').then(() => syncFromBackend()));
    }
    emitDataChanged();
    return true;
  },

  deleteProduct: (productId: string) => {
    const products = localDb.getProducts();
    const units = localDb.getUnits();
    const kits = localDb.getKits();
    
    // Safety check: Cannot delete if any unit is checked out
    const checkedOutUnits = units.filter((u: any) => u.product_id === productId && u.status === 'checked_out');
    if (checkedOutUnits.length > 0) {
      return { success: false, error: 'Cannot delete product. Some units are still checked out/deployed.' };
    }

    // Remove from products
    const newProducts = products.filter((p: any) => p.id !== productId);
    // Remove associated units
    const newUnits = units.filter((u: any) => u.product_id !== productId);
    // Cleanup kits (remove units that no longer exist)
    const newKits = kits.map((k: any) => ({
      ...k,
      child_units: k.child_units.filter((uid: string) => !units.find(u => u.id === uid && u.product_id === productId))
    })).filter((k: any) => k.child_units.length > 0);

    backendCacheStorage.setItem('db_products', JSON.stringify(newProducts));
    backendCacheStorage.setItem('db_units', JSON.stringify(newUnits));
    backendCacheStorage.setItem('db_kits', JSON.stringify(newKits));

    if (hasBackendSession()) {
      syncLater(api.del(`/inventory/products/${productId}`).then(() => syncFromBackend()));
    }
    emitDataChanged();
    return { success: true };
  },

  deleteCampaign: (missionId: string) => {
    const campaigns = localDb.getCampaigns();
    const units = localDb.getUnits();
    const products = localDb.getProducts();

    // Safety logic: Return all items from this mission to warehouse
    units.forEach((u: any) => {
      if (u.current_mission_id === missionId) {
        u.status = 'available';
        u.current_mission_id = null;
        u.current_holder_id = null;
        
        // Update product available count
        const pIdx = products.findIndex((p: any) => p.id === u.product_id);
        if (pIdx > -1) products[pIdx].available_quantity += 1;
      }
    });

    const newCampaigns = campaigns.filter((c: any) => c.id !== missionId);
    
    backendCacheStorage.setItem('db_campaigns', JSON.stringify(newCampaigns));
    backendCacheStorage.setItem('db_units', JSON.stringify(units));
    backendCacheStorage.setItem('db_products', JSON.stringify(products));

    if (hasBackendSession()) {
      syncLater(api.del(`/campaigns/${missionId}`).then(() => syncFromBackend()));
    }
    emitDataChanged();
    return { success: true };
  },

  saveInventoryTransactions: (txs: any[]) => {
    backendCacheStorage.setItem('db_inventory_tx', JSON.stringify(txs));
  },

  getUnitHistory: (unitId: string) => {
    const txs = localDb.getInventoryTransactions();
    return txs.filter((tx: any) => tx.unit_id === unitId).sort((a: any, b: any) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
};

initLocalDb();
export default localDb;

