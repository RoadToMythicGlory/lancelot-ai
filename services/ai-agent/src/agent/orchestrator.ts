/**
 * Agent Controller (formerly "Agent Orchestrator")
 *
 * Thin controller that delegates to stateless AI Workers and coordinates
 * tool execution.  Contains NO AI logic itself.
 *
 * Responsibilities:
 *  - Call Workers (GreetingWorker, IntentWorker, ClarificationWorker,
 *    OperationalGateWorker, FreeChatWorker)
 *  - Validate Worker output (treat as UNTRUSTED)
 *  - Pass validated data to ERP/tools
 *  - Build responses via response-builder
 *
 * This module preserves every export and type from the original
 * orchestrator so that no external consumer needs to change.
 */

import { v4 as uuidv4 } from 'uuid';
import { getLLMProvider } from '../llm';
import {
  buildTextResponse,
  buildErrorResponse,
  buildClarificationResponse,
  createToolUsage,
  buildResponse,
} from './response-builder';
import { ChatAgentResponse, Intent, IntentSchema, ToolUsage } from '../schemas/chat-response';
import { createLogger } from '../utils/logger';
import { config } from '../config';
import { getToolByIntent } from '../tools/registry';

// ─── AI Workers (stateless, single-responsibility) ────────────────────────────
import {
  GreetingWorker,
  IntentWorker,
  ClarificationWorker,
  OperationalGateWorker,
  FreeChatWorker,
} from '../workers';

const logger = createLogger('orchestrator');

/**
 * Safe timeout wrapper using Promise.race (does NOT use AbortSignal.timeout).
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

/**
 * Operational mode for the agent
 */
export type AgentMode = 'LIVE_CG' | 'NORMAL';

/**
 * Task type for the agent
 */
export type AgentTask = 'cg' | 'lineup' | 'news' | 'rights' | 'shifts' | 'general';

/**
 * Authenticated user context propagated to every tool.
 *
 * Permissions are sourced from the api-gateway via the `x-user-permissions`
 * header (see middleware.authPassthrough). When the header is missing
 * (e.g. legacy callers) the field is undefined and tools must treat the
 * caller as having NO data permissions for safety.
 */
export interface UserContext {
  userId: string;
  email?: string;
  displayName?: string;
  permissions?: string[];
  departmentId?: string;
  systemRole?: string;
}

/**
 * Message context for processing
 */
export interface MessageContext {
  conversationId: string;
  userId: string;
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  additionalContext?: Record<string, unknown>;
  /** Optional metadata for operational modes (additive, non-breaking) */
  metadata?: {
    mode?: AgentMode;
    task?: AgentTask;
  };
  /**
   * Authenticated user context (permissions, department, role).
   * Used by data-reading tools to enforce RBAC.
   */
  user?: UserContext;
}

/**
 * Tool handler function type
 */
export type ToolHandler = (
  input: Record<string, unknown>,
  context: MessageContext
) => Promise<{
  success: boolean;
  data?: unknown;
  text: string;
  error?: string;
}>;

/**
 * Registered tools
 */
const registeredTools: Map<string, ToolHandler> = new Map();

/**
 * Register a tool handler
 */
export function registerTool(intentType: string, handler: ToolHandler): void {
  registeredTools.set(intentType, handler);
  logger.info(`Registered tool handler for intent: ${intentType}`);
}

// ─── Operational Hard Gates ───────────────────────────────────────────────────

/**
 * Intents that REQUIRE tool execution (never free chat).
 * If the tool is registered, execute it; otherwise return error/clarification.
 *
 * The new "lookup" intents (help, preset, equipment_lookup, shift_lookup,
 * broadcast_lookup, user_lookup) are also operational: the AI must answer
 * from real DB / RAG data, never from its own imagination.
 */
const OPERATIONAL_INTENTS: ReadonlySet<string> = new Set([
  'cg', 'lineup', 'shifts', 'news', 'rights',
  'help', 'preset', 'equipment_lookup',
  'shift_lookup', 'broadcast_lookup', 'user_lookup',
]);

/**
 * Check if an intent is operational (requires tool execution, never free chat).
 */
export function isOperationalIntent(intent: string): boolean {
  return OPERATIONAL_INTENTS.has(intent);
}

/**
 * Required entities per operational intent.
 * Each entry maps an intent to a list of entity keys that SHOULD be present
 * for the tool to produce useful output. Missing keys trigger clarification.
 *
 * NOTE: These are "soft-required" — the tool may still work with partial data,
 * but we prefer to ask for missing info rather than hallucinate.
 */
const REQUIRED_ENTITIES: Record<string, { keys: string[]; messageHints: Array<{ pattern: RegExp; provides: string }> }> = {
  cg: {
    keys: ['templateType'],
    messageHints: [
      { pattern: /שם\s*תחתון|lower.?third|name.?super/i, provides: 'templateType' },
      { pattern: /סקור|score/i, provides: 'templateType' },
      { pattern: /טיקר|ticker/i, provides: 'templateType' },
      { pattern: /שלט|slate/i, provides: 'templateType' },
      { pattern: /מבזק|breaking/i, provides: 'templateType' },
    ],
  },
  lineup: {
    keys: ['programType'],
    messageHints: [
      { pattern: /ספורט|sport|כדורגל|football/i, provides: 'programType' },
      { pattern: /חדשות|news/i, provides: 'programType' },
      { pattern: /טוק|talk|שיחה/i, provides: 'programType' },
      { pattern: /קומדי|comedy|בידור/i, provides: 'programType' },
      { pattern: /דוקו|documentary/i, provides: 'programType' },
      { pattern: /רנדאון|rundown|lineup|תכנית|program/i, provides: 'programType' },
    ],
  },
  shifts: {
    keys: [],  // shifts can work with defaults (current week, user's department)
    messageHints: [],
  },
  news: {
    keys: [],  // news can work with defaults (all categories, last 24h)
    messageHints: [],
  },
  rights: {
    keys: [],  // rights can work with defaults (all sports)
    messageHints: [],
  },
  // ── New read-only lookup intents — all use sensible defaults ─────
  // (today / current user / current department) when entities are absent.
  help: { keys: [], messageHints: [] },
  preset: { keys: [], messageHints: [] },
  equipment_lookup: { keys: [], messageHints: [] },
  shift_lookup: { keys: [], messageHints: [] },
  broadcast_lookup: { keys: [], messageHints: [] },
  user_lookup: { keys: [], messageHints: [] },
};

/**
 * Check if required entities are satisfied for an operational intent.
 * Falls back to scanning the message for hints if entities are empty.
 */
export function requiredEntitiesSatisfied(
  intent: string,
  entities: Record<string, unknown> | undefined,
  message: string,
): { satisfied: boolean; missing: string[] } {
  const spec = REQUIRED_ENTITIES[intent];
  if (!spec || spec.keys.length === 0) {
    // No hard requirements for this intent
    return { satisfied: true, missing: [] };
  }

  const present = new Set<string>(Object.keys(entities || {}));

  // Also check message text for hints that implicitly satisfy an entity
  for (const hint of spec.messageHints) {
    if (hint.pattern.test(message)) {
      present.add(hint.provides);
    }
  }

  const missing: string[] = [];
  for (const key of spec.keys) {
    if (!present.has(key)) {
      missing.push(key);
    }
  }

  return { satisfied: missing.length === 0, missing };
}

/**
 * Build a short Hebrew clarification message asking for the missing entities.
 */
export function buildMissingEntitiesClarification(intent: string, missing: string[]): string {
  // Intent-specific clarification messages (Hebrew, short, direct)
  const templates: Record<string, string> = {
    cg: 'איזה סוג גרפיקה צריך? (שם תחתון, סקורבאג, טיקר, שלט פתיחה)',
    lineup: 'לאיזו תוכנית לבנות רנדאון? ספר/י על סוג התוכנית, ערוץ ומשך.',
    shifts: 'לאיזה שבוע ומחלקה לבנות משמרות?',
    news: 'על איזה נושא או קטגוריה להביא חדשות?',
    rights: 'על איזו ליגה או ענף ספורט תרצה מידע?',
    help: 'מה תרצה לדעת איך לעשות?',
    preset: 'לאיזה סוג שידור אתה מחפש פריסט? (משחק מרכזי, שידור חוץ סטנדרטי, וכו\')',
    equipment_lookup: 'איזה ציוד לבדוק? (קטגוריה / שם / ברקוד)',
    shift_lookup: 'לאיזה תאריך / מחלקה אתה מתייחס?',
    broadcast_lookup: 'לאיזה תאריך אתה מתייחס? (היום, מחר, השבוע)',
    user_lookup: 'את מי אתה מחפש? (שם / תפקיד / מחלקה)',
  };

  return templates[intent] || 'אנא ספק פרטים נוספים כדי שאוכל לעזור.';
}

// ─── End Operational Hard Gates ──────────────────────────────────────────────

/**
 * Process a user message
 */
export async function processMessage(context: MessageContext): Promise<ChatAgentResponse> {
  const startTime = Date.now();
  const traceId = uuidv4();
  
  logger.info('Processing message', {
    conversationId: context.conversationId,
    userId: context.userId,
    messageLength: context.message.length,
    traceId,
  });
  
  try {
    // Step 1: Check LLM availability
    const provider = getLLMProvider();
    const isAvailable = await provider.isAvailable();
    
    if (!isAvailable) {
      logger.warn('LLM not available', { traceId });
      return buildErrorResponse(
        'מערכת ה-AI אינה זמינה כרגע. אנא נסה שוב מאוחר יותר.',
        'בדוק שמודל Ollama פועל על השרת',
        'none',
        Date.now() - startTime
      );
    }
    
    // Step 2: GreetingWorker — check for simple greetings (bypass LLM)
    const greetingResult = GreetingWorker.run(context.message);
    if (greetingResult.isGreeting) {
      logger.info('Greeting detected via GreetingWorker, using hardcoded response', { traceId });
      return buildTextResponse(
        greetingResult.responseText!,
        { primary: 'general', confidence: 1.0, entities: {} },
        'hardcoded',
        Date.now() - startTime
      );
    }
    
    // Step 3: IntentWorker — classify intent (output treated as UNTRUSTED)
    const rawIntent = await IntentWorker.run(
      context.message,
      context.conversationHistory?.map(m => `${m.role}: ${m.content}`).join('\n'),
    );

    // Validate Worker output (non-failing: fallback to safe default on bad data)
    const intentValidation = IntentSchema.safeParse(rawIntent);
    const intent: Intent = intentValidation.success
      ? intentValidation.data
      : { primary: 'general', confidence: 0.2, entities: {} };

    if (!intentValidation.success) {
      logger.warn('IntentWorker output failed schema validation, falling back to general', {
        errors: intentValidation.error.errors.map(e => e.message),
        traceId,
      });
    }

    logger.decision(
      `Classified intent as ${intent.primary}`,
      `Confidence: ${intent.confidence}`,
      { intent, traceId },
      traceId
    );
    
    // Step 3a: ClarificationWorker — check if clarification is needed
    const clarResult = ClarificationWorker.run(intent, context.message);
    if (clarResult.needsClarification) {
      return buildClarificationResponse(
        clarResult.question!,
        intent,
        provider.getName(),
        Date.now() - startTime
      );
    }
    
    // Step 3b: OperationalGateWorker — operational intents NEVER reach free chat
    const gateResult = OperationalGateWorker.run(
      intent.primary,
      intent.entities,
      context.message,
    );
    const operational = gateResult.operational;

    if (operational) {
      if (!gateResult.entitiesOk) {
        logger.info('Operational intent missing required entities, requesting clarification', {
          intent: intent.primary,
          missing: gateResult.missing,
          traceId,
        });
        return buildClarificationResponse(
          gateResult.clarificationText!,
          intent,
          provider.getName(),
          Date.now() - startTime,
        );
      }

      // Ensure a tool is registered for this operational intent
      if (!registeredTools.has(intent.primary)) {
        logger.warn('Operational intent has no registered tool', {
          intent: intent.primary,
          traceId,
        });
        return buildErrorResponse(
          `הכלי עבור ${intent.primary} אינו זמין כרגע.`,
          'נסה שוב מאוחר יותר או פנה לתמיכה.',
          provider.getName(),
          Date.now() - startTime,
        );
      }
    }

    // Step 4: Execute tool if registered
    const toolHandler = registeredTools.get(intent.primary);
    const toolsUsed: ToolUsage[] = [];
    
    if (toolHandler) {
      const toolStartTime = Date.now();
      
      logger.info(`Executing tool: ${intent.primary}`, { traceId });

      // Validate tool input with Zod schema if available
      const toolDef = getToolByIntent(intent.primary);
      const toolInput = { message: context.message, entities: intent.entities };
      if (toolDef?.inputSchema) {
        const validationResult = toolDef.inputSchema.safeParse(toolInput);
        if (!validationResult.success) {
          const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
          logger.warn(`Tool input validation failed for ${intent.primary}`, { errors, traceId });
          return buildErrorResponse(
            'הנתונים שסופקו אינם תקינים',
            'ודא שהמידע שסיפקת מלא ותקין',
            provider.getName(),
            Date.now() - startTime
          );
        }
      }

      let toolResult: { success: boolean; data?: unknown; text: string; error?: string };
      try {
        toolResult = await withTimeout(
          toolHandler(
            toolInput,
            context
          ),
          config.performance.heavyPlanningLatencyMs,
          `tool:${intent.primary}`
        );
      } catch (timeoutError) {
        const elapsed = Date.now() - toolStartTime;
        const errMsg = (timeoutError as Error).message;
        if (errMsg.startsWith('Timeout:')) {
          logger.warn(`Tool execution timed out: ${intent.primary}`, { elapsed, traceId });
          return buildErrorResponse(
            'הפעולה לקחה יותר מדי זמן. נסה לשאול שאלה קצרה יותר.',
            'נסה שוב או פנה לתמיכה',
            provider.getName(),
            Date.now() - startTime
          );
        }
        throw timeoutError;
      }
      
      toolsUsed.push(createToolUsage(
        intent.primary,
        { message: context.message, entities: intent.entities },
        toolResult.success ? { data: toolResult.data } : undefined,
        Date.now() - toolStartTime,
        toolResult.success,
        toolResult.error
      ));
      
      if (toolResult.success) {
        return buildResponse({
          intent,
          text: toolResult.text,
          structuredData: toolResult.data,
          toolsUsed,
          explanation: `Executed ${intent.primary} tool successfully`,
          metadata: {
            modelUsed: provider.getName(),
            totalLatencyMs: Date.now() - startTime,
            isOffline: false,
          },
        });
      } else {
        // Tool failed, provide error response
        return buildErrorResponse(
          toolResult.error || 'הפעולה נכשלה',
          'נסה שוב או פנה לתמיכה',
          provider.getName(),
          Date.now() - startTime
        );
      }
    }
    
    // Step 5: FreeChatWorker — ONLY for non-operational intents.
    // Operational intents must never reach here (guarded above), but add a safety net.
    if (operational) {
      logger.error('Operational intent reached free chat path — this should never happen', {
        intent: intent.primary,
        traceId,
      });
      return buildErrorResponse(
        'לא הצלחתי לבצע את הפעולה המבוקשת.',
        'נסה שוב או פנה לתמיכה.',
        provider.getName(),
        Date.now() - startTime,
      );
    }

    let chatResult;
    try {
      chatResult = await FreeChatWorker.run({
        message: context.message,
        conversationHistory: context.conversationHistory || [],
        entities: intent.entities as Record<string, string> | undefined,
      });
    } catch (chatError) {
      const errMsg = (chatError as Error).message;
      if (errMsg.startsWith('Timeout:')) {
        logger.warn('FreeChatWorker timed out', { timeout: config.llm.timeout, traceId });
        return buildErrorResponse(
          'הבקשה לקחה יותר מדי זמן',
          'נסה לשאול שאלה קצרה יותר או פשוטה יותר',
          provider.getName(),
          Date.now() - startTime,
        );
      }
      throw chatError;
    }

    // Validate FreeChatWorker output (must be a non-empty string)
    if (typeof chatResult.text !== 'string' || chatResult.text.length === 0) {
      logger.warn('FreeChatWorker returned invalid output, using fallback', { traceId });
      return buildErrorResponse(
        'לא הצלחתי לייצר תשובה',
        'נסה שוב או פנה לתמיכה',
        provider.getName(),
        Date.now() - startTime,
      );
    }

    return buildTextResponse(
      chatResult.text,
      intent,
      chatResult.modelUsed,
      Date.now() - startTime,
    );
    
  } catch (error) {
    logger.error('Error processing message', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      traceId,
    });
    
    return buildErrorResponse(
      'אירעה שגיאה בעיבוד הבקשה',
      'נסה שוב או פנה לתמיכה טכנית',
      'error',
      Date.now() - startTime
    );
  }
}

/**
 * Get agent status
 */
export async function getAgentStatus(): Promise<{
  isOnline: boolean;
  modelLoaded: string | null;
  capabilities: string[];
}> {
  try {
    const provider = getLLMProvider();
    const isAvailable = await provider.isAvailable();
    const models = isAvailable ? await provider.listModels() : [];
    
    return {
      isOnline: isAvailable,
      modelLoaded: models.length > 0 ? models[0] : null,
      capabilities: Array.from(registeredTools.keys()),
    };
  } catch (error) {
    return {
      isOnline: false,
      modelLoaded: null,
      capabilities: [],
    };
  }
}

export default {
  processMessage,
  registerTool,
  getAgentStatus,
  isOperationalIntent,
  requiredEntitiesSatisfied,
  buildMissingEntitiesClarification,
};
