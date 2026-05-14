/**
 * broadcast-lookup Tool
 *
 * Calendar of broadcasts / events. Answers:
 *   - "מה משדרים היום"
 *   - "שידורים השבוע"
 *   - "האירוע הבא"
 *
 * Permission: BROADCAST_VIEW.
 */

import { z } from 'zod';
import {
  canReadBroadcasts,
  findBroadcasts,
  type BroadcastDoc,
} from '../data/erp/broadcasts';
import type { ToolHandler } from '../agent/orchestrator';

export const broadcastLookupInputSchema = z.object({
  message: z.string().min(1),
  entities: z.record(z.string()).optional(),
});

export const broadcastLookupTool: ToolHandler = async (input, context) => {
  const message = String(input.message || context.message || '').trim();

  const gate = canReadBroadcasts(context.user);
  if (!gate.allowed) {
    return { success: true, text: gate.refusal!, data: { broadcasts: [] } };
  }

  const { fromDate, toDate, scopeLabel } = parseDateScope(message);

  const broadcasts = await findBroadcasts(context.user, {
    fromDate,
    toDate,
    departmentId: context.user?.departmentId,
  });

  if (broadcasts.length === 0) {
    return {
      success: true,
      data: { broadcasts: [] },
      text: `לא נמצאו שידורים מתוכננים ${scopeLabel}.`,
    };
  }

  return {
    success: true,
    data: { broadcasts },
    text: formatBroadcasts(broadcasts, scopeLabel),
  };
};

function parseDateScope(message: string): { fromDate: Date; toDate: Date; scopeLabel: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (/היום|today/i.test(message)) {
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return { fromDate: today, toDate: end, scopeLabel: 'היום' };
  }
  if (/מחר|tomorrow/i.test(message)) {
    const start = new Date(today);
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { fromDate: start, toDate: end, scopeLabel: 'מחר' };
  }
  if (/השבוע|this\s*week/i.test(message)) {
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);
    return { fromDate: today, toDate: end, scopeLabel: 'השבוע' };
  }
  if (/הבא|next/i.test(message)) {
    const end = new Date(today);
    end.setDate(end.getDate() + 30);
    return { fromDate: today, toDate: end, scopeLabel: 'בקרוב' };
  }
  // Default: next 7 days
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return { fromDate: today, toDate: end, scopeLabel: 'השבוע הקרוב' };
}

function formatBroadcasts(broadcasts: BroadcastDoc[], scopeLabel: string): string {
  const lines = [`📺 ${broadcasts.length} שידורים ${scopeLabel}:`];
  for (const b of broadcasts.slice(0, 12)) {
    const start = b.startTime ? new Date(b.startTime) : null;
    const dateStr = start
      ? `${start.toLocaleDateString('he-IL')} ${start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
      : '?';
    const title = b.hebrewTitle || b.title;
    const where = b.venue || b.location;
    const teams = b.homeTeam && b.awayTeam ? ` — ${b.homeTeam} נגד ${b.awayTeam}` : '';
    const status = b.status ? ` (${translateStatus(b.status)})` : '';
    lines.push(`• ${dateStr} — ${title}${teams}${where ? ` @ ${where}` : ''}${status}`);
  }
  if (broadcasts.length > 12) lines.push(`...ועוד ${broadcasts.length - 12} אירועים.`);
  return lines.join('\n');
}

function translateStatus(status: string): string {
  const map: Record<string, string> = {
    planned: 'מתוכנן',
    confirmed: 'מאושר',
    in_progress: 'בעיצומו',
    completed: 'הסתיים',
    cancelled: 'בוטל',
  };
  return map[status] || status;
}

export default broadcastLookupTool;
