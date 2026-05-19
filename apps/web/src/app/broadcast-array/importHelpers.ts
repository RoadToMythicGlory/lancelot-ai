/**
 * Helpers for matching parsed Broadcast Array Excel rows to existing
 * broadcast events and resolving free-text crew names to known users.
 *
 * Kept side-effect free and DOM-free so the logic can be unit-tested
 * (and reused by both the import modal and the dry-run preview).
 */

import dayjs from 'dayjs';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface ParsedBroadcastArrayRoles {
  editor: string[];
  producer: string[];
  vtr: string[];
  broadcastTech: string[];
  anchor: string[];
  analyst: string[];
  sidelineAnchor: string[];
}

export interface ParsedBroadcastArrayRow {
  rowIndex: number;
  dayHebrew?: string;
  date: string;            // ISO YYYY-MM-DD (Asia/Jerusalem)
  startTime: string;       // HH:mm
  league?: string;
  matchTitle?: string;
  channel: string;
  location?: string;
  roles: ParsedBroadcastArrayRoles;
  notes?: string;
  rawNames?: Record<string, string>;
}

export type MatchStatus = 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED';

export interface EventCandidate {
  eventId: string;
  title: string;
  channel: string;
  startISO: string;
  score: number;
}

export interface RowResolution {
  row: ParsedBroadcastArrayRow;
  status: MatchStatus;
  candidates: EventCandidate[];
  /** Selected event id (initially the top candidate when status === MATCHED). */
  selectedEventId: string | null;
  /**
   * Per role-key list of resolved cell values — either a real user id or
   * a `__ext__:<name>` sentinel for off-system crew. Mirrors the shape
   * the grid uses internally.
   */
  resolvedCells: Record<string, string[]>;
  /** Roles where at least one name needed to fall back to custom. */
  unresolvedNames: Array<{ roleKey: string; name: string }>;
  include: boolean;
}

// ---------------------------------------------------------------------------
// Channel normalisation
// ---------------------------------------------------------------------------

const CHANNEL_ALIASES: Array<[RegExp, string]> = [
  [/ספורט\s*5\s*4K/i, 'channel1_4k'],
  [/ספורט\s*5\s*MAX/i, 'channel6'],
  [/ספורט\s*5\s*לייב|5\s*LIVE/i, 'channel4'],
  [/ספורט\s*5\s*פלוס|5\s*PLUS/i, 'channel2'],
  [/ספורט\s*5\s*STARS|5\s*STARS/i, 'channel5'],
  [/ספורט\s*5\s*GOLD|5\s*GOLD|ספורט\s*5\s*גולד/i, 'channel3'],
  [/ספורט\s*5(?!\s*\S)/i, 'channel1'],
  [/5\s*SPORT/i, 'channel1'],
];

/**
 * Reduce a channel string to a stable canonical key so comparing two
 * different surface forms ("5 LIVE" vs "CHANNEL 4") still matches.
 */
export function channelKey(s: string | undefined | null): string {
  if (!s) return '';
  const trimmed = String(s).replace(/\s+/g, ' ').trim();
  for (const [pat, key] of CHANNEL_ALIASES) {
    if (pat.test(trimmed)) return key;
  }
  return trimmed.toLowerCase();
}

// ---------------------------------------------------------------------------
// Hebrew-aware name normalisation + similarity
// ---------------------------------------------------------------------------

/**
 * Strip vowels (nikud), diacritics, common honourifics, and collapse
 * whitespace. Returns a lowercased, normalised key suitable for direct
 * equality checks.
 */
export function nameKey(s: string): string {
  if (!s) return '';
  return String(s)
    .normalize('NFKD')
    // Hebrew nikud range
    .replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, '')
    .replace(/["׳`׳']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Levenshtein distance — small inputs, no need for a library. */
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(curr + 1, prev[j] + 1, prev[j - 1] + cost);
      prev[j - 1] = curr;
      curr = next;
    }
    prev[b.length] = curr;
  }
  return prev[b.length];
}

/** 0..1 similarity built on Levenshtein. */
export function similarity(a: string, b: string): number {
  const ak = nameKey(a);
  const bk = nameKey(b);
  if (!ak || !bk) return 0;
  if (ak === bk) return 1;
  const maxLen = Math.max(ak.length, bk.length);
  return 1 - lev(ak, bk) / maxLen;
}

/**
 * Best-effort fuzzy match of a free-text name against a known user
 * roster. Returns the picked user id together with a confidence score
 * (0..1) so the caller can decide whether to surface a warning.
 *
 * Strategy:
 *   1. exact normalised match
 *   2. all tokens in the input appear inside the candidate (last-name only OK)
 *   3. similarity ≥ 0.75
 */
export function pickUser(
  needle: string,
  haystack: Array<{ id: string; label: string }>,
): { id: string; score: number } | null {
  const nk = nameKey(needle);
  if (!nk || !haystack.length) return null;

  // Tier 1 — exact
  for (const u of haystack) {
    if (nameKey(u.label) === nk) return { id: u.id, score: 1 };
  }

  // Tier 2 — needle tokens all appear in candidate label
  const needleTokens = nk.split(' ').filter((t) => t.length >= 2);
  if (needleTokens.length) {
    for (const u of haystack) {
      const lk = nameKey(u.label);
      const allIn = needleTokens.every((t) => lk.includes(t));
      if (allIn) return { id: u.id, score: 0.85 };
    }
  }

  // Tier 3 — best similarity ≥ 0.75
  let best: { id: string; score: number } | null = null;
  for (const u of haystack) {
    const s = similarity(needle, u.label);
    if (s > 0.75 && (!best || s > best.score)) best = { id: u.id, score: s };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Event matching
// ---------------------------------------------------------------------------

interface EventLite {
  id: string;
  title?: string | null;
  hebrewTitle?: string | null;
  channel?: string | null;
  startTime?: string | null;
  metadata?: any;
}

/**
 * Build a list of candidate events for a parsed row, scored 0..1. The
 * highest-scoring candidate is treated as the match when its score
 * exceeds the MATCH_THRESHOLD.
 */
export function matchEventForRow(
  row: ParsedBroadcastArrayRow,
  events: EventLite[],
): EventCandidate[] {
  const wantedChannel = channelKey(row.channel);
  if (!wantedChannel || !row.date || !row.startTime) return [];

  const wantedStart = dayjs(`${row.date} ${row.startTime}`);
  if (!wantedStart.isValid()) return [];

  const rowTitle =
    (row.matchTitle || '') + ' ' + (row.league || '') + ' ' + (row.dayHebrew || '');

  const candidates: EventCandidate[] = [];
  for (const ev of events) {
    const evChan = channelKey(ev.channel || '');
    if (evChan !== wantedChannel) continue;
    const evStart = ev.startTime ? dayjs(ev.startTime) : null;
    if (!evStart || !evStart.isValid()) continue;

    const sameDay =
      evStart.format('YYYY-MM-DD') === wantedStart.format('YYYY-MM-DD');
    if (!sameDay) continue;

    const minutesDiff = Math.abs(evStart.diff(wantedStart, 'minute'));
    if (minutesDiff > 30) continue; // too far apart to be the same broadcast

    // Time-proximity baseline (0..0.6) + title similarity bump (0..0.4)
    const timeScore = 0.6 * Math.max(0, 1 - minutesDiff / 30);
    const evTitle =
      (ev.hebrewTitle || ev.title || '') +
      ' ' +
      ((ev.metadata?.customData?.league as string) || '') +
      ' ' +
      ((ev.metadata?.customData?.homeTeam as string) || '') +
      ' ' +
      ((ev.metadata?.customData?.awayTeam as string) || '');
    const titleScore = 0.4 * similarity(rowTitle, evTitle);

    candidates.push({
      eventId: ev.id,
      title: ev.hebrewTitle || ev.title || '(ללא כותרת)',
      channel: ev.channel || '',
      startISO: ev.startTime || '',
      score: Math.min(1, timeScore + titleScore),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

const MATCH_THRESHOLD = 0.55;
const AMBIGUOUS_GAP = 0.1;

export function classify(candidates: EventCandidate[]): MatchStatus {
  if (!candidates.length || candidates[0].score < MATCH_THRESHOLD) return 'UNMATCHED';
  if (candidates.length > 1 && candidates[0].score - candidates[1].score < AMBIGUOUS_GAP) {
    return 'AMBIGUOUS';
  }
  return 'MATCHED';
}

// ---------------------------------------------------------------------------
// Role resolution
// ---------------------------------------------------------------------------

const CUSTOM_PREFIX = '__ext__:';
export const customValue = (name: string) => `${CUSTOM_PREFIX}${name}`;
export const isCustomValue = (v: string) => v.startsWith(CUSTOM_PREFIX);

export interface RoleColumnLite {
  key: string;
  hebrewRole: string;
}

/**
 * Map parsed-row role names to a `{roleKey: [userIds | __ext__:names]}`
 * shape that matches what the grid stores internally.
 *
 * The mapping from Excel role keys → app role keys is intentionally
 * one-way: extra roles configured by the admin (rare) are skipped, and
 * Excel roles that don't correspond to any column are silently dropped.
 */
export function resolveRoleCells(
  row: ParsedBroadcastArrayRow,
  roleColumns: RoleColumnLite[],
  usersByRole: Record<string, Array<{ id: string; label: string }>>,
): { cells: Record<string, string[]>; unresolved: Array<{ roleKey: string; name: string }> } {
  const cells: Record<string, string[]> = {};
  const unresolved: Array<{ roleKey: string; name: string }> = [];

  for (const col of roleColumns) cells[col.key] = [];

  const apply = (roleKey: string, names: string[]) => {
    if (!cells[roleKey]) return; // role column not configured
    const seen = new Set(cells[roleKey]);
    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const picked = pickUser(trimmed, usersByRole[roleKey] || []);
      if (picked) {
        if (!seen.has(picked.id)) {
          cells[roleKey].push(picked.id);
          seen.add(picked.id);
        }
      } else {
        const sentinel = customValue(trimmed);
        if (!seen.has(sentinel)) {
          cells[roleKey].push(sentinel);
          seen.add(sentinel);
        }
        unresolved.push({ roleKey, name: trimmed });
      }
    }
  };

  // Direct one-to-one mappings
  const mapping: Array<[keyof ParsedBroadcastArrayRoles, string]> = [
    ['editor', 'editor'],
    ['producer', 'producer'],
    ['vtr', 'vtr'],
    ['broadcastTech', 'broadcastTech'],
    ['anchor', 'anchor'],
    ['analyst', 'analyst'],
    ['sidelineAnchor', 'sidelineAnchor'],
  ];

  for (const [excelKey, appKey] of mapping) {
    apply(appKey, row.roles[excelKey] || []);
  }

  return { cells, unresolved };
}

// ---------------------------------------------------------------------------
// Top-level orchestrator
// ---------------------------------------------------------------------------

export function buildResolutions(
  rows: ParsedBroadcastArrayRow[],
  events: EventLite[],
  roleColumns: RoleColumnLite[],
  usersByRole: Record<string, Array<{ id: string; label: string }>>,
): RowResolution[] {
  return rows.map((row) => {
    const candidates = matchEventForRow(row, events);
    const status = classify(candidates);
    const { cells, unresolved } = resolveRoleCells(row, roleColumns, usersByRole);
    return {
      row,
      status,
      candidates,
      selectedEventId: status === 'MATCHED' ? candidates[0].eventId : null,
      resolvedCells: cells,
      unresolvedNames: unresolved,
      include: status !== 'UNMATCHED',
    };
  });
}

export function dateRangeOfRows(rows: ParsedBroadcastArrayRow[]): {
  start: string;
  end: string;
} | null {
  if (!rows.length) return null;
  let minD = rows[0].date;
  let maxD = rows[0].date;
  for (const r of rows) {
    if (r.date < minD) minD = r.date;
    if (r.date > maxD) maxD = r.date;
  }
  return {
    start: dayjs(minD).startOf('day').toISOString(),
    end: dayjs(maxD).endOf('day').toISOString(),
  };
}
