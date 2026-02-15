/**
 * Lancelot AI Agent Service
 * 
 * Main entry point for the AI agent service.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { config } from './config';
import { routes } from './api';
import { traceMiddleware, requestLogger, errorHandler } from './api/middleware';
import { createLogger } from './utils/logger';
import { getLLMProvider } from './llm';
import { initializeTools } from './tools';
import { initializeTrustedSources } from './data/trusted-sources-store';
import { initializeNewsCache } from './data/news-cache';
import { 
  chatRateLimiter, 
  healthRateLimiter 
} from './middleware/rate-limiter';
import { 
  errorRecoveryMiddleware 
} from './middleware/error-recovery';
import { 
  metricsMiddleware, 
  metricsHandler, 
  healthCheckHandler 
} from './middleware/monitoring';

const logger = createLogger('main');

async function main(): Promise<void> {
  logger.info('Starting Lancelot AI Agent Service', {
    port: config.port,
    environment: config.environment,
    llmProvider: config.llm.provider,
    primaryModel: config.llm.primaryModel,
  });
  
  // Create Express app
  const app = express();
  
  // Middleware
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(traceMiddleware);
  app.use(requestLogger);
  app.use(metricsMiddleware);
  
  // Health and metrics endpoints (with rate limiting)
  // Canonical health endpoint
  app.get('/health', healthRateLimiter, healthCheckHandler);
  app.get('/metrics', healthRateLimiter, metricsHandler);
  // DEPRECATED alias — remove after 2026-06-30 (use /health instead)
  app.get('/ai/health', healthRateLimiter, healthCheckHandler);
  
  // Mount API routes with rate limiting
  app.use('/ai/chat', chatRateLimiter);
  app.use('/ai', routes);
  
  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      service: 'Lancelot AI Agent',
      version: '1.0.0',
      status: 'running',
      endpoints: [
        'GET /health (canonical)',
        'GET /ai/health (deprecated alias, remove after 2026-06-30)',
        'GET /ai/status',
        'POST /ai/chat',
        'POST /ai/lineup',
        'POST /ai/cg/spec',
        'POST /ai/shifts/solve',
        'GET /ai/news/brief',
        'GET /ai/rights/board',
      ],
    });
  });
  
  // Error handlers
  app.use(errorRecoveryMiddleware);
  app.use(errorHandler);
  
  // Initialize data stores
  try {
    await initializeTrustedSources();
    await initializeNewsCache();
    logger.info('Data stores initialized');
  } catch (error) {
    logger.warn('Failed to initialize data stores', {
      error: (error as Error).message,
    });
  }
  
  // Initialize tools
  try {
    await initializeTools();
    logger.info('Tools initialized');
  } catch (error) {
    logger.warn('Failed to initialize tools', {
      error: (error as Error).message,
    });
  }
  
  // Check LLM availability
  try {
    const provider = getLLMProvider();
    const isAvailable = await provider.isAvailable();
    
    if (isAvailable) {
      const models = await provider.listModels();
      logger.info('LLM provider available', {
        provider: provider.getName(),
        models: models.slice(0, 5), // First 5 models
      });
    } else {
      logger.warn('LLM provider not available - agent will operate in limited mode');
    }
  } catch (error) {
    logger.warn('Failed to check LLM availability', {
      error: (error as Error).message,
    });
  }
  
  // Start server
  const server = app.listen(config.port, () => {
    logger.info(`AI Agent service listening on port ${config.port}`);
    logger.info(`Health check: http://localhost:${config.port}/health`);
    logger.info(`Status: http://localhost:${config.port}/ai/status`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

// Run main
main().catch((error) => {
  logger.error('Failed to start AI Agent service', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
