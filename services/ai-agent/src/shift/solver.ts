/**
 * Deterministic Shift Solver
 *
 * Pure constraint-based greedy assignment algorithm.
 * No randomness, no LLM calls, no database access.
 * Operates exclusively on DTOs from the data adapter.
 *
 * Guarantees:
 * - Identical inputs always produce identical outputs
 * - Fixed iteration order (shifts sorted by date, then type, then ID)
 * - Stable sorting (tied scores resolved by employee ID)
 * - All decisions are traceable via score and reasons
 */

import {
  SolverInput,
  SolverAssignment,
  SolverConflict,
  SolverEmployee,
  SolverShift,
  SolverConstraints,
  SolverHistoricalLoad,
} from './types';

// ─── Employee Tracking ───────────────────────────────────────────────────────

export interface EmployeeTracking {
  shifts: string[];
  hoursWorked: number;
  lastShiftEnd: Date | null;
  consecutiveDays: number;
  nightShifts: number;
  weekendShifts: number;
  heavyShifts: number;
}

// ─── Shift Type Ordering (deterministic) ─────────────────────────────────────

const SHIFT_TYPE_ORDER: Record<string, number> = {
  morning: 0,
  afternoon: 1,
  night: 2,
};

function getShiftTypeOrder(type: string): number {
  return SHIFT_TYPE_ORDER[type.toLowerCase()] ?? 99;
}

// ─── Compute Shift Hours ─────────────────────────────────────────────────────

export function computeShiftHours(shift: SolverShift): number {
  if (shift.startTime && shift.endTime) {
    const start = parseInt(shift.startTime.split(':')[0], 10);
    const end = parseInt(shift.endTime.split(':')[0], 10);
    return end > start ? end - start : 24 - start + end;
  }
  return 8;
}

// ─── Is Weekend (Israeli: Friday=5, Saturday=6) ──────────────────────────────

export function isWeekendDay(dateStr: string): boolean {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 5 || day === 6;
}

// ─── Is Night Shift ──────────────────────────────────────────────────────────

export function isNightShift(shiftType: string): boolean {
  return shiftType.toLowerCase() === 'night';
}

// ─── Is Heavy Shift ──────────────────────────────────────────────────────────

export function isHeavyShift(shift: SolverShift): boolean {
  const night = isNightShift(shift.shiftType);
  const weekend = isWeekendDay(shift.date);
  const longShift = computeShiftHours(shift) > 10;
  return (night && weekend) || longShift;
}

// ─── Score Employee for Shift ────────────────────────────────────────────────

export function scoreEmployeeForShift(
  employee: SolverEmployee,
  shift: SolverShift,
  tracking: EmployeeTracking,
  availability: Map<string, string> | undefined,
  historicalLoad: SolverHistoricalLoad | undefined,
  constraints: SolverConstraints,
  avgHours: number,
  prioritize: 'fairness' | 'coverage' | 'preferences' | 'cost',
): { eligible: boolean; score: number; reasons: string[] } {
  const reasons: string[] = [];
  const shiftHours = computeShiftHours(shift);
  const shiftDate = new Date(shift.date);
  const dayOfWeek = shiftDate.getDay();

  // ── Hard constraint checks (ineligible if violated) ──

  // Max hours check
  if (tracking.hoursWorked + shiftHours > constraints.maxHoursPerWeek) {
    return { eligible: false, score: 0, reasons: ['exceeds_max_hours'] };
  }

  // Max consecutive days
  if (tracking.consecutiveDays >= constraints.maxConsecutiveDays) {
    return { eligible: false, score: 0, reasons: ['exceeds_consecutive_days'] };
  }

  // Rest period
  if (tracking.lastShiftEnd) {
    const hoursSinceLastShift =
      (shiftDate.getTime() - tracking.lastShiftEnd.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastShift < constraints.minRestHours) {
      return { eligible: false, score: 0, reasons: ['insufficient_rest'] };
    }
  }

  // Availability hard constraint
  const availKey = `${dayOfWeek}-${shift.shiftType}`;
  const pref = availability?.get(availKey);
  if (pref === 'unavailable') {
    return { eligible: false, score: 0, reasons: ['unavailable'] };
  }

  // ── Soft scoring ──

  let score = 50; // base score

  // Preference scoring
  if (pref === 'prefer') {
    score += 30;
    reasons.push('preference_match');
  } else if (pref === 'prefer_not') {
    score -= 20;
    reasons.push('preference_against');
  } else if (pref === 'available') {
    score += 10;
    reasons.push('explicitly_available');
  }

  // Fairness scoring: prefer employees with fewer hours
  if (prioritize === 'fairness') {
    const hoursRatio = tracking.hoursWorked / Math.max(constraints.maxHoursPerWeek, 1);
    score -= hoursRatio * 25;
    reasons.push('fairness_hours_balance');

    // Historical load penalty: penalize employees who already had more load
    if (historicalLoad && historicalLoad.periodDays > 0) {
      const historicalHoursPerDay = historicalLoad.totalHours / historicalLoad.periodDays;
      score -= historicalHoursPerDay * 3;
    }

    // Night shift balance
    if (isNightShift(shift.shiftType) && tracking.nightShifts > 0) {
      score -= tracking.nightShifts * 5;
      reasons.push('night_shift_balance');
    }

    // Weekend balance
    if (isWeekendDay(shift.date) && tracking.weekendShifts > 0) {
      score -= tracking.weekendShifts * 5;
      reasons.push('weekend_balance');
    }
  }

  // Coverage prioritization: prefer full-time employees
  if (prioritize === 'coverage') {
    score += (employee.employmentPercentage / 100) * 15;
    reasons.push('coverage_employment_pct');
  }

  // Employment percentage factor (always applied)
  score += (employee.employmentPercentage / 100) * 10;

  // Deviation from average hours
  if (avgHours > 0) {
    const deviation = tracking.hoursWorked - avgHours;
    score -= deviation * 2;
  }

  return { eligible: true, score, reasons };
}

// ─── Main Solver ─────────────────────────────────────────────────────────────

export function solve(input: SolverInput): {
  assignments: SolverAssignment[];
  conflicts: SolverConflict[];
  tracking: Map<string, EmployeeTracking>;
} {
  const { employees, shifts, availability, options } = input;
  const constraints = options.constraints;
  const prioritize = options.prioritize;

  const assignments: SolverAssignment[] = [];
  const conflicts: SolverConflict[] = [];

  // Initialize employee tracking
  const tracking = new Map<string, EmployeeTracking>();
  for (const emp of employees) {
    tracking.set(emp.id, {
      shifts: [],
      hoursWorked: 0,
      lastShiftEnd: null,
      consecutiveDays: 0,
      nightShifts: 0,
      weekendShifts: 0,
      heavyShifts: 0,
    });
  }

  // Build availability lookup: userId → Map<"dayOfWeek-shiftType", availability>
  const availabilityMap = new Map<string, Map<string, string>>();
  for (const avail of availability) {
    const userMap = new Map<string, string>();
    for (const c of avail.constraints) {
      userMap.set(`${c.dayOfWeek}-${c.shiftType}`, c.availability);
    }
    availabilityMap.set(avail.userId, userMap);
  }

  // Build historical load lookup
  const historicalLoadMap = new Map<string, SolverHistoricalLoad>();
  for (const load of input.historicalLoad) {
    historicalLoadMap.set(load.userId, load);
  }

  // Sort shifts deterministically: by date ASC, then by shift type order, then by ID
  const sortedShifts = [...shifts].sort((a, b) => {
    const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    const typeDiff = getShiftTypeOrder(a.shiftType) - getShiftTypeOrder(b.shiftType);
    if (typeDiff !== 0) return typeDiff;
    return a.id.localeCompare(b.id);
  });

  // Process each shift
  for (const shift of sortedShifts) {
    const shiftHours = computeShiftHours(shift);
    const currentlyAssigned = shift.assignedWorkers?.length || 0;
    const needed = shift.requiredWorkers - currentlyAssigned;

    // Include pre-existing assignments
    for (const aw of (shift.assignedWorkers || [])) {
      const emp = employees.find(e => e.id === aw.userId);
      assignments.push({
        shiftId: shift.id,
        userId: aw.userId,
        userName: emp?.displayName || 'Unknown',
        role: aw.role,
        date: shift.date,
        shiftType: shift.shiftType,
        startTime: shift.startTime,
        endTime: shift.endTime,
        department: shift.department,
        score: 100, // pre-assigned = max score
        confidence: 1.0,
      });

      // Update tracking for pre-assigned
      const t = tracking.get(aw.userId);
      if (t) {
        t.shifts.push(shift.id);
        t.hoursWorked += shiftHours;
        const endDate = new Date(shift.date);
        endDate.setHours(parseInt(shift.endTime.split(':')[0], 10));
        t.lastShiftEnd = endDate;
        t.consecutiveDays++;
        if (isNightShift(shift.shiftType)) t.nightShifts++;
        if (isWeekendDay(shift.date)) t.weekendShifts++;
        if (isHeavyShift(shift)) t.heavyShifts++;
      }
    }

    if (needed <= 0) continue;

    // Calculate average hours so far for fairness scoring
    const allHours = Array.from(tracking.values()).map(t => t.hoursWorked);
    const avgHours = allHours.length > 0
      ? allHours.reduce((a, b) => a + b, 0) / allHours.length
      : 0;

    // Score all employees for this shift
    const candidates: Array<{
      employee: SolverEmployee;
      score: number;
      reasons: string[];
    }> = [];

    for (const emp of employees) {
      const t = tracking.get(emp.id)!;
      const avail = availabilityMap.get(emp.id);
      const histLoad = historicalLoadMap.get(emp.id);

      // Skip if already assigned to this shift
      if (t.shifts.includes(shift.id)) continue;

      const result = scoreEmployeeForShift(
        emp, shift, t, avail, histLoad, constraints, avgHours, prioritize,
      );

      if (result.eligible) {
        candidates.push({
          employee: emp,
          score: result.score,
          reasons: result.reasons,
        });
      }
    }

    // Sort candidates deterministically: by score DESC, then by employee ID ASC (tie-break)
    candidates.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      return a.employee.id.localeCompare(b.employee.id);
    });

    // Assign top candidates
    let assignedCount = 0;
    for (const { employee, score } of candidates) {
      if (assignedCount >= needed) break;

      const t = tracking.get(employee.id)!;
      assignments.push({
        shiftId: shift.id,
        userId: employee.id,
        userName: employee.displayName,
        role: employee.roles[0] || 'worker',
        date: shift.date,
        shiftType: shift.shiftType,
        startTime: shift.startTime,
        endTime: shift.endTime,
        department: shift.department,
        score: Math.round(score * 100) / 100,
        confidence: Math.min(1.0, Math.max(0.1, score / 100)),
      });

      // Update tracking
      t.shifts.push(shift.id);
      t.hoursWorked += shiftHours;
      const endDate = new Date(shift.date);
      endDate.setHours(parseInt(shift.endTime.split(':')[0], 10));
      t.lastShiftEnd = endDate;
      t.consecutiveDays++;
      if (isNightShift(shift.shiftType)) t.nightShifts++;
      if (isWeekendDay(shift.date)) t.weekendShifts++;
      if (isHeavyShift(shift)) t.heavyShifts++;

      assignedCount++;
    }

    // Record conflict if understaffed
    if (assignedCount < needed) {
      conflicts.push({
        type: 'understaffed',
        severity: 'warning',
        description: `Shift on ${shift.date} (${shift.shiftType}) needs ${needed} workers but only ${assignedCount} could be assigned`,
        affectedShiftId: shift.id,
        suggestion: 'Consider adjusting constraints, adding staff, or allowing overtime',
      });
    }
  }

  return { assignments, conflicts, tracking };
}
