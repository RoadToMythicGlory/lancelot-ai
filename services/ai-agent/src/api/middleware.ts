/**
 * API Middleware
 * 
 * Authentication passthrough, logging, and request handling.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const logger = createLogger('api-middleware');

/**
 * Extended request with user info
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    displayName?: string;
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
 * Extract user from JWT token (passthrough from api-gateway)
 * In production, this would validate the token. For now, we trust the headers.
 */
export function authPassthrough(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // Check for user info in headers (passed from api-gateway)
  const userId = req.headers['x-user-id'] as string;
  const userEmail = req.headers['x-user-email'] as string;
  const userDisplayName = req.headers['x-user-displayname'] as string;
  
  if (userId && userEmail) {
    req.user = {
      userId,
      email: userEmail,
      displayName: userDisplayName,
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
