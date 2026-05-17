'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Permission } from '@/rbac';

// Legacy category/type enums — kept for any code that references them.
export enum PermissionCategory {
  USERS = 'USERS',
  BROADCAST = 'BROADCAST',
  WAREHOUSE = 'WAREHOUSE',
  SHIFTS = 'SHIFTS',
  MCR = 'MCR',
  SETTINGS = 'SETTINGS',
  MEDIA = 'MEDIA',
  RIGHTS = 'RIGHTS',
  WORKFLOWS = 'WORKFLOWS',
  DASHBOARD = 'DASHBOARD',
  CHAT = 'CHAT',
  INTEGRATIONS = 'INTEGRATIONS',
  AUDIT = 'AUDIT',
  IT_SUPPORT = 'IT_SUPPORT',
}

export enum PermissionType {
  VIEW = 'VIEW',
  MANAGE = 'MANAGE',
  CREATE = 'CREATE',
  DELETE = 'DELETE',
}

const CATEGORY_PERMISSION_MAP: Record<PermissionCategory, Record<string, Permission>> = {
  [PermissionCategory.USERS]: {
    VIEW: Permission.USERS_VIEW,
    MANAGE: Permission.USERS_MANAGE_ALL,
    CREATE: Permission.USERS_MANAGE_ALL,
    DELETE: Permission.USERS_MANAGE_ALL,
  },
  [PermissionCategory.BROADCAST]: {
    VIEW: Permission.BROADCAST_VIEW,
    MANAGE: Permission.BROADCAST_MANAGE,
    CREATE: Permission.BROADCAST_MANAGE,
    DELETE: Permission.BROADCAST_DELETE,
  },
  [PermissionCategory.WAREHOUSE]: {
    VIEW: Permission.WAREHOUSE_VIEW,
    MANAGE: Permission.WAREHOUSE_MANAGE,
    CREATE: Permission.WAREHOUSE_MANAGE,
    DELETE: Permission.WAREHOUSE_MANAGE,
  },
  [PermissionCategory.SHIFTS]: {
    VIEW: Permission.SHIFTS_VIEW_OWN,
    MANAGE: Permission.SHIFTS_MANAGE,
    CREATE: Permission.SHIFTS_MANAGE,
    DELETE: Permission.SHIFTS_MANAGE,
  },
  [PermissionCategory.MCR]: {
    VIEW: Permission.MCR_VIEW,
    MANAGE: Permission.MCR_MANAGE,
    CREATE: Permission.MCR_MANAGE,
    DELETE: Permission.MCR_ADMIN,
  },
  [PermissionCategory.SETTINGS]: {
    VIEW: Permission.SETTINGS_MANAGE,
    MANAGE: Permission.SETTINGS_MANAGE,
    CREATE: Permission.SETTINGS_MANAGE,
    DELETE: Permission.SETTINGS_MANAGE,
  },
  [PermissionCategory.MEDIA]: {
    VIEW: Permission.MEDIA_VIEW,
    MANAGE: Permission.MEDIA_MANAGE,
    CREATE: Permission.MEDIA_MANAGE,
    DELETE: Permission.MEDIA_MANAGE,
  },
  [PermissionCategory.RIGHTS]: {
    VIEW: Permission.RIGHTS_VIEW,
    MANAGE: Permission.RIGHTS_MANAGE,
    CREATE: Permission.RIGHTS_MANAGE,
    DELETE: Permission.RIGHTS_MANAGE,
  },
  [PermissionCategory.WORKFLOWS]: {
    VIEW: Permission.WORKFLOWS_VIEW,
    MANAGE: Permission.WORKFLOWS_MANAGE,
    CREATE: Permission.WORKFLOWS_MANAGE,
    DELETE: Permission.WORKFLOWS_MANAGE,
  },
  [PermissionCategory.DASHBOARD]: {
    VIEW: Permission.DASHBOARD_VIEW,
    MANAGE: Permission.DASHBOARD_VIEW,
    CREATE: Permission.DASHBOARD_VIEW,
    DELETE: Permission.DASHBOARD_VIEW,
  },
  [PermissionCategory.CHAT]: {
    VIEW: Permission.CHAT_USE,
    MANAGE: Permission.CHAT_USE,
    CREATE: Permission.CHAT_USE,
    DELETE: Permission.CHAT_USE,
  },
  [PermissionCategory.INTEGRATIONS]: {
    VIEW: Permission.INTEGRATIONS_MANAGE,
    MANAGE: Permission.INTEGRATIONS_MANAGE,
    CREATE: Permission.INTEGRATIONS_MANAGE,
    DELETE: Permission.INTEGRATIONS_MANAGE,
  },
  [PermissionCategory.AUDIT]: {
    VIEW: Permission.AUDIT_VIEW,
    MANAGE: Permission.AUDIT_VIEW,
    CREATE: Permission.AUDIT_VIEW,
    DELETE: Permission.AUDIT_VIEW,
  },
  [PermissionCategory.IT_SUPPORT]: {
    VIEW: Permission.IT_SUPPORT_VIEW,
    MANAGE: Permission.IT_SUPPORT_MANAGE,
    CREATE: Permission.IT_SUPPORT_MANAGE,
    DELETE: Permission.IT_SUPPORT_MANAGE,
  },
};

export function usePermissions() {
  const { user, hasPermission } = useAuth();

  const checkPermission = (category: PermissionCategory, type: PermissionType): boolean => {
    if (!user) return false;
    const perm = CATEGORY_PERMISSION_MAP[category]?.[type];
    if (!perm) return false;
    return hasPermission(perm);
  };

  return {
    checkPermission,
    hasPermission,
    isAuthenticated: !!user,
    isAdmin: user?.systemRole === 'SYSTEM_ADMIN' || user?.systemRole === 'IT_ADMIN',
    systemRole: user?.systemRole,
  };
}
