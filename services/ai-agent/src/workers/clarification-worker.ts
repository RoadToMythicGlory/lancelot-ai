/**
 * ClarificationWorker
 *
 * Stateless AI Worker: determines whether an intent requires
 * clarification and produces the clarification prompt text.
 *
 * ALLOWED:
 *  - Receive an Intent object and the original user message.
 *  - Return a structured result: { needsClarification, question }.
 *
 * FORBIDDEN:
 *  - Tool execution or invocation of any registered tool handler.
 *  - Database reads/writes or any side effects.
 *  - Storing or reading conversation memory.
 *  - Making business decisions (scheduling, CG generation, etc.).
 *  - Calling LLM providers.
 */

import {
  needsClarification,
  generateClarificationRequest,
} from '../agent/intent-classifier';
import type { Intent } from '../schemas/chat-response';

/**
 * Structured output of the ClarificationWorker.
 */
export interface ClarificationWorkerResult {
  /** Whether the intent requires user clarification. */
  needsClarification: boolean;
  /** Human-readable clarification question (only set when needed). */
  question?: string;
}

/**
 * Run the ClarificationWorker.
 *
 * Pure function: no side effects, no state, no LLM calls.
 */
export function run(
  intent: Intent,
  originalMessage: string,
): ClarificationWorkerResult {
  const needs = needsClarification(intent);
  if (!needs) {
    return { needsClarification: false };
  }
  return {
    needsClarification: true,
    question: generateClarificationRequest(intent, originalMessage),
  };
}

export default { run };
