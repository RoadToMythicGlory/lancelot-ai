// Role-to-permission matrices and computation logic.
// Mirrored at apps/web/src/rbac/matrix.ts — keep in sync.

import {
  Permission,
  SystemRole,
  isValidPermission,
  isValidSystemRole,
  LEGACY_PERMISSION_MAP,
} from './permissions';

// ---------------------------------------------------------------------------
// Permission implications
// ---------------------------------------------------------------------------
//
// "If a user has X, they implicitly also have Y." Used so the new
// fine-grained sub-feature permissions (broadcast-array, venues,
// bulletin, MCR flight board) don't require re-issuing every existing
// role grant — anyone who already had BROADCAST_MANAGE keeps writing
// to venues/broadcast-array, anyone with DASHBOARD_MANAGE keeps
// publishing bulletins, and so on. Manage implies View on the same
// feature for free. Resolved transitively at compute time.

const PERMISSION_IMPLIES: Partial<Record<Permission, Permission[]>> = {
  // Broadcast umbrella → all sub-features
  [Permission.BROADCAST_VIEW]: [
    Permission.BROADCAST_ARRAY_VIEW,
    Permission.VENUES_VIEW,
  ],
  [Permission.BROADCAST_MANAGE]: [
    Permission.BROADCAST_VIEW,
    Permission.BROADCAST_ARRAY_MANAGE,
    Permission.VENUES_MANAGE,
  ],
  // Sub-feature manage → sub-feature view
  [Permission.BROADCAST_ARRAY_MANAGE]: [Permission.BROADCAST_ARRAY_VIEW],
  [Permission.VENUES_MANAGE]: [Permission.VENUES_VIEW],

  // Dashboard umbrella → bulletin
  [Permission.DASHBOARD_VIEW]: [Permission.BULLETIN_VIEW],
  [Permission.DASHBOARD_MANAGE]: [
    Permission.DASHBOARD_VIEW,
    Permission.BULLETIN_MANAGE,
  ],
  [Permission.BULLETIN_MANAGE]: [Permission.BULLETIN_VIEW],

  // Flight board umbrella → MCR variant
  [Permission.FLIGHT_BOARD_VIEW]: [Permission.MCR_FLIGHT_BOARD_VIEW],
  [Permission.FLIGHT_BOARD_MANAGE]: [
    Permission.FLIGHT_BOARD_VIEW,
    Permission.MCR_FLIGHT_BOARD_MANAGE,
  ],
  [Permission.MCR_FLIGHT_BOARD_MANAGE]: [Permission.MCR_FLIGHT_BOARD_VIEW],

  // Other "manage implies view" closures kept here for consistency
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

/**
 * Expand `perms` in place to also include every transitively implied
 * permission. O(N * depth) with a tiny fixed-point loop; safe against
 * accidental cycles thanks to the visited check.
 */
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
// SystemRole → global permissions
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
// Department-role strings → extra permissions (additive per-department)
// ---------------------------------------------------------------------------

/**
 * Hardcoded fallback used before departments were admin-managed. Kept for
 * backwards compatibility with users whose `departments[].roles[]` still
 * carries free-form English role titles. Prefer the runtime registry below
 * (populated from the Department collection) for new departments.
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

/**
 * Runtime registry of department-role permission grants populated from
 * Department documents (see services/departmentRegistry.ts). Keyed by
 * department code, then role key. Empty until the bootstrap loads it.
 */
const DEPT_ROLE_REGISTRY: Map<string, Map<string, Permission[]>> = new Map();

/**
 * Replace the runtime registry with a freshly-loaded snapshot from the
 * Department collection. Called from bootstrap and whenever an admin
 * mutates a department.
 */
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
    // Also register under the role's display name so legacy users carrying
    // English titles in `departments[].roles[]` keep their permissions.
    if (e.roleName) bucket.set(e.roleName, e.permissions);
  }
}

export function clearDepartmentRoleRegistry(): void {
  DEPT_ROLE_REGISTRY.clear();
}

/**
 * Resolve permissions for a single role assignment within a department. Looks
 * up the runtime registry first (admin-managed) then falls back to the legacy
 * hardcoded map keyed by role title.
 */
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
  /** Permissions that apply globally (not scoped to a department). */
  global: Set<Permission>;
  /** Additional per-department permissions. */
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

/**
 * Compute the effective permission set for a user.
 *
 * Sources (layered, additive):
 * 1. SystemRole -> global defaults from ROLE_PERMISSIONS
 * 2. user.departments[].roles -> per-department extras from DEPT_ROLE_EXTRAS
 * 3. user.permissions[] -> direct grants (validated against Permission enum +
 *    legacy map)
 */
export function computePermissions(user: UserForPermissions): ComputedPermissions {
  const global = new Set<Permission>();
  const byDept = new Map<string, Set<Permission>>();

  // 1. SystemRole defaults
  const role = (user.systemRole ?? 'DEPARTMENT_USER') as SystemRole;
  const effectiveRole = isValidSystemRole(role) ? role : 'DEPARTMENT_USER';
  for (const p of ROLE_PERMISSIONS[effectiveRole]) {
    global.add(p);
  }

  // 2. Department role extras (from admin-managed registry + legacy fallback)
  if (Array.isArray(user.departments)) {
    for (const dept of user.departments) {
      if (!dept.departmentId) continue;
      const deptPerms = new Set<Permission>();

      // 2a. Department-wide permissions: every member of the department
      // inherits the department's own `permissions[]` array, regardless of
      // whether they were also assigned a role within it. The registry
      // exposes that array under the special `__departmentDefault__` key
      // (see services/departmentRegistry.ts).
      const departmentDefaults = resolveDeptRolePermissions(
        dept.departmentId,
        '__departmentDefault__',
      );
      for (const p of departmentDefaults) {
        deptPerms.add(p);
      }

      // 2b. Per-role extras for any role(s) the user holds within the
      // department.
      if (Array.isArray(dept.roles)) {
        for (const roleName of dept.roles) {
          if (!roleName) continue;
          const perms = resolveDeptRolePermissions(dept.departmentId, roleName);
          for (const p of perms) {
            deptPerms.add(p);
          }
        }
      }
      if (deptPerms.size > 0) {
        byDept.set(dept.departmentId, deptPerms);
      }
    }
  }

  // 3. Direct grants from user.permissions[]
  if (Array.isArray(user.permissions)) {
    for (const raw of user.permissions) {
      if (isValidPermission(raw)) {
        global.add(raw);
      } else if (LEGACY_PERMISSION_MAP[raw]) {
        global.add(LEGACY_PERMISSION_MAP[raw]);
      }
      // Unknown values silently ignored (logged server-side in context.ts)
    }
  }

  // 4. Apply transitive implications (manage→view, umbrella→sub-feature).
  expandImplications(global);
  byDept.forEach((set) => expandImplications(set));

  return { global, byDept };
}

/** Check whether the user has this permission globally or through any department role. */
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

/** Check a permission in the context of a specific department. */
export function hasPermissionForDept(
  computed: ComputedPermissions,
  perm: Permission,
  deptId: string,
): boolean {
  if (computed.global.has(perm)) return true;
  return computed.byDept.get(deptId)?.has(perm) ?? false;
}

/**
 * Check whether `actor` is allowed to manage (create/update/delete) `target`.
 * Covers tier-escalation guardrails.
 */
export function canManageUser(
  actor: UserForPermissions & { _computedPermissions?: ComputedPermissions },
  target: UserForPermissions,
  actorComputed?: ComputedPermissions,
): boolean {
  const perms = actorComputed ?? computePermissions(actor);

  // Global user management bypasses department scoping
  if (perms.global.has(Permission.USERS_MANAGE_ALL)) {
    // IT_ADMIN cannot create SYSTEM_ADMIN
    if (
      actor.systemRole !== 'SYSTEM_ADMIN' &&
      target.systemRole === 'SYSTEM_ADMIN'
    ) {
      return false;
    }
    return true;
  }

  if (!perms.global.has(Permission.USERS_MANAGE_DEPT)) {
    return false;
  }

  // DEPARTMENT_ADMIN can only manage DEPARTMENT_USER within own departments
  if (target.systemRole && target.systemRole !== 'DEPARTMENT_USER') {
    return false;
  }

  const actorDeptIds = new Set(
    (actor.departments ?? []).map((d) => d.departmentId),
  );
  const targetDeptIds = (target.departments ?? []).map((d) => d.departmentId);

  return targetDeptIds.length > 0 && targetDeptIds.every((id) => actorDeptIds.has(id));
}
