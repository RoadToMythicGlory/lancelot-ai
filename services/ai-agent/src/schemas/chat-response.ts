/**
 * ChatAgentResponse Schema
 * 
 * The primary response format for all AI agent interactions.
 */

import { z } from 'zod';

// Intent classification
export const IntentSchema = z.object({
  primary: z.enum([
    'lineup',
    'cg',
    'shifts',
    'news',
    'rights',
    'general',
    'clarification',
    // ── Read-only "AI lives in the system" intents ─────────────
    'help',
    'preset',
    'equipment_lookup',
    'shift_lookup',
    'broadcast_lookup',
    'user_lookup',
  ]),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.string()).optional(),
});

export type Intent = z.infer<typeof IntentSchema>;

// Citation for news/data sources
export const CitationSchema = z.object({
  sourceUrl: z.string().url().optional(),
  sourceName: z.string(),
  fetchedAt: z.string().datetime().optional(),
  excerptHash: z.string().optional(),
  confidence: z.number().min(0).max(1),
  relevanceReason: z.string(),
});

export type Citation = z.infer<typeof CitationSchema>;

// Tool usage record
export const ToolUsageSchema = z.object({
  name: z.string(),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).optional(),
  durationMs: z.number(),
  success: z.boolean(),
  error: z.string().optional(),
});

export type ToolUsage = z.infer<typeof ToolUsageSchema>;

// Response content
export const ResponseContentSchema = z.object({
  text: z.string(),
  structuredData: z.unknown().optional(),
  citations: z.array(CitationSchema).optional(),
});

export type ResponseContent = z.infer<typeof ResponseContentSchema>;

// Follow-up suggestions
export const FollowUpSchema = z.object({
  suggestedActions: z.array(z.string()),
  clarificationNeeded: z.string().optional(),
});

export type FollowUp = z.infer<typeof FollowUpSchema>;

// Metadata
export const ResponseMetadataSchema = z.object({
  modelUsed: z.string(),
  totalLatencyMs: z.number(),
  tokensUsed: z.number().optional(),
  isOffline: z.boolean(),
});

export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>;

// Complete ChatAgentResponse
export const ChatAgentResponseSchema = z.object({
  messageId: z.string().uuid(),
  intent: IntentSchema,
  response: ResponseContentSchema,
  toolsUsed: z.array(ToolUsageSchema),
  explanation: z.string(),
  followUp: FollowUpSchema.optional(),
  metadata: ResponseMetadataSchema,
});

export type ChatAgentResponse = z.infer<typeof ChatAgentResponseSchema>;

// Simplified response for when LLM output is uncertain
export const UnknownResponseSchema = z.object({
  messageId: z.string().uuid(),
  intent: z.object({
    primary: z.literal('clarification'),
    confidence: z.number(),
  }),
  response: z.object({
    text: z.string(),
  }),
  explanation: z.string(),
  metadata: ResponseMetadataSchema,
});

export type UnknownResponse = z.infer<typeof UnknownResponseSchema>;

/**
 * Create an UNKNOWN response when data is missing
 */
export function createUnknownResponse(
  messageId: string,
  reason: string,
  suggestion: string,
  metadata: ResponseMetadata
): ChatAgentResponse {
  return {
    messageId,
    intent: {
      primary: 'clarification',
      confidence: 0,
    },
    response: {
      text: `לא הצלחתי למצוא את המידע המבוקש. ${reason}`,
    },
    toolsUsed: [],
    explanation: reason,
    followUp: {
      suggestedActions: [suggestion],
      clarificationNeeded: reason,
    },
    metadata,
  };
}

export default ChatAgentResponseSchema;
