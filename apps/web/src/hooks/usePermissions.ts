'use client';

import { useAuth } from '@/contexts/AuthContext';
import { PermissionCategory, PermissionType } from '@/components/auth/ProtectedRoute';

export { PermissionCategory, PermissionType };

interface UsePermissionsReturn {
  hasPermission: (category: PermissionCategory, type?: PermissionType) => boolean;
  canAccessDashboard: () => boolean;
  canManageUsers: () => boolean;
  canManageBroadcasts: () => boolean;
  canManageShifts: () => boolean;
  canManageWarehouse: () => boolean;
  canManageTickets: () => boolean;
  isAdmin: () => boolean;
}

export const usePermissions = (): UsePermissionsReturn => {
  const { user } = useAuth();

  const hasPermission = (category: PermissionCategory, type: PermissionType = PermissionType.READ): boolean => {
    if (!user) return false;
    
    // System admins and IT admins have all permissions
    if (user.systemRole === 'SYSTEM_ADMIN' || user.systemRole === 'IT_ADMIN') {
      return true;
    }

    // For now, allow all authenticated users basic read permissions
    if (type === PermissionType.READ) {
      return true;
    }

    // More restrictive permissions based on role
    switch (category) {
      case PermissionCategory.USERS:
        return user.systemRole === 'DEPARTMENT_ADMIN' || user.canManageAllUsers;
      case PermissionCategory.BROADCAST:
        return ['broadcast_planner', 'broadcast_coordinator'].includes(user.role || '');
      case PermissionCategory.ADMIN:
        return user.systemRole === 'SYSTEM_ADMIN';
      default:
        return false;
    }
  };

  return {
    hasPermission,
    canAccessDashboard: () => hasPermission(PermissionCategory.DASHBOARD),
    canManageUsers: () => hasPermission(PermissionCategory.USERS, PermissionType.WRITE),
    canManageBroadcasts: () => hasPermission(PermissionCategory.BROADCAST, PermissionType.WRITE),
    canManageShifts: () => hasPermission(PermissionCategory.SHIFTS, PermissionType.WRITE),
    canManageWarehouse: () => hasPermission(PermissionCategory.WAREHOUSE, PermissionType.WRITE),
    canManageTickets: () => hasPermission(PermissionCategory.TICKETS, PermissionType.WRITE),
    isAdmin: () => user?.systemRole === 'SYSTEM_ADMIN' || user?.systemRole === 'IT_ADMIN'
  };
};

