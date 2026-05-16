import { AuthenticationError, UserInputError } from 'apollo-server-express';
import mongoose from 'mongoose';
import FlightBoard, {
  IFlightBoard,
  FlightBoardItemType,
} from '../models/flightBoard';
import { BroadcastEvent } from '../models/broadcast.models';
import { EquipmentAssignment } from '../models/equipment.models';
import MCREvent from '../models/mcrEvent';
import ActivityRow from '../models/activityRow';
import BulletinPost from '../models/bulletinPost';
import { requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';
import type { Context } from '../types';

/**
 * Flight Board resolver.
 *
 * Aggregation model:
 *  - The canonical operational row is a **broadcast event**. Every linked
 *    entity (MCR event, activity row, external-broadcast metadata,
 *    production crew, warehouse equipment) hydrates onto the same row
 *    under its own `raw.<group>` namespace.
 *  - MCR-only events (without a `broadcastEventId` or with `isMCROnly`)
 *    still appear as their own MCR-typed rows.
 *  - Bulletin posts stay as standalone POST rows.
 *
 * This is what lets boards be assembled freely: a panel can show the
 * broadcast start time, the MCR start time, the VTR operator, and the
 * warehouse equipment list all on the same row, because every row already
 * carries the union of optional metadata.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureValidId(id: string, label = 'flight board') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new UserInputError(`Invalid ${label} ID`);
  }
}

function generatePanelKey(): string {
  return `panel_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePanels(panels: any[] | undefined | null): any[] {
  if (!Array.isArray(panels)) return [];
  return panels.map((p, index) => ({
    panelKey: typeof p.panelKey === 'string' && p.panelKey ? p.panelKey : generatePanelKey(),
    title: p.title || 'Panel',
    type: p.type || 'TABLE',
    width: p.width || 'FULL',
    itemTypes: Array.isArray(p.itemTypes) ? p.itemTypes : [],
    visibleColumns: Array.isArray(p.visibleColumns) ? p.visibleColumns : [],
    chartGroupBy: p.chartGroupBy ?? null,
    chartMetric: p.chartMetric ?? 'COUNT',
    sortField: p.sortField ?? null,
    sortDirection: p.sortDirection || 'ASC',
    rowLimit: typeof p.rowLimit === 'number' ? p.rowLimit : null,
    order: typeof p.order === 'number' ? p.order : index,
  }));
}

function generateRowId(): string {
  return `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Serialize a board document (lean object or hydrated doc) for the GraphQL
 * layer. Adds `id` strings and ensures the overlay/panels arrays exist.
 */
function serializeBoard(board: any): any {
  const obj = typeof board?.toObject === 'function' ? board.toObject() : board;
  return {
    ...obj,
    id: obj._id?.toString() || obj.id,
    panels: (obj.panels || []).map((p: any) => ({
      ...p,
      id: p._id?.toString() || p.panelKey,
    })),
    overlay: {
      hiddenItemKeys: obj.overlay?.hiddenItemKeys || [],
      manualRows: (obj.overlay?.manualRows || []).map((r: any) => ({
        rowId: r.rowId,
        panelKey: r.panelKey || null,
        values: r.values || {},
        createdAt: r.createdAt || null,
        updatedAt: r.updatedAt || null,
      })),
      itemOverrides: (obj.overlay?.itemOverrides || []).map((o: any) => ({
        itemKey: o.itemKey,
        values: o.values || {},
        updatedAt: o.updatedAt || null,
      })),
    },
  };
}

interface AggregateRange {
  start?: Date | null;
  end?: Date | null;
}

interface FlightBoardItemShape {
  id: string;
  type: FlightBoardItemType;
  title: string;
  date: Date | null;
  startTime: Date | null;
  endTime: Date | null;
  channel: string | null;
  status: string | null;
  description: string | null;
  notes: string | null;
  raw: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Date range resolution
// ---------------------------------------------------------------------------

function resolveRange(input: any): { start: Date | null; end: Date | null; preset: string } {
  const preset = (input?.preset || 'TODAY') as string;
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };

  if (preset === 'TODAY') {
    return { start: startOfDay(now), end: endOfDay(now), preset };
  }
  if (preset === 'YESTERDAY') {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { start: startOfDay(y), end: endOfDay(y), preset };
  }
  if (preset === 'THIS_WEEK') {
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    return { start: startOfDay(start), end: endOfDay(now), preset };
  }
  if (preset === 'THIS_MONTH') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: startOfDay(start), end: endOfDay(now), preset };
  }
  if (preset === 'ALL') {
    return { start: null, end: null, preset };
  }
  if (preset === 'CUSTOM') {
    const start = input?.start ? new Date(input.start) : null;
    const end = input?.end ? new Date(input.end) : null;
    return {
      start: start ? startOfDay(start) : null,
      end: end ? endOfDay(end) : null,
      preset,
    };
  }
  return { start: startOfDay(now), end: endOfDay(now), preset };
}

// ---------------------------------------------------------------------------
// Hydration helpers — turn a Mongoose doc into a plain JSON-safe object so
// `raw.*` columns can read fields without round-tripping through Mongoose.
// ---------------------------------------------------------------------------

function plainCopy(doc: any): any {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject();
  return { ...doc };
}

function summarizeProductionCrew(crew: any[]): {
  byRole: Record<string, string[]>;
  fullList: string;
} {
  const byRole: Record<string, string[]> = {};
  const labels: string[] = [];
  for (const member of crew || []) {
    const role = member?.role || 'unknown';
    const name = member?.name || member?.userName || '';
    if (name) {
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(name);
      labels.push(`${role}: ${name}`);
    }
  }
  return { byRole, fullList: labels.join(', ') };
}

function summarizeBroadcastArrayCrew(assignments: any[]): {
  byRole: Record<string, string[]>;
  fullList: string;
} {
  const byRole: Record<string, string[]> = {};
  const labels: string[] = [];
  for (const a of assignments || []) {
    const role = a?.role || 'unknown';
    const name = a?.userName || '';
    if (name) {
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(name);
      labels.push(`${role}: ${name}`);
    }
  }
  return { byRole, fullList: labels.join(', ') };
}

function summarizeEquipment(assignments: any[]): {
  count: number;
  totalQty: number;
  names: string[];
  list: string;
} {
  const names: string[] = [];
  let totalQty = 0;
  for (const a of assignments || []) {
    const name = (a?.eventName ? '' : '') + (a?.equipmentName || a?.toObject?.()?.equipmentName || '');
    const eq = a?.equipmentName || a?.toObject?.()?.equipmentName;
    const qty = a?.quantityAssigned || a?.toObject?.()?.quantityAssigned || 1;
    if (eq) {
      names.push(`${eq}${qty > 1 ? ` x${qty}` : ''}`);
      totalQty += qty;
    } else {
      void name;
    }
  }
  return { count: names.length, totalQty, names, list: names.join(', ') };
}

// ---------------------------------------------------------------------------
// Source loaders
// ---------------------------------------------------------------------------

async function loadBroadcasts(range: AggregateRange) {
  const query: any = {};
  if (range.start || range.end) {
    query.startTime = {};
    if (range.start) query.startTime.$gte = range.start;
    if (range.end) query.startTime.$lte = range.end;
  }
  return BroadcastEvent.find(query).sort({ startTime: 1 }).limit(2000).lean();
}

async function loadMcrLinks(broadcastIds: mongoose.Types.ObjectId[]) {
  if (broadcastIds.length === 0) return new Map<string, any>();
  const docs = await MCREvent.find({ broadcastEventId: { $in: broadcastIds } })
    .lean();
  const map = new Map<string, any>();
  for (const doc of docs) {
    const key = (doc as any).broadcastEventId?.toString();
    if (key) map.set(key, doc);
  }
  return map;
}

async function loadActivityRowLinks(broadcastIds: mongoose.Types.ObjectId[]) {
  if (broadcastIds.length === 0) return new Map<string, any[]>();
  const docs = await ActivityRow.find({ broadcastEventId: { $in: broadcastIds } })
    .sort({ time: 1 })
    .lean();
  const map = new Map<string, any[]>();
  for (const doc of docs) {
    const key = (doc as any).broadcastEventId?.toString();
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(doc);
  }
  return map;
}

async function loadEquipmentLinks(broadcastIds: mongoose.Types.ObjectId[]) {
  if (broadcastIds.length === 0) return new Map<string, any[]>();
  const docs = await EquipmentAssignment.find({
    eventId: { $in: broadcastIds },
    status: 'active',
  }).lean();
  const map = new Map<string, any[]>();
  for (const doc of docs) {
    const key = (doc as any).eventId?.toString();
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(doc);
  }
  return map;
}

async function loadOrphanMcrEvents(range: AggregateRange) {
  // MCR-only events — either flagged isMCROnly, or simply have no
  // broadcastEventId. They become their own MCR-typed rows.
  const query: any = {
    $or: [{ isMCROnly: true }, { broadcastEventId: { $exists: false } }, { broadcastEventId: null }],
  };
  if (range.start || range.end) {
    query.start = {};
    if (range.start) query.start.$gte = range.start;
    if (range.end) query.start.$lte = range.end;
  }
  return MCREvent.find(query).sort({ start: 1 }).limit(1000).lean();
}

async function loadBulletinPosts(range: AggregateRange) {
  const query: any = { isActive: true };
  if (range.start || range.end) {
    query.createdAt = {};
    if (range.start) query.createdAt.$gte = range.start;
    if (range.end) query.createdAt.$lte = range.end;
  }
  return BulletinPost.find(query).sort({ createdAt: -1 }).limit(500).lean();
}

// ---------------------------------------------------------------------------
// Item builders
// ---------------------------------------------------------------------------

function buildBroadcastItem(
  broadcast: any,
  mcr: any | null,
  activityRows: any[],
  equipment: any[],
): FlightBoardItemShape {
  const meta = broadcast?.metadata || {};
  const departments = meta?.departments || {};
  const externalBroadcasts = departments?.externalBroadcasts || null;
  const broadcastArray =
    departments?.broadcastArray || departments?.['broadcast-array'] || null;

  const productionCrew = summarizeProductionCrew(broadcast.productionCrew || []);
  const broadcastArrayCrew = summarizeBroadcastArrayCrew(
    broadcastArray?.crewAssignments || [],
  );

  const externalCustom = externalBroadcasts?.customData || externalBroadcasts || {};
  const externalCrew = summarizeProductionCrew(
    externalCustom?.productionCrew || externalBroadcasts?.productionCrew || [],
  );
  const externalEquipmentList: any[] =
    externalCustom?.equipmentList || externalBroadcasts?.equipmentList || [];
  const externalEquipmentRequests: any[] =
    externalCustom?.equipmentRequests ||
    externalBroadcasts?.equipmentRequests ||
    [];
  const externalNotApplicable = !!(
    externalCustom?.notApplicable || externalBroadcasts?.notApplicable
  );

  const equipmentSummary = summarizeEquipment(equipment);

  // Determine the primary status/title with sensible fallbacks.
  return {
    id: `broadcast:${broadcast._id.toString()}`,
    type: 'BROADCAST',
    title: broadcast.hebrewTitle || broadcast.title || 'אירוע שידור',
    date: broadcast.startTime ? new Date(broadcast.startTime) : null,
    startTime: broadcast.startTime ? new Date(broadcast.startTime) : null,
    endTime: broadcast.endTime ? new Date(broadcast.endTime) : null,
    channel: broadcast.channel || null,
    status: broadcast.status || null,
    description: broadcast.description || null,
    notes: broadcast.notes || null,
    raw: {
      _id: broadcast._id.toString(),
      // Direct broadcast fields surface at the top level of `raw` so column
      // keys can stay short ("raw.sport", "raw.koTime", ...).
      title: broadcast.title || null,
      hebrewTitle: broadcast.hebrewTitle || null,
      eventNumber: broadcast.eventNumber || null,
      eventType: broadcast.eventType || null,
      sport: broadcast.sport || null,
      league: broadcast.league || null,
      stage: broadcast.stage || null,
      homeTeam: broadcast.homeTeam || null,
      awayTeam: broadcast.awayTeam || null,
      priority: broadcast.priority || null,
      live: !!broadcast.live,
      backup: !!broadcast.backup,
      koTime: broadcast.koTime || null,
      arrivalTime: broadcast.arrivalTime || null,
      receptionStartTime: broadcast.receptionStartTime || null,
      gmtStartTime: broadcast.gmtStartTime || null,
      gmtEndTime: broadcast.gmtEndTime || null,
      location: broadcast.location || null,
      venue: broadcast.venue || null,
      synopsis: broadcast.synopsis || null,
      translationType: broadcast.translationType || null,
      requiresSubtitles: !!broadcast.requiresSubtitles,
      requiresSignLanguage: !!broadcast.requiresSignLanguage,
      projectCode: broadcast.projectCode || null,
      parallelChannel: broadcast.parallelChannel || null,
      channel1_4k: !!broadcast.channel1_4k,

      // Linked MCR event
      mcr: mcr
        ? {
            id: mcr._id?.toString(),
            title: mcr.title || null,
            start: mcr.start || null,
            end: mcr.end || null,
            mcrStartTime: mcr.mcrStartTime || null,
            mcrEndTime: mcr.mcrEndTime || null,
            controlStudio: mcr.controlStudio || null,
            broadcastChannel: mcr.broadcastChannel || null,
            broadcastType: mcr.broadcastType || null,
            preparationStatus: mcr.preparationStatus || null,
            preparationNotes: mcr.preparationNotes || null,
            sourceLabel: mcr.sourceLabel || null,
            isMCROnly: !!mcr.isMCROnly,
            feedsCount: Array.isArray(mcr.feeds) ? mcr.feeds.length : 0,
            outputPlatformsCount: Array.isArray(mcr.outputPlatforms)
              ? mcr.outputPlatforms.length
              : 0,
          }
        : null,

      // Linked activity rows (MCR schedule grid)
      activity: {
        count: activityRows.length,
        time: activityRows[0]?.time || null,
        endTime: activityRows[0]?.endTime || null,
        equipment: activityRows[0]?.equipment || null,
        backup: activityRows[0]?.backup || null,
        routing: activityRows[0]?.routing || null,
        broadcastType: activityRows[0]?.broadcastType || null,
        rows: activityRows.map((r) => plainCopy(r)),
      },

      // External-broadcast department metadata
      external: externalBroadcasts
        ? {
            mobileUnit:
              externalCustom?.mobileUnit || externalBroadcasts?.mobileUnit || null,
            notApplicable: externalNotApplicable,
            crewByRole: externalCrew.byRole,
            crewSummary: externalCrew.fullList,
            equipmentListCount: externalEquipmentList.length,
            equipmentRequestsCount: externalEquipmentRequests.length,
            equipmentList: externalEquipmentList,
            equipmentRequests: externalEquipmentRequests,
          }
        : null,

      // Direct production crew (cameraman / soundman / producer / director)
      crew: {
        byRole: productionCrew.byRole,
        summary: productionCrew.fullList,
        cameramen: (productionCrew.byRole['cameraman'] || []).join(', '),
        soundmen: (productionCrew.byRole['soundman'] || []).join(', '),
        producers: (productionCrew.byRole['producer'] || []).join(', '),
        directors: (productionCrew.byRole['director'] || []).join(', '),
        fieldTech: (productionCrew.byRole['field_tech'] || productionCrew.byRole['טכנאי שטח'] || []).join(', '),
      },

      // Broadcast-Array department roles (editor / VTR / sideline / etc.)
      broadcastArray: broadcastArray
        ? {
            broadcastLocation: broadcastArray?.מקוםשידור || null,
            specialInstructions:
              broadcastArray?.specialInstructions || broadcastArray?.שידור || null,
            byRole: broadcastArrayCrew.byRole,
            summary: broadcastArrayCrew.fullList,
            editor: (broadcastArrayCrew.byRole['עורך'] || []).join(', '),
            producer: (broadcastArrayCrew.byRole['מפיק'] || []).join(', '),
            vtr: (broadcastArrayCrew.byRole['איש VTR'] || []).join(', '),
            broadcastTech: (broadcastArrayCrew.byRole['טכנאי שידור'] || []).join(', '),
            anchor: (broadcastArrayCrew.byRole['שדר'] || []).join(', '),
            sidelineAnchor: (broadcastArrayCrew.byRole['שדר קוים'] || []).join(', '),
          }
        : null,

      // Warehouse equipment assignments for the event
      equipment: {
        count: equipmentSummary.count,
        totalQty: equipmentSummary.totalQty,
        names: equipmentSummary.names,
        list: equipmentSummary.list,
        items: (equipment || []).map((eq) => plainCopy(eq)),
      },
    },
  };
}

function buildOrphanMcrItem(mcr: any): FlightBoardItemShape {
  return {
    id: `mcr:${mcr._id.toString()}`,
    type: 'MCR',
    title: mcr.title || 'אירוע MCR',
    date: mcr.start ? new Date(mcr.start) : null,
    startTime: mcr.start ? new Date(mcr.start) : null,
    endTime: mcr.end ? new Date(mcr.end) : null,
    channel: mcr.broadcastChannel || null,
    status: mcr.preparationStatus || null,
    description: mcr.controlStudio || null,
    notes: mcr.preparationNotes || null,
    raw: {
      _id: mcr._id.toString(),
      title: mcr.title || null,
      isMCROnly: !!mcr.isMCROnly,
      mcr: {
        id: mcr._id.toString(),
        title: mcr.title || null,
        start: mcr.start || null,
        end: mcr.end || null,
        mcrStartTime: mcr.mcrStartTime || null,
        mcrEndTime: mcr.mcrEndTime || null,
        controlStudio: mcr.controlStudio || null,
        broadcastChannel: mcr.broadcastChannel || null,
        broadcastType: mcr.broadcastType || null,
        preparationStatus: mcr.preparationStatus || null,
        preparationNotes: mcr.preparationNotes || null,
        sourceLabel: mcr.sourceLabel || null,
        isMCROnly: !!mcr.isMCROnly,
      },
    },
  };
}

function buildPostItem(post: any): FlightBoardItemShape {
  const text = (post.content || '').replace(/<[^>]*>/g, '').trim();
  return {
    id: `post:${post._id.toString()}`,
    type: 'POST',
    title: text.slice(0, 120) || 'פוסט לוח מודעות',
    date: post.createdAt ? new Date(post.createdAt) : null,
    startTime: post.createdAt ? new Date(post.createdAt) : null,
    endTime: post.expiryDate ? new Date(post.expiryDate) : null,
    channel: null,
    status: post.untilNewPost ? 'UNTIL_NEW' : post.expiryDate ? 'TIMED' : 'ACTIVE',
    description: null,
    notes: null,
    raw: {
      _id: post._id.toString(),
      content: post.content || '',
      expiryDate: post.expiryDate || null,
      untilNewPost: !!post.untilNewPost,
    },
  };
}

// ---------------------------------------------------------------------------
// Top-level aggregation
// ---------------------------------------------------------------------------

/**
 * Build the synthetic FlightBoardItem for a board-local manual row. Manual
 * rows can override any column the board exposes, including `title`, `date`,
 * `startTime`/`endTime`, etc.
 */
function buildManualItem(row: {
  rowId: string;
  panelKey?: string | null;
  values: Record<string, any>;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}): FlightBoardItemShape {
  const v = row.values || {};
  const toDate = (val: any): Date | null => {
    if (!val) return null;
    if (val instanceof Date) return val;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  return {
    id: `manual:${row.rowId}`,
    type: 'MANUAL' as any,
    title: typeof v.title === 'string' ? v.title : '',
    date: toDate(v.date),
    startTime: toDate(v.startTime),
    endTime: toDate(v.endTime),
    channel: typeof v.channel === 'string' ? v.channel : null,
    status: typeof v.status === 'string' ? v.status : null,
    description: typeof v.description === 'string' ? v.description : null,
    notes: typeof v.notes === 'string' ? v.notes : null,
    raw: {
      manual: true,
      rowId: row.rowId,
      panelKey: row.panelKey || null,
      ...v,
    },
  };
}

/**
 * Apply the board overlay to the aggregated items list:
 *  - drop hidden source rows
 *  - merge per-row column overrides into matching source rows
 *  - append manual rows
 *
 * Each returned item also carries `itemKey`, `isManual`, `panelKey`, and
 * `hasOverride` so the frontend overlay UI knows how to address it.
 */
function applyOverlay(
  items: FlightBoardItemShape[],
  overlay: IFlightBoard['overlay'] | undefined | null,
): any[] {
  const hidden = new Set<string>(overlay?.hiddenItemKeys || []);
  const overrides = new Map<string, Record<string, any>>();
  for (const o of overlay?.itemOverrides || []) {
    if (!o?.itemKey) continue;
    overrides.set(o.itemKey, o.values || {});
  }

  const sourceKey = (item: FlightBoardItemShape) => {
    // Existing builders already produce ids like `broadcast:abc`. Lift them
    // into the canonical `${TYPE}:${id}` shape used by the overlay.
    const [, id] = item.id.split(':');
    return `${item.type}:${id}`;
  };

  const out: any[] = [];

  for (const item of items) {
    const key = sourceKey(item);
    if (hidden.has(key)) continue;
    const override = overrides.get(key);
    const merged: any = {
      ...item,
      itemKey: key,
      isManual: false,
      panelKey: null,
      hasOverride: !!override && Object.keys(override).length > 0,
    };
    if (override) {
      for (const [col, val] of Object.entries(override)) {
        if (col === 'date' || col === 'startTime' || col === 'endTime') {
          if (val == null) {
            merged[col] = null;
          } else {
            const d = new Date(val as any);
            if (!Number.isNaN(d.getTime())) merged[col] = d;
          }
        } else if (col in merged && col !== 'raw' && col !== 'id' && col !== 'type') {
          merged[col] = val;
        } else {
          merged.raw = { ...(merged.raw || {}), [col]: val };
        }
      }
      merged.raw = { ...(merged.raw || {}), __override: override };
    }
    out.push(merged);
  }

  for (const row of overlay?.manualRows || []) {
    const item = buildManualItem(row);
    out.push({
      ...item,
      itemKey: `MANUAL:${row.rowId}`,
      isManual: true,
      panelKey: row.panelKey || null,
      hasOverride: false,
    });
  }

  return out;
}

async function aggregateBoardItems(
  board: IFlightBoard,
  range: AggregateRange,
): Promise<FlightBoardItemShape[]> {
  // Decide which item types are needed across all panels. Empty itemTypes on
  // any panel means "all types".
  const requested = new Set<FlightBoardItemType>();
  let allTypes = false;
  for (const p of board.panels || []) {
    if (!p.itemTypes || p.itemTypes.length === 0) {
      allTypes = true;
      break;
    }
    for (const t of p.itemTypes) requested.add(t);
  }
  if (allTypes) {
    requested.add('BROADCAST');
    requested.add('MCR');
    requested.add('POST');
    requested.add('EXTERNAL');
  }

  const items: FlightBoardItemShape[] = [];

  // BROADCAST + EXTERNAL share the broadcast event row. EXTERNAL no longer
  // duplicates rows; instead, broadcast items always carry external metadata
  // when it exists, which the panel can opt-in to via column selection.
  const wantBroadcast = requested.has('BROADCAST') || requested.has('EXTERNAL');
  if (wantBroadcast) {
    const broadcasts = await loadBroadcasts(range);
    const ids = broadcasts.map((b: any) => b._id);
    const [mcrMap, activityMap, equipmentMap] = await Promise.all([
      loadMcrLinks(ids),
      loadActivityRowLinks(ids),
      loadEquipmentLinks(ids),
    ]);

    for (const broadcast of broadcasts) {
      const key = (broadcast as any)._id.toString();
      const mcr = mcrMap.get(key) || null;
      const activityRows = activityMap.get(key) || [];
      const equipment = equipmentMap.get(key) || [];

      // If the panel mix only wants EXTERNAL (no BROADCAST), filter to events
      // that actually have external-broadcast metadata.
      if (!requested.has('BROADCAST') && requested.has('EXTERNAL')) {
        const ext = (broadcast as any)?.metadata?.departments?.externalBroadcasts;
        if (!ext) continue;
      }

      items.push(buildBroadcastItem(broadcast, mcr, activityRows, equipment));
    }
  }

  if (requested.has('MCR')) {
    const orphans = await loadOrphanMcrEvents(range);
    for (const mcr of orphans) {
      items.push(buildOrphanMcrItem(mcr));
    }
  }

  if (requested.has('POST')) {
    const posts = await loadBulletinPosts(range);
    for (const post of posts) {
      items.push(buildPostItem(post));
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export const flightBoardResolvers = {
  Query: {
    flightBoards: async (_: any, __: any, context: Context) => {
      const user = requirePermission(context, Permission.FLIGHT_BOARD_VIEW);
      const filter: any = {};
      if (
        !user.has(Permission.FLIGHT_BOARD_MANAGE) &&
        user.systemRole !== 'SYSTEM_ADMIN' &&
        user.systemRole !== 'IT_ADMIN'
      ) {
        filter.visibility = 'ALL';
      }
      const boards = await FlightBoard.find(filter)
        .sort({ isDefault: -1, title: 1 })
        .lean();
      return boards.map((b: any) => serializeBoard(b));
    },

    flightBoard: async (_: any, args: { id: string }, context: Context) => {
      const user = requirePermission(context, Permission.FLIGHT_BOARD_VIEW);
      ensureValidId(args.id);
      const board = await FlightBoard.findById(args.id).lean();
      if (!board) return null;
      if (
        (board as any).visibility === 'ADMINS_ONLY' &&
        !user.has(Permission.FLIGHT_BOARD_MANAGE) &&
        user.systemRole !== 'SYSTEM_ADMIN' &&
        user.systemRole !== 'IT_ADMIN'
      ) {
        throw new AuthenticationError('You may not view this board');
      }
      return serializeBoard(board);
    },

    flightBoardData: async (
      _: any,
      args: { boardId: string; range: any },
      context: Context,
    ) => {
      requirePermission(context, Permission.FLIGHT_BOARD_VIEW);
      ensureValidId(args.boardId);
      const board = await FlightBoard.findById(args.boardId);
      if (!board) {
        throw new UserInputError('Flight board not found');
      }
      const { start, end, preset } = resolveRange(args.range);
      const rawItems = await aggregateBoardItems(board, { start, end });
      const items = applyOverlay(rawItems, board.overlay);
      const serialized = serializeBoard(board);
      return {
        boardId: board.id,
        rangeStart: start,
        rangeEnd: end,
        rangePreset: preset,
        generatedAt: new Date(),
        items,
        overlay: serialized.overlay,
      };
    },
  },

  Mutation: {
    createFlightBoard: async (_: any, args: { input: any }, context: Context) => {
      const user = requirePermission(context, Permission.FLIGHT_BOARD_MANAGE);
      const input = args.input || {};
      const panels = normalizePanels(input.panels);
      const isDefault = !!input.isDefault;
      if (isDefault) {
        await FlightBoard.updateMany({ isDefault: true }, { $set: { isDefault: false } });
      }
      const created = await FlightBoard.create({
        title: input.title,
        description: input.description,
        refreshIntervalSec:
          typeof input.refreshIntervalSec === 'number' ? input.refreshIntervalSec : 60,
        visibility: input.visibility || 'ALL',
        isDefault,
        panels,
        createdBy: new mongoose.Types.ObjectId(user.userId),
      });
      return serializeBoard(created);
    },

    updateFlightBoard: async (
      _: any,
      args: { id: string; input: any },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.FLIGHT_BOARD_MANAGE);
      ensureValidId(args.id);
      const board = await FlightBoard.findById(args.id);
      if (!board) throw new UserInputError('Flight board not found');

      const input = args.input || {};
      if (typeof input.title === 'string') board.title = input.title;
      if (typeof input.description === 'string') board.description = input.description;
      if (typeof input.refreshIntervalSec === 'number') {
        board.refreshIntervalSec = input.refreshIntervalSec;
      }
      if (input.visibility) board.visibility = input.visibility;

      if (typeof input.isDefault === 'boolean') {
        if (input.isDefault) {
          await FlightBoard.updateMany(
            { _id: { $ne: board._id }, isDefault: true },
            { $set: { isDefault: false } },
          );
        }
        board.isDefault = input.isDefault;
      }

      if (Array.isArray(input.panels)) {
        board.panels = normalizePanels(input.panels) as any;
      }
      board.updatedBy = new mongoose.Types.ObjectId(user.userId) as any;

      const saved = await board.save();
      return serializeBoard(saved);
    },

    deleteFlightBoard: async (_: any, args: { id: string }, context: Context) => {
      requirePermission(context, Permission.FLIGHT_BOARD_MANAGE);
      ensureValidId(args.id);
      const result = await FlightBoard.findByIdAndDelete(args.id);
      return !!result;
    },

    setDefaultFlightBoard: async (_: any, args: { id: string }, context: Context) => {
      const user = requirePermission(context, Permission.FLIGHT_BOARD_MANAGE);
      ensureValidId(args.id);
      const board = await FlightBoard.findById(args.id);
      if (!board) throw new UserInputError('Flight board not found');
      await FlightBoard.updateMany(
        { _id: { $ne: board._id }, isDefault: true },
        { $set: { isDefault: false } },
      );
      board.isDefault = true;
      board.updatedBy = new mongoose.Types.ObjectId(user.userId) as any;
      const saved = await board.save();
      return serializeBoard(saved);
    },

    // -------------------------------------------------------------------
    // Overlay mutations — board-local edits that never touch source data.
    // -------------------------------------------------------------------

    addFlightBoardManualRow: async (
      _: any,
      args: { boardId: string; input: { panelKey?: string | null; values?: Record<string, any> } },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.FLIGHT_BOARD_MANAGE);
      ensureValidId(args.boardId);
      const board = await FlightBoard.findById(args.boardId);
      if (!board) throw new UserInputError('Flight board not found');
      if (!board.overlay) {
        board.overlay = { hiddenItemKeys: [], manualRows: [], itemOverrides: [] } as any;
      }
      const now = new Date();
      const row = {
        rowId: generateRowId(),
        panelKey: args.input?.panelKey || null,
        values: args.input?.values || {},
        createdAt: now,
        updatedAt: now,
      };
      (board.overlay as any).manualRows.push(row);
      board.markModified('overlay');
      board.updatedBy = new mongoose.Types.ObjectId(user.userId) as any;
      const saved = await board.save();
      return serializeBoard(saved);
    },

    updateFlightBoardManualRow: async (
      _: any,
      args: { boardId: string; rowId: string; values: Record<string, any> },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.FLIGHT_BOARD_MANAGE);
      ensureValidId(args.boardId);
      const board = await FlightBoard.findById(args.boardId);
      if (!board) throw new UserInputError('Flight board not found');
      const rows = ((board.overlay as any)?.manualRows || []) as any[];
      const target = rows.find((r) => r.rowId === args.rowId);
      if (!target) throw new UserInputError('Manual row not found');
      target.values = { ...(target.values || {}), ...(args.values || {}) };
      target.updatedAt = new Date();
      board.markModified('overlay');
      board.updatedBy = new mongoose.Types.ObjectId(user.userId) as any;
      const saved = await board.save();
      return serializeBoard(saved);
    },

    deleteFlightBoardManualRow: async (
      _: any,
      args: { boardId: string; rowId: string },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.FLIGHT_BOARD_MANAGE);
      ensureValidId(args.boardId);
      const board = await FlightBoard.findById(args.boardId);
      if (!board) throw new UserInputError('Flight board not found');
      const rows = ((board.overlay as any)?.manualRows || []) as any[];
      (board.overlay as any).manualRows = rows.filter((r) => r.rowId !== args.rowId);
      board.markModified('overlay');
      board.updatedBy = new mongoose.Types.ObjectId(user.userId) as any;
      const saved = await board.save();
      return serializeBoard(saved);
    },

    hideFlightBoardItem: async (
      _: any,
      args: { boardId: string; itemKey: string },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.FLIGHT_BOARD_MANAGE);
      ensureValidId(args.boardId);
      const board = await FlightBoard.findById(args.boardId);
      if (!board) throw new UserInputError('Flight board not found');
      if (!board.overlay) {
        board.overlay = { hiddenItemKeys: [], manualRows: [], itemOverrides: [] } as any;
      }
      const list: string[] = (board.overlay as any).hiddenItemKeys || [];
      if (!list.includes(args.itemKey)) list.push(args.itemKey);
      (board.overlay as any).hiddenItemKeys = list;
      board.markModified('overlay');
      board.updatedBy = new mongoose.Types.ObjectId(user.userId) as any;
      const saved = await board.save();
      return serializeBoard(saved);
    },

    unhideFlightBoardItem: async (
      _: any,
      args: { boardId: string; itemKey: string },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.FLIGHT_BOARD_MANAGE);
      ensureValidId(args.boardId);
      const board = await FlightBoard.findById(args.boardId);
      if (!board) throw new UserInputError('Flight board not found');
      const list: string[] = (board.overlay as any)?.hiddenItemKeys || [];
      (board.overlay as any).hiddenItemKeys = list.filter((k) => k !== args.itemKey);
      board.markModified('overlay');
      board.updatedBy = new mongoose.Types.ObjectId(user.userId) as any;
      const saved = await board.save();
      return serializeBoard(saved);
    },

    setFlightBoardItemOverride: async (
      _: any,
      args: { boardId: string; itemKey: string; values: Record<string, any> },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.FLIGHT_BOARD_MANAGE);
      ensureValidId(args.boardId);
      const board = await FlightBoard.findById(args.boardId);
      if (!board) throw new UserInputError('Flight board not found');
      if (!board.overlay) {
        board.overlay = { hiddenItemKeys: [], manualRows: [], itemOverrides: [] } as any;
      }
      const overrides = ((board.overlay as any).itemOverrides || []) as any[];
      let entry = overrides.find((o) => o.itemKey === args.itemKey);
      if (!entry) {
        entry = { itemKey: args.itemKey, values: {}, updatedAt: new Date() };
        overrides.push(entry);
      }
      // Merge incoming values; explicit `null` clears a single column.
      const next: Record<string, any> = { ...(entry.values || {}) };
      for (const [k, v] of Object.entries(args.values || {})) {
        if (v === null || v === undefined) delete next[k];
        else next[k] = v;
      }
      entry.values = next;
      entry.updatedAt = new Date();
      // Drop the entry entirely if every value was cleared.
      (board.overlay as any).itemOverrides = overrides.filter(
        (o) => o.values && Object.keys(o.values).length > 0,
      );
      board.markModified('overlay');
      board.updatedBy = new mongoose.Types.ObjectId(user.userId) as any;
      const saved = await board.save();
      return serializeBoard(saved);
    },

    clearFlightBoardItemOverride: async (
      _: any,
      args: { boardId: string; itemKey: string },
      context: Context,
    ) => {
      const user = requirePermission(context, Permission.FLIGHT_BOARD_MANAGE);
      ensureValidId(args.boardId);
      const board = await FlightBoard.findById(args.boardId);
      if (!board) throw new UserInputError('Flight board not found');
      const overrides: any[] = (board.overlay as any)?.itemOverrides || [];
      (board.overlay as any).itemOverrides = overrides.filter(
        (o) => o.itemKey !== args.itemKey,
      );
      board.markModified('overlay');
      board.updatedBy = new mongoose.Types.ObjectId(user.userId) as any;
      const saved = await board.save();
      return serializeBoard(saved);
    },
  },

  // Field resolvers — populate User refs lazily, mirroring how the MCR
  // resolver handles `createdBy`.
  FlightBoard: {
    createdBy: async (parent: any, _: any, context: any) => {
      if (!parent?.createdBy) return null;
      if (typeof parent.createdBy === 'object' && (parent.createdBy as any).email) {
        return parent.createdBy;
      }
      const db = await context.mongoDb;
      if (!db) return null;
      const usersCollection = db.collection('users');
      return await usersCollection.findOne({ _id: parent.createdBy });
    },
    updatedBy: async (parent: any, _: any, context: any) => {
      if (!parent?.updatedBy) return null;
      if (typeof parent.updatedBy === 'object' && (parent.updatedBy as any).email) {
        return parent.updatedBy;
      }
      const db = await context.mongoDb;
      if (!db) return null;
      const usersCollection = db.collection('users');
      return await usersCollection.findOne({ _id: parent.updatedBy });
    },
  },
};
