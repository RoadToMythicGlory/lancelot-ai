/**
 * AI Agent Resolvers
 * 
 * GraphQL resolvers for AI agent functionality.
 */

import { connectMongoDB } from '../config/mongodb';
import { createLogger } from '../utils/logger';
import { requireAuth, requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';
import type { Context } from '../types';

const logger = createLogger('ai-resolver');

const AI_AGENT_EMAIL = 'lancelot-ai@internal.system';
const AI_AGENT_SERVICE_URL = process.env.AI_AGENT_URL || 'http://localhost:4001';

// Cap conversation history fetches so a single request can't pull an
// unbounded number of messages from Mongo.
const MAX_AI_HISTORY = 200;
const DEFAULT_AI_HISTORY = 50;

// TODO(production-hardening): add per-user rate limiting on AI mutations
// (sendAIMessage / requestLineup / requestCGSpec / triggerNewsFetch) — the
// upstream agent service is expensive and currently relies only on auth.

/**
 * Fetch from AI agent service.
 *
 * When the GraphQL Context is provided we forward the asking user's RBAC
 * info (email, permissions, department, role) so the AI agent can scope
 * data-reading tools to what the user is actually allowed to see.
 */
async function fetchFromAIAgent(
  endpoint: string,
  method: string,
  body?: Record<string, unknown>,
  userId?: string,
  traceId?: string,
  context?: Context,
): Promise<any> {
  try {
    const rbacHeaders: Record<string, string> = {};
    if (context?.user) {
      if (context.user.email) {
        rbacHeaders['x-user-email'] = context.user.email;
      }
      if (Array.isArray(context.user.permissions) && context.user.permissions.length > 0) {
        rbacHeaders['x-user-permissions'] = JSON.stringify(context.user.permissions);
      }
      if (context.user.departments && context.user.departments.length > 0) {
        const primaryDept = context.user.departments[0]?.departmentId;
        if (primaryDept) rbacHeaders['x-user-department'] = primaryDept;
      }
      if (context.user.systemRole) {
        rbacHeaders['x-user-system-role'] = context.user.systemRole;
      }
    }

    const response = await fetch(`${AI_AGENT_SERVICE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(userId && { 'x-user-id': userId }),
        ...rbacHeaders,
        ...(traceId && { 'x-trace-id': traceId }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI service error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    logger.error(`Error calling ${endpoint}`, { error: (error as Error).message }, traceId);
    throw error;
  }
}

export const aiResolvers = {
  Query: {
    /**
     * Get AI agent status
     */
    aiAgentStatus: async (_: any, __: any, context: Context) => {
      requireAuth(context);
      try {
        const status = await fetchFromAIAgent('/ai/status', 'GET', undefined, undefined, context.traceId, context);
        
        return {
          isOnline: status.status === 'online',
          modelLoaded: status.modelLoaded,
          lastActive: status.timestamp,
          capabilities: status.capabilities || [],
        };
      } catch (error) {
        logger.error('Failed to get AI status', { error: (error as Error).message }, context.traceId);
        return {
          isOnline: false,
          modelLoaded: null,
          lastActive: null,
          capabilities: [],
        };
      }
    },
    
    /**
     * Get AI conversation history
     */
    aiConversationHistory: async (
      _: any,
      args: { conversationId: string; limit?: number },
      context: Context
    ) => {
      requireAuth(context);
      
      try {
        const mongoDb = await connectMongoDB();
        const collection = mongoDb.collection('aiConversationMemory');
        
        const memory = await collection.findOne({
          conversationId: args.conversationId,
        });
        
        if (!memory || !memory.messages) {
          return [];
        }
        
        const requested = args.limit ?? DEFAULT_AI_HISTORY;
        const bounded = Math.max(1, Math.min(requested, MAX_AI_HISTORY));
        const messages = memory.messages.slice(-bounded);
        
        return messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          toolsUsed: msg.toolsUsed,
          metadata: msg.metadata,
        }));
      } catch (error) {
        logger.error('Failed to get conversation history', { error: (error as Error).message }, context.traceId);
        return [];
      }
    },
    
    /**
     * Get AI agent user (for contacts list)
     */
    aiAgentUser: async (_: any, __: any, context: Context) => {
      requireAuth(context);
      try {
        const mongoDb = await connectMongoDB();
        const usersCollection = mongoDb.collection('users');
        
        const aiUser = await usersCollection.findOne({
          email: AI_AGENT_EMAIL,
          isAIAgent: true,
        });
        
        if (!aiUser) {
          return null;
        }
        
        return {
          id: aiUser._id.toString(),
          firstName: aiUser.firstName,
          lastName: aiUser.lastName,
          displayName: aiUser.displayName,
          email: aiUser.email,
          department: aiUser.department,
          isActive: aiUser.isActive,
          systemRole: aiUser.systemRole,
          permissions: aiUser.permissions,
          createdAt: aiUser.createdAt,
          updatedAt: aiUser.updatedAt,
        };
      } catch (error) {
        logger.error('Failed to get AI user', { error: (error as Error).message }, context.traceId);
        return null;
      }
    },
  },
  
  Mutation: {
    /**
     * Send message to AI
     */
    sendAIMessage: async (
      _: any,
      args: { input: { conversationId: string; message: string; context?: any } },
      context: Context
    ) => {
      requireAuth(context);
      
      try {
        const response = await fetchFromAIAgent(
          '/ai/chat',
          'POST',
          {
            conversationId: args.input.conversationId,
            message: args.input.message,
            context: args.input.context,
          },
          context.user!.userId,
          context.traceId,
          context,
        );
        
        return response;
      } catch (error) {
        logger.error('Failed to send AI message', { error: (error as Error).message }, context.traceId);
        throw new Error('Failed to communicate with AI agent');
      }
    },

    /**
     * Request lineup from AI
     */
    requestLineup: async (
      _: any,
      args: { input: any },
      context: Context
    ) => {
      requireAuth(context);

      try {
        const response = await fetchFromAIAgent(
          '/ai/chat',
          'POST',
          {
            conversationId: `lineup-${Date.now()}`,
            message: `Build lineup: ${JSON.stringify(args.input)}`,
            context: { type: 'lineup_request', ...args.input },
          },
          context.user!.userId,
          context.traceId,
          context,
        );

        return response.response?.structuredData || response;
      } catch (error) {
        logger.error('Failed to request lineup', { error: (error as Error).message }, context.traceId);
        throw new Error('Failed to generate lineup');
      }
    },

    /**
     * Request CG spec from AI
     */
    requestCGSpec: async (
      _: any,
      args: { input: any },
      context: Context
    ) => {
      requireAuth(context);

      try {
        const response = await fetchFromAIAgent(
          '/ai/chat',
          'POST',
          {
            conversationId: `cg-${Date.now()}`,
            message: `Create CG: ${args.input.context || JSON.stringify(args.input)}`,
            context: { type: 'cg_request', ...args.input },
          },
          context.user!.userId,
          context.traceId,
          context,
        );

        return response.response?.structuredData || response;
      } catch (error) {
        logger.error('Failed to request CG spec', { error: (error as Error).message }, context.traceId);
        throw new Error('Failed to generate CG spec');
      }
    },

    /**
     * Trigger news fetch
     */
    triggerNewsFetch: async (
      _: any,
      args: { sources?: string[] },
      context: Context
    ) => {
      requireAuth(context);

      try {
        const response = await fetchFromAIAgent(
          '/ai/chat',
          'POST',
          {
            conversationId: `news-${Date.now()}`,
            message: 'Fetch latest news',
            context: { type: 'news_fetch', sources: args.sources },
          },
          context.user!.userId,
          context.traceId,
          context,
        );

        return {
          success: true,
          message: 'News fetch triggered',
          data: response.response?.structuredData,
        };
      } catch (error) {
        logger.error('Failed to trigger news fetch', { error: (error as Error).message }, context.traceId);
        throw new Error('Failed to fetch news');
      }
    },

    /**
     * Trigger an AI knowledge re-index (admin only).
     *
     * Calls the AI agent's `/ai/admin/reindex` endpoint, which re-embeds
     * help articles + presets so the assistant's RAG store reflects the
     * latest content. Requires SETTINGS_MANAGE permission.
     */
    reindexAIKnowledge: async (
      _: any,
      __: any,
      context: Context
    ) => {
      requirePermission(context, Permission.SETTINGS_MANAGE);

      try {
        const response = await fetchFromAIAgent(
          '/ai/admin/reindex',
          'POST',
          {},
          context.user!.userId,
          context.traceId,
          context,
        );
        return {
          success: true,
          documentsIndexed: response?.documentsIndexed ?? 0,
          message: response?.message ?? 'Reindex triggered',
        };
      } catch (error) {
        logger.error('Failed to reindex AI knowledge', { error: (error as Error).message }, context.traceId);
        throw new Error('Failed to reindex AI knowledge');
      }
    },
  },
};

export default aiResolvers;
