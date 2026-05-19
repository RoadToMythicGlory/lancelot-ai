// Canonical permission catalog. Mirrored at apps/web/src/rbac/permissions.ts — keep in sync.

export enum Permission {
  // Users
  USERS_VIEW = 'USERS_VIEW',
  USERS_MANAGE_DEPT = 'USERS_MANAGE_DEPT',
  USERS_MANAGE_ALL = 'USERS_MANAGE_ALL',

  // Broadcast
  BROADCAST_VIEW = 'BROADCAST_VIEW',
  BROADCAST_MANAGE = 'BROADCAST_MANAGE',
  BROADCAST_DELETE = 'BROADCAST_DELETE',

  // Broadcast Array (Excel-grid crew assignments per event)
  BROADCAST_ARRAY_VIEW = 'BROADCAST_ARRAY_VIEW',
  BROADCAST_ARRAY_MANAGE = 'BROADCAST_ARRAY_MANAGE',

  // Venues / Stadiums (used by External Broadcasts)
  VENUES_VIEW = 'VENUES_VIEW',
  VENUES_MANAGE = 'VENUES_MANAGE',

  // Warehouse / Equipment
  WAREHOUSE_VIEW = 'WAREHOUSE_VIEW',
  WAREHOUSE_MANAGE = 'WAREHOUSE_MANAGE',
  WAREHOUSE_FORCE_RELEASE = 'WAREHOUSE_FORCE_RELEASE',
  WAREHOUSE_DISABLE_EQUIPMENT = 'WAREHOUSE_DISABLE_EQUIPMENT',

  // Shifts
  SHIFTS_VIEW_OWN = 'SHIFTS_VIEW_OWN',
  SHIFTS_VIEW_ALL = 'SHIFTS_VIEW_ALL',
  SHIFTS_MANAGE = 'SHIFTS_MANAGE',

  // MCR
  MCR_VIEW = 'MCR_VIEW',
  MCR_MANAGE = 'MCR_MANAGE',
  MCR_ADMIN = 'MCR_ADMIN',

  // Flight Board (live operations dashboards)
  FLIGHT_BOARD_VIEW = 'FLIGHT_BOARD_VIEW',
  FLIGHT_BOARD_MANAGE = 'FLIGHT_BOARD_MANAGE',

  // MCR Flight Board (specialised flight board variant for MCR Schedule rows)
  MCR_FLIGHT_BOARD_VIEW = 'MCR_FLIGHT_BOARD_VIEW',
  MCR_FLIGHT_BOARD_MANAGE = 'MCR_FLIGHT_BOARD_MANAGE',

  // Vizrt
  VIZRT_VIEW = 'VIZRT_VIEW',
  VIZRT_OPERATE = 'VIZRT_OPERATE',
  VIZRT_ADMIN = 'VIZRT_ADMIN',

  // Site / Audit / Settings
  AUDIT_VIEW = 'AUDIT_VIEW',
  AUDIT_EXPORT = 'AUDIT_EXPORT',
  SETTINGS_VIEW = 'SETTINGS_VIEW',
  SETTINGS_MANAGE = 'SETTINGS_MANAGE',

  // Internal IT support
  IT_SUPPORT_VIEW = 'IT_SUPPORT_VIEW',
  IT_SUPPORT_MANAGE = 'IT_SUPPORT_MANAGE',

  // Admin
  ROLE_TEMPLATES_MANAGE = 'ROLE_TEMPLATES_MANAGE',
  USERS_DELETE = 'USERS_DELETE',

  // Misc
  DASHBOARD_VIEW = 'DASHBOARD_VIEW',
  DASHBOARD_MANAGE = 'DASHBOARD_MANAGE',
  // Bulletin board (real publishing flow on the dashboard)
  BULLETIN_VIEW = 'BULLETIN_VIEW',
  BULLETIN_MANAGE = 'BULLETIN_MANAGE',
  CHAT_USE = 'CHAT_USE',
  INTEGRATIONS_VIEW = 'INTEGRATIONS_VIEW',
  INTEGRATIONS_MANAGE = 'INTEGRATIONS_MANAGE',
  MEDIA_VIEW = 'MEDIA_VIEW',
  MEDIA_MANAGE = 'MEDIA_MANAGE',
  RIGHTS_VIEW = 'RIGHTS_VIEW',
  RIGHTS_MANAGE = 'RIGHTS_MANAGE',
  WORKFLOWS_VIEW = 'WORKFLOWS_VIEW',
  WORKFLOWS_MANAGE = 'WORKFLOWS_MANAGE',
}

const ALL_PERMISSIONS = new Set(Object.values(Permission));

export function isValidPermission(value: string): value is Permission {
  return ALL_PERMISSIONS.has(value as Permission);
}

/** Map legacy permission strings (stored in DB) to canonical Permission values. */
export const LEGACY_PERMISSION_MAP: Record<string, Permission> = {
  'shift_admin': Permission.SHIFTS_MANAGE,
  'VIZRT_READ': Permission.VIZRT_VIEW,
  'VIZRT_TRIGGER': Permission.VIZRT_OPERATE,
  'VIZRT_ADMIN': Permission.VIZRT_ADMIN,
  'broadcast_planner': Permission.BROADCAST_MANAGE,
  'broadcast_coordinator': Permission.BROADCAST_MANAGE,
  // Legacy SaaS/org permissions kept as no-ops so old tokens don't crash decoding;
  // they map to harmless settings-view as an inert fallback.
  'BILLING_VIEW': Permission.SETTINGS_VIEW,
  'BILLING_MANAGE': Permission.SETTINGS_MANAGE,
  'ORG_VIEW': Permission.SETTINGS_VIEW,
  'ORG_MANAGE': Permission.SETTINGS_MANAGE,
};

export type SystemRole = 'SYSTEM_ADMIN' | 'IT_ADMIN' | 'IT_USER' | 'DEPARTMENT_ADMIN' | 'DEPARTMENT_USER';

export const SYSTEM_ROLES: readonly SystemRole[] = [
  'SYSTEM_ADMIN',
  'IT_ADMIN',
  'IT_USER',
  'DEPARTMENT_ADMIN',
  'DEPARTMENT_USER',
] as const;

export function isValidSystemRole(value: string): value is SystemRole {
  return (SYSTEM_ROLES as readonly string[]).includes(value);
}
