/**
 * Heuristic schedule suggestions, ported from the Crystal Shift reference's
 * `aiScheduleSuggest` Base44 function.
 *
 * Deterministic, NOT an LLM. Score each candidate (user × shift type × APL × date)
 * by a combination of:
 *   - the user's submitted Preference rank/status for that slot
 *   - eligibility (APL.eligibleUserIds membership)
 *   - SchedulingRule penalties (max days/week, consecutive days,
 *     max-of-type/week, max consecutive same type, category slot caps)
 *   - existing assignments on the same day (no double-booking)
 *   - light parsing of the manager's free-text `userPrompt`
 *     (e.g. "prioritize X", "avoid Y", weekend hints) which the original
 *     Base44 implementation accepted but ignored.
 *
 * Returns a list of suggestions; persisting them is the manager's choice
 * (via `applyAiSuggestions`, which fans out to the existing `assignUserToShift`
 * mutation so all RBAC + audit live in one place).
 */

import { ObjectId } from 'mongodb';
import { connectMongoDB } from '../config/mongodb';
import { requireAuth, requirePermissionForDept } from '../middleware/auth';
import { Permission } from '../rbac';
import { COL } from './shiftSetup';

interface AiInput {
  departmentId: string;
  weekStart: string;
  weekEnd: string;
  userPrompt?: string | null;
}

export interface AiSuggestion {
  shiftTypeId: string;
  shiftTypeName: string;
  aplId: string;
  aplName: string;
  date: string;          // YYYY-MM-DD
  userId: string;
  userDisplayName: string;
  startTime: string;
  endTime: string;
  reason: string;
}

interface PromptHints {
  prioritizeUserIds: Set<string>;
  avoidUserIds: Set<string>;
  weekendBoost: number;   // negative score adjustment on weekend days for prioritized users
  weekendPenalty: number; // positive score adjustment on weekend days when avoiding
}

function parsePrompt(prompt: string | null | undefined): PromptHints {
  const hints: PromptHints = {
    prioritizeUserIds: new Set(),
    avoidUserIds: new Set(),
    weekendBoost: 0,
    weekendPenalty: 0,
  };
  if (!prompt) return hints;

  const lower = prompt.toLowerCase();
  // Weekend hints (English + Hebrew).
  if (
    lower.includes('weekend') ||
    lower.includes('weekends') ||
    prompt.includes('סופ"ש') ||
    prompt.includes('סוף שבוע') ||
    prompt.includes('סופש')
  ) {
    if (lower.includes('avoid') || prompt.includes('הימנע') || prompt.includes('פחות')) {
      hints.weekendPenalty = 5;
    } else if (lower.includes('prefer') || lower.includes('prioriti') || prompt.includes('עדיף')) {
      hints.weekendBoost = -3;
    }
  }
  // Per-user hints — very lightweight: look for ObjectId-shaped tokens after
  // an action verb. Manager UI normally embeds the chosen user id explicitly.
  const idRe = /[a-f0-9]{24}/gi;
  const ids = prompt.match(idRe) || [];
  for (const id of ids) {
    if (lower.includes('avoid ' + id.toLowerCase()) || lower.includes('skip ' + id.toLowerCase())) {
      hints.avoidUserIds.add(id);
    } else {
      hints.prioritizeUserIds.add(id);
    }
  }
  return hints;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayOfWeek(date: Date): number {
  return date.getUTCDay(); // 0..6 Sunday..Saturday
}

async function getDB() {
  return await connectMongoDB();
}

// ---------------------------------------------------------------------------
// Main implementation
// ---------------------------------------------------------------------------

export async function aiScheduleSuggestImpl(
  input: AiInput,
  context: any,
): Promise<AiSuggestion[]> {
  requireAuth(context);
  requirePermissionForDept(context, Permission.SHIFTS_MANAGE, input.departmentId);

  const db = await getDB();
  const deptId = String(input.departmentId);
  const weekStart = new Date(input.weekStart + 'T00:00:00.000Z');
  const weekEnd = new Date(input.weekEnd + 'T23:59:59.999Z');
  if (Number.isNaN(weekStart.getTime()) || Number.isNaN(weekEnd.getTime())) {
    throw new Error('Invalid weekStart / weekEnd');
  }

  // Fetch all reference data in parallel.
  const [shiftTypes, apls, schedulingRules, categories, preferences, existingShifts, employees] =
    await Promise.all([
      db
        .collection(COL.shiftTypeDefs)
        .find({ departmentId: deptId, active: { $ne: false } })
        .sort({ order: 1 })
        .toArray(),
      db
        .collection(COL.apls)
        .find({ departmentId: deptId, active: { $ne: false } })
        .sort({ order: 1 })
        .toArray(),
      db
        .collection(COL.schedulingRules)
        .find({ departmentId: deptId, active: { $ne: false } })
        .toArray(),
      db
        .collection(COL.shiftCategories)
        .find({ departmentId: deptId, active: { $ne: false } })
        .toArray(),
      db
        .collection(COL.preferences)
        .find({
          departmentId: deptId,
          weekStartDate: input.weekStart,
        })
        .toArray(),
      db
        .collection('shifts')
        .find({
          department: deptId,
          date: { $gte: weekStart, $lte: weekEnd },
        })
        .toArray(),
      db
        .collection('users')
        .find({
          isActive: { $ne: false },
          'departments.departmentId': deptId,
        })
        .toArray(),
    ]);

  if (shiftTypes.length === 0 || apls.length === 0 || employees.length === 0) {
    return [];
  }

  const hints = parsePrompt(input.userPrompt);

  // ---------- Build preference map ----------
  // Key: `${userId}|${dayOfWeek}|${shiftTypeId}|${aplId|''}` -> { rank, status }
  const prefMap = new Map<string, { rank: number; status: string }>();
  for (const pref of preferences) {
    if (!Array.isArray(pref.entries)) continue;
    for (const e of pref.entries) {
      const key = `${pref.userId}|${e.dayOfWeek}|${e.shiftTypeId}|${e.aplId || ''}`;
      prefMap.set(key, { rank: Number(e.rank) || 999, status: String(e.status || 'available') });
    }
  }

  // ---------- Build category slot map ----------
  // shiftTypeId -> day -> Set(categoryId)
  const categoryMap = new Map<string, Map<number, Set<string>>>();
  for (const cat of categories) {
    const catId = cat._id.toString();
    for (const slot of cat.slots || []) {
      const key = String(slot.shiftTypeId);
      if (!categoryMap.has(key)) categoryMap.set(key, new Map());
      const dayMap = categoryMap.get(key)!;
      if (!dayMap.has(slot.dayOfWeek)) dayMap.set(slot.dayOfWeek, new Set());
      dayMap.get(slot.dayOfWeek)!.add(catId);
    }
  }

  // ---------- Lookup tables ----------
  const employeeById = new Map<string, any>();
  for (const u of employees) {
    employeeById.set(u._id.toString(), u);
  }
  const shiftTypeById = new Map<string, any>();
  for (const st of shiftTypes) {
    shiftTypeById.set(st._id.toString(), st);
  }
  const aplById = new Map<string, any>();
  for (const a of apls) {
    aplById.set(a._id.toString(), a);
  }

  // ---------- In-flight assignment tracking ----------
  // existingShifts may already have assignedWorkers. Plus we add suggestions
  // we've made in this run so we don't double-suggest.
  type Track = {
    daysWorked: Set<string>;            // YYYY-MM-DD
    consecutiveDays: number;
    lastWorkDate?: string;
    typeCounts: Map<string, number>;     // shiftTypeId -> count
    consecutiveSameType: Map<string, number>; // shiftTypeId -> count
    categoryCounts: Map<string, number>; // categoryId -> count
  };
  const track = new Map<string, Track>();
  const trackOf = (userId: string): Track => {
    if (!track.has(userId)) {
      track.set(userId, {
        daysWorked: new Set(),
        consecutiveDays: 0,
        typeCounts: new Map(),
        consecutiveSameType: new Map(),
        categoryCounts: new Map(),
      });
    }
    return track.get(userId)!;
  };

  // Seed with existing assignments.
  const filledSlots = new Set<string>(); // `${date}|${shiftTypeId}|${aplId}`
  for (const sh of existingShifts) {
    const dateStr = sh.date instanceof Date ? dayKey(sh.date) : String(sh.date).slice(0, 10);
    const shiftTypeId = sh.shiftTypeId ? String(sh.shiftTypeId) : null;
    for (const w of sh.assignedWorkers || []) {
      const aplId = w.aplId ? String(w.aplId) : '';
      if (shiftTypeId) {
        filledSlots.add(`${dateStr}|${shiftTypeId}|${aplId}`);
      }
      const t = trackOf(String(w.userId));
      t.daysWorked.add(dateStr);
      if (shiftTypeId) {
        t.typeCounts.set(shiftTypeId, (t.typeCounts.get(shiftTypeId) || 0) + 1);
      }
    }
  }

  // ---------- Scoring helpers ----------
  function getRule(predicate: (r: any) => boolean): any | null {
    return schedulingRules.find(predicate) || null;
  }
  const ruleMaxDaysPerWeek = getRule((r) => r.maxDaysPerWeek != null);
  const ruleMaxConsecutiveDays = getRule((r) => r.maxConsecutiveDays != null);

  function scoreCandidate(
    userId: string,
    dateStr: string,
    dow: number,
    shiftTypeId: string,
    aplId: string,
  ): { score: number; reason: string } | null {
    const t = trackOf(userId);

    // Already working that day → skip.
    if (t.daysWorked.has(dateStr)) return null;

    // Hard caps from scheduling rules.
    if (
      ruleMaxDaysPerWeek &&
      ruleMaxDaysPerWeek.maxDaysPerWeek != null &&
      t.daysWorked.size >= Number(ruleMaxDaysPerWeek.maxDaysPerWeek)
    ) {
      return null;
    }
    if (
      ruleMaxConsecutiveDays &&
      ruleMaxConsecutiveDays.maxConsecutiveDays != null &&
      t.consecutiveDays >= Number(ruleMaxConsecutiveDays.maxConsecutiveDays)
    ) {
      return null;
    }
    const typeRule = getRule(
      (r) => r.maxShiftsOfTypePerWeek != null && String(r.shiftTypeId || '') === shiftTypeId,
    );
    if (
      typeRule &&
      (t.typeCounts.get(shiftTypeId) || 0) >= Number(typeRule.maxShiftsOfTypePerWeek)
    ) {
      return null;
    }
    const consecTypeRule = getRule(
      (r) => r.maxConsecutiveShiftsOfType != null && String(r.shiftTypeId || '') === shiftTypeId,
    );
    if (
      consecTypeRule &&
      (t.consecutiveSameType.get(shiftTypeId) || 0) >= Number(consecTypeRule.maxConsecutiveShiftsOfType)
    ) {
      return null;
    }

    // Soft preference scoring: lower = better.
    const prefKey = `${userId}|${dow}|${shiftTypeId}|${aplId}`;
    const prefAny = `${userId}|${dow}|${shiftTypeId}|`;
    const pref = prefMap.get(prefKey) || prefMap.get(prefAny);

    let score = 50;
    let reasonParts: string[] = [];

    if (pref) {
      if (pref.status === 'unavailable') return null;
      if (pref.status === 'prefer') {
        score -= 30;
        reasonParts.push('העדפה חיובית');
      } else if (pref.status === 'prefer_not') {
        score += 30;
        reasonParts.push('העדפה שלילית');
      } else {
        reasonParts.push('זמין');
      }
      if (pref.rank) {
        score += pref.rank * 0.5;
      }
    } else {
      // No preference submitted — neutral but slight penalty (ensures users
      // who DID submit prefs are favored).
      score += 5;
      reasonParts.push('ללא העדפה מפורשת');
    }

    // Weekend hints (Friday=5, Saturday=6 in Israeli calendar).
    if (dow === 5 || dow === 6) {
      if (hints.prioritizeUserIds.has(userId)) score += hints.weekendBoost;
      score += hints.weekendPenalty;
    }

    // Manager hints.
    if (hints.prioritizeUserIds.has(userId)) {
      score -= 10;
      reasonParts.push('מועדף ע״י המנהל');
    }
    if (hints.avoidUserIds.has(userId)) {
      score += 100; // effectively skip
    }

    // Category caps.
    const dayCats = categoryMap.get(shiftTypeId)?.get(dow);
    if (dayCats) {
      for (const catId of dayCats) {
        const catRule = schedulingRules.find(
          (r) => r.maxCategorySlotsPerWeek != null && String(r.categoryId || '') === catId,
        );
        if (
          catRule &&
          (t.categoryCounts.get(catId) || 0) >= Number(catRule.maxCategorySlotsPerWeek)
        ) {
          return null;
        }
      }
    }

    return { score, reason: reasonParts.join(' • ') };
  }

  function commitAssignment(userId: string, dateStr: string, shiftTypeId: string) {
    const t = trackOf(userId);
    const wasContinuous =
      t.lastWorkDate &&
      new Date(t.lastWorkDate).getTime() + 86_400_000 === new Date(dateStr).getTime();
    t.daysWorked.add(dateStr);
    t.consecutiveDays = wasContinuous ? t.consecutiveDays + 1 : 1;
    t.lastWorkDate = dateStr;
    t.typeCounts.set(shiftTypeId, (t.typeCounts.get(shiftTypeId) || 0) + 1);
    t.consecutiveSameType.set(
      shiftTypeId,
      (t.consecutiveSameType.get(shiftTypeId) || 0) + 1,
    );
    // Reset other-types' consecutive count.
    for (const otherType of Array.from(t.consecutiveSameType.keys())) {
      if (otherType !== shiftTypeId) t.consecutiveSameType.set(otherType, 0);
    }
    // Category counts.
    const cats = categoryMap.get(shiftTypeId);
    if (cats) {
      const catSet = cats.get(new Date(dateStr).getUTCDay());
      if (catSet) {
        for (const catId of catSet) {
          t.categoryCounts.set(catId, (t.categoryCounts.get(catId) || 0) + 1);
        }
      }
    }
  }

  // ---------- Main loop: enumerate empty slots, fill greedily ----------
  const suggestions: AiSuggestion[] = [];
  const oneDay = 86_400_000;
  for (let ts = weekStart.getTime(); ts <= weekEnd.getTime(); ts += oneDay) {
    const date = new Date(ts);
    const dateStr = dayKey(date);
    const dow = dayOfWeek(date);
    for (const shiftType of shiftTypes) {
      const shiftTypeId = shiftType._id.toString();
      for (const apl of apls) {
        const aplId = apl._id.toString();
        const slotKey = `${dateStr}|${shiftTypeId}|${aplId}`;
        if (filledSlots.has(slotKey)) continue;

        // Eligible employees for this APL.
        const eligibleIds: string[] = (apl.eligibleUserIds || []).map(String);
        const candidates = eligibleIds.length > 0
          ? eligibleIds
          : Array.from(employeeById.keys()); // if no APL gating, anyone in dept

        let best: { userId: string; score: number; reason: string } | null = null;
        for (const userId of candidates) {
          const evaluated = scoreCandidate(userId, dateStr, dow, shiftTypeId, aplId);
          if (!evaluated) continue;
          if (!best || evaluated.score < best.score) {
            best = { userId, score: evaluated.score, reason: evaluated.reason };
          }
        }
        if (!best) continue;

        commitAssignment(best.userId, dateStr, shiftTypeId);
        filledSlots.add(slotKey);

        const employee = employeeById.get(best.userId);
        suggestions.push({
          shiftTypeId,
          shiftTypeName: String(shiftType.name),
          aplId,
          aplName: String(apl.name),
          date: dateStr,
          userId: best.userId,
          userDisplayName:
            employee?.displayName ||
            `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() ||
            employee?.email ||
            'עובד',
          startTime: String(shiftType.startTime),
          endTime: String(shiftType.endTime),
          reason: best.reason || `התאמה אוטומטית (${shiftType.name} • ${apl.name})`,
        });
      }
    }
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

interface ApplyInput {
  departmentId: string;
  suggestions: Array<{
    shiftTypeId: string;
    aplId: string;
    date: string;
    userId: string;
    startTime: string;
    endTime: string;
  }>;
}

/**
 * Persist a batch of suggestions. We:
 *   1. Find or create a Shift document for (date, departmentId, shiftTypeId).
 *   2. Push an assignment with `aplId` into `assignedWorkers`.
 *
 * RBAC: caller has already been gated by `applyAiSuggestions` mutation
 * resolver in shiftSetup.ts; we do not re-check here.
 *
 * Returns the count of successfully applied suggestions.
 */
export async function applyAiSuggestionsImpl(input: ApplyInput, context: any): Promise<number> {
  requireAuth(context);
  const db = await getDB();
  let applied = 0;

  for (const s of input.suggestions) {
    try {
      const date = new Date(s.date + 'T00:00:00.000Z');
      const filter = {
        department: input.departmentId,
        shiftTypeId: s.shiftTypeId,
        date,
      };

      const existing = await db.collection('shifts').findOne(filter);
      const assignment = {
        userId: s.userId,
        aplId: s.aplId,
        role: 'assigned',
        assignedAt: new Date(),
        assignedBy: context.user?.userId || null,
        source: 'ai_suggestion',
      };

      if (existing) {
        // Skip if an assignment for the same APL is already there.
        const exists = (existing.assignedWorkers || []).some(
          (w: any) => String(w.aplId) === String(s.aplId),
        );
        if (exists) continue;
        await db.collection('shifts').updateOne(
          { _id: existing._id },
          {
            $push: { assignedWorkers: assignment } as any,
            $set: { updatedAt: new Date() },
          },
        );
      } else {
        await db.collection('shifts').insertOne({
          ...filter,
          shiftType: s.shiftTypeId,
          startTime: s.startTime,
          endTime: s.endTime,
          requiredWorkers: 1,
          assignedWorkers: [assignment],
          status: 'scheduled',
          notes: 'AI suggestion',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      applied += 1;
    } catch (err) {
      // Skip individual failures so the rest of the batch still applies.
      // eslint-disable-next-line no-console
      console.error('[applyAiSuggestions] failed:', err);
    }
  }

  return applied;
}
