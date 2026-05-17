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
  canManageUser,
  setDepartmentRoleRegistry,
  clearDepartmentRoleRegistry,
  type ComputedPermissions,
  type UserForPermissions,
} from './matrix';
