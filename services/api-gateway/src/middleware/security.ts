import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';

// CSRF token storage (in production, use Redis or similar)
const csrfTokens = new Map<string, { token: string; expires: number }>();

/**
 * Generate a CSRF token for a session
 */
export function generateCSRFToken(sessionId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + (30 * 60 * 1000); // 30 minutes
  
  csrfTokens.set(sessionId, { token, expires });
  
  // Clean up expired tokens periodically
  cleanupExpiredTokens();
  
  return token;
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(sessionId: string, token: string): boolean {
  const stored = csrfTokens.get(sessionId);
  
  if (!stored) return false;
  
  // Check if token is expired
  if (Date.now() > stored.expires) {
    csrfTokens.delete(sessionId);
    return false;
  }
  
  return crypto.timingSafeEqual(
    Buffer.from(stored.token),
    Buffer.from(token)
  );
}

/**
 * Clean up expired CSRF tokens
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [sessionId, data] of csrfTokens.entries()) {
    if (now > data.expires) {
      csrfTokens.delete(sessionId);
    }
  }
}

/**
 * CSRF protection middleware
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): any {
  // Skip CSRF for safe methods and authentication endpoints
  if (
    req.method === 'GET' || 
    req.method === 'HEAD' || 
    req.method === 'OPTIONS' ||
    req.path === '/graphql' || // GraphQL handles its own CSRF via Apollo
    req.path.includes('/auth/login')
  ) {
    return next();
  }
  
  const sessionId = (req as any).sessionID || req.headers['x-session-id'];
  const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
  
  if (!sessionId || !csrfToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }
  
  if (!validateCSRFToken(sessionId as string, csrfToken as string)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  
  next();
}

/**
 * Security headers middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net", // Allow necessary scripts
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' ws: wss: http://localhost:* ws://localhost:*", // Allow WebSocket in dev
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ];
  
  if (config.NODE_ENV === 'production') {
    // Stricter CSP in production
    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
    
    // HSTS
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  } else {
    // Relaxed CSP for development
    const devCsp = cspDirectives.map(directive => {
      if (directive.startsWith('connect-src')) {
        return "connect-src *"; // Allow all connections in dev
      }
      return directive;
    });
    res.setHeader('Content-Security-Policy-Report-Only', devCsp.join('; '));
  }
  
  next();
}

/**
 * Request sanitization middleware
 */
export function sanitizeRequest(req: Request, res: Response, next: NextFunction): void {
  // Sanitize common injection patterns
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      // Remove potential SQL injection attempts
      obj = obj.replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|SCRIPT)\b)/gi, '');
      
      // Remove script tags
      obj = obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      
      // Remove event handlers
      obj = obj.replace(/on\w+\s*=/gi, '');
      
      return obj;
    } else if (Array.isArray(obj)) {
      return obj.map(sanitize);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          // Skip prototype pollution attempts
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
          }
          sanitized[key] = sanitize(obj[key]);
        }
      }
      return sanitized;
    }
    return obj;
  };
  
  // Sanitize body, query, and params
  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);
  
  next();
}

/**
 * API key validation middleware (for external services)
 */
export function validateApiKey(req: Request, res: Response, next: NextFunction): any {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  // In production, validate against stored API keys
  // For now, we'll use a simple check
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  
  if (!validApiKeys.includes(apiKey as string)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
}

/**
 * IP whitelist middleware
 */
export function ipWhitelist(whitelist: string[]): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || req.connection.remoteAddress || '';
    
    // In development, allow all IPs
    if (config.NODE_ENV === 'development') {
      return next();
    }
    
    // Check if IP is in whitelist
    const isAllowed = whitelist.some(ip => {
      if (ip.includes('*')) {
        // Support wildcard IPs like 192.168.*.*
        const pattern = ip.replace(/\*/g, '\\d+').replace(/\./g, '\\.');
        return new RegExp(`^${pattern}$`).test(clientIp);
      }
      return ip === clientIp;
    });
    
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied from this IP' });
    }
    
    next();
  };
}

/**
 * Combined security middleware
 */
export function securityMiddleware(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    // Apply all security measures
    securityHeaders(req, res, () => {
      sanitizeRequest(req, res, () => {
        // CSRF protection is applied separately where needed
        next();
      });
    });
  };
} 