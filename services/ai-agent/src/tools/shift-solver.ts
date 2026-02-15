/**
 * Shift Solver Tool
 * 
 * Intelligent shift scheduling with constraint solving.
 * Uses a TypeScript-based solver with architecture ready for OR-Tools integration.
 */

import { v4 as uuidv4 } from 'uuid';
import { getLLMProvider } from '../llm';
import { SHIFT_SCHEDULER_PROMPT } from '../llm/prompt-templates';
import { createLogger } from '../utils/logger';
import { connectMongoDB } from '../data/mongodb-adapter';
import {
  ShiftSchedule,
  ShiftScheduleRequest,
  ShiftAssignment,
  ConstraintViolation,
  ScheduleStats,
} from '../schemas/shift-schedule';

const logger = createLogger('shift-solver');

/**
 * Employee from database
 */
interface Employee {
  _id: string;
  displayName: string;
  department: string;
  roles?: string[];
  employmentPercentage?: number;
  isActive: boolean;
}

/**
 * Shift from database
 */
interface Shift {
  _id: string;
  date: string;
  shiftType: string;
  department: string;
  requiredWorkers: number;
  assignedWorkers: Array<{
    userId: string;
    role: string;
  }>;
  startTime?: string;
  endTime?: string;
}

/**
 * Availability constraint
 */
interface AvailabilityConstraint {
  userId: string;
  weekStartDate: string;
  constraints: Array<{
    dayOfWeek: number;
    shiftType: string;
    availability: 'available' | 'unavailable' | 'prefer' | 'prefer_not';
  }>;
}

/**
 * Get employees for a department
 */
async function getEmployees(department: string): Promise<Employee[]> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<Employee>('users');
    
    return await collection.find({
      $or: [
        { department },
        { 'departments.departmentId': department },
      ],
      isActive: true,
    }).toArray();
  } catch (error) {
    logger.error('Failed to fetch employees', { error: (error as Error).message });
    return [];
  }
}

/**
 * Get shifts for a week
 */
async function getShifts(weekStart: string, department: string): Promise<Shift[]> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<Shift>('shifts');
    
    const startDate = new Date(weekStart);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
    
    return await collection.find({
      department,
      date: {
        $gte: weekStart,
        $lt: endDate.toISOString().split('T')[0],
      },
    }).toArray();
  } catch (error) {
    logger.error('Failed to fetch shifts', { error: (error as Error).message });
    return [];
  }
}

/**
 * Get availability constraints
 */
async function getAvailabilityConstraints(
  weekStart: string,
  userIds: string[]
): Promise<AvailabilityConstraint[]> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<AvailabilityConstraint>('availabilityConstraints');
    
    return await collection.find({
      weekStartDate: weekStart,
      userId: { $in: userIds },
    }).toArray();
  } catch (error) {
    logger.error('Failed to fetch availability', { error: (error as Error).message });
    return [];
  }
}

/**
 * Simple constraint-based solver
 * This is a greedy algorithm - for optimal solutions, integrate with OR-Tools
 */
function solveSchedule(
  shifts: Shift[],
  employees: Employee[],
  constraints: AvailabilityConstraint[],
  options: ShiftScheduleRequest['constraints'] = {}
): {
  assignments: ShiftAssignment[];
  violations: ConstraintViolation[];
  status: 'optimal' | 'feasible' | 'infeasible';
} {
  const assignments: ShiftAssignment[] = [];
  const violations: ConstraintViolation[] = [];
  
  const minRestHours = options.minRestHours || 11;
  const maxConsecutiveDays = options.maxConsecutiveDays || 6;
  const maxHoursPerWeek = options.maxHoursPerWeek || 42;
  
  // Track employee assignments
  const employeeAssignments: Map<string, {
    shifts: string[];
    hoursWorked: number;
    lastShiftEnd: Date | null;
    consecutiveDays: number;
  }> = new Map();
  
  // Initialize tracking
  for (const emp of employees) {
    employeeAssignments.set(emp._id, {
      shifts: [],
      hoursWorked: 0,
      lastShiftEnd: null,
      consecutiveDays: 0,
    });
  }
  
  // Build availability lookup
  const availabilityMap: Map<string, Map<string, string>> = new Map();
  for (const constraint of constraints) {
    const userMap: Map<string, string> = new Map();
    for (const c of constraint.constraints) {
      userMap.set(`${c.dayOfWeek}-${c.shiftType}`, c.availability);
    }
    availabilityMap.set(constraint.userId, userMap);
  }
  
  // Sort shifts by date and priority
  const sortedShifts = [...shifts].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // Process each shift
  for (const shift of sortedShifts) {
    const shiftDate = new Date(shift.date);
    const dayOfWeek = shiftDate.getDay();
    
    // Calculate shift duration (default 8 hours)
    let shiftHours = 8;
    if (shift.startTime && shift.endTime) {
      const start = parseInt(shift.startTime.split(':')[0]);
      const end = parseInt(shift.endTime.split(':')[0]);
      shiftHours = end > start ? end - start : 24 - start + end;
    }
    
    // Current assignments for this shift
    const currentlyAssigned = shift.assignedWorkers?.length || 0;
    const needed = shift.requiredWorkers - currentlyAssigned;
    
    if (needed <= 0) {
      // Shift already fully staffed
      for (const assigned of shift.assignedWorkers || []) {
        assignments.push({
          shiftId: shift._id,
          userId: assigned.userId,
          userName: employees.find(e => e._id === assigned.userId)?.displayName || 'Unknown',
          role: assigned.role,
          date: shift.date,
          shiftType: shift.shiftType,
          startTime: shift.startTime || '09:00',
          endTime: shift.endTime || '17:00',
          department: shift.department,
          status: 'assigned',
        });
      }
      continue;
    }
    
    // Find available employees
    const availableEmployees: Array<{
      employee: Employee;
      score: number;
    }> = [];
    
    for (const employee of employees) {
      const tracking = employeeAssignments.get(employee._id)!;
      const availability = availabilityMap.get(employee._id);
      
      // Check hard constraints
      
      // Already at max hours?
      if (tracking.hoursWorked + shiftHours > maxHoursPerWeek) {
        continue;
      }
      
      // Already at max consecutive days?
      if (tracking.consecutiveDays >= maxConsecutiveDays) {
        continue;
      }
      
      // Check rest period
      if (tracking.lastShiftEnd) {
        const hoursSinceLastShift = 
          (shiftDate.getTime() - tracking.lastShiftEnd.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastShift < minRestHours) {
          continue;
        }
      }
      
      // Check availability preference
      let score = 50; // Base score
      const key = `${dayOfWeek}-${shift.shiftType}`;
      const pref = availability?.get(key);
      
      if (pref === 'unavailable') {
        continue; // Hard constraint
      } else if (pref === 'prefer') {
        score += 30;
      } else if (pref === 'prefer_not') {
        score -= 20;
      } else if (pref === 'available') {
        score += 10;
      }
      
      // Prefer employees with fewer hours (fairness)
      score -= (tracking.hoursWorked / maxHoursPerWeek) * 20;
      
      // Prefer full-time employees
      const employmentPct = employee.employmentPercentage || 100;
      score += (employmentPct / 100) * 10;
      
      availableEmployees.push({ employee, score });
    }
    
    // Sort by score and assign
    availableEmployees.sort((a, b) => b.score - a.score);
    
    let assignedCount = 0;
    for (const { employee } of availableEmployees) {
      if (assignedCount >= needed) break;
      
      const tracking = employeeAssignments.get(employee._id)!;
      
      // Create assignment
      assignments.push({
        shiftId: shift._id,
        userId: employee._id,
        userName: employee.displayName,
        role: employee.roles?.[0] || 'worker',
        date: shift.date,
        shiftType: shift.shiftType,
        startTime: shift.startTime || '09:00',
        endTime: shift.endTime || '17:00',
        department: shift.department,
        status: 'assigned',
      });
      
      // Update tracking
      tracking.shifts.push(shift._id);
      tracking.hoursWorked += shiftHours;
      tracking.lastShiftEnd = new Date(shiftDate);
      tracking.lastShiftEnd.setHours(parseInt((shift.endTime || '17:00').split(':')[0]));
      tracking.consecutiveDays++;
      
      assignedCount++;
    }
    
    // Check if we couldn't fill all slots
    if (assignedCount < needed) {
      violations.push({
        type: 'other',
        severity: 'warning',
        description: `Shift on ${shift.date} (${shift.shiftType}) needs ${needed} workers but only ${assignedCount} available`,
        affectedShiftId: shift._id,
        suggestion: 'Consider adjusting constraints or adding more staff',
      });
    }
  }
  
  // Determine solver status
  let status: 'optimal' | 'feasible' | 'infeasible' = 'optimal';
  if (violations.length > 0) {
    status = violations.some(v => v.severity === 'error') ? 'infeasible' : 'feasible';
  }
  
  return { assignments, violations, status };
}

/**
 * Generate explanation using LLM
 */
async function generateExplanation(
  schedule: ShiftSchedule,
  request: ShiftScheduleRequest
): Promise<string> {
  try {
    const provider = getLLMProvider();
    const isAvailable = await provider.isAvailable();
    
    if (!isAvailable) {
      return `לוח משמרות נוצר עבור ${schedule.department} לשבוע של ${schedule.weekStartDate}. ` +
        `${schedule.stats.assignedShifts} מתוך ${schedule.stats.totalShifts} משמרות אוישו (${schedule.stats.assignmentPercentage.toFixed(0)}%).`;
    }
    
    const prompt = `Explain this shift schedule briefly in Hebrew:
Department: ${schedule.department}
Week: ${schedule.weekStartDate}
Assigned: ${schedule.stats.assignedShifts}/${schedule.stats.totalShifts} shifts
Violations: ${schedule.violations.length}

Keep it under 3 sentences, professional tone.`;
    
    const result = await provider.generate(prompt, {
      systemPrompt: SHIFT_SCHEDULER_PROMPT,
      temperature: 0.5,
      maxTokens: 256,
    });
    
    return result.text;
  } catch (error) {
    logger.warn('Failed to generate explanation', { error: (error as Error).message });
    return `לוח משמרות נוצר בהצלחה.`;
  }
}

/**
 * Parse shift schedule request from natural language
 */
export async function parseShiftRequest(message: string): Promise<Partial<ShiftScheduleRequest>> {
  const request: Partial<ShiftScheduleRequest> = {};
  const lower = message.toLowerCase();
  
  // Detect department
  const departments = ['mcr', 'studio', 'production', 'graphics', 'engineering'];
  for (const dept of departments) {
    if (lower.includes(dept)) {
      request.department = dept;
      break;
    }
  }
  
  // Detect week reference
  if (lower.includes('השבוע') || lower.includes('this week')) {
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    request.weekStartDate = sunday.toISOString().split('T')[0];
  } else if (lower.includes('הבא') || lower.includes('next')) {
    const today = new Date();
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + (7 - today.getDay()));
    request.weekStartDate = nextSunday.toISOString().split('T')[0];
  }
  
  // Detect prioritization
  if (lower.includes('הוגן') || lower.includes('fair')) {
    request.prioritize = 'fairness';
  } else if (lower.includes('כיסוי') || lower.includes('coverage')) {
    request.prioritize = 'coverage';
  }
  
  return request;
}

/**
 * Build a shift schedule
 */
export async function buildShiftSchedule(request: ShiftScheduleRequest): Promise<ShiftSchedule> {
  const startTime = Date.now();
  
  logger.info('Building shift schedule', { request });
  
  // Get data
  const employees = await getEmployees(request.department);
  const shifts = await getShifts(request.weekStartDate, request.department);
  const userIds = employees.map(e => e._id);
  const constraints = await getAvailabilityConstraints(request.weekStartDate, userIds);
  
  // Solve schedule
  const { assignments, violations, status } = solveSchedule(
    shifts,
    employees,
    constraints,
    request.constraints
  );
  
  // Calculate stats
  const totalShifts = shifts.reduce((sum, s) => sum + s.requiredWorkers, 0);
  const assignedShifts = assignments.length;
  
  const stats: ScheduleStats = {
    totalShifts,
    assignedShifts,
    unassignedShifts: totalShifts - assignedShifts,
    assignmentPercentage: totalShifts > 0 ? (assignedShifts / totalShifts) * 100 : 0,
    totalEmployees: employees.length,
    totalHoursAssigned: assignments.length * 8, // Approximate
    averageHoursPerEmployee: employees.length > 0 ? (assignments.length * 8) / employees.length : 0,
    constraintViolations: violations.length,
  };
  
  // Calculate week end date
  const weekStart = new Date(request.weekStartDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  // Build schedule object
  const schedule: ShiftSchedule = {
    id: uuidv4(),
    weekStartDate: request.weekStartDate,
    weekEndDate: weekEnd.toISOString().split('T')[0],
    department: request.department,
    assignments,
    violations,
    stats,
    explanation: '', // Will be filled below
    generatedAt: new Date().toISOString(),
    solverStatus: status,
    solverTimeMs: Date.now() - startTime,
  };
  
  // Generate explanation
  schedule.explanation = await generateExplanation(schedule, request);
  
  logger.info('Shift schedule built', {
    id: schedule.id,
    status: schedule.solverStatus,
    assignments: schedule.assignments.length,
    violations: schedule.violations.length,
    solverTimeMs: schedule.solverTimeMs,
  });
  
  return schedule;
}

// ─── Constraint Extraction Mode ──────────────────────────────────────────────

/**
 * Result of constraint extraction from natural language.
 */
export interface ExtractedConstraints {
  department?: string;
  weekStartDate?: string;
  roles: string[];
  hardConstraints: {
    minRestHours?: number;
    maxConsecutiveDays?: number;
    maxHoursPerWeek?: number;
  };
  availabilityNotes: string[];
  missingConstraints: string[];
}

/**
 * Extract scheduling constraints from a natural-language message.
 *
 * The LLM does NOT generate a schedule. It only extracts structured
 * constraints from the user's request. If key information is missing,
 * `missingConstraints` lists what to ask the user for.
 */
export function extractShiftConstraints(message: string): ExtractedConstraints {
  const lower = message.toLowerCase();
  const result: ExtractedConstraints = {
    roles: [],
    hardConstraints: {},
    availabilityNotes: [],
    missingConstraints: [],
  };

  // Department
  const departments = ['mcr', 'studio', 'production', 'graphics', 'engineering'];
  for (const dept of departments) {
    if (lower.includes(dept)) {
      result.department = dept;
      break;
    }
  }
  if (!result.department) {
    result.missingConstraints.push('department (מחלקה)');
  }

  // Week reference
  if (lower.includes('השבוע') || lower.includes('this week')) {
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    result.weekStartDate = sunday.toISOString().split('T')[0];
  } else if (lower.includes('הבא') || lower.includes('next')) {
    const today = new Date();
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + (7 - today.getDay()));
    result.weekStartDate = nextSunday.toISOString().split('T')[0];
  } else {
    // Try to extract a date
    const dateMatch = lower.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      result.weekStartDate = dateMatch[1];
    } else {
      result.missingConstraints.push('weekStartDate (שבוע)');
    }
  }

  // Roles
  const rolePatterns: Array<{ pattern: RegExp; role: string }> = [
    { pattern: /במאי|director/i, role: 'director' },
    { pattern: /מפיק|producer/i, role: 'producer' },
    { pattern: /עורך|editor/i, role: 'editor' },
    { pattern: /צלם|camera/i, role: 'camera' },
    { pattern: /טכנאי|technician/i, role: 'technician' },
    { pattern: /מגיש|presenter|anchor/i, role: 'presenter' },
  ];
  for (const { pattern, role } of rolePatterns) {
    if (pattern.test(lower)) {
      result.roles.push(role);
    }
  }

  // Hard constraints mentioned
  const restMatch = lower.match(/(?:מנוחה|rest)\s*(?:of|של)?\s*(\d+)\s*(?:שעות|hours)/i);
  if (restMatch) {
    result.hardConstraints.minRestHours = parseInt(restMatch[1], 10);
  }

  const maxDaysMatch = lower.match(/(?:מקסימום|max|עד)\s*(\d+)\s*(?:ימים|days)\s*(?:רצופים|consecutive)?/i);
  if (maxDaysMatch) {
    result.hardConstraints.maxConsecutiveDays = parseInt(maxDaysMatch[1], 10);
  }

  const maxHoursMatch = lower.match(/(?:מקסימום|max|עד)\s*(\d+)\s*(?:שעות|hours)\s*(?:בשבוע|per week)?/i);
  if (maxHoursMatch) {
    result.hardConstraints.maxHoursPerWeek = parseInt(maxHoursMatch[1], 10);
  }

  // Availability notes (free text mentions)
  const availabilityPatterns = [
    /(?:לא\s*(?:יכול|זמין)|unavailable|can'?t)\s+(.+?)(?:\.|$)/gi,
    /(?:מעדיף|prefer)\s+(.+?)(?:\.|$)/gi,
    /(?:חופש|vacation|חופשה)\s+(.+?)(?:\.|$)/gi,
  ];
  for (const pat of availabilityPatterns) {
    let match;
    while ((match = pat.exec(message)) !== null) {
      result.availabilityNotes.push(match[0].trim());
    }
  }

  return result;
}

// ─── End Constraint Extraction ───────────────────────────────────────────────

// ─── Deterministic Solver Pipeline (v1.1) ────────────────────────────────────

import {
  solve,
  computeFairness,
  improveAssignments,
  buildObjectiveSummary,
  SolverInput,
  SolverResult,
  SolverOptions,
  DEFAULT_SOLVER_OPTIONS,
  SOLVER_VERSION,
} from '../shift';
import { solveViaOrtools } from '../shift/ortools-client';
import { getShiftFactsProvider } from '../data/providers';

/**
 * Engine selection: 'ortools' (production default) or 'ts' (explicit opt-in).
 * Set via SHIFT_SOLVER_ENGINE env var.
 *
 * TRIPWIRE: If 'ts' is selected while NODE_ENV=production, a warning counter
 * is incremented and logged via the monitoring module.
 */
function getShiftSolverEngine(): 'ortools' | 'ts' {
  const engine = (process.env.SHIFT_SOLVER_ENGINE || 'ortools').toLowerCase();
  if (engine === 'ts') {
    if (process.env.NODE_ENV === 'production') {
      // Lazy import to avoid circular deps at module load
      const { recordTripwireTsSolverInProd } = require('../middleware/monitoring');
      recordTripwireTsSolverInProd();
    }
    return 'ts';
  }
  return 'ortools';
}

/**
 * Pipeline request for the deterministic solver.
 */
export interface SolverPipelineRequest {
  department: string;
  weekStartDate: string;
  prioritize?: 'fairness' | 'coverage' | 'preferences' | 'cost';
  constraints?: {
    minRestHours?: number;
    maxConsecutiveDays?: number;
    maxHoursPerWeek?: number;
    respectPreferences?: boolean;
    allowOvertime?: boolean;
  };
  traceId?: string;
}

/**
 * Pipeline result includes the full ShiftSchedule plus solver metadata.
 */
export interface SolverPipelineResult {
  schedule: ShiftSchedule;
  solverResult: SolverResult;
  dataWarnings: string[];
}

/**
 * Clarification result when data is missing.
 */
export interface SolverClarification {
  type: 'clarification';
  extractedSoFar: Record<string, unknown>;
  missingData: string[];
  message: string;
}

/**
 * Run the full deterministic solver pipeline.
 *
 * Flow:
 * 1. Fetch facts via data adapter (employees, shifts, availability, history)
 * 2. If critical data missing → return clarification (not failure)
 * 3. Run deterministic solver (greedy assignment)
 * 4. Run iterative improvement (swap-based)
 * 5. Compute fairness metrics
 * 6. Build objective summary
 * 7. Generate explanation (LLM, non-critical)
 * 8. Return structured output with requiresApproval: true
 *
 * Failures are reserved for transport/auth/timeout errors only.
 * Missing business data returns clarification.
 * Read-only: no mutations, no write-back.
 */
export async function runSolverPipeline(
  request: SolverPipelineRequest,
): Promise<SolverPipelineResult | SolverClarification> {
  const startTime = Date.now();
  const traceId = request.traceId;
  const allWarnings: string[] = [];
  const provider = getShiftFactsProvider();

  logger.info('Starting solver pipeline', {
    department: request.department,
    weekStartDate: request.weekStartDate,
    prioritize: request.prioritize,
    solverVersion: SOLVER_VERSION,
    dataProvider: provider.source,
  }, traceId);

  // ── Step 1: Fetch facts ──────────────────────────────────────────────────

  const employeesResult = await provider.fetchEmployees(request.department, traceId);
  allWarnings.push(...employeesResult.warnings);

  if (employeesResult.data.length === 0) {
    logger.info('No employees found, returning clarification', {
      department: request.department,
    }, traceId);
    return {
      type: 'clarification',
      extractedSoFar: { department: request.department, weekStartDate: request.weekStartDate },
      missingData: ['employees'],
      message: `לא נמצאו עובדים פעילים במחלקה "${request.department}". ` +
        'אנא ודא שהמחלקה נכונה או הוסף עובדים למחלקה.',
    };
  }

  const shiftsResult = await provider.fetchShifts(request.weekStartDate, request.department, traceId);
  allWarnings.push(...shiftsResult.warnings);

  if (shiftsResult.data.length === 0) {
    logger.info('No shifts found, returning clarification', {
      department: request.department,
      weekStartDate: request.weekStartDate,
    }, traceId);
    return {
      type: 'clarification',
      extractedSoFar: {
        department: request.department,
        weekStartDate: request.weekStartDate,
        employeeCount: employeesResult.data.length,
      },
      missingData: ['shifts'],
      message: `לא נמצאו משמרות עבור מחלקת "${request.department}" בשבוע של ${request.weekStartDate}. ` +
        'אנא צור משמרות לשבוע זה לפני הפעלת הפתרון.',
    };
  }

  const userIds = employeesResult.data.map(e => e.id);
  const availResult = await provider.fetchAvailability(request.weekStartDate, userIds, traceId);
  allWarnings.push(...availResult.warnings);

  if (availResult.data.length === 0 && userIds.length > 0) {
    logger.info('No availability constraints found, returning clarification', {
      department: request.department,
      weekStartDate: request.weekStartDate,
      employeeCount: employeesResult.data.length,
    }, traceId);
    return {
      type: 'clarification',
      extractedSoFar: {
        department: request.department,
        weekStartDate: request.weekStartDate,
        employeeCount: employeesResult.data.length,
        shiftCount: shiftsResult.data.length,
      },
      missingData: ['availabilityConstraints'],
      message: `לא נמצאו אילוצי זמינות לשבוע של ${request.weekStartDate}. ` +
        'אנא בקש מהעובדים למלא אילוצי זמינות לפני יצירת לוח משמרות.',
    };
  }

  const historyResult = await provider.fetchHistoricalLoad(request.department, userIds, 28, traceId);
  allWarnings.push(...historyResult.warnings);

  // ── Step 2: Build solver options ─────────────────────────────────────────

  const solverOptions: SolverOptions = {
    constraints: {
      minRestHours: request.constraints?.minRestHours ?? DEFAULT_SOLVER_OPTIONS.constraints.minRestHours,
      maxConsecutiveDays: request.constraints?.maxConsecutiveDays ?? DEFAULT_SOLVER_OPTIONS.constraints.maxConsecutiveDays,
      maxHoursPerWeek: request.constraints?.maxHoursPerWeek ?? DEFAULT_SOLVER_OPTIONS.constraints.maxHoursPerWeek,
      respectPreferences: request.constraints?.respectPreferences ?? DEFAULT_SOLVER_OPTIONS.constraints.respectPreferences,
      allowOvertime: request.constraints?.allowOvertime ?? DEFAULT_SOLVER_OPTIONS.constraints.allowOvertime,
    },
    prioritize: request.prioritize || DEFAULT_SOLVER_OPTIONS.prioritize,
    maxImprovementIterations: DEFAULT_SOLVER_OPTIONS.maxImprovementIterations,
  };

  const solverInput: SolverInput = {
    employees: employeesResult.data,
    shifts: shiftsResult.data,
    availability: availResult.data,
    historicalLoad: historyResult.data,
    options: solverOptions,
  };

  // ── Step 3: Run solver (engine-gated) ────────────────────────────────────

  const engine = getShiftSolverEngine();
  logger.info('Solver engine selected', { engine }, traceId);

  let assignments: import('../shift').SolverAssignment[];
  let conflicts: import('../shift').SolverConflict[];
  let tracking: Map<string, import('../shift').EmployeeTracking>;
  let improved: import('../shift').ImprovementResult;
  let fairnessSummary: import('../shift').FairnessSummary;
  let objectiveSummary: import('../shift').ObjectiveSummary;
  let solverStatus: 'optimal' | 'feasible' | 'infeasible' | 'timeout';
  let solverTimeMs: number;

  if (engine === 'ortools') {
    // OR-Tools path: call external microservice. No fallback on failure.
    const ortoolsResult = await solveViaOrtools(solverInput);

    assignments = ortoolsResult.assignments as any;
    conflicts = ortoolsResult.conflicts as any;
    fairnessSummary = ortoolsResult.fairnessSummary;
    objectiveSummary = ortoolsResult.objectiveSummary;
    solverStatus = ortoolsResult.solverStatus as any;
    solverTimeMs = ortoolsResult.solverTimeMs;

    // No improvement step — OR-Tools handles optimization internally
    improved = {
      assignments: ortoolsResult.assignments as any,
      swapsPerformed: 0,
      iterations: 0,
    };
    tracking = new Map();
  } else {
    // TS solver path (explicit opt-in via SHIFT_SOLVER_ENGINE=ts)
    const tsResult = solve(solverInput);
    assignments = tsResult.assignments;
    conflicts = tsResult.conflicts;
    tracking = tsResult.tracking;

    // Step 4: Run improvement (TS solver only)
    improved = improveAssignments(
      assignments,
      employeesResult.data,
      shiftsResult.data,
      availResult.data,
      solverOptions.constraints,
      solverOptions.maxImprovementIterations,
    );

    // Step 5: Compute fairness (TS solver only)
    fairnessSummary = computeFairness(
      employeesResult.data,
      tracking,
      historyResult.data,
    );

    // Step 6: Build objective summary (TS solver only)
    objectiveSummary = buildObjectiveSummary(
      improved.assignments,
      employeesResult.data,
      shiftsResult.data,
      availResult.data,
      solverOptions.prioritize,
      improved.swapsPerformed,
      improved.iterations,
    );

    const hasErrors = conflicts.some(c => c.severity === 'error');
    const hasWarnings = conflicts.length > 0;
    solverStatus = hasErrors ? 'infeasible' : hasWarnings ? 'feasible' : 'optimal';
    solverTimeMs = Date.now() - startTime;
  }

  // ── Step 8: Build ShiftSchedule ──────────────────────────────────────────

  const weekStart = new Date(request.weekStartDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const totalRequired = shiftsResult.data.reduce((sum, s) => sum + s.requiredWorkers, 0);
  const totalAssigned = improved.assignments.length;

  const stats: ScheduleStats = {
    totalShifts: totalRequired,
    assignedShifts: totalAssigned,
    unassignedShifts: totalRequired - totalAssigned,
    assignmentPercentage: totalRequired > 0 ? (totalAssigned / totalRequired) * 100 : 0,
    totalEmployees: employeesResult.data.length,
    totalHoursAssigned: improved.assignments.reduce((sum, a) => {
      const shift = shiftsResult.data.find(s => s.id === a.shiftId);
      if (shift) {
        const start = parseInt(shift.startTime.split(':')[0], 10);
        const end = parseInt(shift.endTime.split(':')[0], 10);
        return sum + (end > start ? end - start : 24 - start + end);
      }
      return sum + 8;
    }, 0),
    averageHoursPerEmployee: 0,
    constraintViolations: conflicts.length,
  };
  stats.averageHoursPerEmployee = employeesResult.data.length > 0
    ? stats.totalHoursAssigned / employeesResult.data.length
    : 0;

  // Map solver assignments to schema ShiftAssignments (with status field)
  const schemaAssignments: ShiftAssignment[] = improved.assignments.map(a => ({
    shiftId: a.shiftId,
    userId: a.userId,
    userName: a.userName,
    role: a.role,
    date: a.date,
    shiftType: a.shiftType,
    startTime: a.startTime,
    endTime: a.endTime,
    department: a.department,
    status: 'assigned' as const,
    score: a.score,
    confidence: a.confidence,
  }));

  // Map solver violations from conflicts
  const schemaViolations: ConstraintViolation[] = conflicts.map(c => ({
    type: 'other' as const,
    severity: c.severity,
    description: c.description,
    affectedShiftId: c.affectedShiftId,
    affectedUserId: c.affectedUserId,
    suggestion: c.suggestion,
  }));

  // ── Step 9: Generate explanation (non-critical) ──────────────────────────

  let explanation = '';
  try {
    const scheduleForExplanation = {
      department: request.department,
      weekStartDate: request.weekStartDate,
      stats,
      violations: schemaViolations,
    } as ShiftSchedule;
    explanation = await generateExplanation(scheduleForExplanation, {
      weekStartDate: request.weekStartDate,
      department: request.department,
      prioritize: request.prioritize,
    } as ShiftScheduleRequest);
  } catch {
    explanation = `לוח משמרות נוצר עבור ${request.department} לשבוע של ${request.weekStartDate}. ` +
      `${totalAssigned} מתוך ${totalRequired} משמרות אוישו. ` +
      `ציון הוגנות: ${fairnessSummary.fairnessScore}/100.`;
  }

  const schedule: ShiftSchedule = {
    id: uuidv4(),
    weekStartDate: request.weekStartDate,
    weekEndDate: weekEnd.toISOString().split('T')[0],
    department: request.department,
    assignments: schemaAssignments,
    violations: schemaViolations,
    stats,
    explanation,
    generatedAt: new Date().toISOString(),
    solverStatus,
    solverTimeMs,
    // v1.1 fields
    conflicts,
    fairnessSummary,
    objectiveSummary,
    requiresApproval: true,
    solverVersion: SOLVER_VERSION,
  };

  const solverResult: SolverResult = {
    assignments: improved.assignments,
    conflicts,
    fairnessSummary,
    objectiveSummary,
    solverStatus,
    solverVersion: SOLVER_VERSION,
    solverTimeMs,
  };

  logger.info('Solver pipeline completed', {
    department: request.department,
    solverVersion: SOLVER_VERSION,
    solverStatus,
    assignedCount: totalAssigned,
    totalRequired,
    conflictCount: conflicts.length,
    fairnessScore: fairnessSummary.fairnessScore,
    objectiveUsed: objectiveSummary.objectiveUsed,
    totalPenalty: objectiveSummary.totalPenalty,
    swapsPerformed: improved.swapsPerformed,
    solverTimeMs,
  }, traceId);

  return { schedule, solverResult, dataWarnings: allWarnings };
}

// ─── End Deterministic Solver Pipeline ───────────────────────────────────────

export default {
  parseShiftRequest,
  buildShiftSchedule,
  extractShiftConstraints,
  runSolverPipeline,
};
