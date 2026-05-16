// Role-to-permission matrices and computation logic.
// Mirror of services/api-gateway/src/rbac/matrix.ts — keep in sync.

import {
  Permission,
  type SystemRole,
  isValidPermission,
  isValidSystemRole,
  LEGACY_PERMISSION_MAP,
} from './permissions';

// ---------------------------------------------------------------------------
// SystemRole -> global permissions
// ---------------------------------------------------------------------------

const ALL_PERMS = Object.values(Permission);

const SYSTEM_ADMIN_PERMS: Permission[] = ALL_PERMS;

const IT_ADMIN_PERMS: Permission[] = ALL_PERMS.filter(
  (p) => p !== Permission.ORG_MANAGE && p !== Permission.ROLE_TEMPLATES_MANAGE,
);

const IT_USER_PERMS: Permission[] = [
  Permission.DASHBOARD_VIEW,
  Permission.USERS_VIEW,
  Permission.BROADCAST_VIEW,
  Permission.WAREHOUSE_VIEW,
  Permission.SHIFTS_VIEW_OWN,
  Permission.SHIFTS_VIEW_ALL,
  Permission.MCR_VIEW,
  Permission.VIZRT_VIEW,
  Permission.BILLING_VIEW,
  Permission.AUDIT_VIEW,
  Permission.CHAT_USE,
  Permission.MEDIA_VIEW,
  Permission.RIGHTS_VIEW,
  Permission.WORKFLOWS_VIEW,
  Permission.SETTINGS_VIEW,
  Permission.SETTINGS_MANAGE,
  Permission.INTEGRATIONS_VIEW,
  Permission.INTEGRATIONS_MANAGE,
  Permission.ORG_VIEW,
  Permission.FLIGHT_BOARD_VIEW,
];

const DEPARTMENT_ADMIN_PERMS: Permission[] = [
  Permission.DASHBOARD_VIEW,
  Permission.DASHBOARD_MANAGE,
  Permission.USERS_VIEW,
  Permission.USERS_MANAGE_DEPT,
  Permission.BROADCAST_VIEW,
  Permission.BROADCAST_MANAGE,
  Permission.WAREHOUSE_VIEW,
  Permission.WAREHOUSE_MANAGE,
  Permission.SHIFTS_VIEW_OWN,
  Permission.SHIFTS_VIEW_ALL,
  Permission.SHIFTS_MANAGE,
  Permission.MCR_VIEW,
  Permission.MCR_MANAGE,
  Permission.VIZRT_VIEW,
  Permission.CHAT_USE,
  Permission.MEDIA_VIEW,
  Permission.RIGHTS_VIEW,
  Permission.WORKFLOWS_VIEW,
  Permission.SETTINGS_VIEW,
  Permission.INTEGRATIONS_VIEW,
  Permission.FLIGHT_BOARD_VIEW,
  Permission.FLIGHT_BOARD_MANAGE,
];

const DEPARTMENT_USER_PERMS: Permission[] = [
  Permission.DASHBOARD_VIEW,
  Permission.USERS_VIEW,
  Permission.BROADCAST_VIEW,
  Permission.WAREHOUSE_VIEW,
  Permission.SHIFTS_VIEW_OWN,
  Permission.MCR_VIEW,
  Permission.VIZRT_VIEW,
  Permission.CHAT_USE,
  Permission.MEDIA_VIEW,
  Permission.RIGHTS_VIEW,
  Permission.WORKFLOWS_VIEW,
  Permission.FLIGHT_BOARD_VIEW,
];

const ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  SYSTEM_ADMIN: SYSTEM_ADMIN_PERMS,
  IT_ADMIN: IT_ADMIN_PERMS,
  IT_USER: IT_USER_PERMS,
  DEPARTMENT_ADMIN: DEPARTMENT_ADMIN_PERMS,
  DEPARTMENT_USER: DEPARTMENT_USER_PERMS,
};

// ---------------------------------------------------------------------------
// Department-role strings -> extra permissions (additive per-department)
// ---------------------------------------------------------------------------

const DEPT_ROLE_EXTRAS: Record<string, Permission[]> = {
  'Department Admin': [
    Permission.USERS_MANAGE_DEPT,
    Permission.SHIFTS_MANAGE,
    Permission.BROADCAST_MANAGE,
    Permission.WAREHOUSE_MANAGE,
    Permission.MCR_MANAGE,
  ],
  'MCR Supervisor': [Permission.MCR_MANAGE, Permission.MCR_ADMIN],
  'MCR Operator': [Permission.MCR_MANAGE],
  'Senior Playout Operator': [Permission.MCR_MANAGE],
  'Senior Ingest Operator': [Permission.MCR_MANAGE],
  'Warehouse Manager': [
    Permission.WAREHOUSE_MANAGE,
    Permission.WAREHOUSE_FORCE_RELEASE,
    Permission.WAREHOUSE_DISABLE_EQUIPMENT,
  ],
};

// ---------------------------------------------------------------------------
// Computed permission result
// ---------------------------------------------------------------------------

export interface ComputedPermissions {
  global: Set<Permission>;
  byDept: Map<string, Set<Permission>>;
}

export interface UserForPermissions {
  systemRole?: string;
  departments?: Array<{
    departmentId: string;
    departmentName?: string;
    roles?: string[];
  }>;
  permissions?: string[];
}

export function computePermissions(user: UserForPermissions): ComputedPermissions {
  const global = new Set<Permission>();
  const byDept = new Map<string, Set<Permission>>();

  const role = (user.systemRole ?? 'DEPARTMENT_USER') as SystemRole;
  const effectiveRole = isValidSystemRole(role) ? role : 'DEPARTMENT_USER';
  for (const p of ROLE_PERMISSIONS[effectiveRole]) {
    global.add(p);
  }

  if (Array.isArray(user.departments)) {
    for (const dept of user.departments) {
      if (!dept.departmentId) continue;
      const deptPerms = new Set<Permission>();
      if (Array.isArray(dept.roles)) {
        for (const roleName of dept.roles) {
          const extras = DEPT_ROLE_EXTRAS[roleName];
          if (extras) {
            for (const p of extras) {
              deptPerms.add(p);
            }
          }
        }
      }
      if (deptPerms.size > 0) {
        byDept.set(dept.departmentId, deptPerms);
      }
    }
  }

  if (Array.isArray(user.permissions)) {
    for (const raw of user.permissions) {
      if (isValidPermission(raw)) {
        global.add(raw);
      } else if (LEGACY_PERMISSION_MAP[raw]) {
        global.add(LEGACY_PERMISSION_MAP[raw]);
      }
    }
  }

  return { global, byDept };
}

export function hasPermission(
  computed: ComputedPermissions,
  perm: Permission,
): boolean {
  return computed.global.has(perm);
}

export function hasPermissionForDept(
  computed: ComputedPermissions,
  perm: Permission,
  deptId: string,
): boolean {
  if (computed.global.has(perm)) return true;
  return computed.byDept.get(deptId)?.has(perm) ?? false;
}
