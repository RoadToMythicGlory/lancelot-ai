# AI Workers

Stateless, single-responsibility modules that the controller (orchestrator) delegates to.

## Contract

Every Worker:

1. Has **exactly one responsibility** (greeting detection, intent classification, etc.).
2. Is **stateless** — all inputs are passed as function arguments, no internal state.
3. Returns **structured output only** (JSON objects or plain text).
4. **NEVER** decides, executes tools, or mutates state.

## Allowed

- Transform input into structured output.
- Call LLM providers **only** to generate text/JSON (e.g., IntentWorker, FreeChatWorker).
- Use deterministic pattern matching, keyword lookups, or schema validation.

## Forbidden

- **Tool execution**: Workers must never invoke registered tool handlers or call ERP endpoints.
- **Database access**: No reads or writes to MongoDB or any data store.
- **Memory**: No reading or writing conversation memory.
- **Business decisions**: Workers do not decide what action to take — that is the controller's job.
- **Side effects**: No network calls (except LLM inference where explicitly allowed), no file I/O, no logging of business events.
- **Autonomous reasoning**: No multi-step planning, reasoning chains, or self-directed loops.

## Workers

| Worker | File | Responsibility |
|--------|------|----------------|
| GreetingWorker | `greeting-worker.ts` | Detect greetings, return canned response text |
| IntentWorker | `intent-worker.ts` | Classify user message into Intent + entities |
| ClarificationWorker | `clarification-worker.ts` | Decide if clarification is needed, produce prompt |
| OperationalGateWorker | `operational-gate-worker.ts` | Check if intent is operational + required entities present |
| FreeChatWorker | `free-chat-worker.ts` | Generate fallback chat text for non-operational intents |

## Authority Model

```
User Message
     |
     v
 Controller (orchestrator.ts)
     |
     +---> GreetingWorker        (stateless, no decisions)
     +---> IntentWorker           (stateless, output UNTRUSTED)
     +---> ClarificationWorker   (stateless, no decisions)
     +---> OperationalGateWorker (stateless, no decisions)
     +---> FreeChatWorker        (stateless, output UNTRUSTED)
     |
     v
 Controller validates Worker output
     |
     v
 Tool Layer / ERP  (the ONLY decision engine)
```

All AI output is treated as **UNTRUSTED input** by the controller.
The ERP and tool handlers are the **only** components allowed to make decisions or mutate state.
