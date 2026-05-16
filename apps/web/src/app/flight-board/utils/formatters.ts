import {
  ALL_COLUMNS_BY_KEY,
  HEBREW_WEEKDAYS,
  STATUS_HEBREW_LABELS,
} from '../constants';
import type { FlightBoardItem, FlightBoardItemType } from '../types';

/**
 * Helper conversions used by table panels, charts, and the export. All of
 * them must be tolerant of missing/null values because aggregated items are
 * normalized across very different source shapes.
 */

export function formatDate(value: any): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatTime(value: any): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{1,2}:\d{2}/.test(value)) {
    // Already a HH:mm formatted string (activity-row time column).
    return value.length >= 5 ? value.slice(0, 5) : value;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function formatDateTime(value: any): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDate(value)} ${formatTime(value)}`;
}

export function formatBoolean(value: any): string {
  if (value === true || value === 'true') return 'כן';
  if (value === false || value === 'false' || value === 0) return 'לא';
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

export function formatStatus(value: any): string {
  if (!value) return '';
  if (STATUS_HEBREW_LABELS[value]) return STATUS_HEBREW_LABELS[value];
  return String(value);
}

export function stripHtml(value: any): string {
  if (value == null) return '';
  if (typeof value !== 'string') return String(value);
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hebrewWeekday(value: any): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return HEBREW_WEEKDAYS[d.getDay()];
}

/**
 * Read a value out of a FlightBoardItem using a dotted column key. Top-level
 * keys (`title`, `status`, ...) read directly off the item; `raw.foo.bar`
 * keys walk into the raw JSON payload.
 */
export function readColumn(item: FlightBoardItem, key: string): any {
  if (!key) return undefined;
  if (!key.startsWith('raw.')) {
    return (item as any)[key];
  }
  const path = key.slice(4).split('.');
  let cur: any = item.raw;
  for (const part of path) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Format a column value for display in a table cell. The catalog metadata
 * (`dateOnly`, `timeOnly`, `boolean`, `longText`) drives most of the logic,
 * with sensible fallbacks for unknown keys.
 */
export function formatColumnValue(item: FlightBoardItem, key: string): string {
  if (key === 'type') return ''; // Rendered as a colored badge separately.
  if (key === 'date') return formatDate(item.date || item.startTime);
  if (key === 'startTime') return formatTime(item.startTime);
  if (key === 'endTime') return formatTime(item.endTime);
  if (key === 'status') return formatStatus(item.status || '');
  if (key === 'title') return stripHtml(item.title);
  if (key === 'description') return stripHtml(item.description || '');
  if (key === 'notes') return stripHtml(item.notes || '');
  if (key === 'channel') return item.channel || '';

  const value = readColumn(item, key);
  const def = ALL_COLUMNS_BY_KEY[key];

  if (def?.dateOnly) return formatDate(value);
  if (def?.timeOnly) return formatTime(value);
  if (def?.boolean) return formatBoolean(value);

  if (value == null) return '';
  if (typeof value === 'boolean') return formatBoolean(value);
  if (Array.isArray(value)) return value.map((v) => stripHtml(v)).join(', ');
  if (typeof value === 'object') {
    // Render simple objects as compact JSON; non-trivial ones become a list
    // of "key: value" pairs so they're still readable in tooltip mode.
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  if (typeof value === 'string') return stripHtml(value);
  return String(value);
}

export function getItemColor(
  type: FlightBoardItemType,
  palette: Record<FlightBoardItemType, string>,
): string {
  return palette[type] || '#64748b';
}

/**
 * Sort items by a column key using direction. Comparison is value-aware:
 * dates compared as dates, numbers as numbers, everything else as locale
 * string. Missing values sort last regardless of direction.
 */
export function sortItems(
  items: FlightBoardItem[],
  field: string | null | undefined,
  direction: 'ASC' | 'DESC',
): FlightBoardItem[] {
  if (!field) return items;
  const sign = direction === 'DESC' ? -1 : 1;
  const def = ALL_COLUMNS_BY_KEY[field];
  return [...items].sort((a, b) => {
    const av = readColumn(a, field);
    const bv = readColumn(b, field);
    const aMissing = av == null || av === '';
    const bMissing = bv == null || bv === '';
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;

    if (
      field === 'date' ||
      field === 'startTime' ||
      field === 'endTime' ||
      def?.dateOnly ||
      def?.timeOnly
    ) {
      const ad = new Date(av).getTime();
      const bd = new Date(bv).getTime();
      if (Number.isFinite(ad) && Number.isFinite(bd)) {
        return (ad - bd) * sign;
      }
    }

    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * sign;
    }
    return String(av).localeCompare(String(bv), 'he') * sign;
  });
}
