/**
 * AI Agent Resolvers
 * 
 * GraphQL resolvers for AI agent functionality.
 */

import { connectMongoDB } from '../config/mongodb';
import { createLogger } from '../utils/logger';

const logger = createLogger('ai-resolver');

const AI_AGENT_EMAIL = 'lancelot-ai@internal.system';
const AI_AGENT_SERVICE_URL = process.env.AI_AGENT_URL || 'http://localhost:4001';

interface Context {
  user?: {
    userId: string;
    email: string;
    displayName?: string;
  };
  traceId?: string;
}

/**
 * Fetch from AI agent service
 */
async function fetchFromAIAgent(
  endpoint: string,
  method: string,
  body?: Record<string, unknown>,
  userId?: string,
  traceId?: string
): Promise<any> {
  try {
    const response = await fetch(`${AI_AGENT_SERVICE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(userId && { 'x-user-id': userId }),
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
      try {
        const status = await fetchFromAIAgent('/ai/status', 'GET', undefined, undefined, context.traceId);
        
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
      if (!context.user) {
        throw new Error('Unauthorized');
      }
      
      try {
        const mongoDb = await connectMongoDB();
        const collection = mongoDb.collection('aiConversationMemory');
        
        const memory = await collection.findOne({
          conversationId: args.conversationId,
        });
        
        if (!memory || !memory.messages) {
          return [];
        }
        
        const messages = memory.messages.slice(-(args.limit || 50));
        
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
      if (!context.user) {
        throw new Error('Unauthorized');
      }
      
      try {
        const response = await fetchFromAIAgent(
          '/ai/chat',
          'POST',
          {
            conversationId: args.input.conversationId,
            message: args.input.message,
            context: args.input.context,
          },
          context.user.userId,
          context.traceId
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
      if (!context.user) {
        throw new Error('Unauthorized');
      }
      
      try {
        // For now, use the chat endpoint with a lineup-focused message
        const response = await fetchFromAIAgent(
          '/ai/chat',
          'POST',
          {
            conversationId: `lineup-${Date.now()}`,
            message: `Build lineup: ${JSON.stringify(args.input)}`,
            context: { type: 'lineup_request', ...args.input },
          },
          context.user.userId,
          context.traceId
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
      if (!context.user) {
        throw new Error('Unauthorized');
      }
      
      try {
        const response = await fetchFromAIAgent(
          '/ai/chat',
          'POST',
          {
            conversationId: `cg-${Date.now()}`,
            message: `Create CG: ${args.input.context || JSON.stringify(args.input)}`,
            context: { type: 'cg_request', ...args.input },
          },
          context.user.userId,
          context.traceId
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
      if (!context.user) {
        throw new Error('Unauthorized');
      }
      
      try {
        // Trigger news fetch via chat
        const response = await fetchFromAIAgent(
          '/ai/chat',
          'POST',
          {
            conversationId: `news-${Date.now()}`,
            message: 'Fetch latest news',
            context: { type: 'news_fetch', sources: args.sources },
          },
          context.user.userId,
          context.traceId
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
  },
};

export default aiResolvers;
