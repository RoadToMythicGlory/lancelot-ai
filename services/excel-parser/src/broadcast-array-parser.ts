/**
 * Parser for the weekly "מערך שידורים" (Broadcast Array) Excel file.
 *
 * Sample header row (column 0..14):
 *   יום | תאריך | שעת שידור | שידור | משחק | ערוץ | מקום שידור |
 *   עורך | מפיק | איש VTR (ריפליי) | טכנאי שידור / במאי | שדר + פרשן |
 *   שדר קוים | שדר קווים | הערות
 *
 * Outputs a structured row per event ready to be matched against
 * existing broadcast events in the api-gateway (channel + date + start
 * time + fuzzy title) and applied to their `broadcastArray` department
 * metadata.
 */

import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Types
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
  /** Hebrew day-of-week from the source file (informational only). */
  dayHebrew?: string;
  /** ISO date in YYYY-MM-DD form (Asia/Jerusalem). */
  date: string;
  /** Broadcast start time in HH:mm form (Asia/Jerusalem). */
  startTime: string;
  /** Sport/league name from the שידור column. */
  league?: string;
  /** Match / event details from the משחק column (with the trailing time-in-parens stripped). */
  matchTitle?: string;
  /** Normalized channel name (Hebrew form). */
  channel: string;
  /** Normalized control room / location name. */
  location?: string;
  roles: ParsedBroadcastArrayRoles;
  notes?: string;
  /** Original cell strings so the API gateway can fall back to them. */
  rawNames: Record<string, string>;
}

export interface ParseBroadcastArrayResult {
  success: boolean;
  rows: ParsedBroadcastArrayRow[];
  errors: string[];
  weekHint?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEADER_LOOKUP: Record<string, keyof HeaderIndex> = {
  'יום': 'day',
  'תאריך': 'date',
  'שעת שידור': 'time',
  'שעה': 'time',
  'שידור': 'league',
  'משחק': 'match',
  'ערוץ': 'channel',
  'מקום שידור': 'location',
  'עורך': 'editor',
  'מפיק': 'producer',
  'איש VTR (ריפליי)': 'vtr',
  'איש VTR': 'vtr',
  'VTR': 'vtr',
  'טכנאי שידור / במאי': 'broadcastTech',
  'טכנאי / במאי': 'broadcastTech',
  'טכנאי שידור': 'broadcastTech',
  'במאי': 'broadcastTech',
  'שדר + פרשן': 'anchorAnalyst',
  'שדר ופרשן': 'anchorAnalyst',
  'שדר': 'anchorAnalyst',
  'שדר קוים': 'sidelineA',
  'שדר קווים': 'sidelineB',
  'הערות': 'notes',
};

interface HeaderIndex {
  day?: number;
  date?: number;
  time?: number;
  league?: number;
  match?: number;
  channel?: number;
  location?: number;
  editor?: number;
  producer?: number;
  vtr?: number;
  broadcastTech?: number;
  anchorAnalyst?: number;
  sidelineA?: number;
  sidelineB?: number;
  notes?: number;
}

const CHANNEL_NORMALIZE: Record<string, string> = {
  '5 MAX': 'CHANNEL 6',
  'MAX': 'CHANNEL 6',
  '5 SPORT': 'CHANNEL 1',
  '5SPORT': 'CHANNEL 1',
  'SPORT': 'CHANNEL 1',
  '5 LIVE': 'CHANNEL 4',
  'LIVE': 'CHANNEL 4',
  '5 PLUS': 'CHANNEL 2',
  'PLUS': 'CHANNEL 2',
  '5 STARS': 'CHANNEL 5',
  'STARS': 'CHANNEL 5',
  '5 GOLD': 'CHANNEL 3',
  'GOLD': 'CHANNEL 3',
  '5 SPORT 4K': 'CHANNEL 1 4K',
  '4K': 'CHANNEL 1 4K',
};

/**
 * Normalise the מקום שידור value into a canonical control-room name that
 * matches the LOCATION_OPTIONS list used by the UI.
 *  - "חדר יוניפייד 5" → "יוניפייד 5"
 *  - "חדר רדיו" → "רדיו"
 *  - "מיניון" / "studio names" passed through as-is
 *  - "קונטרול 4 " trimmed
 */
function normalizeLocation(raw: string): string {
  let s = (raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  // "חדר יוניפייד N" → "יוניפייד N"
  s = s.replace(/^חדר\s+יוניפייד/u, 'יוניפייד');
  // "חדר רדיו" → "רדיו"
  s = s.replace(/^חדר\s+רדיו$/u, 'רדיו');
  s = s.replace(/^חדר\s+/u, '');
  return s;
}

function normalizeChannel(raw: string): string {
  const s = (raw || '').toString().trim();
  if (!s) return '';
  // Already Hebrew → keep but normalise the "5 " prefix variant
  if (/[\u0590-\u05FF]/.test(s)) return s.replace(/\s+/g, ' ').trim();
  const upper = s.toUpperCase().replace(/\s+/g, ' ').trim();
  if (CHANNEL_NORMALIZE[upper]) return CHANNEL_NORMALIZE[upper];
  // Sort patterns longest-first so "5 SPORT 4K" beats "5 SPORT"
  const keys = Object.keys(CHANNEL_NORMALIZE).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (upper.includes(k)) return CHANNEL_NORMALIZE[k];
  }
  return s;
}

/**
 * Split a cell that may contain multiple crew names. Cells observed in
 * the wild use `+`, commas, or hard line breaks as separators. Tokens
 * shaped like "מפיק : שם" are recognised as labelled assignments and
 * returned as `{label, names}` so the caller can route them to the right
 * role.
 */
function splitNames(raw: string): string[] {
  if (!raw) return [];
  return String(raw)
    .replace(/\u00A0/g, ' ')
    .split(/[+,\n\r;\/]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^\s*:?\s*$/.test(s));
}

/**
 * Pre-process a cell that may use "label : value" notation (e.g.
 * "מפיק : עמוס\nטכנאי : ישראל"). Returns the extracted labelled
 * entries plus the remaining unlabelled text.
 */
function extractLabelled(raw: string): {
  labelled: Array<{ label: string; value: string }>;
  rest: string;
} {
  const labelled: Array<{ label: string; value: string }> = [];
  const lines = String(raw || '').split(/\r?\n/);
  const restLines: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*([\u0590-\u05FFa-zA-Z ()/]+?)\s*[:：]\s*(.+?)\s*$/u);
    if (m) {
      labelled.push({ label: m[1].trim(), value: m[2].trim() });
    } else if (line.trim()) {
      restLines.push(line);
    }
  }
  return { labelled, rest: restLines.join(' ') };
}

/** Convert an Excel time fraction (0..1) to "HH:mm". */
function fractionToHHmm(fraction: number): string {
  const totalMinutes = Math.round(fraction * 24 * 60);
  const hh = Math.floor(totalMinutes / 60) % 24;
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Excel serial date → JS Date (1900-based, ignoring the Lotus bug for years > 1900). */
function serialToDate(serial: number): Date {
  // Excel epoch is 1899-12-30 in JS terms (so serial 1 = 1900-01-01).
  const ms = (serial - 25569) * 86400 * 1000;
  return new Date(ms);
}

function toIsoDate(value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const d = serialToDate(value);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  // DD/MM/YYYY or DD.MM.YYYY or YYYY-MM-DD
  let m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

function toHHmm(value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    // Excel time fraction
    if (value >= 0 && value < 2) return fractionToHHmm(value);
    return null;
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(
      value.getUTCMinutes(),
    ).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return null;
}

/** Strip trailing "(HH:MM)" suffix from match title and return both parts. */
function splitMatchAndTime(raw: string): { title: string; time?: string } {
  const s = String(raw || '').trim();
  const m = s.match(/^(.*)\((\d{1,2}:\d{2})\)\s*$/);
  if (m) return { title: m[1].trim(), time: m[2] };
  return { title: s };
}

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

function detectHeader(rows: any[][]): { headerRow: number; index: HeaderIndex } | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const idx: HeaderIndex = {};
    let hits = 0;
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? '').replace(/\s+/g, ' ').trim();
      if (!cell) continue;
      const key = HEADER_LOOKUP[cell];
      if (key && idx[key] === undefined) {
        idx[key] = c;
        hits++;
      }
    }
    // We expect at least the date column and at least 3 role columns.
    if (idx.date !== undefined && hits >= 5) {
      return { headerRow: r, index: idx };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public parser
// ---------------------------------------------------------------------------

export class BroadcastArrayParser {
  parseExcelFile(buffer: Buffer): ParseBroadcastArrayResult {
    const errors: string[] = [];
    const rows: ParsedBroadcastArrayRow[] = [];
    let weekHint: string | undefined;

    try {
      const workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: false, // we want raw numbers for time fractions
        cellNF: false,
        raw: true,
      });
      if (!workbook.SheetNames.length) {
        return { success: false, rows: [], errors: ['Workbook has no sheets'] };
      }
      const sheetName = workbook.SheetNames[0];
      const ws = workbook.Sheets[sheetName];
      const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      const header = detectHeader(grid);
      if (!header) {
        return {
          success: false,
          rows: [],
          errors: ['Could not locate header row (expected יום / תאריך / שעת שידור / ערוץ …).'],
        };
      }

      // Try to grab a weekHint from the row(s) above the header for diagnostics.
      for (let r = 0; r < header.headerRow; r++) {
        const cell = String(grid[r]?.[0] ?? '').trim();
        const m = cell.match(/שבוע\s*(\d+)/);
        if (m) {
          weekHint = m[1];
          break;
        }
      }

      const get = (row: any[], colKey: keyof HeaderIndex) => {
        const c = header.index[colKey];
        if (c === undefined) return '';
        return row[c] ?? '';
      };

      for (let r = header.headerRow + 1; r < grid.length; r++) {
        const row = grid[r];
        if (!row) continue;
        const dateRaw = get(row, 'date');
        const date = toIsoDate(dateRaw);
        if (!date) continue; // skip empty / non-data rows
        const startTime = toHHmm(get(row, 'time'));
        const channel = normalizeChannel(String(get(row, 'channel') || ''));
        const matchSplit = splitMatchAndTime(String(get(row, 'match') || ''));
        const startTimeFinal = startTime || matchSplit.time;
        if (!startTimeFinal) {
          errors.push(`Row ${r + 1}: missing start time`);
          continue;
        }

        const roles: ParsedBroadcastArrayRoles = {
          editor: [],
          producer: [],
          vtr: [],
          broadcastTech: [],
          anchor: [],
          analyst: [],
          sidelineAnchor: [],
        };

        /**
         * Push `names` into the role bucket implied by the Hebrew label
         * (or, when no label was provided, into `fallbackKey`).
         */
        const routeByLabel = (
          label: string | null,
          names: string[],
          fallbackKey: keyof ParsedBroadcastArrayRoles,
        ) => {
          const target = (() => {
            if (!label) return fallbackKey;
            const lbl = label.replace(/\s+/g, '');
            if (/מפיק/.test(lbl)) return 'producer' as const;
            if (/(טכנאי|במאי)/.test(lbl)) return 'broadcastTech' as const;
            if (/עורך/.test(lbl)) return 'editor' as const;
            if (/VTR|ריפליי/i.test(lbl)) return 'vtr' as const;
            if (/(אנליסט|פרשן)/.test(lbl)) return 'analyst' as const;
            if (/שדר.*קו/.test(lbl)) return 'sidelineAnchor' as const;
            if (/שדר/.test(lbl)) return 'anchor' as const;
            return fallbackKey;
          })();
          roles[target].push(...names);
        };

        /**
         * For columns that hold a single role: prefer labelled tokens
         * when present (so "מפיק : עמוס\nטכנאי : ישראל" appearing in
         * the מפיק column is re-routed correctly), otherwise just split
         * the cell on the standard separators.
         */
        const fillRoleColumn = (
          colKey: keyof HeaderIndex,
          fallbackKey: keyof ParsedBroadcastArrayRoles,
        ) => {
          const raw = String(get(row, colKey) || '');
          if (!raw) return;
          const { labelled, rest } = extractLabelled(raw);
          if (labelled.length > 0) {
            for (const { label, value } of labelled) {
              routeByLabel(label, splitNames(value), fallbackKey);
            }
            if (rest) routeByLabel(null, splitNames(rest), fallbackKey);
          } else {
            routeByLabel(null, splitNames(raw), fallbackKey);
          }
        };

        fillRoleColumn('editor', 'editor');
        fillRoleColumn('producer', 'producer');
        fillRoleColumn('vtr', 'vtr');
        fillRoleColumn('broadcastTech', 'broadcastTech');

        const techCellRaw = String(get(row, 'broadcastTech') || '');

        // שדר + פרשן column — first token is the anchor, rest are analysts.
        const anchorCell = String(get(row, 'anchorAnalyst') || '');
        const anchorNames = splitNames(anchorCell);
        if (anchorNames.length === 1) {
          roles.anchor.push(anchorNames[0]);
        } else if (anchorNames.length > 1) {
          roles.anchor.push(anchorNames[0]);
          roles.analyst.push(...anchorNames.slice(1));
        }

        // The two "שדר קוים" / "שדר קווים" columns both mean sideline
        // anchor — merge and de-dupe.
        const sideRaw = [
          String(get(row, 'sidelineA') || ''),
          String(get(row, 'sidelineB') || ''),
        ].join(',');
        const sideNames = splitNames(sideRaw);
        const sideSeen = new Set(roles.sidelineAnchor);
        for (const n of sideNames) {
          if (!sideSeen.has(n)) {
            roles.sidelineAnchor.push(n);
            sideSeen.add(n);
          }
        }

        rows.push({
          rowIndex: r + 1,
          dayHebrew: String(get(row, 'day') || '').trim() || undefined,
          date,
          startTime: startTimeFinal,
          league: String(get(row, 'league') || '').trim() || undefined,
          matchTitle: matchSplit.title || undefined,
          channel,
          location: normalizeLocation(String(get(row, 'location') || '')) || undefined,
          roles,
          notes: String(get(row, 'notes') || '').trim() || undefined,
          rawNames: {
            editor: String(get(row, 'editor') || ''),
            producer: String(get(row, 'producer') || ''),
            vtr: String(get(row, 'vtr') || ''),
            broadcastTech: techCellRaw,
            anchorAnalyst: anchorCell,
            sideline: sideRaw,
          },
        });
      }

      return { success: true, rows, errors, weekHint };
    } catch (err: any) {
      return {
        success: false,
        rows,
        errors: [err?.message || String(err)],
      };
    }
  }
}
