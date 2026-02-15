/**
 * Response Builder
 * 
 * Constructs ChatAgentResponse objects from tool outputs.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ChatAgentResponse,
  Intent,
  ResponseMetadata,
  ToolUsage,
  Citation,
  createUnknownResponse,
} from '../schemas/chat-response';
import { createLogger } from '../utils/logger';

const logger = createLogger('response-builder');

export interface ResponseBuilderOptions {
  intent: Intent;
  text: string;
  structuredData?: unknown;
  citations?: Citation[];
  toolsUsed?: ToolUsage[];
  explanation: string;
  suggestedActions?: string[];
  clarificationNeeded?: string;
  metadata: ResponseMetadata;
}

/**
 * Build a complete ChatAgentResponse
 */
export function buildResponse(options: ResponseBuilderOptions): ChatAgentResponse {
  const messageId = uuidv4();
  
  const response: ChatAgentResponse = {
    messageId,
    intent: options.intent,
    response: {
      text: options.text,
      structuredData: options.structuredData,
      citations: options.citations,
    },
    toolsUsed: options.toolsUsed || [],
    explanation: options.explanation,
    metadata: options.metadata,
  };
  
  if (options.suggestedActions || options.clarificationNeeded) {
    response.followUp = {
      suggestedActions: options.suggestedActions || [],
      clarificationNeeded: options.clarificationNeeded,
    };
  }
  
  logger.debug('Built response', {
    messageId,
    intent: options.intent.primary,
    hasStructuredData: !!options.structuredData,
    toolsUsed: options.toolsUsed?.length || 0,
  });
  
  return response;
}

/**
 * Build a simple text response
 */
export function buildTextResponse(
  text: string,
  intent: Intent,
  modelUsed: string,
  durationMs: number
): ChatAgentResponse {
  return buildResponse({
    intent,
    text,
    explanation: 'Direct text response to user query',
    metadata: {
      modelUsed,
      totalLatencyMs: durationMs,
      isOffline: false,
    },
  });
}

/**
 * Build an error response
 */
export function buildErrorResponse(
  error: string,
  suggestion: string,
  modelUsed: string,
  durationMs: number
): ChatAgentResponse {
  const messageId = uuidv4();
  
  return createUnknownResponse(
    messageId,
    error,
    suggestion,
    {
      modelUsed,
      totalLatencyMs: durationMs,
      isOffline: false,
    }
  );
}

/**
 * Build a response with structured data
 */
export function buildStructuredResponse<T>(
  text: string,
  data: T,
  intent: Intent,
  toolsUsed: ToolUsage[],
  explanation: string,
  modelUsed: string,
  durationMs: number,
  citations?: Citation[]
): ChatAgentResponse {
  return buildResponse({
    intent,
    text,
    structuredData: data,
    citations,
    toolsUsed,
    explanation,
    metadata: {
      modelUsed,
      totalLatencyMs: durationMs,
      isOffline: false,
    },
  });
}

/**
 * Build a clarification request response
 */
export function buildClarificationResponse(
  question: string,
  originalIntent: Intent,
  modelUsed: string,
  durationMs: number
): ChatAgentResponse {
  return buildResponse({
    intent: {
      primary: 'clarification',
      confidence: originalIntent.confidence,
      entities: originalIntent.entities,
    },
    text: question,
    explanation: 'Need more information to proceed',
    suggestedActions: ['Provide more details about your request'],
    clarificationNeeded: question,
    metadata: {
      modelUsed,
      totalLatencyMs: durationMs,
      isOffline: false,
    },
  });
}

/**
 * Build an offline mode response
 */
export function buildOfflineResponse(
  text: string,
  intent: Intent,
  structuredData: unknown | undefined,
  dataAge: string,
  modelUsed: string,
  durationMs: number
): ChatAgentResponse {
  return buildResponse({
    intent,
    text: `${text}\n\n⚠️ נתונים מקומיים (עודכנו לאחרונה: ${dataAge})`,
    structuredData,
    explanation: 'Response generated from cached/local data - network unavailable',
    metadata: {
      modelUsed,
      totalLatencyMs: durationMs,
      isOffline: true,
    },
  });
}

/**
 * Create a tool usage record
 */
export function createToolUsage(
  name: string,
  input: Record<string, unknown>,
  output: Record<string, unknown> | undefined,
  durationMs: number,
  success: boolean,
  error?: string
): ToolUsage {
  return {
    name,
    input,
    output,
    durationMs,
    success,
    error,
  };
}

export default {
  buildResponse,
  buildTextResponse,
  buildErrorResponse,
  buildStructuredResponse,
  buildClarificationResponse,
  buildOfflineResponse,
  createToolUsage,
};
