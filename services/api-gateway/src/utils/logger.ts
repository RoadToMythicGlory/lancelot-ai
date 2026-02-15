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
  private readonly levelPriority: Record<LogLevel, number> = {
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
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      const payload = JSON.stringify(entry);
      switch (entry.level) {
        case 'error':
          console.error(payload);
          return;
        case 'warn':
          console.warn(payload);
          return;
        case 'debug':
          console.debug(payload);
          return;
        default:
          console.log(payload);
          return;
      }
    }

    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.component}]`;
    const msg = `${prefix} ${entry.message}`;
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      switch (entry.level) {
        case 'error':
          console.error(msg, '\n', entry.metadata);
          return;
        case 'warn':
          console.warn(msg, '\n', entry.metadata);
          return;
        case 'debug':
          console.debug(msg, '\n', entry.metadata);
          return;
        default:
          console.log(msg, '\n', entry.metadata);
          return;
      }
    }

    switch (entry.level) {
      case 'error':
        console.error(msg);
        return;
      case 'warn':
        console.warn(msg);
        return;
      case 'debug':
        console.debug(msg);
        return;
      default:
        console.log(msg);
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
}

export function createLogger(component: string): Logger {
  return new Logger(component);
}

export const logger = createLogger('api-gateway');

export default logger;
