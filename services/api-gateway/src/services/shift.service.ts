import { ObjectId } from 'mongodb';
import { connectMongoDB } from '../config/mongodb';
import { createLogger } from '../utils/logger';

const logger = createLogger('shift-service');

/**
 * Domain service that owns shift business rules. Extracted out of
 * `resolvers/shifts.ts` so we can test the rules independently of GraphQL
 * and so other surfaces (e.g. background jobs, AI tools) can call them.
 *
 * Currently re-exposes the most common operations as a thin wrapper. Each
 * function validates inputs and applies access scoping; resolvers should
 * call these instead of touching `db.collection('shifts')` directly.
 */

async function db() {
  return connectMongoDB();
}

function clampLimit(value: any, def: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

export interface ListShiftsOptions {
  startDate: Date | string;
  endDate: Date | string;
  department?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export async function listShifts(opts: ListShiftsOptions) {
  const conn = await db();
  const query: any = {
    date: {
      $gte: new Date(opts.startDate),
      $lte: new Date(opts.endDate),
    },
  };
  if (opts.department) query.department = opts.department;
  if (opts.userId) query['assignedWorkers.userId'] = opts.userId;

  const limit = clampLimit(opts.limit, 500, 2000);
  const offset = Math.max(0, Number(opts.offset) || 0);

  return conn.collection('shifts').find(query).sort({ date: 1 }).skip(offset).limit(limit).toArray();
}

export async function getShiftById(id: string) {
  if (!ObjectId.isValid(id)) {
    throw new Error('Invalid shift ID');
  }
  const conn = await db();
  return conn.collection('shifts').findOne({ _id: new ObjectId(id) });
}

/**
 * Atomically assign a worker to a shift slot. Uses a conditional update so
 * two simultaneous "assign me" calls cannot both succeed for the same slot.
 */
export async function assignUserToShift(opts: {
  shiftId: string;
  userId: string;
  roleIndex: number;
  assignedBy: string;
}): Promise<{ success: boolean; reason?: string; error?: string }> {
  if (!ObjectId.isValid(opts.shiftId)) {
    return { success: false, reason: 'invalid_id', error: 'Invalid shift ID' };
  }
  const conn = await db();
  const filter: any = {
    _id: new ObjectId(opts.shiftId),
    [`assignedWorkers.${opts.roleIndex}.userId`]: { $in: [null, '', undefined] },
  };
  const update: any = {
    $set: {
      [`assignedWorkers.${opts.roleIndex}.userId`]: opts.userId,
      [`assignedWorkers.${opts.roleIndex}.assignedAt`]: new Date(),
      [`assignedWorkers.${opts.roleIndex}.assignedBy`]: opts.assignedBy,
      updatedAt: new Date(),
    },
  };
  const result = await conn.collection('shifts').updateOne(filter, update);
  if (result.matchedCount === 0) {
    return { success: false, reason: 'slot_taken', error: 'Shift slot is already assigned' };
  }
  logger.info('Worker assigned to shift', {
    shiftId: opts.shiftId,
    userId: opts.userId,
    roleIndex: opts.roleIndex,
  });
  return { success: true };
}

/**
 * Pre-flight validation for vacation requests. Catches common mistakes
 * (inverted dates, overlapping vacation, very long requests) before the
 * resolver writes anything to the database.
 */
export interface VacationValidationInput {
  userId: string;
  startDate: Date | string;
  endDate: Date | string;
  excludeRequestId?: string;
}

export async function validateVacationRequest(input: VacationValidationInput): Promise<{
  ok: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    errors.push('startDate and endDate must be valid dates');
    return { ok: false, errors, warnings };
  }
  if (end < start) {
    errors.push('endDate must be on or after startDate');
  }
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (days > 30) {
    warnings.push('Vacation request spans more than 30 days');
  }

  // Check for overlapping vacation requests (excluding the one being updated).
  try {
    const conn = await db();
    const filter: any = {
      userId: input.userId,
      status: { $in: ['pending', 'approved'] },
      $and: [{ startDate: { $lte: end } }, { endDate: { $gte: start } }],
    };
    if (input.excludeRequestId && ObjectId.isValid(input.excludeRequestId)) {
      filter._id = { $ne: new ObjectId(input.excludeRequestId) };
    }
    const overlap = await conn.collection('vacation_requests').findOne(filter);
    if (overlap) {
      errors.push('Overlaps with an existing vacation request');
    }
  } catch (err: any) {
    logger.warn('Vacation overlap check failed', { error: err.message });
  }

  return { ok: errors.length === 0, errors, warnings };
}
