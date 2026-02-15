import rateLimit, { Options, RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request, Response } from 'express';
import { config } from '../config';

// Create Redis client for rate limiting
const redisClient = config.NODE_ENV === 'production' && config.REDIS_URL ? new Redis(config.REDIS_URL, {
  keyPrefix: 'rate-limit:',
}) : null;

// Helper to create rate limiter with specific options
function createLimiter(options: Partial<Options>): RateLimitRequestHandler {
  // In non-production environments we disable rate limiting entirely so that
  // developers are never blocked by 429 responses when running the stack
  // locally or executing automated tests.
  if (config.NODE_ENV !== 'production') {
    return ((req, _res, next) => next()) as RateLimitRequestHandler;
  }

  const defaultOptions: Partial<Options> = {
    standardHeaders: true,
    legacyHeaders: false,
    // Custom handler to ensure rate-limited responses include the
    // proper CORS headers so that the browser doesn’t block them.
    handler: (req: Request, res: Response) => {
      const origin = req.headers.origin as string | undefined;

      // Reflect the origin header (if present) so that the browser
      // treats the response as CORS-compliant. This mirrors the behaviour
      // of the global `cors` middleware but for the early 429 response that
      // bypasses it.
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        // Let caches know that the response depends on the Origin header.
        res.setHeader('Vary', 'Origin');
      }

      // If credentials are allowed in development we also expose that here.
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      res.status(429).json({
        error: 'Too many requests',
        message: 'Please try again later',
        retryAfter: res.getHeader('Retry-After'),
      });
    },
  };

  // Use Redis store in production, memory store in development
  if (redisClient) {
    const storeOptions = {
      sendCommand: (...args: string[]) => (redisClient as any).call(...args),
      client: redisClient,
      prefix: 'rate-limit:',
    };
    
    return rateLimit({
      ...defaultOptions,
      ...options,
      store: new RedisStore(storeOptions as any),
    });
  }

  return rateLimit({
    ...defaultOptions,
    ...options,
  });
}

// Strict rate limit for authentication endpoints
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: false,
});

// Rate limit for login attempts
export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 login attempts per window
  message: 'Too many login attempts, please try again in 15 minutes',
  skipFailedRequests: false,
});

// Rate limit for password reset
export const passwordResetLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 reset requests per hour
  message: 'Too many password reset requests, please try again later',
});

// General API rate limit
export const apiLimiter = createLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please slow down',
  skipSuccessfulRequests: false,
});

// GraphQL specific rate limit (more lenient for legitimate queries)
export const graphqlLimiter = createLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute
  message: 'Too many GraphQL requests, please slow down',
  skipSuccessfulRequests: false,
});

// File upload rate limit
export const uploadLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 uploads per 15 minutes
  message: 'Too many file uploads, please try again later',
});

// WebSocket connection rate limit
export const websocketLimiter = createLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 connection attempts per minute
  message: 'Too many WebSocket connection attempts',
});

// IP-based rate limiter for critical endpoints
export const criticalEndpointLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 requests per hour
  keyGenerator: (req: Request) => {
    // Use IP address as key
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: (req: Request) => {
    // Skip rate limiting for authenticated admin users
    return (req as any).user?.role === 'admin';
  },
});

// Export Redis client cleanup function
export const cleanupRateLimiter = () => {
  if (redisClient) {
    redisClient.disconnect();
  }
}; 