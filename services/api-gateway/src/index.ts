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
import { warehouseResolvers } from './resolvers/warehouse';
import { mcrResolvers } from './resolvers/mcrResolvers';
import { aiResolvers } from './resolvers/ai';
import { authResolvers } from './resolvers/auth';
import { saasResolvers } from './resolvers/saas';
import { apiLimiter, graphqlLimiter, websocketLimiter } from './middleware/rateLimiter';
import { sanitizeError, expressErrorHandler } from './middleware/errorHandler';
import { createGraphqlLoggingPlugin } from './middleware/graphqlLogging';
import { securityMiddleware } from './middleware/security';
import { connectMongoose, closeMongoDB } from './config/mongodb';
import { jwtService } from './services/jwtService';
import { setupChatSocket, getE2eeFallbackCount } from './socket/chat-socket';
import { buildGraphQLContext, buildContextFromToken } from './middleware/context';
import { pubsub } from './utils/pubsub';
import { startScheduler, stopScheduler } from './services/jobScheduler';
import { metrics } from './services/metrics';
import { warehouseRoutes } from './routes/warehouseRoutes';
import { trackingRoutes } from './routes/trackingRoutes';
import { externalApiRoutes } from './routes/externalApiRoutes';
import { startWebhookRetryWorker, stopWebhookRetryWorker } from './services/webhookDelivery.service';
import { equipmentSetsResolvers } from './resolvers/equipmentSets';
import { equipmentCategoryResolvers } from './resolvers/equipmentCategory';
import { internalAssignmentsResolvers } from './resolvers/internalAssignments';
import { seedEquipmentCategories } from './scripts/seed-equipment-categories';
import { venueResolvers } from './resolvers/venues';
import { trackingResolvers } from './resolvers/tracking';
import { roleTemplateResolvers } from './resolvers/roleTemplate';
import { flightBoardResolvers } from './resolvers/flightBoard';
import { departmentManagementResolvers } from './resolvers/departmentManagement';
import { reloadDepartmentRoleRegistry } from './services/departmentRegistry';
import { shiftSetupResolvers } from './resolvers/shiftSetup';
import { startTrackerIngest, stopTrackerIngest } from './services/trackerIngestService';

// Load GraphQL schema. The shifts sub-app extends the root types in a separate
// file so the new APL / ShiftTypeDef / Preference / SchedulingRule types live
// alongside their resolvers without bloating the main schema.
const typeDefs = [
  readFileSync(join(__dirname, 'schema/schema.graphql'), 'utf8'),
  readFileSync(join(__dirname, 'schema/shiftSetup.graphql'), 'utf8'),
].join('\n');

// Merge only broadcast-related resolvers
const resolvers = {
  Query: {
    // Use enhanced resolvers as primary (they have more features)
    ...enhancedBroadcastResolvers.Query,
    // Only add non-conflicting resolvers from basic broadcast resolvers
    departments: broadcastResolvers.Query.departments,
    warehouseEquipment: broadcastResolvers.Query.warehouseEquipment,
    warehouseEquipmentStats: broadcastResolvers.Query.warehouseEquipmentStats,
    warehouseEquipmentForPicker: broadcastResolvers.Query.warehouseEquipmentForPicker,
    warehouseEquipmentCategories: broadcastResolvers.Query.warehouseEquipmentCategories,
    // Single source of truth for equipment categories (slug + Hebrew label).
    equipmentCategories: equipmentCategoryResolvers.Query.equipmentCategories,
    equipmentAssignmentsByEvent: broadcastResolvers.Query.equipmentAssignmentsByEvent,
    equipmentAssignments: broadcastResolvers.Query.equipmentAssignments,
    equipmentHistory: broadcastResolvers.Query.equipmentHistory,
    eventsWithAssignedEquipment: broadcastResolvers.Query.eventsWithAssignedEquipment,
    externalBroadcastPresets: broadcastResolvers.Query.externalBroadcastPresets,
    externalBroadcastPreset: broadcastResolvers.Query.externalBroadcastPreset,
    venues: venueResolvers.Query.venues,
    venue: venueResolvers.Query.venue,
    // Equipment Sets
    equipmentSets: equipmentSetsResolvers.Query.equipmentSets,
    equipmentSet: equipmentSetsResolvers.Query.equipmentSet,
    equipmentSetByBarcode: equipmentSetsResolvers.Query.equipmentSetByBarcode,
    staleEquipment: equipmentSetsResolvers.Query.staleEquipment,
    // Internal worker-based equipment assignments
    internalEquipmentAssignments: internalAssignmentsResolvers.Query.internalEquipmentAssignments,
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
    // Add warehouse (configurable storage location) queries
    ...warehouseResolvers.Query,
    // Add MCR queries
    ...mcrResolvers.Query,
    // Add AI queries
    ...aiResolvers.Query,
    // Add SaaS Platform queries
    ...saasResolvers.Query,
    // BLE Tracking queries
    ...trackingResolvers.Query,
    // Role Templates
    ...roleTemplateResolvers.Query,
    // Flight Board queries
    ...flightBoardResolvers.Query,
    // Department management & assignment form configuration
    ...departmentManagementResolvers.Query,
    // Shifts sub-app first-class concepts (APL, ShiftTypeDef, Categories, Rules, Preferences, AI)
    ...shiftSetupResolvers.Query,
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
    createExternalBroadcastPreset: broadcastResolvers.Mutation.createExternalBroadcastPreset,
    updateExternalBroadcastPreset: broadcastResolvers.Mutation.updateExternalBroadcastPreset,
    deleteExternalBroadcastPreset: broadcastResolvers.Mutation.deleteExternalBroadcastPreset,
    // EquipmentCategory CRUD (admin-only, WAREHOUSE_MANAGE).
    createEquipmentCategory: equipmentCategoryResolvers.Mutation.createEquipmentCategory,
    updateEquipmentCategory: equipmentCategoryResolvers.Mutation.updateEquipmentCategory,
    deleteEquipmentCategory: equipmentCategoryResolvers.Mutation.deleteEquipmentCategory,
    createVenue: venueResolvers.Mutation.createVenue,
    updateVenue: venueResolvers.Mutation.updateVenue,
    deleteVenue: venueResolvers.Mutation.deleteVenue,
    // Equipment Sets
    createEquipmentSet: equipmentSetsResolvers.Mutation.createEquipmentSet,
    updateEquipmentSet: equipmentSetsResolvers.Mutation.updateEquipmentSet,
    deleteEquipmentSet: equipmentSetsResolvers.Mutation.deleteEquipmentSet,
    assignEquipmentSetToEvent: equipmentSetsResolvers.Mutation.assignEquipmentSetToEvent,
    returnEquipmentSet: equipmentSetsResolvers.Mutation.returnEquipmentSet,
    // Internal worker-based equipment assignments
    assignEquipmentToWorker: internalAssignmentsResolvers.Mutation.assignEquipmentToWorker,
    returnInternalEquipmentAssignment: internalAssignmentsResolvers.Mutation.returnInternalEquipmentAssignment,
    transferInternalEquipmentAssignment: internalAssignmentsResolvers.Mutation.transferInternalEquipmentAssignment,
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
    // Add warehouse (configurable storage location) mutations
    ...warehouseResolvers.Mutation,
    // Add MCR mutations
    ...mcrResolvers.Mutation,
    // Add AI mutations
    ...aiResolvers.Mutation,
    // Authentication mutation - MongoDB only
    ...authResolvers.Mutation,
    // SaaS Platform mutations
    ...saasResolvers.Mutation,
    // BLE Tracking mutations
    ...trackingResolvers.Mutation,
    // Role Templates
    ...roleTemplateResolvers.Mutation,
    // Flight Board mutations
    ...flightBoardResolvers.Mutation,
    // Department management & assignment form configuration
    ...departmentManagementResolvers.Mutation,
    // Shifts sub-app first-class concepts (APL, ShiftTypeDef, Categories, Rules, Preferences, AI)
    ...shiftSetupResolvers.Mutation,
  },
  Subscription: {
    ...enhancedBroadcastResolvers.Subscription,
    // Add shifts subscriptions
    ...(shiftsResolvers.Subscription || {}),
    // Add MCR subscriptions
    ...(mcrResolvers.Subscription || {}),
    // Add SaaS subscriptions
    ...(saasResolvers.Subscription || {}),
    // BLE Tracking subscriptions
    ...(trackingResolvers.Subscription || {}),
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
  // Shifts sub-app field resolvers (id coercion + nested fetches)
  APL: shiftSetupResolvers.APL,
  ShiftTypeDef: shiftSetupResolvers.ShiftTypeDef,
  ShiftCategory: shiftSetupResolvers.ShiftCategory,
  ConstraintRule: shiftSetupResolvers.ConstraintRule,
  SchedulingRule: shiftSetupResolvers.SchedulingRule,
  Preference: shiftSetupResolvers.Preference,
  DepartmentShiftSetup: shiftSetupResolvers.DepartmentShiftSetup,
  // Add user field resolver
  User: userResolvers.User,
  // Role template field resolver
  RoleTemplate: roleTemplateResolvers.RoleTemplate,
  // Equipment set field resolver
  EquipmentSetItem: equipmentSetsResolvers.EquipmentSetItem,
  // Internal equipment assignment field resolvers (lazy `equipment` and `assignedToUser`)
  InternalEquipmentAssignment: internalAssignmentsResolvers.InternalEquipmentAssignment,
  // Add MCR field resolvers
  MCREvent: mcrResolvers.MCREvent,
  MCRBulletinPost: mcrResolvers.MCRBulletinPost,
  ActivityRow: mcrResolvers.ActivityRow,
  MCRDailyCheckEntry: mcrResolvers.MCRDailyCheckEntry,
  MCRExchangeGroup: mcrResolvers.MCRExchangeGroup,
  // Flight Board field resolvers
  FlightBoard: flightBoardResolvers.FlightBoard,
};

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

async function startServer() {
  try {
    // Connect to MongoDB first
    await connectMongoose();

    // Load admin-managed department role permissions into the RBAC matrix
    // before serving traffic. Subsequent admin mutations call the same
    // helper so changes are picked up without a restart.
    await reloadDepartmentRoleRegistry();

    // Idempotent seed for the equipment_categories collection. Inserts any
    // categories from the legacy hardcoded map (or distinct equipment.category
    // slugs) that don't yet exist in the new collection. Never overwrites
    // admin edits — safe to run on every boot.
    try {
      await seedEquipmentCategories();
    } catch (err) {
      console.error('Failed to seed equipment categories (continuing startup):', err);
    }
    
    const app = express();
    const PORT = process.env.PORT || config.PORT || 4000;

    // Basic middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Health check endpoint
    app.get('/health', (req, res) => {
      const e2eeFallbacks = getE2eeFallbackCount();
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV,
        tripwires: e2eeFallbacks > 0
          ? { e2eeFallbackCount: e2eeFallbacks }
          : undefined,
      });
    });

    // Prometheus metrics endpoint
    app.get('/metrics', (req, res) => {
      res.set('Content-Type', 'text/plain');
      res.send(metrics.getPrometheusOutput());
    });

    // JSON metrics endpoint (for dashboard)
    app.get('/metrics/json', (req, res) => {
      res.json(metrics.getJsonMetrics());
    });

    // Debug endpoint to inspect a JWT token. Strictly gated to non-production environments
    // because it lets callers introspect token contents and is a recon tool for attackers.
    if (config.NODE_ENV !== 'production') {
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
    }

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

    // Warehouse PDF import routes (must be after CORS middleware)
    app.use('/api/warehouse', warehouseRoutes);

    // BLE tracking ingest routes
    app.use('/api/tracking', trackingRoutes);

    // Public read-only REST API for external partner dashboards (shared
    // engineering equipment, webhook delivery status). Authenticated via
    // `X-API-Key` and rate-limited per-key inside the router itself.
    app.use('/api/v1/external', externalApiRoutes);

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

    // Cap concurrent WebSocket connections per process to bound resource usage.
    // Set WS_MAX_CONNECTIONS in env to override (default 1000).
    const WS_MAX_CONNECTIONS = parseInt(process.env.WS_MAX_CONNECTIONS || '1000', 10);
    let activeWsConnections = 0;

    // Set up WebSocket server for GraphQL subscriptions.
    // Authenticates each subscription connection via the connectionParams
    // payload (Authorization header) sent by the client during the
    // graphql-ws connection_init message.
    const serverCleanup = useServer(
      {
        schema,
        // `context` runs for every operation; we pass through the same context
        // built during onConnect (cached on extra) so resolvers see the same user.
        context: async (ctx: any) => {
          return ctx.extra?.gqlContext ?? { pubsub, user: null };
        },
        // Authenticate the WebSocket connection itself. Tokens may arrive as
        // `Authorization: Bearer <token>`, `authorization` (lowercase), or a
        // bare `token` field, depending on the client.
        onConnect: async (ctx: any) => {
          if (activeWsConnections >= WS_MAX_CONNECTIONS) {
            console.warn(`WS connection rejected: cap of ${WS_MAX_CONNECTIONS} reached`);
            return false;
          }

          const params = ctx.connectionParams || {};
          const rawAuth =
            params.Authorization ||
            params.authorization ||
            params.token ||
            '';
          const token = typeof rawAuth === 'string' && rawAuth.startsWith('Bearer ')
            ? rawAuth.substring(7)
            : rawAuth;

          const gqlContext = await buildContextFromToken(token);

          // Reject unauthenticated connections in production. In development we
          // allow anonymous connections to keep the GraphQL playground usable;
          // individual subscription resolvers still gate themselves with
          // requireAuth/requirePermission.
          if (!gqlContext.user && config.NODE_ENV === 'production') {
            console.warn('WS connection rejected: missing or invalid auth token');
            return false;
          }

          activeWsConnections += 1;
          ctx.extra = ctx.extra || {};
          ctx.extra.gqlContext = gqlContext;
          return true;
        },
        onDisconnect: () => {
          activeWsConnections = Math.max(0, activeWsConnections - 1);
        },
      },
      wsServer
    );

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
        createGraphqlLoggingPlugin(),
      ],
      formatError: (formattedError, error) => {
        // Run every GraphQL error through the central sanitizer so production
        // never leaks raw stack traces, DB errors, or vendor messages to clients.
        // Non-production environments keep the original error for debuggability.
        try {
          const inputErr = (error instanceof Error ? error : new Error(formattedError.message));
          const sanitized = sanitizeError(inputErr as any);
          return {
            ...formattedError,
            message: sanitized.message,
            extensions: {
              ...formattedError.extensions,
              ...(sanitized.extensions || {}),
            },
          };
        } catch {
          return formattedError;
        }
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
        context: async ({ req }) => buildGraphQLContext(req),
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
        console.log(`📊 Metrics endpoint: http://localhost:${PORT}/metrics`);
        
        // Start background job scheduler
        startScheduler();
        console.log(`⏰ Background job scheduler started`);
        
        // Start BLE tracker MQTT ingest
        startTrackerIngest();
        console.log(`📡 BLE tracker ingest service started`);

        // Start outbound webhook retry worker for the external partner API
        // (no-op when EXTERNAL_WEBHOOK_ENABLED is not "true").
        startWebhookRetryWorker();
        console.log(`🪝 External webhook delivery worker started`);

        resolve();
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM signal received: closing HTTP server');
      stopTrackerIngest();
      stopWebhookRetryWorker();
      stopScheduler();
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