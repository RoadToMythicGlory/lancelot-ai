// webhookDelivery.service
//
// Outbound webhook fan-out for the external partner dashboard. The plan
// kept things simple per the user's choice (single env-driven target URL +
// shared HMAC secret), but we still persist every attempt to the existing
// `WebhookDelivery` Mongo collection so:
//   • partner support engineers can see delivery state via the existing
//     `GET /api/v1/external/webhooks/deliveries` admin endpoint, and
//   • a per-process retry worker can sweep pending/failed rows and retry
//     them with exponential backoff (5s, 30s, 5m) up to 3 attempts.
//
// Signing scheme — `X-Lancelot-Signature: sha256=<hex>` where the body is
// the raw JSON payload. The matching verification example is shipped in
// `docs/external-api/shared-engineering-equipment.md`.

import crypto from 'crypto';
import { randomUUID } from 'crypto';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import mongoose from 'mongoose';
import { WebhookDelivery, IWebhookDelivery } from '../models/apiKey.models';
import {
  getSharedEngineeringDevice,
  DeviceRow,
} from './sharedEngineeringExport.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('webhook-delivery');

export type ExternalEventType =
  | 'equipment.created'
  | 'equipment.updated'
  | 'equipment.deleted'
  | 'equipment.assigned'
  | 'equipment.returned'
  | 'equipment.location.changed';

interface EmitOptions {
  equipmentId?: string;       // Skip payload lookup when explicit data is provided
  data?: any;                 // Override device payload (e.g. for delete events)
  skipPersistence?: boolean;  // Used by retry worker so it doesn't dup-insert
}

interface DeliveryConfig {
  enabled: boolean;
  url: string;
  secret: string;
  timeoutMs: number;
  maxAttempts: number;
}

// Backoff schedule (in ms) keyed by attempt count BEFORE this attempt runs.
// Attempt 1 = immediate. Attempts 2, 3 wait 5s and 30s; the final scheduled
// retry uses 5 minutes.
const RETRY_BACKOFF_MS = [0, 5_000, 30_000, 5 * 60_000];

// Synthetic ObjectIds — the existing `WebhookDelivery` model has required
// `webhookId` and `organizationId` fields that are designed for the
// per-tenant model. The user chose the env-driven flow, so we stamp deliveries
// with a deterministic "external dashboard" sentinel id so the docs survive
// the schema validators without us migrating the model.
const EXTERNAL_WEBHOOK_SENTINEL = new mongoose.Types.ObjectId('000000000000000000000001');
const EXTERNAL_ORG_SENTINEL = new mongoose.Types.ObjectId('000000000000000000000002');

function getConfig(): DeliveryConfig {
  return {
    enabled: process.env.EXTERNAL_WEBHOOK_ENABLED === 'true',
    url: process.env.EXTERNAL_WEBHOOK_URL || '',
    secret: process.env.EXTERNAL_WEBHOOK_SECRET || '',
    timeoutMs: parseInt(process.env.EXTERNAL_WEBHOOK_TIMEOUT_MS || '15000', 10),
    maxAttempts: 3,
  };
}

function sign(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

interface PostResult {
  status: number;
  body: string;
  retriable: boolean;
}

function postJson(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(new Error(`Invalid EXTERNAL_WEBHOOK_URL: ${(err as Error).message}`));
      return;
    }
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const req = lib.request(
      {
        method: 'POST',
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body).toString(),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const status = res.statusCode || 0;
          const responseBody = Buffer.concat(chunks).toString('utf8').slice(0, 2000);
          // 2xx -> success. 5xx and 429 -> retriable. 4xx (other) -> permanent.
          const retriable = status >= 500 || status === 429;
          resolve({ status, body: responseBody, retriable });
        });
      },
    );
    req.on('error', (err) => {
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy(new Error(`Webhook request timed out after ${timeoutMs}ms`));
    });
    req.write(body);
    req.end();
  });
}

async function attemptDelivery(
  deliveryId: string,
  payload: any,
  cfg: DeliveryConfig,
  delivery: IWebhookDelivery,
): Promise<void> {
  const rawBody = JSON.stringify(payload);
  const signature = sign(rawBody, cfg.secret);
  const timestamp = new Date().toISOString();

  delivery.attempts += 1;
  delivery.status = 'retrying';

  const startedAt = Date.now();

  try {
    const result = await postJson(
      cfg.url,
      rawBody,
      {
        'Content-Type': 'application/json',
        'X-Lancelot-Event': payload.event,
        'X-Lancelot-Delivery': deliveryId,
        'X-Lancelot-Signature': `sha256=${signature}`,
        'X-Lancelot-Timestamp': timestamp,
        'User-Agent': 'Lancelot-Webhook/1.0',
      },
      cfg.timeoutMs,
    );

    delivery.responseStatus = result.status;
    delivery.responseBody = result.body;
    delivery.durationMs = Date.now() - startedAt;
    delivery.deliveredAt = new Date();

    if (result.status >= 200 && result.status < 300) {
      delivery.status = 'success';
      delivery.error = undefined;
      delivery.nextRetryAt = undefined;
      logger.info('Webhook delivered', {
        deliveryId,
        event: payload.event,
        status: result.status,
        durationMs: delivery.durationMs,
      });
    } else if (result.retriable && delivery.attempts < cfg.maxAttempts) {
      const backoff = RETRY_BACKOFF_MS[Math.min(delivery.attempts, RETRY_BACKOFF_MS.length - 1)];
      delivery.status = 'retrying';
      delivery.nextRetryAt = new Date(Date.now() + backoff);
      delivery.error = `Non-2xx response (status=${result.status})`;
      logger.warn('Webhook delivery non-2xx, will retry', {
        deliveryId,
        status: result.status,
        nextRetryAt: delivery.nextRetryAt,
      });
    } else {
      delivery.status = 'failed';
      delivery.nextRetryAt = undefined;
      delivery.error = result.retriable
        ? `Max attempts (${cfg.maxAttempts}) reached`
        : `Permanent failure (status=${result.status})`;
      logger.error('Webhook delivery failed', {
        deliveryId,
        status: result.status,
        attempts: delivery.attempts,
      });
    }
  } catch (err: any) {
    delivery.durationMs = Date.now() - startedAt;
    delivery.error = err?.message || String(err);
    if (delivery.attempts < cfg.maxAttempts) {
      const backoff = RETRY_BACKOFF_MS[Math.min(delivery.attempts, RETRY_BACKOFF_MS.length - 1)];
      delivery.status = 'retrying';
      delivery.nextRetryAt = new Date(Date.now() + backoff);
      logger.warn('Webhook delivery errored, will retry', {
        deliveryId,
        err: delivery.error,
        nextRetryAt: delivery.nextRetryAt,
      });
    } else {
      delivery.status = 'failed';
      delivery.nextRetryAt = undefined;
      logger.error('Webhook delivery failed (max attempts)', {
        deliveryId,
        err: delivery.error,
      });
    }
  }

  await delivery.save();
}

/**
 * Public entry point for resolvers / services. Fire-and-forget: returns
 * immediately and performs the HTTP POST asynchronously.
 *
 * Best-effort by design — webhook delivery never blocks or fails the source
 * mutation (e.g. checking equipment in/out is too important to roll back
 * because a partner's URL is down).
 */
export function emitExternalEvent(event: ExternalEventType, options: EmitOptions = {}): void {
  const cfg = getConfig();
  if (!cfg.enabled || !cfg.url || !cfg.secret) {
    return;
  }

  // Defer to next tick so we don't slow down the caller's response path.
  setImmediate(async () => {
    try {
      let data: any = options.data;
      if (data == null && options.equipmentId) {
        // Build the same device row the REST API returns. The base URL is
        // best-effort here — partners can always re-fetch via the REST API
        // using the equipment id from the payload.
        const baseUrl = process.env.EXTERNAL_API_BASE_URL
          ? `${process.env.EXTERNAL_API_BASE_URL.replace(/\/$/, '')}/api/v1/external/shared-engineering-equipment`
          : '/api/v1/external/shared-engineering-equipment';
        data = await getSharedEngineeringDevice(options.equipmentId, baseUrl);
      }

      if (data == null && !options.equipmentId) {
        logger.warn('emitExternalEvent called with neither equipmentId nor data — skipping', {
          event,
        });
        return;
      }

      const deliveryId = randomUUID();
      const payload = {
        event,
        deliveryId,
        timestamp: new Date().toISOString(),
        data,
      };

      const delivery = await WebhookDelivery.create({
        webhookId: EXTERNAL_WEBHOOK_SENTINEL,
        organizationId: EXTERNAL_ORG_SENTINEL,
        event,
        payload,
        status: 'pending',
        attempts: 0,
      });

      await attemptDelivery(deliveryId, payload, cfg, delivery);
    } catch (err) {
      logger.error('emitExternalEvent crashed', { event, err: String(err) });
    }
  });
}

// -----------------------------------------------------------------------
// Retry worker — sweeps WebhookDelivery rows whose `nextRetryAt` has come
// due and retries them. Started by `index.ts` alongside the main scheduler.
// -----------------------------------------------------------------------

let retryTimer: NodeJS.Timeout | null = null;
const RETRY_INTERVAL_MS = parseInt(
  process.env.EXTERNAL_WEBHOOK_RETRY_INTERVAL_MS || '15000',
  10,
);

async function processRetryQueue(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.enabled || !cfg.url || !cfg.secret) return;

  const due = await WebhookDelivery.find({
    webhookId: EXTERNAL_WEBHOOK_SENTINEL,
    status: { $in: ['retrying', 'pending'] },
    nextRetryAt: { $lte: new Date() },
  })
    .limit(20)
    .exec();

  for (const delivery of due) {
    try {
      const payload = delivery.payload;
      const deliveryId = payload?.deliveryId || delivery._id.toString();
      await attemptDelivery(deliveryId, payload, cfg, delivery);
    } catch (err) {
      logger.error('Retry attempt crashed', {
        deliveryId: delivery._id.toString(),
        err: String(err),
      });
    }
  }
}

export function startWebhookRetryWorker(): void {
  if (retryTimer) return;
  retryTimer = setInterval(() => {
    processRetryQueue().catch((err) => {
      logger.error('Retry queue processing failed', { err: String(err) });
    });
  }, RETRY_INTERVAL_MS);
  // Unref so the timer doesn't keep the process alive on shutdown.
  if (retryTimer.unref) retryTimer.unref();
  logger.info('Webhook retry worker started', { intervalMs: RETRY_INTERVAL_MS });
}

export function stopWebhookRetryWorker(): void {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
    logger.info('Webhook retry worker stopped');
  }
}

/**
 * Lookup helper for `GET /webhooks/deliveries` admin endpoint.
 */
export async function listExternalWebhookDeliveries(opts: {
  status?: string;
  limit?: number;
  since?: Date;
}): Promise<Array<Record<string, any>>> {
  const limit = Math.min(Math.max(opts.limit || 100, 1), 500);
  const query: any = { webhookId: EXTERNAL_WEBHOOK_SENTINEL };
  if (opts.status && opts.status !== 'all') {
    query.status = opts.status;
  }
  if (opts.since) {
    query.createdAt = { $gte: opts.since };
  }
  const docs = await WebhookDelivery.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();
  return docs.map((d: any) => ({
    deliveryId: d.payload?.deliveryId || d._id.toString(),
    event: d.event,
    status: d.status,
    attempts: d.attempts,
    responseStatus: d.responseStatus || null,
    error: d.error || null,
    deliveredAt: d.deliveredAt ? new Date(d.deliveredAt).toISOString() : null,
    nextRetryAt: d.nextRetryAt ? new Date(d.nextRetryAt).toISOString() : null,
    durationMs: d.durationMs || null,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
  }));
}

// Re-exported for tests / callers that want to render a single delivery's
// payload (e.g. the operations endpoint).
export { DeviceRow };
