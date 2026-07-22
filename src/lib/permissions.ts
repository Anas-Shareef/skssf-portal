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
  'admins.view': true,
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
