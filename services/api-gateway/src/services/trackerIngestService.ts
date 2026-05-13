import mqtt, { MqttClient } from 'mqtt';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { pubsub } from '../utils/pubsub';
import {
  TrackerTag,
  TrackerGateway,
  TrackerReading,
  TrackerLatestPosition,
  ITrackerGateway,
} from '../models/tracking.models';

const logger = createLogger('tracker-ingest');

export const TRACKER_POSITION_UPDATED = 'TRACKER_POSITION_UPDATED';

let client: MqttClient | null = null;

// In-memory cache of gateway docs keyed by gatewayKey to avoid DB lookups on every reading
const gatewayCache = new Map<string, ITrackerGateway>();
const GATEWAY_CACHE_TTL_MS = 60_000;
const gatewayCacheTimestamps = new Map<string, number>();

async function resolveGateway(gatewayKey: string): Promise<ITrackerGateway | null> {
  const now = Date.now();
  const cachedTs = gatewayCacheTimestamps.get(gatewayKey);
  if (cachedTs && now - cachedTs < GATEWAY_CACHE_TTL_MS) {
    return gatewayCache.get(gatewayKey) || null;
  }

  const gw = await TrackerGateway.findOne({ gatewayKey, isActive: true }).lean() as ITrackerGateway | null;
  if (gw) {
    gatewayCache.set(gatewayKey, gw);
    gatewayCacheTimestamps.set(gatewayKey, now);
  }
  return gw;
}

export function invalidateGatewayCache(gatewayKey?: string): void {
  if (gatewayKey) {
    gatewayCache.delete(gatewayKey);
    gatewayCacheTimestamps.delete(gatewayKey);
  } else {
    gatewayCache.clear();
    gatewayCacheTimestamps.clear();
  }
}

interface IngestReading {
  mac: string;
  rssi: number;
  battery?: number;
  temperature?: number;
}

interface IngestPayload {
  ts: string;
  readings: IngestReading[];
  gatewayLocation?: {
    lat: number;
    lng: number;
    accuracyMeters?: number;
  };
}

export async function processIngestPayload(
  gatewayKey: string,
  payload: IngestPayload,
): Promise<{ processed: number; skipped: number }> {
  const gateway = await resolveGateway(gatewayKey);
  if (!gateway) {
    logger.warn('Unknown or inactive gateway key', { gatewayKey });
    return { processed: 0, skipped: 0 };
  }

  // Bump heartbeat in the background
  TrackerGateway.updateOne(
    { _id: gateway._id },
    { $set: { lastHeartbeatAt: new Date() } },
  ).exec().catch((err) => logger.error('Heartbeat update failed', { err: String(err) }));

  const ts = new Date(payload.ts || Date.now());
  let processed = 0;
  let skipped = 0;

  for (const reading of payload.readings) {
    const mac = reading.mac?.toUpperCase()?.trim();
    if (!mac) { skipped++; continue; }

    const tag = await TrackerTag.findOne({ bleAddress: mac, status: 'active' });
    if (!tag) {
      logger.debug('No active tag for MAC', { mac });
      skipped++;
      continue;
    }

    const readingLat = payload.gatewayLocation?.lat;
    const readingLng = payload.gatewayLocation?.lng;

    const readingDoc = await TrackerReading.create({
      tagId: tag._id,
      gatewayId: gateway._id,
      rssi: reading.rssi,
      battery: reading.battery,
      temperature: reading.temperature,
      lat: readingLat,
      lng: readingLng,
      ts,
    });

    // Update tag metadata
    tag.lastSeenAt = ts;
    tag.lastReadingId = readingDoc._id;
    if (reading.battery != null) tag.lastBattery = reading.battery;
    if (reading.temperature != null) tag.lastTemperature = reading.temperature;
    await tag.save();

    // Compute position
    const isIndoor = gateway.kind === 'fixed' && gateway.position;
    const kind = isIndoor ? 'indoor' as const : 'outdoor' as const;

    const positionUpdate: Record<string, any> = {
      kind,
      gatewayId: gateway._id,
      gatewayName: gateway.name,
      rssi: reading.rssi,
      confidence: rssiToConfidence(reading.rssi),
      computedAt: ts,
    };

    if (isIndoor) {
      positionUpdate.siteId = gateway.siteId;
      positionUpdate.zoneName = gateway.zoneName || gateway.name;
      positionUpdate.x = gateway.position!.x;
      positionUpdate.y = gateway.position!.y;
      positionUpdate.lat = undefined;
      positionUpdate.lng = undefined;
    } else if (readingLat != null && readingLng != null) {
      positionUpdate.lat = readingLat;
      positionUpdate.lng = readingLng;
      positionUpdate.siteId = undefined;
      positionUpdate.x = undefined;
      positionUpdate.y = undefined;
      positionUpdate.zoneName = undefined;
    }

    // "Loudest RSSI wins" for indoor: only update if this reading is stronger
    // than the current position from a different gateway in the last 10 seconds
    let shouldUpdate = true;
    if (isIndoor) {
      const current = await TrackerLatestPosition.findOne({ tagId: tag._id }).lean();
      if (
        current &&
        current.kind === 'indoor' &&
        current.gatewayId.toString() !== gateway._id.toString() &&
        current.computedAt &&
        ts.getTime() - new Date(current.computedAt).getTime() < 10_000 &&
        current.rssi > reading.rssi
      ) {
        shouldUpdate = false;
      }
    }

    if (shouldUpdate) {
      await TrackerLatestPosition.findOneAndUpdate(
        { tagId: tag._id },
        { $set: positionUpdate },
        { upsert: true, new: true },
      );

      const enrichedPosition = {
        tagId: tag._id.toString(),
        bleAddress: tag.bleAddress,
        equipmentId: tag.equipmentId?.toString() || null,
        label: tag.label,
        battery: tag.lastBattery,
        ...positionUpdate,
        siteId: positionUpdate.siteId?.toString() || null,
        gatewayId: gateway._id.toString(),
      };

      pubsub.publish(TRACKER_POSITION_UPDATED, {
        trackerPositionUpdated: enrichedPosition,
      });
    }

    processed++;
  }

  return { processed, skipped };
}

function rssiToConfidence(rssi: number): number {
  // Map typical BLE RSSI range (-30 very close .. -100 very far) to 0..1
  const clamped = Math.max(-100, Math.min(-30, rssi));
  return parseFloat(((clamped + 100) / 70).toFixed(2));
}

export function startTrackerIngest(): void {
  if (!config.ENABLE_TRACKING) {
    logger.info('BLE tracking disabled (ENABLE_TRACKING=false)');
    return;
  }

  const brokerUrl = config.MQTT_BROKER_URL;
  const topicPrefix = config.MQTT_TOPIC_PREFIX;

  const connectOptions: mqtt.IClientOptions = {
    clientId: `lancelot-api-${process.pid}`,
    clean: true,
    reconnectPeriod: 5000,
  };

  if (config.MQTT_USERNAME) {
    connectOptions.username = config.MQTT_USERNAME;
    connectOptions.password = config.MQTT_PASSWORD;
  }

  logger.info('Connecting to MQTT broker', { brokerUrl, topicPrefix });

  client = mqtt.connect(brokerUrl, connectOptions);

  client.on('connect', () => {
    logger.info('Connected to MQTT broker');
    const readingsTopic = `${topicPrefix}/+/readings`;
    const heartbeatTopic = `${topicPrefix}/+/heartbeat`;
    client!.subscribe([readingsTopic, heartbeatTopic], { qos: 1 }, (err) => {
      if (err) {
        logger.error('MQTT subscribe failed', { err: String(err) });
      } else {
        logger.info('Subscribed to tracking topics', { readingsTopic, heartbeatTopic });
      }
    });
  });

  client.on('message', async (topic, message) => {
    try {
      const parts = topic.split('/');
      // Expected: <prefix>/<gatewayKey>/<type>
      const gatewayKey = parts[parts.length - 2];
      const msgType = parts[parts.length - 1];

      if (msgType === 'heartbeat') {
        const gw = await resolveGateway(gatewayKey);
        if (gw) {
          await TrackerGateway.updateOne(
            { _id: gw._id },
            { $set: { lastHeartbeatAt: new Date() } },
          );
        }
        return;
      }

      if (msgType === 'readings') {
        const payload: IngestPayload = JSON.parse(message.toString());
        if (!payload.readings || !Array.isArray(payload.readings)) {
          logger.warn('Invalid ingest payload: missing readings array', { topic });
          return;
        }
        const result = await processIngestPayload(gatewayKey, payload);
        logger.debug('Processed readings batch', { gatewayKey, ...result });
      }
    } catch (err) {
      logger.error('Error processing MQTT message', { topic, err: String(err) });
    }
  });

  client.on('error', (err) => {
    logger.error('MQTT client error', { err: String(err) });
  });

  client.on('reconnect', () => {
    logger.info('Reconnecting to MQTT broker');
  });

  client.on('close', () => {
    logger.info('MQTT connection closed');
  });
}

export function stopTrackerIngest(): void {
  if (client) {
    client.end(true);
    client = null;
    logger.info('MQTT client disconnected');
  }
}
