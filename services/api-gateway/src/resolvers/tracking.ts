import { withFilter } from 'graphql-subscriptions';
import { pubsub } from '../utils/pubsub';
import {
  TrackerTag,
  TrackerSite,
  TrackerGateway,
  TrackerReading,
  TrackerLatestPosition,
} from '../models/tracking.models';
import { Equipment } from '../models/equipment.models';
import { TRACKER_POSITION_UPDATED, invalidateGatewayCache } from '../services/trackerIngestService';
import { config } from '../config';

function mapTag(doc: any): Record<string, any> {
  return {
    id: doc._id.toString(),
    bleAddress: doc.bleAddress,
    equipmentId: doc.equipmentId?.toString() || null,
    equipmentName: null,
    label: doc.label,
    status: doc.status,
    lastBattery: doc.lastBattery ?? null,
    lastTemperature: doc.lastTemperature ?? null,
    lastSeenAt: doc.lastSeenAt?.toISOString() || null,
    latestPosition: null as any,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function mapSite(doc: any): Record<string, any> {
  return {
    id: doc._id.toString(),
    name: doc.name,
    floorPlanImageUrl: doc.floorPlanImageUrl || null,
    widthMeters: doc.widthMeters,
    heightMeters: doc.heightMeters,
    geoAnchor: doc.geoAnchor?.lat != null ? {
      lat: doc.geoAnchor.lat,
      lng: doc.geoAnchor.lng,
      rotationDeg: doc.geoAnchor.rotationDeg ?? 0,
    } : null,
    isActive: doc.isActive,
    gateways: [] as any[],
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function mapGateway(doc: any) {
  const now = Date.now();
  const heartbeat = doc.lastHeartbeatAt ? new Date(doc.lastHeartbeatAt).getTime() : 0;
  return {
    id: doc._id.toString(),
    gatewayKey: doc.gatewayKey,
    name: doc.name,
    kind: doc.kind,
    siteId: doc.siteId?.toString() || null,
    position: doc.position?.x != null ? { x: doc.position.x, y: doc.position.y } : null,
    zoneName: doc.zoneName || null,
    vehicleLabel: doc.vehicleLabel || null,
    lastHeartbeatAt: doc.lastHeartbeatAt?.toISOString() || null,
    isActive: doc.isActive,
    online: heartbeat > 0 && now - heartbeat < 120_000,
  };
}

function mapPosition(doc: any) {
  return {
    tagId: doc.tagId.toString(),
    bleAddress: doc.bleAddress || null,
    equipmentId: doc.equipmentId?.toString() || null,
    label: doc.label || null,
    battery: doc.battery ?? null,
    kind: doc.kind,
    siteId: doc.siteId?.toString() || null,
    gatewayId: doc.gatewayId.toString(),
    gatewayName: doc.gatewayName || null,
    zoneName: doc.zoneName || null,
    x: doc.x ?? null,
    y: doc.y ?? null,
    lat: doc.lat ?? null,
    lng: doc.lng ?? null,
    rssi: doc.rssi,
    confidence: doc.confidence ?? 1,
    computedAt: (doc.computedAt instanceof Date ? doc.computedAt.toISOString() : doc.computedAt) || new Date().toISOString(),
  };
}

export const trackingResolvers = {
  Query: {
    trackerSites: async () => {
      const docs = await TrackerSite.find({ isActive: true }).sort({ name: 1 }).lean();
      const sites = docs.map(mapSite);
      for (const site of sites) {
        const gws = await TrackerGateway.find({ siteId: site.id, isActive: true }).lean();
        site.gateways = gws.map(mapGateway);
      }
      return sites;
    },

    trackerSite: async (_: any, { id }: { id: string }) => {
      const doc = await TrackerSite.findById(id).lean();
      if (!doc) return null;
      const site = mapSite(doc);
      const gws = await TrackerGateway.find({ siteId: id, isActive: true }).lean();
      site.gateways = gws.map(mapGateway);
      return site;
    },

    trackerTags: async (_: any, { siteId }: { siteId?: string }) => {
      let tags;
      if (siteId) {
        const positions = await TrackerLatestPosition.find({ siteId }).lean();
        const tagIds = positions.map((p: any) => p.tagId);
        tags = await TrackerTag.find({ _id: { $in: tagIds }, status: { $ne: 'retired' } }).lean();
      } else {
        tags = await TrackerTag.find({ status: { $ne: 'retired' } }).sort({ label: 1 }).lean();
      }

      const result = [];
      for (const t of tags) {
        const mapped = mapTag(t);
        if (t.equipmentId) {
          const eq = await Equipment.findById(t.equipmentId).select('name').lean();
          if (eq) mapped.equipmentName = (eq as any).name;
        }
        const pos = await TrackerLatestPosition.findOne({ tagId: t._id }).lean();
        if (pos) {
          const enriched = { ...pos, bleAddress: t.bleAddress, label: t.label, battery: t.lastBattery };
          if (t.equipmentId) (enriched as any).equipmentId = t.equipmentId;
          mapped.latestPosition = mapPosition(enriched);
        }
        result.push(mapped);
      }
      return result;
    },

    trackerTag: async (_: any, { id }: { id: string }) => {
      const doc = await TrackerTag.findById(id).lean();
      if (!doc) return null;
      const mapped = mapTag(doc);
      if (doc.equipmentId) {
        const eq = await Equipment.findById(doc.equipmentId).select('name').lean();
        if (eq) mapped.equipmentName = (eq as any).name;
      }
      const pos = await TrackerLatestPosition.findOne({ tagId: doc._id }).lean();
      if (pos) {
        const enriched = { ...pos, bleAddress: doc.bleAddress, label: doc.label, battery: doc.lastBattery };
        if (doc.equipmentId) (enriched as any).equipmentId = doc.equipmentId;
        mapped.latestPosition = mapPosition(enriched);
      }
      return mapped;
    },

    trackerLatestPositions: async (_: any, { siteId }: { siteId?: string }) => {
      const filter: any = {};
      if (siteId) filter.siteId = siteId;

      const positions = await TrackerLatestPosition.find(filter).lean();
      const result = [];

      for (const pos of positions) {
        const tag = await TrackerTag.findById(pos.tagId).select('bleAddress label equipmentId lastBattery').lean();
        if (!tag) continue;
        const enriched = {
          ...pos,
          bleAddress: (tag as any).bleAddress,
          label: (tag as any).label,
          battery: (tag as any).lastBattery,
          equipmentId: (tag as any).equipmentId,
        };
        result.push(mapPosition(enriched));
      }
      return result;
    },

    trackerTagHistory: async (_: any, args: { tagId: string; since?: string; until?: string; limit?: number }) => {
      const filter: any = { tagId: args.tagId };
      if (args.since || args.until) {
        filter.ts = {};
        if (args.since) filter.ts.$gte = new Date(args.since);
        if (args.until) filter.ts.$lte = new Date(args.until);
      }
      const limit = Math.min(args.limit || 500, 2000);
      const readings = await TrackerReading.find(filter).sort({ ts: -1 }).limit(limit).lean();

      const gatewayIds = [...new Set(readings.map((r: any) => r.gatewayId.toString()))];
      const gateways = await TrackerGateway.find({ _id: { $in: gatewayIds } }).select('name').lean();
      const gwMap = new Map(gateways.map((g: any) => [g._id.toString(), g.name]));

      return readings.map((r: any) => ({
        id: r._id.toString(),
        gatewayId: r.gatewayId.toString(),
        gatewayName: gwMap.get(r.gatewayId.toString()) || null,
        rssi: r.rssi,
        battery: r.battery ?? null,
        temperature: r.temperature ?? null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        ts: r.ts.toISOString(),
      }));
    },

    trackerGateways: async (_: any, { siteId }: { siteId?: string }) => {
      const filter: any = { isActive: true };
      if (siteId) filter.siteId = siteId;
      const docs = await TrackerGateway.find(filter).sort({ name: 1 }).lean();
      return docs.map(mapGateway);
    },
  },

  Mutation: {
    registerTrackerTag: async (_: any, { equipmentId, bleAddress, label }: { equipmentId?: string; bleAddress: string; label: string }) => {
      const existing = await TrackerTag.findOne({ bleAddress: bleAddress.toUpperCase().trim() });
      if (existing) {
        throw new Error(`Tag with BLE address ${bleAddress} already exists`);
      }

      const tag = await TrackerTag.create({
        bleAddress: bleAddress.toUpperCase().trim(),
        equipmentId: equipmentId || null,
        label,
        status: 'active',
      });

      if (equipmentId) {
        await Equipment.updateOne({ _id: equipmentId }, { $set: { trackerTagId: tag._id } });
      }

      return mapTag(tag);
    },

    unregisterTrackerTag: async (_: any, { tagId }: { tagId: string }) => {
      const tag = await TrackerTag.findById(tagId);
      if (!tag) throw new Error('Tag not found');
      tag.status = 'retired';
      await tag.save();
      if (tag.equipmentId) {
        await Equipment.updateOne({ _id: tag.equipmentId }, { $unset: { trackerTagId: 1 } });
      }
      await TrackerLatestPosition.deleteOne({ tagId: tag._id });
      return true;
    },

    bindTrackerTagToEquipment: async (_: any, { tagId, equipmentId }: { tagId: string; equipmentId: string }) => {
      const tag = await TrackerTag.findById(tagId);
      if (!tag) throw new Error('Tag not found');
      const equipment = await Equipment.findById(equipmentId);
      if (!equipment) throw new Error('Equipment not found');

      // Unbind previous equipment if any
      if (tag.equipmentId) {
        await Equipment.updateOne({ _id: tag.equipmentId }, { $unset: { trackerTagId: 1 } });
      }

      tag.equipmentId = equipment._id;
      await tag.save();
      await Equipment.updateOne({ _id: equipmentId }, { $set: { trackerTagId: tag._id } });

      return mapTag(tag);
    },

    unbindTrackerTagFromEquipment: async (_: any, { tagId }: { tagId: string }) => {
      const tag = await TrackerTag.findById(tagId);
      if (!tag) throw new Error('Tag not found');
      if (tag.equipmentId) {
        await Equipment.updateOne({ _id: tag.equipmentId }, { $unset: { trackerTagId: 1 } });
      }
      tag.equipmentId = undefined;
      await tag.save();
      return mapTag(tag);
    },

    createTrackerSite: async (_: any, { input }: { input: any }) => {
      const siteData: any = {
        name: input.name,
        floorPlanImageUrl: input.floorPlanImageUrl,
        widthMeters: input.widthMeters || 50,
        heightMeters: input.heightMeters || 30,
      };
      if (input.geoAnchorLat != null && input.geoAnchorLng != null) {
        siteData.geoAnchor = {
          lat: input.geoAnchorLat,
          lng: input.geoAnchorLng,
          rotationDeg: input.geoAnchorRotationDeg || 0,
        };
      }
      const doc = await TrackerSite.create(siteData);
      return { ...mapSite(doc), gateways: [] };
    },

    updateTrackerSite: async (_: any, { id, input }: { id: string; input: any }) => {
      const updates: any = {};
      if (input.name != null) updates.name = input.name;
      if (input.floorPlanImageUrl != null) updates.floorPlanImageUrl = input.floorPlanImageUrl;
      if (input.widthMeters != null) updates.widthMeters = input.widthMeters;
      if (input.heightMeters != null) updates.heightMeters = input.heightMeters;
      if (input.isActive != null) updates.isActive = input.isActive;
      if (input.geoAnchorLat != null && input.geoAnchorLng != null) {
        updates.geoAnchor = {
          lat: input.geoAnchorLat,
          lng: input.geoAnchorLng,
          rotationDeg: input.geoAnchorRotationDeg || 0,
        };
      }
      const doc = await TrackerSite.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
      if (!doc) throw new Error('Site not found');
      const site = mapSite(doc);
      const gws = await TrackerGateway.find({ siteId: id, isActive: true }).lean();
      site.gateways = gws.map(mapGateway);
      return site;
    },

    deleteTrackerSite: async (_: any, { id }: { id: string }) => {
      await TrackerSite.findByIdAndDelete(id);
      await TrackerGateway.updateMany({ siteId: id }, { $set: { isActive: false } });
      return true;
    },

    createTrackerGateway: async (_: any, { input }: { input: any }) => {
      const gwData: any = {
        gatewayKey: input.gatewayKey,
        name: input.name,
        kind: input.kind,
        siteId: input.siteId || undefined,
        zoneName: input.zoneName || undefined,
        vehicleLabel: input.vehicleLabel || undefined,
      };
      if (input.positionX != null && input.positionY != null) {
        gwData.position = { x: input.positionX, y: input.positionY };
      }
      const doc = await TrackerGateway.create(gwData);
      invalidateGatewayCache();
      return mapGateway(doc);
    },

    updateTrackerGatewayPosition: async (_: any, { id, x, y }: { id: string; x: number; y: number }) => {
      const doc = await TrackerGateway.findByIdAndUpdate(
        id,
        { $set: { position: { x, y } } },
        { new: true },
      ).lean();
      if (!doc) throw new Error('Gateway not found');
      invalidateGatewayCache((doc as any).gatewayKey);
      return mapGateway(doc);
    },

    deleteTrackerGateway: async (_: any, { id }: { id: string }) => {
      const gw = await TrackerGateway.findById(id).lean();
      if (gw) invalidateGatewayCache((gw as any).gatewayKey);
      await TrackerGateway.findByIdAndDelete(id);
      return true;
    },
  },

  Subscription: {
    trackerPositionUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([TRACKER_POSITION_UPDATED]),
        (payload: any, variables: any) => {
          if (!variables.siteId) return true;
          return payload.trackerPositionUpdated?.siteId === variables.siteId;
        },
      ),
    },
  },
};
