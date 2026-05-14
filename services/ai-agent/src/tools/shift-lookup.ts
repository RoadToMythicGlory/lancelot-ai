/**
 * shift-lookup Tool
 *
 * Read-only complement to the existing shift-solver. Answers:
 *   - "מתי המשמרת שלי?"   → findShifts({ userId: caller, fromDate: today })
 *   - "מי במשמרת היום?"   → findShifts({ fromDate: today, toDate: today })
 *   - "מי עובד מחר במחלקה X" → with department scoping
 *
 * Permissions:
 *   - SHIFTS_VIEW_OWN  → can only see own shifts
 *   - SHIFTS_VIEW_ALL / SHIFTS_MANAGE → can see anyone's
 */

import { z } from 'zod';
import {
  canReadShifts,
  findShifts,
  type ShiftDoc,
} from '../data/erp/shifts';
import type { ToolHandler } from '../agent/orchestrator';

export const shiftLookupInputSchema = z.object({
  message: z.string().min(1),
  entities: z.record(z.string()).optional(),
});

export const shiftLookupTool: ToolHandler = async (input, context) => {
  const message = String(input.message || context.message || '').trim();

  const gate = canReadShifts(context.user);
  if (!gate.allowed) {
    return { success: true, text: gate.refusal!, data: { shifts: [] } };
  }

  const { fromDate, toDate, scopeLabel } = parseDateScope(message);
  const isMyShifts = /(שלי|my\s+shift)/i.test(message);

  const shifts = await findShifts(context.user, {
    fromDate,
    toDate,
    userId: isMyShifts ? context.user!.userId : undefined,
  });

  if (shifts.length === 0) {
    return {
      success: true,
      data: { shifts: [] },
      text: isMyShifts
        ? `אין לך משמרות ב${scopeLabel}.`
        : `לא נמצאו משמרות ב${scopeLabel}.`,
    };
  }

  return {
    success: true,
    data: { shifts },
    text: formatShifts(shifts, scopeLabel, isMyShifts),
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
  // Default — next 7 days
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return { fromDate: today, toDate: end, scopeLabel: 'השבוע הקרוב' };
}

function formatShifts(shifts: ShiftDoc[], scopeLabel: string, isMyShifts: boolean): string {
  const header = isMyShifts
    ? `📅 ${shifts.length} משמרות שלך ב${scopeLabel}:`
    : `📅 ${shifts.length} משמרות ב${scopeLabel}:`;

  const lines = [header];
  for (const s of shifts.slice(0, 15)) {
    const date = s.date ? new Date(s.date).toLocaleDateString('he-IL') : '?';
    const time = [s.startTime, s.endTime].filter(Boolean).join(' - ');
    const role = s.shiftType ? ` [${s.shiftType}]` : '';
    const workers =
      s.assignedWorkers.length > 0
        ? s.assignedWorkers
            .slice(0, 4)
            .map((w) => w.userName || w.userId)
            .join(', ') + (s.assignedWorkers.length > 4 ? `, +${s.assignedWorkers.length - 4}` : '')
        : 'לא משובץ';
    lines.push(`• ${date} ${time}${role} — ${workers}`);
  }
  if (shifts.length > 15) lines.push(`...ועוד ${shifts.length - 15} משמרות.`);
  return lines.join('\n');
}

export default shiftLookupTool;
