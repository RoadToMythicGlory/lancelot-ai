import { Permission, ComputedPermissions, SystemRole } from '../rbac';

export interface AuthUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  systemRole: SystemRole;
  departments: Array<{
    departmentId: string;
    departmentName: string;
    roles: string[];
  }>;
  /** Raw permission strings from DB (kept for backward compat). */
  permissions: string[];
  /** Computed permission sets. */
  computed: ComputedPermissions;
  /** Check a global permission. */
  has(perm: Permission): boolean;
  /** Check a permission scoped to a department. */
  hasForDept(perm: Permission, deptId: string): boolean;
}

export interface Context {
  user: AuthUser | null;
  userId?: string;
  mongoDb: any;
  traceId: string;
  pubsub: any;
  token?: string;
}

// Re-export other types
export * from './worker-reports';
