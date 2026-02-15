/**
 * Workers Module Index
 *
 * Re-exports all AI Workers for use by the controller (orchestrator).
 *
 * Each Worker is a stateless, single-responsibility module that:
 *  - Has exactly ONE responsibility
 *  - Is stateless (all inputs passed in, no side effects)
 *  - Returns structured output only (JSON or text)
 *  - NEVER decides, executes tools, or mutates state
 *
 * The orchestrator (controller) is the ONLY caller of these Workers
 * and is responsible for validating their output before acting on it.
 */

import * as GreetingWorker from './greeting-worker';
import * as IntentWorker from './intent-worker';
import * as ClarificationWorker from './clarification-worker';
import * as OperationalGateWorker from './operational-gate-worker';
import * as FreeChatWorker from './free-chat-worker';

export {
  GreetingWorker,
  IntentWorker,
  ClarificationWorker,
  OperationalGateWorker,
  FreeChatWorker,
};
