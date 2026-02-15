/**
 * Agent Tests
 * 
 * Basic tests for the AI agent functionality.
 * Includes reliability hardening tests (hard gates, items lineup, LIVE CG, etc.)
 */

import { describe, it, expect, beforeAll, jest } from '@jest/globals';

// Mock the LLM provider before importing
jest.mock('../src/llm', () => ({
  getLLMProvider: () => ({
    isAvailable: async () => true,
    getName: () => 'mock-ollama',
    generate: async (prompt: string) => ({
      text: 'Mock response',
      model: 'mock-model',
      durationMs: 100,
      finishReason: 'stop',
    }),
    generateStructured: async () => ({
      success: true,
      data: {
        intent: 'general',
        confidence: 0.8,
        reasoning: 'Mock classification',
      },
      raw: '{}',
      model: 'mock-model',
      durationMs: 100,
    }),
  }),
  createLLMProvider: () => ({}),
}));

// Mock MongoDB
jest.mock('../src/data/mongodb-adapter', () => ({
  connectMongoDB: async () => ({
    collection: () => ({
      find: () => ({ toArray: async () => [], sort: () => ({ limit: () => ({ toArray: async () => [] }) }) }),
      createIndex: async () => {},
    }),
  }),
}));

import { classifyIntent, detectLineupType, extractItemCount, extractCategoryCounts } from '../src/agent/intent-classifier';
import { isOperationalIntent, requiredEntitiesSatisfied, buildMissingEntitiesClarification } from '../src/agent/orchestrator';
import { buildTextResponse, buildErrorResponse } from '../src/agent/response-builder';
import { validate, validateCGTextField, normalizeRTL, enforceStructuredOutput, parseLLMOutput } from '../src/utils/validation';
import { ChatAgentResponseSchema } from '../src/schemas/chat-response';
import { generateItemsLineup } from '../src/tools/lineup-builder';
import { parseLiveCGMessage, isLiveCGRequest } from '../src/tools/cg-spec-generator';
import { extractShiftConstraints } from '../src/tools/shift-solver';
import { z } from 'zod';

// ─── Original Tests ──────────────────────────────────────────────────────────

describe('Intent Classifier', () => {
  it('should classify lineup-related messages', async () => {
    const result = await classifyIntent('בנה לי רנדאון לתוכנית ספורט');
    expect(result.primary).toBe('lineup');
    expect(result.confidence).toBeGreaterThan(0.5);
  });
  
  it('should classify CG-related messages', async () => {
    const result = await classifyIntent('צור לי גרפיקת שם תחתון');
    expect(result.primary).toBe('cg');
    expect(result.confidence).toBeGreaterThan(0.5);
  });
  
  it('should classify shift-related messages', async () => {
    const result = await classifyIntent('מה המשמרות שלי השבוע?');
    expect(result.primary).toBe('shifts');
    expect(result.confidence).toBeGreaterThan(0.5);
  });
  
  it('should classify news-related messages', async () => {
    const result = await classifyIntent('מה החדשות האחרונות?');
    expect(result.primary).toBe('news');
    expect(result.confidence).toBeGreaterThan(0.5);
  });
  
  it('should classify rights-related messages', async () => {
    const result = await classifyIntent('יש לנו זכויות על הליגה הספרדית?');
    expect(result.primary).toBe('rights');
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

describe('Response Builder', () => {
  it('should build a valid text response', () => {
    const response = buildTextResponse(
      'Test response',
      { primary: 'general', confidence: 0.9 },
      'test-model',
      100
    );
    
    expect(response.response.text).toBe('Test response');
    expect(response.intent.primary).toBe('general');
    expect(response.metadata.modelUsed).toBe('test-model');
    expect(response.metadata.totalLatencyMs).toBe(100);
  });
  
  it('should build a valid error response', () => {
    const response = buildErrorResponse(
      'Test error',
      'Try again',
      'test-model',
      50
    );
    
    expect(response.intent.primary).toBe('clarification');
    expect(response.followUp?.suggestedActions).toContain('Try again');
  });
  
  it('should produce schema-valid responses', () => {
    const response = buildTextResponse(
      'Test',
      { primary: 'general', confidence: 0.8 },
      'model',
      100
    );
    
    const validation = validate(ChatAgentResponseSchema, response);
    expect(validation.success).toBe(true);
  });
});

describe('Validation Utils', () => {
  it('should validate correct schema', () => {
    const result = validate(ChatAgentResponseSchema, {
      messageId: '123e4567-e89b-12d3-a456-426614174000',
      intent: { primary: 'general', confidence: 0.8 },
      response: { text: 'Hello' },
      toolsUsed: [],
      explanation: 'Test',
      metadata: {
        modelUsed: 'test',
        totalLatencyMs: 100,
        isOffline: false,
      },
    });
    
    expect(result.success).toBe(true);
  });
  
  it('should reject invalid schema', () => {
    const result = validate(ChatAgentResponseSchema, {
      messageId: 'invalid-uuid',
      intent: { primary: 'invalid' },
    });
    
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });
});

// ─── Reliability Hardening Tests ─────────────────────────────────────────────

describe('Operational Hard Gates', () => {
  it('should identify operational intents correctly', () => {
    expect(isOperationalIntent('cg')).toBe(true);
    expect(isOperationalIntent('lineup')).toBe(true);
    expect(isOperationalIntent('shifts')).toBe(true);
    expect(isOperationalIntent('news')).toBe(true);
    expect(isOperationalIntent('rights')).toBe(true);
    expect(isOperationalIntent('general')).toBe(false);
    expect(isOperationalIntent('clarification')).toBe(false);
  });

  it('should report missing entities for CG intent', () => {
    const result = requiredEntitiesSatisfied('cg', {}, 'make me a graphic');
    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain('templateType');
  });

  it('should satisfy CG entities from message hints', () => {
    const result = requiredEntitiesSatisfied('cg', {}, 'צור לי שם תחתון');
    expect(result.satisfied).toBe(true);
  });

  it('should satisfy lineup entities from message hints', () => {
    const result = requiredEntitiesSatisfied('lineup', {}, 'רנדאון לתוכנית ספורט');
    expect(result.satisfied).toBe(true);
  });

  it('should always satisfy news/rights/shifts (no hard requirements)', () => {
    expect(requiredEntitiesSatisfied('news', {}, 'חדשות').satisfied).toBe(true);
    expect(requiredEntitiesSatisfied('rights', {}, 'זכויות').satisfied).toBe(true);
    expect(requiredEntitiesSatisfied('shifts', {}, 'משמרות').satisfied).toBe(true);
  });

  it('should return Hebrew clarification for missing entities', () => {
    const clarification = buildMissingEntitiesClarification('cg', ['templateType']);
    expect(clarification).toBeTruthy();
    expect(typeof clarification).toBe('string');
    expect(clarification.length).toBeGreaterThan(5);
  });
});

describe('Lineup Type Detection', () => {
  it('should detect items-type requests', () => {
    expect(detectLineupType('בנה לי 12 פריטים לרנדאון')).toBe('items');
    expect(detectLineupType('רנדאון עם 5 כתבות')).toBe('items');
    expect(detectLineupType('build a lineup with 3 sports, 2 politics items')).toBe('items');
  });

  it('should detect structure-type requests', () => {
    expect(detectLineupType('בנה רנדאון עם פתיח וראיון')).toBe('structure');
    expect(detectLineupType('build segments with intro, interview, break')).toBe('structure');
  });

  it('should return undefined for ambiguous requests', () => {
    expect(detectLineupType('בנה רנדאון')).toBeUndefined();
  });

  it('should extract item count', () => {
    expect(extractItemCount('12 פריטים')).toBe(12);
    expect(extractItemCount('5 items for the show')).toBe(5);
    expect(extractItemCount('build a rundown')).toBeUndefined();
  });

  it('should extract category counts from simple patterns', () => {
    const counts = extractCategoryCounts('3 ספורט, 2 פוליטיקה, 1 כלכלה');
    expect(counts).toBeDefined();
    expect(counts!['ספורט']).toBe(3);
    expect(counts!['פוליטיקה']).toBe(2);
    expect(counts!['כלכלה']).toBe(1);
  });

  it('should extract category counts from natural Hebrew phrasing', () => {
    const message = '5 אייטמים על כדורגל ישראלי 3 אייטמים על נושאי ספורט אחרים בישראל 2 אייטמים על כדורגל עולמי ו2 אייטמים על ספורט עולמי כללי';
    const counts = extractCategoryCounts(message);
    expect(counts).toBeDefined();
    // Should have 4 distinct categories
    const keys = Object.keys(counts!);
    expect(keys.length).toBe(4);
    // Total should be 12
    const total = Object.values(counts!).reduce((a, b) => a + b, 0);
    expect(total).toBe(12);
  });
});

describe('Items Lineup Generation', () => {
  it('should generate exactly the requested number of items', async () => {
    const result = await generateItemsLineup({
      programType: 'news',
      channel: 'Test',
      scheduledDate: new Date().toISOString(),
      totalItems: 12,
      categoryCounts: { sports: 4, politics: 3, business: 2, entertainment: 3 },
    });

    expect(result.totalItems).toBe(12);
    expect(result.items).toHaveLength(12);
    expect(result.lineupType).toBe('items');
  });

  it('should respect category distribution exactly', async () => {
    const result = await generateItemsLineup({
      programType: 'news',
      channel: 'Test',
      scheduledDate: new Date().toISOString(),
      totalItems: 8,
      categoryCounts: { sports: 3, politics: 5 },
    });

    const sportItems = result.items.filter(i => i.category === 'sports');
    const politicsItems = result.items.filter(i => i.category === 'politics');
    expect(sportItems).toHaveLength(3);
    expect(politicsItems).toHaveLength(5);
  });

  it('should fill remainder with general when counts are under totalItems', async () => {
    const result = await generateItemsLineup({
      programType: 'news',
      channel: 'Test',
      scheduledDate: new Date().toISOString(),
      totalItems: 10,
      categoryCounts: { sports: 3 },
    });

    expect(result.items).toHaveLength(10);
    const generalItems = result.items.filter(i => i.category === 'general');
    expect(generalItems).toHaveLength(7);
  });

  it('should mark unfilled items as placeholders when no data available', async () => {
    const result = await generateItemsLineup({
      programType: 'news',
      channel: 'Test',
      scheduledDate: new Date().toISOString(),
      totalItems: 5,
    });

    // With mocked DB returning empty, all items should be placeholders
    for (const item of result.items) {
      expect(item.isPlaceholder).toBe(true);
    }
  });

  it('should NOT return segment-based structure when lineupType=items', async () => {
    const result = await generateItemsLineup({
      programType: 'sports',
      channel: 'Test',
      scheduledDate: new Date().toISOString(),
      totalItems: 12,
      categoryCounts: { sports: 6, news: 3, entertainment: 3 },
    });

    // Must be items, not segments
    expect(result.lineupType).toBe('items');
    expect(result.items).toBeDefined();
    expect((result as any).segments).toBeUndefined();
  });
});

describe('LIVE CG Deterministic Parser', () => {
  it('should detect LIVE CG requests', () => {
    expect(isLiveCGRequest('CG LIVE scorebug Maccabi vs Hapoel')).toBe(true);
    expect(isLiveCGRequest('LIVE_CG lower third', undefined)).toBe(true);
    expect(isLiveCGRequest('some message', 'LIVE_CG')).toBe(true);
    expect(isLiveCGRequest('regular CG request')).toBe(false);
  });

  it('should parse scorebug with teams and score', () => {
    const result = parseLiveCGMessage('CG LIVE scorebug Maccabi Tel Aviv vs Hapoel Beer Sheva score 2-1 time 67:00');
    expect(result.templateType).toBe('scorebug');
    expect(result.fields.homeTeam).toBeDefined();
    expect(result.fields.awayTeam).toBeDefined();
    expect(result.fields.homeScore).toBe(2);
    expect(result.fields.awayScore).toBe(1);
  });

  it('should return missing fields instead of guessing', () => {
    const result = parseLiveCGMessage('LIVE CG scorebug');
    expect(result.parseSuccess).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('should never return free-form text', () => {
    const result = parseLiveCGMessage('CG LIVE scorebug TeamA vs TeamB 1-0 time 45:00');
    // Result should be structured data, not prose
    expect(typeof result.fields).toBe('object');
    expect(typeof result.parseSuccess).toBe('boolean');
  });

  it('should validate field lengths', () => {
    const longName = 'A'.repeat(50);
    const result = parseLiveCGMessage(`LIVE CG lower third name: ${longName} title: Test`);
    // Should fail validation for name field exceeding 40 chars
    expect(result.validationErrors.length).toBeGreaterThan(0);
  });
});

describe('CG Field Validators', () => {
  it('should accept valid text', () => {
    expect(validateCGTextField('מכבי תל אביב').valid).toBe(true);
    expect(validateCGTextField('Team Name').valid).toBe(true);
  });

  it('should reject empty text', () => {
    expect(validateCGTextField('').valid).toBe(false);
    expect(validateCGTextField('   ').valid).toBe(false);
  });

  it('should reject text exceeding maxLen', () => {
    const result = validateCGTextField('A'.repeat(50), 40);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('max length');
  });

  it('should normalize RTL text', () => {
    const result = normalizeRTL('  מכבי   תל אביב  ');
    expect(result).toBe('מכבי תל אביב');
  });

  it('should strip bidi control characters', () => {
    const result = normalizeRTL('\u200Ftest\u200E');
    expect(result).toBe('test');
  });
});

describe('JSON Repair Loop', () => {
  const testSchema = z.object({
    name: z.string(),
    value: z.number(),
  });

  it('should accept valid JSON on first attempt', async () => {
    const result = await enforceStructuredOutput(
      '{"name": "test", "value": 42}',
      testSchema,
      async () => '',
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'test', value: 42 });
  });

  it('should attempt repair on invalid JSON', async () => {
    let repairCalled = false;
    const result = await enforceStructuredOutput(
      '{"name": "test"}', // missing required "value"
      testSchema,
      async (error) => {
        repairCalled = true;
        return '{"name": "test", "value": 99}';
      },
    );
    expect(repairCalled).toBe(true);
    expect(result.success).toBe(true);
    expect(result.data?.value).toBe(99);
  });

  it('should return explicit error after repair failure', async () => {
    const result = await enforceStructuredOutput(
      'not json at all',
      testSchema,
      async () => 'still not json',
    );
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0]).toContain('failed after repair');
  });
});

describe('Shift Constraint Extraction', () => {
  it('should extract department from message', () => {
    const result = extractShiftConstraints('בנה לוח משמרות למחלקת mcr השבוע');
    expect(result.department).toBe('mcr');
  });

  it('should extract week reference', () => {
    const result = extractShiftConstraints('shifts for this week, השבוע');
    expect(result.weekStartDate).toBeDefined();
  });

  it('should list missing constraints', () => {
    const result = extractShiftConstraints('build a schedule');
    expect(result.missingConstraints.length).toBeGreaterThan(0);
    expect(result.missingConstraints.some(m => m.includes('department'))).toBe(true);
  });

  it('should never produce a schedule (constraints only)', () => {
    const result = extractShiftConstraints('mcr השבוע');
    // extractShiftConstraints returns constraints, NOT a schedule
    expect(result).not.toHaveProperty('assignments');
    expect(result).not.toHaveProperty('violations');
    expect(result).toHaveProperty('hardConstraints');
    expect(result).toHaveProperty('missingConstraints');
  });
});
