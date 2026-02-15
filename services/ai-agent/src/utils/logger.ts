/**
 * Structured Logger for Lancelot AI Agent
 * 
 * Provides consistent, structured logging for debugging and auditing.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
}

class Logger {
  private component: string;
  private minLevel: LogLevel;
  
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };
  
  constructor(component: string, minLevel: LogLevel = 'info') {
    this.component = component;
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || minLevel;
  }
  
  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }
  
  private formatEntry(level: LogLevel, message: string, metadata?: Record<string, unknown>, traceId?: string): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      metadata,
      traceId,
    };
  }
  
  private output(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.component}]`;
    const msg = `${prefix} ${entry.message}`;
    
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      const metaStr = JSON.stringify(entry.metadata, null, 2);
      switch (entry.level) {
        case 'error':
          console.error(msg, '\n', metaStr);
          break;
        case 'warn':
          console.warn(msg, '\n', metaStr);
          break;
        case 'debug':
          console.debug(msg, '\n', metaStr);
          break;
        default:
          console.log(msg, '\n', metaStr);
      }
    } else {
      switch (entry.level) {
        case 'error':
          console.error(msg);
          break;
        case 'warn':
          console.warn(msg);
          break;
        case 'debug':
          console.debug(msg);
          break;
        default:
          console.log(msg);
      }
    }
  }
  
  debug(message: string, metadata?: Record<string, unknown>, traceId?: string): void {
    if (this.shouldLog('debug')) {
      this.output(this.formatEntry('debug', message, metadata, traceId));
    }
  }
  
  info(message: string, metadata?: Record<string, unknown>, traceId?: string): void {
    if (this.shouldLog('info')) {
      this.output(this.formatEntry('info', message, metadata, traceId));
    }
  }
  
  warn(message: string, metadata?: Record<string, unknown>, traceId?: string): void {
    if (this.shouldLog('warn')) {
      this.output(this.formatEntry('warn', message, metadata, traceId));
    }
  }
  
  error(message: string, metadata?: Record<string, unknown>, traceId?: string): void {
    if (this.shouldLog('error')) {
      this.output(this.formatEntry('error', message, metadata, traceId));
    }
  }
  
  /**
   * Log AI agent decision with explanation
   */
  decision(action: string, reason: string, metadata?: Record<string, unknown>, traceId?: string): void {
    this.info(`DECISION: ${action}`, {
      reason,
      ...metadata,
    }, traceId);
  }
  
  /**
   * Log tool invocation
   */
  tool(toolName: string, input: unknown, output: unknown, durationMs: number, traceId?: string): void {
    this.info(`TOOL: ${toolName}`, {
      input,
      output,
      durationMs,
    }, traceId);
  }
  
  /**
   * Create a child logger with a sub-component name
   */
  child(subComponent: string): Logger {
    return new Logger(`${this.component}:${subComponent}`, this.minLevel);
  }
}

// Factory function to create loggers
export function createLogger(component: string): Logger {
  return new Logger(component);
}

// Default logger instance
export const logger = createLogger('ai-agent');

export default logger;
