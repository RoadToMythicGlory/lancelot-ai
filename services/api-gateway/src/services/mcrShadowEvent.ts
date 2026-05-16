/**
 * Shadow MCR-event service.
 *
 * Whenever the production team creates a Broadcast Event, we automatically
 * mirror it as an MCREvent so the MCR team sees the planned broadcast in
 * their own workspace. The MCREvent owns its own operational fields
 * (`mcrStartTime` / `mcrEndTime`, feeds, contacts, output platforms,
 * preparation status, notes) — those are independent of the production
 * event timings and can be edited by MCR operators without touching the
 * original Broadcast Event.
 *
 * What stays in sync (broadcast → MCR):
 *   - title, start, end, broadcastType, sourceLabel
 *
 * What does NOT propagate from broadcast → MCR:
 *   - mcrStartTime / mcrEndTime
 *   - feeds, contacts, outputPlatforms, preparationNotes, preparationStatus
 *   - controlStudio, broadcastChannel (production may use the channel
 *     field differently — MCR sets their own routing channel)
 *
 * Deletion: when a Broadcast Event is deleted we keep the MCREvent but
 * clear its link and append a hint to `sourceLabel`, so MCR doesn't lose
 * their preparation work.
 */

import mongoose from 'mongoose';
import MCREvent, { IMCREvent } from '../models/mcrEvent';
import ActivityRow from '../models/activityRow';
import { IBroadcastEvent } from '../models/broadcast.models';
import { pubsub } from '../utils/pubsub';

const MCR_EVENT_CREATED = 'MCR_EVENT_CREATED';
const MCR_EVENT_UPDATED = 'MCR_EVENT_UPDATED';
const ACTIVITY_ROW_CREATED = 'ACTIVITY_ROW_CREATED';
const ACTIVITY_ROW_UPDATED = 'ACTIVITY_ROW_UPDATED';

type LooseBroadcast = Partial<IBroadcastEvent> & {
  id?: string;
  _id?: any;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
};

function toDate(value: Date | string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function getBroadcastId(b: LooseBroadcast): string | null {
  const raw = b.id || b._id;
  if (!raw) return null;
  try {
    return raw.toString();
  } catch {
    return null;
  }
}

/**
 * Idempotently create an MCREvent that mirrors the given broadcast event.
 * If a shadow already exists it is returned untouched (no-op).
 */
export async function ensureShadowMcrEventForBroadcast(
  broadcast: LooseBroadcast,
  createdBy?: string,
): Promise<IMCREvent | null> {
  const broadcastId = getBroadcastId(broadcast);
  if (!broadcastId || !mongoose.Types.ObjectId.isValid(broadcastId)) {
    return null;
  }

  const start = toDate(broadcast.startTime);
  const end = toDate(broadcast.endTime) || start;
  if (!start || !end) {
    // Broadcast events should always have a start time; bail out quietly
    // rather than fail the surrounding mutation.
    return null;
  }

  try {
    const existing = await MCREvent.findOne({ broadcastEventId: broadcastId });
    if (existing) return existing;

    const shadow = new MCREvent({
      title: broadcast.title || broadcast.hebrewTitle || 'אירוע ללא שם',
      start,
      end,
      isMCROnly: false,
      broadcastEventId: new mongoose.Types.ObjectId(broadcastId),
      broadcastChannel: broadcast.channel || undefined,
      preparationStatus: 'NOT_STARTED',
      sourceLabel: 'תכנון שידור',
      feeds: [],
      contacts: [],
      outputPlatforms: [],
      exchangeGroupIds: [],
      createdBy: createdBy
        ? new mongoose.Types.ObjectId(createdBy)
        : new mongoose.Types.ObjectId(),
    });

    const saved = await shadow.save();
    pubsub.publish(MCR_EVENT_CREATED, { mcrEventCreated: saved });

    // Also pre-create a matching ActivityRow so the Schedule tab updates
    // live when production schedules a broadcast (otherwise the row only
    // appears on the next manual fetch of `activityRows`).
    await ensureActivityRowForBroadcast(broadcast, createdBy).catch((err) =>
      console.error('[mcrShadowEvent] Failed to spawn activity row:', err),
    );

    return saved;
  } catch (err) {
    console.error('[mcrShadowEvent] Failed to create shadow MCR event:', err);
    return null;
  }
}

async function ensureActivityRowForBroadcast(
  broadcast: LooseBroadcast,
  createdBy?: string,
): Promise<void> {
  const id = getBroadcastId(broadcast);
  if (!id) return;
  const start = toDate(broadcast.startTime);
  const end = toDate(broadcast.endTime) || start;
  if (!start || !end) return;

  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);

  const existing = await ActivityRow.findOne({ broadcastEventId: id });
  if (existing) return;

  const fmt = (d: Date) =>
    d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });

  const row = await ActivityRow.create({
    date: dayStart,
    activityName: broadcast.hebrewTitle || broadcast.title || 'אירוע שידור',
    time: fmt(start),
    endTime: fmt(end),
    channel: broadcast.channel || '',
    source: '',
    equipment: '',
    backup: '',
    routing: '',
    notes: '',
    status: 'UNKNOWN',
    isHidden: false,
    isManual: false,
    broadcastEventId: id,
    createdBy: createdBy ? new mongoose.Types.ObjectId(createdBy) : new mongoose.Types.ObjectId(),
  });

  pubsub.publish(ACTIVITY_ROW_CREATED, { activityRowCreated: row });
}

/**
 * Propagate non-MCR-specific changes (title, start, end, channel) from the
 * broadcast event to its shadow MCREvent. Operational fields owned by the
 * MCR team (mcrStartTime, feeds, contacts, notes, etc.) are never touched.
 */
export async function syncShadowMcrEventFromBroadcast(
  broadcast: LooseBroadcast,
): Promise<void> {
  const broadcastId = getBroadcastId(broadcast);
  if (!broadcastId || !mongoose.Types.ObjectId.isValid(broadcastId)) return;

  try {
    const shadow = await MCREvent.findOne({ broadcastEventId: broadcastId });
    if (!shadow) {
      // Auto-heal: if the shadow was never created (e.g. event imported
      // before this feature shipped), create it now.
      await ensureShadowMcrEventForBroadcast(broadcast);
      return;
    }

    const updates: Partial<IMCREvent> = {};
    if (broadcast.title && broadcast.title !== shadow.title) {
      updates.title = broadcast.title;
    }
    const start = toDate(broadcast.startTime);
    const end = toDate(broadcast.endTime) || start;
    if (start && start.getTime() !== new Date(shadow.start).getTime()) {
      updates.start = start;
    }
    if (end && end.getTime() !== new Date(shadow.end).getTime()) {
      updates.end = end;
    }
    if (broadcast.channel && broadcast.channel !== shadow.broadcastChannel) {
      // Only mirror the channel when MCR hasn't already overridden it. We
      // detect "untouched" by checking if the current value matches the
      // last-known broadcast channel; absent a better signal we simply
      // skip this on subsequent edits.
      if (!shadow.broadcastChannel) {
        updates.broadcastChannel = broadcast.channel;
      }
    }

    if (Object.keys(updates).length === 0) return;
    Object.assign(shadow, updates);
    const saved = await shadow.save();
    pubsub.publish(MCR_EVENT_UPDATED, { mcrEventUpdated: saved });

    // Keep the linked ActivityRow's name/time/channel mirrored too so the
    // Schedule tab stays in sync without a refresh. We never touch the
    // operator-owned columns (equipment, source, routing, notes, status).
    try {
      const row = await ActivityRow.findOne({ broadcastEventId: broadcastId });
      if (row) {
        const fmt = (d: Date) =>
          d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
        let rowDirty = false;
        if (broadcast.title && row.activityName !== broadcast.title) {
          row.activityName = broadcast.title;
          rowDirty = true;
        }
        const newStart = toDate(broadcast.startTime);
        const newEnd = toDate(broadcast.endTime) || newStart;
        if (newStart && row.time !== fmt(newStart)) {
          row.time = fmt(newStart);
          rowDirty = true;
        }
        if (newEnd && row.endTime !== fmt(newEnd)) {
          row.endTime = fmt(newEnd);
          rowDirty = true;
        }
        if (broadcast.channel && row.channel !== broadcast.channel && !row.channel) {
          row.channel = broadcast.channel;
          rowDirty = true;
        }
        if (rowDirty) {
          const rowSaved = await row.save();
          pubsub.publish(ACTIVITY_ROW_UPDATED, { activityRowUpdated: rowSaved });
        }
      }
    } catch (rowErr) {
      console.error('[mcrShadowEvent] Failed to sync activity row:', rowErr);
    }
  } catch (err) {
    console.error('[mcrShadowEvent] Failed to sync shadow MCR event:', err);
  }
}

/**
 * Soft-detach the shadow MCR event when the underlying broadcast event is
 * deleted. The MCR team often has preparation notes / contacts they want
 * to keep around, so we keep the record and just clear the linkage.
 */
export async function detachShadowMcrEventOnBroadcastDelete(
  broadcastEventId: string,
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(broadcastEventId)) return;

  try {
    const shadow = await MCREvent.findOne({ broadcastEventId });
    if (!shadow) return;
    shadow.broadcastEventId = undefined;
    shadow.sourceLabel = 'אירוע ידני (תכנון השידור נמחק)';
    shadow.isMCROnly = true;
    const saved = await shadow.save();
    pubsub.publish(MCR_EVENT_UPDATED, { mcrEventUpdated: saved });
  } catch (err) {
    console.error('[mcrShadowEvent] Failed to detach shadow MCR event:', err);
  }
}
