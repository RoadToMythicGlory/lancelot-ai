import { Request } from 'express';
import { ObjectId } from 'mongodb';
import { jwtService } from '../services/jwtService';
import { connectMongoDB } from '../config/mongodb';
import { getOrCreateTraceId } from '../utils/traceId';
import { pubsub } from '../utils/pubsub';
import { createLogger } from '../utils/logger';
import {
  Permission,
  computePermissions,
  hasPermission as _hasPermission,
  hasPermissionForDept as _hasPermissionForDept,
  isValidPermission,
  LEGACY_PERMISSION_MAP,
} from '../rbac';
import type { AuthUser, Context } from '../types';

const logger = createLogger('context');

/**
 * Build a Context from a raw bearer token (used by WebSocket subscription handler).
 * Returns a Context with `user: null` when the token is missing or invalid so the
 * caller can decide whether to allow anonymous traffic for a given operation.
 */
export async function buildContextFromToken(token: string | undefined | null, traceId?: string): Promise<Context> {
  const mongoDb = await connectMongoDB();
  const tid = traceId || `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!token || typeof token !== 'string') {
    return { user: null, mongoDb, traceId: tid, pubsub };
  }

  try {
    const payload = jwtService.verify(token);

    if (!ObjectId.isValid(payload.userId)) {
      logger.warn('WS token has invalid userId', { userId: payload.userId }, tid);
      return { user: null, mongoDb, traceId: tid, pubsub };
    }

    const userDoc = await mongoDb
      .collection('users')
      .findOne({ _id: new ObjectId(payload.userId) });

    if (!userDoc || userDoc.isActive === false) {
      logger.warn('WS token user missing or inactive', { userId: payload.userId }, tid);
      return { user: null, mongoDb, traceId: tid, pubsub };
    }

    const computed = computePermissions({
      systemRole: userDoc.systemRole,
      departments: userDoc.departments,
      permissions: userDoc.permissions,
    });

    const contextUser: AuthUser = {
      userId: userDoc._id.toString(),
      email: userDoc.email,
      firstName: userDoc.firstName || '',
      lastName: userDoc.lastName || '',
      displayName:
        userDoc.displayName ||
        `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() ||
        userDoc.email,
      systemRole: userDoc.systemRole || 'DEPARTMENT_USER',
      departments: userDoc.departments || [],
      permissions: userDoc.permissions || [],
      computed,
      has(perm: Permission) {
        return _hasPermission(computed, perm);
      },
      hasForDept(perm: Permission, deptId: string) {
        return _hasPermissionForDept(computed, perm, deptId);
      },
    };

    return {
      user: contextUser,
      userId: contextUser.userId,
      mongoDb,
      traceId: tid,
      pubsub,
    };
  } catch (error: any) {
    logger.warn('WS JWT validation error', { error: error.message }, tid);
    return { user: null, mongoDb, traceId: tid, pubsub };
  }
}

export async function buildGraphQLContext(req: Request): Promise<Context> {
  const body = (req as any).body;
  const traceId = getOrCreateTraceId(req);

  logger.debug('GraphQL request', {
    operationName: body?.operationName || 'UNKNOWN',
    hasVariables: !!body?.variables,
  }, traceId);

  const mongoDb = await connectMongoDB();

  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = jwtService.verify(token);

      logger.debug('JWT verified', {
        userId: payload.userId,
        email: payload.email,
        systemRole: payload.systemRole,
      }, traceId);

      // Fetch full user document from MongoDB so we get the live
      // permissions[], departments and systemRole — not stale JWT claims.
      const userDoc = await mongoDb
        .collection('users')
        .findOne({ _id: new ObjectId(payload.userId) });

      if (!userDoc) {
        logger.warn('JWT userId not found in DB', { userId: payload.userId }, traceId);
        return { user: null, mongoDb, traceId, pubsub };
      }

      if (userDoc.isActive === false) {
        logger.warn('Inactive user attempted access', { userId: payload.userId }, traceId);
        return { user: null, mongoDb, traceId, pubsub };
      }

      if (Array.isArray(userDoc.permissions)) {
        for (const raw of userDoc.permissions) {
          if (!isValidPermission(raw) && !(raw in LEGACY_PERMISSION_MAP)) {
            logger.warn('Unknown permission on user', { userId: payload.userId, permission: raw }, traceId);
          }
        }
      }

      const computed = computePermissions({
        systemRole: userDoc.systemRole,
        departments: userDoc.departments,
        permissions: userDoc.permissions,
      });

      const contextUser: AuthUser = {
        userId: userDoc._id.toString(),
        email: userDoc.email,
        firstName: userDoc.firstName || '',
        lastName: userDoc.lastName || '',
        displayName: userDoc.displayName || `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() || userDoc.email,
        systemRole: userDoc.systemRole || 'DEPARTMENT_USER',
        departments: userDoc.departments || [],
        permissions: userDoc.permissions || [],
        computed,
        has(perm: Permission) {
          return _hasPermission(computed, perm);
        },
        hasForDept(perm: Permission, deptId: string) {
          return _hasPermissionForDept(computed, perm, deptId);
        },
      };

      return {
        user: contextUser,
        userId: contextUser.userId,
        mongoDb,
        traceId,
        pubsub,
      };
    }
  } catch (error: any) {
    logger.warn('JWT validation error', { error: error.message }, traceId);
  }

  return { user: null, mongoDb, traceId, pubsub };
}

export default { buildGraphQLContext };
