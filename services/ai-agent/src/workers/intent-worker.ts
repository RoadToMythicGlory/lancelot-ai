/**
 * IntentWorker
 *
 * Stateless AI Worker: classifies a user message into an Intent
 * with confidence score and extracted entities.
 *
 * ALLOWED:
 *  - Receive a user message and optional conversation context.
 *  - Call the existing intent classifier (which may use keyword matching
 *    or an LLM for structured classification).
 *  - Return a structured Intent object.
 *
 * FORBIDDEN:
 *  - Tool execution or invocation of any registered tool handler.
 *  - Database reads/writes or any side effects.
 *  - Storing or reading conversation memory.
 *  - Making business decisions (scheduling, CG generation, etc.).
 *  - Deciding what action to take based on the intent (that is the
 *    controller's responsibility).
 */

import { classifyIntent } from '../agent/intent-classifier';
import type { Intent } from '../schemas/chat-response';

/**
 * Run the IntentWorker.
 *
 * Returns the same Intent shape the system already uses.
 * This is a thin wrapper; classification logic is unchanged.
 */
export async function run(
  message: string,
  conversationContext?: string,
): Promise<Intent> {
  return classifyIntent(message, conversationContext);
}

export default { run };
