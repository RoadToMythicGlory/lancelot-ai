/**
 * Shift Solver Types
 *
 * Pure TypeScript DTOs for the deterministic shift solver.
 * No database or LLM dependencies.
 *
 * These types are the ONLY contract between the data adapter and the solver engine.
 * The solver operates exclusively on these DTOs.
 */

// ─── Solver Version ──────────────────────────────────────────────────────────

export const SOLVER_VERSION = '1.0.0';

// ─── Input DTOs (from data adapter) ──────────────────────────────────────────

export interface SolverEmployee {
  id: string;
  displayName: string;
  department: string;
  roles: string[];
  employmentPercentage: number;
  isActive: boolean;
}

export interface SolverShift {
  id: string;
  date: string; // YYYY-MM-DD
  shiftType: string; // morning, afternoon, night
  department: string;
  requiredWorkers: number;
  assignedWorkers: Array<{
    userId: string;
    role: string;
  }>;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

export interface SolverAvailability {
  userId: string;
  weekStartDate: string;
  constraints: Array<{
    dayOfWeek: number;
    shiftType: string;
    availability: 'available' | 'unavailable' | 'prefer' | 'prefer_not';
  }>;
}

export interface SolverHistoricalLoad {
  userId: string;
  totalHours: number;
  nightShifts: number;
  weekendShifts: number;
  heavyShifts: number;
  periodDays: number;
}

// ─── Solver Configuration ────────────────────────────────────────────────────

export interface SolverConstraints {
  minRestHours: number;
  maxConsecutiveDays: number;
  maxHoursPerWeek: number;
  respectPreferences: boolean;
  allowOvertime: boolean;
}

export interface SolverOptions {
  constraints: SolverConstraints;
  prioritize: 'fairness' | 'coverage' | 'preferences' | 'cost';
  maxImprovementIterations: number;
}

export const DEFAULT_SOLVER_CONSTRAINTS: SolverConstraints = {
  minRestHours: 11,
  maxConsecutiveDays: 6,
  maxHoursPerWeek: 42,
  respectPreferences: true,
  allowOvertime: false,
};

export const DEFAULT_SOLVER_OPTIONS: SolverOptions = {
  constraints: DEFAULT_SOLVER_CONSTRAINTS,
  prioritize: 'fairness',
  maxImprovementIterations: 100,
};

// ─── Solver Input Bundle ─────────────────────────────────────────────────────

export interface SolverInput {
  employees: SolverEmployee[];
  shifts: SolverShift[];
  availability: SolverAvailability[];
  historicalLoad: SolverHistoricalLoad[];
  options: SolverOptions;
}

// ─── Solver Output ───────────────────────────────────────────────────────────

export interface SolverAssignment {
  shiftId: string;
  userId: string;
  userName: string;
  role: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  department: string;
  score: number;
  confidence: number;
}

export interface SolverConflict {
  type: 'understaffed' | 'overstaffed' | 'no_qualified' | 'constraint_violation' | 'fairness_gap';
  severity: 'error' | 'warning' | 'info';
  description: string;
  affectedShiftId?: string;
  affectedUserId?: string;
  suggestion?: string;
}

export interface EmployeeFairness {
  userId: string;
  userName: string;
  totalHours: number;
  nightShifts: number;
  weekendShifts: number;
  heavyShifts: number;
  deviationFromAverage: number;
}

export interface FairnessSummary {
  employeeMetrics: EmployeeFairness[];
  averageHours: number;
  standardDeviation: number;
  maxDeviation: number;
  nightShiftVariance: number;
  weekendShiftVariance: number;
  fairnessScore: number; // 0-100, higher = more fair
}

export interface ObjectiveSummary {
  objectiveUsed: 'fairness' | 'coverage' | 'preferences' | 'cost';
  totalPenalty: number;
  coveragePercent: number;
  preferencesSatisfied: number;
  preferencesTotal: number;
  improvementIterations: number;
  swapsPerformed: number;
}

export interface SolverResult {
  assignments: SolverAssignment[];
  conflicts: SolverConflict[];
  fairnessSummary: FairnessSummary;
  objectiveSummary: ObjectiveSummary;
  solverStatus: 'optimal' | 'feasible' | 'infeasible' | 'timeout';
  solverVersion: string;
  solverTimeMs: number;
}
