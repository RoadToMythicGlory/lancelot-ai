/**
 * Error Recovery Middleware
 * 
 * Handles errors gracefully and provides recovery mechanisms.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';
import { ChatAgentResponse, createUnknownResponse, ResponseMetadata } from '../schemas/chat-response';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('error-recovery');

/**
 * Error types for categorization
 */
export enum AIErrorType {
  LLM_UNAVAILABLE = 'llm_unavailable',
  LLM_TIMEOUT = 'llm_timeout',
  LLM_ERROR = 'llm_error',
  TOOL_ERROR = 'tool_error',
  DATABASE_ERROR = 'database_error',
  NETWORK_ERROR = 'network_error',
  VALIDATION_ERROR = 'validation_error',
  RATE_LIMIT = 'rate_limit',
  UNKNOWN = 'unknown',
}

/**
 * Custom AI Error class
 */
export class AIError extends Error {
  type: AIErrorType;
  recoverable: boolean;
  suggestion: string;
  originalError?: Error;
  
  constructor(
    message: string,
    type: AIErrorType,
    recoverable: boolean = true,
    suggestion: string = '',
    originalError?: Error
  ) {
    super(message);
    this.name = 'AIError';
    this.type = type;
    this.recoverable = recoverable;
    this.suggestion = suggestion;
    this.originalError = originalError;
  }
}

/**
 * Map error types to user-friendly messages (Hebrew)
 */
const errorMessages: Record<AIErrorType, { message: string; suggestion: string }> = {
  [AIErrorType.LLM_UNAVAILABLE]: {
    message: 'שירות ה-AI אינו זמין כרגע',
    suggestion: 'נסה שוב בעוד מספר דקות',
  },
  [AIErrorType.LLM_TIMEOUT]: {
    message: 'הבקשה לקחה יותר מדי זמן',
    suggestion: 'נסה לשאול שאלה קצרה יותר או פשוטה יותר',
  },
  [AIErrorType.LLM_ERROR]: {
    message: 'אירעה שגיאה בעיבוד הבקשה',
    suggestion: 'נסה לנסח את השאלה בצורה אחרת',
  },
  [AIErrorType.TOOL_ERROR]: {
    message: 'לא הצלחתי להפעיל את הכלי המבוקש',
    suggestion: 'ודא שהמידע שסיפקת מלא ותקין',
  },
  [AIErrorType.DATABASE_ERROR]: {
    message: 'בעיה בגישה לנתונים',
    suggestion: 'נסה שוב בעוד רגע',
  },
  [AIErrorType.NETWORK_ERROR]: {
    message: 'בעיה בחיבור לרשת',
    suggestion: 'בדוק את החיבור לאינטרנט ונסה שוב',
  },
  [AIErrorType.VALIDATION_ERROR]: {
    message: 'הנתונים שסופקו אינם תקינים',
    suggestion: 'בדוק את הפרמטרים ונסה שוב',
  },
  [AIErrorType.RATE_LIMIT]: {
    message: 'שלחת יותר מדי בקשות',
    suggestion: 'המתן מספר דקות ונסה שוב',
  },
  [AIErrorType.UNKNOWN]: {
    message: 'אירעה שגיאה לא צפויה',
    suggestion: 'נסה שוב או פנה לתמיכה',
  },
};

/**
 * Classify error type from error object
 */
export function classifyError(error: Error): AIErrorType {
  const message = error.message.toLowerCase();
  
  if (message.includes('timeout') || message.includes('timed out')) {
    return AIErrorType.LLM_TIMEOUT;
  }
  if (message.includes('unavailable') || message.includes('not available') || message.includes('connection refused')) {
    return AIErrorType.LLM_UNAVAILABLE;
  }
  if (message.includes('mongo') || message.includes('database')) {
    return AIErrorType.DATABASE_ERROR;
  }
  if (message.includes('network') || message.includes('fetch')) {
    return AIErrorType.NETWORK_ERROR;
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return AIErrorType.VALIDATION_ERROR;
  }
  if (message.includes('rate') || message.includes('limit')) {
    return AIErrorType.RATE_LIMIT;
  }
  if (error.name === 'AIError') {
    return (error as AIError).type;
  }
  
  return AIErrorType.UNKNOWN;
}

/**
 * Create a graceful error response
 */
export function createErrorResponse(error: Error | AIError): ChatAgentResponse {
  const errorType = error instanceof AIError ? error.type : classifyError(error);
  const errorInfo = errorMessages[errorType];
  
  const metadata: ResponseMetadata = {
    modelUsed: 'error-handler',
    totalLatencyMs: 0,
    isOffline: false,
  };
  
  return createUnknownResponse(
    uuidv4(),
    errorInfo.message,
    errorInfo.suggestion,
    metadata
  );
}

/**
 * Error recovery middleware
 */
export function errorRecoveryMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errorType = error instanceof AIError ? error.type : classifyError(error);
  const errorInfo = errorMessages[errorType];
  
  logger.error('Error caught by recovery middleware', {
    type: errorType,
    message: error.message,
    stack: error.stack,
    path: req.path,
    userId: req.headers['x-user-id'],
  });
  
  // Determine status code
  let statusCode = 500;
  switch (errorType) {
    case AIErrorType.VALIDATION_ERROR:
      statusCode = 400;
      break;
    case AIErrorType.RATE_LIMIT:
      statusCode = 429;
      break;
    case AIErrorType.LLM_UNAVAILABLE:
      statusCode = 503;
      break;
    case AIErrorType.LLM_TIMEOUT:
      statusCode = 504;
      break;
  }
  
  // For chat endpoints, return a ChatAgentResponse format
  if (req.path.includes('/chat')) {
    const response = createErrorResponse(error);
    res.status(statusCode).json(response);
    return;
  }
  
  // For other endpoints, return a standard error
  res.status(statusCode).json({
    error: errorInfo.message,
    suggestion: errorInfo.suggestion,
    type: errorType,
    recoverable: error instanceof AIError ? error.recoverable : true,
  });
}

/**
 * Async handler wrapper with error recovery
 */
export function withErrorRecovery<T>(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await handler(req, res, next);
    } catch (error) {
      errorRecoveryMiddleware(error as Error, req, res, next);
    }
  };
}

export default {
  AIError,
  AIErrorType,
  classifyError,
  createErrorResponse,
  errorRecoveryMiddleware,
  withErrorRecovery,
};
