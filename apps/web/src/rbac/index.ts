import {
  Permission,
  type SystemRole,
} from './permissions';
import {
  hasPermissionForDept as _hasPermissionForDept,
  type ComputedPermissions,
} from './matrix';

export {
  Permission,
  isValidPermission,
  LEGACY_PERMISSION_MAP,
  type SystemRole,
  SYSTEM_ROLES,
  isValidSystemRole,
} from './permissions';

export {
  computePermissions,
  hasPermission,
  hasPermissionForDept,
  setDepartmentRoleRegistry,
  clearDepartmentRoleRegistry,
  type ComputedPermissions,
  type UserForPermissions,
} from './matrix';

/**
 * Minimal user shape needed for the shifts-specific role/dept helpers below.
 * A superset of `User` from `@/contexts/AuthContext`.
 */
export interface ShiftsUserView {
  systemRole: SystemRole;
  departments: Array<{ departmentId: string; departmentName?: string; roles?: string[] }>;
  computed: ComputedPermissions;
}

/**
 * Three-way view used by the shifts sub-app to mirror the reference's
 * `admin` / `HoD_user` / `user` split, expressed against Lancelot RBAC.
 *
 * - `admin`: a true cross-department system administrator. Sees the
 *   department dropdown everywhere and can configure org-wide settings.
 * - `hod`:   "מנהל מחלקה" — has SHIFTS_MANAGE inside at least one of their
 *   departments. Department-scoped actions only.
 * - `employee`: read-only for own data + can create their own requests.
 */
export type ShiftsRoleView = 'admin' | 'hod' | 'employee';

export function shiftsRoleView(user: ShiftsUserView | null | undefined): ShiftsRoleView {
  if (!user) return 'employee';
  if (user.systemRole === 'SYSTEM_ADMIN' || user.systemRole === 'IT_ADMIN') {
    return 'admin';
  }
  const hod = (user.departments || []).some((d) =>
    d?.departmentId
      ? _hasPermissionForDept(user.computed, Permission.SHIFTS_MANAGE, d.departmentId)
      : false,
  );
  return hod ? 'hod' : 'employee';
}

/**
 * Returns true when the user is allowed to manage shifts (assignments,
 * APLs, configuration, scheduling rules, approvals) for the given
 * department. Backed by the global SHIFTS_MANAGE grant or a department-
 * scoped role grant.
 */
export function canManageDepartmentShifts(
  user: ShiftsUserView | null | undefined,
  deptId: string | null | undefined,
): boolean {
  if (!user || !deptId) return false;
  return _hasPermissionForDept(user.computed, Permission.SHIFTS_MANAGE, deptId);
}

/**
 * Returns the list of department ids the user can manage shifts in.
 * For `SYSTEM_ADMIN` / `IT_ADMIN` this returns every department they
 * happen to be a member of (the full picker is supplied separately by
 * the backend via the `departments` query). For `DEPARTMENT_ADMIN` it
 * returns the subset they actually administer.
 */
export function manageableShiftDepartments(
  user: ShiftsUserView | null | undefined,
): Array<{ departmentId: string; departmentName?: string }> {
  if (!user) return [];
  if (user.systemRole === 'SYSTEM_ADMIN' || user.systemRole === 'IT_ADMIN') {
    return (user.departments || []).map((d) => ({
      departmentId: d.departmentId,
      departmentName: d.departmentName,
    }));
  }
  return (user.departments || [])
    .filter((d) =>
      d?.departmentId
        ? _hasPermissionForDept(user.computed, Permission.SHIFTS_MANAGE, d.departmentId)
        : false,
    )
    .map((d) => ({ departmentId: d.departmentId, departmentName: d.departmentName }));
}
