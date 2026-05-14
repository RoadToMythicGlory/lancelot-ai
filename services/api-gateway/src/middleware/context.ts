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
