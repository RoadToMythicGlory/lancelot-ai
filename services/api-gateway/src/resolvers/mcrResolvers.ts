import { AuthenticationError, UserInputError } from 'apollo-server-express';
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';
import tzPlugin from 'dayjs/plugin/timezone';
import { config } from '../config';
import MCREvent, { IMCREvent } from '../models/mcrEvent';
import BulletinPost, { IBulletinPost } from '../models/bulletinPost';
import ActivityRow, { IActivityRow } from '../models/activityRow';

dayjs.extend(utcPlugin);
dayjs.extend(tzPlugin);

/**
 * Compute the [startOfDay, endOfDay] window for the org's configured
 * timezone (defaults to Asia/Jerusalem) given any timestamp on that day.
 *
 * The previous implementation used `new Date(arg).setHours(0, 0, 0, 0)`,
 * which silently uses the *server*'s local timezone. On the prod host
 * (EDT, UTC-4), a request for "May 18 in Jerusalem" — which arrives as
 * `2026-05-17T21:00:00.000Z` — would get truncated to May 17 00:00 EDT
 * and the window would end just before the activity row (stored at
 * May 18 04:00 UTC = May 18 00:00 EDT) so MCR Schedule appeared empty
 * for events scheduled in the Israeli evening / night.
 */
function dayWindowInOrgTz(input: string | Date): { startOfDay: Date; endOfDay: Date } {
  const tz = config.TIMEZONE || 'Asia/Jerusalem';
  const day = dayjs(input).tz(tz);
  return {
    startOfDay: day.startOf('day').toDate(),
    endOfDay: day.endOf('day').toDate(),
  };
}
import {
  MCRDailyCheckTemplate,
  MCRDailyCheckEntry,
  IMCRDailyCheckTemplate,
  IMCRDailyCheckEntry,
  ensureDefaultDailyChecks,
} from '../models/mcrDailyCheck';
import MCRExchangeGroup, { IMCRExchangeGroup } from '../models/mcrExchangeGroup';
import { BroadcastEvent } from '../models/broadcast.models';
import { Equipment, EquipmentAssignment } from '../models/equipment.models';
import { InternalEquipmentAssignment } from '../models/internalEquipmentAssignment.models';
import { pubsub } from '../utils/pubsub';
import { requireAuth, requirePermission, withAuth } from '../middleware/auth';
import { Permission } from '../rbac';
import { parseMcrDocument } from '../services/mcrDocumentParser';
import { logMcrAction } from '../services/mcr.service';
import { ensureShadowMcrEventForBroadcast } from '../services/mcrShadowEvent';

// Subscription topics
const MCR_EVENT_CREATED = 'MCR_EVENT_CREATED';
const MCR_EVENT_UPDATED = 'MCR_EVENT_UPDATED';
const MCR_EVENT_DELETED = 'MCR_EVENT_DELETED';
const BULLETIN_POST_CREATED = 'BULLETIN_POST_CREATED';
const BULLETIN_POST_UPDATED = 'BULLETIN_POST_UPDATED';
const BULLETIN_POST_DELETED = 'BULLETIN_POST_DELETED';
const ACTIVITY_ROW_CREATED = 'ACTIVITY_ROW_CREATED';
const ACTIVITY_ROW_UPDATED = 'ACTIVITY_ROW_UPDATED';
const ACTIVITY_ROW_DELETED = 'ACTIVITY_ROW_DELETED';
const MCR_DAILY_CHECK_ENTRY_UPDATED = 'MCR_DAILY_CHECK_ENTRY_UPDATED';
const MCR_DAILY_CHECK_TEMPLATE_CHANGED = 'MCR_DAILY_CHECK_TEMPLATE_CHANGED';
const MCR_EXCHANGE_GROUP_UPDATED = 'MCR_EXCHANGE_GROUP_UPDATED';

// Normalize sub-document arrays sent by the client. The frontend sometimes
// resends previously saved rows verbatim (with their stringified `id`), and
// sometimes sends brand-new rows with `id: undefined`. Mongoose only treats a
// row as the "same" sub-document if `_id` is present.
function normalizeSubDocs<T extends Record<string, any>>(arr: T[] | undefined | null): any[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const { id, _id, ...rest } = item;
    const resolvedId = _id || id;
    if (resolvedId && mongoose.Types.ObjectId.isValid(resolvedId)) {
      return { _id: new mongoose.Types.ObjectId(resolvedId), ...rest };
    }
    return rest;
  });
}

// Map of GraphQL input -> mongoose field updates for an MCR event.
function mapEventInput(input: any): Record<string, any> {
  const out: Record<string, any> = { ...input };
  if (Array.isArray(input.feeds)) out.feeds = normalizeSubDocs(input.feeds);
  if (Array.isArray(input.contacts)) out.contacts = normalizeSubDocs(input.contacts);
  if (Array.isArray(input.outputPlatforms)) {
    out.outputPlatforms = normalizeSubDocs(input.outputPlatforms);
  }
  return out;
}

const resolvers = {
  Query: {
    // MCR Events
    mcrEvents: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);

      // Self-heal: any Broadcast Event inside the requested window that
      // doesn't yet have a shadow MCREvent (because it was created before
      // shadow-events shipped) gets one now. This matches how the
      // `activityRows` resolver back-fills the Schedule tab.
      if (args.start && args.end) {
        try {
          const startDate = new Date(args.start);
          const endDate = new Date(args.end);
          const broadcastEvents = await BroadcastEvent.find({
            $or: [
              { startTime: { $gte: startDate, $lte: endDate } },
              { endTime: { $gte: startDate, $lte: endDate } },
              { startTime: { $lte: startDate }, endTime: { $gte: endDate } },
            ],
          }).select({ _id: 1, title: 1, hebrewTitle: 1, startTime: 1, endTime: 1, channel: 1 });

          if (broadcastEvents.length > 0) {
            const ids = broadcastEvents.map((e) => e._id);
            const existing = await MCREvent.find(
              { broadcastEventId: { $in: ids } },
              { broadcastEventId: 1 },
            );
            const haveShadow = new Set(
              existing.map((e) => e.broadcastEventId?.toString()).filter(Boolean) as string[],
            );
            const missing = broadcastEvents.filter(
              (e) => !haveShadow.has(e._id.toString()),
            );
            for (const ev of missing) {
              await ensureShadowMcrEventForBroadcast(ev as any, context?.user?.userId);
            }
          }
        } catch (err) {
          console.error('[mcrEvents] shadow back-fill failed:', err);
        }
      }

      const query: any = {};
      
      if (args.start && args.end) {
        query.$or = [
          { start: { $gte: args.start, $lte: args.end } },
          { end: { $gte: args.start, $lte: args.end } },
          { start: { $lte: args.start }, end: { $gte: args.end } }
        ];
      }
      
      if (args.broadcastType) {
        query.broadcastType = args.broadcastType;
      }
      
      const limit = Math.min(Math.max(Number(args.limit) || 200, 1), 500);
      const offset = Math.max(Number(args.offset) || 0, 0);
      return await MCREvent.find(query)
        .sort({ start: 1 })
        .skip(offset)
        .limit(limit);
    }),

    mcrEvent: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new Error('Invalid MCR event ID');
      }
      return await MCREvent.findById(args.id);
    }),

    // Bulletin Posts
    mcrBulletinPosts: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);
      const query: any = {};
      
      if (args.departmentId) {
        query.departmentId = args.departmentId;
      } else {
        const db = await context.mongoDb;
        const departmentsCollection = db.collection('departments');
        const mcrDepartment = await departmentsCollection.findOne({ name: 'MCR' });
        if (mcrDepartment) {
          query.departmentId = mcrDepartment._id;
        }
      }
      
      if (args.activeOnly !== false) {
        query.isActive = true;
        query.$or = [
          { untilNewPost: true },
          { expiryDate: { $gt: new Date() } },
          { expiryDate: null }
        ];
      }
      
      const limit = Math.min(Math.max(Number(args.limit) || 200, 1), 500);
      return await BulletinPost.find(query)
        .sort({ createdAt: -1 })
        .limit(limit);
    }),

    mcrBulletinPost: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new Error('Invalid bulletin post ID');
      }
      return await BulletinPost.findById(args.id);
    }),

    // Activity Rows — auto-syncs broadcast events into empty activity rows
    activityRows: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);
      const { startOfDay, endOfDay } = dayWindowInOrgTz(args.date);

      try {
        const broadcastEvents = await BroadcastEvent.find({
          $or: [
            { startTime: { $gte: startOfDay, $lte: endOfDay } },
            { endTime: { $gte: startOfDay, $lte: endOfDay } },
            { startTime: { $lte: startOfDay }, endTime: { $gte: endOfDay } }
          ]
        });

        if (broadcastEvents.length > 0) {
          const broadcastIds = broadcastEvents.map(e => e._id);
          const existingRows = await ActivityRow.find({
            broadcastEventId: { $in: broadcastIds }
          });
          const existingBroadcastIds = new Set(
            existingRows.map(r => r.broadcastEventId?.toString())
          );

          const newRows = broadcastEvents
            .filter(event => !existingBroadcastIds.has(event._id.toString()))
            .map(event => {
              const tz = config.TIMEZONE || 'Asia/Jerusalem';
              const startTime = new Date(event.startTime);
              const endTime = new Date(event.endTime);
              const timeStr = dayjs(startTime).tz(tz).format('HH:mm');
              const endTimeStr = dayjs(endTime).tz(tz).format('HH:mm');

              return {
                date: startOfDay,
                activityName: (event as any).hebrewTitle || event.title || 'אירוע שידור',
                time: timeStr,
                endTime: endTimeStr,
                channel: (event as any).channel || '',
                equipment: '',
                backup: '',
                routing: '',
                notes: '',
                status: 'UNKNOWN',
                isHidden: false,
                isManual: false,
                broadcastEventId: event._id,
                createdBy: context.user.userId,
              };
            });

          if (newRows.length > 0) {
            await ActivityRow.insertMany(newRows);
          }
        }
      } catch (err) {
        console.error('Error syncing broadcast events to activity rows:', err);
      }

      const query: any = {
        date: { $gte: startOfDay, $lte: endOfDay }
      };
      
      if (!args.includeHidden) {
        query.isHidden = { $ne: true };
      }
      
      const limit = Math.min(Math.max(Number(args.limit) || 200, 1), 500);
      return await ActivityRow.find(query)
        .sort({ time: 1 })
        .limit(limit);
    }),

    activityRow: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new Error('Invalid activity row ID');
      }
      return await ActivityRow.findById(args.id);
    }),

    activityRowByBroadcastEvent: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);
      const { broadcastEventId, date } = args;

      if (!mongoose.Types.ObjectId.isValid(broadcastEventId)) {
        throw new Error('Invalid broadcast event ID');
      }
      
      const { startOfDay, endOfDay } = dayWindowInOrgTz(date);

      let row = await ActivityRow.findOne({
        broadcastEventId: new mongoose.Types.ObjectId(broadcastEventId),
        date: { $gte: startOfDay, $lte: endOfDay }
      });
      
      if (!row) {
        const event = await BroadcastEvent.findById(broadcastEventId);
        if (!event) {
          throw new UserInputError('Broadcast event not found');
        }
        
        const tz = config.TIMEZONE || 'Asia/Jerusalem';
        const startTime = new Date(event.startTime);
        const endTime = new Date(event.endTime);
        const timeStr = dayjs(startTime).tz(tz).format('HH:mm');
        const endTimeStr = dayjs(endTime).tz(tz).format('HH:mm');
        
        row = new ActivityRow({
          date: startOfDay,
          activityName: (event as any).hebrewTitle || event.title || 'אירוע שידור',
          time: timeStr,
          endTime: endTimeStr,
          channel: (event as any).channel || '',
          source: '',
          equipment: '',
          backup: '',
          routing: '',
          notes: '',
          status: 'UNKNOWN',
          isHidden: false,
          isManual: false,
          broadcastEventId: event._id,
          createdBy: context.user.userId,
        });
        
        await row.save();
      }
      
      return row;
    }),

    // ===== Daily Checks =====
    mcrDailyCheckTemplates: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);
      await ensureDefaultDailyChecks();
      const query: any = {};
      if (args.activeOnly !== false) query.isActive = true;
      return await MCRDailyCheckTemplate.find(query).sort({ order: 1, name: 1 });
    }),

    mcrDailyCheck: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);
      await ensureDefaultDailyChecks();

      const { startOfDay, endOfDay } = dayWindowInOrgTz(args.date);

      const templates = await MCRDailyCheckTemplate.find({ isActive: true }).sort({ order: 1, name: 1 });

      const existingEntries = await MCRDailyCheckEntry.find({
        date: { $gte: startOfDay, $lte: endOfDay },
      });

      const byTemplate = new Map<string, IMCRDailyCheckEntry>();
      for (const e of existingEntries) {
        byTemplate.set(e.templateId.toString(), e);
      }

      // Ensure every active template has an entry for the day (creating an
      // unchecked one if missing). This makes downstream UI simpler.
      const missingTemplateIds = templates
        .filter((t) => !byTemplate.has(String(t._id)))
        .map((t) => t._id);

      if (missingTemplateIds.length > 0) {
        const inserted = await MCRDailyCheckEntry.insertMany(
          missingTemplateIds.map((id) => ({
            date: startOfDay,
            templateId: id,
            isCompleted: false,
          })),
          { ordered: false },
        ).catch(() => [] as any[]);
        for (const e of inserted) {
          byTemplate.set(e.templateId.toString(), e);
        }
      }

      const entries: IMCRDailyCheckEntry[] = [];
      for (const t of templates) {
        const e = byTemplate.get(String(t._id));
        if (e) {
          (e as any).__template = t;
          entries.push(e);
        }
      }

      const total = entries.length;
      const completed = entries.filter((e) => e.isCompleted).length;
      const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

      return {
        date: startOfDay,
        total,
        completed,
        percentage,
        entries,
      };
    }),

    // ===== External Exchange =====
    mcrExchangeGroups: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);
      const query: any = {};
      if (args.status) query.status = args.status;
      if (args.mcrEventId) {
        if (!mongoose.Types.ObjectId.isValid(args.mcrEventId)) {
          throw new UserInputError('Invalid MCR event ID');
        }
        query.linkedMcrEventIds = new mongoose.Types.ObjectId(args.mcrEventId);
      }
      return await MCRExchangeGroup.find(query).sort({ createdAt: -1 });
    }),

    mcrExchangeGroup: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new UserInputError('Invalid exchange group ID');
      }
      return await MCRExchangeGroup.findById(args.id);
    }),

    // Combined tracking endpoint for the dedicated "ציוד הנדסה שיתופי" MCR
    // tab. Pulls every active allocation of equipment flagged as
    // `isSharedEngineeringEquipment` across two sources:
    //   1. Broadcast event assignments (joined back to their MCR shadow
    //      event via `broadcastEventId` so MCR sees the linked shadow).
    //   2. Internal staff assignments (no event target).
    mcrSharedEngineeringEquipment: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);

      const requestedStatus = typeof args.status === 'string' ? args.status : 'active';
      const includeAll = requestedStatus === 'all';

      // Step 1: find all equipment that is flagged. Selecting just the
      // fields we need keeps this responsive even with 4k+ items.
      const flaggedEquipment = await Equipment.find({ isSharedEngineeringEquipment: true })
        .select({ _id: 1, name: 1, barcode: 1, category: 1 })
        .lean()
        .exec();

      if (flaggedEquipment.length === 0) {
        return { eventAssignments: [], staffAssignments: [] };
      }

      const equipmentIds = flaggedEquipment.map((e) => e._id);
      const equipmentById = new Map<string, any>();
      for (const e of flaggedEquipment) {
        equipmentById.set(e._id.toString(), e);
      }

      // Step 2: pull both assignment types in parallel.
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

      // Step 3: hydrate the linked broadcast events and MCR shadow events
      // referenced by the event assignments.
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
              .select({ _id: 1, title: 1, hebrewTitle: 1, startTime: 1, endTime: 1 })
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

      const mappedEventAssignments = eventAssignments.map((a: any) => {
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
          broadcastEventStart: broadcast?.startTime
            ? new Date(broadcast.startTime)
            : null,
          broadcastEventEnd: broadcast?.endTime
            ? new Date(broadcast.endTime)
            : null,
          mcrEventId: shadow?._id?.toString?.() || null,
          mcrEventTitle: shadow?.title || null,
          mcrEventStart: shadow?.start ? new Date(shadow.start) : null,
          mcrEventEnd: shadow?.end ? new Date(shadow.end) : null,
        };
      });

      const mappedStaffAssignments = staffAssignments.map((a: any) => {
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

      const availableEquipment = flaggedEquipment
        .filter((e: any) => {
          const id = e._id.toString();
          return !activeEventEquipmentIds.has(id) && !activeStaffEquipmentIds.has(id);
        })
        .map((e: any) => ({
          equipmentId: e._id.toString(),
          equipmentName: e.name || 'ציוד',
          barcode: e.barcode || null,
          category: e.category || null,
          quantity: 1,
          status: 'warehouse',
        }));

      return {
        eventAssignments: mappedEventAssignments,
        staffAssignments: mappedStaffAssignments,
        availableEquipment,
      };
    }),
  },

  Mutation: {
    // MCR Events
    createMCREvent: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      const mcrEvent = new MCREvent({
        ...mapEventInput(args.input),
        createdBy: context.user.userId
      });
      
      const savedEvent = await mcrEvent.save();
      
      pubsub.publish(MCR_EVENT_CREATED, { mcrEventCreated: savedEvent });
      logMcrAction({
        userId: context.user.userId,
        userName: context.user.displayName,
        action: 'create',
        resourceType: 'MCREvent',
        resourceId: savedEvent.id,
      }).catch(() => undefined);
      
      return savedEvent;
    }),

    updateMCREvent: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new Error('Invalid MCR event ID');
      }
      const mcrEvent = await MCREvent.findById(args.id);
      
      if (!mcrEvent) {
        throw new UserInputError('MCR Event not found');
      }
      
      if (mcrEvent.createdBy.toString() !== context.user!.userId && !context.user!.has(Permission.MCR_ADMIN)) {
        // Allow MCR_MANAGE users to update any event — explicit override for
        // operational use where the original creator may not be on shift.
        if (!context.user!.has(Permission.MCR_MANAGE)) {
          throw new AuthenticationError('Not authorized to update this event');
        }
      }
      
      Object.assign(mcrEvent, mapEventInput(args.input));
      const savedEvent = await mcrEvent.save();
      
      pubsub.publish(MCR_EVENT_UPDATED, { mcrEventUpdated: savedEvent });
      logMcrAction({
        userId: context.user.userId,
        userName: context.user.displayName,
        action: 'update',
        resourceType: 'MCREvent',
        resourceId: savedEvent.id,
      }).catch(() => undefined);
      
      return savedEvent;
    }),

    deleteMCREvent: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new Error('Invalid MCR event ID');
      }
      const mcrEvent = await MCREvent.findById(args.id);
      
      if (!mcrEvent) {
        throw new UserInputError('MCR Event not found');
      }
      
      if (mcrEvent.createdBy.toString() !== context.user!.userId && !context.user!.has(Permission.MCR_ADMIN)) {
        throw new AuthenticationError('Not authorized to delete this event');
      }
      
      await MCREvent.deleteOne({ _id: args.id });
      
      pubsub.publish(MCR_EVENT_DELETED, { mcrEventDeleted: args.id });
      
      return true;
    }),

    // Bulletin Posts
    createMCRBulletinPost: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      const db = await context.mongoDb;
      const departmentsCollection = db.collection('departments');
      const mcrDepartment = await departmentsCollection.findOne({ name: 'MCR' });
      if (!mcrDepartment) {
        throw new UserInputError('MCR department not found');
      }
      
      if (args.input.untilNewPost) {
        await BulletinPost.deactivateUntilNewPosts(mcrDepartment._id);
      }
      
      const bulletinPost = new BulletinPost({
        ...args.input,
        createdBy: context.user.userId,
        departmentId: mcrDepartment._id
      });
      
      const savedPost = await bulletinPost.save();
      
      pubsub.publish(BULLETIN_POST_CREATED, { mcrBulletinPostCreated: savedPost });
      
      return savedPost;
    }),

    updateMCRBulletinPost: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new Error('Invalid bulletin post ID');
      }
      const bulletinPost = await BulletinPost.findById(args.id);
      
      if (!bulletinPost) {
        throw new UserInputError('Bulletin Post not found');
      }
      
      if (bulletinPost.createdBy.toString() !== context.user!.userId && !context.user!.has(Permission.MCR_ADMIN)) {
        throw new AuthenticationError('Not authorized to update this post');
      }
      
      Object.assign(bulletinPost, args.input);
      const savedPost = await bulletinPost.save();
      
      pubsub.publish(BULLETIN_POST_UPDATED, { mcrBulletinPostUpdated: savedPost });
      
      return savedPost;
    }),

    deleteMCRBulletinPost: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new Error('Invalid bulletin post ID');
      }
      const bulletinPost = await BulletinPost.findById(args.id);
      
      if (!bulletinPost) {
        throw new UserInputError('Bulletin Post not found');
      }
      
      if (bulletinPost.createdBy.toString() !== context.user!.userId && !context.user!.has(Permission.MCR_ADMIN)) {
        throw new AuthenticationError('Not authorized to delete this post');
      }
      
      await BulletinPost.deleteOne({ _id: args.id });
      
      pubsub.publish(BULLETIN_POST_DELETED, { mcrBulletinPostDeleted: args.id });
      
      return true;
    }),

    // Activity Rows
    createActivityRow: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      const activityRow = new ActivityRow({
        ...args.input,
        createdBy: context.user.userId
      });
      
      const savedRow = await activityRow.save();
      
      pubsub.publish(ACTIVITY_ROW_CREATED, { activityRowCreated: savedRow });
      
      return savedRow;
    }),

    updateActivityRow: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new Error('Invalid activity row ID');
      }
      const activityRow = await ActivityRow.findById(args.id);
      
      if (!activityRow) {
        throw new UserInputError('Activity Row not found');
      }
      
      Object.assign(activityRow, args.input);
      activityRow.updatedBy = context.user.userId;
      
      const savedRow = await activityRow.save();
      
      pubsub.publish(ACTIVITY_ROW_UPDATED, { activityRowUpdated: savedRow });
      
      return savedRow;
    }),

    /**
     * Batch save for the operational schedule. Accepts a list of rows for a
     * given date — existing rows (by id) are updated, brand-new rows are
     * inserted. Returns the full saved set for the day so the client can
     * replace its local state in one go.
     */
    saveActivityRows: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      const { startOfDay, endOfDay } = dayWindowInOrgTz(args.date);

      const rows = Array.isArray(args.rows) ? args.rows : [];
      const savedIds: string[] = [];

      for (const row of rows) {
        const payload: any = {
          date: startOfDay,
          activityName: row.activityName,
          time: row.time,
          endTime: row.endTime,
          source: row.source,
          equipment: row.equipment,
          backup: row.backup,
          routing: row.routing,
          channel: row.channel,
          broadcastType: row.broadcastType,
          notes: row.notes,
          status: row.status,
          isHidden: row.isHidden ?? false,
          isManual: row.isManual ?? !row.broadcastEventId,
          broadcastEventId: row.broadcastEventId,
          updatedBy: context.user.userId,
        };

        if (row.id && mongoose.Types.ObjectId.isValid(row.id)) {
          const existing = await ActivityRow.findById(row.id);
          if (existing) {
            Object.assign(existing, payload);
            const s = await existing.save();
            savedIds.push(s.id);
            continue;
          }
        }

        const created = await ActivityRow.create({
          ...payload,
          createdBy: context.user.userId,
        });
        savedIds.push(created.id);
      }

      const finalRows = await ActivityRow.find({
        date: { $gte: startOfDay, $lte: endOfDay },
      }).sort({ time: 1 });

      // Best-effort publish. Subscriptions are still global so consumers will
      // dedupe on the client.
      finalRows.forEach((r) => pubsub.publish(ACTIVITY_ROW_UPDATED, { activityRowUpdated: r }));

      logMcrAction({
        userId: context.user.userId,
        userName: context.user.displayName,
        action: 'bulk-save',
        resourceType: 'ActivityRow',
        metadata: { date: startOfDay.toISOString(), count: savedIds.length },
      }).catch(() => undefined);

      return finalRows;
    }),

    deleteActivityRow: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_ADMIN);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new Error('Invalid activity row ID');
      }
      const activityRow = await ActivityRow.findById(args.id);
      
      if (!activityRow) {
        throw new UserInputError('Activity Row not found');
      }
      
      await ActivityRow.deleteOne({ _id: args.id });
      
      pubsub.publish(ACTIVITY_ROW_DELETED, { activityRowDeleted: args.id });
      
      return true;
    }),

    hideActivityRow: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new Error('Invalid activity row ID');
      }
      const activityRow = await ActivityRow.findById(args.id);
      
      if (!activityRow) {
        throw new UserInputError('Activity Row not found');
      }
      
      activityRow.isHidden = true;
      activityRow.updatedBy = context.user.userId;
      
      const savedRow = await activityRow.save();
      
      pubsub.publish(ACTIVITY_ROW_UPDATED, { activityRowUpdated: savedRow });
      
      return savedRow;
    }),

    // ===== Daily Checks =====
    createMCRDailyCheckTemplate: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_ADMIN);
      const created = await MCRDailyCheckTemplate.create({
        name: args.input.name,
        description: args.input.description,
        order: args.input.order ?? (await MCRDailyCheckTemplate.countDocuments()) + 1,
        isActive: true,
        isDefault: false,
        createdBy: context.user.userId,
      });
      pubsub.publish(MCR_DAILY_CHECK_TEMPLATE_CHANGED, { mcrDailyCheckTemplateChanged: created });
      return created;
    }),

    updateMCRDailyCheckTemplate: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_ADMIN);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new UserInputError('Invalid template ID');
      }
      const tmpl = await MCRDailyCheckTemplate.findById(args.id);
      if (!tmpl) throw new UserInputError('Daily check template not found');
      Object.assign(tmpl, args.input);
      const saved = await tmpl.save();
      pubsub.publish(MCR_DAILY_CHECK_TEMPLATE_CHANGED, { mcrDailyCheckTemplateChanged: saved });
      return saved;
    }),

    deactivateMCRDailyCheckTemplate: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_ADMIN);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new UserInputError('Invalid template ID');
      }
      const tmpl = await MCRDailyCheckTemplate.findById(args.id);
      if (!tmpl) throw new UserInputError('Daily check template not found');
      tmpl.isActive = false;
      const saved = await tmpl.save();
      pubsub.publish(MCR_DAILY_CHECK_TEMPLATE_CHANGED, { mcrDailyCheckTemplateChanged: saved });
      return saved;
    }),

    setMCRDailyCheckCompleted: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(args.templateId)) {
        throw new UserInputError('Invalid template ID');
      }
      const { startOfDay, endOfDay } = dayWindowInOrgTz(args.date);

      let entry = await MCRDailyCheckEntry.findOne({
        date: { $gte: startOfDay, $lte: endOfDay },
        templateId: args.templateId,
      });

      if (!entry) {
        entry = new MCRDailyCheckEntry({
          date: startOfDay,
          templateId: args.templateId,
        });
      }

      entry.isCompleted = !!args.completed;
      if (entry.isCompleted) {
        entry.completedBy = new mongoose.Types.ObjectId(context.user.userId) as any;
        entry.completedAt = new Date();
      } else {
        entry.completedBy = undefined as any;
        entry.completedAt = undefined as any;
      }
      if (typeof args.notes === 'string') entry.notes = args.notes;

      const saved = await entry.save();
      (saved as any).__template = await MCRDailyCheckTemplate.findById(saved.templateId);
      pubsub.publish(MCR_DAILY_CHECK_ENTRY_UPDATED, { mcrDailyCheckEntryUpdated: saved });
      return saved;
    }),

    // ===== External Exchange =====
    createMCRExchangeGroup: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      const linkedIds: mongoose.Types.ObjectId[] = [];
      if (args.input.linkedMcrEventId) {
        if (!mongoose.Types.ObjectId.isValid(args.input.linkedMcrEventId)) {
          throw new UserInputError('Invalid MCR event ID');
        }
        linkedIds.push(new mongoose.Types.ObjectId(args.input.linkedMcrEventId));
      }
      const group = await MCRExchangeGroup.create({
        name: args.input.name,
        description: args.input.description,
        status: 'DRAFT',
        linkedMcrEventIds: linkedIds,
        createdBy: context.user.userId,
      });

      if (args.input.linkedMcrEventId) {
        const updatedEvent = await MCREvent.findOneAndUpdate(
          { _id: args.input.linkedMcrEventId },
          { $addToSet: { exchangeGroupIds: group.id } },
          { new: true },
        );
        if (updatedEvent) {
          pubsub.publish(MCR_EVENT_UPDATED, { mcrEventUpdated: updatedEvent });
        }
      }

      pubsub.publish(MCR_EXCHANGE_GROUP_UPDATED, { mcrExchangeGroupUpdated: group });
      return group;
    }),

    updateMCRExchangeGroup: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new UserInputError('Invalid exchange group ID');
      }
      const group = await MCRExchangeGroup.findById(args.id);
      if (!group) throw new UserInputError('Exchange group not found');
      Object.assign(group, args.input);
      const saved = await group.save();
      pubsub.publish(MCR_EXCHANGE_GROUP_UPDATED, { mcrExchangeGroupUpdated: saved });
      return saved;
    }),

    closeMCRExchangeGroup: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(args.id)) {
        throw new UserInputError('Invalid exchange group ID');
      }
      const group = await MCRExchangeGroup.findById(args.id);
      if (!group) throw new UserInputError('Exchange group not found');
      group.status = 'CLOSED';
      const saved = await group.save();
      pubsub.publish(MCR_EXCHANGE_GROUP_UPDATED, { mcrExchangeGroupUpdated: saved });
      return saved;
    }),

    linkMCRExchangeGroupToEvent: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (
        !mongoose.Types.ObjectId.isValid(args.groupId) ||
        !mongoose.Types.ObjectId.isValid(args.mcrEventId)
      ) {
        throw new UserInputError('Invalid IDs');
      }
      const group = await MCRExchangeGroup.findById(args.groupId);
      if (!group) throw new UserInputError('Exchange group not found');
      const eventId = new mongoose.Types.ObjectId(args.mcrEventId);
      if (!group.linkedMcrEventIds.find((id) => id.toString() === eventId.toString())) {
        group.linkedMcrEventIds.push(eventId);
      }
      const saved = await group.save();

      const updatedEvent = await MCREvent.findOneAndUpdate(
        { _id: eventId },
        { $addToSet: { exchangeGroupIds: saved.id } },
        { new: true },
      );
      if (updatedEvent) {
        pubsub.publish(MCR_EVENT_UPDATED, { mcrEventUpdated: updatedEvent });
      }
      pubsub.publish(MCR_EXCHANGE_GROUP_UPDATED, { mcrExchangeGroupUpdated: saved });

      return saved;
    }),

    unlinkMCRExchangeGroupFromEvent: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (
        !mongoose.Types.ObjectId.isValid(args.groupId) ||
        !mongoose.Types.ObjectId.isValid(args.mcrEventId)
      ) {
        throw new UserInputError('Invalid IDs');
      }
      const group = await MCRExchangeGroup.findById(args.groupId);
      if (!group) throw new UserInputError('Exchange group not found');
      group.linkedMcrEventIds = group.linkedMcrEventIds.filter(
        (id) => id.toString() !== args.mcrEventId,
      );
      const saved = await group.save();

      const updatedEvent = await MCREvent.findOneAndUpdate(
        { _id: args.mcrEventId },
        { $pull: { exchangeGroupIds: saved.id } },
        { new: true },
      );
      if (updatedEvent) {
        pubsub.publish(MCR_EVENT_UPDATED, { mcrEventUpdated: updatedEvent });
      }
      pubsub.publish(MCR_EXCHANGE_GROUP_UPDATED, { mcrExchangeGroupUpdated: saved });

      return saved;
    }),

    acceptMCRExchangeUpload: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(args.groupId)) {
        throw new UserInputError('Invalid exchange group ID');
      }
      const group = await MCRExchangeGroup.findById(args.groupId);
      if (!group) throw new UserInputError('Exchange group not found');
      const upload = group.pendingUploads.find(
        (u: any) => u._id?.toString() === args.uploadId,
      );
      if (!upload) throw new UserInputError('Upload not found');
      upload.isAccepted = true;
      upload.acceptedAt = new Date();
      upload.acceptedBy = new mongoose.Types.ObjectId(context.user.userId) as any;
      const saved = await group.save();
      pubsub.publish(MCR_EXCHANGE_GROUP_UPDATED, { mcrExchangeGroupUpdated: saved });
      return saved;
    }),

    addMCRExchangeUpload: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(args.groupId)) {
        throw new UserInputError('Invalid exchange group ID');
      }
      const group = await MCRExchangeGroup.findById(args.groupId);
      if (!group) throw new UserInputError('Exchange group not found');
      group.pendingUploads.push({
        fileName: args.fileName,
        uploadedByName: args.uploadedByName || context.user.displayName,
        synopsisTitle: args.synopsisTitle,
        isAccepted: false,
      } as any);
      group.synopsisCount = (group.synopsisCount || 0) + 1;
      const saved = await group.save();
      pubsub.publish(MCR_EXCHANGE_GROUP_UPDATED, { mcrExchangeGroupUpdated: saved });
      return saved;
    }),

    // ===== Document parsing =====
    parseMCRDocument: withAuth(async (_: any, args: any, context: any) => {
      requirePermission(context, Permission.MCR_VIEW);
      const input = args.input;
      const text = typeof input?.content === 'string' ? input.content : '';
      const lookFor: ('FEED' | 'PLATFORM')[] =
        Array.isArray(input?.lookFor) && input.lookFor.length > 0
          ? input.lookFor
          : ['FEED', 'PLATFORM'];
      const { feeds, platforms } = parseMcrDocument(text, lookFor);
      return {
        feeds,
        platforms,
        itemCount: feeds.length + platforms.length,
      };
    }),
  },

  Subscription: {
    mcrEventCreated: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuth(context);
        requirePermission(context, Permission.MCR_VIEW);
        return pubsub.asyncIterator([MCR_EVENT_CREATED]);
      }
    },
    mcrEventUpdated: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuth(context);
        requirePermission(context, Permission.MCR_VIEW);
        return pubsub.asyncIterator([MCR_EVENT_UPDATED]);
      }
    },
    mcrEventDeleted: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuth(context);
        requirePermission(context, Permission.MCR_VIEW);
        return pubsub.asyncIterator([MCR_EVENT_DELETED]);
      }
    },

    mcrBulletinPostCreated: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuth(context);
        requirePermission(context, Permission.MCR_VIEW);
        return pubsub.asyncIterator([BULLETIN_POST_CREATED]);
      }
    },
    mcrBulletinPostUpdated: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuth(context);
        requirePermission(context, Permission.MCR_VIEW);
        return pubsub.asyncIterator([BULLETIN_POST_UPDATED]);
      }
    },
    mcrBulletinPostDeleted: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuth(context);
        requirePermission(context, Permission.MCR_VIEW);
        return pubsub.asyncIterator([BULLETIN_POST_DELETED]);
      }
    },

    activityRowCreated: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuth(context);
        requirePermission(context, Permission.MCR_VIEW);
        return pubsub.asyncIterator([ACTIVITY_ROW_CREATED]);
      }
    },
    activityRowUpdated: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuth(context);
        requirePermission(context, Permission.MCR_VIEW);
        return pubsub.asyncIterator([ACTIVITY_ROW_UPDATED]);
      }
    },
    activityRowDeleted: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuth(context);
        requirePermission(context, Permission.MCR_VIEW);
        return pubsub.asyncIterator([ACTIVITY_ROW_DELETED]);
      }
    },

    mcrDailyCheckEntryUpdated: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuth(context);
        requirePermission(context, Permission.MCR_VIEW);
        return pubsub.asyncIterator([MCR_DAILY_CHECK_ENTRY_UPDATED]);
      },
    },
    mcrDailyCheckTemplateChanged: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuth(context);
        requirePermission(context, Permission.MCR_VIEW);
        return pubsub.asyncIterator([MCR_DAILY_CHECK_TEMPLATE_CHANGED]);
      },
    },
    mcrExchangeGroupUpdated: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuth(context);
        requirePermission(context, Permission.MCR_VIEW);
        return pubsub.asyncIterator([MCR_EXCHANGE_GROUP_UPDATED]);
      },
    },
  },

  // Field resolvers
  MCREvent: {
    createdBy: async (parent: IMCREvent, _: any, context: any) => {
      if (parent.createdBy && typeof parent.createdBy === 'object' && (parent.createdBy as any).email) {
        return parent.createdBy;
      }
      const db = await context.mongoDb;
      const usersCollection = db.collection('users');
      return await usersCollection.findOne({ _id: parent.createdBy });
    },
    feeds: (parent: IMCREvent) =>
      (parent.feeds || []).map((f: any) => ({
        id: f._id ? f._id.toString() : undefined,
        ...(f.toObject ? f.toObject() : f),
      })),
    contacts: (parent: IMCREvent) =>
      (parent.contacts || []).map((c: any) => ({
        id: c._id ? c._id.toString() : undefined,
        ...(c.toObject ? c.toObject() : c),
      })),
    outputPlatforms: (parent: IMCREvent) =>
      (parent.outputPlatforms || []).map((p: any) => ({
        id: p._id ? p._id.toString() : undefined,
        ...(p.toObject ? p.toObject() : p),
      })),
    preparationStatus: (parent: IMCREvent) => parent.preparationStatus || 'NOT_STARTED',
  },

  MCRBulletinPost: {
    createdBy: async (parent: IBulletinPost, _: any, context: any) => {
      if (parent.createdBy && typeof parent.createdBy === 'object') {
        return parent.createdBy;
      }
      const db = await context.mongoDb;
      const usersCollection = db.collection('users');
      return await usersCollection.findOne({ _id: parent.createdBy });
    }
  },

  ActivityRow: {
    createdBy: async (parent: IActivityRow, _: any, context: any) => {
      if (parent.createdBy && typeof parent.createdBy === 'object') {
        return parent.createdBy;
      }
      const db = await context.mongoDb;
      const usersCollection = db.collection('users');
      return await usersCollection.findOne({ _id: parent.createdBy });
    },
    updatedBy: async (parent: IActivityRow, _: any, context: any) => {
      if (!parent.updatedBy) return null;
      if (parent.updatedBy && typeof parent.updatedBy === 'object') {
        return parent.updatedBy;
      }
      const db = await context.mongoDb;
      const usersCollection = db.collection('users');
      return await usersCollection.findOne({ _id: parent.updatedBy });
    },
    warehouseEquipment: async (parent: IActivityRow) => {
      if (!parent.broadcastEventId) return [];
      try {
        const assignments = await EquipmentAssignment.find({
          eventId: parent.broadcastEventId,
          status: 'active'
        }).exec();
        
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
        console.error('Error fetching warehouse equipment for activity row:', error);
        return [];
      }
    }
  },

  MCRDailyCheckEntry: {
    template: async (parent: any, _: any, context: any) => {
      if (parent.__template) return parent.__template;
      if (parent.templateId && typeof parent.templateId === 'object' && (parent.templateId as any).name) {
        return parent.templateId;
      }
      return await MCRDailyCheckTemplate.findById(parent.templateId);
    },
    completedBy: async (parent: IMCRDailyCheckEntry, _: any, context: any) => {
      if (!parent.completedBy) return null;
      if (parent.completedBy && typeof parent.completedBy === 'object' && (parent.completedBy as any).email) {
        return parent.completedBy;
      }
      const db = await context.mongoDb;
      const usersCollection = db.collection('users');
      return await usersCollection.findOne({ _id: parent.completedBy });
    },
  },

  MCRExchangeGroup: {
    createdBy: async (parent: IMCRExchangeGroup, _: any, context: any) => {
      if (!parent.createdBy) return null;
      if (parent.createdBy && typeof parent.createdBy === 'object' && (parent.createdBy as any).email) {
        return parent.createdBy;
      }
      const db = await context.mongoDb;
      const usersCollection = db.collection('users');
      return await usersCollection.findOne({ _id: parent.createdBy });
    },
    linkedMcrEventIds: (parent: IMCRExchangeGroup) =>
      (parent.linkedMcrEventIds || []).map((id: any) => id.toString()),
    pendingUploads: (parent: IMCRExchangeGroup) =>
      (parent.pendingUploads || []).map((u: any) => ({
        id: u._id ? u._id.toString() : undefined,
        ...(u.toObject ? u.toObject() : u),
      })),
  },

  MCREventExchangeGroup: {},
};

export const mcrResolvers = resolvers;
