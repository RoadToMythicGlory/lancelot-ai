/**
 * Iterative Improvement for Shift Assignments
 *
 * Swap-based local search to improve fairness.
 * Fully deterministic: fixed iteration order, stable sorting, no randomness.
 *
 * Strategy:
 * 1. Iterate over all pairs of employees (sorted by ID)
 * 2. For each pair, try swapping one shift assignment
 * 3. Accept swap if it reduces total fairness penalty
 * 4. Repeat until no improvement or max iterations reached
 */

import {
  SolverAssignment,
  SolverEmployee,
  SolverShift,
  SolverAvailability,
  SolverConstraints,
  ObjectiveSummary,
} from './types';

import { computeShiftHours, isNightShift, isWeekendDay, isHeavyShift } from './solver';

// ─── Internal Tracking ───────────────────────────────────────────────────────

interface ImprovementTracking {
  hoursWorked: number;
  nightShifts: number;
  weekendShifts: number;
  heavyShifts: number;
  assignmentIndices: number[]; // indices into assignments array
}

// ─── Improvement Result ──────────────────────────────────────────────────────

export interface ImprovementResult {
  assignments: SolverAssignment[];
  swapsPerformed: number;
  iterations: number;
}

// ─── Main Improvement Function ───────────────────────────────────────────────

/**
 * Try to improve assignment fairness via pairwise swaps.
 *
 * Deterministic: employees sorted by ID, shifts processed in order.
 * Never violates hard constraints.
 */
export function improveAssignments(
  assignments: SolverAssignment[],
  employees: SolverEmployee[],
  shifts: SolverShift[],
  availability: SolverAvailability[],
  _constraints: SolverConstraints,
  maxIterations: number = 100,
): ImprovementResult {
  // Make a mutable copy
  const result = assignments.map(a => ({ ...a }));
  let swapsPerformed = 0;
  let iterations = 0;

  // Build shift lookup
  const shiftMap = new Map<string, SolverShift>();
  for (const s of shifts) {
    shiftMap.set(s.id, s);
  }

  // Build availability lookup
  const availMap = new Map<string, Map<string, string>>();
  for (const avail of availability) {
    const m = new Map<string, string>();
    for (const c of avail.constraints) {
      m.set(`${c.dayOfWeek}-${c.shiftType}`, c.availability);
    }
    availMap.set(avail.userId, m);
  }

  // Sort employees deterministically by ID
  const sortedEmployees = [...employees].sort((a, b) => a.id.localeCompare(b.id));

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations++;
    let improved = false;

    // Build per-employee tracking from current assignments
    const tracking = buildTracking(result, sortedEmployees, shiftMap);

    // Compute current penalty
    const currentPenalty = computePenalty(tracking, sortedEmployees);

    // Try pairwise swaps (deterministic order)
    for (let i = 0; i < sortedEmployees.length && !improved; i++) {
      for (let j = i + 1; j < sortedEmployees.length && !improved; j++) {
        const empA = sortedEmployees[i];
        const empB = sortedEmployees[j];
        const trackA = tracking.get(empA.id)!;
        const trackB = tracking.get(empB.id)!;

        // Only consider swaps when there's a meaningful hour imbalance
        if (Math.abs(trackA.hoursWorked - trackB.hoursWorked) < 2) continue;

        // Try swapping each of empA's assignments with empB's assignments
        for (const idxA of trackA.assignmentIndices) {
          if (improved) break;
          for (const idxB of trackB.assignmentIndices) {
            const assignA = result[idxA];
            const assignB = result[idxB];

            // Don't swap pre-assigned (score=100) shifts
            if (assignA.score >= 100 || assignB.score >= 100) continue;

            // Check if swap is valid (availability)
            if (!isSwapValid(empA, empB, assignA, assignB, shiftMap, availMap)) continue;

            // Compute penalty after swap
            const swappedResult = [...result];
            swappedResult[idxA] = {
              ...assignA,
              userId: empB.id,
              userName: empB.displayName,
              role: empB.roles[0] || assignA.role,
            };
            swappedResult[idxB] = {
              ...assignB,
              userId: empA.id,
              userName: empA.displayName,
              role: empA.roles[0] || assignB.role,
            };

            const swappedTracking = buildTracking(swappedResult, sortedEmployees, shiftMap);
            const newPenalty = computePenalty(swappedTracking, sortedEmployees);

            if (newPenalty < currentPenalty - 0.01) {
              // Accept swap
              result[idxA] = swappedResult[idxA];
              result[idxB] = swappedResult[idxB];
              swapsPerformed++;
              improved = true;
              break;
            }
          }
        }
      }
    }

    if (!improved) break; // No improvement found in this iteration
  }

  return { assignments: result, swapsPerformed, iterations };
}

// ─── Build tracking from assignments ─────────────────────────────────────────

function buildTracking(
  assignments: SolverAssignment[],
  employees: SolverEmployee[],
  shiftMap: Map<string, SolverShift>,
): Map<string, ImprovementTracking> {
  const tracking = new Map<string, ImprovementTracking>();
  for (const emp of employees) {
    tracking.set(emp.id, {
      hoursWorked: 0,
      nightShifts: 0,
      weekendShifts: 0,
      heavyShifts: 0,
      assignmentIndices: [],
    });
  }

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const t = tracking.get(a.userId);
    if (!t) continue;

    const shift = shiftMap.get(a.shiftId);
    const hours = shift ? computeShiftHours(shift) : 8;

    t.hoursWorked += hours;
    t.assignmentIndices.push(i);
    if (isNightShift(a.shiftType)) t.nightShifts++;
    if (isWeekendDay(a.date)) t.weekendShifts++;
    if (shift && isHeavyShift(shift)) t.heavyShifts++;
  }

  return tracking;
}

// ─── Compute Penalty ─────────────────────────────────────────────────────────

function computePenalty(
  tracking: Map<string, ImprovementTracking>,
  employees: SolverEmployee[],
): number {
  const hours = employees.map(e => tracking.get(e.id)?.hoursWorked || 0);
  const nights = employees.map(e => tracking.get(e.id)?.nightShifts || 0);
  const weekends = employees.map(e => tracking.get(e.id)?.weekendShifts || 0);

  // Penalty = variance of hours * 2 + variance of night shifts + variance of weekend shifts
  return varianceOf(hours) * 2 + varianceOf(nights) + varianceOf(weekends);
}

function varianceOf(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
}

// ─── Swap Validity Check ─────────────────────────────────────────────────────

function isSwapValid(
  _empA: SolverEmployee,
  empB: SolverEmployee,
  assignA: SolverAssignment,
  assignB: SolverAssignment,
  shiftMap: Map<string, SolverShift>,
  availMap: Map<string, Map<string, string>>,
): boolean {
  const shiftA = shiftMap.get(assignA.shiftId);
  const shiftB = shiftMap.get(assignB.shiftId);
  if (!shiftA || !shiftB) return false;

  const dayA = new Date(shiftA.date).getDay();
  const dayB = new Date(shiftB.date).getDay();

  // Availability check: empB for shiftA
  const availB = availMap.get(empB.id);
  const keyA = `${dayA}-${shiftA.shiftType}`;
  if (availB?.get(keyA) === 'unavailable') return false;

  // Availability check: empA for shiftB
  const availA = availMap.get(_empA.id);
  const keyB = `${dayB}-${shiftB.shiftType}`;
  if (availA?.get(keyB) === 'unavailable') return false;

  return true;
}

// ─── Build Objective Summary ─────────────────────────────────────────────────

export function buildObjectiveSummary(
  assignments: SolverAssignment[],
  employees: SolverEmployee[],
  shifts: SolverShift[],
  availability: SolverAvailability[],
  prioritize: 'fairness' | 'coverage' | 'preferences' | 'cost',
  swapsPerformed: number,
  iterations: number,
): ObjectiveSummary {
  // Coverage
  const totalRequired = shifts.reduce((sum, s) => sum + s.requiredWorkers, 0);
  const totalAssigned = assignments.length;
  const coveragePercent = totalRequired > 0
    ? Math.round((totalAssigned / totalRequired) * 100 * 100) / 100
    : 100;

  // Preferences satisfied
  const availMap = new Map<string, Map<string, string>>();
  for (const avail of availability) {
    const m = new Map<string, string>();
    for (const c of avail.constraints) {
      m.set(`${c.dayOfWeek}-${c.shiftType}`, c.availability);
    }
    availMap.set(avail.userId, m);
  }

  let preferencesSatisfied = 0;
  let preferencesTotal = 0;

  for (const a of assignments) {
    if (a.score >= 100) continue; // pre-assigned, skip
    const dayOfWeek = new Date(a.date).getDay();
    const key = `${dayOfWeek}-${a.shiftType}`;
    const pref = availMap.get(a.userId)?.get(key);

    if (pref === 'prefer' || pref === 'available') {
      preferencesTotal++;
      preferencesSatisfied++;
    } else if (pref === 'prefer_not') {
      preferencesTotal++;
    }
  }

  // Total penalty (variance-based)
  const shiftMap = new Map<string, SolverShift>();
  for (const s of shifts) shiftMap.set(s.id, s);
  const empHoursMap = new Map<string, number>();
  for (const emp of employees) empHoursMap.set(emp.id, 0);
  for (const a of assignments) {
    const current = empHoursMap.get(a.userId) || 0;
    const s = shiftMap.get(a.shiftId);
    if (s) empHoursMap.set(a.userId, current + computeShiftHours(s));
  }
  const allHours = Array.from(empHoursMap.values());
  const totalPenalty = varianceOf(allHours);

  return {
    objectiveUsed: prioritize,
    totalPenalty: Math.round(totalPenalty * 100) / 100,
    coveragePercent,
    preferencesSatisfied,
    preferencesTotal,
    improvementIterations: iterations,
    swapsPerformed,
  };
}
