/**
 * MongoDB Shift Facts Provider (dev fallback)
 *
 * Direct DB access for development/testing only.
 * This provider is blocked in production unless explicitly allowed.
 */

import { connectMongoDB } from '../mongodb-adapter';
import { createLogger } from '../../utils/logger';
import {
  SolverEmployee,
  SolverShift,
  SolverAvailability,
  SolverHistoricalLoad,
} from '../../shift/types';
import { DataFetchResult, ShiftFactsProvider } from '../shift-facts-provider';

const logger = createLogger('mongo-shift-facts-provider');

export function createMongoShiftFactsProvider(): ShiftFactsProvider {
  return {
    source: 'mongodb',
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

  try {
    const db = await connectMongoDB();
    const users = await db.collection('users').find({
      $or: [
        { department },
        { 'departments.departmentId': department },
      ],
      isActive: true,
    }).toArray();

    const userIds = users.map((u: any) => u._id?.toString() || u.id);
    let settings: any[] = [];
    try {
      settings = await db.collection('employee_settings').find({
        userId: { $in: userIds },
      }).toArray();
    } catch {
      warnings.push('Could not fetch employee settings; using defaults.');
    }

    const settingsMap = new Map<string, any>();
    for (const s of settings) {
      settingsMap.set(s.userId, s);
    }

    const employees: SolverEmployee[] = users.map((u: any) => {
      const id = u._id?.toString() || u.id;
      const empSettings = settingsMap.get(id);
      return {
        id,
        displayName: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown',
        department: u.department || department,
        roles: empSettings?.roles || u.roles || [],
        employmentPercentage: empSettings?.employmentPercentage || u.employmentPercentage || 100,
        isActive: true,
      };
    });

    logger.debug('Fetched employees', {
      department,
      count: employees.length,
      source: 'mongodb',
    }, traceId);

    return { data: employees, source: 'mongodb', warnings };
  } catch (error) {
    logger.error('Failed to fetch employees', {
      department,
      error: (error as Error).message,
    }, traceId);
    throw new Error(`[transport] Failed to fetch employees: ${(error as Error).message}`);
  }
}

async function fetchShifts(
  weekStartDate: string,
  department: string,
  traceId?: string,
): Promise<DataFetchResult<SolverShift[]>> {
  const warnings: string[] = [];

  try {
    const db = await connectMongoDB();
    const startDate = new Date(weekStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    const shifts = await db.collection('shifts').find({
      department,
      date: {
        $gte: startDate,
        $lt: endDate,
      },
    }).toArray();

    const solverShifts: SolverShift[] = shifts.map((s: any) => ({
      id: s._id?.toString() || s.id,
      date: s.date instanceof Date
        ? s.date.toISOString().split('T')[0]
        : String(s.date).split('T')[0],
      shiftType: s.shiftType || 'morning',
      department: s.department || department,
      requiredWorkers: s.requiredWorkers || 1,
      assignedWorkers: (s.assignedWorkers || []).map((aw: any) => ({
        userId: aw.userId,
        role: aw.role || 'worker',
      })),
      startTime: s.startTime || getDefaultStartTime(s.shiftType),
      endTime: s.endTime || getDefaultEndTime(s.shiftType),
    }));

    logger.debug('Fetched shifts', {
      department,
      weekStartDate,
      count: solverShifts.length,
      source: 'mongodb',
    }, traceId);

    return { data: solverShifts, source: 'mongodb', warnings };
  } catch (error) {
    logger.error('Failed to fetch shifts', {
      department,
      weekStartDate,
      error: (error as Error).message,
    }, traceId);
    throw new Error(`[transport] Failed to fetch shifts: ${(error as Error).message}`);
  }
}

async function fetchAvailability(
  weekStartDate: string,
  userIds: string[],
  traceId?: string,
): Promise<DataFetchResult<SolverAvailability[]>> {
  const warnings: string[] = [];

  try {
    const db = await connectMongoDB();
    const constraints = await db.collection('availability_constraints').find({
      weekStartDate,
      userId: { $in: userIds },
    }).toArray();

    const availability: SolverAvailability[] = constraints.map((c: any) => ({
      userId: c.userId,
      weekStartDate: c.weekStartDate,
      constraints: (c.constraints || []).map((item: any) => ({
        dayOfWeek: item.dayOfWeek,
        shiftType: item.shiftType,
        availability: item.availability,
      })),
    }));

    if (availability.length === 0 && userIds.length > 0) {
      warnings.push(
        `No availability constraints found for week ${weekStartDate}. All employees treated as available.`,
      );
    }

    logger.debug('Fetched availability constraints', {
      weekStartDate,
      userCount: userIds.length,
      constraintCount: availability.length,
      source: 'mongodb',
    }, traceId);

    return { data: availability, source: 'mongodb', warnings };
  } catch (error) {
    logger.error('Failed to fetch availability', {
      weekStartDate,
      error: (error as Error).message,
    }, traceId);
    throw new Error(`[transport] Failed to fetch availability: ${(error as Error).message}`);
  }
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
    const db = await connectMongoDB();
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - lookbackDays);

    const historicalShifts = await db.collection('shifts').find({
      department,
      date: {
        $gte: startDate,
        $lt: endDate,
      },
    }).toArray();

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
      const shiftDate = shift.date instanceof Date ? shift.date : new Date(shift.date);
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
      source: 'mongodb',
    }, traceId);

    return { data: result, source: 'mongodb', warnings };
  } catch (error) {
    logger.error('Failed to fetch historical load', {
      department,
      error: (error as Error).message,
    }, traceId);
    warnings.push('Failed to fetch historical load data. Fairness metrics will be based on current week only.');
    return { data: emptyLoad(), source: 'mongodb', warnings };
  }
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
