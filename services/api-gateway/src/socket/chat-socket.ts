import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { jwtService } from '../services/jwtService';
import { connectMongoDB } from '../config/mongodb';
import { config } from '../config';
import { getOrCreateTraceId } from '../utils/traceId';
import { createLogger } from '../utils/logger';

const logger = createLogger('chat-socket');

// AI Agent configuration
const AI_AGENT_EMAIL = 'lancelot-ai@internal.system';
const AI_AGENT_SERVICE_URL = process.env.AI_AGENT_URL || 'http://localhost:4001';

// Cache the AI user ID
let cachedAIUserId: string | null = null;
const AI_AGENT_TIMEOUT_MS = 30000;
const MAX_MESSAGE_LENGTH = 10000;

// Runtime tripwire counter — E2EE fallback occurrences
let e2eeFallbackCount = 0;

/**
 * Get the current E2EE fallback tripwire count.
 * Exposed via /health for visibility (no new endpoint).
 */
export function getE2eeFallbackCount(): number {
  return e2eeFallbackCount;
}

/**
 * Validate that a value is a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Get the AI agent user ID from database
 */
async function getAIAgentUserId(): Promise<string | null> {
  if (cachedAIUserId) {
    return cachedAIUserId;
  }
  
  try {
    const mongoDb = await connectMongoDB();
    const usersCollection = mongoDb.collection('users');
    const aiUser = await usersCollection.findOne({ 
      email: AI_AGENT_EMAIL,
      isAIAgent: true 
    });
    
    if (aiUser) {
      cachedAIUserId = aiUser._id.toString();
      logger.info('Found AI user', { userId: cachedAIUserId });
      return cachedAIUserId;
    }
    
    logger.info('AI user not found in database');
    return null;
  } catch (error) {
    logger.error('Error fetching AI user', { error: (error as Error).message });
    return null;
  }
}

/**
 * Send message to AI agent service.
 *
 * Forwards the asking user's RBAC info via additional headers so the AI
 * agent can scope DB-reading tools (warehouse, shifts, users, ...) to
 * what the user is actually allowed to see.
 */
async function sendToAIAgent(
  conversationId: string,
  message: string,
  userId: string,
  userName: string,
  messageType?: string,
  encryption?: any,
  messageId?: string,
  traceId?: string,
  rbac?: {
    permissions?: string[];
    departmentId?: string;
    systemRole?: string;
  }
): Promise<{ text: string; data?: any; error?: string; encryption?: any; messageType?: string }> {
  try {
    logger.info('Sending message to AI agent service', { traceId });

    const rbacHeaders: Record<string, string> = {};
    if (rbac?.permissions && rbac.permissions.length > 0) {
      rbacHeaders['x-user-permissions'] = JSON.stringify(rbac.permissions);
    }
    if (rbac?.departmentId) {
      rbacHeaders['x-user-department'] = rbac.departmentId;
    }
    if (rbac?.systemRole) {
      rbacHeaders['x-user-system-role'] = rbac.systemRole;
    }

    const response = await withTimeout(
      fetch(`${AI_AGENT_SERVICE_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-email': userName,
          ...rbacHeaders,
          ...(traceId ? { 'x-trace-id': traceId } : {}),
        },
        body: JSON.stringify({
          conversationId,
          message,
          messageType,
          encryption,
          messageId,
          context: {},
        }),
      }),
      AI_AGENT_TIMEOUT_MS,
      'AI agent chat'
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('AI service error response', { status: response.status, errorText, traceId });
      return { 
        text: 'מצטער, אני לא זמין כרגע. נסה שוב מאוחר יותר.',
        error: `AI service returned ${response.status}` 
      };
    }
    
    const result = await response.json();
    logger.info('Received response from AI agent', { traceId });
    
    return {
      text: result.response?.text || 'לא הצלחתי לעבד את הבקשה',
      data: result,
      encryption: result.encryption,
      messageType: result.encryption?.enabled ? 'encrypted' : result.response?.messageType
    };
  } catch (error) {
    const errMsg = (error as Error).message || String(error);
    if (errMsg.startsWith('Timeout:')) {
      logger.warn('AI service timeout', { error: errMsg, traceId });
    } else {
      logger.error('Failed to contact AI service', { error: errMsg, traceId });
    }
    return {
      text: 'מצטער, אני לא יכול להתחבר לשירות ה-AI כרגע.',
      error: errMsg,
    };
  }
}

interface SocketUser {
  userId: string;
  email: string;
  displayName: string;
  /** Live permissions list — used to scope AI data tools. */
  permissions?: string[];
  /** Primary department ID — used as default scope when querying shifts/users. */
  departmentId?: string;
  /** System role — used by AI tools that may bypass dept scoping for admins. */
  systemRole?: string;
}

export function setupChatSocket(httpServer: HttpServer) {
  logger.info('Setting up chat socket server');

  // Build dynamic CORS origin checker to support prod domains
  const allowedOrigins = config.CORS_ALLOWED_ORIGINS;
  const isProd = config.NODE_ENV === 'production';

  const io = new SocketServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl) and all in non-prod
        if (!origin || !isProd) {
          return callback(null, true);
        }
        // If no explicit allowlist configured in prod, allow all to avoid lockout
        if (!allowedOrigins || allowedOrigins.length === 0) {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'), false);
      },
      credentials: config.CORS_ALLOW_CREDENTIALS,
      methods: ['GET', 'POST']
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingInterval: 25000,
    pingTimeout: 60000
  });

  logger.info('Socket.IO server configured', { isProd, corsOrigins: isProd ? allowedOrigins : ['*'] });

  // Authentication middleware
  io.use(async (socket, next) => {
    logger.debug('New connection attempt', { address: socket.handshake.address });
    
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        logger.warn('Socket auth failed: no token');
        return next(new Error('Authentication required'));
      }

      const payload = jwtService.verify(token);
      logger.debug('Socket JWT verified', {
        userId: payload.userId,
        email: payload.email,
      });

      // Pull live RBAC info from MongoDB so the AI agent receives current
      // permissions (JWT may be stale if the user's role recently changed).
      let permissions: string[] | undefined;
      let departmentId: string | undefined;
      let systemRole: string | undefined;
      try {
        const { ObjectId } = await import('mongodb');
        const mongoDb = await connectMongoDB();
        const userDoc = await mongoDb
          .collection('users')
          .findOne({ _id: new ObjectId(payload.userId) });
        if (userDoc) {
          if (Array.isArray(userDoc.permissions)) {
            permissions = userDoc.permissions.filter(
              (p: unknown): p is string => typeof p === 'string'
            );
          }
          if (Array.isArray(userDoc.departments) && userDoc.departments.length > 0) {
            departmentId = userDoc.departments[0]?.departmentId;
          } else if (typeof userDoc.department === 'string') {
            departmentId = userDoc.department;
          }
          if (typeof userDoc.systemRole === 'string') {
            systemRole = userDoc.systemRole;
          }
        }
      } catch (rbacErr) {
        logger.warn('Failed to load RBAC info for socket user', {
          userId: payload.userId,
          error: (rbacErr as Error).message,
        });
      }

      (socket as any).user = {
        userId: payload.userId,
        email: payload.email,
        displayName: payload.displayName || `${payload.firstName} ${payload.lastName}`.trim(),
        permissions,
        departmentId,
        systemRole,
      };

      next();
    } catch (err: any) {
      logger.warn('Socket authentication failed', { error: err.message });
      next(new Error('Authentication failed: ' + err.message));
    }
  });

  io.on('connection', async (socket) => {
    const user = (socket as any).user as SocketUser;
    logger.info('User connected', { userId: user.userId, displayName: user.displayName });

    // Join user to their personal room
    socket.join(`user:${user.userId}`);

    // Handle joining private conversations.
    // Membership must be validated server-side — otherwise an attacker who
    // knows a conversationId could subscribe to messages they shouldn't see.
    socket.on('join-private-conversation', async (conversationId: string) => {
      if (!isNonEmptyString(conversationId)) {
        socket.emit('error', { message: 'Invalid conversationId' });
        return;
      }
      try {
        const mongoDb = await connectMongoDB();
        const conversation = await mongoDb.collection('privateConversations').findOne({
          id: conversationId,
          $or: [
            { participant1Id: user.userId },
            { participant2Id: user.userId },
          ],
        });
        if (!conversation) {
          logger.warn('User tried to join unauthorized conversation', {
            userId: user.userId,
            conversationId,
          });
          socket.emit('error', { message: 'Unauthorized conversation access' });
          return;
        }
        socket.join(`conversation:${conversationId}`);
      } catch (error) {
        logger.error('Failed to validate conversation membership', {
          error: (error as Error).message,
        });
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // Handle leaving private conversations
    socket.on('leave-private-conversation', (conversationId: string) => {
      if (!isNonEmptyString(conversationId)) {
        socket.emit('error', { message: 'Invalid conversationId' });
        return;
      }
      socket.leave(`conversation:${conversationId}`);
    });

    // Handle sending private messages
    socket.on('send-private-message', async (data: {
      conversationId: string;
      message: string;
      messageType?: string;
      messageId?: string;
      encryption?: { enabled: boolean; version: number; senderPublicKeyFingerprint?: string; fallbackReason?: string };
    }) => {
      try {
        // Defensive input validation
        if (!data || typeof data !== 'object') {
          socket.emit('error', { message: 'Invalid message payload' });
          return;
        }
        if (!isNonEmptyString(data.conversationId)) {
          socket.emit('error', { message: 'conversationId is required' });
          return;
        }
        if (!isNonEmptyString(data.message)) {
          socket.emit('error', { message: 'message is required' });
          return;
        }
        if (data.message.length > MAX_MESSAGE_LENGTH) {
          socket.emit('error', { message: `message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` });
          return;
        }

        const mongoDb = await connectMongoDB();
        const conversationsCollection = mongoDb.collection('privateConversations');
        
        // Verify user is part of the conversation
        const conversation = await conversationsCollection.findOne({
          id: data.conversationId,
          $or: [
            { participant1Id: user.userId },
            { participant2Id: user.userId }
          ]
        });

        if (!conversation) {
          socket.emit('error', { message: 'Unauthorized conversation access' });
          return;
        }

        if (data.messageType === 'encrypted' && !config.ENABLE_E2EE_CHAT) {
          socket.emit('error', { message: 'E2EE chat is disabled' });
          return;
        }

        // TRIPWIRE: detect E2EE fallback — client intended to encrypt but fell back to plaintext
        if (data.encryption?.fallbackReason && data.messageType !== 'encrypted') {
          e2eeFallbackCount++;
          logger.warn('TRIPWIRE: E2EE fallback to plaintext', {
            tripwire: 'e2eeFallback',
            count: e2eeFallbackCount,
            fallbackReason: data.encryption.fallbackReason,
            conversationId: data.conversationId,
            userId: user.userId,
          });
        }

        // Best-effort replay check (server cannot verify authenticity without decrypting)
        if (data.messageId && data.messageType === 'encrypted') {
          const messagesCollection = mongoDb.collection('chatMessages');
          const existing = await messagesCollection.findOne({
            conversationId: data.conversationId,
            messageId: data.messageId
          });
          if (existing) {
            socket.emit('error', { message: 'Duplicate message rejected' });
            return;
          }
        }

        // Create message and persist to database
        const messageData = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          conversationId: data.conversationId,
          message: data.message,
          messageType: data.messageType || 'text',
          messageId: data.messageId,
          fromUserId: user.userId,
          fromUserName: user.displayName,
          isRead: false,
          createdAt: new Date().toISOString(),
          encryption: data.encryption
        };

        // Store user message in database
        try {
          const messagesCollection = mongoDb.collection('chatMessages');
          await messagesCollection.insertOne({
            id: messageData.id,
            conversationId: messageData.conversationId,
            fromUserId: messageData.fromUserId,
            message: messageData.message,
            messageType: messageData.messageType,
            messageId: messageData.messageId,
            isRead: false,
            encryption: messageData.encryption,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        } catch (dbError) {
          logger.error('Failed to store user message', { error: (dbError as Error).message });
        }

        // Emit to all users in the conversation
        io.to(`conversation:${data.conversationId}`).emit('new-private-message', messageData);

        // Also emit to the other participant's personal room
        const otherUserId = conversation.participant1Id === user.userId 
          ? conversation.participant2Id 
          : conversation.participant1Id;
        io.to(`user:${otherUserId}`).emit('new-private-message', messageData);
        
        // Check if the other participant is the AI agent
        const aiUserId = await getAIAgentUserId();
        if (aiUserId && otherUserId === aiUserId) {
          logger.info('Message sent to AI, processing', { conversationId: data.conversationId });
          
          // Show typing indicator from AI
          io.to(`conversation:${data.conversationId}`).emit('user-private-typing', {
            userId: aiUserId,
            userName: 'Lancelot AI',
            conversationId: data.conversationId
          });
          
          // Send to AI agent and get response
          const traceId = getOrCreateTraceId({ headers: socket.handshake.headers as any });
          const aiResponse = await sendToAIAgent(
            data.conversationId,
            data.message,
            user.userId,
            user.displayName,
            data.messageType,
            data.encryption,
            data.messageId,
            traceId,
            {
              permissions: user.permissions,
              departmentId: user.departmentId,
              systemRole: user.systemRole,
            }
          );
          
          // Stop typing indicator
          io.to(`conversation:${data.conversationId}`).emit('user-private-stop-typing', {
            userId: aiUserId,
            conversationId: data.conversationId
          });
          
          // Create AI response message
          const aiMessageData = {
            id: `ai-${Date.now()}`,
            conversationId: data.conversationId,
            message: aiResponse.text,
            messageType: aiResponse.messageType || 'ai_response',
            fromUserId: aiUserId,
            fromUserName: 'Lancelot AI',
            isRead: false,
            createdAt: new Date().toISOString(),
            metadata: aiResponse.data,
            encryption: aiResponse.encryption
          };
          
          // Store AI message in database
          try {
            const messagesCollection = mongoDb.collection('chatMessages');
            await messagesCollection.insertOne({
              id: aiMessageData.id,
              conversationId: data.conversationId,
              fromUserId: aiUserId,
              message: aiResponse.text,
              messageType: aiMessageData.messageType,
              isRead: false,
              metadata: aiResponse.data,
              encryption: aiResponse.encryption,
              createdAt: new Date(),
              updatedAt: new Date()
            });
          } catch (dbError) {
            logger.error('Failed to store AI message', { error: (dbError as Error).message });
          }
          
          // Emit AI response to conversation room only (user is already in this room)
          io.to(`conversation:${data.conversationId}`).emit('new-private-message', aiMessageData);
          
          logger.info('AI response sent', { conversationId: data.conversationId });
        }
      } catch (error) {
        logger.error('Error sending private message', { error: (error as Error).message });
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('private-typing-start', (data: { conversationId: string }) => {
      if (!data || !isNonEmptyString(data.conversationId)) {
        socket.emit('error', { message: 'Invalid conversationId' });
        return;
      }
      socket.to(`conversation:${data.conversationId}`).emit('user-private-typing', {
        userId: user.userId,
        userName: user.displayName,
        conversationId: data.conversationId
      });
    });

    socket.on('private-typing-stop', (data: { conversationId: string }) => {
      if (!data || !isNonEmptyString(data.conversationId)) {
        socket.emit('error', { message: 'Invalid conversationId' });
        return;
      }
      socket.to(`conversation:${data.conversationId}`).emit('user-private-stop-typing', {
        userId: user.userId,
        conversationId: data.conversationId
      });
    });

    socket.on('disconnect', () => {
      const userName = user?.displayName || 'unknown';
      logger.info('User disconnected', { userId: user?.userId, displayName: userName });
    });
  });

  return io;
}
