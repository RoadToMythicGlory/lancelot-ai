// externalApiLimiter
//
// Dedicated rate limiter for the public `/api/v1/external/*` REST endpoints
// consumed by external dashboards. Kept separate from the general
// `apiLimiter` so a noisy partner can't burn the budget for the internal
// app, and vice versa.
//
// The limiter is keyed by API key id (set by the hardened `validateApiKey`
// middleware on `req.apiKeyId`) rather than client IP, so partners behind a
// shared NAT each get their own quota. Falls back to the IP if no key id is
// available — relevant only for the unauthenticated `/healthz` ping, which
// is also lightweight enough that the IP fallback is fine.

import rateLimit, { Options, RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request, Response } from 'express';
import { config } from '../config';

// Share the Redis connection used by the main rate limiter when available
// so we don't open a second connection per process.
const redisClient = config.NODE_ENV === 'production' && config.REDIS_URL
  ? new Redis(config.REDIS_URL, { keyPrefix: 'ext-rate-limit:' })
  : null;

const DEFAULT_BUDGET_PER_MIN = parseInt(
  process.env.EXTERNAL_API_RATE_LIMIT_PER_MIN || '120',
  10,
);

export function createExternalApiLimiter(): RateLimitRequestHandler {
  // Disabled outside production so local dev / integration tests are never
  // blocked by 429s — same convention as the main rate limiter module.
  if (config.NODE_ENV !== 'production') {
    return ((_req, _res, next) => next()) as RateLimitRequestHandler;
  }

  const baseOptions: Partial<Options> = {
    windowMs: 60 * 1000,
    max: DEFAULT_BUDGET_PER_MIN,
    standardHeaders: true,
    legacyHeaders: false,
    // Key by the API key id when present, otherwise the client IP. The
    // hardened `validateApiKey` middleware writes the id onto the request
    // before this limiter runs.
    keyGenerator: (req: Request) => {
      const apiKeyId = (req as any).apiKeyId as string | undefined;
      if (apiKeyId) return `key:${apiKeyId}`;
      return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    },
    handler: (req: Request, res: Response) => {
      const origin = req.headers.origin as string | undefined;
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.status(429).json({
        error: 'rate_limited',
        message: `External API quota exceeded (${DEFAULT_BUDGET_PER_MIN} requests/minute).`,
        retryAfter: res.getHeader('Retry-After'),
      });
    },
  };

  if (redisClient) {
    return rateLimit({
      ...baseOptions,
      store: new RedisStore({
        sendCommand: (...args: string[]) => (redisClient as any).call(...args),
        prefix: 'ext-rate-limit:',
      } as any),
    });
  }

  return rateLimit(baseOptions);
}

// Single shared instance — Express expects the same middleware function on
// every request so the limiter's in-memory counters work correctly.
export const externalApiLimiter = createExternalApiLimiter();
