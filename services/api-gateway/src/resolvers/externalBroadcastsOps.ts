/**
 * External Broadcasts operations resolvers.
 *
 * Scope rules (locked with the user):
 *   - Never edits broadcast planning fields directly. We only touch
 *     `metadata.departments.externalBroadcasts.customData`.
 *   - Never replaces or rewrites the warehouse manual equipment request
 *     UX. NEVION auto-request *adds* one system-generated line; LiveU
 *     activation only sends an email, it does not allocate stock.
 *   - Never edits people-assignment data; the worker search reads it.
 */
import mongoose from 'mongoose';
import { requireAuth, requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';
import type { Context } from '../types';
import { BroadcastEvent } from '../models/broadcast.models';
import { Equipment } from '../models/equipment.models';
import {
  EquipmentFaultReport,
  type FaultSeverity,
  type FaultStatus,
} from '../models/equipmentFaultReport.models';
import { ExternalBroadcastChangeLog } from '../models/externalBroadcastChangeLog.models';
import { ExternalBroadcastReference } from '../models/externalBroadcastReference.models';
import { sendEmail } from '../services/emailService';
import { createLogger } from '../utils/logger';

const logger = createLogger('external-broadcasts-ops');

// ─── Helpers ───────────────────────────────────────────────────────────────

function shapeFault(doc: any) {
  if (!doc) return null;
  return {
    id: doc._id?.toString() || doc.id,
    equipmentId: doc.equipmentId?.toString(),
    equipmentName: doc.equipmentName || null,
    equipmentBarcode: doc.equipmentBarcode || null,
    eventId: doc.eventId ? doc.eventId.toString() : null,
    eventName: doc.eventName || null,
    description: doc.description,
    severity: doc.severity,
    status: doc.status,
    reportedBy: doc.reportedBy || null,
    reportedByName: doc.reportedByName || null,
    reportedAt: doc.reportedAt?.toISOString
      ? doc.reportedAt.toISOString()
      : doc.reportedAt,
    resolvedBy: doc.resolvedBy || null,
    resolvedByName: doc.resolvedByName || null,
    resolvedAt: doc.resolvedAt
      ? doc.resolvedAt.toISOString
        ? doc.resolvedAt.toISOString()
        : doc.resolvedAt
      : null,
    resolutionNotes: doc.resolutionNotes || null,
    createdAt: doc.createdAt?.toISOString
      ? doc.createdAt.toISOString()
      : doc.createdAt,
    updatedAt: doc.updatedAt?.toISOString
      ? doc.updatedAt.toISOString()
      : doc.updatedAt,
  };
}

function shapeChangeEntry(doc: any) {
  return {
    id: doc._id?.toString() || doc.id,
    eventId: doc.eventId?.toString(),
    field: doc.field,
    previousValue: doc.previousValue ?? null,
    newValue: doc.newValue ?? null,
    changedBy: doc.changedBy || null,
    changedByName: doc.changedByName || null,
    changedAt: doc.changedAt?.toISOString
      ? doc.changedAt.toISOString()
      : doc.changedAt,
  };
}

// Field set that the change log cares about. Anything else inside
// `externalBroadcasts.customData` is metadata-only (crew, equipment list,
// dynamic jobs, ...) and we deliberately skip logging those edits to
// avoid drowning the log in routine save events.
const LOGGED_FIELDS = [
  'assignmentStatus',
  'isDoubleBroadcast',
  'secondaryControlRoomId',
  'secondaryControlRoomName',
  'manualDisplayOrder',
  'controlCheck',
  'documents',
  'finance',
  'nevionRequest',
  'liveuActivation',
  'excludedFromOperations',
  'excludedAt',
  'excludeReason',
];

export async function logExternalBroadcastChange(
  eventId: string,
  previous: any,
  next: any,
  user: { userId?: string | null; displayName?: string | null } | null,
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(eventId)) return;
  const prev = previous?.customData || previous || {};
  const cur = next?.customData || next || {};
  const writes: any[] = [];
  for (const field of LOGGED_FIELDS) {
    const before = prev[field];
    const after = cur[field];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      writes.push({
        eventId: new mongoose.Types.ObjectId(eventId),
        field,
        previousValue: before ?? null,
        newValue: after ?? null,
        changedBy: user?.userId || null,
        changedByName: user?.displayName || null,
        changedAt: new Date(),
      });
    }
  }
  if (writes.length > 0) {
    try {
      await ExternalBroadcastChangeLog.insertMany(writes, { ordered: false });
    } catch (err: any) {
      logger.warn('Failed to write External Broadcasts change log', {
        eventId,
        error: err?.message,
      });
    }
  }
}

// ─── Device-config helpers (NEVION capacity / LiveU ID) ────────────────────

// Either External Broadcasts managers OR warehouse staff may configure the
// shared device capability metadata. Neither alone owns it: EB owns the
// operational meaning, the warehouse owns the inventory.
function requireDeviceConfigPermission(context: Context) {
  const user = requireAuth(context);
  if (
    !user.has(Permission.BROADCAST_MANAGE) &&
    !user.has(Permission.WAREHOUSE_MANAGE)
  ) {
    throw new Error(
      'Missing permission: requires BROADCAST_MANAGE or WAREHOUSE_MANAGE',
    );
  }
  return user;
}

const LIVEU_CATEGORY = 'liveu_kits';

function isLiveuDevice(doc: any): boolean {
  return (
    doc?.category === LIVEU_CATEGORY ||
    /liveu/i.test(doc?.name || '') ||
    !!doc?.liveuInternalId
  );
}

function isNevionDevice(doc: any): boolean {
  return (
    /nevion/i.test(doc?.name || '') ||
    typeof doc?.nevionCameraCapacity === 'number'
  );
}

// A device is available only when it has a real warehouse barcode AND has
// stock. Barcode-less rows are EB-registered kits awaiting warehouse intake.
function deviceIsAvailable(doc: any): boolean {
  const hasBarcode = typeof doc?.barcode === 'string' && doc.barcode.trim().length > 0;
  const qty = typeof doc?.quantityAvailable === 'number' ? doc.quantityAvailable : 0;
  return hasBarcode && qty > 0 && !doc?.isDisabled;
}

function shapeExternalBroadcastDevice(doc: any) {
  const hasBarcode = typeof doc?.barcode === 'string' && doc.barcode.trim().length > 0;
  return {
    id: doc._id?.toString() || doc.id,
    name: doc.name,
    category: doc.category ?? null,
    barcode: doc.barcode || null,
    quantityTotal: doc.quantityTotal ?? null,
    quantityAvailable: doc.quantityAvailable ?? null,
    available: deviceIsAvailable(doc),
    awaitingBarcode: !hasBarcode,
    isNevion: isNevionDevice(doc),
    isLiveu: isLiveuDevice(doc),
    nevionCameraCapacity: doc.nevionCameraCapacity ?? null,
    liveuInternalId: doc.liveuInternalId || null,
  };
}

// ─── Resolvers ─────────────────────────────────────────────────────────────

export const externalBroadcastsOpsResolvers = {
  Query: {
    // NEVION units + LiveU kits for the External Broadcasts device-config
    // screen, including LiveU kits still awaiting a warehouse barcode.
    externalBroadcastDevices: async (_: any, __: unknown, context: Context) => {
      const user = requireAuth(context);
      if (!user.has(Permission.BROADCAST_VIEW) && !user.has(Permission.WAREHOUSE_VIEW)) {
        throw new Error('Missing permission: requires BROADCAST_VIEW or WAREHOUSE_VIEW');
      }
      const docs = await Equipment.find({
        isDisabled: { $ne: true },
        name: { $type: 'string', $ne: '' },
        $or: [
          { category: LIVEU_CATEGORY },
          { name: /liveu/i },
          { name: /nevion/i },
          { liveuInternalId: { $exists: true, $ne: null } },
          { nevionCameraCapacity: { $exists: true, $ne: null } },
        ],
      })
        .select({
          name: 1, category: 1, barcode: 1, quantityTotal: 1,
          quantityAvailable: 1, isDisabled: 1,
          nevionCameraCapacity: 1, liveuInternalId: 1,
        })
        .sort({ name: 1 })
        .lean()
        .exec();
      return docs.map(shapeExternalBroadcastDevice);
    },

    equipmentFaultReports: async (
      _: any,
      args: {
        equipmentId?: string | null;
        eventId?: string | null;
        status?: string | null;
        limit?: number | null;
      },
      context: Context,
    ) => {
      requirePermission(context, Permission.BROADCAST_VIEW);
      const query: any = {};
      if (args.equipmentId && mongoose.Types.ObjectId.isValid(args.equipmentId)) {
        query.equipmentId = new mongoose.Types.ObjectId(args.equipmentId);
      }
      if (args.eventId && mongoose.Types.ObjectId.isValid(args.eventId)) {
        query.eventId = new mongoose.Types.ObjectId(args.eventId);
      }
      if (args.status) {
        query.status = args.status;
      }
      const docs = await EquipmentFaultReport.find(query)
        .sort({ reportedAt: -1 })
        .limit(Math.min(args.limit ?? 200, 1000))
        .lean()
        .exec();
      return docs.map(shapeFault);
    },

    externalBroadcastChangeLog: async (
      _: any,
      args: {
        eventId?: string | null;
        startDate?: string | null;
        endDate?: string | null;
        limit?: number | null;
      },
      context: Context,
    ) => {
      requirePermission(context, Permission.BROADCAST_VIEW);
      const query: any = {};
      if (args.eventId && mongoose.Types.ObjectId.isValid(args.eventId)) {
        query.eventId = new mongoose.Types.ObjectId(args.eventId);
      }
      if (args.startDate || args.endDate) {
        query.changedAt = {};
        if (args.startDate) query.changedAt.$gte = new Date(args.startDate);
        if (args.endDate) query.changedAt.$lte = new Date(args.endDate);
      }
      const docs = await ExternalBroadcastChangeLog.find(query)
        .sort({ changedAt: -1 })
        .limit(Math.min(args.limit ?? 200, 1000))
        .lean()
        .exec();
      return docs.map(shapeChangeEntry);
    },

    externalBroadcastReference: async (
      _: any,
      args: { kind?: string | null; includeInactive?: boolean | null },
      context: Context,
    ) => {
      requirePermission(context, Permission.BROADCAST_VIEW);
      const query: any = {};
      if (args.kind) query.kind = args.kind;
      if (!args.includeInactive) query.isActive = true;
      const docs = await ExternalBroadcastReference.find(query)
        .sort({ kind: 1, name: 1 })
        .lean()
        .exec();
      return docs.map((d: any) => ({
        id: d._id.toString(),
        kind: d.kind,
        name: d.name,
        description: d.description || null,
        broadcastTypeGroup: d.broadcastTypeGroup || null,
        fiberCount: d.fiberCount ?? null,
        fiberPort: d.fiberPort || null,
        fiberPrice: d.fiberPrice ?? null,
        returnFiber: d.returnFiber || null,
        setupTimeMinutes: d.setupTimeMinutes ?? null,
        calculationType: d.calculationType || null,
        extra: d.extra ?? null,
        isActive: d.isActive !== false,
        createdAt: d.createdAt?.toISOString
          ? d.createdAt.toISOString()
          : d.createdAt,
        updatedAt: d.updatedAt?.toISOString
          ? d.updatedAt.toISOString()
          : d.updatedAt,
      }));
    },

    externalBroadcastWorkerAssignments: async (
      _: any,
      args: { query: string; startDate?: string | null; endDate?: string | null },
      context: Context,
    ) => {
      requirePermission(context, Permission.BROADCAST_VIEW);
      const q = (args.query || '').trim().toLowerCase();
      if (!q) return [];
      const dateFilter: any = {};
      if (args.startDate) dateFilter.$gte = new Date(args.startDate);
      if (args.endDate) dateFilter.$lte = new Date(args.endDate);
      const mongoQuery: any = {};
      if (Object.keys(dateFilter).length > 0) {
        mongoQuery.startTime = dateFilter;
      }
      // We only search events that even potentially carry External
      // Broadcasts metadata. Anything else is irrelevant.
      mongoQuery['metadata.departments.externalBroadcasts'] = { $exists: true };
      const events = await BroadcastEvent.find(mongoQuery)
        .select({
          title: 1,
          startTime: 1,
          endTime: 1,
          league: 1,
          channel: 1,
          location: 1,
          metadata: 1,
        })
        .sort({ startTime: 1 })
        .limit(2000)
        .lean()
        .exec();

      const rows: any[] = [];
      for (const ev of events) {
        const cd: any =
          ev?.metadata?.departments?.externalBroadcasts?.customData ||
          ev?.metadata?.departments?.externalBroadcasts ||
          {};
        const crew: any[] = Array.isArray(cd.productionCrew)
          ? cd.productionCrew
          : [];
        const dynamicJobs: any[] = Array.isArray(cd.dynamicJobs)
          ? cd.dynamicJobs
          : [];
        const matchedCrew = crew.filter((c: any) =>
          ((c?.name || '') + ' ' + (c?.userId || '')).toLowerCase().includes(q),
        );
        const matchedJobs = dynamicJobs.filter((j: any) =>
          ((j?.userName || '') + ' ' + (j?.userId || '')).toLowerCase().includes(q),
        );
        if (matchedCrew.length === 0 && matchedJobs.length === 0) continue;

        const baseRow = {
          eventId: ev._id.toString(),
          eventTitle: ev.title || null,
          startTime: ev.startTime?.toISOString
            ? ev.startTime.toISOString()
            : ev.startTime,
          endTime: ev.endTime?.toISOString
            ? ev.endTime.toISOString()
            : ev.endTime,
          league: (ev as any).league || null,
          channel: (ev as any).channel || null,
          location: (ev as any).location || null,
        };
        for (const c of matchedCrew) {
          rows.push({
            ...baseRow,
            workerName: c.name || c.userId || '',
            roleLabel: c.roleLabel || c.role || null,
          });
        }
        for (const j of matchedJobs) {
          rows.push({
            ...baseRow,
            workerName: j.userName || j.userId || '',
            roleLabel: j.roleLabel || j.roleKey || j.departmentCode || null,
          });
        }
      }
      return rows;
    },
  },

  Mutation: {
    createEquipmentFaultReport: async (
      _: any,
      { input }: { input: any },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.BROADCAST_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(input.equipmentId)) {
        throw new Error('Invalid equipmentId');
      }
      const eq = await Equipment.findById(input.equipmentId).lean().exec();
      if (!eq) throw new Error('Equipment not found');

      let eventDoc: any = null;
      if (input.eventId && mongoose.Types.ObjectId.isValid(input.eventId)) {
        eventDoc = await BroadcastEvent.findById(input.eventId)
          .select({ title: 1 })
          .lean()
          .exec();
      }

      const severity: FaultSeverity =
        input.severity && ['minor', 'major', 'critical'].includes(input.severity)
          ? input.severity
          : 'major';

      const doc = await EquipmentFaultReport.create({
        equipmentId: new mongoose.Types.ObjectId(input.equipmentId),
        equipmentName: (eq as any).name,
        equipmentBarcode: (eq as any).barcode,
        eventId: eventDoc ? eventDoc._id : null,
        eventName: eventDoc?.title || null,
        description: input.description || '',
        severity,
        status: 'open',
        reportedBy: (user as any)?.userId || null,
        reportedByName: (user as any)?.displayName || null,
        reportedAt: new Date(),
      });
      return shapeFault(doc.toObject());
    },

    updateEquipmentFaultReport: async (
      _: any,
      { id, input }: { id: string; input: any },
      context: Context,
    ) => {
      requirePermission(context, Permission.BROADCAST_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid fault report id');
      }
      const patch: any = {};
      if (input.description !== undefined) patch.description = input.description;
      if (input.severity !== undefined && ['minor', 'major', 'critical'].includes(input.severity)) {
        patch.severity = input.severity;
      }
      if (input.status !== undefined && ['open', 'in_progress', 'resolved'].includes(input.status)) {
        patch.status = input.status as FaultStatus;
        if (input.status === 'resolved') {
          patch.resolvedAt = new Date();
        }
      }
      const doc = await EquipmentFaultReport.findByIdAndUpdate(id, patch, {
        new: true,
      }).exec();
      if (!doc) throw new Error('Fault report not found');
      return shapeFault(doc.toObject());
    },

    resolveEquipmentFaultReport: async (
      _: any,
      { id, resolutionNotes }: { id: string; resolutionNotes?: string },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.BROADCAST_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid fault report id');
      }
      const doc = await EquipmentFaultReport.findByIdAndUpdate(
        id,
        {
          $set: {
            status: 'resolved' as FaultStatus,
            resolvedAt: new Date(),
            resolvedBy: (user as any)?.userId || null,
            resolvedByName: (user as any)?.displayName || null,
            resolutionNotes: resolutionNotes || null,
          },
        },
        { new: true },
      ).exec();
      if (!doc) throw new Error('Fault report not found');
      return shapeFault(doc.toObject());
    },

    sendLiveUActivationRequest: async (
      _: any,
      args: {
        eventId: string;
        recipient: string;
        kitEquipmentIds: string[];
        extraNotes?: string;
      },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.BROADCAST_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(args.eventId)) {
        throw new Error('Invalid eventId');
      }
      const event = await BroadcastEvent.findById(args.eventId).lean().exec();
      if (!event) throw new Error('Event not found');

      const validKitIds = (args.kitEquipmentIds || [])
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const kits = await Equipment.find({ _id: { $in: validKitIds } })
        .select({ name: 1, liveuInternalId: 1, barcode: 1 })
        .lean()
        .exec();
      const internalIds = kits
        .map((k: any) => k.liveuInternalId)
        .filter((id: any) => typeof id === 'string' && id.length > 0);

      if (internalIds.length === 0) {
        return {
          success: false,
          recipient: args.recipient,
          internalIds: [],
          emailSent: false,
          message: 'אין תעודות זהות פנימיות של LiveU על הציוד שנבחר',
        };
      }

      const start = (event as any).startTime
        ? new Date((event as any).startTime)
        : null;
      const emailSent = await sendEmail(args.recipient, 'liveuActivation', {
        eventTitle: (event as any).title,
        eventName: (event as any).title,
        eventDate: start ? start.toISOString().substring(0, 10) : null,
        eventTime: start ? start.toISOString().substring(11, 16) : null,
        channel: (event as any).channel || null,
        internalIds,
        extraNotes: args.extraNotes || null,
        requestedByName: (user as any)?.displayName || null,
      });

      // Stamp last-sent metadata onto the event.
      try {
        const metadata: any = (event as any).metadata || {};
        if (!metadata.departments) metadata.departments = {};
        if (!metadata.departments.externalBroadcasts) {
          metadata.departments.externalBroadcasts = {};
        }
        const dept = metadata.departments.externalBroadcasts;
        if (!dept.customData) dept.customData = {};
        dept.customData.liveuActivation = {
          ...(dept.customData.liveuActivation || {}),
          selectedKitIds: args.kitEquipmentIds || [],
          selectedInternalIds: internalIds,
          lastEmailSentAt: new Date().toISOString(),
          lastEmailSentBy: (user as any)?.userId || null,
          lastEmailSentByName: (user as any)?.displayName || null,
        };
        await BroadcastEvent.findByIdAndUpdate(args.eventId, { metadata }).exec();
      } catch (err) {
        logger.warn('Failed to stamp LiveU activation metadata on event', {
          eventId: args.eventId,
          error: (err as any)?.message,
        });
      }

      return {
        success: emailSent,
        recipient: args.recipient,
        internalIds,
        emailSent,
        message: emailSent ? 'המייל נשלח בהצלחה' : 'שליחת המייל נכשלה. בדוק הגדרות SMTP בשרת.',
      };
    },

    autoRequestNevion: async (
      _: any,
      { eventId, requiredCameraCount }: { eventId: string; requiredCameraCount: number },
      context: Context,
    ) => {
      requirePermission(context, Permission.BROADCAST_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        throw new Error('Invalid eventId');
      }
      const cameraCount = Math.max(0, Math.floor(requiredCameraCount || 0));
      if (cameraCount <= 0) {
        throw new Error('requiredCameraCount must be > 0');
      }

      // Same-day conflict pool: NEVIONs already auto-selected on another
      // event whose `startTime` falls on the same calendar date as this
      // one.
      const event = await BroadcastEvent.findById(eventId).lean().exec();
      if (!event) throw new Error('Event not found');
      const eventDate = (event as any).startTime
        ? new Date((event as any).startTime)
        : new Date();
      const dayStart = new Date(eventDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(eventDate);
      dayEnd.setHours(23, 59, 59, 999);

      const sameDayEvents = await BroadcastEvent.find({
        _id: { $ne: new mongoose.Types.ObjectId(eventId) },
        startTime: { $gte: dayStart, $lte: dayEnd },
        'metadata.departments.externalBroadcasts.customData.nevionRequest.selectedEquipmentId':
          { $exists: true },
      })
        .select({ metadata: 1 })
        .lean()
        .exec();
      const usedIds = new Set<string>();
      for (const e of sameDayEvents) {
        const id =
          (e as any).metadata?.departments?.externalBroadcasts?.customData
            ?.nevionRequest?.selectedEquipmentId;
        if (id) usedIds.add(String(id));
      }

      // Smallest sufficient NEVION that is enabled, has stock, has no
      // open fault, and was not auto-selected for another event today.
      const candidates = await Equipment.find({
        nevionCameraCapacity: { $gte: cameraCount },
        isDisabled: { $ne: true },
        quantityAvailable: { $gte: 1 },
      })
        .select({ name: 1, nevionCameraCapacity: 1 })
        .sort({ nevionCameraCapacity: 1, name: 1 })
        .lean()
        .exec();

      let selected: any = null;
      for (const c of candidates) {
        if (usedIds.has(String(c._id))) continue;
        const blocked = await EquipmentFaultReport.exists({
          equipmentId: c._id,
          status: { $in: ['open', 'in_progress'] },
        });
        if (blocked) continue;
        selected = c;
        break;
      }

      const metadata: any = (event as any).metadata || {};
      if (!metadata.departments) metadata.departments = {};
      if (!metadata.departments.externalBroadcasts) {
        metadata.departments.externalBroadcasts = {};
      }
      const dept = metadata.departments.externalBroadcasts;
      if (!dept.customData) dept.customData = {};
      const equipmentList: any[] = Array.isArray(dept.customData.equipmentList)
        ? [...dept.customData.equipmentList]
        : [];

      // Remove any previously-generated NEVION line so we never double-add.
      const filtered = equipmentList.filter(
        (l) => !(l && l.generatedBy === 'nevion-auto'),
      );

      if (selected) {
        filtered.push({
          equipmentId: selected._id.toString(),
          equipmentName: selected.name,
          name: selected.name,
          category: 'matrix_components',
          categoryLabel: 'רכיבי מטריצה',
          quantity: 1,
          purpose: `NEVION אוטומטי לשידור מולטי (${cameraCount} מצלמות)`,
          generatedBy: 'nevion-auto',
        });
      }

      dept.customData.equipmentList = filtered;
      dept.customData.nevionRequest = {
        enabled: true,
        requiredCameraCount: cameraCount,
        selectedEquipmentId: selected ? selected._id.toString() : undefined,
        selectedEquipmentName: selected ? selected.name : undefined,
        selectedCapacity: selected ? selected.nevionCameraCapacity : undefined,
        unresolved: !selected,
      };
      await BroadcastEvent.findByIdAndUpdate(eventId, { metadata }).exec();

      return {
        unresolved: !selected,
        selectedEquipmentId: selected ? selected._id.toString() : null,
        selectedEquipmentName: selected ? selected.name : null,
        selectedCapacity: selected ? selected.nevionCameraCapacity : null,
        requiredCameraCount: cameraCount,
        message: selected
          ? `נבחר ${selected.name} (קיבולת ${selected.nevionCameraCapacity} מצלמות)`
          : `לא נמצא NEVION פנוי עם קיבולת >= ${cameraCount} מצלמות שאינו חסום ע"י תקלה או הוקצה כבר באותו היום`,
      };
    },

    upsertExternalBroadcastReference: async (
      _: any,
      { input }: { input: any },
      context: Context,
    ) => {
      requirePermission(context, Permission.BROADCAST_MANAGE);
      const validKinds = [
        'vehicle',
        'trailer',
        'controlRoom',
        'broadcastType',
      ];
      if (!validKinds.includes(input.kind)) {
        throw new Error('Invalid reference kind');
      }
      const payload: any = {
        kind: input.kind,
        name: input.name,
        description: input.description,
        broadcastTypeGroup: input.broadcastTypeGroup,
        fiberCount: input.fiberCount,
        fiberPort: input.fiberPort,
        fiberPrice: input.fiberPrice,
        returnFiber: input.returnFiber,
        setupTimeMinutes: input.setupTimeMinutes,
        calculationType: input.calculationType,
        extra: input.extra,
        isActive: input.isActive !== false,
      };
      let doc: any;
      if (input.id && mongoose.Types.ObjectId.isValid(input.id)) {
        doc = await ExternalBroadcastReference.findByIdAndUpdate(input.id, payload, {
          new: true,
        }).lean();
      } else {
        doc = (await ExternalBroadcastReference.create(payload)).toObject();
      }
      if (!doc) throw new Error('Failed to save reference');
      return {
        id: doc._id.toString(),
        kind: doc.kind,
        name: doc.name,
        description: doc.description || null,
        broadcastTypeGroup: doc.broadcastTypeGroup || null,
        fiberCount: doc.fiberCount ?? null,
        fiberPort: doc.fiberPort || null,
        fiberPrice: doc.fiberPrice ?? null,
        returnFiber: doc.returnFiber || null,
        setupTimeMinutes: doc.setupTimeMinutes ?? null,
        calculationType: doc.calculationType || null,
        extra: doc.extra ?? null,
        isActive: doc.isActive !== false,
        createdAt: doc.createdAt?.toISOString
          ? doc.createdAt.toISOString()
          : doc.createdAt,
        updatedAt: doc.updatedAt?.toISOString
          ? doc.updatedAt.toISOString()
          : doc.updatedAt,
      };
    },

    deleteExternalBroadcastReference: async (
      _: any,
      { id }: { id: string },
      context: Context,
    ) => {
      requirePermission(context, Permission.BROADCAST_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid id');
      }
      const res = await ExternalBroadcastReference.findByIdAndDelete(id).exec();
      return !!res;
    },

    /**
     * Mark events as imported from broadcast planning into External
     * Broadcasts. The flag controls visibility in the External Broadcasts
     * event list — uphold the contract that the user explicitly opts in
     * which events appear there. Idempotent: re-running on an already-
     * imported event is a no-op for that event.
     */
    importBroadcastEventsToExternalBroadcasts: async (
      _: any,
      { eventIds }: { eventIds: string[] },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.BROADCAST_MANAGE);
      const valid = (eventIds || []).filter((id) =>
        mongoose.Types.ObjectId.isValid(id),
      );
      if (valid.length === 0) return 0;
      const now = new Date();
      let imported = 0;
      for (const evId of valid) {
        const event = await BroadcastEvent.findById(evId).lean().exec();
        if (!event) continue;
        const metadata: any = (event as any).metadata || {};
        if (!metadata.departments) metadata.departments = {};
        if (!metadata.departments.externalBroadcasts) {
          metadata.departments.externalBroadcasts = {};
        }
        const dept = metadata.departments.externalBroadcasts;
        if (!dept.customData) dept.customData = {};
        const wasImported = !!dept.customData.importedFromPlanning;
        dept.customData.importedFromPlanning = true;
        dept.customData.importedAt = now.toISOString();
        dept.customData.importedBy = (user as any)?.userId || null;
        dept.customData.importedByName = (user as any)?.displayName || null;
        await BroadcastEvent.findByIdAndUpdate(evId, { metadata }).exec();
        if (!wasImported) imported += 1;
      }
      return imported;
    },

    /**
     * Inverse of import — clears the imported flag so the event no
     * longer appears in the External Broadcasts list. Does NOT delete
     * any saved operational metadata; the data stays put in case the
     * operator wants to re-import the event later.
     */
    unimportBroadcastEventsFromExternalBroadcasts: async (
      _: any,
      { eventIds }: { eventIds: string[] },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.BROADCAST_MANAGE);
      const valid = (eventIds || []).filter((id) =>
        mongoose.Types.ObjectId.isValid(id),
      );
      if (valid.length === 0) return 0;
      const now = new Date();
      let unimported = 0;
      for (const evId of valid) {
        const event = await BroadcastEvent.findById(evId).lean().exec();
        if (!event) continue;
        const metadata: any = (event as any).metadata || {};
        const dept = metadata?.departments?.externalBroadcasts;
        if (!dept?.customData?.importedFromPlanning) continue;
        dept.customData.importedFromPlanning = false;
        dept.customData.unimportedAt = now.toISOString();
        dept.customData.unimportedBy = (user as any)?.userId || null;
        await BroadcastEvent.findByIdAndUpdate(evId, { metadata }).exec();
        unimported += 1;
      }
      return unimported;
    },

    // ─── Device configuration (NEVION capacity / LiveU ID) ───────────────
    setNevionCameraCapacity: async (
      _: any,
      { equipmentId, capacity }: { equipmentId: string; capacity?: number | null },
      context: Context,
    ) => {
      requireDeviceConfigPermission(context);
      if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
        throw new Error('Invalid equipment id');
      }
      const value =
        typeof capacity === 'number' && capacity >= 0 ? Math.floor(capacity) : null;
      const updated = await Equipment.findByIdAndUpdate(
        equipmentId,
        value === null
          ? { $unset: { nevionCameraCapacity: '' } }
          : { $set: { nevionCameraCapacity: value } },
        { new: true },
      )
        .lean()
        .exec();
      if (!updated) throw new Error('Equipment not found');
      return shapeExternalBroadcastDevice(updated);
    },

    setLiveuInternalId: async (
      _: any,
      { equipmentId, liveuInternalId }: { equipmentId: string; liveuInternalId?: string | null },
      context: Context,
    ) => {
      requireDeviceConfigPermission(context);
      if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
        throw new Error('Invalid equipment id');
      }
      const value = (liveuInternalId || '').trim();
      const updated = await Equipment.findByIdAndUpdate(
        equipmentId,
        value
          ? { $set: { liveuInternalId: value } }
          : { $unset: { liveuInternalId: '' } },
        { new: true },
      )
        .lean()
        .exec();
      if (!updated) throw new Error('Equipment not found');
      return shapeExternalBroadcastDevice(updated);
    },

    // Register a new LiveU kit from External Broadcasts. The item is created
    // WITHOUT a barcode, so it is unavailable in the warehouse (hidden from
    // the equipment picker, quantityAvailable forced to 0) until warehouse
    // staff assign a barcode through the normal equipment editor.
    registerLiveuDevice: async (
      _: any,
      { input }: { input: { name: string; liveuInternalId?: string | null; company?: string | null; equipmentModel?: string | null } },
      context: Context,
    ) => {
      requireDeviceConfigPermission(context);
      const name = (input?.name || '').trim();
      if (!name) throw new Error('יש להזין שם ערכת LiveU');
      const equipment = new Equipment({
        name,
        category: LIVEU_CATEGORY,
        // No barcode: warehouse assigns it later. quantityAvailable stays 0
        // so the kit can't be picked onto an event until then.
        status: 'maintenance',
        condition: 'good',
        quantityTotal: 1,
        quantityAvailable: 0,
        quantityAssigned: 0,
        isQuantityBased: false,
        isSharedEngineeringEquipment: false,
        company: input?.company || undefined,
        equipmentModel: input?.equipmentModel || undefined,
        liveuInternalId: (input?.liveuInternalId || '').trim() || undefined,
        lastUsedAt: new Date(),
      });
      const saved = await equipment.save();
      return shapeExternalBroadcastDevice(saved.toObject());
    },

    reorderExternalBroadcastEvents: async (
      _: any,
      { date, eventIds }: { date: string; eventIds: string[] },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.BROADCAST_MANAGE);
      const valid = (eventIds || []).filter((id) =>
        mongoose.Types.ObjectId.isValid(id),
      );
      const now = new Date();
      for (let i = 0; i < valid.length; i++) {
        const evId = valid[i];
        const event = await BroadcastEvent.findById(evId).lean().exec();
        if (!event) continue;
        const metadata: any = (event as any).metadata || {};
        if (!metadata.departments) metadata.departments = {};
        if (!metadata.departments.externalBroadcasts) {
          metadata.departments.externalBroadcasts = {};
        }
        const dept = metadata.departments.externalBroadcasts;
        if (!dept.customData) dept.customData = {};
        dept.customData.manualDisplayOrder = i + 1;
        dept.customData.manualOrderUpdatedAt = now.toISOString();
        await BroadcastEvent.findByIdAndUpdate(evId, { metadata }).exec();
      }
      // Best-effort audit entry summarizing the reorder.
      try {
        await ExternalBroadcastChangeLog.create({
          eventId: new mongoose.Types.ObjectId(valid[0] || '000000000000000000000000'),
          field: 'manualDisplayOrder.batch',
          previousValue: null,
          newValue: { date, eventIds: valid },
          changedBy: (user as any)?.userId || null,
          changedByName: (user as any)?.displayName || null,
          changedAt: now,
        });
      } catch {
        // ignore
      }
      return true;
    },
  },
};
