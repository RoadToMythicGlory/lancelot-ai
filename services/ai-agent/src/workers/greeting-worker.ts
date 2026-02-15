/**
 * GreetingWorker
 *
 * Stateless AI Worker: detects whether a message is a greeting
 * and returns the appropriate canned response text.
 *
 * ALLOWED:
 *  - Receive a user message string.
 *  - Return a structured result indicating greeting status + response text.
 *
 * FORBIDDEN:
 *  - Tool execution or invocation of any registered tool handler.
 *  - Database reads/writes or any side effects.
 *  - Storing or reading conversation memory.
 *  - Making business decisions (scheduling, CG generation, etc.).
 *  - Calling LLM providers.
 */

import {
  isGreetingMessage,
  getGreetingResponse,
} from '../agent/intent-classifier';

/**
 * Structured output of the GreetingWorker.
 */
export interface GreetingWorkerResult {
  /** Whether the message was classified as a greeting. */
  isGreeting: boolean;
  /** Canned response text (only set when isGreeting is true). */
  responseText?: string;
}

/**
 * Run the GreetingWorker.
 *
 * Pure function: no side effects, no state, no LLM calls.
 */
export function run(message: string): GreetingWorkerResult {
  const greeting = isGreetingMessage(message);
  if (!greeting) {
    return { isGreeting: false };
  }
  return {
    isGreeting: true,
    responseText: getGreetingResponse(message),
  };
}

export default { run };
