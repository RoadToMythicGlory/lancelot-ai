import { Router, Request, Response } from 'express';
import { processIngestPayload } from '../services/trackerIngestService';
import { TrackerGateway } from '../models/tracking.models';
import { createLogger } from '../utils/logger';

const logger = createLogger('tracking-routes');
const router = Router();

/**
 * POST /api/tracking/ingest
 * HTTPS fallback for gateways / phone scanners that can't use MQTT.
 * Authenticated via `Authorization: Bearer <gatewayKey>`.
 * Body matches the same JSON schema as the MQTT payload.
 */
router.post('/ingest', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Missing or invalid Authorization header. Use Bearer <gatewayKey>.' });
    }

    const gatewayKey = authHeader.substring(7).trim();
    if (!gatewayKey) {
      return res.status(401).json({ success: false, error: 'Empty gateway key' });
    }

    const payload = req.body;
    if (!payload || !Array.isArray(payload.readings)) {
      return res.status(400).json({ success: false, error: 'Invalid payload: "readings" array is required' });
    }

    const result = await processIngestPayload(gatewayKey, payload);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    logger.error('Error processing tracking ingest', { err: error.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/tracking/gateways/status
 * Quick health overview of all gateways — useful for an admin dashboard.
 */
router.get('/gateways/status', async (_req: Request, res: Response) => {
  try {
    const gateways = await TrackerGateway.find({ isActive: true })
      .select('name kind siteId vehicleLabel lastHeartbeatAt')
      .lean();

    const now = Date.now();
    const items = gateways.map((gw: any) => ({
      id: gw._id.toString(),
      name: gw.name,
      kind: gw.kind,
      vehicleLabel: gw.vehicleLabel || null,
      lastHeartbeatAt: gw.lastHeartbeatAt?.toISOString() || null,
      online: gw.lastHeartbeatAt ? now - new Date(gw.lastHeartbeatAt).getTime() < 120_000 : false,
    }));

    return res.json({ success: true, gateways: items });
  } catch (error: any) {
    logger.error('Error fetching gateway status', { err: error.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export { router as trackingRoutes };
