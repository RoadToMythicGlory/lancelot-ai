import { Request } from 'express';
import { jwtService } from '../services/jwtService';
import { connectMongoDB } from '../config/mongodb';
import { getOrCreateTraceId } from '../utils/traceId';
import { pubsub } from '../utils/pubsub';
import { createLogger } from '../utils/logger';

const logger = createLogger('context');

export async function buildGraphQLContext(req: Request): Promise<{
  user: any | null;
  userId?: string;
  mongoDb: any;
  traceId: string;
  pubsub: typeof pubsub;
}> {
  const body = (req as any).body;
  const traceId = getOrCreateTraceId(req);

  logger.debug('GraphQL request', {
    operationName: body?.operationName || 'UNKNOWN',
    hasVariables: !!body?.variables,
  }, traceId);

  // Validate JWT token from authorization header
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
      
      const contextUser = {
        userId: payload.userId,  // Changed from 'id' to 'userId'
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        displayName: payload.displayName,
        role: payload.role,
        systemRole: payload.systemRole,
        departments: payload.departments || [],
        permissions: [payload.role]
      };
      
      // Get MongoDB connection for context
      const mongoDb = await connectMongoDB();
      
      return { 
        user: contextUser, 
        userId: payload.userId, // Add userId at the root level for backward compatibility
        mongoDb,
        traceId,
        pubsub
      };
    }
  } catch (error: any) {
    // Invalid token, continue without user
    logger.warn('JWT validation error', { error: error.message }, traceId);
  }
  
  // No valid token, but still provide MongoDB connection
  const mongoDb = await connectMongoDB();
  return { user: null, mongoDb, traceId, pubsub };
}

export default {
  buildGraphQLContext,
};
