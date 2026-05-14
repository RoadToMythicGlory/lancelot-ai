/**
 * Shifts ERP Data Module
 *
 * Read-only access to the `shifts` Mongo collection (no Mongoose model
 * — see services/api-gateway/src/resolvers/shifts.ts for the access
 * pattern this mirrors).
 *
 * Permissions:
 *  - SHIFTS_VIEW_OWN — user can see their own shifts
 *  - SHIFTS_VIEW_ALL — user can see anyone's shifts (department head, admin)
 *  - SYSTEM_ADMIN / IT_ADMIN bypass via the rbac helper
 */

import { connectMongoDB } from '../mongodb-adapter';
import { createLogger } from '../../utils/logger';
import type { UserContext } from '../../agent/orchestrator';
import { Perm, userHasAnyPermission, userHasPermission, permissionRefusal } from './rbac';

const logger = createLogger('erp-shifts');

const COLLECTION = 'shifts';

export interface AssignedWorker {
  userId: string;
  userName?: string;
  role?: string;
}

export interface ShiftDoc {
  id: string;
  date: string; // ISO date (YYYY-MM-DD or full ISO)
  shiftType?: string;
  departmentId?: string;
  startTime?: string;
  endTime?: string;
  assignedWorkers: AssignedWorker[];
  notes?: string;
}

export interface ShiftLookupOptions {
  /** ISO date for the start of the range (inclusive). Default: today. */
  fromDate?: Date;
  /** ISO date for the end of the range (inclusive). Default: fromDate + 7 days. */
  toDate?: Date;
  /** Filter to a specific user. If omitted, returns all shifts the caller can see. */
  userId?: string;
  /** Filter to a specific department. */
  departmentId?: string;
  /** Hard limit on returned rows. */
  limit?: number;
}

/**
 * Permission gate. Caller must have at least SHIFTS_VIEW_OWN.
 */
export function canReadShifts(user: UserContext | undefined): {
  allowed: boolean;
  refusal?: string;
} {
  if (userHasAnyPermission(user, [Perm.SHIFTS_VIEW_OWN, Perm.SHIFTS_VIEW_ALL, Perm.SHIFTS_MANAGE])) {
    return { allowed: true };
  }
  return { allowed: false, refusal: permissionRefusal('משמרות') };
}

/**
 * Look up shifts in a date window with RBAC scoping.
 *
 * If the caller only has SHIFTS_VIEW_OWN, the query is force-scoped to
 * their own userId (or a no-op if they ask about someone else).
 */
export async function findShifts(
  user: UserContext | undefined,
  opts: ShiftLookupOptions = {},
): Promise<ShiftDoc[]> {
  const gate = canReadShifts(user);
  if (!gate.allowed || !user) return [];

  const fromDate = opts.fromDate ? new Date(opts.fromDate) : startOfToday();
  const toDate = opts.toDate
    ? new Date(opts.toDate)
    : addDays(fromDate, 7);

  // Effective scoping
  const canSeeAll = userHasAnyPermission(user, [Perm.SHIFTS_VIEW_ALL, Perm.SHIFTS_MANAGE]);
  const effectiveUserId = canSeeAll ? opts.userId : user.userId;

  try {
    const db = await connectMongoDB();
    const query: Record<string, unknown> = {
      date: { $gte: fromDate, $lte: toDate },
    };
    if (effectiveUserId) {
      query['assignedWorkers.userId'] = effectiveUserId;
    }
    if (opts.departmentId) {
      query.departmentId = opts.departmentId;
    } else if (!canSeeAll && user.departmentId) {
      // Department-scoped fallback for restricted callers
      query.departmentId = user.departmentId;
    }

    const docs = await db
      .collection(COLLECTION)
      .find(query)
      .sort({ date: 1, startTime: 1 })
      .limit(opts.limit ?? 50)
      .toArray();

    return docs.map(normalize);
  } catch (error) {
    logger.warn('Failed to find shifts', {
      error: (error as Error).message,
    });
    return [];
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  out.setHours(23, 59, 59, 999);
  return out;
}

function normalize(doc: any): ShiftDoc {
  const assignedWorkers: AssignedWorker[] = Array.isArray(doc.assignedWorkers)
    ? doc.assignedWorkers
        .filter((w: any) => w && typeof w === 'object')
        .map((w: any) => ({
          userId: String(w.userId || ''),
          userName: w.userName ? String(w.userName) : undefined,
          role: w.role ? String(w.role) : undefined,
        }))
    : [];

  let dateStr = '';
  try {
    if (doc.date instanceof Date) {
      dateStr = doc.date.toISOString();
    } else if (typeof doc.date === 'string') {
      dateStr = doc.date;
    }
  } catch {
    dateStr = '';
  }

  return {
    id: doc._id?.toString() || doc.id || '',
    date: dateStr,
    shiftType: doc.shiftType ? String(doc.shiftType) : undefined,
    departmentId: doc.departmentId ? String(doc.departmentId) : undefined,
    startTime: doc.startTime ? String(doc.startTime) : undefined,
    endTime: doc.endTime ? String(doc.endTime) : undefined,
    assignedWorkers,
    notes: doc.notes ? String(doc.notes) : undefined,
  };
}

export { userHasPermission, Perm };

export default {
  canReadShifts,
  findShifts,
};
