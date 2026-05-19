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
// Permission implications
// ---------------------------------------------------------------------------
// Mirror of services/api-gateway/src/rbac/matrix.ts — keep in sync.
// See that file for the rationale.

const PERMISSION_IMPLIES: Partial<Record<Permission, Permission[]>> = {
  [Permission.BROADCAST_VIEW]: [
    Permission.BROADCAST_ARRAY_VIEW,
    Permission.VENUES_VIEW,
  ],
  [Permission.BROADCAST_MANAGE]: [
    Permission.BROADCAST_VIEW,
    Permission.BROADCAST_ARRAY_MANAGE,
    Permission.VENUES_MANAGE,
  ],
  [Permission.BROADCAST_ARRAY_MANAGE]: [Permission.BROADCAST_ARRAY_VIEW],
  [Permission.VENUES_MANAGE]: [Permission.VENUES_VIEW],

  [Permission.DASHBOARD_VIEW]: [Permission.BULLETIN_VIEW],
  [Permission.DASHBOARD_MANAGE]: [
    Permission.DASHBOARD_VIEW,
    Permission.BULLETIN_MANAGE,
  ],
  [Permission.BULLETIN_MANAGE]: [Permission.BULLETIN_VIEW],

  [Permission.FLIGHT_BOARD_VIEW]: [Permission.MCR_FLIGHT_BOARD_VIEW],
  [Permission.FLIGHT_BOARD_MANAGE]: [
    Permission.FLIGHT_BOARD_VIEW,
    Permission.MCR_FLIGHT_BOARD_MANAGE,
  ],
  [Permission.MCR_FLIGHT_BOARD_MANAGE]: [Permission.MCR_FLIGHT_BOARD_VIEW],

  [Permission.WAREHOUSE_MANAGE]: [Permission.WAREHOUSE_VIEW],
  [Permission.SHIFTS_MANAGE]: [Permission.SHIFTS_VIEW_ALL, Permission.SHIFTS_VIEW_OWN],
  [Permission.SHIFTS_VIEW_ALL]: [Permission.SHIFTS_VIEW_OWN],
  [Permission.MCR_MANAGE]: [Permission.MCR_VIEW],
  [Permission.MCR_ADMIN]: [Permission.MCR_MANAGE, Permission.MCR_VIEW],
  [Permission.VIZRT_OPERATE]: [Permission.VIZRT_VIEW],
  [Permission.VIZRT_ADMIN]: [Permission.VIZRT_OPERATE, Permission.VIZRT_VIEW],
  [Permission.SETTINGS_MANAGE]: [Permission.SETTINGS_VIEW],
  [Permission.INTEGRATIONS_MANAGE]: [Permission.INTEGRATIONS_VIEW],
  [Permission.MEDIA_MANAGE]: [Permission.MEDIA_VIEW],
  [Permission.RIGHTS_MANAGE]: [Permission.RIGHTS_VIEW],
  [Permission.WORKFLOWS_MANAGE]: [Permission.WORKFLOWS_VIEW],
  [Permission.IT_SUPPORT_MANAGE]: [Permission.IT_SUPPORT_VIEW],
  [Permission.USERS_MANAGE_ALL]: [Permission.USERS_MANAGE_DEPT, Permission.USERS_VIEW],
  [Permission.USERS_MANAGE_DEPT]: [Permission.USERS_VIEW],
};

function expandImplications(perms: Set<Permission>): void {
  const stack: Permission[] = Array.from(perms);
  while (stack.length > 0) {
    const p = stack.pop()!;
    const implied = PERMISSION_IMPLIES[p];
    if (!implied) continue;
    for (const child of implied) {
      if (!perms.has(child)) {
        perms.add(child);
        stack.push(child);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// SystemRole -> global permissions
// ---------------------------------------------------------------------------

const ALL_PERMS = Object.values(Permission);

const SYSTEM_ADMIN_PERMS: Permission[] = ALL_PERMS;

const IT_ADMIN_PERMS: Permission[] = ALL_PERMS.filter(
  (p) => p !== Permission.ROLE_TEMPLATES_MANAGE,
);

const IT_USER_PERMS: Permission[] = [
  Permission.DASHBOARD_VIEW,
  Permission.SHIFTS_VIEW_OWN,
  Permission.CHAT_USE,
  Permission.IT_SUPPORT_VIEW,
];

const DEPARTMENT_ADMIN_PERMS: Permission[] = [
  Permission.DASHBOARD_VIEW,
  Permission.USERS_VIEW,
  Permission.USERS_MANAGE_DEPT,
  Permission.SHIFTS_VIEW_OWN,
  Permission.SHIFTS_VIEW_ALL,
  Permission.SHIFTS_MANAGE,
  Permission.CHAT_USE,
];

const DEPARTMENT_USER_PERMS: Permission[] = [
  Permission.DASHBOARD_VIEW,
  Permission.SHIFTS_VIEW_OWN,
  Permission.CHAT_USE,
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

/**
 * Legacy hardcoded fallback. Admin-managed departments populate the runtime
 * registry via setDepartmentRoleRegistry().
 */
const DEPT_ROLE_EXTRAS: Record<string, Permission[]> = {
  'Department Admin': [
    Permission.USERS_VIEW,
    Permission.USERS_MANAGE_DEPT,
    Permission.SHIFTS_VIEW_OWN,
    Permission.SHIFTS_VIEW_ALL,
    Permission.SHIFTS_MANAGE,
  ],
  'MCR Supervisor': [
    Permission.MCR_VIEW,
    Permission.MCR_MANAGE,
    Permission.MCR_ADMIN,
    Permission.BROADCAST_VIEW,
    Permission.BROADCAST_MANAGE,
    Permission.WAREHOUSE_VIEW,
    Permission.SHIFTS_VIEW_OWN,
    Permission.SHIFTS_VIEW_ALL,
    Permission.SHIFTS_MANAGE,
  ],
  'MCR Operator': [
    Permission.MCR_VIEW,
    Permission.MCR_MANAGE,
    Permission.BROADCAST_VIEW,
    Permission.WAREHOUSE_VIEW,
    Permission.SHIFTS_VIEW_OWN,
  ],
  'Senior Playout Operator': [Permission.MCR_VIEW, Permission.MCR_MANAGE],
  'Senior Ingest Operator': [Permission.MCR_VIEW, Permission.MCR_MANAGE],
  'Warehouse Manager': [
    Permission.WAREHOUSE_VIEW,
    Permission.WAREHOUSE_MANAGE,
    Permission.WAREHOUSE_FORCE_RELEASE,
    Permission.WAREHOUSE_DISABLE_EQUIPMENT,
    Permission.BROADCAST_VIEW,
    Permission.SHIFTS_VIEW_OWN,
  ],
  'Equipment Handler': [
    Permission.WAREHOUSE_VIEW,
    Permission.BROADCAST_VIEW,
    Permission.SHIFTS_VIEW_OWN,
  ],
};

const DEPT_ROLE_REGISTRY: Map<string, Map<string, Permission[]>> = new Map();

export function setDepartmentRoleRegistry(
  entries: Array<{ departmentCode: string; roleKey: string; roleName?: string; permissions: Permission[] }>,
): void {
  DEPT_ROLE_REGISTRY.clear();
  for (const e of entries) {
    if (!e.departmentCode || !e.roleKey) continue;
    let bucket = DEPT_ROLE_REGISTRY.get(e.departmentCode);
    if (!bucket) {
      bucket = new Map();
      DEPT_ROLE_REGISTRY.set(e.departmentCode, bucket);
    }
    bucket.set(e.roleKey, e.permissions);
    if (e.roleName) bucket.set(e.roleName, e.permissions);
  }
}

export function clearDepartmentRoleRegistry(): void {
  DEPT_ROLE_REGISTRY.clear();
}

function resolveDeptRolePermissions(deptId: string, roleName: string): Permission[] {
  const bucket = DEPT_ROLE_REGISTRY.get(deptId);
  if (bucket) {
    const fromRegistry = bucket.get(roleName);
    if (fromRegistry && fromRegistry.length > 0) return fromRegistry;
  }
  const legacy = DEPT_ROLE_EXTRAS[roleName];
  return legacy ? legacy : [];
}

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

      // Department-wide grants (registry key `__departmentDefault__`)
      // apply to every member of the department regardless of role.
      const departmentDefaults = resolveDeptRolePermissions(
        dept.departmentId,
        '__departmentDefault__',
      );
      for (const p of departmentDefaults) deptPerms.add(p);

      if (Array.isArray(dept.roles)) {
        for (const roleName of dept.roles) {
          if (!roleName) continue;
          const perms = resolveDeptRolePermissions(dept.departmentId, roleName);
          for (const p of perms) deptPerms.add(p);
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

  // Apply transitive implications (manage→view, umbrella→sub-feature).
  expandImplications(global);
  byDept.forEach((set) => expandImplications(set));

  return { global, byDept };
}

export function hasPermission(
  computed: ComputedPermissions,
  perm: Permission,
): boolean {
  if (computed.global.has(perm)) return true;
  let allowed = false;
  computed.byDept.forEach((deptPerms) => {
    if (deptPerms.has(perm)) allowed = true;
  });
  return allowed;
}

export function hasPermissionForDept(
  computed: ComputedPermissions,
  perm: Permission,
  deptId: string,
): boolean {
  if (computed.global.has(perm)) return true;
  return computed.byDept.get(deptId)?.has(perm) ?? false;
}
