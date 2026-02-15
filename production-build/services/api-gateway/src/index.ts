import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join } from 'path';
import { WebSocketServer } from 'ws';
const { useServer } = require('graphql-ws/use/ws');
import { makeExecutableSchema } from '@graphql-tools/schema';
import { config } from './config';
import { broadcastResolvers } from './resolvers/broadcast';
import { enhancedBroadcastResolvers } from './resolvers/broadcast-enhanced';
import { shiftsResolvers } from './resolvers/shifts';
import { userResolvers } from './resolvers/user';
import { chatResolvers } from './resolvers/chat';
import { dashboardResolvers } from './resolvers/dashboard';
import { vizrtResolvers } from './resolvers/vizrt';
import { vendorResolvers } from './resolvers/vendor';
import { mcrResolvers } from './resolvers/mcrResolvers';
import { apiLimiter, graphqlLimiter, websocketLimiter } from './middleware/rateLimiter';
import { sanitizeError, expressErrorHandler } from './middleware/errorHandler';
import { securityMiddleware } from './middleware/security';
import { connectMongoose, closeMongoDB } from './config/mongodb';
import { jwtService } from './services/jwtService';
import bcrypt from 'bcrypt';
import { connectMongoDB } from './config/mongodb';
import { setupChatSocket } from './socket/chat-socket';

// Load GraphQL schema
const typeDefs = readFileSync(join(__dirname, 'schema/schema.graphql'), 'utf8');

// Merge only broadcast-related resolvers
const resolvers = {
  Query: {
    // Use enhanced resolvers as primary (they have more features)
    ...enhancedBroadcastResolvers.Query,
    // Only add non-conflicting resolvers from basic broadcast resolvers
    departments: broadcastResolvers.Query.departments,
    warehouseEquipment: broadcastResolvers.Query.warehouseEquipment,
    equipmentAssignmentsByEvent: broadcastResolvers.Query.equipmentAssignmentsByEvent,
    equipmentAssignments: broadcastResolvers.Query.equipmentAssignments,
    equipmentHistory: broadcastResolvers.Query.equipmentHistory,
    // Add shifts queries
    ...shiftsResolvers.Query,
    // Add user queries (overriding users from shifts)
    ...userResolvers.Query,
    // Add chat queries
    ...chatResolvers.Query,
    // Add dashboard queries
    ...dashboardResolvers.Query,
    // Add vizrt queries
    ...vizrtResolvers.Query,
    // Add vendor queries
    ...vendorResolvers.Query,
    // Add MCR queries
    ...mcrResolvers.Query,
    health: () => ({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    })
  },
  Mutation: {
    // Use enhanced resolvers as primary
    ...enhancedBroadcastResolvers.Mutation,
    // Add equipment-specific mutations from basic resolvers
    createEquipment: broadcastResolvers.Mutation.createEquipment,
    updateEquipment: broadcastResolvers.Mutation.updateEquipment,
    deleteEquipment: broadcastResolvers.Mutation.deleteEquipment,
    returnEquipmentFromEvent: broadcastResolvers.Mutation.returnEquipmentFromEvent,
    transferEquipmentBetweenEvents: broadcastResolvers.Mutation.transferEquipmentBetweenEvents,
    // Equipment Assignment mutations
    createEquipmentAssignment: broadcastResolvers.Mutation.createEquipmentAssignment,
    updateEquipmentAssignment: broadcastResolvers.Mutation.updateEquipmentAssignment,
    deleteEquipmentAssignment: broadcastResolvers.Mutation.deleteEquipmentAssignment,
    updateWarehouseEquipmentQuantity: broadcastResolvers.Mutation.updateWarehouseEquipmentQuantity,
    adjustEquipmentQuantity: broadcastResolvers.Mutation.adjustEquipmentQuantity,
    disableEquipment: broadcastResolvers.Mutation.disableEquipment,
    enableEquipment: broadcastResolvers.Mutation.enableEquipment,
    undoEquipmentTransfer: broadcastResolvers.Mutation.undoEquipmentTransfer,
    // Add shifts mutations
    ...shiftsResolvers.Mutation,
    // Add user mutations
    ...userResolvers.Mutation,
    // Add chat mutations
    ...chatResolvers.Mutation,
    // Add dashboard mutations
    ...dashboardResolvers.Mutation,
    // Add vizrt mutations
    ...vizrtResolvers.Mutation,
    // Add vendor mutations
    ...vendorResolvers.Mutation,
    // Add MCR mutations
    ...mcrResolvers.Mutation,
    // Authentication mutation - MongoDB only
    login: async (_: any, args: { email: string; password: string }, context: any) => {
      console.log('🔐 Login attempt:', { email: args.email, passwordLength: args.password.length });
      
      // Use MongoDB
      const db = await connectMongoDB();
      const usersCollection = db.collection('users');
      
      // Debug: Check database name and count
      console.log('📁 Database:', db.databaseName);
      const userCount = await usersCollection.countDocuments();
      console.log('👥 Total users in collection:', userCount);
      
      // Find user by email (case-insensitive)
      const user = await usersCollection.findOne({ 
        email: { $regex: new RegExp(`^${args.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
      });
      
      console.log('🔍 User lookup result:', user ? { email: user.email, id: user._id } : 'NOT FOUND');
      
      if (!user) {
        throw new Error('Invalid email or password');
      }
      
      // For development, accept simple password
      let isValidPassword = false;
      console.log('🔑 Password check:', {
        env: process.env.NODE_ENV,
        isTest123: args.password === 'test123',
        hasUserPassword: !!user.password,
        isHashed: user.password?.startsWith('$2')
      });
      
      if (process.env.NODE_ENV === 'development' && args.password === 'test123') {
        console.log('✅ Using development password');
        isValidPassword = true;
      } else if (user.password && user.password.startsWith('$2')) {
        isValidPassword = await bcrypt.compare(args.password, user.password);
        console.log('🔐 Bcrypt comparison result:', isValidPassword);
      } else {
        // Plain text comparison for development
        isValidPassword = user.password === args.password;
        console.log('📝 Plain text comparison result:', isValidPassword);
      }
      
      if (!isValidPassword) {
        console.log('❌ Password validation failed');
        throw new Error('Invalid email or password');
      }
      
      // Update last login
      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { lastLogin: new Date() } }
      );
      
      // Generate JWT token with user data
      const token = jwtService.sign({
        userId: user._id.toString(),
        email: user.email,
        firstName: user.firstName || 'User',
        lastName: user.lastName || '',
        displayName: `${user.firstName || 'User'} ${user.lastName || ''}`.trim(),
        role: user.role || 'user',
        systemRole: user.systemRole || 'DEPARTMENT_USER',
        departments: user.departments || []
      });
      
      return {
        token,
        user: {
          id: user._id.toString(),
          firstName: user.firstName || 'User',
          lastName: user.lastName || '',
          displayName: `${user.firstName || 'User'} ${user.lastName || ''}`.trim(),
          email: user.email,
          systemRole: user.systemRole || 'DEPARTMENT_USER',
          departments: user.departments || []
        }
      };
    }
  },
  Subscription: {
    ...enhancedBroadcastResolvers.Subscription,
    // Add shifts subscriptions
    ...(shiftsResolvers.Subscription || {}),
    // Add MCR subscriptions
    ...(mcrResolvers.Subscription || {}),
  },
  // Type resolvers - removed as they're not needed for the simplified schema
  // Scalar resolvers
  DateTime: {
    serialize: (value: any) => value,
    parseValue: (value: any) => value,
    parseLiteral: (ast: any) => ast.value,
  },
  JSON: {
    serialize: (value: any) => value,
    parseValue: (value: any) => value,
    parseLiteral: (ast: any) => ast.value,
  },
  // Add shifts field resolvers (excluding Query, Mutation, Subscription)
  Shift: shiftsResolvers.Shift,
  ShiftTemplate: shiftsResolvers.ShiftTemplate,
  ShiftSwapRequest: shiftsResolvers.ShiftSwapRequest,
  VacationRequest: shiftsResolvers.VacationRequest,
  AvailabilityConstraint: shiftsResolvers.AvailabilityConstraint,
  EmployeeSettings: shiftsResolvers.EmployeeSettings,
  // Add user field resolver
  User: userResolvers.User,
  // Add MCR field resolvers
  MCREvent: mcrResolvers.MCREvent,
  MCRBulletinPost: mcrResolvers.MCRBulletinPost,
  ActivityRow: mcrResolvers.ActivityRow,
};

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

async function startServer() {
  try {
    // Connect to MongoDB first
    await connectMongoose();
    
    const app = express();
    const PORT = process.env.PORT || config.PORT || 4000;

    // Basic middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV
      });
    });

    // Debug endpoint to check JWT token
    app.get('/debug/jwt', (req, res) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'No JWT token provided' });
        }
        
        const token = authHeader.substring(7);
        const payload = jwtService.verify(token);
        
        res.json({
          success: true,
          tokenData: {
            userId: payload.userId,
            userIdType: typeof payload.userId,
            email: payload.email,
            role: payload.role,
            systemRole: payload.systemRole
          }
        });
      } catch (error: any) {
        res.status(401).json({ error: 'Invalid token', message: error.message });
      }
    });

    // Apply rate limiting to all routes
    app.use(apiLimiter);

    // CORS configuration
    app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
          return callback(null, true);
        }

        // Always allow in development
        if (config.NODE_ENV !== 'production') {
          return callback(null, true);
        }

        // In production, check allowed list
        const isAllowed = config.CORS_ALLOWED_ORIGINS.includes(origin);
        if (isAllowed) {
          return callback(null, true);
        } else {
          return callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: config.CORS_ALLOW_CREDENTIALS,
      methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-apollo-operation-name', 'apollo-require-preflight'],
      exposedHeaders: ['x-custom-header'],
      maxAge: 86400, // 24 hours
    }));

    // Apply security middleware
    app.use(securityMiddleware());
  
    // Create HTTP server
    const httpServer = createServer(app);

    // Create WebSocket server for subscriptions
    const wsServer = new WebSocketServer({
      server: httpServer,
      path: '/graphql',
      verifyClient: (info, cb) => {
        // Apply rate limiting to WebSocket connections
        const req = info.req as any;
        websocketLimiter(req, {} as any, (err?: any) => {
          cb(!err, err ? 429 : 200);
        });
      }
    });

    // Set up WebSocket server for GraphQL subscriptions
    const serverCleanup = useServer({ schema }, wsServer);

    // Set up Socket.IO for chat
    const chatSocket = setupChatSocket(httpServer);

    // Create Apollo Server
    const server = new ApolloServer({
      schema,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer }),
        {
          async serverWillStart() {
            return {
              async drainServer() {
                await serverCleanup.dispose();
              },
            };
          },
        },
      ],
      formatError: (formattedError, error) => {
        // Use the sanitizeError function appropriately
        return formattedError;
      },
    });

    // Start Apollo Server
    await server.start();

    // Apply GraphQL middleware with rate limiting
    app.use(
      '/graphql', 
      graphqlLimiter,
      cors({
        origin: config.CORS_ALLOWED_ORIGINS,
        credentials: config.CORS_ALLOW_CREDENTIALS,
      }),
      express.json(),
      expressMiddleware(server, {
        context: async ({ req }) => {
          // Log the request details
          const body = req.body;
          console.log('\n📨 GraphQL Request:', {
            operationName: body?.operationName || 'UNKNOWN',
            query: body?.query ? body.query.substring(0, 100) + '...' : 'NO QUERY',
            hasVariables: !!body?.variables
          });
          
          // Validate JWT token from authorization header
          try {
            const authHeader = req.headers.authorization;
            console.log('🔍 Auth header:', authHeader ? `Present: ${authHeader.substring(0, 50)}...` : 'Missing');
            
            if (authHeader && authHeader.startsWith('Bearer ')) {
              const token = authHeader.substring(7);
              console.log('🔑 Token first 20 chars:', token.substring(0, 20) + '...');
              
              const payload = jwtService.verify(token);
              
              console.log('✅ JWT verified successfully!');
              console.log('📦 Payload:', {
                userId: payload.userId,
                email: payload.email,
                role: payload.role,
                systemRole: payload.systemRole,
                departmentId: payload.departmentId,
                iat: payload.iat,
                exp: payload.exp
              });
              
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
              
              console.log('🔧 Returning context with user:', contextUser);
              
              // Get MongoDB connection for context
              const mongoDb = await connectMongoDB();
              
              return { 
                user: contextUser, 
                userId: payload.userId, // Add userId at the root level for backward compatibility
                mongoDb 
              };
            } else {
              console.log('⚠️ No Bearer token in auth header');
            }
          } catch (error: any) {
            // Invalid token, continue without user
            console.error('❌ JWT validation error:', error.message || error);
            console.error('Stack:', error.stack);
          }
          
          console.log('⚠️ No valid auth - returning null user');
          // No valid token, but still provide MongoDB connection
          const mongoDb = await connectMongoDB();
          return { user: null, mongoDb };
        },
      })
    );

    // Add Express error handler as last middleware
    app.use(expressErrorHandler);

    // Start HTTP server
    await new Promise<void>((resolve) => {
      httpServer.listen({ port: PORT }, () => {
        console.log(`🚀 Broadcast Planning Server ready!`);
        console.log(`📍 GraphQL endpoint: http://localhost:${PORT}/graphql`);
        console.log(`📡 GraphQL WebSocket Subscriptions ready at: ws://localhost:${PORT}/graphql`);
        console.log(`🏥 Health check: http://localhost:${PORT}/health`);
        console.log(`📦 Loaded resolvers: broadcasts, broadcasts-enhanced`);
        console.log(`🍃 MongoDB: Connected to broadcast collections`);
        resolve();
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM signal received: closing HTTP server');
      await server.stop();
      await closeMongoDB();
      httpServer.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  console.error('Server startup error:', error);
  process.exit(1);
}); 