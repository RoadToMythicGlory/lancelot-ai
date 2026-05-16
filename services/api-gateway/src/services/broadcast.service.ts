import mongoose from 'mongoose';
import { BroadcastEvent } from '../models/broadcast.models';
import { EquipmentAssignment } from '../models/equipment.models';
import { createLogger } from '../utils/logger';

const logger = createLogger('broadcast-service');

/**
 * Result of a broadcast pre-flight validation pass. `errors` are blocking
 * (fail the operation), `warnings` are advisory (surface to operator).
 */
export interface PreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

interface PreflightInput {
  eventId?: string;
  /** If updating an existing event, the event being updated (skipped from overlap checks). */
  excludeEventId?: string;
  title: string;
  startTime: Date | string;
  endTime: Date | string;
  channel?: string | null;
  routingPreset?: string | null;
  status?: string | null;
  departmentId?: string | null;
  equipmentList?: Array<{ equipmentId?: string; quantity?: number }>;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Run a set of pre-save validations against a broadcast event. Catches the
 * most common operational mistakes:
 *   - inverted or missing time range
 *   - duplicate assignments on the same channel & overlapping window
 *   - overlapping routing-preset reservations
 *   - missing equipment confirmation when status moves to "confirmed"
 *   - incomplete ingest assignments
 *
 * Designed to be cheap enough to run on every create/update mutation.
 */
export async function preflightBroadcastEvent(input: PreflightInput): Promise<PreflightResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const start = toDate(input.startTime);
  const end = toDate(input.endTime);

  if (!input.title || input.title.trim().length === 0) {
    errors.push('Event title is required');
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    errors.push('startTime and endTime must be valid dates');
  } else if (end <= start) {
    errors.push('endTime must be after startTime');
  } else if (end.getTime() - start.getTime() > 24 * 60 * 60 * 1000 * 14) {
    warnings.push('Event spans more than 14 days — double-check the dates');
  }

  // Overlap check on the same channel — broadcasters can rarely run two
  // events on the same output simultaneously. We treat this as a warning
  // unless the status is "confirmed", in which case it's an error.
  if (input.channel && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    try {
      const filter: any = {
        channel: input.channel,
        status: { $nin: ['cancelled', 'completed'] },
        $and: [{ startTime: { $lt: end } }, { endTime: { $gt: start } }],
      };
      if (input.excludeEventId && mongoose.Types.ObjectId.isValid(input.excludeEventId)) {
        filter._id = { $ne: new mongoose.Types.ObjectId(input.excludeEventId) };
      }
      const conflicts = await BroadcastEvent.find(filter)
        .select('_id title startTime endTime status')
        .limit(5)
        .lean();
      if (conflicts.length > 0) {
        const msg = `Overlapping event(s) on channel "${input.channel}": ${conflicts
          .map((c: any) => `${c.title} (${new Date(c.startTime).toISOString()})`)
          .join('; ')}`;
        if ((input.status || '').toLowerCase() === 'confirmed') {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }
    } catch (err: any) {
      logger.warn('Channel overlap check failed', { error: err.message });
    }
  }

  // Routing preset overlap (same preset, overlapping window) — almost always
  // a misconfiguration when two events share the same physical routing.
  if (input.routingPreset && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    try {
      const filter: any = {
        routingPreset: input.routingPreset,
        status: { $nin: ['cancelled', 'completed'] },
        $and: [{ startTime: { $lt: end } }, { endTime: { $gt: start } }],
      };
      if (input.excludeEventId && mongoose.Types.ObjectId.isValid(input.excludeEventId)) {
        filter._id = { $ne: new mongoose.Types.ObjectId(input.excludeEventId) };
      }
      const conflicts = await BroadcastEvent.find(filter)
        .select('_id title')
        .limit(5)
        .lean();
      if (conflicts.length > 0) {
        warnings.push(
          `Routing preset "${input.routingPreset}" already used on overlapping event(s): ${conflicts
            .map((c: any) => c.title)
            .join('; ')}`
        );
      }
    } catch (err: any) {
      logger.warn('Routing overlap check failed', { error: err.message });
    }
  }

  // Equipment confirmation: if the status is being moved to "confirmed" but
  // there are no committed equipment assignments yet, surface a warning.
  if ((input.status || '').toLowerCase() === 'confirmed' && input.eventId) {
    if (!mongoose.Types.ObjectId.isValid(input.eventId)) {
      errors.push('Invalid eventId for confirmation check');
    } else {
      try {
        const assignmentCount = await EquipmentAssignment.countDocuments({
          eventId: new mongoose.Types.ObjectId(input.eventId),
          status: 'active',
        });
        if (assignmentCount === 0 && (!input.equipmentList || input.equipmentList.length === 0)) {
          warnings.push('Confirming event with no equipment assignments');
        }
      } catch (err: any) {
        logger.warn('Equipment confirmation check failed', { error: err.message });
      }
    }
  }

  // Sanity check incoming equipment list (used by PDF imports / forms).
  if (Array.isArray(input.equipmentList)) {
    for (const item of input.equipmentList) {
      if (item.equipmentId && !mongoose.Types.ObjectId.isValid(item.equipmentId)) {
        errors.push(`Invalid equipmentId in equipmentList: ${item.equipmentId}`);
      }
      if (item.quantity != null && (typeof item.quantity !== 'number' || item.quantity < 0)) {
        errors.push('Equipment list contains a negative or non-numeric quantity');
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate an MCR state transition. Returns a list of errors; empty means OK.
 *
 * Rejects illegal transitions (e.g. completed -> in_progress) so frontend bugs
 * or stale clients can't silently revert an event's lifecycle.
 */
const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  planned: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'planned', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function validateStatusTransition(from: string | undefined | null, to: string): string[] {
  const errors: string[] = [];
  const fromKey = (from || '').toLowerCase();
  const toKey = (to || '').toLowerCase();
  if (!ALLOWED_STATUS_TRANSITIONS[toKey]) {
    errors.push(`Unknown target status: ${to}`);
    return errors;
  }
  if (!fromKey) return errors; // creation, anything is fine
  if (fromKey === toKey) return errors;
  const allowed = ALLOWED_STATUS_TRANSITIONS[fromKey] || [];
  if (!allowed.includes(toKey)) {
    errors.push(`Illegal status transition: ${from} -> ${to}`);
  }
  return errors;
}
