/**
 * Shift Facts Provider Interface
 *
 * Defines the contract for shift solver data sources.
 * Implementations must be read-only and deterministic.
 */

import {
  SolverEmployee,
  SolverShift,
  SolverAvailability,
  SolverHistoricalLoad,
} from '../shift/types';

export type ShiftFactsSource = 'mongodb' | 'graphql';

export interface DataFetchResult<T> {
  data: T;
  source: ShiftFactsSource;
  warnings: string[];
}

export interface ShiftFactsProvider {
  source: ShiftFactsSource;
  fetchEmployees(
    department: string,
    traceId?: string,
  ): Promise<DataFetchResult<SolverEmployee[]>>;
  fetchShifts(
    weekStartDate: string,
    department: string,
    traceId?: string,
  ): Promise<DataFetchResult<SolverShift[]>>;
  fetchAvailability(
    weekStartDate: string,
    userIds: string[],
    traceId?: string,
  ): Promise<DataFetchResult<SolverAvailability[]>>;
  fetchHistoricalLoad(
    department: string,
    userIds: string[],
    lookbackDays?: number,
    traceId?: string,
  ): Promise<DataFetchResult<SolverHistoricalLoad[]>>;
}
