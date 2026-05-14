/**
 * RBAC helpers for AI ERP data access.
 *
 * The AI agent receives the asking user's permissions array via the
 * `x-user-permissions` header (forwarded from the api-gateway after JWT
 * verification). Every data-reading tool MUST gate its query on the
 * matching permission so the assistant cannot surface anything the user
 * isn't allowed to see in the regular UI.
 *
 * Mirror of `services/api-gateway/src/rbac/permissions.ts` — keep in sync.
 */

import type { UserContext } from '../../agent/orchestrator';

/**
 * Permission keys read by AI tools. We don't import the api-gateway enum
 * directly to avoid a cross-package dependency, but the strings MUST match
 * exactly.
 */
export const Perm = {
  USERS_VIEW: 'USERS_VIEW',
  USERS_MANAGE_DEPT: 'USERS_MANAGE_DEPT',
  USERS_MANAGE_ALL: 'USERS_MANAGE_ALL',

  BROADCAST_VIEW: 'BROADCAST_VIEW',
  BROADCAST_MANAGE: 'BROADCAST_MANAGE',

  WAREHOUSE_VIEW: 'WAREHOUSE_VIEW',
  WAREHOUSE_MANAGE: 'WAREHOUSE_MANAGE',

  SHIFTS_VIEW_OWN: 'SHIFTS_VIEW_OWN',
  SHIFTS_VIEW_ALL: 'SHIFTS_VIEW_ALL',
  SHIFTS_MANAGE: 'SHIFTS_MANAGE',

  SETTINGS_VIEW: 'SETTINGS_VIEW',
  SETTINGS_MANAGE: 'SETTINGS_MANAGE',

  CHAT_USE: 'CHAT_USE',
} as const;

export type PermissionKey = (typeof Perm)[keyof typeof Perm];

/**
 * System-admin / IT-admin always pass permission checks.
 * (Mirrors `computePermissions` in the api-gateway's matrix.)
 */
const ADMIN_ROLES = new Set(['SYSTEM_ADMIN', 'IT_ADMIN']);

/**
 * Check whether a user has a specific permission.
 *
 * Anonymous / no-permissions callers are denied by default.
 */
export function userHasPermission(
  user: UserContext | undefined,
  perm: PermissionKey,
): boolean {
  if (!user) return false;
  if (user.systemRole && ADMIN_ROLES.has(user.systemRole)) return true;
  if (!Array.isArray(user.permissions) || user.permissions.length === 0) {
    return false;
  }
  return user.permissions.includes(perm);
}

/**
 * Check whether a user has ANY of the given permissions.
 */
export function userHasAnyPermission(
  user: UserContext | undefined,
  perms: PermissionKey[],
): boolean {
  return perms.some((p) => userHasPermission(user, p));
}

/**
 * Standard refusal message in Hebrew when a user lacks the required
 * permission. Tools should return this verbatim so the controller can
 * surface it to the user.
 */
export function permissionRefusal(area: string): string {
  return `אין לך הרשאה לגשת ל${area}. אם נדרש לך מידע זה, פנה למנהל המערכת.`;
}

export default {
  Perm,
  userHasPermission,
  userHasAnyPermission,
  permissionRefusal,
};
