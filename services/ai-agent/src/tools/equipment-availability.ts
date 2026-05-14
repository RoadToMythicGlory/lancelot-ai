/**
 * equipment-availability Tool
 *
 * Answers warehouse stock + status questions:
 *   - "כמה מצלמות פנויות?"  → summarizeByCategory('cameras')
 *   - "ציוד תקול"           → listSuspended()
 *   - "איפה הברקוד CAM-2024-0123" → searchEquipment(barcode)
 *
 * Permission: WAREHOUSE_VIEW.
 */

import { z } from 'zod';
import {
  canReadEquipment,
  searchEquipment,
  summarizeByCategory,
  listSuspended,
  type EquipmentDoc,
  type CategorySummary,
} from '../data/erp/equipment';
import type { ToolHandler } from '../agent/orchestrator';

export const equipmentLookupInputSchema = z.object({
  message: z.string().min(1),
  entities: z.record(z.string()).optional(),
});

// Hebrew → canonical category slug. Used to detect "כמה מצלמות פנויות".
const HEBREW_CATEGORY_HINTS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /מצלמ(ות|ה)|cameras?/i, category: 'cameras' },
  { pattern: /סוללות|batteries/i, category: 'batteries' },
  { pattern: /liveu|לייב\s*יו/i, category: 'liveu_kits' },
  { pattern: /unity|יוניטי/i, category: 'unity_kits' },
  { pattern: /מוניטור|monitor/i, category: 'monitors' },
  { pattern: /אוזנ(יות|ייה)|headphones?/i, category: 'headphones' },
  { pattern: /מייצב|stabilizer/i, category: 'stabilizers' },
  { pattern: /כרטיס|card/i, category: 'cards' },
  { pattern: /מתאם|adapter/i, category: 'adapters' },
  { pattern: /מטריצ|matrix/i, category: 'matrix_components' },
  { pattern: /חצובה|חצובות|tripod/i, category: 'tripod' },
  { pattern: /עדש(ה|ות)|lens(es)?/i, category: 'lens' },
  { pattern: /מיקרופון|microphone/i, category: 'microphones' },
  { pattern: /סאונד|sound/i, category: 'sound' },
  { pattern: /תאורה|lighting/i, category: 'lighting' },
  { pattern: /כבל(ים)?|cable(s)?/i, category: 'cables' },
  { pattern: /סיב\s*אופטי|fiber/i, category: 'fiber' },
];

const SUSPENDED_HINTS = /תקול|מושע|broken|disabled|לא\s*תקין/i;

export const equipmentAvailabilityTool: ToolHandler = async (input, context) => {
  const message = String(input.message || context.message || '').trim();

  const gate = canReadEquipment(context.user);
  if (!gate.allowed) {
    return { success: true, text: gate.refusal!, data: { equipment: [] } };
  }

  // ── Path 1: explicit category in the message → summarize counts ───
  const categoryHit = HEBREW_CATEGORY_HINTS.find((h) => h.pattern.test(message));
  if (categoryHit && /כמה|how\s*many|פנויות|פנויים|זמינ/i.test(message)) {
    const summaries = await summarizeByCategory(categoryHit.category);
    return {
      success: true,
      data: { summaries },
      text: formatCategorySummaries(summaries, categoryHit.category),
    };
  }

  // ── Path 2: "what equipment is broken/suspended" ─────────────────
  if (SUSPENDED_HINTS.test(message)) {
    const items = await listSuspended();
    return {
      success: true,
      data: { items },
      text: formatSuspendedList(items),
    };
  }

  // ── Path 3: "show categories" overview ───────────────────────────
  if (/(כל|all)\s*(הציוד|equipment|categor)/i.test(message)) {
    const summaries = await summarizeByCategory();
    return {
      success: true,
      data: { summaries },
      text: formatCategorySummaries(summaries),
    };
  }

  // ── Path 4: free-text search by name / barcode ───────────────────
  const items = await searchEquipment(extractSearchToken(message));
  if (items.length === 0) {
    return {
      success: true,
      data: { items: [] },
      text:
        'לא מצאתי ציוד שתואם את החיפוש. נסה שם פריט, ברקוד מלא, או שם קטגוריה (למשל "מצלמות").',
    };
  }
  return {
    success: true,
    data: { items },
    text: formatEquipmentList(items),
  };
};

function extractSearchToken(message: string): string {
  // Strip common stopwords so "מי לקח את המצלמה X" → "המצלמה X"
  return message
    .replace(/^(מי|איפה|כמה|תראה לי|תן לי|הצג|מה הסטטוס של|where|what|show|give me)\s*/i, '')
    .replace(/[?!.]/g, '')
    .trim();
}

function formatCategorySummaries(summaries: CategorySummary[], focusCategory?: string): string {
  if (summaries.length === 0) {
    return focusCategory
      ? `לא נמצאו פריטים בקטגוריה "${focusCategory}".`
      : 'אין נתוני ציוד זמינים כרגע.';
  }

  const lines = ['📦 סטטוס מלאי:'];
  for (const s of summaries) {
    lines.push(
      `• ${s.category}: ${s.totalAvailable} פנויים מתוך ${s.totalUnits} סה"כ` +
        (s.totalDisabled > 0 ? ` (${s.totalDisabled} מושעים)` : ''),
    );
  }
  return lines.join('\n');
}

function formatSuspendedList(items: EquipmentDoc[]): string {
  if (items.length === 0) return '🟢 אין ציוד מושעה כרגע — הכל פעיל.';
  const lines = [`⚠️ ${items.length} פריטים מושעים:`];
  for (const e of items.slice(0, 15)) {
    const reason = e.suspensionStatus || e.disabledReason || 'לא צוין';
    lines.push(`• ${e.name} (${e.barcode}) — ${reason}`);
  }
  if (items.length > 15) lines.push(`...ועוד ${items.length - 15} פריטים.`);
  return lines.join('\n');
}

function formatEquipmentList(items: EquipmentDoc[]): string {
  const lines = [`🔍 נמצאו ${items.length} פריטים:`];
  for (const e of items.slice(0, 10)) {
    const status = e.isDisabled
      ? `מושעה (${e.suspensionStatus || e.disabledReason || ''})`
      : `${e.quantityAvailable}/${e.quantityTotal} פנויים`;
    lines.push(`• ${e.name} [${e.barcode}] — ${status}`);
  }
  if (items.length > 10) lines.push(`...ועוד ${items.length - 10} פריטים.`);
  return lines.join('\n');
}

export default equipmentAvailabilityTool;
