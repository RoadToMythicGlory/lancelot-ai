/**
 * ShiftSchedule Schema
 * 
 * Structured output for shift scheduling (AI explanation layer over OR-Tools).
 */

import { z } from 'zod';

// Shift assignment status
export const AssignmentStatusSchema = z.enum([
  'assigned',
  'pending',
  'conflict',
  'unassigned',
]);

export type AssignmentStatus = z.infer<typeof AssignmentStatusSchema>;

// Individual shift assignment
export const ShiftAssignmentSchema = z.object({
  shiftId: z.string(),
  userId: z.string(),
  userName: z.string(),
  role: z.string(),
  date: z.string(), // YYYY-MM-DD
  shiftType: z.string(), // morning, evening, night, etc.
  startTime: z.string(), // HH:MM
  endTime: z.string(), // HH:MM
  department: z.string(),
  status: AssignmentStatusSchema,
  notes: z.string().optional(),
  // ─── v1.1 Solver additions (optional, additive) ───
  score: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type ShiftAssignment = z.infer<typeof ShiftAssignmentSchema>;

// Constraint violation
export const ConstraintViolationSchema = z.object({
  type: z.enum([
    'max_hours',
    'min_rest',
    'consecutive_days',
    'skill_mismatch',
    'preference',
    'availability',
    'overtime',
    'other',
  ]),
  severity: z.enum(['error', 'warning', 'info']),
  description: z.string(),
  affectedUserId: z.string().optional(),
  affectedShiftId: z.string().optional(),
  suggestion: z.string().optional(),
});

export type ConstraintViolation = z.infer<typeof ConstraintViolationSchema>;

// Schedule statistics
export const ScheduleStatsSchema = z.object({
  totalShifts: z.number().int().min(0),
  assignedShifts: z.number().int().min(0),
  unassignedShifts: z.number().int().min(0),
  assignmentPercentage: z.number().min(0).max(100),
  totalEmployees: z.number().int().min(0),
  totalHoursAssigned: z.number().min(0),
  averageHoursPerEmployee: z.number().min(0),
  constraintViolations: z.number().int().min(0),
});

export type ScheduleStats = z.infer<typeof ScheduleStatsSchema>;

// ─── v1.1 Solver additions (optional, additive) ─────────────────────────────

// Solver conflict (richer than ConstraintViolation, optional companion field)
export const SolverConflictSchema = z.object({
  type: z.enum(['understaffed', 'overstaffed', 'no_qualified', 'constraint_violation', 'fairness_gap']),
  severity: z.enum(['error', 'warning', 'info']),
  description: z.string(),
  affectedShiftId: z.string().optional(),
  affectedUserId: z.string().optional(),
  suggestion: z.string().optional(),
});

export type SolverConflict = z.infer<typeof SolverConflictSchema>;

// Per-employee fairness metrics
export const EmployeeFairnessSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  totalHours: z.number(),
  nightShifts: z.number().int(),
  weekendShifts: z.number().int(),
  heavyShifts: z.number().int(),
  deviationFromAverage: z.number(),
});

export type EmployeeFairnessMetric = z.infer<typeof EmployeeFairnessSchema>;

// Fairness summary for the schedule
export const FairnessSummarySchema = z.object({
  employeeMetrics: z.array(EmployeeFairnessSchema),
  averageHours: z.number(),
  standardDeviation: z.number(),
  maxDeviation: z.number(),
  nightShiftVariance: z.number(),
  weekendShiftVariance: z.number(),
  fairnessScore: z.number().min(0).max(100),
});

export type FairnessSummaryType = z.infer<typeof FairnessSummarySchema>;

// Objective summary for the solver run
export const ObjectiveSummarySchema = z.object({
  objectiveUsed: z.enum(['fairness', 'coverage', 'preferences', 'cost']),
  totalPenalty: z.number(),
  coveragePercent: z.number(),
  preferencesSatisfied: z.number().int(),
  preferencesTotal: z.number().int(),
  improvementIterations: z.number().int(),
  swapsPerformed: z.number().int(),
});

export type ObjectiveSummaryType = z.infer<typeof ObjectiveSummarySchema>;

// ─── End v1.1 Solver additions ───────────────────────────────────────────────

// Complete ShiftSchedule
export const ShiftScheduleSchema = z.object({
  id: z.string().uuid(),
  weekStartDate: z.string(), // YYYY-MM-DD
  weekEndDate: z.string(),
  department: z.string(),
  assignments: z.array(ShiftAssignmentSchema),
  violations: z.array(ConstraintViolationSchema),
  stats: ScheduleStatsSchema,
  explanation: z.string(), // AI-generated explanation
  alternativeSuggestions: z.array(z.string()).optional(),
  generatedAt: z.string().datetime(),
  solverStatus: z.enum(['optimal', 'feasible', 'infeasible', 'timeout']),
  solverTimeMs: z.number().optional(),
  // ─── v1.1 Solver additions (optional, additive) ───
  conflicts: z.array(SolverConflictSchema).optional(),
  fairnessSummary: FairnessSummarySchema.optional(),
  objectiveSummary: ObjectiveSummarySchema.optional(),
  requiresApproval: z.boolean().optional(),
  solverVersion: z.string().optional(),
});

export type ShiftSchedule = z.infer<typeof ShiftScheduleSchema>;

// Request input for shift scheduling
export const ShiftScheduleRequestSchema = z.object({
  weekStartDate: z.string(),
  department: z.string(),
  constraints: z.object({
    minRestHours: z.number().optional(),
    maxConsecutiveDays: z.number().optional(),
    maxHoursPerWeek: z.number().optional(),
    respectPreferences: z.boolean().optional(),
    allowOvertime: z.boolean().optional(),
  }).optional(),
  prioritize: z.enum(['fairness', 'coverage', 'preferences', 'cost']).optional(),
  additionalContext: z.string().optional(),
});

export type ShiftScheduleRequest = z.infer<typeof ShiftScheduleRequestSchema>;

export default ShiftScheduleSchema;
