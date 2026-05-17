'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useMutation } from '@apollo/client';
import { LOGIN, REGISTER_PUBLIC_KEY } from '../graphql/mutations';
import { getOrCreateKeyPair } from '../utils/crypto/e2ee';
import {
  Permission,
  type SystemRole,
  type ComputedPermissions,
  computePermissions,
  hasPermission as _hasPermission,
  hasPermissionForDept as _hasPermissionForDept,
} from '@/rbac';

interface UserDepartment {
  departmentId: string;
  departmentName: string;
  roles: string[];
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  department?: string;
  systemRole: SystemRole;
  departments: UserDepartment[];
  /** Raw permission strings from the JWT (kept for backward compat). */
  permissions: string[];
  /** Computed permission set — use hasPermission() helper instead of reading directly. */
  computed: ComputedPermissions;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Check a permission granted globally or by any assigned department role. */
  hasPermission: (perm: Permission) => boolean;
  /** Check a permission scoped to a specific department. */
  hasPermissionForDept: (perm: Permission, deptId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));

    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function buildUser(payload: Record<string, any>): User {
  const systemRole: SystemRole = payload.systemRole || 'DEPARTMENT_USER';
  const departments: UserDepartment[] = payload.departments || [];
  const rawPermissions: string[] = payload.permissions || [];

  const computed = computePermissions({ systemRole, departments, permissions: rawPermissions });

  return {
    id: payload.userId,
    displayName:
      payload.displayName ||
      `${payload.firstName || 'User'} ${payload.lastName || ''}`.trim() ||
      payload.email,
    email: payload.email,
    department:
      departments.length > 0
        ? departments[0].departmentName || departments[0].departmentId
        : '',
    systemRole,
    departments,
    permissions: rawPermissions,
    computed,
  };
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginMutation] = useMutation(LOGIN);
  const [registerPublicKeyMutation] = useMutation(REGISTER_PUBLIC_KEY);

  // Restore user from stored JWT on mount
  useEffect(() => {
    try {
      const token = localStorage.getItem('auth-token');
      if (token && token !== 'mock-jwt-token') {
        const payload = decodeJwtPayload(token);
        if (payload) {
          setUser(buildUser(payload));
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('jwt malformed') || msg.includes('jwt expired') || msg.includes('invalid token')) {
        localStorage.removeItem('auth-token');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // E2EE key registration
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const ensureE2eeKeys = async () => {
      try {
        const keyPair = await getOrCreateKeyPair(user.id);
        if (cancelled) return;
        await registerPublicKeyMutation({ variables: { publicKey: keyPair.publicKey } });
      } catch (error) {
        console.error('[E2EE] Failed to initialize keys:', error);
      }
    };
    ensureE2eeKeys();
    return () => { cancelled = true; };
  }, [user?.id, registerPublicKeyMutation]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await loginMutation({ variables: { email, password } });

    if (!data?.login) {
      throw new Error('שגיאה בהתחברות - לא התקבלו נתונים מהשרת');
    }

    const { token, user: loginUser } = data.login;
    localStorage.setItem('auth-token', token);

    // Decode the JWT to get full user info (including permissions[])
    const payload = decodeJwtPayload(token);
    if (payload) {
      setUser(buildUser(payload));
    }

    // Force page reload so Apollo picks up the new token
    window.location.href = '/';
  }, [loginMutation]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('auth-token');
  }, []);

  const hasPermission = useCallback(
    (perm: Permission) => {
      if (!user) return false;
      return _hasPermission(user.computed, perm);
    },
    [user],
  );

  const hasPermissionForDept = useCallback(
    (perm: Permission, deptId: string) => {
      if (!user) return false;
      return _hasPermissionForDept(user.computed, perm, deptId);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, hasPermission, hasPermissionForDept }),
    [user, loading, login, logout, hasPermission, hasPermissionForDept],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
