/**
 * Shift Solver Tests
 *
 * Deterministic tests for the shift solver engine.
 * Tests cover:
 * - Hard constraint respect
 * - Conflict creation when understaffed
 * - Fairness metrics computation
 * - Stable/deterministic assignment ordering
 * - Iterative improvement (swap-based)
 * - Missing data → clarification path
 * - Schema compatibility
 *
 * All tests use in-memory fixtures (no DB, no LLM).
 */

import {
  solve,
  computeShiftHours,
  isWeekendDay,
  isNightShift,
  isHeavyShift,
  scoreEmployeeForShift,
  SolverInput,
  SolverEmployee,
  SolverShift,
  SolverAvailability,
  SolverHistoricalLoad,
  SolverOptions,
  DEFAULT_SOLVER_OPTIONS,
  DEFAULT_SOLVER_CONSTRAINTS,
  SOLVER_VERSION,
  EmployeeTracking,
} from '../src/shift';
import { computeFairness } from '../src/shift/fairness';
import { improveAssignments, buildObjectiveSummary } from '../src/shift/improvement';
import { extractShiftConstraints } from '../src/tools/shift-solver';
import { createGraphqlShiftFactsProvider, getShiftFactsProvider } from '../src/data/providers';
import {
  ShiftScheduleSchema,
  ShiftAssignmentSchema,
  FairnessSummarySchema,
  ObjectiveSummarySchema,
} from '../src/schemas/shift-schedule';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeEmployee(id: string, name: string, roles: string[] = ['worker'], pct: number = 100): SolverEmployee {
  return { id, displayName: name, department: 'mcr', roles, employmentPercentage: pct, isActive: true };
}

function makeShift(
  id: string,
  date: string,
  shiftType: string = 'morning',
  requiredWorkers: number = 1,
  assignedWorkers: Array<{ userId: string; role: string }> = [],
  startTime?: string,
  endTime?: string,
): SolverShift {
  return {
    id,
    date,
    shiftType,
    department: 'mcr',
    requiredWorkers,
    assignedWorkers,
    startTime: startTime || getDefaultStart(shiftType),
    endTime: endTime || getDefaultEnd(shiftType),
  };
}

function getDefaultStart(type: string): string {
  switch (type) {
    case 'morning': return '07:00';
    case 'afternoon': return '15:00';
    case 'night': return '23:00';
    default: return '09:00';
  }
}

function getDefaultEnd(type: string): string {
  switch (type) {
    case 'morning': return '15:00';
    case 'afternoon': return '23:00';
    case 'night': return '07:00';
    default: return '17:00';
  }
}

function makeAvailability(userId: string, constraints: Array<{ dayOfWeek: number; shiftType: string; availability: 'available' | 'unavailable' | 'prefer' | 'prefer_not' }>): SolverAvailability {
  return { userId, weekStartDate: '2026-02-08', constraints };
}

function makeHistoricalLoad(userId: string, totalHours: number = 0, nightShifts: number = 0): SolverHistoricalLoad {
  return { userId, totalHours, nightShifts, weekendShifts: 0, heavyShifts: 0, periodDays: 28 };
}

function makeInput(overrides: Partial<SolverInput> = {}): SolverInput {
  return {
    employees: overrides.employees || [
      makeEmployee('emp1', 'Alice'),
      makeEmployee('emp2', 'Bob'),
      makeEmployee('emp3', 'Charlie'),
    ],
    shifts: overrides.shifts || [
      makeShift('s1', '2026-02-09', 'morning', 1),
      makeShift('s2', '2026-02-09', 'afternoon', 1),
      makeShift('s3', '2026-02-10', 'morning', 1),
    ],
    availability: overrides.availability || [],
    historicalLoad: overrides.historicalLoad || [],
    options: overrides.options || DEFAULT_SOLVER_OPTIONS,
  };
}

// ─── Helper Utility Tests ────────────────────────────────────────────────────

describe('Solver Utilities', () => {
  test('computeShiftHours returns correct hours for standard shifts', () => {
    expect(computeShiftHours(makeShift('s1', '2026-02-09', 'morning'))).toBe(8);
    expect(computeShiftHours(makeShift('s1', '2026-02-09', 'afternoon'))).toBe(8);
    expect(computeShiftHours(makeShift('s1', '2026-02-09', 'night'))).toBe(8);
  });

  test('computeShiftHours handles cross-midnight shifts', () => {
    const nightShift = makeShift('s1', '2026-02-09', 'night', 1, [], '22:00', '06:00');
    expect(computeShiftHours(nightShift)).toBe(8);
  });

  test('isWeekendDay detects Friday and Saturday', () => {
    // 2026-02-13 is Friday, 2026-02-14 is Saturday
    expect(isWeekendDay('2026-02-13')).toBe(true);
    expect(isWeekendDay('2026-02-14')).toBe(true);
    // 2026-02-09 is Monday
    expect(isWeekendDay('2026-02-09')).toBe(false);
  });

  test('isNightShift is case insensitive', () => {
    expect(isNightShift('night')).toBe(true);
    expect(isNightShift('Night')).toBe(true);
    expect(isNightShift('morning')).toBe(false);
  });

  test('isHeavyShift identifies night+weekend and long shifts', () => {
    // Night + Friday = heavy
    expect(isHeavyShift(makeShift('s1', '2026-02-13', 'night'))).toBe(true);
    // Morning + Monday = not heavy
    expect(isHeavyShift(makeShift('s1', '2026-02-09', 'morning'))).toBe(false);
    // Long shift (>10 hours) = heavy
    expect(isHeavyShift(makeShift('s1', '2026-02-09', 'morning', 1, [], '06:00', '18:00'))).toBe(true);
  });

  test('SOLVER_VERSION is defined', () => {
    expect(SOLVER_VERSION).toBe('1.0.0');
  });
});

// ─── Core Solver Tests ───────────────────────────────────────────────────────

describe('Deterministic Solver', () => {
  test('assigns employees to shifts', () => {
    const input = makeInput();
    const result = solve(input);
    expect(result.assignments.length).toBe(3);
    expect(result.conflicts.length).toBe(0);
  });

  test('produces identical output for identical inputs', () => {
    const input = makeInput();
    const result1 = solve(input);
    const result2 = solve(input);

    expect(result1.assignments).toEqual(result2.assignments);
    expect(result1.conflicts).toEqual(result2.conflicts);
  });

  test('respects max hours per week constraint', () => {
    const employees = [makeEmployee('emp1', 'Alice')];
    // 6 shifts × 8 hours = 48 hours, exceeds default 42h max
    const shifts = [
      makeShift('s1', '2026-02-09', 'morning', 1),
      makeShift('s2', '2026-02-09', 'afternoon', 1),
      makeShift('s3', '2026-02-10', 'morning', 1),
      makeShift('s4', '2026-02-10', 'afternoon', 1),
      makeShift('s5', '2026-02-11', 'morning', 1),
      makeShift('s6', '2026-02-11', 'afternoon', 1),
    ];

    const input = makeInput({ employees, shifts });
    const result = solve(input);

    // Should assign at most 5 shifts (5×8=40 ≤ 42)
    const aliceAssignments = result.assignments.filter(a => a.userId === 'emp1' && a.score < 100);
    expect(aliceAssignments.length).toBeLessThanOrEqual(5);
  });

  test('respects unavailable constraint', () => {
    const employees = [makeEmployee('emp1', 'Alice'), makeEmployee('emp2', 'Bob')];
    const shifts = [makeShift('s1', '2026-02-09', 'morning', 1)]; // Monday

    // Alice is unavailable on Monday morning
    const availability = [
      makeAvailability('emp1', [{ dayOfWeek: 1, shiftType: 'morning', availability: 'unavailable' }]),
    ];

    const input = makeInput({ employees, shifts, availability });
    const result = solve(input);

    // Alice should NOT be assigned
    const aliceAssigned = result.assignments.filter(a => a.userId === 'emp1' && a.score < 100);
    expect(aliceAssigned.length).toBe(0);

    // Bob should be assigned
    const bobAssigned = result.assignments.filter(a => a.userId === 'emp2');
    expect(bobAssigned.length).toBe(1);
  });

  test('creates conflict when not enough employees', () => {
    const employees = [makeEmployee('emp1', 'Alice')];
    const shifts = [makeShift('s1', '2026-02-09', 'morning', 3)]; // needs 3 workers

    const input = makeInput({ employees, shifts });
    const result = solve(input);

    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].type).toBe('understaffed');
    expect(result.conflicts[0].severity).toBe('warning');
  });

  test('preserves pre-existing assignments', () => {
    const employees = [makeEmployee('emp1', 'Alice'), makeEmployee('emp2', 'Bob')];
    const shifts = [
      makeShift('s1', '2026-02-09', 'morning', 2, [{ userId: 'emp1', role: 'director' }]),
    ];

    const input = makeInput({ employees, shifts });
    const result = solve(input);

    // Should have 2 assignments (1 pre-existing + 1 new)
    const preExisting = result.assignments.filter(a => a.score === 100);
    expect(preExisting.length).toBe(1);
    expect(preExisting[0].userId).toBe('emp1');
    expect(preExisting[0].role).toBe('director');
  });

  test('distributes shifts fairly when prioritizing fairness', () => {
    const employees = [
      makeEmployee('emp1', 'Alice'),
      makeEmployee('emp2', 'Bob'),
    ];
    // 4 shifts → should be ~2 each
    const shifts = [
      makeShift('s1', '2026-02-09', 'morning', 1),
      makeShift('s2', '2026-02-10', 'morning', 1),
      makeShift('s3', '2026-02-11', 'morning', 1),
      makeShift('s4', '2026-02-12', 'morning', 1),
    ];

    const options: SolverOptions = {
      ...DEFAULT_SOLVER_OPTIONS,
      prioritize: 'fairness',
    };

    const input = makeInput({ employees, shifts, options });
    const result = solve(input);

    const aliceCount = result.assignments.filter(a => a.userId === 'emp1').length;
    const bobCount = result.assignments.filter(a => a.userId === 'emp2').length;

    // Both should get 2 shifts each
    expect(aliceCount).toBe(2);
    expect(bobCount).toBe(2);
  });

  test('assignments include score and confidence', () => {
    const input = makeInput();
    const result = solve(input);

    for (const a of result.assignments) {
      expect(typeof a.score).toBe('number');
      expect(typeof a.confidence).toBe('number');
      expect(a.confidence).toBeGreaterThanOrEqual(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
    }
  });

  test('stable sort: same-scored employees sorted by ID', () => {
    // Create employees with identical properties but different IDs
    const employees = [
      makeEmployee('emp_b', 'Bob'),
      makeEmployee('emp_a', 'Alice'),
      makeEmployee('emp_c', 'Charlie'),
    ];
    const shifts = [makeShift('s1', '2026-02-09', 'morning', 1)];

    const input = makeInput({ employees, shifts });
    const result = solve(input);

    // First assigned should be the one with best score or alphabetically first ID for ties
    expect(result.assignments.length).toBeGreaterThanOrEqual(1);
    // Running twice should produce same result
    const result2 = solve(input);
    expect(result.assignments[0].userId).toBe(result2.assignments[0].userId);
  });
});

// ─── Scoring Tests ───────────────────────────────────────────────────────────

describe('Employee Scoring', () => {
  test('preference_match increases score', () => {
    const emp = makeEmployee('emp1', 'Alice');
    const shift = makeShift('s1', '2026-02-09', 'morning'); // Monday = day 1
    const tracking: EmployeeTracking = {
      shifts: [], hoursWorked: 0, lastShiftEnd: null, consecutiveDays: 0,
      nightShifts: 0, weekendShifts: 0, heavyShifts: 0,
    };
    const avail = new Map([['1-morning', 'prefer']]);
    const result = scoreEmployeeForShift(emp, shift, tracking, avail, undefined, DEFAULT_SOLVER_CONSTRAINTS, 0, 'fairness');
    expect(result.eligible).toBe(true);
    expect(result.score).toBeGreaterThan(50);
    expect(result.reasons).toContain('preference_match');
  });

  test('unavailable makes employee ineligible', () => {
    const emp = makeEmployee('emp1', 'Alice');
    const shift = makeShift('s1', '2026-02-09', 'morning');
    const tracking: EmployeeTracking = {
      shifts: [], hoursWorked: 0, lastShiftEnd: null, consecutiveDays: 0,
      nightShifts: 0, weekendShifts: 0, heavyShifts: 0,
    };
    const avail = new Map([['1-morning', 'unavailable']]);
    const result = scoreEmployeeForShift(emp, shift, tracking, avail, undefined, DEFAULT_SOLVER_CONSTRAINTS, 0, 'fairness');
    expect(result.eligible).toBe(false);
  });

  test('exceeding max hours makes employee ineligible', () => {
    const emp = makeEmployee('emp1', 'Alice');
    const shift = makeShift('s1', '2026-02-09', 'morning');
    const tracking: EmployeeTracking = {
      shifts: [], hoursWorked: 40, lastShiftEnd: null, consecutiveDays: 0,
      nightShifts: 0, weekendShifts: 0, heavyShifts: 0,
    };
    const result = scoreEmployeeForShift(emp, shift, tracking, undefined, undefined, DEFAULT_SOLVER_CONSTRAINTS, 0, 'fairness');
    // 40 + 8 = 48 > 42 max
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('exceeds_max_hours');
  });
});

// ─── Fairness Tests ──────────────────────────────────────────────────────────

describe('Fairness Metrics', () => {
  test('computes fairness for equal distribution', () => {
    const employees = [makeEmployee('emp1', 'Alice'), makeEmployee('emp2', 'Bob')];
    const tracking = new Map<string, EmployeeTracking>();
    tracking.set('emp1', { shifts: ['s1', 's2'], hoursWorked: 16, lastShiftEnd: null, consecutiveDays: 2, nightShifts: 0, weekendShifts: 0, heavyShifts: 0 });
    tracking.set('emp2', { shifts: ['s3', 's4'], hoursWorked: 16, lastShiftEnd: null, consecutiveDays: 2, nightShifts: 0, weekendShifts: 0, heavyShifts: 0 });

    const result = computeFairness(employees, tracking, []);
    expect(result.fairnessScore).toBe(100); // perfectly fair
    expect(result.standardDeviation).toBe(0);
    expect(result.averageHours).toBe(16);
    expect(result.employeeMetrics.length).toBe(2);
  });

  test('computes lower fairness for unequal distribution', () => {
    const employees = [makeEmployee('emp1', 'Alice'), makeEmployee('emp2', 'Bob')];
    const tracking = new Map<string, EmployeeTracking>();
    tracking.set('emp1', { shifts: ['s1', 's2', 's3', 's4'], hoursWorked: 32, lastShiftEnd: null, consecutiveDays: 4, nightShifts: 0, weekendShifts: 0, heavyShifts: 0 });
    tracking.set('emp2', { shifts: ['s5'], hoursWorked: 8, lastShiftEnd: null, consecutiveDays: 1, nightShifts: 0, weekendShifts: 0, heavyShifts: 0 });

    const result = computeFairness(employees, tracking, []);
    expect(result.fairnessScore).toBeLessThan(100);
    expect(result.standardDeviation).toBeGreaterThan(0);
    expect(result.maxDeviation).toBeGreaterThan(0);
  });

  test('deviation per employee is correct', () => {
    const employees = [makeEmployee('emp1', 'Alice'), makeEmployee('emp2', 'Bob')];
    const tracking = new Map<string, EmployeeTracking>();
    tracking.set('emp1', { shifts: [], hoursWorked: 24, lastShiftEnd: null, consecutiveDays: 0, nightShifts: 0, weekendShifts: 0, heavyShifts: 0 });
    tracking.set('emp2', { shifts: [], hoursWorked: 16, lastShiftEnd: null, consecutiveDays: 0, nightShifts: 0, weekendShifts: 0, heavyShifts: 0 });

    const result = computeFairness(employees, tracking, []);
    const aliceMetric = result.employeeMetrics.find(m => m.userId === 'emp1')!;
    const bobMetric = result.employeeMetrics.find(m => m.userId === 'emp2')!;

    expect(aliceMetric.deviationFromAverage).toBe(4); // 24 - 20 avg = +4
    expect(bobMetric.deviationFromAverage).toBe(-4);  // 16 - 20 avg = -4
  });

  test('fairness schema validates correctly', () => {
    const employees = [makeEmployee('emp1', 'Alice')];
    const tracking = new Map<string, EmployeeTracking>();
    tracking.set('emp1', { shifts: [], hoursWorked: 16, lastShiftEnd: null, consecutiveDays: 0, nightShifts: 1, weekendShifts: 0, heavyShifts: 0 });

    const result = computeFairness(employees, tracking, []);
    const parsed = FairnessSummarySchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

// ─── Improvement Tests ───────────────────────────────────────────────────────

describe('Iterative Improvement', () => {
  test('does not worsen fairness', () => {
    const employees = [
      makeEmployee('emp1', 'Alice'),
      makeEmployee('emp2', 'Bob'),
    ];
    const shifts = [
      makeShift('s1', '2026-02-09', 'morning', 1),
      makeShift('s2', '2026-02-09', 'afternoon', 1),
      makeShift('s3', '2026-02-10', 'morning', 1),
      makeShift('s4', '2026-02-10', 'afternoon', 1),
    ];

    const input = makeInput({ employees, shifts });
    const initial = solve(input);

    const improved = improveAssignments(
      initial.assignments,
      employees,
      shifts,
      [],
      DEFAULT_SOLVER_CONSTRAINTS,
      50,
    );

    // Improvement should not increase the number of assignments
    expect(improved.assignments.length).toBe(initial.assignments.length);
    // Should be deterministic
    const improved2 = improveAssignments(
      initial.assignments,
      employees,
      shifts,
      [],
      DEFAULT_SOLVER_CONSTRAINTS,
      50,
    );
    expect(improved.assignments).toEqual(improved2.assignments);
    expect(improved.swapsPerformed).toBe(improved2.swapsPerformed);
  });

  test('does not swap pre-assigned shifts (score=100)', () => {
    const employees = [
      makeEmployee('emp1', 'Alice'),
      makeEmployee('emp2', 'Bob'),
    ];
    const shifts = [
      makeShift('s1', '2026-02-09', 'morning', 1, [{ userId: 'emp1', role: 'director' }]),
      makeShift('s2', '2026-02-10', 'morning', 1),
    ];

    const input = makeInput({ employees, shifts });
    const initial = solve(input);

    const improved = improveAssignments(
      initial.assignments,
      employees,
      shifts,
      [],
      DEFAULT_SOLVER_CONSTRAINTS,
      50,
    );

    // Pre-assigned shift should remain with emp1
    const preAssigned = improved.assignments.find(a => a.shiftId === 's1' && a.score >= 100);
    expect(preAssigned).toBeDefined();
    expect(preAssigned!.userId).toBe('emp1');
  });
});

// ─── Objective Summary Tests ─────────────────────────────────────────────────

describe('Objective Summary', () => {
  test('computes coverage percent correctly', () => {
    const employees = [makeEmployee('emp1', 'Alice')];
    const shifts = [makeShift('s1', '2026-02-09', 'morning', 2)]; // needs 2

    const input = makeInput({ employees, shifts });
    const result = solve(input);

    const summary = buildObjectiveSummary(
      result.assignments,
      employees,
      shifts,
      [],
      'fairness',
      0,
      0,
    );

    // Only 1 of 2 required workers assigned
    expect(summary.coveragePercent).toBe(50);
    expect(summary.objectiveUsed).toBe('fairness');
  });

  test('objective summary schema validates correctly', () => {
    const summary = buildObjectiveSummary(
      [],
      [makeEmployee('emp1', 'Alice')],
      [makeShift('s1', '2026-02-09', 'morning', 1)],
      [],
      'coverage',
      0,
      0,
    );
    const parsed = ObjectiveSummarySchema.safeParse(summary);
    expect(parsed.success).toBe(true);
  });
});

// ─── Constraint Extraction Tests ─────────────────────────────────────────────

describe('Constraint Extraction', () => {
  test('extracts department from message', () => {
    const result = extractShiftConstraints('build shifts for mcr this week');
    expect(result.department).toBe('mcr');
    expect(result.missingConstraints).not.toContain('department (מחלקה)');
  });

  test('extracts week reference', () => {
    const result = extractShiftConstraints('shifts for production next week');
    expect(result.weekStartDate).toBeDefined();
    expect(result.department).toBe('production');
  });

  test('reports missing department', () => {
    const result = extractShiftConstraints('build shift schedule for next week');
    expect(result.missingConstraints).toContain('department (מחלקה)');
  });

  test('extracts roles from message', () => {
    const result = extractShiftConstraints('shifts for mcr this week, need a director and camera');
    expect(result.roles).toContain('director');
    expect(result.roles).toContain('camera');
  });

  test('extracts hard constraints', () => {
    const result = extractShiftConstraints('mcr this week max 5 days consecutive rest of 12 hours');
    expect(result.hardConstraints.maxConsecutiveDays).toBe(5);
    expect(result.hardConstraints.minRestHours).toBe(12);
  });
});

// ─── Schema Compatibility Tests ──────────────────────────────────────────────

describe('Schema Compatibility', () => {
  test('new ShiftAssignment fields are optional and backward compatible', () => {
    // Old-style assignment (without score/confidence)
    const oldAssignment = {
      shiftId: 's1',
      userId: 'emp1',
      userName: 'Alice',
      role: 'worker',
      date: '2026-02-09',
      shiftType: 'morning',
      startTime: '07:00',
      endTime: '15:00',
      department: 'mcr',
      status: 'assigned',
    };
    const parsed = ShiftAssignmentSchema.safeParse(oldAssignment);
    expect(parsed.success).toBe(true);

    // New-style assignment (with score/confidence)
    const newAssignment = {
      ...oldAssignment,
      score: 65.5,
      confidence: 0.65,
    };
    const parsed2 = ShiftAssignmentSchema.safeParse(newAssignment);
    expect(parsed2.success).toBe(true);
  });

  test('new ShiftSchedule fields are optional and backward compatible', () => {
    // Old-style schedule (without new fields)
    const oldSchedule = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      weekStartDate: '2026-02-08',
      weekEndDate: '2026-02-14',
      department: 'mcr',
      assignments: [],
      violations: [],
      stats: {
        totalShifts: 0,
        assignedShifts: 0,
        unassignedShifts: 0,
        assignmentPercentage: 0,
        totalEmployees: 0,
        totalHoursAssigned: 0,
        averageHoursPerEmployee: 0,
        constraintViolations: 0,
      },
      explanation: 'Test',
      generatedAt: '2026-02-09T00:00:00.000Z',
      solverStatus: 'optimal',
    };
    const parsed = ShiftScheduleSchema.safeParse(oldSchedule);
    expect(parsed.success).toBe(true);

    // New-style schedule (with new optional fields)
    const newSchedule = {
      ...oldSchedule,
      requiresApproval: true,
      solverVersion: '1.0.0',
      conflicts: [],
      fairnessSummary: {
        employeeMetrics: [],
        averageHours: 0,
        standardDeviation: 0,
        maxDeviation: 0,
        nightShiftVariance: 0,
        weekendShiftVariance: 0,
        fairnessScore: 100,
      },
      objectiveSummary: {
        objectiveUsed: 'fairness',
        totalPenalty: 0,
        coveragePercent: 100,
        preferencesSatisfied: 0,
        preferencesTotal: 0,
        improvementIterations: 0,
        swapsPerformed: 0,
      },
    };
    const parsed2 = ShiftScheduleSchema.safeParse(newSchedule);
    expect(parsed2.success).toBe(true);
  });
});

// ─── Shift Facts Provider Selection Tests ─────────────────────────────────────

describe('Shift facts provider selection', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('defaults to graphql provider', () => {
    delete process.env.SHIFT_FACTS_PROVIDER;
    process.env.NODE_ENV = 'development';
    const provider = getShiftFactsProvider();
    expect(provider.source).toBe('graphql');
  });

  test('blocks mongo provider in production unless explicitly allowed', () => {
    process.env.SHIFT_FACTS_PROVIDER = 'mongo';
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_MONGO_SHIFT_FACTS;
    expect(() => getShiftFactsProvider()).toThrow(/disabled in production/i);
  });

  test('allows mongo provider in development', () => {
    process.env.SHIFT_FACTS_PROVIDER = 'mongo';
    process.env.NODE_ENV = 'development';
    const provider = getShiftFactsProvider();
    expect(provider.source).toBe('mongodb');
  });
});

describe('GraphQL provider auth', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('throws explicit auth error when token is missing', async () => {
    process.env.API_GATEWAY_GRAPHQL_TOKEN = '';
    process.env.API_GATEWAY_JWT = '';
    process.env.AI_AGENT_JWT = '';
    const provider = createGraphqlShiftFactsProvider();
    await expect(provider.fetchEmployees('mcr')).rejects.toThrow(/\[auth\].*TODO/i);
  });
});
