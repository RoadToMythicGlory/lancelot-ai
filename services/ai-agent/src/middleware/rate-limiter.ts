/**
 * Rate Limiter Middleware
 * 
 * Protects the AI agent from abuse with configurable rate limits.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const logger = createLogger('rate-limiter');

interface RateLimitEntry {
  count: number;
  firstRequest: number;
  lastRequest: number;
}

interface RateLimiterConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string;
}

// In-memory rate limit store
const rateLimitStore: Map<string, RateLimitEntry> = new Map();

// Cleanup interval (every minute)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.firstRequest > 3600000) { // 1 hour
      rateLimitStore.delete(key);
    }
  }
}, 60000);

/**
 * Create a rate limiter middleware
 */
export function createRateLimiter(config: RateLimiterConfig) {
  const { windowMs, maxRequests, keyGenerator } = config;
  
  return (req: Request, res: Response, next: NextFunction): void => {
    // Generate key for this request
    const key = keyGenerator 
      ? keyGenerator(req) 
      : req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
    
    const now = Date.now();
    let entry = rateLimitStore.get(key);
    
    // Initialize or reset if window expired
    if (!entry || now - entry.firstRequest > windowMs) {
      entry = {
        count: 1,
        firstRequest: now,
        lastRequest: now,
      };
      rateLimitStore.set(key, entry);
      next();
      return;
    }
    
    // Increment count
    entry.count++;
    entry.lastRequest = now;
    
    // Check if over limit
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.firstRequest + windowMs - now) / 1000);
      
      logger.warn('Rate limit exceeded', {
        key,
        count: entry.count,
        maxRequests,
        retryAfter,
      });
      
      res.setHeader('Retry-After', retryAfter);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil((entry.firstRequest + windowMs) / 1000));
      
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter,
      });
      return;
    }
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - entry.count);
    res.setHeader('X-RateLimit-Reset', Math.ceil((entry.firstRequest + windowMs) / 1000));
    
    next();
  };
}

/**
 * Default rate limiters for different endpoints
 */
export const chatRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 30, // 30 requests per minute
  keyGenerator: (req) => {
    const userId = req.headers['x-user-id'] as string;
    return userId || req.ip || 'unknown';
  },
});

export const toolRateLimiter = createRateLimiter({
  windowMs: 60000,  // 1 minute
  maxRequests: 10,  // 10 tool invocations per minute
  keyGenerator: (req) => {
    const userId = req.headers['x-user-id'] as string;
    return `tool:${userId || req.ip || 'unknown'}`;
  },
});

export const healthRateLimiter = createRateLimiter({
  windowMs: 10000, // 10 seconds
  maxRequests: 20, // 20 requests per 10 seconds
});

export default {
  createRateLimiter,
  chatRateLimiter,
  toolRateLimiter,
  healthRateLimiter,
};
