/**
 * API Middleware
 * 
 * Authentication passthrough, logging, and request handling.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const logger = createLogger('api-middleware');

/**
 * Extended request with user info.
 *
 * `permissions` and `departmentId` are forwarded from the api-gateway via
 * the `x-user-permissions` / `x-user-department` / `x-user-system-role`
 * headers so the AI agent can enforce RBAC on every data-reading tool.
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    displayName?: string;
    permissions?: string[];
    departmentId?: string;
    systemRole?: string;
  };
  traceId?: string;
}

/**
 * Add trace ID to request
 */
export function traceMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  req.traceId = req.headers['x-trace-id'] as string || `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('x-trace-id', req.traceId);
  next();
}

/**
 * Request logging middleware
 */
export function requestLogger(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  logger.info(`${req.method} ${req.path}`, {
    traceId: req.traceId,
    userId: req.user?.userId,
    contentLength: req.headers['content-length'],
  });
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.path} - ${res.statusCode}`, {
      traceId: req.traceId,
      durationMs: duration,
      statusCode: res.statusCode,
    });
  });
  
  next();
}

/**
 * Extract user from JWT token (passthrough from api-gateway).
 *
 * In production this would validate the token. For now we trust the headers
 * forwarded by the api-gateway (which already authenticated the JWT).
 *
 * Headers consumed:
 *   x-user-id            — Mongo user ID (required)
 *   x-user-email         — user email (required)
 *   x-user-displayname   — display name (optional)
 *   x-user-permissions   — JSON-encoded permission array (optional)
 *   x-user-department    — primary department ID (optional)
 *   x-user-system-role   — system role string (optional)
 */
export function authPassthrough(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'] as string;
  const userEmail = req.headers['x-user-email'] as string;
  const userDisplayName = req.headers['x-user-displayname'] as string;
  const userDepartment = req.headers['x-user-department'] as string | undefined;
  const userSystemRole = req.headers['x-user-system-role'] as string | undefined;

  let permissions: string[] | undefined;
  const rawPermissions = req.headers['x-user-permissions'];
  if (typeof rawPermissions === 'string' && rawPermissions.length > 0) {
    try {
      const parsed = JSON.parse(rawPermissions);
      if (Array.isArray(parsed)) {
        permissions = parsed.filter((p): p is string => typeof p === 'string');
      }
    } catch {
      // Header was a comma-separated list rather than JSON — accept it.
      permissions = rawPermissions
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    }
  }

  if (userId && userEmail) {
    req.user = {
      userId,
      email: userEmail,
      displayName: userDisplayName,
      permissions,
      departmentId: userDepartment,
      systemRole: userSystemRole,
    };
  }

  next();
}

/**
 * Require authentication
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    logger.warn('Unauthorized request', {
      traceId: req.traceId,
      path: req.path,
    });
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }
  next();
}

/**
 * Error handling middleware
 */
export function errorHandler(err: Error, req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  logger.error('Unhandled error', {
    traceId: req.traceId,
    error: err.message,
    stack: err.stack,
  });
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
    traceId: req.traceId,
  });
}

export default {
  traceMiddleware,
  requestLogger,
  authPassthrough,
  requireAuth,
  errorHandler,
};
