import { connectMongoose } from '../config/mongodb';
import { BroadcastEvent, RoutingConfig } from '../models/broadcast.models';
import { Equipment, generateBarcode, EquipmentAssignment, EquipmentHistory, QUANTITY_BASED_DEFAULT_CATEGORIES } from '../models/equipment.models';
import { Warehouse } from '../models/warehouse.models';
import { ExternalBroadcastPreset } from '../models/externalBroadcastPreset.models';
import mongoose from 'mongoose';
import { requireAuth, requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';
import { preflightBroadcastEvent, validateStatusTransition } from '../services/broadcast.service';
import { allocateEquipment, returnEquipment } from '../services/warehouse.service';
import {
  ensureShadowMcrEventForBroadcast,
  syncShadowMcrEventFromBroadcast,
  detachShadowMcrEventOnBroadcastDelete,
} from '../services/mcrShadowEvent';
import { syncSharedEngineeringSnapshotForEvent } from '../services/sharedEngineeringSnapshot';
import { createLogger } from '../utils/logger';

const log = createLogger('broadcast-resolver');

let mongooseConnected = false;

// Ensure MongoDB connection is established
async function ensureMongoConnection() {
  if (!mongooseConnected) {
    await connectMongoose();
    mongooseConnected = true;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getContextUserId(context: any): string {
  return context?.user?.userId || context?.user?.id || 'system';
}

function getContextUserDisplayName(context: any): string {
  const user = context?.user;
  return (
    user?.displayName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.email ||
    'System'
  );
}

function buildWarehouseEquipmentQuery(filter?: any): any {
  const query: any = {};

  if (!filter) return query;

  if (filter.category) {
    query.category = filter.category;
  }
  if (filter.status) {
    if (filter.status === 'disabled') {
      query.isDisabled = true;
    } else if (filter.status === 'under_maintenance') {
      query.suspensionStatus = 'under_maintenance';
      query.isDisabled = true;
    } else {
      query.status = filter.status;
    }
  }
  if (filter.available) {
    query.quantityAvailable = { $gt: 0 };
  }
  if (filter.location) {
    query.currentLocation = { $regex: filter.location, $options: 'i' };
  }
  if (filter.warehouseId && mongoose.Types.ObjectId.isValid(filter.warehouseId)) {
    query.warehouseId = new mongoose.Types.ObjectId(filter.warehouseId);
  }
  if (filter.storagePlaceId && mongoose.Types.ObjectId.isValid(filter.storagePlaceId)) {
    query.storagePlaceId = new mongoose.Types.ObjectId(filter.storagePlaceId);
  }
  if (filter.searchText && String(filter.searchText).trim()) {
    const searchRegex = { $regex: escapeRegex(String(filter.searchText).trim()), $options: 'i' };
    query.$or = [
      { name: searchRegex },
      { barcode: searchRegex },
      { company: searchRegex },
      { equipmentModel: searchRegex },
      { category: searchRegex },
    ];
  }
  if (filter.isSharedEngineeringEquipment !== undefined && filter.isSharedEngineeringEquipment !== null) {
    query.isSharedEngineeringEquipment = !!filter.isSharedEngineeringEquipment;
  }
  // Default-hide disabled equipment when the caller asks for it. The
  // `disabled` / `under_maintenance` status filters above already pin
  // `isDisabled = true`, so we only honour `excludeDisabled` when those
  // didn't claim the field — otherwise the two would clash.
  if (filter.excludeDisabled === true && query.isDisabled === undefined) {
    query.isDisabled = { $ne: true };
  }

  return query;
}

// Resolve a (warehouseId, storagePlaceId) pair into a human-readable
// location string, used to keep the legacy `currentLocation` field in
// sync so older UIs and reports keep working. Returns `null` if the
// warehouse can't be found.
async function buildLocationStringFromWarehouse(
  warehouseId: string | null | undefined,
  storagePlaceId?: string | null,
): Promise<string | null> {
  if (!warehouseId || !mongoose.Types.ObjectId.isValid(warehouseId)) {
    return null;
  }
  const warehouse = await Warehouse.findById(warehouseId).exec();
  if (!warehouse) {
    return null;
  }
  if (storagePlaceId && mongoose.Types.ObjectId.isValid(storagePlaceId)) {
    const place = warehouse.storagePlaces.id(storagePlaceId);
    if (place) {
      const codeSuffix = place.code ? ` (${place.code})` : '';
      return `${warehouse.name} - ${place.name}${codeSuffix}`;
    }
  }
  return warehouse.name;
}

// Build the new structured "warehouse"/"storagePlace" GraphQL fields
// alongside the equipment payload. We expose lightweight snapshots so
// list views don't need a second round-trip.
function buildEquipmentLocationFields(equipment: any, warehouseCache: Map<string, any>) {
  const warehouseId = equipment.warehouseId ? equipment.warehouseId.toString() : null;
  const storagePlaceId = equipment.storagePlaceId ? equipment.storagePlaceId.toString() : null;
  const warehouse = warehouseId ? warehouseCache.get(warehouseId) : null;

  let storagePlace: any = null;
  if (warehouse && storagePlaceId) {
    const place = warehouse.storagePlaces?.find?.(
      (p: any) => p._id?.toString() === storagePlaceId,
    );
    if (place) {
      storagePlace = {
        id: place._id.toString(),
        name: place.name,
        type: place.type || 'other',
        code: place.code || null,
        notes: place.notes || null,
        isActive: place.isActive !== false,
        createdAt: place.createdAt ? new Date(place.createdAt).toISOString() : null,
        updatedAt: place.updatedAt ? new Date(place.updatedAt).toISOString() : null,
      };
    }
  }

  const warehouseSnapshot = warehouse
    ? {
        id: warehouse._id.toString(),
        name: warehouse.name,
        description: warehouse.description || null,
        address: warehouse.address || null,
        dimensions: warehouse.dimensions
          ? {
              length: warehouse.dimensions.length ?? null,
              width: warehouse.dimensions.width ?? null,
              height: warehouse.dimensions.height ?? null,
              unit: warehouse.dimensions.unit || 'meters',
            }
          : null,
        storagePlaces: Array.isArray(warehouse.storagePlaces)
          ? warehouse.storagePlaces.map((p: any) => ({
              id: p._id.toString(),
              name: p.name,
              type: p.type || 'other',
              code: p.code || null,
              notes: p.notes || null,
              isActive: p.isActive !== false,
              createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
              updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
            }))
          : [],
        isActive: warehouse.isActive !== false,
        createdBy: warehouse.createdBy || null,
        createdAt: warehouse.createdAt
          ? new Date(warehouse.createdAt).toISOString()
          : new Date().toISOString(),
        updatedAt: warehouse.updatedAt
          ? new Date(warehouse.updatedAt).toISOString()
          : new Date().toISOString(),
      }
    : null;

  return {
    warehouseId,
    storagePlaceId,
    warehouse: warehouseSnapshot,
    storagePlace,
  };
}

// Bulk load warehouses referenced by a list of equipment rows so the
// `warehouseEquipment` list resolver stays O(1) DB queries instead of
// O(N).
async function loadWarehousesForEquipment(items: any[]): Promise<Map<string, any>> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item?.warehouseId) {
      ids.add(item.warehouseId.toString());
    }
  }
  if (ids.size === 0) return new Map();
  const docs = await Warehouse.find({
    _id: { $in: Array.from(ids).map((id) => new mongoose.Types.ObjectId(id)) },
  }).exec();
  const cache = new Map<string, any>();
  for (const doc of docs) {
    cache.set(doc._id.toString(), doc);
  }
  return cache;
}

// Map database status values to GraphQL BroadcastEventStatus enum values
function mapStatusToEnum(dbStatus: string | null | undefined): string {
  // Handle null/undefined values
  if (!dbStatus) {
    return 'planned';
  }
  
  const statusMapping: { [key: string]: string } = {
    'PLANNED': 'planned',
    'planned': 'planned',
    'scheduled': 'planned',
    'SCHEDULED': 'planned',
    'CONFIRMED': 'confirmed', 
    'confirmed': 'confirmed',
    'IN_PROGRESS': 'in_progress',
    'in_progress': 'in_progress',
    'COMPLETED': 'completed',
    'completed': 'completed',
    'CANCELLED': 'cancelled',
    'cancelled': 'cancelled',
    'ERROR': 'cancelled',
    'error': 'cancelled'
  };
  
  // Return mapped value or default to 'planned' if unknown
  return statusMapping[dbStatus] || 'planned';
}

interface BroadcastEventInput {
  title: string;
  description?: string;
  eventType: string;
  startTime: string;
  endTime?: string;
  source?: string;
  destination?: string;
  satellite?: string;
  technicalDirectorId?: string;
  controlOperatorId?: string;
  priority?: string;
  metadata?: any;
}

export const broadcastResolvers = {
  Query: {
    departments: async (_: any, __: any, context: any) => {
      try {
        requireAuth(context);
        await ensureMongoConnection();

        // Departments are stored in MongoDB "departments" collection (seed scripts populate it)
        const db = mongoose.connection.db;
        if (!db) {
          console.error('❌ MongoDB connection not ready (db undefined)');
          return [];
        }
        const collection = db.collection('departments');
        const docs = await collection
          .find({ isActive: { $ne: false } })
          .sort({ category: 1, name: 1 })
          .toArray();

        // Important: users.filter.departmentId expects the department *code* (not Mongo _id).
        // We therefore expose Department.id as the department code for consistent filtering.
        return docs
          .filter((d: any) => d && (d.code || d._id))
          .map((d: any) => {
            const code = d.code ? String(d.code) : null;
            const now = new Date();

            // Roles can be either an array of strings (legacy) or an array of
            // role definitions ({ key, name, permissions, ... }). Normalize
            // both shapes into the legacy `roles: [String!]` field plus the
            // richer `departmentRoles: [DepartmentRoleDef!]` list.
            const rawRoles = Array.isArray(d.roles) ? d.roles : [];
            const legacyRoleNames = rawRoles
              .map((r: any) => (typeof r === 'string' ? r : r?.name || r?.key))
              .filter(Boolean);
            const departmentRoles = rawRoles
              .filter((r: any) => r && typeof r === 'object' && r.key)
              .map((r: any) => ({
                key: String(r.key),
                name: String(r.name || r.key),
                hebrewName: r.hebrewName ?? null,
                description: r.description ?? null,
                permissions: Array.isArray(r.permissions) ? r.permissions : [],
                order: typeof r.order === 'number' ? r.order : 0,
                isActive: r.isActive !== false,
              }));

            return {
              id: code || d._id.toString(),
              name: d.name ? String(d.name) : (code || 'Unknown'),
              hebrewName: d.hebrewName ?? d.hebrew_name ?? null,
              code: code,
              createdAt: d.createdAt || now,
              category: d.category ? String(d.category) : 'General',
              roles: legacyRoleNames,
              description: d.description ?? null,
              isActive: d.isActive !== false,
              updatedAt: d.updatedAt || d.createdAt || now,
              departmentRoles,
              includesDepartmentCodes: Array.isArray(d.includesDepartmentCodes)
                ? d.includesDepartmentCodes
                : [],
              permissions: Array.isArray(d.permissions) ? d.permissions : [],
            };
          });
      } catch (error) {
        console.error('Error fetching departments:', error);
        return [];
      }
    },

    warehouseEquipment: async (_: any, { filter, limit, offset }: { filter?: any; limit?: number; offset?: number }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_VIEW);
        await ensureMongoConnection();

        const query = buildWarehouseEquipmentQuery(filter);

        // Hard cap pagination so the warehouse list never returns the
        // entire collection (currently ~4,000+ items). For administrative
        // exports use a dedicated reporting endpoint rather than raising
        // this cap.
        const MAX_LIMIT = 500;
        const cappedLimit = Math.min(Math.max(limit ?? 200, 1), MAX_LIMIT);
        const cappedOffset = Math.max(offset ?? 0, 0);

        const equipment = await Equipment.find(query)
          .sort({ name: 1 })
          .skip(cappedOffset)
          .limit(cappedLimit)
          .exec();

        const warehouseCache = await loadWarehousesForEquipment(equipment);

        // Map to GraphQL format
        return equipment.map(item => ({
          id: item._id.toString(),
          name: item.name,
          category: item.category,
          brand: item.company || null,
          barcode: item.barcode,
          status: item.status,
          condition: item.condition || null,
          quantityTotal: item.quantityTotal,
          quantityAvailable: item.quantityAvailable,
          quantityAssigned: item.quantityAssigned,
          currentLocation: item.currentLocation || null,
          price: item.price || null,
          purchaseDate: item.purchaseDate?.toISOString() || null,
          warrantyExpiryDate: item.warrantyExpiryDate?.toISOString() || null,
          company: item.company || null,
          equipmentModel: item.equipmentModel || null,
          contactPerson: item.contactPerson || null,
          manualLink: item.manualLink || null,
          imageUrl: item.imageUrl || null,
          storage: item.storage || null,
          ...buildEquipmentLocationFields(item, warehouseCache),
          isQuantityBased: item.isQuantityBased || false,
          isSharedEngineeringEquipment: item.isSharedEngineeringEquipment || false,
          isDisabled: item.isDisabled || false,
          disabledAt: item.disabledAt?.toISOString() || null,
          disabledReason: item.disabledReason || null,
          suspensionStatus: item.suspensionStatus || null,
          lastUsedAt: item.lastUsedAt?.toISOString() || null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString()
        }));
      } catch (error) {
        console.error('Error fetching warehouse equipment:', error);
        return [];
      }
    },

    /**
     * Slim "all active equipment for pickers" projection. Necessary because
     * the main `warehouseEquipment` query is hard-capped at 500 rows (it
     * powers the warehouse list UI and never needs to dump the full
     * collection), which silently truncated the Preset Items picker on
     * Equipment Sets — the org has ~4,000 active items.
     *
     * This query only returns the small set of fields a Select option
     * needs (id, name, category, quantityTotal, barcode, isDisabled,
     * isQuantityBased) so the payload stays small even at the higher cap.
     */
    warehouseEquipmentForPicker: async (
      _: any,
      args: { search?: string | null },
      context: any,
    ) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_VIEW);
        await ensureMongoConnection();

        // Exclude rows that would violate the non-null `name` contract on
        // `WarehouseEquipmentPickerItem`. The Equipment model marks `name`
        // as required, but legacy/imported documents (e.g. from the PDF
        // parser pipeline) have slipped through without one. Even a single
        // such row would null the entire 5000-item picker payload via
        // GraphQL non-null propagation.
        const query: any = {
          isDisabled: { $ne: true },
          name: { $type: 'string', $ne: '' },
        };
        if (args?.search) {
          const re = new RegExp(args.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          query.$or = [{ name: re }, { barcode: re }, { equipmentModel: re }];
        }

        // 5000 keeps the per-item picker functional for the foreseeable
        // future while still bounding worst-case payload. If/when the
        // catalog passes this size, swap to a server-side searchable
        // typeahead instead of raising it further.
        const PICKER_LIMIT = 5000;
        const items = await Equipment.find(query)
          .select({
            name: 1,
            category: 1,
            barcode: 1,
            quantityTotal: 1,
            isQuantityBased: 1,
            isDisabled: 1,
            company: 1,
          })
          .sort({ name: 1 })
          .limit(PICKER_LIMIT)
          .lean()
          .exec();

        // Defensive second pass — the DB filter is the primary guard, but
        // an extra runtime check ensures one malformed row can never null
        // the entire list via non-null propagation.
        return items
          .filter((it: any) => typeof it?.name === 'string' && it.name.length > 0)
          .map((it: any) => ({
            id: it._id.toString(),
            name: it.name,
            category: it.category ?? null,
            barcode: it.barcode || null,
            quantityTotal: it.quantityTotal ?? null,
            isQuantityBased: !!it.isQuantityBased,
            isDisabled: !!it.isDisabled,
            brand: it.company || null,
          }));
      } catch (err) {
        console.error('Error fetching warehouse equipment picker list:', err);
        return [];
      }
    },

    warehouseEquipmentCategories: async (_: any, __: unknown, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_VIEW);
        await ensureMongoConnection();
        // Distinct categories across all active (non-disabled) equipment.
        // Lets the warehouse list UI populate its category filter without
        // having to fetch the full catalog client-side once we paginate
        // the main list server-side.
        const raw = await Equipment.distinct('category', { isDisabled: { $ne: true } });
        return (raw as unknown[])
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .sort((a, b) => a.localeCompare(b, 'he'));
      } catch (error) {
        console.error('Error fetching warehouse equipment categories:', error);
        return [];
      }
    },

    warehouseEquipmentStats: async (_: any, { filter }: { filter?: any }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_VIEW);
        await ensureMongoConnection();

        const baseQuery = buildWarehouseEquipmentQuery(filter);
        const activeQuery = { ...baseQuery, isDisabled: { $ne: true } };

        const [
          totalEquipment,
          totalAvailable,
          totalAssigned,
          totalMaintenance,
          totalDisabled,
        ] = await Promise.all([
          Equipment.countDocuments(activeQuery),
          Equipment.countDocuments({ ...activeQuery, status: 'available' }),
          Equipment.countDocuments({ ...activeQuery, status: 'assigned' }),
          Equipment.countDocuments({ ...activeQuery, status: 'maintenance' }),
          Equipment.countDocuments({ ...baseQuery, isDisabled: true }),
        ]);

        return {
          totalEquipment,
          totalAvailable,
          totalAssigned,
          totalMaintenance,
          totalDisabled,
        };
      } catch (error) {
        console.error('Error fetching warehouse equipment stats:', error);
        return {
          totalEquipment: 0,
          totalAvailable: 0,
          totalAssigned: 0,
          totalMaintenance: 0,
          totalDisabled: 0,
        };
      }
    },

    broadcastEvents: async (_: any, args: { startDate?: string; endDate?: string; filter?: any; limit?: number; offset?: number }, context: any) => {
      try {
        requirePermission(context, Permission.BROADCAST_VIEW);
        await ensureMongoConnection();
        console.log('🔍 broadcastEvents resolver called with args:', args);
        
        // Build query filter
        const query: any = {};
        
        // Handle direct parameters (for frontend compatibility)
        if (args.startDate || args.endDate) {
          query.startTime = {};
          if (args.startDate) {
            query.startTime.$gte = new Date(args.startDate);
          }
          if (args.endDate) {
            query.startTime.$lte = new Date(args.endDate);
          }
        }
        
        // Handle filter object (for backend compatibility)
        if (args.filter) {
          const { departmentId, status, date, startDate: filterStartDate, endDate: filterEndDate } = args.filter;
          
          if (departmentId) {
            query.departmentId = departmentId;
          }
          
          if (status) {
            query.status = status.toLowerCase();
          }
          
          if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            query.startTime = { $gte: startOfDay, $lte: endOfDay };
          }
          
          if (filterStartDate || filterEndDate) {
            if (!query.startTime) query.startTime = {};
            if (filterStartDate) {
              query.startTime.$gte = new Date(filterStartDate);
            }
            if (filterEndDate) {
              query.startTime.$lte = new Date(filterEndDate);
            }
          }
        }
        
        console.log('📊 MongoDB query:', JSON.stringify(query, null, 2));

        const MAX_LIMIT = 500;
        const cappedLimit = Math.min(Math.max(args.limit ?? 200, 1), MAX_LIMIT);
        const cappedOffset = Math.max(args.offset ?? 0, 0);

        const events = await BroadcastEvent.find(query)
          .sort({ startTime: 1 })
          .skip(cappedOffset)
          .limit(cappedLimit)
          .exec();

        console.log('📊 Found', events.length, 'events');
        
        // Map MongoDB documents to GraphQL format
        const mappedResults = events.map((eventDoc: any) => {
          const event: any = eventDoc.toObject ? eventDoc.toObject() : eventDoc;
          return {
          id: event.id,
          eventNumber: event.eventNumber,
          title: event.title || '',
          hebrewTitle: event.hebrewTitle,
          description: event.description,
          eventType: event.eventType || 'live_show',
          type: event.type || 'live',
          status: mapStatusToEnum(event.status),
          startTime: event.startTime?.toISOString(),
          endTime: event.endTime?.toISOString(),
          koTime: event.koTime?.toISOString(),
          arrivalTime: event.arrivalTime?.toISOString(),
          actualStartTime: event.actualStartTime?.toISOString(),
          actualEndTime: event.actualEndTime?.toISOString(),
          location: event.location,
          venue: event.venue,
          liveLocation: event.liveLocation,
          synopsis: event.synopsis,
          synopsis_file: event.synopsisFile || event.synopsis_file,  // Support both field names
          synopsisFile: event.synopsisFile || event.synopsis_file,
          channel: event.channel || '',
          parallelChannel: event.parallelChannel,
          channel1_4k: event.channel1_4k,
          live: event.live,
          backup: event.backup,
          requiresSignLanguage: event.requiresSignLanguage,
          requiresSubtitles: event.requiresSubtitles,
          accessibilityStatus: event.accessibilityStatus,
          contentDuration: event.contentDuration,
          contentType: event.contentType,
          contentSource: event.contentSource,
          source: event.source,
          destination: event.destination,
          satellite: event.satellite,
          technicalDirectorId: event.technicalDirectorId,
          controlOperatorId: event.controlOperatorId,
          priority: event.priority || 'normal',
          routingConfig: event.routingConfig,
          routing_preset: event.routingPreset || event.routing_preset,  // Support both field names
          routingPreset: event.routingPreset || event.routing_preset,
          notes: event.notes,
          subtitles: event.subtitles,
          sport: event.sport,
          league: event.league,
          stage: event.stage,
          homeTeam: event.homeTeam,
          awayTeam: event.awayTeam,
          production_crew: event.production_crew || [],
          equipment_list: event.equipment_list || [],
          file_path: event.file_path,
          reception_start_time: event.reception_start_time?.toISOString(),
          gmt_start_time: event.gmt_start_time?.toISOString(),
          gmt_end_time: event.gmt_end_time?.toISOString(),
          metadata: event.metadata,
          projectCode: event.projectCode,
          episodeNumber: event.episodeNumber,
          season: event.season,
          isLive: event.isLive,
          isRerun: event.isRerun,
          departmentData: event.departmentData,
          createdBy: event.createdBy,
          createdAt: event.createdAt?.toISOString(),
          updatedAt: event.updatedAt?.toISOString()
          };
        });
        
        console.log('✅ Returning mapped results:', mappedResults.length, 'events');
        return mappedResults;
      } catch (error) {
        console.error('❌ Error fetching broadcast events:', error);
        // Return empty array instead of throwing error to prevent GraphQL null field errors
        return [];
      }
    },

    broadcastEvent: async (_: any, { id }: { id: string }, context: any) => {
      try {
        const user = requirePermission(context, Permission.BROADCAST_VIEW);
        await ensureMongoConnection();

        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new Error('Invalid broadcast event ID');
        }

        const eventDoc = await BroadcastEvent.findById(id).exec();

        if (!eventDoc) {
          return null;
        }

        const eventDept = (eventDoc as any).departmentId;
        if (
          eventDept &&
          user.systemRole !== 'SYSTEM_ADMIN' &&
          user.systemRole !== 'IT_ADMIN' &&
          !user.hasForDept(Permission.BROADCAST_VIEW, eventDept)
        ) {
          throw new Error('You do not have access to this broadcast event');
        }
        
        const event: any = eventDoc.toObject ? eventDoc.toObject() : eventDoc;
        
        return {
          id: event.id,
          eventNumber: event.eventNumber,
          title: event.title,
          hebrewTitle: event.hebrewTitle,
          description: event.description,
          eventType: event.eventType,
          type: event.type || 'live',
          status: mapStatusToEnum(event.status),
          startTime: event.startTime?.toISOString(),
          endTime: event.endTime?.toISOString(),
          koTime: event.koTime?.toISOString(),
          arrivalTime: event.arrivalTime?.toISOString(),
          actualStartTime: event.actualStartTime?.toISOString(),
          actualEndTime: event.actualEndTime?.toISOString(),
          location: event.location,
          venue: event.venue,
          liveLocation: event.liveLocation,
          synopsis: event.synopsis,
          synopsis_file: event.synopsisFile || event.synopsis_file,  // Support both field names
          synopsisFile: event.synopsisFile || event.synopsis_file,
          channel: event.channel || '',
          parallelChannel: event.parallelChannel,
          channel1_4k: event.channel1_4k,
          live: event.live,
          backup: event.backup,
          requiresSignLanguage: event.requiresSignLanguage,
          requiresSubtitles: event.requiresSubtitles,
          accessibilityStatus: event.accessibilityStatus,
          contentDuration: event.contentDuration,
          contentType: event.contentType,
          contentSource: event.contentSource,
          source: event.source,
          destination: event.destination,
          satellite: event.satellite,
          technicalDirectorId: event.technicalDirectorId,
          controlOperatorId: event.controlOperatorId,
          priority: event.priority,
          routingConfig: event.routingConfig,
          routing_preset: event.routingPreset || event.routing_preset,  // Support both field names
          routingPreset: event.routingPreset || event.routing_preset,
          notes: event.notes,
          subtitles: event.subtitles,
          sport: event.sport,
          league: event.league,
          stage: event.stage,
          homeTeam: event.homeTeam,
          awayTeam: event.awayTeam,
          production_crew: event.production_crew || [],
          equipment_list: event.equipment_list || [],
          file_path: event.file_path,
          reception_start_time: event.reception_start_time?.toISOString(),
          gmt_start_time: event.gmt_start_time?.toISOString(),
          gmt_end_time: event.gmt_end_time?.toISOString(),
          metadata: event.metadata,
          projectCode: event.projectCode,
          episodeNumber: event.episodeNumber,
          season: event.season,
          isLive: event.isLive,
          isRerun: event.isRerun,
          departmentData: event.departmentData,
          createdBy: event.createdBy,
          createdAt: event.createdAt?.toISOString(),
          updatedAt: event.updatedAt?.toISOString()
        };
      } catch (error) {
        console.error('Error fetching broadcast event:', error);
        throw new Error('Failed to fetch broadcast event');
      }
    },

    // Equipment Assignment Queries
    equipmentAssignmentsByEvent: async (_: any, { broadcastEventId }: { broadcastEventId: string }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_VIEW);
        await ensureMongoConnection();
        if (!mongoose.Types.ObjectId.isValid(broadcastEventId)) {
          return [];
        }
        const assignments = await EquipmentAssignment.find({
          eventId: new mongoose.Types.ObjectId(broadcastEventId),
          status: 'active'
        }).sort({ assignedAt: -1 }).limit(500).exec();
        
        return assignments.map(a => ({
          id: a._id.toString(),
          equipmentId: a.equipmentId.toString(),
          eventName: a.eventName,
          eventId: a.eventId.toString(),
          startDate: a.startDate.toISOString(),
          endDate: a.endDate.toISOString(),
          location: a.location || null,
          status: a.status,
          quantityAssigned: a.quantityAssigned,
          assignmentStatus: a.status,
          assignedAt: a.assignedAt?.toISOString() || null,
          scheduledPickupAt: null,
          scheduledReturnAt: null,
          actualPickupAt: null,
          actualReturnAt: a.returnedAt?.toISOString() || null,
          assignmentNotes: a.notes || null,
          returnNotes: null,
          assignedToName: a.assignedByName || null,
          assignedBy: a.assignedBy || null,
          assignedByUser: null,
          collectedByUser: null,
          returnedByUser: null,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString()
        }));
      } catch (error) {
        console.error('Error fetching equipment assignments by event:', error);
        return [];
      }
    },

    // Equipment Assignments by Equipment ID (for equipment details modal)
    equipmentAssignments: async (_: any, { equipmentId, limit }: { equipmentId: string; limit?: number }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_VIEW);
        await ensureMongoConnection();
        const cappedLimit = Math.min(Math.max(limit ?? 200, 1), 500);
        
        console.log('🔍 Fetching equipment assignments for equipmentId:', equipmentId);
        
        // Convert string ID to ObjectId for query
        let equipmentObjectId;
        try {
          equipmentObjectId = new mongoose.Types.ObjectId(equipmentId);
        } catch (error) {
          console.error('Invalid equipment ID format:', equipmentId);
          return [];
        }
        
        // Find all active assignments for this equipment
        const assignments = await EquipmentAssignment.find({
          equipmentId: equipmentObjectId,
          status: 'active'
        }).sort({ startDate: -1 }).limit(cappedLimit).exec();

        console.log(`📊 Found ${assignments.length} active assignments`);
        
        // Map to GraphQL format
        return assignments.map(a => ({
          id: a._id.toString(),
          equipmentId: a.equipmentId.toString(),
          eventName: a.eventName,
          eventId: a.eventId.toString(),
          startDate: a.startDate.toISOString(),
          endDate: a.endDate.toISOString(),
          location: a.location || null,
          status: a.status,
          quantityAssigned: a.quantityAssigned,
          assignmentStatus: a.status,
          assignedAt: a.assignedAt?.toISOString() || null,
          scheduledPickupAt: null,
          scheduledReturnAt: null,
          actualPickupAt: null,
          actualReturnAt: a.returnedAt?.toISOString() || null,
          assignmentNotes: a.notes || null,
          returnNotes: null,
          assignedToName: a.assignedByName || null,
          assignedBy: a.assignedBy || null,
          assignedByUser: null,
          collectedByUser: null,
          returnedByUser: null,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString()
        }));
      } catch (error) {
        console.error('Error fetching equipment assignments:', error);
        return [];
      }
    },

    // Returns every BroadcastEvent that currently has at least one piece of
    // equipment "out". Combines two sources of truth so we never lose an event:
    //   1. The `equipment_assignments` collection (records created when the
    //      warehouse modal scans equipment to an event).
    //   2. The event's embedded metadata (warehouse.assignedItems, the legacy
    //      warehouseData path, and equipment_list).
    // External Broadcasts' equipmentList is intentionally excluded — those are
    // department REQUESTS, not warehouse assignments, and surfacing them here
    // would let the return modal claim un-scanned gear is checked out.
    // No date filter — if the assignment is still active, the event appears
    // even if it ran months ago.
    eventsWithAssignedEquipment: async (_: any, args: { limit?: number } = {}, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_VIEW);
        await ensureMongoConnection();
        const cappedLimit = Math.min(Math.max(args.limit ?? 200, 1), 500);

        const eventIdSet = new Set<string>();

        // 1) Source-of-truth: active EquipmentAssignment records.
        const activeAssignments = await EquipmentAssignment.find({ status: 'active' })
          .select('eventId')
          .lean()
          .exec();
        for (const a of activeAssignments) {
          if (a.eventId) eventIdSet.add(a.eventId.toString());
        }

        // 2) Metadata fallback: scan all events for any embedded assignment
        // records (covers PDF imports and legacy data that didn't create
        // EquipmentAssignment rows).
        // NOTE: externalBroadcasts.equipmentList holds REQUESTED items from the
        // External Broadcasts department, not actual assignments. Including it
        // here would surface events with only open requests (nothing checked
        // out of the warehouse) in the equipment-return flow.
        const metadataMatches = await BroadcastEvent.find({
          $or: [
            { 'metadata.departments.warehouse.assignedItems.0': { $exists: true } },
            { 'metadata.departments.warehouse.customData.assignedItems.0': { $exists: true } },
            { 'metadata.warehouseData.assignedItems.0': { $exists: true } },
            { 'metadata.warehouseData.customData.assignedItems.0': { $exists: true } },
            { 'equipment_list.0': { $exists: true } }
          ]
        })
          .select('_id')
          .lean()
          .exec();
        for (const e of metadataMatches) {
          eventIdSet.add(e._id.toString());
        }

        if (eventIdSet.size === 0) return [];

        // Fetch full event documents (sorted newest first).
        const objectIds = Array.from(eventIdSet)
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id));

        const events = await BroadcastEvent.find({ _id: { $in: objectIds } })
          .sort({ startTime: -1 })
          .limit(cappedLimit)
          .exec();

        const now = new Date();
        return events.map((eventDoc: any) => {
          const event: any = eventDoc.toObject ? eventDoc.toObject() : eventDoc;
          // `id` virtual is stripped by toObject() unless schema opts in, so
          // fall back to the raw _id; same pattern protects required date fields.
          const id = (event.id && String(event.id)) || eventDoc._id?.toString() || event._id?.toString();
          const startTime = event.startTime || now;
          const endTime = event.endTime || event.startTime || now;
          return {
            id,
            eventNumber: event.eventNumber,
            title: event.title || '',
            hebrewTitle: event.hebrewTitle,
            description: event.description,
            eventType: event.eventType || 'live_show',
            type: event.type || 'live',
            status: mapStatusToEnum(event.status),
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            koTime: event.koTime?.toISOString(),
            arrivalTime: event.arrivalTime?.toISOString(),
            actualStartTime: event.actualStartTime?.toISOString(),
            actualEndTime: event.actualEndTime?.toISOString(),
            location: event.location,
            venue: event.venue,
            liveLocation: event.liveLocation,
            channel: event.channel || '',
            production_crew: event.production_crew || [],
            equipment_list: event.equipment_list || [],
            metadata: event.metadata,
            createdAt: (event.createdAt || now).toISOString
              ? (event.createdAt || now).toISOString()
              : new Date(event.createdAt || now).toISOString(),
            updatedAt: (event.updatedAt || now).toISOString
              ? (event.updatedAt || now).toISOString()
              : new Date(event.updatedAt || now).toISOString()
          };
        }).filter((e: any) => e.id);
      } catch (error) {
        console.error('❌ Error fetching events with assigned equipment:', error);
        return [];
      }
    },

    // Equipment History by Equipment ID (for equipment details modal)
    equipmentHistory: async (_: any, { equipmentId, limit }: { equipmentId: string; limit?: number }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_VIEW);
        await ensureMongoConnection();
        const cappedLimit = Math.min(Math.max(limit ?? 200, 1), 500);
        
        console.log('🔍 Fetching equipment history for equipmentId:', equipmentId);
        
        // Convert string ID to ObjectId for query
        let equipmentObjectId;
        try {
          equipmentObjectId = new mongoose.Types.ObjectId(equipmentId);
        } catch (error) {
          console.error('Invalid equipment ID format:', equipmentId);
          return [];
        }
        
        // Find all history records for this equipment
        const history = await EquipmentHistory.find({
          equipmentId: equipmentObjectId
        }).sort({ date: -1 }).limit(cappedLimit).exec();
        
        console.log(`📊 Found ${history.length} history records`);
        
        // Map to GraphQL format
        return history.map(record => ({
          id: record._id.toString(),
          equipmentId: record.equipmentId.toString(),
          eventId: record.eventId?.toString() || '',
          eventName: record.eventName || '',
          action: record.action,
          quantity: record.quantity || 1,
          date: record.date.toISOString(),
          performedBy: record.performedByName || record.performedBy || null,
          performedByUser: null,
          notes: record.notes || null,
          previousValue: record.previousValue || null,
          newValue: record.newValue || null,
          transferDetails: record.transferDetails ? {
            sourceEventId: record.transferDetails.sourceEventId?.toString() || '',
            sourceEventName: record.transferDetails.sourceEventName || '',
            targetEventId: record.transferDetails.targetEventId?.toString() || '',
            targetEventName: record.transferDetails.targetEventName || '',
            transferredQuantity: record.transferDetails.transferredQuantity || 0,
            canUndo: false
          } : null
        }));
      } catch (error) {
        console.error('Error fetching equipment history:', error);
        return [];
      }
    },

    // External Broadcast Presets
    externalBroadcastPresets: async (_: any, __: any, context: any) => {
      try {
        requireAuth(context);
        await ensureMongoConnection();
        const presets = await ExternalBroadcastPreset.find().sort({ name: 1 }).limit(500).exec();
        return presets.map((doc: any) => ({
          id: doc._id.toString(),
          ...doc.toObject(),
        }));
      } catch (error) {
        console.error('Error fetching external broadcast presets:', error);
        return [];
      }
    },

    externalBroadcastPreset: async (_: any, { id }: { id: string }, context: any) => {
      try {
        requireAuth(context);
        await ensureMongoConnection();
        const doc = await ExternalBroadcastPreset.findById(id).exec();
        if (!doc) return null;
        return { id: doc._id.toString(), ...doc.toObject() };
      } catch (error) {
        console.error('Error fetching external broadcast preset:', error);
        return null;
      }
    },
  },

  Mutation: {
    createBroadcastEvent: async (_: any, { input }: { input: BroadcastEventInput }, context: any) => {
      try {
        requirePermission(context, Permission.BROADCAST_MANAGE);
        await ensureMongoConnection();

        // Pre-flight validation: blocks obvious invalid states (overlapping
        // routing, inverted time range, etc.) before we hit the database.
        const preflight = await preflightBroadcastEvent({
          title: input.title,
          startTime: input.startTime,
          endTime: input.endTime || input.startTime,
          channel: (input as any).channel,
          routingPreset: (input as any).routingPreset,
          status: 'planned',
          departmentId: (input as any).departmentId,
        });
        if (!preflight.ok) {
          throw new Error(`Validation failed: ${preflight.errors.join('; ')}`);
        }

        const event = new BroadcastEvent({
          title: input.title,
          description: input.description,
          eventType: input.eventType,
          status: 'planned',
          startTime: new Date(input.startTime),
          endTime: input.endTime ? new Date(input.endTime) : undefined,
          source: input.source,
          destination: input.destination,
          satellite: input.satellite,
          technicalDirectorId: input.technicalDirectorId,
          controlOperatorId: input.controlOperatorId,
          priority: input.priority || 'normal',
          metadata: input.metadata || {}
        });

        const savedEvent = await event.save();

        // Mirror the broadcast event into the MCR workspace so operators
        // see it the moment production schedules it. Failures here are
        // logged but never block the production mutation.
        await ensureShadowMcrEventForBroadcast(savedEvent, context?.user?.userId);

        return {
          id: savedEvent.id,
          title: savedEvent.title,
          description: savedEvent.description,
          eventType: savedEvent.eventType,
          status: mapStatusToEnum(savedEvent.status),
          startTime: savedEvent.startTime?.toISOString(),
          endTime: savedEvent.endTime?.toISOString(),
          source: savedEvent.source,
          destination: savedEvent.destination,
          satellite: savedEvent.satellite,
          technicalDirectorId: savedEvent.technicalDirectorId,
          controlOperatorId: savedEvent.controlOperatorId,
          priority: savedEvent.priority,
          metadata: savedEvent.metadata,
          createdAt: savedEvent.createdAt?.toISOString(),
          updatedAt: savedEvent.updatedAt?.toISOString()
        };
      } catch (error) {
        console.error('Error creating broadcast event:', error);
        throw new Error('Failed to create broadcast event');
      }
    },

    updateBroadcastEvent: async (_: any, { id, input }: { id: string; input: Partial<BroadcastEventInput> }, context: any) => {
      try {
        requirePermission(context, Permission.BROADCAST_MANAGE);
        await ensureMongoConnection();

        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new Error('Invalid broadcast event ID');
        }

        const updateData: any = {};

        if (input.title !== undefined) updateData.title = input.title;
        if (input.description !== undefined) updateData.description = input.description;
        if (input.eventType !== undefined) updateData.eventType = input.eventType;
        if (input.startTime !== undefined) updateData.startTime = new Date(input.startTime);
        if (input.endTime !== undefined) updateData.endTime = new Date(input.endTime);
        if (input.source !== undefined) updateData.source = input.source;
        if (input.destination !== undefined) updateData.destination = input.destination;
        if (input.satellite !== undefined) updateData.satellite = input.satellite;
        if (input.technicalDirectorId !== undefined) updateData.technicalDirectorId = input.technicalDirectorId;
        if (input.controlOperatorId !== undefined) updateData.controlOperatorId = input.controlOperatorId;
        if (input.priority !== undefined) updateData.priority = input.priority;
        if (input.metadata !== undefined) updateData.metadata = input.metadata;

        // Pre-flight validation against the merged record. We need the
        // existing event to compare effective start/end times and to check
        // status transitions.
        const existing = await BroadcastEvent.findById(id).lean();
        if (!existing) {
          throw new Error('Broadcast event not found');
        }
        const effectiveStart = updateData.startTime || existing.startTime;
        const effectiveEnd = updateData.endTime || existing.endTime;
        const preflight = await preflightBroadcastEvent({
          eventId: id,
          excludeEventId: id,
          title: updateData.title || existing.title,
          startTime: effectiveStart,
          endTime: effectiveEnd,
          channel: (updateData as any).channel ?? existing.channel,
          routingPreset: (updateData as any).routingPreset ?? existing.routingPreset,
          status: existing.status,
          departmentId: (updateData as any).departmentId ?? existing.departmentId,
        });
        if (!preflight.ok) {
          throw new Error(`Validation failed: ${preflight.errors.join('; ')}`);
        }

        // Status transitions are validated separately so the operator gets a
        // clear error rather than a generic "validation failed".
        if ((input as any).status && (input as any).status !== existing.status) {
          const transitionErrors = validateStatusTransition(existing.status, (input as any).status);
          if (transitionErrors.length > 0) {
            throw new Error(transitionErrors.join('; '));
          }
        }

        const updatedEvent = await BroadcastEvent.findByIdAndUpdate(
          id,
          updateData,
          { new: true, runValidators: true }
        ).exec();
        
        if (!updatedEvent) {
          throw new Error('Broadcast event not found');
        }

        // Keep the shadow MCR event's title/start/end in sync, but never
        // overwrite MCR-only operational fields (mcrStartTime, feeds, etc.).
        await syncShadowMcrEventFromBroadcast(updatedEvent);

        return {
          id: updatedEvent.id,
          title: updatedEvent.title,
          description: updatedEvent.description,
          eventType: updatedEvent.eventType,
          status: mapStatusToEnum(updatedEvent.status),
          startTime: updatedEvent.startTime?.toISOString(),
          endTime: updatedEvent.endTime?.toISOString(),
          source: updatedEvent.source,
          destination: updatedEvent.destination,
          satellite: updatedEvent.satellite,
          technicalDirectorId: updatedEvent.technicalDirectorId,
          controlOperatorId: updatedEvent.controlOperatorId,
          priority: updatedEvent.priority,
          metadata: updatedEvent.metadata,
          updatedAt: updatedEvent.updatedAt?.toISOString()
        };
      } catch (error) {
        console.error('Error updating broadcast event:', error);
        throw new Error('Failed to update broadcast event');
      }
    },

    updateBroadcastEventDepartmentData: async (_: any, { eventId, department, data }: { eventId: string; department: string; data: any }, context: any) => {
      try {
        requirePermission(context, Permission.BROADCAST_MANAGE);
        await ensureMongoConnection();
        console.log('🔧 Updating broadcast event department data:', { eventId, department, data });

        if (!mongoose.Types.ObjectId.isValid(eventId)) {
          throw new Error('Invalid broadcast event ID');
        }

        const event = await BroadcastEvent.findById(eventId).exec();

        if (!event) {
          throw new Error('Broadcast event not found');
        }

        // Parse current metadata or initialize empty object
        let metadata: any = event.metadata || {};

        // Ensure departments object exists
        if (!metadata.departments) {
          metadata.departments = {};
        }

        // Handle the new input structure where data contains department-specific fields
        // The UI sends data like: { broadcastArray: {...}, customData: {...} }
        // We need to extract the department-specific data
        let departmentData: any = {};
        
        if (data.broadcastArray) {
          departmentData = { ...data.broadcastArray, ...data.customData };
        } else if (data.mcr) {
          departmentData = { ...data.mcr, ...data.customData };
        } else if (data.externalBroadcasts) {
          departmentData = { ...data.externalBroadcasts, ...data.customData };
        } else if (data.closedCaptions) {
          departmentData = { ...data.closedCaptions, ...data.customData };
        } else if (data.warehouse) {
          departmentData = { ...data.warehouse, ...data.customData };
          
          // Sync equipment status when warehouse assigns equipment
          if (data.warehouse.assignedItems && Array.isArray(data.warehouse.assignedItems)) {
            console.log('🔄 Syncing equipment status for warehouse assignment...');
            
            // Get previously assigned items
            const previousAssignedItems = metadata.departments.warehouse?.assignedItems || [];
            const previousEquipmentIds = previousAssignedItems.map((item: any) => item.equipmentId);
            const newEquipmentIds = data.warehouse.assignedItems.map((item: any) => item.equipmentId);
            
            // Find newly assigned equipment (in new list but not in previous)
            const newlyAssigned = newEquipmentIds.filter((id: string) => !previousEquipmentIds.includes(id));
            
            // Find unassigned equipment (in previous list but not in new)
            const unassigned = previousEquipmentIds.filter((id: string) => !newEquipmentIds.includes(id));
            
                      // Update status for newly assigned equipment
          for (const equipmentId of newlyAssigned) {
            const equipment = await Equipment.findById(equipmentId).exec();
            if (equipment) {
              console.log(`📦 Assigning equipment: ${equipment.name} (${equipment.barcode})`);
              
              // Update quantities
              if (equipment.quantityAvailable > 0) {
                equipment.quantityAvailable -= 1;
                equipment.quantityAssigned += 1;
                
                // Update status if no more available
                if (equipment.quantityAvailable === 0) {
                  equipment.status = 'assigned';
                }
                
                await equipment.save();
                console.log(`   Updated: Available=${equipment.quantityAvailable}, Assigned=${equipment.quantityAssigned}, Status=${equipment.status}`);
                
                // Find the assigned item details
                const assignedItem = data.warehouse.assignedItems.find((item: any) => item.equipmentId === equipmentId);
                
                // Create equipment assignment record
                const assignment = new EquipmentAssignment({
                  equipmentId: equipment._id,
                  eventId: event._id,
                  eventName: event.title,
                  startDate: event.startTime,
                  endDate: event.endTime,
                  location: event.location || event.venue,
                  status: 'active',
                  quantityAssigned: assignedItem?.quantity || 1,
                  assignedBy: data.customData?.updatedBy || 'system',
                  assignedByName: data.customData?.updatedByName || 'System',
                  notes: assignedItem?.notes
                });
                await assignment.save();
                
                // Create history record
                const historyRecord = new EquipmentHistory({
                  equipmentId: equipment._id,
                  eventId: event._id,
                  eventName: event.title,
                  date: new Date(),
                  action: 'assigned',
                  quantity: assignedItem?.quantity || 1,
                  performedBy: data.customData?.updatedBy || 'system',
                  performedByName: data.customData?.updatedByName || 'System',
                  notes: assignedItem?.notes
                });
                await historyRecord.save();
              } else {
                console.warn(`⚠️ Equipment ${equipment.name} has no available quantity`);
              }
            }
          }
            
                      // Update status for unassigned equipment
          for (const equipmentId of unassigned) {
            const equipment = await Equipment.findById(equipmentId).exec();
            if (equipment) {
              console.log(`📦 Unassigning equipment: ${equipment.name} (${equipment.barcode})`);
              
              // Update quantities
              if (equipment.quantityAssigned > 0) {
                equipment.quantityAssigned -= 1;
                equipment.quantityAvailable += 1;
                
                // Update status if all returned
                if (equipment.quantityAssigned === 0) {
                  equipment.status = 'available';
                }
                
                await equipment.save();
                console.log(`   Updated: Available=${equipment.quantityAvailable}, Assigned=${equipment.quantityAssigned}, Status=${equipment.status}`);
                
                // Find and update the assignment record
                const assignment = await EquipmentAssignment.findOne({
                  equipmentId: equipment._id,
                  eventId: event._id,
                  status: 'active'
                }).exec();
                
                if (assignment) {
                  assignment.status = 'completed';
                  assignment.returnedAt = new Date();
                  assignment.returnedBy = data.customData?.updatedBy || 'system';
                  assignment.returnedByName = data.customData?.updatedByName || 'System';
                  await assignment.save();
                }
                
                // Create history record for return
                const historyRecord = new EquipmentHistory({
                  equipmentId: equipment._id,
                  eventId: event._id,
                  eventName: event.title,
                  date: new Date(),
                  action: 'returned',
                  quantity: 1,
                  performedBy: data.customData?.updatedBy || 'system',
                  performedByName: data.customData?.updatedByName || 'System',
                  notes: 'Equipment returned from event'
                });
                await historyRecord.save();
              }
            }
          }
          }
        } else if (data.rundown) {
          departmentData = { ...data.rundown, ...data.customData };
        } else if (data.data) {
          // Fallback to the old structure
          departmentData = data.data;
        } else {
          // If none of the above, use the entire data object
          departmentData = data;
        }

        // Update the specific department data
        metadata.departments[department] = departmentData;

        // Update the broadcast event with new metadata
        const updatedEvent = await BroadcastEvent.findByIdAndUpdate(
          eventId,
          { metadata },
          { new: true, runValidators: true }
        ).exec();

        if (!updatedEvent) {
          throw new Error('Failed to update broadcast event');
        }

        // After any warehouse department update, refresh the shared
        // engineering snapshot so MCR's view of flagged equipment stays
        // consistent with the active assignments we just wrote.
        if (department === 'warehouse') {
          await syncSharedEngineeringSnapshotForEvent(eventId).catch((err) =>
            console.error('Shared engineering snapshot sync (department data) failed', err),
          );
        }

        console.log('✅ Successfully updated broadcast event department data');
        return {
          id: updatedEvent.id,
          title: updatedEvent.title,
          metadata: updatedEvent.metadata
        };
      } catch (error) {
        console.error('❌ Error updating broadcast event department data:', error);
        throw new Error('Failed to update broadcast event department data');
      }
    },

    deleteBroadcastEvent: async (_: any, { id }: { id: string }, context: any) => {
      try {
        requirePermission(context, Permission.BROADCAST_DELETE);
        await ensureMongoConnection();

        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new Error('Invalid broadcast event ID');
        }

        const result = await BroadcastEvent.findByIdAndDelete(id).exec();

        if (result) {
          // Soft-detach the shadow MCR event so MCR keeps any preparation
          // work they've already done.
          await detachShadowMcrEventOnBroadcastDelete(id);
        }

        return result !== null;
      } catch (error) {
        console.error('Error deleting broadcast event:', error);
        throw new Error('Failed to delete broadcast event');
      }
    },

    // Equipment mutations
    createEquipment: async (_: any, { input }: { input: any }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_MANAGE);
        await ensureMongoConnection();
        console.log('🆕 Creating equipment:', input);

        // Generate a unique barcode if not provided
        const barcode = input.barcode || await generateBarcode(input.category);

        // Resolve warehouse + storage place references. We accept either
        // the structured warehouseId/storagePlaceId pair (preferred) or
        // the legacy free-text storage strings (kept for backward
        // compatibility with imports and older clients).
        const warehouseId =
          input.warehouseId && mongoose.Types.ObjectId.isValid(input.warehouseId)
            ? new mongoose.Types.ObjectId(input.warehouseId)
            : null;
        const storagePlaceId =
          input.storagePlaceId && mongoose.Types.ObjectId.isValid(input.storagePlaceId)
            ? new mongoose.Types.ObjectId(input.storagePlaceId)
            : null;

        let currentLocation: string | null = null;
        if (warehouseId) {
          currentLocation = await buildLocationStringFromWarehouse(
            warehouseId.toString(),
            storagePlaceId?.toString(),
          );
        } else if (input.storage) {
          currentLocation = `Row ${input.storage.row}, Shelf ${input.storage.shelf}, Cell ${input.storage.cell}`;
        }

        // Create new equipment with all fields
        const equipment = new Equipment({
          name: input.name,
          category: input.category,
          barcode,
          status: 'available',
          condition: 'good',
          quantityTotal: input.quantityTotal || 1,
          quantityAvailable: input.quantityTotal || 1,
          quantityAssigned: 0,
          price: input.price,
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
          warrantyExpiryDate: input.warrantyExpiryDate ? new Date(input.warrantyExpiryDate) : undefined,
          company: input.company,
          equipmentModel: input.equipmentModel,
          contactPerson: input.contactPerson,
          manualLink: input.manualLink,
          imageUrl: input.imageUrl,
          storage: input.storage,
          warehouseId,
          storagePlaceId,
          currentLocation,
          isQuantityBased: input.isQuantityBased ?? QUANTITY_BASED_DEFAULT_CATEGORIES.has(input.category),
          isSharedEngineeringEquipment: input.isSharedEngineeringEquipment ?? false,
          lastUsedAt: new Date()
        });

        const savedEquipment = await equipment.save();
        console.log('✅ Successfully created equipment:', savedEquipment.id);

        const warehouseCache = await loadWarehousesForEquipment([savedEquipment]);

        // Map to GraphQL format
        return {
          id: savedEquipment._id.toString(),
          name: savedEquipment.name,
          category: savedEquipment.category,
          brand: savedEquipment.company || null,
          barcode: savedEquipment.barcode,
          status: savedEquipment.status,
          condition: savedEquipment.condition || null,
          quantityTotal: savedEquipment.quantityTotal,
          quantityAvailable: savedEquipment.quantityAvailable,
          quantityAssigned: savedEquipment.quantityAssigned,
          currentLocation: savedEquipment.currentLocation || null,
          price: savedEquipment.price || null,
          purchaseDate: savedEquipment.purchaseDate?.toISOString() || null,
          warrantyExpiryDate: savedEquipment.warrantyExpiryDate?.toISOString() || null,
          company: savedEquipment.company || null,
          equipmentModel: savedEquipment.equipmentModel || null,
          contactPerson: savedEquipment.contactPerson || null,
          manualLink: savedEquipment.manualLink || null,
          imageUrl: savedEquipment.imageUrl || null,
          storage: savedEquipment.storage || null,
          ...buildEquipmentLocationFields(savedEquipment, warehouseCache),
          isQuantityBased: savedEquipment.isQuantityBased || false,
          isSharedEngineeringEquipment: savedEquipment.isSharedEngineeringEquipment || false,
          isDisabled: savedEquipment.isDisabled || false,
          disabledAt: savedEquipment.disabledAt?.toISOString() || null,
          disabledReason: savedEquipment.disabledReason || null,
          suspensionStatus: savedEquipment.suspensionStatus || null,
          lastUsedAt: savedEquipment.lastUsedAt?.toISOString() || null,
          createdAt: savedEquipment.createdAt.toISOString(),
          updatedAt: savedEquipment.updatedAt.toISOString()
        };
      } catch (error) {
        console.error('❌ Error creating equipment:', error);
        throw new Error(`Failed to create equipment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    updateEquipment: async (_: any, { id, input }: { id: string; input: any }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_MANAGE);
        await ensureMongoConnection();
        console.log('🔄 Updating equipment:', id, input);

        // Build update object
        const updateData: any = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.category !== undefined) updateData.category = input.category;
        if (input.status !== undefined) updateData.status = input.status;
        if (input.condition !== undefined) updateData.condition = input.condition;
        if (input.quantityTotal !== undefined) updateData.quantityTotal = input.quantityTotal;
        if (input.currentLocation !== undefined) updateData.currentLocation = input.currentLocation;
        if (input.price !== undefined) updateData.price = input.price;
        if (input.purchaseDate !== undefined) updateData.purchaseDate = input.purchaseDate ? new Date(input.purchaseDate) : null;
        if (input.warrantyExpiryDate !== undefined) updateData.warrantyExpiryDate = input.warrantyExpiryDate ? new Date(input.warrantyExpiryDate) : null;
        if (input.company !== undefined) updateData.company = input.company;
        if (input.equipmentModel !== undefined) updateData.equipmentModel = input.equipmentModel;
        if (input.contactPerson !== undefined) updateData.contactPerson = input.contactPerson;
        if (input.manualLink !== undefined) updateData.manualLink = input.manualLink;
        if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;
        if (input.storage !== undefined) {
          updateData.storage = input.storage;
          if (input.storage && !input.warehouseId) {
            updateData.currentLocation = `Row ${input.storage.row}, Shelf ${input.storage.shelf}, Cell ${input.storage.cell}`;
          }
        }

        // Structured warehouse/place updates. Treat `null` as an explicit
        // clear (e.g. when the user picks "no warehouse"). When a
        // warehouse is set we also refresh `currentLocation` so the
        // legacy free-text view stays useful.
        if (input.warehouseId !== undefined) {
          if (input.warehouseId === null) {
            updateData.warehouseId = null;
            updateData.storagePlaceId = null;
            if (input.currentLocation === undefined) {
              updateData.currentLocation = null;
            }
          } else if (mongoose.Types.ObjectId.isValid(input.warehouseId)) {
            updateData.warehouseId = new mongoose.Types.ObjectId(input.warehouseId);
            // If a storage place wasn't supplied alongside the warehouse,
            // clear the previous one so we don't keep dangling references
            // to places that belong to a different warehouse.
            if (input.storagePlaceId === undefined) {
              updateData.storagePlaceId = null;
            }
          }
        }
        if (input.storagePlaceId !== undefined) {
          if (input.storagePlaceId === null) {
            updateData.storagePlaceId = null;
          } else if (mongoose.Types.ObjectId.isValid(input.storagePlaceId)) {
            updateData.storagePlaceId = new mongoose.Types.ObjectId(input.storagePlaceId);
          }
        }

        // Recompute currentLocation from the (possibly updated) warehouse
        // selection so the legacy text field stays in sync with the
        // structured reference.
        if (
          (input.warehouseId !== undefined || input.storagePlaceId !== undefined) &&
          input.currentLocation === undefined
        ) {
          const nextWarehouseId =
            updateData.warehouseId === undefined
              ? undefined
              : updateData.warehouseId
                ? updateData.warehouseId.toString()
                : null;
          const nextStoragePlaceId =
            updateData.storagePlaceId === undefined
              ? undefined
              : updateData.storagePlaceId
                ? updateData.storagePlaceId.toString()
                : null;
          if (nextWarehouseId) {
            updateData.currentLocation = await buildLocationStringFromWarehouse(
              nextWarehouseId,
              nextStoragePlaceId ?? null,
            );
          } else if (nextWarehouseId === null) {
            updateData.currentLocation = null;
          }
        }

        if (input.isDisabled !== undefined) updateData.isDisabled = input.isDisabled;
        if (input.disabledReason !== undefined) updateData.disabledReason = input.disabledReason;
        if (input.suspensionStatus !== undefined) updateData.suspensionStatus = input.suspensionStatus;
        if (input.isQuantityBased !== undefined) updateData.isQuantityBased = input.isQuantityBased;
        if (input.isSharedEngineeringEquipment !== undefined) {
          updateData.isSharedEngineeringEquipment = !!input.isSharedEngineeringEquipment;
        }

        // Update equipment
        const updatedEquipment = await Equipment.findByIdAndUpdate(
          id,
          { $set: updateData },
          { new: true, runValidators: true }
        );

        if (!updatedEquipment) {
          throw new Error(`Equipment with ID ${id} not found`);
        }

        console.log('✅ Successfully updated equipment:', id);

        const warehouseCache = await loadWarehousesForEquipment([updatedEquipment]);

        // Map to GraphQL format
        return {
          id: updatedEquipment._id.toString(),
          name: updatedEquipment.name,
          category: updatedEquipment.category,
          brand: updatedEquipment.company || null,
          barcode: updatedEquipment.barcode,
          status: updatedEquipment.status,
          condition: updatedEquipment.condition || null,
          quantityTotal: updatedEquipment.quantityTotal,
          quantityAvailable: updatedEquipment.quantityAvailable,
          quantityAssigned: updatedEquipment.quantityAssigned,
          currentLocation: updatedEquipment.currentLocation || null,
          price: updatedEquipment.price || null,
          purchaseDate: updatedEquipment.purchaseDate?.toISOString() || null,
          warrantyExpiryDate: updatedEquipment.warrantyExpiryDate?.toISOString() || null,
          company: updatedEquipment.company || null,
          equipmentModel: updatedEquipment.equipmentModel || null,
          contactPerson: updatedEquipment.contactPerson || null,
          manualLink: updatedEquipment.manualLink || null,
          imageUrl: updatedEquipment.imageUrl || null,
          storage: updatedEquipment.storage || null,
          ...buildEquipmentLocationFields(updatedEquipment, warehouseCache),
          isQuantityBased: updatedEquipment.isQuantityBased || false,
          isSharedEngineeringEquipment: updatedEquipment.isSharedEngineeringEquipment || false,
          isDisabled: updatedEquipment.isDisabled || false,
          disabledAt: updatedEquipment.disabledAt?.toISOString() || null,
          disabledReason: updatedEquipment.disabledReason || null,
          suspensionStatus: updatedEquipment.suspensionStatus || null,
          lastUsedAt: updatedEquipment.lastUsedAt?.toISOString() || null,
          createdAt: updatedEquipment.createdAt.toISOString(),
          updatedAt: updatedEquipment.updatedAt.toISOString()
        };
      } catch (error) {
        console.error('❌ Error updating equipment:', error);
        throw new Error(`Failed to update equipment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    deleteEquipment: async (_: any, { id }: { id: string }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_MANAGE);
        await ensureMongoConnection();
        console.log('🗑️ Deleting equipment:', id);
        
        const deletedEquipment = await Equipment.findByIdAndDelete(id);
        
        if (!deletedEquipment) {
          throw new Error(`Equipment with ID ${id} not found`);
        }
        
        console.log('✅ Successfully deleted equipment:', id);
        return true;
      } catch (error) {
        console.error('❌ Error deleting equipment:', error);
        throw new Error(`Failed to delete equipment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    returnEquipmentFromEvent: async (_: any, { eventId, equipmentIds }: { eventId: string; equipmentIds: string[] }, context: any) => {
      try {
        const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);
        await ensureMongoConnection();
        log.info('Returning equipment from event', {
          eventId,
          itemCount: Array.isArray(equipmentIds) ? equipmentIds.length : 0,
          userId: user.userId,
        });

        // Find the broadcast event
        const event = await BroadcastEvent.findById(eventId).exec();
        if (!event) {
          throw new Error(`Broadcast event with ID ${eventId} not found`);
        }

        const performerName = (user.displayName || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()) || 'System';

        // ---------------------------------------------------------------
        // Step 1: perform warehouse-side returns FIRST via the hardened
        // service. We only touch event metadata for items that were
        // actually returned successfully so the event document cannot
        // claim equipment was returned when inventory wasn't updated.
        // ---------------------------------------------------------------
        const updatedEquipment: Array<{
          id: string;
          status: string;
          quantityAvailable: number;
          quantityAssigned: number;
        }> = [];
        const successfulReturnedKeys = new Set<string>();
        const failures: Array<{ equipmentId: string; reason?: string; error?: string }> = [];
        // Tracks items that had no active assignment but were still present in
        // event metadata — we clean them out instead of failing the request.
        let staleReferenceCleanups = 0;

        // Check whether an equipment id / barcode is still referenced anywhere
        // in the event metadata the UI uses to populate the return modal. We
        // use this to distinguish a legitimate failure (the operator asked to
        // return something the system has no record of) from a stale-metadata
        // orphan (the item is only "assigned" inside the event document and
        // can be safely scrubbed).
        const isReferencedInEventMetadata = (
          eq: { _id: any; barcode?: string | null },
          alsoCheck: string,
        ): boolean => {
          const eqId = eq._id?.toString?.() ?? String(eq._id);
          const barcode = eq.barcode || '';
          const candidates = new Set<string>([eqId, alsoCheck]);
          if (barcode) candidates.add(barcode);

          const matchesItem = (item: any): boolean => {
            if (!item) return false;
            const id = item.equipmentId || item.id;
            const bc = item.barcode;
            return (
              (typeof id === 'string' && candidates.has(id)) ||
              (typeof bc === 'string' && candidates.has(bc))
            );
          };

          const eventDoc = event as any;

          if (Array.isArray(eventDoc.equipment_list)) {
            if (eventDoc.equipment_list.some((v: any) => typeof v === 'string' && candidates.has(v))) {
              return true;
            }
          }

          const lists: any[][] = [
            eventDoc?.metadata?.departments?.warehouse?.assignedItems,
            eventDoc?.metadata?.departments?.warehouse?.customData?.assignedItems,
            eventDoc?.metadata?.warehouseData?.assignedItems,
            eventDoc?.metadata?.warehouseData?.customData?.assignedItems,
            eventDoc?.metadata?.departments?.externalBroadcasts?.equipmentList,
            eventDoc?.metadata?.departments?.externalBroadcasts?.customData?.equipmentList,
          ];
          return lists.some((arr) => Array.isArray(arr) && arr.some(matchesItem));
        };

        for (const requestedId of equipmentIds) {
          // Resolve by Mongo _id first, then fall back to barcode lookup so
          // we always have a canonical equipmentId for the service call.
          let equipment = mongoose.Types.ObjectId.isValid(requestedId)
            ? await Equipment.findById(requestedId).exec()
            : null;
          if (!equipment) {
            equipment = await Equipment.findOne({ barcode: requestedId }).exec();
          }

          if (!equipment) {
            log.warn('Equipment not found for return', { requestedId });
            failures.push({ equipmentId: requestedId, reason: 'not_found', error: 'Equipment not found' });
            continue;
          }

          const result = await returnEquipment({
            equipmentId: equipment._id.toString(),
            eventId: (event._id as mongoose.Types.ObjectId).toString(),
            returnedBy: user.userId,
            returnedByName: performerName,
            notes: 'Equipment returned via return equipment action',
          });

          if (!result.success) {
            // Stale-metadata recovery: the equipment has no active assignment
            // for this event, but the event document still references it.
            // The UI builds its returnable list by merging metadata refs with
            // active assignments, so without this branch the operator would
            // be permanently stuck — every retry would produce "1 failed"
            // and the orphan reference would never go away. Treat this as a
            // metadata cleanup so the existing pruning code below removes
            // the dangling reference.
            if (
              result.reason === 'no_active_assignment' &&
              isReferencedInEventMetadata(equipment, requestedId)
            ) {
              log.info('Cleaning up stale equipment reference (no active assignment)', {
                equipmentId: equipment._id.toString(),
                barcode: equipment.barcode,
                eventId: (event._id as mongoose.Types.ObjectId).toString(),
              });

              successfulReturnedKeys.add(equipment._id.toString());
              if (equipment.barcode) successfulReturnedKeys.add(equipment.barcode);
              successfulReturnedKeys.add(requestedId);
              staleReferenceCleanups++;

              updatedEquipment.push({
                id: equipment._id.toString(),
                status: equipment.status,
                quantityAvailable: equipment.quantityAvailable,
                quantityAssigned: equipment.quantityAssigned,
              });
              continue;
            }

            log.warn('Equipment return failed', {
              equipmentId: equipment._id.toString(),
              barcode: equipment.barcode,
              reason: result.reason,
              error: result.error,
            });
            failures.push({
              equipmentId: equipment._id.toString(),
              reason: result.reason,
              error: result.error,
            });
            continue;
          }

          successfulReturnedKeys.add(equipment._id.toString());
          if (equipment.barcode) successfulReturnedKeys.add(equipment.barcode);
          successfulReturnedKeys.add(requestedId);

          if (result.equipment) {
            updatedEquipment.push({
              id: result.equipment.id,
              status: result.equipment.status,
              quantityAvailable: result.equipment.quantityAvailable,
              quantityAssigned: result.equipment.quantityAssigned,
            });
          }
        }

        // ---------------------------------------------------------------
        // Step 2: only now update event metadata to reflect the returns
        // that actually succeeded. Items that failed remain on the event
        // so operators can see and retry them.
        // ---------------------------------------------------------------
        const eventDoc = event as any;
        const matchesReturned = (id: any) =>
          typeof id === 'string' && successfulReturnedKeys.has(id);

        const currentEquipmentList = eventDoc.equipment_list || [];
        eventDoc.equipment_list = currentEquipmentList.filter(
          (equipmentId: string) => !matchesReturned(equipmentId)
        );

        if (eventDoc.metadata && eventDoc.metadata.departments) {
          if (eventDoc.metadata.departments.warehouse) {
            const warehouseData = eventDoc.metadata.departments.warehouse;
            const customData = warehouseData.customData || {};
            const assignedItems = customData.assignedItems || warehouseData.assignedItems || [];
            const equipmentHistory = customData.equipmentHistory || warehouseData.equipmentHistory || [];

            const returnedItems = assignedItems.filter((item: any) => {
              const itemId = item.equipmentId || item.barcode || item.id;
              return matchesReturned(itemId);
            });

            returnedItems.forEach((item: any) => {
              const historyEntry = {
                ...item,
                action: 'returned',
                returnedAt: new Date().toISOString(),
              };
              const existingIndex = equipmentHistory.findIndex(
                (h: any) => h.barcode === item.barcode && h.action !== 'returned'
              );
              if (existingIndex >= 0) {
                equipmentHistory[existingIndex] = historyEntry;
              } else {
                equipmentHistory.push(historyEntry);
              }
            });

            const remainingAssignedItems = assignedItems.filter((item: any) => {
              const itemId = item.equipmentId || item.barcode || item.id;
              return !matchesReturned(itemId);
            });

            if (customData.assignedItems !== undefined) {
              eventDoc.metadata.departments.warehouse.customData = {
                ...customData,
                assignedItems: remainingAssignedItems,
                equipmentHistory,
                totalAssigned: remainingAssignedItems.length,
                lastUpdated: new Date().toISOString(),
              };
            } else {
              eventDoc.metadata.departments.warehouse.assignedItems = remainingAssignedItems;
              eventDoc.metadata.departments.warehouse.equipmentHistory = equipmentHistory;
              eventDoc.metadata.departments.warehouse.totalAssigned = remainingAssignedItems.length;
            }
          }

          if (eventDoc.metadata.departments.externalBroadcasts) {
            const ext = eventDoc.metadata.departments.externalBroadcasts;
            if (ext.customData && Array.isArray(ext.customData.equipmentList)) {
              ext.customData.equipmentList = ext.customData.equipmentList.filter((item: any) => {
                const itemId = item.equipmentId || item.id;
                return !matchesReturned(itemId);
              });
            }
            if (Array.isArray(ext.equipmentList)) {
              ext.equipmentList = ext.equipmentList.filter((item: any) => {
                const itemId = item.equipmentId || item.id;
                return !matchesReturned(itemId);
              });
            }
          }
        }

        if (eventDoc.metadata && eventDoc.metadata.warehouseData) {
          const warehouseData = eventDoc.metadata.warehouseData;
          const customData = warehouseData.customData || {};
          const assignedItems = customData.assignedItems || warehouseData.assignedItems || [];
          const equipmentHistory = customData.equipmentHistory || warehouseData.equipmentHistory || [];

          const returnedItems = assignedItems.filter((item: any) => {
            const itemId = item.equipmentId || item.barcode || item.id;
            return matchesReturned(itemId);
          });

          returnedItems.forEach((item: any) => {
            const historyEntry = {
              ...item,
              action: 'returned',
              returnedAt: new Date().toISOString(),
            };
            const existingIndex = equipmentHistory.findIndex(
              (h: any) => h.barcode === item.barcode && h.action !== 'returned'
            );
            if (existingIndex >= 0) {
              equipmentHistory[existingIndex] = historyEntry;
            } else {
              equipmentHistory.push(historyEntry);
            }
          });

          const remainingAssignedItems = assignedItems.filter((item: any) => {
            const itemId = item.equipmentId || item.barcode || item.id;
            return !matchesReturned(itemId);
          });

          if (customData.assignedItems !== undefined) {
            eventDoc.metadata.warehouseData.customData = {
              ...customData,
              assignedItems: remainingAssignedItems,
              equipmentHistory,
              totalAssigned: remainingAssignedItems.length,
              lastUpdated: new Date().toISOString(),
            };
          } else {
            eventDoc.metadata.warehouseData.assignedItems = remainingAssignedItems;
            eventDoc.metadata.warehouseData.equipmentHistory = equipmentHistory;
            eventDoc.metadata.warehouseData.totalAssigned = remainingAssignedItems.length;
          }
        }

        event.markModified('equipment_list');
        event.markModified('metadata');
        await event.save();

        const successCount = updatedEquipment.length;
        const realReturnCount = successCount - staleReferenceCleanups;
        const messageParts: string[] = [];
        if (realReturnCount > 0) {
          messageParts.push(`${realReturnCount} פריטי ציוד הוחזרו בהצלחה למחסן`);
        }
        if (staleReferenceCleanups > 0) {
          messageParts.push(`${staleReferenceCleanups} רישומים יתומים נוקו`);
        }
        if (failures.length > 0) {
          messageParts.push(`${failures.length} נכשלו`);
        }
        const message =
          messageParts.length > 0
            ? messageParts.join(' · ')
            : 'לא בוצעה פעולה';

        log.info('Equipment return completed', {
          eventId,
          successCount,
          realReturnCount,
          staleReferenceCleanups,
          failureCount: failures.length,
        });

        return {
          success: failures.length === 0,
          message,
          updatedEvent: {
            id: (event._id as mongoose.Types.ObjectId).toString(),
            equipment_list: eventDoc.equipment_list,
          },
          updatedEquipment,
        };
      } catch (error) {
        log.error('Error returning equipment from event', {
          eventId,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          message: `Failed to return equipment: ${error instanceof Error ? error.message : 'Unknown error'}`,
          updatedEvent: null,
          updatedEquipment: []
        };
      }
    },

    transferEquipmentBetweenEvents: async (_: any, { sourceEventId, targetEventId, equipmentIds }: { sourceEventId: string; targetEventId: string; equipmentIds: string[] }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_MANAGE);
        await ensureMongoConnection();
        console.log('🔄 Transferring equipment between events:', { sourceEventId, targetEventId, equipmentIds });
        
        // Find both events
        const sourceEvent = await BroadcastEvent.findById(sourceEventId).exec();
        const targetEvent = await BroadcastEvent.findById(targetEventId).exec();
        
        if (!sourceEvent) {
          throw new Error(`Source broadcast event with ID ${sourceEventId} not found`);
        }
        if (!targetEvent) {
          throw new Error(`Target broadcast event with ID ${targetEventId} not found`);
        }
        
        const sourceDoc = sourceEvent as any;
        const targetDoc = targetEvent as any;
        
        // Remove equipment from source event
        const currentSourceEquipmentList = sourceDoc.equipment_list || [];
        sourceDoc.equipment_list = currentSourceEquipmentList.filter(
          (equipmentId: string) => !equipmentIds.includes(equipmentId)
        );
        
        // Add equipment to target event
        const currentTargetEquipmentList = targetDoc.equipment_list || [];
        targetDoc.equipment_list = [...currentTargetEquipmentList, ...equipmentIds];
        
        // Update metadata for source event
        if (sourceDoc.metadata && sourceDoc.metadata.departments) {
          // Update warehouse equipmentHistory to mark items as transferred
          if (sourceDoc.metadata.departments.warehouse) {
            const warehouseData = sourceDoc.metadata.departments.warehouse;
            
            // Update equipment history to show items were transferred
            if (warehouseData.customData?.equipmentHistory || warehouseData.equipmentHistory) {
              const historyPath = warehouseData.customData?.equipmentHistory ? 'customData.equipmentHistory' : 'equipmentHistory';
              const history = warehouseData.customData?.equipmentHistory || warehouseData.equipmentHistory || [];
              
              // Update existing history entries for transferred equipment
              for (let i = 0; i < history.length; i++) {
                const historyItem = history[i];
                const itemId = historyItem.equipmentId || historyItem.barcode || historyItem.id;
                
                if (equipmentIds.includes(itemId) && historyItem.action !== 'returned' && historyItem.action !== 'transferred') {
                  // Update the history item to show it was transferred
                  history[i] = {
                    ...historyItem,
                    action: 'transferred',
                    transferredAt: new Date().toISOString(),
                    transferredTo: targetEvent.title,
                    transferredToEventId: targetEventId
                  };
                }
              }
              
              // Set the updated history back
              if (warehouseData.customData?.equipmentHistory) {
                warehouseData.customData.equipmentHistory = history;
              } else {
                warehouseData.equipmentHistory = history;
              }
            }
            
            // Update assigned items
            if (warehouseData.customData?.assignedItems) {
              warehouseData.customData.assignedItems = 
                warehouseData.customData.assignedItems.filter((item: any) => {
                  const itemId = item.equipmentId || item.barcode || item.id;
                  return !equipmentIds.includes(itemId);
                });
            }
            if (warehouseData.assignedItems) {
              warehouseData.assignedItems = 
                warehouseData.assignedItems.filter((item: any) => {
                  const itemId = item.equipmentId || item.barcode || item.id;
                  return !equipmentIds.includes(itemId);
                });
            }
          }
          
          // Update external broadcasts equipmentList
          if (sourceDoc.metadata.departments.externalBroadcasts) {
            if (sourceDoc.metadata.departments.externalBroadcasts.customData?.equipmentList) {
              sourceDoc.metadata.departments.externalBroadcasts.customData.equipmentList = 
                sourceDoc.metadata.departments.externalBroadcasts.customData.equipmentList.filter((item: any) => {
                  const itemId = item.equipmentId || item.id;
                  return !equipmentIds.includes(itemId);
                });
            }
            if (sourceDoc.metadata.departments.externalBroadcasts.equipmentList) {
              sourceDoc.metadata.departments.externalBroadcasts.equipmentList = 
                sourceDoc.metadata.departments.externalBroadcasts.equipmentList.filter((item: any) => {
                  const itemId = item.equipmentId || item.id;
                  return !equipmentIds.includes(itemId);
                });
            }
          }
        }
        
        // Update metadata for target event
        if (!targetDoc.metadata) {
          targetDoc.metadata = { departments: {} };
        }
        if (!targetDoc.metadata.departments) {
          targetDoc.metadata.departments = {};
        }
        
        // Initialize warehouse department if not exists
        if (!targetDoc.metadata.departments.warehouse) {
          targetDoc.metadata.departments.warehouse = { customData: { assignedItems: [] } };
        }
        if (!targetDoc.metadata.departments.warehouse.customData) {
          targetDoc.metadata.departments.warehouse.customData = { assignedItems: [] };
        }
        if (!targetDoc.metadata.departments.warehouse.customData.assignedItems) {
          targetDoc.metadata.departments.warehouse.customData.assignedItems = [];
        }
        
        // Add equipment items to target metadata
        for (const equipmentId of equipmentIds) {
          // Try to find equipment details
          let equipment = await Equipment.findById(equipmentId).exec();
          if (!equipment) {
            equipment = await Equipment.findOne({ barcode: equipmentId }).exec();
          }
          
          if (equipment) {
            targetDoc.metadata.departments.warehouse.customData.assignedItems.push({
              equipmentId: equipment._id.toString(),
              barcode: equipment.barcode,
              name: equipment.name,
              category: equipment.category,
              assignedAt: new Date().toISOString()
            });
            
            // Update the assignment record from source to target
            const assignment = await EquipmentAssignment.findOne({
              equipmentId: equipment._id,
              eventId: sourceEventId,
              status: 'active'
            }).exec();
            
            if (assignment) {
              // Update the existing assignment to point to the new event
              assignment.eventId = targetEvent._id;
              assignment.eventName = targetEvent.title;
              assignment.startDate = targetEvent.startTime;
              assignment.endDate = targetEvent.endTime;
              assignment.location = targetEvent.location || targetEvent.venue;
              await assignment.save();
            } else {
              // Create new assignment if not found
              const newAssignment = new EquipmentAssignment({
                equipmentId: equipment._id,
                eventId: targetEvent._id,
                eventName: targetEvent.title,
                startDate: targetEvent.startTime,
                endDate: targetEvent.endTime,
                location: targetEvent.location || targetEvent.venue,
                status: 'active',
                quantityAssigned: 1,
                assignedBy: 'system',
                assignedByName: 'System',
                notes: `Transferred from event: ${sourceEvent.title}`
              });
              await newAssignment.save();
            }
            
            // Stamp lastUsedAt
            equipment.lastUsedAt = new Date();
            await equipment.save();

            // Create history record for transfer
            const historyRecord = new EquipmentHistory({
              equipmentId: equipment._id,
              eventId: targetEvent._id,
              eventName: `${sourceEvent.title} → ${targetEvent.title}`,
              date: new Date(),
              action: 'transferred',
              quantity: 1,
              performedBy: 'system',
              performedByName: 'System',
              notes: `Transferred from "${sourceEvent.title}" to "${targetEvent.title}"`
            });
            await historyRecord.save();
          }
        }
        
        // Mark fields as modified
        sourceEvent.markModified('equipment_list');
        sourceEvent.markModified('metadata');
        targetEvent.markModified('equipment_list');
        targetEvent.markModified('metadata');
        
        // Save both events
        await Promise.all([sourceEvent.save(), targetEvent.save()]);

        // Refresh shared engineering snapshots for both endpoints — items
        // that were flagged shared engineering need to leave the source's
        // snapshot and appear in the target's (and the matching MCR
        // shadow events). Best-effort: failures here are logged but do
        // not undo the transfer.
        await Promise.all([
          syncSharedEngineeringSnapshotForEvent(sourceEventId).catch((err) =>
            console.error('Shared engineering snapshot sync (source) failed', err),
          ),
          syncSharedEngineeringSnapshotForEvent(targetEventId).catch((err) =>
            console.error('Shared engineering snapshot sync (target) failed', err),
          ),
        ]);

        console.log('✅ Successfully transferred equipment between events');
        console.log(`   Source event (${sourceEventId}): ${sourceDoc.equipment_list.length} items remaining`);
        console.log(`   Target event (${targetEventId}): ${targetDoc.equipment_list.length} items total`);
        
        return {
          success: true,
          message: `${equipmentIds.length} פריטי ציוד הועברו בהצלחה`,
          sourceEvent: {
            id: sourceEvent._id.toString(),
            equipment_list: sourceDoc.equipment_list
          },
          targetEvent: {
            id: targetEvent._id.toString(),
            equipment_list: targetDoc.equipment_list
          }
        };
      } catch (error) {
        console.error('❌ Error transferring equipment between events:', error);
        return {
          success: false,
          message: `Failed to transfer equipment: ${error instanceof Error ? error.message : 'Unknown error'}`,
          sourceEvent: null,
          targetEvent: null
        };
      }
    },

    // Equipment Assignment Mutations
    createEquipmentAssignment: async (_: any, { input }: { input: any }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_MANAGE);
        await ensureMongoConnection();

        if (!mongoose.Types.ObjectId.isValid(input.broadcastEventId)) {
          throw new Error('Invalid broadcastEventId');
        }
        if (!mongoose.Types.ObjectId.isValid(input.equipmentId)) {
          throw new Error('Invalid equipmentId');
        }

        const event = await BroadcastEvent.findById(input.broadcastEventId).exec();
        if (!event) {
          throw new Error('Broadcast event not found');
        }

        // Use the atomic allocation helper so concurrent requests cannot
        // overcommit the same item. The service handles inventory decrement,
        // assignment creation, history logging, and rollback on failure.
        const result = await allocateEquipment({
          equipmentId: input.equipmentId,
          eventId: input.broadcastEventId,
          eventName: event.title || '',
          startDate: event.startTime || new Date(),
          endDate: event.endTime || new Date(),
          location: event.location || event.venue || null,
          quantity: input.quantityAssigned || 1,
          assignedBy: getContextUserId(context),
          assignedByName: getContextUserDisplayName(context),
          notes: input.assignmentNotes || null,
        });

        if (!result.success || !result.assignmentId) {
          throw new Error(result.error || 'Failed to allocate equipment');
        }

        // Re-read the persisted assignment to return a complete object.
        const saved = await EquipmentAssignment.findById(result.assignmentId).exec();
        if (!saved) {
          throw new Error('Allocation succeeded but assignment record could not be loaded');
        }

        return {
          id: saved._id.toString(),
          equipmentId: saved.equipmentId.toString(),
          eventName: saved.eventName,
          eventId: saved.eventId.toString(),
          startDate: saved.startDate.toISOString(),
          endDate: saved.endDate.toISOString(),
          location: saved.location || null,
          status: saved.status,
          quantityAssigned: saved.quantityAssigned,
          assignmentStatus: input.assignmentStatus || saved.status,
          assignedAt: saved.assignedAt?.toISOString() || null,
          scheduledPickupAt: input.scheduledPickupAt || null,
          scheduledReturnAt: input.scheduledReturnAt || null,
          actualPickupAt: null,
          actualReturnAt: null,
          assignmentNotes: saved.notes || null,
          returnNotes: null,
          assignedToName: saved.assignedByName || null,
          assignedBy: saved.assignedBy || null,
          assignedByUser: null,
          collectedByUser: null,
          returnedByUser: null,
          createdAt: saved.createdAt.toISOString(),
          updatedAt: saved.updatedAt.toISOString()
        };
      } catch (error: any) {
        console.error('Error creating equipment assignment:', error);
        throw new Error(error.message || 'Failed to create equipment assignment');
      }
    },

    updateEquipmentAssignment: async (_: any, { id, input }: { id: string, input: any }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_MANAGE);
        await ensureMongoConnection();

        const assignment = await EquipmentAssignment.findById(id).exec();
        if (!assignment) {
          throw new Error('Equipment assignment not found');
        }
        
        if (input.quantityAssigned !== undefined) assignment.quantityAssigned = input.quantityAssigned;
        if (input.assignmentStatus !== undefined) assignment.status = input.assignmentStatus === 'completed' ? 'completed' : input.assignmentStatus === 'cancelled' ? 'cancelled' : 'active';
        if (input.actualReturnAt !== undefined) { assignment.returnedAt = new Date(input.actualReturnAt); }
        if (input.returnNotes !== undefined) assignment.notes = input.returnNotes;
        
        const saved = await assignment.save();

        // Stamp lastUsedAt on the equipment
        await Equipment.findByIdAndUpdate(saved.equipmentId, { $set: { lastUsedAt: new Date() } }).exec();
        
        return {
          id: saved._id.toString(),
          equipmentId: saved.equipmentId.toString(),
          eventName: saved.eventName,
          eventId: saved.eventId.toString(),
          startDate: saved.startDate.toISOString(),
          endDate: saved.endDate.toISOString(),
          location: saved.location || null,
          status: saved.status,
          quantityAssigned: saved.quantityAssigned,
          assignmentStatus: saved.status,
          assignedAt: saved.assignedAt?.toISOString() || null,
          scheduledPickupAt: null,
          scheduledReturnAt: null,
          actualPickupAt: null,
          actualReturnAt: saved.returnedAt?.toISOString() || null,
          assignmentNotes: saved.notes || null,
          returnNotes: null,
          assignedToName: saved.assignedByName || null,
          assignedBy: saved.assignedBy || null,
          assignedByUser: null,
          collectedByUser: null,
          returnedByUser: null,
          createdAt: saved.createdAt.toISOString(),
          updatedAt: saved.updatedAt.toISOString()
        };
      } catch (error) {
        console.error('Error updating equipment assignment:', error);
        throw new Error('Failed to update equipment assignment');
      }
    },

    deleteEquipmentAssignment: async (_: any, { id }: { id: string }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_MANAGE);
        await ensureMongoConnection();
        const result = await EquipmentAssignment.findByIdAndDelete(id).exec();
        return result !== null;
      } catch (error) {
        console.error('Error deleting equipment assignment:', error);
        throw new Error('Failed to delete equipment assignment');
      }
    },

    updateWarehouseEquipmentQuantity: async (_: any, { id, quantityChange }: { id: string, quantityChange: number }, context: any) => {
      try {
        requirePermission(context, Permission.WAREHOUSE_MANAGE);
        await ensureMongoConnection();

        const equipment = await Equipment.findById(id).exec();
        if (!equipment) {
          throw new Error('Equipment not found');
        }

        // Update quantities
        equipment.quantityAssigned = Math.max(0, equipment.quantityAssigned + quantityChange);
        equipment.quantityAvailable = equipment.quantityTotal - equipment.quantityAssigned;
        
        // Update status based on availability
        if (equipment.quantityAvailable === 0) {
          equipment.status = 'assigned';
        } else if (equipment.quantityAvailable === equipment.quantityTotal) {
          equipment.status = 'available';
        }

        await equipment.save();

        return {
          id: equipment._id.toString(),
          name: equipment.name,
          quantityTotal: equipment.quantityTotal,
          quantityAvailable: equipment.quantityAvailable,
          quantityAssigned: equipment.quantityAssigned,
          isDisabled: equipment.isDisabled || false
        };
      } catch (error) {
        console.error('Error updating equipment quantity:', error);
        throw new Error('Failed to update equipment quantity');
      }
    },

    adjustEquipmentQuantity: async (_: any, { id, adjustment, reason }: { id: string, adjustment: number, reason: string }, context: any) => {
      try {
        await ensureMongoConnection();
        const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);
        
        const equipment = await Equipment.findById(id).exec();
        if (!equipment) {
          throw new Error('Equipment not found');
        }

        // Store previous values for history
        const previousTotal = equipment.quantityTotal;

        // Reject deductions that would orphan currently-assigned units
        // (i.e. would push quantityAvailable below zero). Forcing the user
        // to either return the units first, or use forceReleaseEquipment,
        // prevents the negative-stock corruption that produced the
        // "ghost-assigned" Canon C300 Mark III incident.
        const proposedTotal = equipment.quantityTotal + adjustment;
        if (proposedTotal < equipment.quantityAssigned) {
          throw new Error(
            `Cannot reduce total quantity to ${Math.max(0, proposedTotal)} ` +
            `while ${equipment.quantityAssigned} unit(s) are still marked as assigned. ` +
            `Return the assigned units first, or use Force Release to clear stuck assignments.`
          );
        }

        equipment.quantityTotal = Math.max(0, proposedTotal);
        equipment.quantityAvailable = equipment.quantityTotal - equipment.quantityAssigned;
        equipment.lastUsedAt = new Date();

        await equipment.save();

        // Create history entry
        const history = new EquipmentHistory({
          equipmentId: equipment._id,
          action: 'quantity_adjusted',
          quantity: adjustment,
          performedBy: user.userId,
          performedByName: `${user.firstName} ${user.lastName}`,
          notes: reason,
          previousValue: previousTotal.toString(),
          newValue: equipment.quantityTotal.toString(),
          date: new Date()
        });
        
        await history.save();

        return {
          id: equipment._id.toString(),
          name: equipment.name,
          category: equipment.category,
          brand: equipment.company || null,
          barcode: equipment.barcode,
          status: equipment.status,
          condition: equipment.condition || null,
          quantityTotal: equipment.quantityTotal,
          quantityAvailable: equipment.quantityAvailable,
          quantityAssigned: equipment.quantityAssigned,
          currentLocation: equipment.currentLocation || null,
          isQuantityBased: equipment.isQuantityBased || false,
          isSharedEngineeringEquipment: equipment.isSharedEngineeringEquipment || false,
          isDisabled: equipment.isDisabled || false,
          createdAt: equipment.createdAt.toISOString(),
          updatedAt: equipment.updatedAt.toISOString()
        };
      } catch (error) {
        console.error('Error adjusting equipment quantity:', error);
        if (error instanceof Error) throw error;
        throw new Error('Failed to adjust equipment quantity');
      }
    },

    // Admin escape hatch for stuck "ghost-assigned" units. Resets
    // quantityAssigned to 0, restores quantityAvailable, cancels every
    // active EquipmentAssignment row for this equipment, and writes a
    // history entry. Used when an event was deleted or its metadata was
    // overwritten while units were still checked out.
    forceReleaseEquipment: async (
      _: any,
      { id, reason }: { id: string; reason: string },
      context: any,
    ) => {
      try {
        await ensureMongoConnection();
        const user = requirePermission(context, Permission.WAREHOUSE_FORCE_RELEASE);

        const equipment = await Equipment.findById(id).exec();
        if (!equipment) {
          throw new Error('Equipment not found');
        }

        const previousAssigned = equipment.quantityAssigned;
        const previousAvailable = equipment.quantityAvailable;
        const previousStatus = equipment.status;

        // Cancel any active assignment rows for this equipment so the
        // Return modal stops surfacing the stuck event.
        const activeRows = await EquipmentAssignment.find({
          equipmentId: equipment._id,
          status: 'active',
        }).exec();
        const cancelledEventIds: string[] = [];
        for (const row of activeRows) {
          row.status = 'cancelled';
          row.returnedAt = new Date();
          row.returnedBy = user.userId;
          row.returnedByName = `${user.firstName} ${user.lastName}`;
          row.notes = `${row.notes ? row.notes + ' | ' : ''}Force-released: ${reason}`;
          await row.save();
          cancelledEventIds.push(row.eventId.toString());
        }

        equipment.quantityAssigned = 0;
        equipment.quantityAvailable = equipment.quantityTotal;
        if (!equipment.isDisabled) {
          equipment.status = equipment.quantityTotal > 0 ? 'available' : equipment.status;
        }
        await equipment.save();

        await new EquipmentHistory({
          equipmentId: equipment._id,
          action: 'returned',
          quantity: previousAssigned,
          performedBy: user.userId,
          performedByName: `${user.firstName} ${user.lastName}`,
          notes: `Force release. Reason: ${reason}. Cancelled ${activeRows.length} active assignment row(s)` +
            (cancelledEventIds.length ? ` (events: ${cancelledEventIds.join(', ')})` : ''),
          previousValue: `assigned=${previousAssigned}, available=${previousAvailable}, status=${previousStatus}`,
          newValue: `assigned=${equipment.quantityAssigned}, available=${equipment.quantityAvailable}, status=${equipment.status}`,
          date: new Date(),
        }).save();

        return {
          id: equipment._id.toString(),
          name: equipment.name,
          category: equipment.category,
          brand: equipment.company || null,
          barcode: equipment.barcode,
          status: equipment.status,
          condition: equipment.condition || null,
          quantityTotal: equipment.quantityTotal,
          quantityAvailable: equipment.quantityAvailable,
          quantityAssigned: equipment.quantityAssigned,
          currentLocation: equipment.currentLocation || null,
          isQuantityBased: equipment.isQuantityBased || false,
          isSharedEngineeringEquipment: equipment.isSharedEngineeringEquipment || false,
          isDisabled: equipment.isDisabled || false,
          createdAt: equipment.createdAt.toISOString(),
          updatedAt: equipment.updatedAt.toISOString(),
        };
      } catch (error) {
        console.error('❌ Error force-releasing equipment:', error);
        if (error instanceof Error) throw error;
        throw new Error('Failed to force-release equipment');
      }
    },

    disableEquipment: async (_: any, { id, reason, suspensionStatus }: { id: string, reason: string, suspensionStatus?: string }, context: any) => {
      try {
        await ensureMongoConnection();
        const user = requirePermission(context, Permission.WAREHOUSE_DISABLE_EQUIPMENT);
        
        const equipment = await Equipment.findById(id).exec();
        if (!equipment) {
          throw new Error('Equipment not found');
        }

        if (equipment.isDisabled) {
          throw new Error('Equipment is already disabled');
        }

        // Update equipment
        equipment.isDisabled = true;
        equipment.disabledAt = new Date();
        equipment.disabledBy = user.userId;
        equipment.disabledReason = reason;
        equipment.suspensionStatus = (suspensionStatus as any) || 'under_maintenance';
        equipment.status = 'maintenance';
        
        await equipment.save();

        // Create history entry
        const history = new EquipmentHistory({
          equipmentId: equipment._id,
          action: 'disabled',
          performedBy: user.userId,
          performedByName: `${user.firstName} ${user.lastName}`,
          notes: reason,
          date: new Date()
        });
        
        await history.save();

        return {
          id: equipment._id.toString(),
          name: equipment.name,
          category: equipment.category,
          brand: equipment.company || null,
          barcode: equipment.barcode,
          status: equipment.status,
          condition: equipment.condition || null,
          quantityTotal: equipment.quantityTotal,
          quantityAvailable: equipment.quantityAvailable,
          quantityAssigned: equipment.quantityAssigned,
          currentLocation: equipment.currentLocation || null,
          isQuantityBased: equipment.isQuantityBased || false,
          isSharedEngineeringEquipment: equipment.isSharedEngineeringEquipment || false,
          isDisabled: equipment.isDisabled,
          disabledAt: equipment.disabledAt?.toISOString() || null,
          disabledBy: equipment.disabledBy ? { id: equipment.disabledBy } : null,
          disabledReason: equipment.disabledReason || null,
          suspensionStatus: equipment.suspensionStatus || null,
          lastUsedAt: equipment.lastUsedAt?.toISOString() || null,
          createdAt: equipment.createdAt.toISOString(),
          updatedAt: equipment.updatedAt.toISOString()
        };
      } catch (error) {
        console.error('Error disabling equipment:', error);
        throw new Error('Failed to disable equipment');
      }
    },

    enableEquipment: async (_: any, { id, notes }: { id: string; notes?: string }, context: any) => {
      try {
        await ensureMongoConnection();
        const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);
        
        const equipment = await Equipment.findById(id).exec();
        if (!equipment) {
          throw new Error('Equipment not found');
        }

        if (!equipment.isDisabled) {
          throw new Error('Equipment is not disabled');
        }

        // Update equipment
        equipment.isDisabled = false;
        equipment.disabledAt = undefined;
        equipment.disabledBy = undefined;
        equipment.disabledReason = undefined;
        equipment.suspensionStatus = undefined;
        equipment.status = equipment.quantityAvailable > 0 ? 'available' : 'assigned';
        
        await equipment.save();

        // Create history entry — the optional `notes` is the warehouse-user
        // explanation for why the equipment is back in service (e.g. "תוקן",
        // "החזרה מספק", "טעות בהשבתה"). Surfaced in EquipmentDisableModal's
        // log view the next time the equipment is disabled.
        const enableNote = (notes && notes.trim()) || 'Equipment re-enabled';
        const history = new EquipmentHistory({
          equipmentId: equipment._id,
          action: 'enabled',
          performedBy: user.userId,
          performedByName: `${user.firstName} ${user.lastName}`,
          notes: enableNote,
          date: new Date()
        });
        
        await history.save();

        return {
          id: equipment._id.toString(),
          name: equipment.name,
          category: equipment.category,
          brand: equipment.company || null,
          barcode: equipment.barcode,
          status: equipment.status,
          condition: equipment.condition || null,
          quantityTotal: equipment.quantityTotal,
          quantityAvailable: equipment.quantityAvailable,
          quantityAssigned: equipment.quantityAssigned,
          currentLocation: equipment.currentLocation || null,
          isQuantityBased: equipment.isQuantityBased || false,
          isSharedEngineeringEquipment: equipment.isSharedEngineeringEquipment || false,
          isDisabled: equipment.isDisabled,
          createdAt: equipment.createdAt.toISOString(),
          updatedAt: equipment.updatedAt.toISOString()
        };
      } catch (error) {
        console.error('Error enabling equipment:', error);
        throw new Error('Failed to enable equipment');
      }
    },

    undoEquipmentTransfer: async (_: any, { transferId }: { transferId: string }, context: any) => {
      try {
        await ensureMongoConnection();
        const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);
        
        // Find the transfer history entry
        const transferHistory = await EquipmentHistory.findById(transferId).exec();
        if (!transferHistory || transferHistory.action !== 'transferred') {
          throw new Error('Transfer not found or invalid');
        }

        if (!transferHistory.transferDetails) {
          throw new Error('Transfer details not found');
        }

        // Check if transfer is recent (within 24 hours)
        const transferAge = Date.now() - transferHistory.date.getTime();
        if (transferAge > 24 * 60 * 60 * 1000) {
          throw new Error('Transfer is too old to undo (> 24 hours)');
        }

        const { sourceEventId, targetEventId, transferredQuantity } = transferHistory.transferDetails;

        // Find the events
        const sourceEvent = await BroadcastEvent.findById(sourceEventId).exec();
        const targetEvent = await BroadcastEvent.findById(targetEventId).exec();
        
        if (!sourceEvent || !targetEvent) {
          throw new Error('Source or target event not found');
        }

        // Find the equipment
        const equipment = await Equipment.findById(transferHistory.equipmentId).exec();
        if (!equipment) {
          throw new Error('Equipment not found');
        }

        // Reverse the transfer in events
        // Initialize equipmentList if undefined
        if (!sourceEvent.equipmentList) {
          sourceEvent.equipmentList = [];
        }
        if (!targetEvent.equipmentList) {
          targetEvent.equipmentList = [];
        }
        
        // Add back to source event
        const sourceEquipmentIndex = sourceEvent.equipmentList.findIndex(
          (e: any) => e.equipmentId === equipment._id.toString()
        );
        
        if (sourceEquipmentIndex >= 0) {
          sourceEvent.equipmentList[sourceEquipmentIndex].quantity += transferredQuantity;
        } else {
          sourceEvent.equipmentList.push({
            equipmentId: equipment._id.toString(),
            name: equipment.name,
            quantity: transferredQuantity
          });
        }

        // Remove from target event
        const targetEquipmentIndex = targetEvent.equipmentList.findIndex(
          (e: any) => e.equipmentId === equipment._id.toString()
        );
        
        if (targetEquipmentIndex >= 0) {
          targetEvent.equipmentList[targetEquipmentIndex].quantity -= transferredQuantity;
          if (targetEvent.equipmentList[targetEquipmentIndex].quantity <= 0) {
            targetEvent.equipmentList.splice(targetEquipmentIndex, 1);
          }
        }

        await sourceEvent.save();
        await targetEvent.save();

        // Create history entry for undo
        const undoHistory = new EquipmentHistory({
          equipmentId: equipment._id,
          action: 'transferred',
          quantity: transferredQuantity,
          performedBy: user.userId,
          performedByName: `${user.firstName} ${user.lastName}`,
          notes: `Undo transfer: ${targetEvent.title} → ${sourceEvent.title}`,
          transferDetails: {
            sourceEventId: targetEventId, // Reversed
            sourceEventName: targetEvent.title,
            targetEventId: sourceEventId, // Reversed
            targetEventName: sourceEvent.title,
            transferredQuantity
          },
          date: new Date()
        });
        
        await undoHistory.save();

        return {
          success: true,
          message: `Successfully undid transfer of ${transferredQuantity} ${equipment.name} from ${targetEvent.title} to ${sourceEvent.title}`,
          sourceEvent: {
            id: sourceEvent._id.toString(),
            title: sourceEvent.title,
            equipment_list: sourceEvent.equipmentList
          },
          targetEvent: {
            id: targetEvent._id.toString(),
            title: targetEvent.title,
            equipment_list: targetEvent.equipmentList
          }
        };
      } catch (error) {
        console.error('Error undoing equipment transfer:', error);
        throw new Error('Failed to undo equipment transfer');
      }
    },

    // External Broadcast Presets
    createExternalBroadcastPreset: async (_: any, { input }: { input: any }, context: any) => {
      requirePermission(context, Permission.BROADCAST_MANAGE);
      try {
        await ensureMongoConnection();
        const preset = new ExternalBroadcastPreset(input);
        const saved = await preset.save();
        return { id: saved._id.toString(), ...saved.toObject() };
      } catch (error) {
        console.error('Error creating external broadcast preset:', error);
        throw new Error('Failed to create external broadcast preset');
      }
    },

    updateExternalBroadcastPreset: async (_: any, { id, input }: { id: string; input: any }, context: any) => {
      requirePermission(context, Permission.BROADCAST_MANAGE);
      try {
        await ensureMongoConnection();
        const updated = await ExternalBroadcastPreset.findByIdAndUpdate(id, input, {
          new: true,
          runValidators: true,
        }).exec();
        if (!updated) {
          throw new Error('External broadcast preset not found');
        }
        return { id: updated._id.toString(), ...updated.toObject() };
      } catch (error) {
        console.error('Error updating external broadcast preset:', error);
        throw new Error('Failed to update external broadcast preset');
      }
    },

    deleteExternalBroadcastPreset: async (_: any, { id }: { id: string }, context: any) => {
      requirePermission(context, Permission.BROADCAST_DELETE);
      try {
        await ensureMongoConnection();
        const result = await ExternalBroadcastPreset.findByIdAndDelete(id).exec();
        return result !== null;
      } catch (error) {
        console.error('Error deleting external broadcast preset:', error);
        throw new Error('Failed to delete external broadcast preset');
      }
    },
  },
  
  // Field resolvers for related data
  // Removed BroadcastEvent field resolvers as they're not in the simplified schema
}; 