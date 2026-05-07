import { createLogger } from '../utils/logger';

const logger = createLogger('metrics');

// Simple in-process metrics collector
// For production, replace with prom-client (Prometheus) or similar

interface MetricPoint {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

interface Counter {
  name: string;
  help: string;
  value: number;
  labels: Record<string, number>;
}

interface Gauge {
  name: string;
  help: string;
  value: number;
}

interface Histogram {
  name: string;
  help: string;
  count: number;
  sum: number;
  buckets: Record<number, number>;
}

class MetricsCollector {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private startTime: number = Date.now();

  // Counter operations
  incCounter(name: string, labels?: Record<string, string>, value = 1) {
    const key = labels ? `${name}${JSON.stringify(labels)}` : name;
    if (!this.counters.has(key)) {
      this.counters.set(key, { name, help: '', value: 0, labels: {} });
    }
    const counter = this.counters.get(key)!;
    counter.value += value;
  }

  // Gauge operations
  setGauge(name: string, value: number) {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, { name, help: '', value: 0 });
    }
    this.gauges.get(name)!.value = value;
  }

  incGauge(name: string, value = 1) {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, { name, help: '', value: 0 });
    }
    this.gauges.get(name)!.value += value;
  }

  decGauge(name: string, value = 1) {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, { name, help: '', value: 0 });
    }
    this.gauges.get(name)!.value -= value;
  }

  // Histogram operations
  observeHistogram(name: string, value: number) {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, {
        name,
        help: '',
        count: 0,
        sum: 0,
        buckets: { 0.01: 0, 0.05: 0, 0.1: 0, 0.25: 0, 0.5: 0, 1: 0, 2.5: 0, 5: 0, 10: 0 },
      });
    }
    const hist = this.histograms.get(name)!;
    hist.count++;
    hist.sum += value;
    for (const bucket of Object.keys(hist.buckets).map(Number)) {
      if (value <= bucket) {
        hist.buckets[bucket]++;
      }
    }
  }

  // Get Prometheus-format metrics
  getPrometheusOutput(): string {
    const lines: string[] = [];
    const uptime = (Date.now() - this.startTime) / 1000;

    // Process uptime
    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${uptime}`);
    lines.push('');

    // Memory usage
    const memory = process.memoryUsage();
    lines.push('# HELP process_heap_bytes Process heap size in bytes');
    lines.push('# TYPE process_heap_bytes gauge');
    lines.push(`process_heap_bytes ${memory.heapUsed}`);
    lines.push('');

    // Counters
    for (const [key, counter] of this.counters) {
      lines.push(`# HELP ${counter.name} Counter metric`);
      lines.push(`# TYPE ${counter.name} counter`);
      lines.push(`${counter.name} ${counter.value}`);
      lines.push('');
    }

    // Gauges
    for (const [key, gauge] of this.gauges) {
      lines.push(`# HELP ${gauge.name} Gauge metric`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      lines.push(`${gauge.name} ${gauge.value}`);
      lines.push('');
    }

    // Histograms
    for (const [key, hist] of this.histograms) {
      lines.push(`# HELP ${hist.name} Histogram metric`);
      lines.push(`# TYPE ${hist.name} histogram`);
      for (const [bucket, count] of Object.entries(hist.buckets)) {
        lines.push(`${hist.name}_bucket{le="${bucket}"} ${count}`);
      }
      lines.push(`${hist.name}_bucket{le="+Inf"} ${hist.count}`);
      lines.push(`${hist.name}_sum ${hist.sum}`);
      lines.push(`${hist.name}_count ${hist.count}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  // Get JSON format metrics (for dashboard)
  getJsonMetrics(): Record<string, any> {
    const memory = process.memoryUsage();
    return {
      uptime: (Date.now() - this.startTime) / 1000,
      memory: {
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        rss: memory.rss,
        external: memory.external,
      },
      counters: Object.fromEntries(
        Array.from(this.counters.entries()).map(([k, v]) => [k, v.value])
      ),
      gauges: Object.fromEntries(
        Array.from(this.gauges.entries()).map(([k, v]) => [k, v.value])
      ),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([k, v]) => [k, {
          count: v.count,
          sum: v.sum,
          avg: v.count > 0 ? v.sum / v.count : 0,
        }])
      ),
    };
  }
}

// Singleton
export const metrics = new MetricsCollector();

// Pre-defined metric names
export const METRICS = {
  // HTTP
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  HTTP_REQUEST_DURATION_SECONDS: 'http_request_duration_seconds',
  HTTP_ACTIVE_CONNECTIONS: 'http_active_connections',
  
  // GraphQL
  GRAPHQL_OPERATIONS_TOTAL: 'graphql_operations_total',
  GRAPHQL_ERRORS_TOTAL: 'graphql_errors_total',
  GRAPHQL_OPERATION_DURATION_SECONDS: 'graphql_operation_duration_seconds',
  
  // Auth
  AUTH_LOGIN_ATTEMPTS: 'auth_login_attempts_total',
  AUTH_LOGIN_FAILURES: 'auth_login_failures_total',
  AUTH_ACTIVE_SESSIONS: 'auth_active_sessions',
  
  // Business
  BROADCAST_EVENTS_CREATED: 'broadcast_events_created_total',
  SHIFTS_CREATED: 'shifts_created_total',
  NOTIFICATIONS_SENT: 'notifications_sent_total',
  WORKFLOWS_STARTED: 'workflows_started_total',
  
  // WebSocket
  WEBSOCKET_CONNECTIONS: 'websocket_connections',
  CHAT_MESSAGES_SENT: 'chat_messages_sent_total',
};
