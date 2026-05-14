/**
 * Broadcasts ERP Data Module
 *
 * Read-only access to the `broadcastevents` Mongo collection
 * (see services/api-gateway/src/models/broadcast.models.ts).
 *
 * Permissions: BROADCAST_VIEW (or BROADCAST_MANAGE).
 */

import { connectMongoDB } from '../mongodb-adapter';
import { createLogger } from '../../utils/logger';
import type { UserContext } from '../../agent/orchestrator';
import { Perm, userHasAnyPermission, permissionRefusal } from './rbac';

const logger = createLogger('erp-broadcasts');

const COLLECTION = 'broadcastevents';

export interface BroadcastDoc {
  id: string;
  eventNumber?: number;
  title: string;
  hebrewTitle?: string;
  eventType: string;
  status: string;
  startTime: string;
  endTime: string;
  location?: string;
  venue?: string;
  channel?: string;
  sport?: string;
  league?: string;
  homeTeam?: string;
  awayTeam?: string;
  departmentId?: string;
  notes?: string;
}

export interface BroadcastLookupOptions {
  fromDate?: Date;
  toDate?: Date;
  departmentId?: string;
  status?: string[];
  limit?: number;
}

export function canReadBroadcasts(user: UserContext | undefined): {
  allowed: boolean;
  refusal?: string;
} {
  if (userHasAnyPermission(user, [Perm.BROADCAST_VIEW, Perm.BROADCAST_MANAGE])) {
    return { allowed: true };
  }
  return { allowed: false, refusal: permissionRefusal('יומן השידורים') };
}

export async function findBroadcasts(
  user: UserContext | undefined,
  opts: BroadcastLookupOptions = {},
): Promise<BroadcastDoc[]> {
  const gate = canReadBroadcasts(user);
  if (!gate.allowed) return [];

  const fromDate = opts.fromDate ? new Date(opts.fromDate) : startOfToday();
  const toDate = opts.toDate ? new Date(opts.toDate) : endOfDay(addDays(fromDate, 7));

  try {
    const db = await connectMongoDB();
    const query: Record<string, unknown> = {
      // Overlap query: event ends after fromDate AND starts before toDate
      endTime: { $gte: fromDate },
      startTime: { $lte: toDate },
    };
    if (opts.departmentId) {
      query.departmentId = opts.departmentId;
    }
    if (opts.status && opts.status.length > 0) {
      query.status = { $in: opts.status };
    }

    const docs = await db
      .collection(COLLECTION)
      .find(query)
      .sort({ startTime: 1 })
      .limit(opts.limit ?? 30)
      .toArray();

    return docs.map(normalize);
  } catch (error) {
    logger.warn('Failed to find broadcasts', {
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

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function normalize(doc: any): BroadcastDoc {
  return {
    id: doc._id?.toString() || doc.id || '',
    eventNumber: typeof doc.eventNumber === 'number' ? doc.eventNumber : undefined,
    title: String(doc.title || ''),
    hebrewTitle: doc.hebrewTitle ? String(doc.hebrewTitle) : undefined,
    eventType: String(doc.eventType || 'live'),
    status: String(doc.status || 'planned'),
    startTime: doc.startTime instanceof Date ? doc.startTime.toISOString() : String(doc.startTime || ''),
    endTime: doc.endTime instanceof Date ? doc.endTime.toISOString() : String(doc.endTime || ''),
    location: doc.location ? String(doc.location) : undefined,
    venue: doc.venue ? String(doc.venue) : undefined,
    channel: doc.channel ? String(doc.channel) : undefined,
    sport: doc.sport ? String(doc.sport) : undefined,
    league: doc.league ? String(doc.league) : undefined,
    homeTeam: doc.homeTeam ? String(doc.homeTeam) : undefined,
    awayTeam: doc.awayTeam ? String(doc.awayTeam) : undefined,
    departmentId: doc.departmentId ? String(doc.departmentId) : undefined,
    notes: doc.notes ? String(doc.notes) : undefined,
  };
}

export default {
  canReadBroadcasts,
  findBroadcasts,
};
