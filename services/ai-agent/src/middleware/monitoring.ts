/**
 * Monitoring Middleware
 * 
 * Performance monitoring and metrics collection for the AI agent.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const logger = createLogger('monitoring');

/**
 * Metrics storage
 */
interface Metrics {
  requestCount: number;
  successCount: number;
  errorCount: number;
  totalLatencyMs: number;
  lastHourRequests: number[];
  toolUsage: Record<string, number>;
  intentDistribution: Record<string, number>;
  llmLatency: number[];
  startTime: Date;
  // Runtime tripwire counters — detect invariant violations
  tripwires: {
    tsSolverUsedInProd: number;
    legacyNewsCacheUsed: number;
  };
}

const metrics: Metrics = {
  requestCount: 0,
  successCount: 0,
  errorCount: 0,
  totalLatencyMs: 0,
  lastHourRequests: [],
  toolUsage: {},
  intentDistribution: {},
  llmLatency: [],
  startTime: new Date(),
  tripwires: {
    tsSolverUsedInProd: 0,
    legacyNewsCacheUsed: 0,
  },
};

// Cleanup old requests every minute
setInterval(() => {
  const oneHourAgo = Date.now() - 3600000;
  metrics.lastHourRequests = metrics.lastHourRequests.filter(t => t > oneHourAgo);
  
  // Keep only last 1000 latency samples
  if (metrics.llmLatency.length > 1000) {
    metrics.llmLatency = metrics.llmLatency.slice(-1000);
  }
}, 60000);

/**
 * Record a request
 */
export function recordRequest(success: boolean, latencyMs: number): void {
  metrics.requestCount++;
  metrics.totalLatencyMs += latencyMs;
  metrics.lastHourRequests.push(Date.now());
  
  if (success) {
    metrics.successCount++;
  } else {
    metrics.errorCount++;
  }
}

/**
 * Record tool usage
 */
export function recordToolUsage(toolName: string): void {
  metrics.toolUsage[toolName] = (metrics.toolUsage[toolName] || 0) + 1;
}

/**
 * Record intent classification
 */
export function recordIntent(intent: string): void {
  metrics.intentDistribution[intent] = (metrics.intentDistribution[intent] || 0) + 1;
}

/**
 * Record LLM latency
 */
export function recordLLMLatency(latencyMs: number): void {
  metrics.llmLatency.push(latencyMs);
}

// ─── Runtime Tripwires ───────────────────────────────────────────────────────

/**
 * Record that the TS solver was used in production.
 * This is a tripwire — the TS solver should only be used as emergency/dev opt-in.
 */
export function recordTripwireTsSolverInProd(): void {
  metrics.tripwires.tsSolverUsedInProd++;
  logger.warn('TRIPWIRE: TS solver used in production (SHIFT_SOLVER_ENGINE=ts)', {
    tripwire: 'tsSolverUsedInProd',
    count: metrics.tripwires.tsSolverUsedInProd,
  });
}

/**
 * Record that the legacy news cache path was used.
 * This is a tripwire — RSS pipeline is the canonical path; legacy is break-glass only.
 */
export function recordTripwireLegacyNewsCacheUsed(): void {
  metrics.tripwires.legacyNewsCacheUsed++;
  logger.warn('TRIPWIRE: Legacy news cache used (LEGACY_NEWS_CACHE_ENABLED=true)', {
    tripwire: 'legacyNewsCacheUsed',
    count: metrics.tripwires.legacyNewsCacheUsed,
  });
}

/**
 * Get current tripwire counters.
 */
export function getTripwires(): { tsSolverUsedInProd: number; legacyNewsCacheUsed: number } {
  return { ...metrics.tripwires };
}

// ─── End Runtime Tripwires ───────────────────────────────────────────────────

/**
 * Get current metrics
 */
export function getMetrics(): {
  uptime: number;
  requestsTotal: number;
  requestsPerHour: number;
  successRate: number;
  averageLatency: number;
  averageLLMLatency: number;
  p95LLMLatency: number;
  toolUsage: Record<string, number>;
  intentDistribution: Record<string, number>;
} {
  const uptimeMs = Date.now() - metrics.startTime.getTime();
  const avgLatency = metrics.requestCount > 0 
    ? metrics.totalLatencyMs / metrics.requestCount 
    : 0;
  
  // Calculate LLM latency percentiles
  const sortedLatency = [...metrics.llmLatency].sort((a, b) => a - b);
  const avgLLMLatency = sortedLatency.length > 0
    ? sortedLatency.reduce((a, b) => a + b, 0) / sortedLatency.length
    : 0;
  const p95Index = Math.floor(sortedLatency.length * 0.95);
  const p95LLMLatency = sortedLatency[p95Index] || 0;
  
  return {
    uptime: Math.floor(uptimeMs / 1000),
    requestsTotal: metrics.requestCount,
    requestsPerHour: metrics.lastHourRequests.length,
    successRate: metrics.requestCount > 0 
      ? (metrics.successCount / metrics.requestCount) * 100 
      : 100,
    averageLatency: Math.round(avgLatency),
    averageLLMLatency: Math.round(avgLLMLatency),
    p95LLMLatency: Math.round(p95LLMLatency),
    toolUsage: { ...metrics.toolUsage },
    intentDistribution: { ...metrics.intentDistribution },
  };
}

/**
 * Metrics collection middleware
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  // Capture response finish
  res.on('finish', () => {
    const latencyMs = Date.now() - startTime;
    const success = res.statusCode < 400;
    
    recordRequest(success, latencyMs);
    
    // Log slow requests
    if (latencyMs > 5000) {
      logger.warn('Slow request detected', {
        path: req.path,
        latencyMs,
        statusCode: res.statusCode,
      });
    }
  });
  
  next();
}

/**
 * Metrics endpoint handler
 */
export function metricsHandler(req: Request, res: Response): void {
  const currentMetrics = getMetrics();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ...currentMetrics,
  });
}

/**
 * Health check with metrics
 */
export function healthCheckHandler(req: Request, res: Response): void {
  const currentMetrics = getMetrics();
  
  // Determine health status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  const issues: string[] = [];
  
  if (currentMetrics.successRate < 90) {
    status = 'degraded';
    issues.push('Low success rate');
  }
  
  if (currentMetrics.averageLLMLatency > 10000) {
    status = 'degraded';
    issues.push('High LLM latency');
  }
  
  if (currentMetrics.successRate < 50) {
    status = 'unhealthy';
  }
  
  const tripwires = getTripwires();

  res.status(status === 'unhealthy' ? 503 : 200).json({
    status,
    service: 'ai-agent',
    timestamp: new Date().toISOString(),
    uptime: currentMetrics.uptime,
    metrics: {
      requestsPerHour: currentMetrics.requestsPerHour,
      successRate: `${currentMetrics.successRate.toFixed(1)}%`,
      averageLatency: `${currentMetrics.averageLatency}ms`,
    },
    tripwires: (tripwires.tsSolverUsedInProd > 0 || tripwires.legacyNewsCacheUsed > 0)
      ? tripwires
      : undefined,
    issues: issues.length > 0 ? issues : undefined,
  });
}

export default {
  recordRequest,
  recordToolUsage,
  recordIntent,
  recordLLMLatency,
  recordTripwireTsSolverInProd,
  recordTripwireLegacyNewsCacheUsed,
  getTripwires,
  getMetrics,
  metricsMiddleware,
  metricsHandler,
  healthCheckHandler,
};
