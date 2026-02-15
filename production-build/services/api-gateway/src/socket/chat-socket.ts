import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { jwtService } from '../services/jwtService';
import { connectMongoDB } from '../config/mongodb';
import { config } from '../config';

interface SocketUser {
  userId: string;
  email: string;
  displayName: string;
}

export function setupChatSocket(httpServer: HttpServer) {
  console.log('[Socket.IO] Setting up chat socket server');

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

  console.log('[Socket.IO] Server configured with CORS origins:', isProd ? (allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : '[PROD: no allowlist configured, allowing all]') : '[DEV: allowing all origins]');

  // Authentication middleware
  io.use(async (socket, next) => {
    console.log('[Socket.IO] New connection attempt from:', socket.handshake.address);
    console.log('[Socket.IO] Handshake auth:', socket.handshake.auth);
    console.log('[Socket.IO] Handshake headers:', socket.handshake.headers);
    
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      console.log('[Socket.IO] Token found:', !!token);
      console.log('[Socket.IO] Token length:', token?.length);
      console.log('[Socket.IO] Token preview:', token?.substring(0, 50) + '...');
      
      if (!token) {
        console.error('[Socket.IO] ❌ No token provided');
        return next(new Error('Authentication required'));
      }

      console.log('[Socket.IO] Verifying JWT token...');
      const payload = jwtService.verify(token);
      console.log('[Socket.IO] ✅ JWT verified successfully:', {
        userId: payload.userId,
        email: payload.email,
        displayName: payload.displayName || `${payload.firstName} ${payload.lastName}`.trim()
      });
      
      (socket as any).user = {
        userId: payload.userId,
        email: payload.email,
        displayName: payload.displayName || `${payload.firstName} ${payload.lastName}`.trim()
      };
      
      next();
    } catch (err: any) {
      console.error('[Socket.IO] ❌ Authentication error:', err.message);
      console.error('[Socket.IO] Full error:', err);
      next(new Error('Authentication failed: ' + err.message));
    }
  });

  io.on('connection', async (socket) => {
    const user = (socket as any).user as SocketUser;
    console.log(`User ${user.displayName} connected`);

    // Join user to their personal room
    socket.join(`user:${user.userId}`);

    // Handle joining private conversations
    socket.on('join-private-conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    // Handle leaving private conversations
    socket.on('leave-private-conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Handle sending private messages
    socket.on('send-private-message', async (data: {
      conversationId: string;
      message: string;
      messageType?: string;
    }) => {
      try {
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

        // Create message (message creation is handled by GraphQL mutation)
        // Just emit the real-time event
        const messageData = {
          id: `temp-${Date.now()}`,
          conversationId: data.conversationId,
          message: data.message,
          messageType: data.messageType || 'text',
          fromUserId: user.userId,
          fromUserName: user.displayName,
          isRead: false,
          createdAt: new Date().toISOString()
        };

        // Emit to all users in the conversation
        io.to(`conversation:${data.conversationId}`).emit('new-private-message', messageData);

        // Also emit to the other participant's personal room
        const otherUserId = conversation.participant1Id === user.userId 
          ? conversation.participant2Id 
          : conversation.participant1Id;
        io.to(`user:${otherUserId}`).emit('new-private-message', messageData);
      } catch (error) {
        console.error('Error sending private message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('private-typing-start', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('user-private-typing', {
        userId: user.userId,
        userName: user.displayName,
        conversationId: data.conversationId
      });
    });

    socket.on('private-typing-stop', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('user-private-stop-typing', {
        userId: user.userId,
        conversationId: data.conversationId
      });
    });

    socket.on('disconnect', () => {
      console.log(`User ${user.displayName} disconnected`);
    });
  });

  return io;
}
