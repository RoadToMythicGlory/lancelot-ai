/**
 * Fairness Metrics Computer
 *
 * Computes fairness metrics for shift assignments.
 * Pure computation - no DB, no LLM, no side effects.
 *
 * Measures:
 * - Total hours per person
 * - Night shift count per person
 * - Weekend shift count per person
 * - Heavy shift count per person
 * - Standard deviation and max deviation from team average
 * - Overall fairness score (0-100)
 */

import {
  FairnessSummary,
  EmployeeFairness,
  SolverEmployee,
  SolverHistoricalLoad,
} from './types';

import { EmployeeTracking } from './solver';

// ─── Main Fairness Computation ───────────────────────────────────────────────

export function computeFairness(
  employees: SolverEmployee[],
  tracking: Map<string, EmployeeTracking>,
  _historicalLoad: SolverHistoricalLoad[],
): FairnessSummary {
  // Build per-employee metrics
  const employeeMetrics: EmployeeFairness[] = [];
  const hoursValues: number[] = [];
  const nightValues: number[] = [];
  const weekendValues: number[] = [];

  for (const emp of employees) {
    const t = tracking.get(emp.id);
    const hours = t?.hoursWorked || 0;
    const nights = t?.nightShifts || 0;
    const weekends = t?.weekendShifts || 0;
    const heavy = t?.heavyShifts || 0;

    hoursValues.push(hours);
    nightValues.push(nights);
    weekendValues.push(weekends);

    employeeMetrics.push({
      userId: emp.id,
      userName: emp.displayName,
      totalHours: hours,
      nightShifts: nights,
      weekendShifts: weekends,
      heavyShifts: heavy,
      deviationFromAverage: 0, // will be set below
    });
  }

  // Compute averages and standard deviations
  const averageHours = mean(hoursValues);
  const stdDev = standardDeviation(hoursValues);
  const maxDev = hoursValues.length > 0
    ? Math.max(...hoursValues.map(h => Math.abs(h - averageHours)))
    : 0;
  const nightVariance = computeVariance(nightValues);
  const weekendVariance = computeVariance(weekendValues);

  // Set deviation per employee
  for (const m of employeeMetrics) {
    m.deviationFromAverage = Math.round((m.totalHours - averageHours) * 100) / 100;
  }

  // Compute fairness score (0-100, higher = more fair)
  // Based on coefficient of variation (lower CV = more fair)
  const cv = averageHours > 0 ? stdDev / averageHours : 0;
  // CV of 0 = perfectly fair (100), CV >= 1 = very unfair (0)
  const fairnessScore = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));

  return {
    employeeMetrics,
    averageHours: Math.round(averageHours * 100) / 100,
    standardDeviation: Math.round(stdDev * 100) / 100,
    maxDeviation: Math.round(maxDev * 100) / 100,
    nightShiftVariance: Math.round(nightVariance * 100) / 100,
    weekendShiftVariance: Math.round(weekendVariance * 100) / 100,
    fairnessScore,
  };
}

// ─── Statistical Helpers ─────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  return values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  return Math.sqrt(computeVariance(values));
}
