'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Spin, Alert } from 'antd';
import { Permission } from '@/rbac';

export { Permission };

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Single permission or array — user needs ALL of them. */
  requires?: Permission | Permission[];
  /** If provided, user needs at least ONE of these. */
  requiresAny?: Permission[];
  /** Optional department scope for the permission check. */
  departmentId?: string;
  fallback?: React.ReactNode;
}

export default function ProtectedRoute({
  children,
  requires,
  requiresAny,
  departmentId,
  fallback,
}: ProtectedRouteProps) {
  const { user, loading, hasPermission, hasPermissionForDept } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('auth-token');
      if (!hasToken) {
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) return null;

  // Permission check
  const check = (perm: Permission) =>
    departmentId ? hasPermissionForDept(perm, departmentId) : hasPermission(perm);

  let allowed = true;

  if (requires) {
    const perms = Array.isArray(requires) ? requires : [requires];
    allowed = perms.every(check);
  }

  if (requiresAny && allowed) {
    allowed = requiresAny.some(check);
  }

  if (!allowed) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Alert
          message="אין הרשאה"
          description="אין לך הרשאה לצפות בעמוד זה"
          type="error"
          showIcon
        />
      </div>
    );
  }

  return <>{children}</>;
}
