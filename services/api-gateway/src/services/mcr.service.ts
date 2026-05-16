import mongoose from 'mongoose';
import { createLogger } from '../utils/logger';

const logger = createLogger('mcr-service');

/**
 * Domain service for Master Control Room (MCR) operations. Owns the
 * activity-row state machine and other MCR-specific business rules so
 * resolvers can stay thin (parse args -> require auth -> call service ->
 * shape DTO).
 */

// Allowed transitions for an MCR activity row. Anything missing is rejected
// so a buggy client can't send a row backwards through the lifecycle.
const ACTIVITY_ROW_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['ready', 'on_air', 'cancelled'],
  ready: ['on_air', 'cancelled'],
  on_air: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function validateActivityRowTransition(from: string | undefined | null, to: string): string[] {
  const errors: string[] = [];
  const f = (from || 'scheduled').toLowerCase();
  const t = (to || '').toLowerCase();
  if (!ACTIVITY_ROW_TRANSITIONS[t]) {
    errors.push(`Unknown MCR activity status: ${to}`);
    return errors;
  }
  if (f === t) return errors;
  const allowed = ACTIVITY_ROW_TRANSITIONS[f] || [];
  if (!allowed.includes(t)) {
    errors.push(`Illegal MCR activity transition: ${from} -> ${to}`);
  }
  return errors;
}

/**
 * Validate inputs to a "go on air" command. Returns blocking errors and
 * advisory warnings — caller decides whether warnings should also block.
 */
export interface GoOnAirInput {
  rowId: string;
  scheduledStart: Date | string;
  channel?: string | null;
  routingPreset?: string | null;
}

export async function validateGoOnAir(input: GoOnAirInput): Promise<{
  ok: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!mongoose.Types.ObjectId.isValid(input.rowId)) {
    errors.push('Invalid activity row ID');
  }
  const start = new Date(input.scheduledStart);
  if (Number.isNaN(start.getTime())) {
    errors.push('Invalid scheduled start time');
  } else {
    const driftMs = Date.now() - start.getTime();
    if (driftMs > 15 * 60 * 1000) {
      warnings.push(`Going on-air ${Math.round(driftMs / 60000)} minutes after scheduled start`);
    }
    if (driftMs < -10 * 60 * 1000) {
      warnings.push(`Going on-air more than 10 minutes early`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Append an entry to the MCR audit log. Best-effort — failures are logged
 * but never propagate so they can't take down a live operation.
 */
export async function logMcrAction(opts: {
  userId: string;
  userName?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { connectMongoDB } = await import('../config/mongodb');
    const conn = await connectMongoDB();
    await conn.collection('mcr_audit_log').insertOne({
      userId: opts.userId,
      userName: opts.userName || 'unknown',
      action: opts.action,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      metadata: opts.metadata || {},
      createdAt: new Date(),
    });
  } catch (err: any) {
    logger.warn('Failed to write MCR audit entry', { error: err.message });
  }
}
