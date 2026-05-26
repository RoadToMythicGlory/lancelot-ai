// externalApiRoutes
//
// Versioned, read-only REST surface for the external partner dashboard.
// Mounted at `/api/v1/external` from `index.ts`. Authenticated by
// `X-API-Key` (env-managed list) and rate-limited per key.
//
// Endpoints exposed here intentionally mirror, byte-for-byte, the data
// shown on the in-app "ציוד הנדסה שיתופי" tab — and they share the same
// aggregator service so the two surfaces never drift.

import { Router, Request, Response, NextFunction } from 'express';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { validateApiKey } from '../middleware/security';
import { externalApiLimiter } from '../middleware/externalApiLimiter';
import {
  listSharedEngineeringDevices,
  getSharedEngineeringSnapshotForExport,
  getSharedEngineeringDevice,
  getSharedEngineeringDeviceHistory,
} from '../services/sharedEngineeringExport.service';
import { listExternalWebhookDeliveries } from '../services/webhookDelivery.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('external-api');
const router = Router();

// ---------- Helpers -----------------------------------------------------

function baseUrlFor(req: Request): string {
  // Build a fully-qualified base URL so `_links` are absolute.
  // Trust the standard `X-Forwarded-*` headers since the gateway sits
  // behind nginx / a load balancer in production.
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  return `${proto}://${host}/api/v1/external/shared-engineering-equipment`;
}

function parseIsoDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch((err) => {
      logger.error('External API handler error', {
        path: req.path,
        err: err?.message || String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({
          error: 'internal_server_error',
          message: 'Unexpected error processing the request.',
        });
      }
    });
  };
}

// ---------- Public, unauthenticated endpoints ---------------------------

// Liveness ping. No auth required so partner dashboards can run an
// uptime monitor without burning their API quota.
router.get('/healthz', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'lancelot-external-api',
    version: 'v1',
    timestamp: new Date().toISOString(),
  });
});

// OpenAPI spec — public so partners can download it without an API key.
router.get('/openapi.yaml', (_req: Request, res: Response) => {
  const candidates = [
    path.join(__dirname, '..', '..', 'openapi', 'external.yaml'),
    path.join(__dirname, '..', '..', '..', 'openapi', 'external.yaml'),
    path.join(process.cwd(), 'services', 'api-gateway', 'openapi', 'external.yaml'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    res.status(404).json({ error: 'not_found', message: 'OpenAPI spec not found' });
    return;
  }
  res.setHeader('Content-Type', 'application/yaml; charset=utf-8');
  res.send(readFileSync(found, 'utf8'));
});

// ---------- Authenticated endpoints -------------------------------------
// Order matters: validate the key first so its id is on the request, then
// apply the per-key rate limiter.
router.use(validateApiKey);
router.use(externalApiLimiter);

// GET /shared-engineering-equipment
// Paginated list. Query: status, category, assignedTo, updatedSince, cursor, limit.
router.get(
  '/shared-engineering-equipment',
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const assignedToRaw = typeof req.query.assignedTo === 'string'
      ? req.query.assignedTo
      : undefined;
    const assignedTo: 'event' | 'staff' | 'none' | undefined =
      assignedToRaw === 'event' || assignedToRaw === 'staff' || assignedToRaw === 'none'
        ? assignedToRaw
        : undefined;
    const updatedSince = parseIsoDate(req.query.updatedSince);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const limit = typeof req.query.limit === 'string'
      ? parseInt(req.query.limit, 10)
      : 100;

    const result = await listSharedEngineeringDevices(
      { status, category, assignedTo, updatedSince },
      { cursor, limit },
      baseUrlFor(req),
    );

    res.json(result);
  }),
);

// GET /shared-engineering-equipment/snapshot
// Full, uncapped dump. Used by partner dashboards for the initial load.
// Response is JSON; nginx / express handles gzip via `Accept-Encoding`.
router.get(
  '/shared-engineering-equipment/snapshot',
  asyncHandler(async (req, res) => {
    const result = await getSharedEngineeringSnapshotForExport(baseUrlFor(req));
    res.json(result);
  }),
);

// GET /shared-engineering-equipment/:id
router.get(
  '/shared-engineering-equipment/:id',
  asyncHandler(async (req, res) => {
    const row = await getSharedEngineeringDevice(req.params.id, baseUrlFor(req));
    if (!row) {
      res.status(404).json({
        error: 'not_found',
        message: `No shared engineering equipment with id ${req.params.id}`,
      });
      return;
    }
    res.json({ data: row, meta: { generatedAt: new Date().toISOString() } });
  }),
);

// GET /shared-engineering-equipment/:id/history
router.get(
  '/shared-engineering-equipment/:id/history',
  asyncHandler(async (req, res) => {
    const limit = typeof req.query.limit === 'string'
      ? parseInt(req.query.limit, 10)
      : 100;
    const history = await getSharedEngineeringDeviceHistory(req.params.id, limit);
    res.json({
      data: history,
      meta: {
        total: history.length,
        generatedAt: new Date().toISOString(),
      },
    });
  }),
);

// GET /webhooks/deliveries
// Operations endpoint — partner can confirm whether their endpoint is
// receiving pushes (or whether they're stuck in a retry loop because
// they returned 5xx).
router.get(
  '/webhooks/deliveries',
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = typeof req.query.limit === 'string'
      ? parseInt(req.query.limit, 10)
      : 100;
    const since = parseIsoDate(req.query.since);
    const deliveries = await listExternalWebhookDeliveries({ status, limit, since });
    res.json({
      data: deliveries,
      meta: {
        total: deliveries.length,
        generatedAt: new Date().toISOString(),
      },
    });
  }),
);

// Catch-all 404 — return JSON, not an HTML error page.
router.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'not_found',
    message: `No external API endpoint at ${req.method} ${req.path}`,
  });
});

export { router as externalApiRoutes };
