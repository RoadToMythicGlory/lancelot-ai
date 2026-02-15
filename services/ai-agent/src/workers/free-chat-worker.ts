/**
 * FreeChatWorker
 *
 * Stateless AI Worker: generates fallback conversational text
 * for non-operational intents using the LLM provider.
 *
 * ALLOWED:
 *  - Receive a user message, conversation history, entities, and config.
 *  - Call the LLM provider to generate a text response.
 *  - Return a structured result with the generated text and model name.
 *
 * FORBIDDEN:
 *  - Tool execution or invocation of any registered tool handler.
 *  - Database reads/writes or any side effects.
 *  - Storing or reading conversation memory.
 *  - Making business decisions (scheduling, CG generation, etc.).
 *  - Autonomous reasoning chains or multi-step planning.
 */

import { getLLMProvider } from '../llm';
import { AGENT_SYSTEM_PROMPT, buildChatPrompt } from '../llm/prompt-templates';
import { config } from '../config';

/**
 * Structured output of the FreeChatWorker.
 */
export interface FreeChatWorkerResult {
  /** Generated text response. */
  text: string;
  /** Name/identifier of the LLM model used. */
  modelUsed: string;
}

/**
 * Options passed into the FreeChatWorker.
 */
export interface FreeChatWorkerInput {
  message: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  entities?: Record<string, string>;
}

/**
 * Safe timeout wrapper using Promise.race (mirrors orchestrator's helper).
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Run the FreeChatWorker.
 *
 * Calls the LLM to produce conversational text. May throw on timeout.
 * The caller (controller) is responsible for catching errors and building
 * appropriate error responses.
 */
export async function run(input: FreeChatWorkerInput): Promise<FreeChatWorkerResult> {
  const provider = getLLMProvider();

  const prompt = buildChatPrompt(
    input.message,
    input.conversationHistory,
    input.entities ? JSON.stringify(input.entities) : undefined,
  );

  const llmResponse = await withTimeout(
    provider.generate(prompt, {
      systemPrompt: AGENT_SYSTEM_PROMPT,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
    }),
    config.llm.timeout,
    'llm:generate',
  );

  return {
    text: llmResponse.text,
    modelUsed: llmResponse.model,
  };
}

export default { run };
