import { exportCsv } from '@/app/MCR/utils/exportCsv';
import { ITEM_TYPE_SHORT_LABELS } from '../constants';
import {
  formatDate,
  formatStatus,
  formatTime,
  stripHtml,
} from './formatters';
import type { FlightBoardItem } from '../types';

/**
 * Produce a CSV download from the currently loaded board items. The export
 * sticks to the columns called out in the original feature guide so all
 * boards produce a consistent export schema regardless of panel mix.
 */
export function exportBoardCsv(boardTitle: string, items: FlightBoardItem[]) {
  const headers = [
    'סוג',
    'כותרת',
    'תאריך',
    'שעת התחלה',
    'שעת סיום',
    'ערוץ',
    'סטטוס',
  ];
  const rows = items.map((item) => [
    ITEM_TYPE_SHORT_LABELS[item.type] || item.type,
    stripHtml(item.title),
    formatDate(item.date || item.startTime),
    formatTime(item.startTime),
    formatTime(item.endTime),
    item.channel || '',
    formatStatus(item.status || ''),
  ]);
  const safeName = boardTitle.replace(/[^\u05D0-\u05EAa-zA-Z0-9_-]+/g, '_');
  exportCsv(`flight-board-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
}
