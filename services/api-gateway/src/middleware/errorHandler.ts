import { GraphQLError } from 'graphql';
import { config } from '../config';

// Error codes that are safe to expose
export enum ErrorCode {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

// Map of sensitive error patterns to sanitized messages
const sensitivePatterns = [
  {
    pattern: /password/i,
    replacement: 'Authentication failed',
  },
  {
    pattern: /connection.*refused/i,
    replacement: 'Service temporarily unavailable',
  },
  {
    pattern: /ECONNREFUSED/,
    replacement: 'Service temporarily unavailable',
  },
  {
    pattern: /duplicate key/i,
    replacement: 'This item already exists',
  },
  {
    pattern: /violates foreign key constraint/i,
    replacement: 'Related data not found',
  },
  {
    pattern: /column .* does not exist/i,
    replacement: 'Invalid request',
  },
  {
    pattern: /relation .* does not exist/i,
    replacement: 'Invalid request',
  },
  {
    pattern: /syntax error/i,
    replacement: 'Invalid request',
  },
  {
    pattern: /cannot connect to/i,
    replacement: 'Service temporarily unavailable',
  },
  {
    pattern: /timeout/i,
    replacement: 'Request timed out, please try again',
  },
];

// Sanitize error messages for production
export function sanitizeError(error: Error | GraphQLError): GraphQLError {
  // In development, return full error details
  if (config.NODE_ENV === 'development') {
    console.error('Development Error:', error);
    return error instanceof GraphQLError ? error : new GraphQLError(error.message);
  }

  // Log full error internally (to be sent to logging service)
  console.error('Production Error:', {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });

  let sanitizedMessage = error.message;
  let errorCode = ErrorCode.INTERNAL_SERVER_ERROR;

  // Check for known error types
  if (error.message.includes('אין לך הרשאת גישה') || error.message.includes('אין לך הרשאה')) {
    errorCode = ErrorCode.UNAUTHORIZED;
    sanitizedMessage = error.message; // Keep authorization messages as-is
  } else if (error.message.includes('לא נמצא') || error.message.includes('not found')) {
    errorCode = ErrorCode.NOT_FOUND;
    sanitizedMessage = error.message; // Keep not found messages
  } else if (error.message.includes('Too many')) {
    errorCode = ErrorCode.RATE_LIMITED;
    sanitizedMessage = error.message; // Keep rate limit messages
  } else {
    // Apply sensitive pattern replacements
    for (const { pattern, replacement } of sensitivePatterns) {
      if (pattern.test(error.message)) {
        sanitizedMessage = replacement;
        break;
      }
    }
  }

  // If no pattern matched and it's a generic error, use a safe default
  if (sanitizedMessage === error.message && !['UNAUTHORIZED', 'NOT_FOUND', 'RATE_LIMITED'].includes(errorCode)) {
    sanitizedMessage = 'An error occurred while processing your request';
  }

  return new GraphQLError(sanitizedMessage, {
    extensions: {
      code: errorCode,
      timestamp: new Date().toISOString(),
    },
  });
}

// Express error handler middleware
export function expressErrorHandler(err: any, req: any, res: any, next: any) {
  if (res.headersSent) {
    return next(err);
  }

  // Log full error
  console.error('Express Error:', {
    error: err,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  // Sanitize response
  if (config.NODE_ENV === 'production') {
    const statusCode = err.statusCode || err.status || 500;
    const message = statusCode === 500 ? 'Internal server error' : err.message;
    
    res.status(statusCode).json({
      error: {
        message,
        code: err.code || 'ERROR',
        timestamp: new Date().toISOString(),
      },
    });
  } else {
    // In development, send full error
    res.status(err.statusCode || err.status || 500).json({
      error: {
        message: err.message,
        code: err.code,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      },
    });
  }
} 