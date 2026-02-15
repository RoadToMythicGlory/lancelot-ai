/**
 * OR-Tools Solver HTTP Client
 *
 * Calls the OR-Tools solver microservice over HTTP.
 * Returns the same SolverResult type as the local TS solver.
 *
 * On failure (network, timeout, 5xx): throws — no silent fallback.
 */

import { SolverInput, SolverResult } from './types';
import { createLogger } from '../utils/logger';

const logger = createLogger('ortools-client');

function getOrtoolsUrl(): string {
  return process.env.OR_TOOLS_SOLVER_URL || 'http://localhost:5003';
}

/**
 * Send a solver request to the OR-Tools microservice.
 * Throws on any failure (network, timeout, non-2xx).
 */
export async function solveViaOrtools(input: SolverInput): Promise<SolverResult> {
  const url = `${getOrtoolsUrl()}/solve`;
  const timeoutMs = parseInt(process.env.OR_TOOLS_TIMEOUT_MS || '60000', 10);

  logger.info('Calling OR-Tools solver', {
    url,
    employees: input.employees.length,
    shifts: input.shifts.length,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `OR-Tools solver returned HTTP ${response.status}: ${body}`,
      );
    }

    const result = (await response.json()) as SolverResult;

    logger.info('OR-Tools solver completed', {
      status: result.solverStatus,
      assignments: result.assignments.length,
      conflicts: result.conflicts.length,
      solverTimeMs: result.solverTimeMs,
    });

    return result;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(
        `OR-Tools solver timed out after ${timeoutMs}ms. ` +
        'Increase OR_TOOLS_TIMEOUT_MS or reduce problem size.',
      );
    }
    throw new Error(`OR-Tools solver request failed: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}
