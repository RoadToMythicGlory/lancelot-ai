/**
 * Shift Solver Module
 *
 * Deterministic shift scheduling engine.
 * Exports: types, solver, fairness, improvement.
 *
 * This module contains ZERO database or LLM dependencies.
 * All data access goes through the shift facts provider interface.
 */

export * from './types';
export {
  solve,
  computeShiftHours,
  isWeekendDay,
  isNightShift,
  isHeavyShift,
  scoreEmployeeForShift,
} from './solver';
export type { EmployeeTracking } from './solver';
export { computeFairness } from './fairness';
export { improveAssignments, buildObjectiveSummary } from './improvement';
export type { ImprovementResult } from './improvement';
