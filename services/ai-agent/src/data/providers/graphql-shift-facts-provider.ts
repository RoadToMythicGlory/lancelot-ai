/**
 * GraphQL Shift Facts Provider (v1 target)
 *
 * Uses API Gateway GraphQL and enforces auth boundaries.
 */

import { createLogger } from '../../utils/logger';
import {
  SolverEmployee,
  SolverShift,
  SolverAvailability,
  SolverHistoricalLoad,
} from '../../shift/types';
import { DataFetchResult, ShiftFactsProvider } from '../shift-facts-provider';

const logger = createLogger('graphql-shift-facts-provider');

type GraphqlError = {
  message: string;
  extensions?: { code?: string };
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: GraphqlError[];
};

type GraphqlUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  department?: string;
  departments?: Array<{ departmentId: string; roles: string[] }>;
  isActive: boolean;
};

type GraphqlEmployeeSettings = {
  userId: string;
  roles?: string[];
  employmentPercentage?: number;
};

type GraphqlShift = {
  id: string;
  date: string;
  shiftType: string;
  startTime?: string;
  endTime?: string;
  department: string;
  requiredWorkers: number;
  assignedWorkers: Array<{ userId: string; role: string }>;
};

type GraphqlAvailabilityConstraint = {
  userId: string;
  weekStartDate: string;
  constraints: Array<{
    dayOfWeek: number;
    shiftType: string;
    availability: string;
  }>;
};

export function createGraphqlShiftFactsProvider(): ShiftFactsProvider {
  return {
    source: 'graphql',
    fetchEmployees,
    fetchShifts,
    fetchAvailability,
    fetchHistoricalLoad,
  };
}

async function fetchEmployees(
  department: string,
  traceId?: string,
): Promise<DataFetchResult<SolverEmployee[]>> {
  const warnings: string[] = [];

  const employeesData = await graphqlRequest<{
    employees: GraphqlUser[];
  }>(
    `
      query ShiftSolverEmployees($department: String) {
        employees(department: $department) {
          id
          firstName
          lastName
          displayName
          department
          departments { departmentId roles }
          isActive
        }
      }
    `,
    { department },
    traceId,
  );

  let settings: GraphqlEmployeeSettings[] = [];
  try {
    const settingsData = await graphqlRequest<{
      allEmployeeSettings: GraphqlEmployeeSettings[];
    }>(
      `
        query ShiftSolverEmployeeSettings {
          allEmployeeSettings {
            userId
            roles
            employmentPercentage
          }
        }
      `,
      {},
      traceId,
    );
    settings = settingsData.allEmployeeSettings || [];
  } catch (error) {
    warnings.push('Could not fetch employee settings; using defaults.');
    logger.warn('Employee settings query failed', {
      error: (error as Error).message,
    }, traceId);
  }

  const settingsMap = new Map<string, GraphqlEmployeeSettings>();
  for (const s of settings) {
    settingsMap.set(s.userId, s);
  }

  const employees: SolverEmployee[] = (employeesData.employees || [])
    .filter(u => u.isActive)
    .map(u => {
      const empSettings = settingsMap.get(u.id);
      const deptRoles = (u.departments || [])
        .find(d => d.departmentId === department)?.roles || [];
      return {
        id: u.id,
        displayName: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown',
        department: u.department || department,
        roles: empSettings?.roles || deptRoles || [],
        employmentPercentage: empSettings?.employmentPercentage || 100,
        isActive: true,
      };
    });

  logger.debug('Fetched employees', {
    department,
    count: employees.length,
    source: 'graphql',
  }, traceId);

  return { data: employees, source: 'graphql', warnings };
}

async function fetchShifts(
  weekStartDate: string,
  department: string,
  traceId?: string,
): Promise<DataFetchResult<SolverShift[]>> {
  const warnings: string[] = [];

  const startDate = new Date(weekStartDate);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  const data = await graphqlRequest<{ shifts: GraphqlShift[] }>(
    `
      query ShiftSolverShifts($startDate: String!, $endDate: String!, $department: String) {
        shifts(startDate: $startDate, endDate: $endDate, department: $department) {
          id
          date
          shiftType
          startTime
          endTime
          department
          requiredWorkers
          assignedWorkers { userId role }
        }
      }
    `,
    {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      department,
    },
    traceId,
  );

  const shifts: SolverShift[] = (data.shifts || []).map(s => ({
    id: s.id,
    date: String(s.date).split('T')[0],
    shiftType: s.shiftType || 'morning',
    department: s.department || department,
    requiredWorkers: s.requiredWorkers || 1,
    assignedWorkers: (s.assignedWorkers || []).map(aw => ({
      userId: aw.userId,
      role: aw.role || 'worker',
    })),
    startTime: s.startTime || getDefaultStartTime(s.shiftType),
    endTime: s.endTime || getDefaultEndTime(s.shiftType),
  }));

  logger.debug('Fetched shifts', {
    department,
    weekStartDate,
    count: shifts.length,
    source: 'graphql',
  }, traceId);

  return { data: shifts, source: 'graphql', warnings };
}

async function fetchAvailability(
  weekStartDate: string,
  userIds: string[],
  traceId?: string,
): Promise<DataFetchResult<SolverAvailability[]>> {
  const warnings: string[] = [];

  if (userIds.length === 0) {
    return { data: [], source: 'graphql', warnings };
  }

  const results = await Promise.all(
    userIds.map(userId =>
      graphqlRequest<{ availabilityConstraints: GraphqlAvailabilityConstraint[] }>(
        `
          query ShiftSolverAvailability($weekStartDate: String!, $userId: String) {
            availabilityConstraints(weekStartDate: $weekStartDate, userId: $userId) {
              userId
              weekStartDate
              constraints { dayOfWeek shiftType availability }
            }
          }
        `,
        { weekStartDate, userId },
        traceId,
      ),
    ),
  );

  const availability: SolverAvailability[] = results.flatMap(result =>
    (result.availabilityConstraints || []).map(c => ({
      userId: c.userId,
      weekStartDate: c.weekStartDate,
      constraints: (c.constraints || []).map(item => ({
        dayOfWeek: item.dayOfWeek,
        shiftType: item.shiftType,
        availability: item.availability as SolverAvailability['constraints'][number]['availability'],
      })),
    })),
  );

  if (availability.length === 0 && userIds.length > 0) {
    warnings.push(
      `No availability constraints found for week ${weekStartDate}. All employees treated as available.`,
    );
  }

  logger.debug('Fetched availability constraints', {
    weekStartDate,
    userCount: userIds.length,
    constraintCount: availability.length,
    source: 'graphql',
  }, traceId);

  return { data: availability, source: 'graphql', warnings };
}

async function fetchHistoricalLoad(
  department: string,
  userIds: string[],
  lookbackDays: number = 28,
  traceId?: string,
): Promise<DataFetchResult<SolverHistoricalLoad[]>> {
  const warnings: string[] = [];

  const emptyLoad = (): SolverHistoricalLoad[] =>
    userIds.map(uid => ({
      userId: uid,
      totalHours: 0,
      nightShifts: 0,
      weekendShifts: 0,
      heavyShifts: 0,
      periodDays: lookbackDays,
    }));

  try {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - lookbackDays);

    const data = await graphqlRequest<{ shifts: GraphqlShift[] }>(
      `
        query ShiftSolverHistoricalShifts($startDate: String!, $endDate: String!, $department: String) {
          shifts(startDate: $startDate, endDate: $endDate, department: $department) {
            id
            date
            shiftType
            startTime
            endTime
            department
            requiredWorkers
            assignedWorkers { userId role }
          }
        }
      `,
      {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        department,
      },
      traceId,
    );

    const historicalShifts = data.shifts || [];

    const loadMap = new Map<string, SolverHistoricalLoad>();
    for (const uid of userIds) {
      loadMap.set(uid, {
        userId: uid,
        totalHours: 0,
        nightShifts: 0,
        weekendShifts: 0,
        heavyShifts: 0,
        periodDays: lookbackDays,
      });
    }

    for (const shift of historicalShifts) {
      const shiftDate = new Date(shift.date);
      const dayOfWeek = shiftDate.getDay();
      const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
      const isNight = (shift.shiftType || '').toLowerCase() === 'night';
      const shiftHours = computeShiftHoursRaw(shift.startTime, shift.endTime);

      for (const aw of (shift.assignedWorkers || [])) {
        const load = loadMap.get(aw.userId);
        if (load) {
          load.totalHours += shiftHours;
          if (isNight) load.nightShifts++;
          if (isWeekend) load.weekendShifts++;
          if ((isNight && isWeekend) || shiftHours > 10) {
            load.heavyShifts++;
          }
        }
      }
    }

    const result = Array.from(loadMap.values());

    if (historicalShifts.length === 0) {
      warnings.push(
        `No historical shift data found for department '${department}' in last ${lookbackDays} days.`,
      );
    }

    logger.debug('Fetched historical load', {
      department,
      lookbackDays,
      shiftCount: historicalShifts.length,
      source: 'graphql',
    }, traceId);

    return { data: result, source: 'graphql', warnings };
  } catch (error) {
    logger.error('Failed to fetch historical load', {
      department,
      error: (error as Error).message,
    }, traceId);
    warnings.push('Failed to fetch historical load data. Fairness metrics will be based on current week only.');
    return { data: emptyLoad(), source: 'graphql', warnings };
  }
}

async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  traceId?: string,
): Promise<T> {
  const endpoint = getGraphqlEndpoint();
  const token = getAuthToken();

  if (!token) {
    throw new Error(
      '[auth] Missing GraphQL auth token. Set AI_AGENT_JWT env var. ' +
      'Generate via: cd services/api-gateway && npm run generate:service-jwt',
    );
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(`[auth] GraphQL authentication failed (status ${response.status}). Check AI_AGENT_JWT env var or regenerate via: cd services/api-gateway && npm run generate:service-jwt`);
  }

  const payload = (await response.json()) as GraphqlResponse<T>;

  if (payload.errors && payload.errors.length > 0) {
    const message = payload.errors.map(e => e.message).join('; ');
    if (isAuthError(payload.errors)) {
      throw new Error(`[auth] GraphQL authorization failed: ${message}. Check AI_AGENT_JWT permissions or regenerate.`);
    }
    throw new Error(`[transport] GraphQL error: ${message}`);
  }

  if (!payload.data) {
    throw new Error('[transport] GraphQL response missing data');
  }

  logger.debug('GraphQL request success', {
    endpoint,
    query: query.trim().split('\n')[0],
  }, traceId);

  return payload.data;
}

function isAuthError(errors: GraphqlError[]): boolean {
  return errors.some(err => {
    const code = err.extensions?.code?.toLowerCase() || '';
    const msg = err.message.toLowerCase();
    return code.includes('unauth') || code.includes('forbidden') ||
      msg.includes('unauth') || msg.includes('forbidden') || msg.includes('not authorized');
  });
}

function getGraphqlEndpoint(): string {
  const direct = process.env.API_GATEWAY_GRAPHQL_URL;
  if (direct) {
    return direct;
  }

  const base = process.env.API_GATEWAY_URL || 'http://localhost:4000';
  return `${base.replace(/\/$/, '')}/graphql`;
}

function getAuthToken(): string | undefined {
  return process.env.API_GATEWAY_GRAPHQL_TOKEN
    || process.env.API_GATEWAY_JWT
    || process.env.AI_AGENT_JWT;
}

function getDefaultStartTime(shiftType?: string): string {
  switch ((shiftType || '').toLowerCase()) {
    case 'morning': return '07:00';
    case 'afternoon': return '15:00';
    case 'night': return '23:00';
    default: return '09:00';
  }
}

function getDefaultEndTime(shiftType?: string): string {
  switch ((shiftType || '').toLowerCase()) {
    case 'morning': return '15:00';
    case 'afternoon': return '23:00';
    case 'night': return '07:00';
    default: return '17:00';
  }
}

function computeShiftHoursRaw(startTime?: string, endTime?: string): number {
  if (startTime && endTime) {
    const start = parseInt(startTime.split(':')[0], 10);
    const end = parseInt(endTime.split(':')[0], 10);
    return end > start ? end - start : 24 - start + end;
  }
  return 8;
}
