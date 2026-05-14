/**
 * Users Directory ERP Data Module
 *
 * Read-only access to the `users` Mongo collection. Surfaces a STRICT
 * field allowlist — no email/phone unless the caller has USERS_VIEW.
 *
 * Permission rules:
 *  - USERS_VIEW or USERS_MANAGE_DEPT or USERS_MANAGE_ALL → can search the directory
 *  - USERS_VIEW alone → returns only public-ish fields (name, role, dept)
 *  - USERS_MANAGE_DEPT → can also see email/phone but only inside their dept
 *  - USERS_MANAGE_ALL / SYSTEM_ADMIN → full access
 */

import { connectMongoDB } from '../mongodb-adapter';
import { createLogger } from '../../utils/logger';
import type { UserContext } from '../../agent/orchestrator';
import { Perm, userHasAnyPermission, userHasPermission, permissionRefusal } from './rbac';

const logger = createLogger('erp-users');

const COLLECTION = 'users';

export interface DirectoryUser {
  id: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  systemRole?: string;
  departmentId?: string;
  departmentName?: string;
  /** Only present when caller has USERS_MANAGE_DEPT/ALL or matches dept. */
  email?: string;
  phone?: string;
}

export function canReadUsers(user: UserContext | undefined): {
  allowed: boolean;
  refusal?: string;
} {
  if (
    userHasAnyPermission(user, [
      Perm.USERS_VIEW,
      Perm.USERS_MANAGE_DEPT,
      Perm.USERS_MANAGE_ALL,
    ])
  ) {
    return { allowed: true };
  }
  return { allowed: false, refusal: permissionRefusal('ספריית המשתמשים') };
}

/**
 * Free-text search across firstName/lastName/displayName/email/role.
 * Hides AI-agent / system users.
 */
export async function searchUsers(
  user: UserContext | undefined,
  query: string,
  limit = 10,
): Promise<DirectoryUser[]> {
  const gate = canReadUsers(user);
  if (!gate.allowed || !user) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const db = await connectMongoDB();
    const mongoQuery: Record<string, unknown> = {
      isActive: { $ne: false },
      isAIAgent: { $ne: true },
      $or: [
        { firstName: { $regex: trimmed, $options: 'i' } },
        { lastName: { $regex: trimmed, $options: 'i' } },
        { displayName: { $regex: trimmed, $options: 'i' } },
        { email: { $regex: trimmed, $options: 'i' } },
        { 'departments.roles': { $elemMatch: { $regex: trimmed, $options: 'i' } } },
      ],
    };

    // Department-scoped fallback when caller lacks USERS_MANAGE_ALL
    const canSeeAll = userHasPermission(user, Perm.USERS_MANAGE_ALL);
    if (!canSeeAll && user.departmentId) {
      const deptOr = [
        { 'departments.departmentId': user.departmentId },
        { department: user.departmentId },
      ];
      mongoQuery.$and = [{ $or: mongoQuery.$or }, { $or: deptOr }];
      delete mongoQuery.$or;
    }

    const docs = await db.collection(COLLECTION).find(mongoQuery).limit(limit).toArray();
    return docs.map((d) => projectUser(d, user));
  } catch (error) {
    logger.warn('Failed to search users', {
      query,
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Project a Mongo doc into the safe DirectoryUser shape, masking
 * email/phone when the caller doesn't have the right permission.
 */
function projectUser(doc: any, caller: UserContext): DirectoryUser {
  const canSeeContact =
    userHasAnyPermission(caller, [Perm.USERS_MANAGE_DEPT, Perm.USERS_MANAGE_ALL]) ||
    caller.systemRole === 'SYSTEM_ADMIN' ||
    caller.systemRole === 'IT_ADMIN';

  const dept = Array.isArray(doc.departments) && doc.departments.length > 0
    ? doc.departments[0]
    : undefined;

  return {
    id: doc._id?.toString() || doc.id || '',
    displayName:
      String(doc.displayName || `${doc.firstName || ''} ${doc.lastName || ''}`.trim()),
    firstName: doc.firstName ? String(doc.firstName) : undefined,
    lastName: doc.lastName ? String(doc.lastName) : undefined,
    systemRole: doc.systemRole ? String(doc.systemRole) : undefined,
    departmentId: dept?.departmentId ? String(dept.departmentId) : (doc.department ? String(doc.department) : undefined),
    departmentName: dept?.departmentName ? String(dept.departmentName) : undefined,
    email: canSeeContact && doc.email ? String(doc.email) : undefined,
    phone: canSeeContact && doc.phone ? String(doc.phone) : undefined,
  };
}

export default {
  canReadUsers,
  searchUsers,
};
