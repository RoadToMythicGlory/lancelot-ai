/**
 * OperationalGateWorker
 *
 * Stateless AI Worker: evaluates whether an intent is "operational"
 * (requiring tool execution rather than free chat) and checks that
 * required entities are present.
 *
 * ALLOWED:
 *  - Receive an Intent, extracted entities, and the original message.
 *  - Return a structured gate result (operational flag, entity status,
 *    missing list, and clarification text if needed).
 *
 * FORBIDDEN:
 *  - Tool execution or invocation of any registered tool handler.
 *  - Database reads/writes or any side effects.
 *  - Storing or reading conversation memory.
 *  - Making business decisions (scheduling, CG generation, etc.).
 *  - Calling LLM providers.
 */

import {
  isOperationalIntent,
  requiredEntitiesSatisfied,
  buildMissingEntitiesClarification,
} from '../agent/orchestrator';

/**
 * Structured output of the OperationalGateWorker.
 */
export interface OperationalGateResult {
  /** Whether the intent is operational (requires tool execution). */
  operational: boolean;
  /** Whether all required entities for the operational intent are present. */
  entitiesOk: boolean;
  /** List of missing entity keys (empty when entitiesOk is true). */
  missing: string[];
  /** Clarification text for the user when entities are missing. */
  clarificationText?: string;
}

/**
 * Run the OperationalGateWorker.
 *
 * Pure function: no side effects, no state, no LLM calls.
 */
export function run(
  intentPrimary: string,
  entities: Record<string, unknown> | undefined,
  message: string,
): OperationalGateResult {
  const operational = isOperationalIntent(intentPrimary);

  if (!operational) {
    return { operational: false, entitiesOk: true, missing: [] };
  }

  const { satisfied, missing } = requiredEntitiesSatisfied(
    intentPrimary,
    entities,
    message,
  );

  if (satisfied) {
    return { operational: true, entitiesOk: true, missing: [] };
  }

  return {
    operational: true,
    entitiesOk: false,
    missing,
    clarificationText: buildMissingEntitiesClarification(intentPrimary, missing),
  };
}

export default { run };
