export type PermissionItem = {
  key: string;
  label: string;
  superOnly?: boolean;
};

export type PermissionModule = {
  name: string;
  icon: string;
  items: PermissionItem[];
};

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    name: 'Inventory',
    icon: '📦',
    items: [
      { key: 'inventory.view', label: 'View Inventory' },
      { key: 'inventory.stock.update', label: 'Update Stock Levels' }
    ]
  },
  {
    name: 'Catalogue',
    icon: '📂',
    items: [
      { key: 'catalogue.view', label: 'View Catalogue' },
      { key: 'catalogue.create', label: 'Create Catalog Product' },
      { key: 'catalogue.edit', label: 'Edit Catalog Product' },
      { key: 'catalogue.delete', label: 'Delete Catalog Product' }
    ]
  },
  {
    name: 'Barcode',
    icon: '🏷️',
    items: [
      { key: 'barcode.view', label: 'View Barcode Area' },
      { key: 'barcode.generate', label: 'Generate Barcode' },
      { key: 'barcode.print', label: 'Print Barcode' },
      { key: 'barcode.download', label: 'Download Barcode' }
    ]
  },
  {
    name: 'Scanner',
    icon: '📷',
    items: [
      { key: 'scanner.use', label: 'Use Camera Scanner' },
      { key: 'scanner.lookup', label: 'Quick Scan Lookup' }
    ]
  },
  {
    name: 'Checkout',
    icon: '📤',
    items: [
      { key: 'checkout.view', label: 'View Checkout Ledger' },
      { key: 'checkout.create', label: 'Create Checkout (Lease)' },
      { key: 'checkout.return', label: 'Check-In / Return' },
      { key: 'checkout.cancel', label: 'Cancel Checkout' },
      { key: 'checkout.force_return', label: 'Force Return (Override)' }
    ]
  },
  {
    name: 'Missions',
    icon: '🎯',
    items: [
      { key: 'missions.view', label: 'View Missions' },
      { key: 'missions.create', label: 'Create Mission' },
      { key: 'missions.assign', label: 'Assign Items to Mission' },
      { key: 'missions.complete', label: 'Complete Mission' }
    ]
  },
  {
    name: 'Reports',
    icon: '📊',
    items: [
      { key: 'reports.view', label: 'View Reports' },
      { key: 'reports.export', label: 'Export Reports' }
    ]
  },
  {
    name: 'Loan & Repayment Governance',
    icon: '⚖️',
    items: [
      { key: 'loans.view', label: 'View Loan Applications' },
      { key: 'loans.review', label: 'Review Loan Applications (Verify / Recommend)' },
      { key: 'loans.approve', label: 'Final Loan Approval (Approve / Reject / Set Amount)' },
      { key: 'repayments.view', label: 'View Repayments & Ledger' },
      { key: 'repayments.review', label: 'Review Member Repayment Submissions' },
      { key: 'repayments.verify', label: 'Verify Repayments & Update Balance' }
    ]
  },
  {
    name: 'Settings',
    icon: '⚙️',
    items: [
      { key: 'settings.view', label: 'View Settings', superOnly: true },
      { key: 'settings.edit', label: 'Edit Settings', superOnly: true }
    ]
  },
  {
    name: 'User Management',
    icon: '👥',
    items: [
      { key: 'members.view', label: 'View Members' },
      { key: 'members.create', label: 'Create Member' },
      { key: 'members.edit', label: 'Edit Member' },
      { key: 'members.delete', label: 'Delete Member' },
      { key: 'admins.view', label: 'View Admins' },
      { key: 'admins.create', label: 'Create Admin' },
      { key: 'admins.edit', label: 'Edit Admin' },
      { key: 'admins.delete', label: 'Delete Admin' }
    ]
  },
  {
    name: 'Permission Management',
    icon: '🛡️',
    items: [
      { key: 'permissions.view', label: 'View Permissions', superOnly: true },
      { key: 'permissions.assign', label: 'Assign Permissions', superOnly: true },
      { key: 'permissions.edit', label: 'Edit Permissions', superOnly: true }
    ]
  },
  {
    name: 'Audit Logs',
    icon: '📋',
    items: [
      { key: 'audit.view', label: 'View Audit Logs', superOnly: true }
    ]
  }
];

export const DEFAULT_ADMIN_PERMISSIONS: Record<string, boolean> = {
  'inventory.view': true,
  'inventory.stock.update': true,
  'catalogue.view': true,
  'catalogue.create': true,
  'catalogue.edit': true,
  'catalogue.delete': true,
  'barcode.view': true,
  'barcode.generate': true,
  'barcode.print': true,
  'barcode.download': true,
  'scanner.use': true,
  'scanner.lookup': true,
  'checkout.view': true,
  'checkout.create': true,
  'checkout.return': true,
  'checkout.cancel': true,
  'checkout.force_return': true,
  'missions.view': true,
  'missions.create': true,
  'missions.assign': true,
  'missions.complete': true,
  'reports.view': true,
  'reports.export': true,
  'members.view': true,
  'members.create': true,
  'members.edit': true,
  'members.delete': true,
  'admins.view': false,
  'admins.create': false,
  'admins.edit': false,
  'admins.delete': false
};

export const DEFAULT_MEMBER_PERMISSIONS: Record<string, boolean> = {
  'inventory.view': true,
  'scanner.use': true,
  'checkout.view': true,
  'checkout.create': true,
  'checkout.return': true
};

// ─── Loan & repayment governance ────────────────────────────────────────────
// The DB columns (`profiles.can_review_loans`, …) are the long-term source of
// truth, but the migration may not have been applied yet. The `perms` JSON is
// always present, so it is the working source and the boolean columns are read
// when they exist.

export const GOVERNANCE_COLUMN_KEYS = {
  can_review_loans: 'loans.review',
  can_approve_loans: 'loans.approve',
  can_review_repayments: 'repayments.review',
  can_verify_repayments: 'repayments.verify'
} as const;

export type GovernanceColumn = keyof typeof GOVERNANCE_COLUMN_KEYS;

const explicitPerm = (profile: any, key: string): boolean | null => {
  const perms = profile?.perms;
  if (!perms || typeof perms !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(perms, key)) return null;
  return perms[key] === true;
};

const resolveGovernance = (
  profile: any,
  column: GovernanceColumn,
  legacyValue?: boolean
): boolean => {
  if (profile?.role === 'super') return true;
  const key = GOVERNANCE_COLUMN_KEYS[column];
  const fromPerms = explicitPerm(profile, key);
  if (fromPerms !== null) return fromPerms;
  const fromColumn = profile?.[column];
  if (typeof fromColumn === 'boolean') return fromColumn;
  return legacyValue === true;
};

export type LoanPermissions = {
  isSuper: boolean;
  canView: boolean;
  canReview: boolean;
  canApprove: boolean;
  /** True when the user may open the review drawer at all. */
  canAct: boolean;
};

/**
 * Effective loan permissions for the signed-in profile.
 *
 * Precedence: super admin → explicit `perms` entry → new boolean column →
 * legacy `is_approver` (approval only, so existing approvers are never locked
 * out before the migration lands).
 */
export const effectiveLoanPermissions = (profile: any): LoanPermissions => {
  const isSuper = profile?.role === 'super';
  const canApprove = resolveGovernance(profile, 'can_approve_loans', profile?.is_approver === true);
  const canReview = resolveGovernance(profile, 'can_review_loans', false);
  const explicitView = explicitPerm(profile, 'loans.view');
  const canView = isSuper || explicitView === true || canReview || canApprove;
  return { isSuper, canView, canReview, canApprove, canAct: isSuper || canReview || canApprove };
};

export type RepaymentPermissions = {
  isSuper: boolean;
  canView: boolean;
  canReview: boolean;
  canVerify: boolean;
};

/**
 * Effective repayment permissions. `can_verify_repayments` is the only key that
 * authorises a ledger mutation; `can_review_repayments` is read-only review.
 */
export const effectiveRepaymentPermissions = (profile: any): RepaymentPermissions => {
  const isSuper = profile?.role === 'super';
  const canVerify = resolveGovernance(profile, 'can_verify_repayments', profile?.is_approver === true);
  const canReview = resolveGovernance(profile, 'can_review_repayments', false);
  const explicitView = explicitPerm(profile, 'repayments.view');
  const canView = isSuper || explicitView === true || canReview || canVerify;
  return { isSuper, canView, canReview, canVerify };
};

/** Build the `perms` patch for a governance column change. */
export const governancePermsPatch = (
  column: GovernanceColumn,
  enabled: boolean
): Record<string, boolean> => ({ [GOVERNANCE_COLUMN_KEYS[column]]: enabled });
