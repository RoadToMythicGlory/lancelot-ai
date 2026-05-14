import { AuthenticationError } from 'apollo-server-express';
import { Permission, hasPermission, hasPermissionForDept } from '../rbac';
import type { Context, AuthUser } from '../types';

// ---------------------------------------------------------------------------
// Core auth guards
// ---------------------------------------------------------------------------

/** Throws if no authenticated user on the context. Returns the AuthUser. */
export function requireAuth(context: Context): AuthUser {
  if (!context.user) {
    throw new AuthenticationError('You must be logged in to do this');
  }
  return context.user;
}

/** Throws if the user lacks the given global permission. */
export function requirePermission(context: Context, perm: Permission): AuthUser {
  const user = requireAuth(context);
  if (!user.has(perm)) {
    throw new AuthenticationError(
      `Missing permission: ${perm}`,
    );
  }
  return user;
}

/** Throws if the user lacks the permission both globally and for the given dept. */
export function requirePermissionForDept(
  context: Context,
  perm: Permission,
  deptId: string,
): AuthUser {
  const user = requireAuth(context);
  if (!user.hasForDept(perm, deptId)) {
    throw new AuthenticationError(
      `Missing permission: ${perm} for department ${deptId}`,
    );
  }
  return user;
}

/** Convenience: throws unless SYSTEM_ADMIN or IT_ADMIN. */
export function requireSystemAdmin(context: Context): AuthUser {
  const user = requireAuth(context);
  if (user.systemRole !== 'SYSTEM_ADMIN' && user.systemRole !== 'IT_ADMIN') {
    throw new AuthenticationError('System admin access required');
  }
  return user;
}

// ---------------------------------------------------------------------------
// Legacy aliases — kept so existing imports compile. Migrate call-sites over
// time then remove.
// ---------------------------------------------------------------------------

/** @deprecated Use requireAuth instead */
export function authenticateUser(context: any): AuthUser {
  return requireAuth(context as Context);
}

/** @deprecated Use requirePermission wrapper or requireAuth directly */
export const withAuth = (resolver: any) => {
  return async (parent: any, args: any, context: any, info: any) => {
    requireAuth(context);
    return resolver(parent, args, context, info);
  };
};

/** @deprecated Use requirePermission instead */
export const withRole = (role: string, resolver: any) => {
  return async (parent: any, args: any, context: any, info: any) => {
    const user = requireAuth(context);
    if (
      user.systemRole !== role &&
      !user.permissions?.includes(role) &&
      !user.has(role as Permission)
    ) {
      throw new AuthenticationError(`You must have ${role} permissions to do this`);
    }
    return resolver(parent, args, context, info);
  };
};

/** @deprecated Use user.has(Permission.MCR_ADMIN) instead */
export const isMCRDepartmentAdmin = async (context: any): Promise<boolean> => {
  if (!context.user) return false;
  if (context.user.systemRole === 'SYSTEM_ADMIN') return true;
  return context.user.has?.(Permission.MCR_ADMIN) ?? false;
};
