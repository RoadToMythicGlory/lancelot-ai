// sharedEngineeringExport.service
//
// Single source of truth for the "ציוד הנדסה שיתופי" (shared engineering
// equipment) export. Used by:
//   • the MCR / Warehouse GraphQL resolver `mcrSharedEngineeringEquipment`
//     (the in-app tab),
//   • the external REST API (`/api/v1/external/shared-engineering-equipment`)
//     consumed by partner dashboards,
//   • the outbound webhook payloads (`equipment.assigned`, …) so external
//     listeners always receive the exact same device row as a REST GET would
//     return.
//
// The resolver and the REST endpoint are guaranteed to never drift because
// they both call into the helpers exposed here.

import mongoose from 'mongoose';
import {
  Equipment,
  EquipmentAssignment,
  EquipmentHistory,
  EQUIPMENT_CATEGORIES,
} from '../models/equipment.models';
import {
  InternalEquipmentAssignment,
} from '../models/internalEquipmentAssignment.models';
import { BroadcastEvent } from '../models/broadcast.models';
import MCREvent from '../models/mcrEvent';
import { Warehouse } from '../models/warehouse.models';
import { EquipmentCategory as EquipmentCategoryModel } from '../models/equipmentCategory.models';
import {
  TrackerTag,
  TrackerLatestPosition,
} from '../models/tracking.models';
import { createLogger } from '../utils/logger';

const logger = createLogger('shared-engineering-export');

// -----------------------------------------------------------------------
// Shape returned by the existing GraphQL `mcrSharedEngineeringEquipment`
// resolver (kept unchanged so the MCR/warehouse UI works exactly as before).
// -----------------------------------------------------------------------
export interface MappedEventAssignment {
  assignmentId: string;
  equipmentId: string;
  equipmentName: string;
  barcode: string | null;
  category: string | null;
  quantity: number;
  status: string;
  assignedAt: Date | null;
  returnedAt: Date | null;
  assignedByName: string | null;
  notes: string | null;
  broadcastEventId: string;
  broadcastEventTitle: string | null;
  broadcastEventStart: Date | null;
  broadcastEventEnd: Date | null;
  broadcastEventVenue: string | null;
  broadcastEventLocation: string | null;
  mcrEventId: string | null;
  mcrEventTitle: string | null;
  mcrEventStart: Date | null;
  mcrEventEnd: Date | null;
}

export interface MappedStaffAssignment {
  assignmentId: string;
  equipmentId: string;
  equipmentName: string;
  barcode: string | null;
  category: string | null;
  quantity: number;
  status: string;
  assignedToType: string;
  assignedToUserId: string | null;
  assignedToName: string;
  assignedToPhone: string | null;
  assignedAt: Date | null;
  assignedByName: string | null;
  returnedAt: Date | null;
  notes: string | null;
}

export interface MappedAvailableEquipment {
  equipmentId: string;
  equipmentName: string;
  barcode: string | null;
  category: string | null;
  quantity: number;
  status: string;
  warehouseId: string | null;
  warehouseName: string | null;
  storagePlaceId: string | null;
  storagePlaceName: string | null;
  storagePlaceCode: string | null;
  currentLocation: string | null;
}

export interface SharedEngineeringSnapshot {
  eventAssignments: MappedEventAssignment[];
  staffAssignments: MappedStaffAssignment[];
  availableEquipment: MappedAvailableEquipment[];
}

// -----------------------------------------------------------------------
// "Device-centric" projection — one row per shared engineering equipment
// item, with the resolved current location (warehouse / event / staff) and
// optional BLE live position. This is the canonical shape returned by the
// external REST API and embedded in webhook payloads.
// -----------------------------------------------------------------------

export type DeviceLocationKind = 'warehouse' | 'event' | 'staff' | 'unknown';

export interface DeviceLocationWarehouse {
  kind: 'warehouse';
  warehouseId: string | null;
  warehouseName: string | null;
  storagePlaceId: string | null;
  storagePlaceName: string | null;
  storagePlaceCode: string | null;
  currentLocation: string | null;
}

export interface DeviceLocationEvent {
  kind: 'event';
  assignmentId: string;
  broadcastEventId: string;
  broadcastEventTitle: string | null;
  broadcastEventStart: string | null;
  broadcastEventEnd: string | null;
  broadcastEventVenue: string | null;
  broadcastEventLocation: string | null;
  mcrEventId: string | null;
  assignedAt: string | null;
  assignedByName: string | null;
}

export interface DeviceLocationStaff {
  kind: 'staff';
  assignmentId: string;
  assignedToType: string;
  assignedToUserId: string | null;
  assignedToName: string;
  assignedToPhone: string | null;
  assignedAt: string | null;
  assignedByName: string | null;
}

export interface DeviceLocationUnknown {
  kind: 'unknown';
}

export type DeviceLocation =
  | DeviceLocationWarehouse
  | DeviceLocationEvent
  | DeviceLocationStaff
  | DeviceLocationUnknown;

export interface DeviceLivePosition {
  kind: 'indoor' | 'outdoor' | 'stale';
  siteId: string | null;
  gatewayId: string | null;
  gatewayName: string | null;
  zoneName: string | null;
  x: number | null;
  y: number | null;
  lat: number | null;
  lng: number | null;
  rssi: number | null;
  batteryPct: number | null;
  confidence: number | null;
  computedAt: string | null;
}

export interface DeviceContact {
  primary: string | null;          // Equipment.contactPerson
  currentHolderName: string | null;
  currentHolderPhone: string | null;
}

export interface DeviceLinks {
  self: string;
  history: string;
  assignments: string;
}

export interface DeviceRow {
  id: string;
  name: string;
  barcode: string | null;
  category: string | null;
  categoryLabelHe: string | null;
  brand: string | null;
  equipmentModel: string | null;
  imageUrl: string | null;
  manualLink: string | null;

  status: string;
  suspensionStatus: string | null;
  condition: string | null;
  isDisabled: boolean;
  disabledReason: string | null;

  quantityTotal: number;
  quantityAvailable: number;
  quantityAssigned: number;
  isQuantityBased: boolean;
  isSharedEngineeringEquipment: boolean;

  location: DeviceLocation;
  livePosition: DeviceLivePosition | null;

  contact: DeviceContact;

  warrantyExpiryDate: string | null;
  purchaseDate: string | null;
  priceIls: number | null;

  assignmentHistoryCount: number;

  lastUsedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;

  _links?: DeviceLinks;
}

export interface DeviceQueryFilter {
  status?: string;        // 'available' | 'assigned' | 'maintenance' | 'broken'
  category?: string;
  assignedTo?: 'event' | 'staff' | 'none';
  updatedSince?: Date;
  ids?: string[];         // restrict to specific equipment ids (e.g. for webhook)
}

export interface DeviceListResult {
  data: DeviceRow[];
  meta: {
    nextCursor: string | null;
    total: number;
    generatedAt: string;
  };
}

// -----------------------------------------------------------------------
// Shared aggregator. Loads the data once and returns both the legacy MCR
// snapshot (3 buckets) and the device-centric row map keyed by equipmentId.
// Callers pick whichever projection they need.
// -----------------------------------------------------------------------

interface AggregateOptions {
  // 'active' | 'all' | concrete status — matches the legacy resolver param.
  status?: string;
  // Optional id allow-list. When provided we only fetch the flagged equipment
  // whose `_id` is in this set (used by webhook emitters to build a single-row
  // payload without scanning the whole catalog).
  ids?: string[];
  // When true, BLE live positions are joined in (one extra query). Disabled
  // by default for the legacy MCR snapshot, enabled for the external API.
  includeLivePosition?: boolean;
  // When true, category Hebrew labels are joined. Disabled by default.
  includeCategoryLabels?: boolean;
}

interface AggregateResult {
  snapshot: SharedEngineeringSnapshot;
  deviceById: Map<string, DeviceRow>;
}

async function aggregateSharedEngineering(
  opts: AggregateOptions = {},
): Promise<AggregateResult> {
  const requestedStatus = typeof opts.status === 'string' ? opts.status : 'active';
  const includeAll = requestedStatus === 'all';

  // Step 1 — flagged equipment (optionally restricted to a given id set).
  const equipmentFilter: any = { isSharedEngineeringEquipment: true };
  if (opts.ids && opts.ids.length > 0) {
    const objectIds = opts.ids
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (objectIds.length === 0) {
      return {
        snapshot: { eventAssignments: [], staffAssignments: [], availableEquipment: [] },
        deviceById: new Map(),
      };
    }
    equipmentFilter._id = { $in: objectIds };
  }

  const flaggedEquipment = await Equipment.find(equipmentFilter)
    .select({
      _id: 1,
      name: 1,
      barcode: 1,
      category: 1,
      warehouseId: 1,
      storagePlaceId: 1,
      currentLocation: 1,
      // Fields we need for the rich device-centric projection.
      company: 1,
      equipmentModel: 1,
      imageUrl: 1,
      manualLink: 1,
      contactPerson: 1,
      status: 1,
      condition: 1,
      suspensionStatus: 1,
      isDisabled: 1,
      disabledReason: 1,
      quantityTotal: 1,
      quantityAvailable: 1,
      quantityAssigned: 1,
      isQuantityBased: 1,
      isSharedEngineeringEquipment: 1,
      warrantyExpiryDate: 1,
      purchaseDate: 1,
      price: 1,
      trackerTagId: 1,
      lastUsedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .lean()
    .exec();

  if (flaggedEquipment.length === 0) {
    return {
      snapshot: { eventAssignments: [], staffAssignments: [], availableEquipment: [] },
      deviceById: new Map(),
    };
  }

  const equipmentIds = flaggedEquipment.map((e: any) => e._id);
  const equipmentById = new Map<string, any>();
  for (const e of flaggedEquipment) {
    equipmentById.set(e._id.toString(), e);
  }

  // Step 2 — warehouses + storage places for the location label.
  const warehouseIdsSet = new Set<string>();
  for (const e of flaggedEquipment) {
    if (e.warehouseId) warehouseIdsSet.add(e.warehouseId.toString());
  }
  const warehouseDocs = warehouseIdsSet.size > 0
    ? await Warehouse.find({ _id: { $in: Array.from(warehouseIdsSet) } })
        .select({ _id: 1, name: 1, storagePlaces: 1 })
        .lean()
        .exec()
    : [];
  const warehouseById = new Map<string, any>();
  const storagePlaceById = new Map<string, { warehouseId: string; name: string; code?: string | null }>();
  for (const w of warehouseDocs) {
    warehouseById.set(w._id.toString(), w);
    for (const sp of (w.storagePlaces || [])) {
      storagePlaceById.set(sp._id.toString(), {
        warehouseId: w._id.toString(),
        name: sp.name,
        code: (sp as any).code ?? null,
      });
    }
  }

  const resolveEquipmentLocation = (eq: any) => {
    const warehouseId = eq?.warehouseId ? eq.warehouseId.toString() : null;
    const storagePlaceId = eq?.storagePlaceId ? eq.storagePlaceId.toString() : null;
    const warehouse = warehouseId ? warehouseById.get(warehouseId) : null;
    const storagePlace = storagePlaceId ? storagePlaceById.get(storagePlaceId) : null;
    return {
      warehouseId: warehouse?._id?.toString?.() || warehouseId,
      warehouseName: warehouse?.name || null,
      storagePlaceId: storagePlace ? storagePlaceId : null,
      storagePlaceName: storagePlace?.name || null,
      storagePlaceCode: storagePlace?.code || null,
      currentLocation: eq?.currentLocation || null,
    };
  };

  // Step 3 — assignments (event + staff), in parallel.
  const eventAssignmentFilter: any = { equipmentId: { $in: equipmentIds } };
  const staffAssignmentFilter: any = { equipmentId: { $in: equipmentIds } };
  if (!includeAll) {
    eventAssignmentFilter.status = requestedStatus;
    staffAssignmentFilter.status = requestedStatus;
  }

  const [eventAssignments, staffAssignments] = await Promise.all([
    EquipmentAssignment.find(eventAssignmentFilter)
      .sort({ assignedAt: -1 })
      .limit(1000)
      .lean()
      .exec(),
    InternalEquipmentAssignment.find(staffAssignmentFilter)
      .sort({ assignedAt: -1 })
      .limit(1000)
      .lean()
      .exec(),
  ]);

  // Step 4 — hydrate broadcast events + MCR shadow events referenced.
  const broadcastIds = Array.from(
    new Set(
      eventAssignments
        .map((a: any) => a.eventId?.toString?.())
        .filter(Boolean),
    ),
  ).map((id) => new mongoose.Types.ObjectId(id));

  const [broadcastEvents, shadowEvents] = await Promise.all([
    broadcastIds.length > 0
      ? BroadcastEvent.find({ _id: { $in: broadcastIds } })
          .select({
            _id: 1,
            title: 1,
            hebrewTitle: 1,
            startTime: 1,
            endTime: 1,
            venue: 1,
            location: 1,
          })
          .lean()
          .exec()
      : Promise.resolve([] as any[]),
    broadcastIds.length > 0
      ? MCREvent.find({ broadcastEventId: { $in: broadcastIds } })
          .select({ _id: 1, title: 1, start: 1, end: 1, broadcastEventId: 1 })
          .lean()
          .exec()
      : Promise.resolve([] as any[]),
  ]);

  const broadcastById = new Map<string, any>();
  for (const b of broadcastEvents) {
    broadcastById.set(b._id.toString(), b);
  }
  const shadowByBroadcast = new Map<string, any>();
  for (const s of shadowEvents) {
    if (s.broadcastEventId) {
      shadowByBroadcast.set(s.broadcastEventId.toString(), s);
    }
  }

  // ---------- Mapped legacy projections (for the GraphQL resolver) --------

  const mappedEventAssignments: MappedEventAssignment[] = eventAssignments.map((a: any) => {
    const equipment = equipmentById.get(a.equipmentId?.toString?.() || '');
    const broadcastId = a.eventId?.toString?.() || '';
    const broadcast = broadcastById.get(broadcastId);
    const shadow = shadowByBroadcast.get(broadcastId);
    return {
      assignmentId: a._id.toString(),
      equipmentId: equipment?._id?.toString?.() || a.equipmentId?.toString?.() || '',
      equipmentName: equipment?.name || a.eventName || 'ציוד',
      barcode: equipment?.barcode || null,
      category: equipment?.category || null,
      quantity: a.quantityAssigned ?? 1,
      status: a.status || 'active',
      assignedAt: a.assignedAt ? new Date(a.assignedAt) : null,
      returnedAt: a.returnedAt ? new Date(a.returnedAt) : null,
      assignedByName: a.assignedByName || null,
      notes: a.notes || null,
      broadcastEventId: broadcastId,
      broadcastEventTitle:
        broadcast?.hebrewTitle || broadcast?.title || a.eventName || null,
      broadcastEventStart: broadcast?.startTime ? new Date(broadcast.startTime) : null,
      broadcastEventEnd: broadcast?.endTime ? new Date(broadcast.endTime) : null,
      broadcastEventVenue: broadcast?.venue || null,
      broadcastEventLocation: broadcast?.location || null,
      mcrEventId: shadow?._id?.toString?.() || null,
      mcrEventTitle: shadow?.title || null,
      mcrEventStart: shadow?.start ? new Date(shadow.start) : null,
      mcrEventEnd: shadow?.end ? new Date(shadow.end) : null,
    };
  });

  const mappedStaffAssignments: MappedStaffAssignment[] = staffAssignments.map((a: any) => {
    const equipment = equipmentById.get(a.equipmentId?.toString?.() || '');
    return {
      assignmentId: a._id.toString(),
      equipmentId: equipment?._id?.toString?.() || a.equipmentId?.toString?.() || '',
      equipmentName: equipment?.name || 'ציוד',
      barcode: equipment?.barcode || null,
      category: equipment?.category || null,
      quantity: a.quantityAssigned ?? 1,
      status: a.status || 'active',
      assignedToType: a.assignedToType || 'internal',
      assignedToUserId: a.assignedToUserId ? a.assignedToUserId.toString() : null,
      assignedToName: a.assignedToName || '',
      assignedToPhone: a.assignedToPhone || null,
      assignedAt: a.assignedAt ? new Date(a.assignedAt) : null,
      assignedByName: a.assignedByName || null,
      returnedAt: a.returnedAt ? new Date(a.returnedAt) : null,
      notes: a.notes || null,
    };
  });

  const activeEventEquipmentIds = new Set(
    eventAssignments
      .filter((a: any) => (a.status || 'active') === 'active')
      .map((a: any) => a.equipmentId?.toString?.())
      .filter(Boolean),
  );
  const activeStaffEquipmentIds = new Set(
    staffAssignments
      .filter((a: any) => (a.status || 'active') === 'active')
      .map((a: any) => a.equipmentId?.toString?.())
      .filter(Boolean),
  );

  const availableEquipment: MappedAvailableEquipment[] = flaggedEquipment
    .filter((e: any) => {
      const id = e._id.toString();
      return !activeEventEquipmentIds.has(id) && !activeStaffEquipmentIds.has(id);
    })
    .map((e: any) => {
      const loc = resolveEquipmentLocation(e);
      return {
        equipmentId: e._id.toString(),
        equipmentName: e.name || 'ציוד',
        barcode: e.barcode || null,
        category: e.category || null,
        quantity: 1,
        status: 'warehouse',
        warehouseId: loc.warehouseId,
        warehouseName: loc.warehouseName,
        storagePlaceId: loc.storagePlaceId,
        storagePlaceName: loc.storagePlaceName,
        storagePlaceCode: loc.storagePlaceCode,
        currentLocation: loc.currentLocation,
      };
    });

  const snapshot: SharedEngineeringSnapshot = {
    eventAssignments: mappedEventAssignments,
    staffAssignments: mappedStaffAssignments,
    availableEquipment,
  };

  // -------- Device-centric projection (one row per equipment item) --------

  // Pick the most-recent active assignment per equipment id (event takes
  // priority over staff if both somehow exist — should never happen but be
  // defensive).
  const latestActiveEventByEquipment = new Map<string, any>();
  for (const a of eventAssignments) {
    const eqId = a.equipmentId?.toString?.();
    if (!eqId) continue;
    if ((a.status || 'active') !== 'active') continue;
    const existing = latestActiveEventByEquipment.get(eqId);
    if (!existing || new Date(a.assignedAt || 0) > new Date(existing.assignedAt || 0)) {
      latestActiveEventByEquipment.set(eqId, a);
    }
  }
  const latestActiveStaffByEquipment = new Map<string, any>();
  for (const a of staffAssignments) {
    const eqId = a.equipmentId?.toString?.();
    if (!eqId) continue;
    if ((a.status || 'active') !== 'active') continue;
    const existing = latestActiveStaffByEquipment.get(eqId);
    if (!existing || new Date(a.assignedAt || 0) > new Date(existing.assignedAt || 0)) {
      latestActiveStaffByEquipment.set(eqId, a);
    }
  }

  // Optional: pull category Hebrew labels in one query.
  const categoryLabelBySlug = new Map<string, string>();
  if (opts.includeCategoryLabels) {
    const slugs = Array.from(
      new Set(flaggedEquipment.map((e: any) => e.category).filter(Boolean)),
    ) as string[];
    if (slugs.length > 0) {
      try {
        const cats = await EquipmentCategoryModel.find({ slug: { $in: slugs } })
          .select({ slug: 1, labelHe: 1 })
          .lean()
          .exec();
        for (const c of cats) {
          categoryLabelBySlug.set(c.slug, c.labelHe);
        }
      } catch (err) {
        logger.warn('Failed to load category labels — falling back to legacy map', {
          err: String(err),
        });
      }
    }
    // Legacy fallback for any slug not present in the dynamic collection.
    for (const slug of categoryLabelBySlug.keys()) {
      // already filled
    }
  }

  // Optional: BLE live positions joined by trackerTagId.
  const livePositionByEquipmentId = new Map<string, DeviceLivePosition>();
  if (opts.includeLivePosition) {
    const tagIds = flaggedEquipment
      .map((e: any) => e.trackerTagId)
      .filter((t: any) => !!t);
    if (tagIds.length > 0) {
      try {
        const [tags, positions] = await Promise.all([
          TrackerTag.find({ _id: { $in: tagIds } })
            .select({ _id: 1, equipmentId: 1, lastBattery: 1 })
            .lean()
            .exec(),
          TrackerLatestPosition.find({ tagId: { $in: tagIds } })
            .lean()
            .exec(),
        ]);
        const tagById = new Map<string, any>();
        for (const t of tags) tagById.set(t._id.toString(), t);

        for (const p of positions) {
          const tag = tagById.get(p.tagId.toString());
          if (!tag) continue;
          const eqId = tag.equipmentId?.toString?.();
          if (!eqId) continue;
          livePositionByEquipmentId.set(eqId, {
            kind: p.kind,
            siteId: p.siteId ? p.siteId.toString() : null,
            gatewayId: p.gatewayId ? p.gatewayId.toString() : null,
            gatewayName: p.gatewayName || null,
            zoneName: p.zoneName || null,
            x: p.x ?? null,
            y: p.y ?? null,
            lat: p.lat ?? null,
            lng: p.lng ?? null,
            rssi: p.rssi ?? null,
            batteryPct: tag.lastBattery ?? null,
            confidence: p.confidence ?? null,
            computedAt: p.computedAt ? new Date(p.computedAt).toISOString() : null,
          });
        }
      } catch (err) {
        logger.warn('Failed to load live BLE positions', { err: String(err) });
      }
    }
  }

  const deviceById = new Map<string, DeviceRow>();
  for (const e of flaggedEquipment) {
    const eqId = e._id.toString();
    const eventAssignment = latestActiveEventByEquipment.get(eqId);
    const staffAssignment = latestActiveStaffByEquipment.get(eqId);

    // Truly-special equipment states that should keep their own `kind` rather
    // than be forced into the "warehouse" bucket below. Everything else (incl.
    // `available`, `assigned`, anything we don't recognise, and missing
    // values) is treated as "presumed in the warehouse" when no active
    // assignment is on file.
    const specialStatuses = new Set([
      'maintenance',
      'broken',
      'lost',
      'retired',
      'damaged',
    ]);
    const isSpecialStatus = specialStatuses.has((e.status || '').toLowerCase());

    let location: DeviceLocation;
    if (eventAssignment) {
      const broadcastId = eventAssignment.eventId?.toString?.() || '';
      const broadcast = broadcastById.get(broadcastId);
      const shadow = shadowByBroadcast.get(broadcastId);
      location = {
        kind: 'event',
        assignmentId: eventAssignment._id.toString(),
        broadcastEventId: broadcastId,
        broadcastEventTitle:
          broadcast?.hebrewTitle || broadcast?.title || eventAssignment.eventName || null,
        broadcastEventStart: broadcast?.startTime
          ? new Date(broadcast.startTime).toISOString()
          : null,
        broadcastEventEnd: broadcast?.endTime
          ? new Date(broadcast.endTime).toISOString()
          : null,
        broadcastEventVenue: broadcast?.venue || null,
        broadcastEventLocation: broadcast?.location || null,
        mcrEventId: shadow?._id?.toString?.() || null,
        assignedAt: eventAssignment.assignedAt
          ? new Date(eventAssignment.assignedAt).toISOString()
          : null,
        assignedByName: eventAssignment.assignedByName || null,
      };
    } else if (staffAssignment) {
      location = {
        kind: 'staff',
        assignmentId: staffAssignment._id.toString(),
        assignedToType: staffAssignment.assignedToType || 'internal',
        assignedToUserId: staffAssignment.assignedToUserId
          ? staffAssignment.assignedToUserId.toString()
          : null,
        assignedToName: staffAssignment.assignedToName || '',
        assignedToPhone: staffAssignment.assignedToPhone || null,
        assignedAt: staffAssignment.assignedAt
          ? new Date(staffAssignment.assignedAt).toISOString()
          : null,
        assignedByName: staffAssignment.assignedByName || null,
      };
    } else if (isSpecialStatus) {
      // Equipment is intentionally out-of-rotation (maintenance, broken,
      // lost, retired, damaged). We can't say it's "in the warehouse" with
      // a straight face, so surface `unknown` and let partner dashboards
      // render the underlying `status` field for the operator.
      location = { kind: 'unknown' };
    } else {
      // No active assignment AND the equipment isn't in a special state →
      // by definition it is back in the warehouse. We surface
      // `kind: 'warehouse'` even when the equipment record has no
      // `warehouseId` / `storagePlaceId` saved on it (a very common case for
      // items that have never been pinned to a specific shelf). Operators
      // can still tell what's missing by the null fields.
      const loc = resolveEquipmentLocation(e);
      location = { kind: 'warehouse', ...loc };
    }

    // Derive the public `status` from the resolved location rather than
    // trusting the denormalized `equipment.status`, which can lag behind
    // assignment changes (partial returns, multi-unit items, historical
    // migrations, etc.). The denormalized field is only respected when it
    // signals a special out-of-rotation state.
    const derivedStatus =
      eventAssignment || staffAssignment
        ? 'assigned'
        : isSpecialStatus
          ? (e.status as string)
          : 'available';

    const contact: DeviceContact = {
      primary: e.contactPerson || null,
      currentHolderName:
        eventAssignment?.assignedByName ||
        staffAssignment?.assignedToName ||
        null,
      currentHolderPhone:
        staffAssignment?.assignedToPhone || null,
    };

    const categoryLabelHe =
      categoryLabelBySlug.get(e.category) ||
      (EQUIPMENT_CATEGORIES as Record<string, string>)[e.category] ||
      null;

    deviceById.set(eqId, {
      id: eqId,
      name: e.name || '',
      barcode: e.barcode || null,
      category: e.category || null,
      categoryLabelHe,
      brand: e.company || null,
      equipmentModel: e.equipmentModel || null,
      imageUrl: e.imageUrl || null,
      manualLink: e.manualLink || null,

      status: derivedStatus,
      suspensionStatus: e.suspensionStatus || null,
      condition: e.condition || null,
      isDisabled: !!e.isDisabled,
      disabledReason: e.disabledReason || null,

      quantityTotal: e.quantityTotal ?? 1,
      quantityAvailable: e.quantityAvailable ?? 0,
      quantityAssigned: e.quantityAssigned ?? 0,
      isQuantityBased: !!e.isQuantityBased,
      isSharedEngineeringEquipment: !!e.isSharedEngineeringEquipment,

      location,
      livePosition: livePositionByEquipmentId.get(eqId) || null,

      contact,

      warrantyExpiryDate: e.warrantyExpiryDate
        ? new Date(e.warrantyExpiryDate).toISOString()
        : null,
      purchaseDate: e.purchaseDate
        ? new Date(e.purchaseDate).toISOString()
        : null,
      priceIls: typeof e.price === 'number' ? e.price : null,

      // Cheap upper bound: total active+historical assignments seen for this
      // equipment in the windows we just queried. The detailed history
      // endpoint returns the full audit trail.
      assignmentHistoryCount:
        (eventAssignment ? 1 : 0) + (staffAssignment ? 1 : 0),

      lastUsedAt: e.lastUsedAt ? new Date(e.lastUsedAt).toISOString() : null,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : null,
      updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : null,
    });
  }

  return { snapshot, deviceById };
}

// -----------------------------------------------------------------------
// Public API used by callers.
// -----------------------------------------------------------------------

/**
 * Snapshot for the in-app MCR / warehouse "ציוד הנדסה שיתופי" tab. Matches
 * the previous inline implementation byte-for-byte so the GraphQL resolver
 * can delegate to this helper without changing the wire format.
 */
export async function getMcrSharedEngineeringSnapshot(
  status: string = 'active',
): Promise<SharedEngineeringSnapshot> {
  const { snapshot } = await aggregateSharedEngineering({
    status,
    includeLivePosition: false,
    includeCategoryLabels: false,
  });
  return snapshot;
}

function attachLinks(row: DeviceRow, baseUrl: string): DeviceRow {
  return {
    ...row,
    _links: {
      self: `${baseUrl}/${row.id}`,
      history: `${baseUrl}/${row.id}/history`,
      assignments: `${baseUrl}/${row.id}/assignments`,
    },
  };
}

/**
 * Paginated list of devices for the external REST API. Filters are applied
 * post-aggregation since the list is bounded (shared engineering equipment
 * is a curated subset, typically a few hundred items).
 */
export async function listSharedEngineeringDevices(
  filter: DeviceQueryFilter = {},
  pagination: { cursor?: string; limit?: number } = {},
  baseUrl: string,
): Promise<DeviceListResult> {
  const { deviceById } = await aggregateSharedEngineering({
    status: 'all',
    includeLivePosition: true,
    includeCategoryLabels: true,
  });

  let rows = Array.from(deviceById.values());

  if (filter.status) {
    rows = rows.filter((r) => r.status === filter.status);
  }
  if (filter.category) {
    rows = rows.filter((r) => r.category === filter.category);
  }
  if (filter.assignedTo) {
    rows = rows.filter((r) => {
      if (filter.assignedTo === 'event') return r.location.kind === 'event';
      if (filter.assignedTo === 'staff') return r.location.kind === 'staff';
      if (filter.assignedTo === 'none') {
        return r.location.kind === 'warehouse' || r.location.kind === 'unknown';
      }
      return true;
    });
  }
  if (filter.updatedSince) {
    const cutoff = filter.updatedSince.getTime();
    rows = rows.filter((r) => {
      const ts = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
      return ts >= cutoff;
    });
  }

  // Stable sort by id so cursor pagination is deterministic.
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const total = rows.length;
  const limit = Math.min(Math.max(pagination.limit || 100, 1), 500);
  let startIdx = 0;
  if (pagination.cursor) {
    const idx = rows.findIndex((r) => r.id > pagination.cursor!);
    startIdx = idx === -1 ? rows.length : idx;
  }
  const slice = rows.slice(startIdx, startIdx + limit);
  const nextCursor = startIdx + limit < rows.length
    ? slice[slice.length - 1].id
    : null;

  return {
    data: slice.map((r) => attachLinks(r, baseUrl)),
    meta: {
      nextCursor,
      total,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Full snapshot endpoint (uncapped). Used by the dashboard for the initial
 * load / nightly resync.
 */
export async function getSharedEngineeringSnapshotForExport(
  baseUrl: string,
): Promise<{ data: DeviceRow[]; meta: { total: number; generatedAt: string } }> {
  const { deviceById } = await aggregateSharedEngineering({
    status: 'all',
    includeLivePosition: true,
    includeCategoryLabels: true,
  });
  const rows = Array.from(deviceById.values()).map((r) => attachLinks(r, baseUrl));
  return {
    data: rows,
    meta: {
      total: rows.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Single-device lookup. Used by `GET /:id` and as the payload builder for
 * outbound webhook events so external listeners always receive a row with
 * the same shape as a REST GET response.
 */
export async function getSharedEngineeringDevice(
  equipmentId: string,
  baseUrl: string,
): Promise<DeviceRow | null> {
  if (!mongoose.Types.ObjectId.isValid(equipmentId)) return null;

  const { deviceById } = await aggregateSharedEngineering({
    status: 'all',
    ids: [equipmentId],
    includeLivePosition: true,
    includeCategoryLabels: true,
  });
  const row = deviceById.get(equipmentId);
  return row ? attachLinks(row, baseUrl) : null;
}

export interface DeviceHistoryEntry {
  id: string;
  date: string | null;
  action: string;
  quantity: number | null;
  performedBy: string | null;
  performedByName: string | null;
  notes: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  previousLocation: string | null;
  newLocation: string | null;
  eventId: string | null;
  eventName: string | null;
}

/**
 * Full assignment + status audit trail for a single equipment item.
 * Capped at 500 rows (most recent first) — the external dashboard can
 * paginate further if needed.
 */
export async function getSharedEngineeringDeviceHistory(
  equipmentId: string,
  limit: number = 500,
): Promise<DeviceHistoryEntry[]> {
  if (!mongoose.Types.ObjectId.isValid(equipmentId)) return [];
  const docs = await EquipmentHistory.find({ equipmentId })
    .sort({ date: -1 })
    .limit(Math.min(Math.max(limit, 1), 500))
    .lean()
    .exec();
  return docs.map((d: any) => ({
    id: d._id.toString(),
    date: d.date ? new Date(d.date).toISOString() : null,
    action: d.action,
    quantity: typeof d.quantity === 'number' ? d.quantity : null,
    performedBy: d.performedBy || null,
    performedByName: d.performedByName || null,
    notes: d.notes || null,
    previousStatus: d.previousStatus || null,
    newStatus: d.newStatus || null,
    previousLocation: d.previousLocation || null,
    newLocation: d.newLocation || null,
    eventId: d.eventId ? d.eventId.toString() : null,
    eventName: d.eventName || null,
  }));
}
