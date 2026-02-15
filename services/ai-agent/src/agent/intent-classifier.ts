/**
 * Intent Classifier
 * 
 * Classifies user messages into actionable intents.
 */

import { z } from 'zod';
import { getLLMProvider } from '../llm';
import { INTENT_CLASSIFICATION_PROMPT } from '../llm/prompt-templates';
import { createLogger } from '../utils/logger';
import { Intent, IntentSchema } from '../schemas/chat-response';

const logger = createLogger('intent-classifier');

// Extended intent result with reasoning
const IntentResultSchema = z.object({
  intent: z.enum([
    'lineup',
    'cg',
    'shifts',
    'news',
    'rights',
    'general',
    'clarification',
  ]),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.string()).optional(),
  reasoning: z.string().optional(),
});

type IntentResult = z.infer<typeof IntentResultSchema>;

/**
 * Keywords for quick classification (bypass LLM for obvious cases)
 */
const INTENT_KEYWORDS: Record<string, string[]> = {
  lineup: [
    'rundown', 'lineup', 'תכנית', 'סגמנט', 'segments', 'schedule', 'show',
    'broadcast', 'program', 'episode', 'רנדאון', 'ליינאפ',
  ],
  cg: [
    'cg', 'graphics', 'lower third', 'scorebug', 'ticker', 'slate',
    'גרפיקה', 'שם', 'תחתון', 'סקורבאג', 'טיקר',
  ],
  shifts: [
    'shift', 'schedule', 'משמרת', 'משמרות', 'עבודה', 'availability', 'swap',
    'vacation', 'חופש', 'זמינות', 'החלפה', 'שבץ', 'שיבוץ', 'שבוע',
  ],
  news: [
    'news', 'חדשות', 'breaking', 'עדכון', 'update', 'brief',
    'what happened', 'מה קורה', 'סיכום', 'נושאים', 'אירועים',
    'ספר לי', 'מה חדש', 'מהימים האחרונים', 'מהיומיים', 'האחרונות',
    'ספורט', 'sport',
  ],
  rights: [
    'rights', 'זכויות', 'league', 'ליגה', 'fixture', 'match',
    'game', 'משחק', 'standings', 'טבלה', 'injury', 'פציעה',
  ],
};

/**
 * Greetings and general conversation patterns
 */
const GREETING_PATTERNS = [
  'היי', 'הי', 'שלום', 'מה נשמע', 'מה קורה', 'בוקר טוב', 'ערב טוב', 'לילה טוב',
  'hello', 'hi', 'hey', 'good morning', 'good evening', 'how are you',
  'מה שלומך', 'אהלן', 'יו', 'צהריים טובים', 'תודה', 'thanks', 'thank you',
  'עזרה', 'help', 'מה אתה יכול', 'what can you do', 'מי אתה', 'who are you',
];

/**
 * Check if message is a greeting or general conversation (internal)
 */
function isGreeting(message: string): boolean {
  const lowerMessage = message.toLowerCase().trim();
  
  // Check if the entire message is just a greeting (short messages)
  if (lowerMessage.length < 20) {
    for (const greeting of GREETING_PATTERNS) {
      if (lowerMessage === greeting.toLowerCase() || 
          lowerMessage.startsWith(greeting.toLowerCase() + ' ') ||
          lowerMessage.endsWith(' ' + greeting.toLowerCase())) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if message is a greeting (exported for orchestrator)
 */
export function isGreetingMessage(message: string): boolean {
  return isGreeting(message);
}

/**
 * Get hardcoded greeting response based on language
 */
export function getGreetingResponse(message: string): string {
  // Check if message contains Hebrew characters
  const hasHebrew = /[\u0590-\u05FF]/.test(message);
  
  if (hasHebrew) {
    return 'היי! אני לנסלוט, העוזר הוירטואלי. איך אפשר לעזור?';
  } else {
    return 'Hi! I\'m Lancelot, the virtual assistant. How can I help?';
  }
}

// ─── Lineup subtype detection ────────────────────────────────────────────────

/**
 * Keywords / patterns that indicate the user wants a list of CONTENT ITEMS
 * (e.g. "12 items", "3 sports, 2 politics"), not a segment-based structure.
 */
const LINEUP_ITEMS_PATTERNS: RegExp[] = [
  /\d+\s*(פריטים|items|כתבות|ידיעות|אייטמים)/i,
  /קטגוריות|categories/i,
  /סעיפים|bullets/i,
  /רשימת\s*(תוכן|פריטים|כתבות)/i,
  /item.?list|content.?list/i,
  /\d+\s*(ספורט|חדשות|פוליטיקה|כלכלה|בידור|תרבות|sports|news|politics)/i,
];

/**
 * Keywords that indicate the user wants a segment-based STRUCTURE
 * (intro / interview / break / outro flow).
 */
const LINEUP_STRUCTURE_PATTERNS: RegExp[] = [
  /סגמנט|segment/i,
  /פתיח|intro|opening/i,
  /ראיון|interview/i,
  /הפסקה|break/i,
  /סיום|outro|closing/i,
  /זרימה|flow|מבנה|structure/i,
];

/**
 * Detect whether a lineup request is for "items" (content list) or "structure"
 * (segment-based rundown). Returns undefined if ambiguous.
 */
export function detectLineupType(message: string): 'items' | 'structure' | undefined {
  const lowerMessage = message.toLowerCase();

  const matchesItems = LINEUP_ITEMS_PATTERNS.some(p => p.test(lowerMessage));
  const matchesStructure = LINEUP_STRUCTURE_PATTERNS.some(p => p.test(lowerMessage));

  if (matchesItems && !matchesStructure) return 'items';
  if (matchesStructure && !matchesItems) return 'structure';
  if (matchesItems && matchesStructure) return 'items'; // items takes precedence when both present
  return undefined; // ambiguous → let LLM or tool defaults decide
}

/**
 * Extract total item count from message (e.g. "12 פריטים" → 12, "ה12 אייטמים" → 12).
 */
export function extractItemCount(message: string): number | undefined {
  // Match "N items" with optional Hebrew prefix ה before the number
  const match = message.match(/ה?(\d+)\s*(?:ה)?\s*(פריטים|items|כתבות|ידיעות|אייטמים)/i);
  if (match) return parseInt(match[1], 10);
  return undefined;
}

/**
 * Category topic patterns for natural-language extraction.
 * Matches phrases like "כדורגל ישראלי", "ספורט עולמי כללי", etc.
 * Each entry: regex to match the topic phrase → canonical category label.
 */
const CATEGORY_TOPIC_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Israeli football
  { pattern: /כדורגל\s*ישראלי/i, label: 'כדורגל ישראלי' },
  // World / international football
  { pattern: /כדורגל\s*(?:עולמי|בינלאומי|אירופי)/i, label: 'כדורגל עולמי' },
  // Generic football (no qualifier)
  { pattern: /כדורגל(?!\s*(?:ישראלי|עולמי|בינלאומי|אירופי))/i, label: 'כדורגל' },
  // Israeli sports (other)
  { pattern: /(?:נושאי\s*)?ספורט\s*(?:אחר(?:ים)?|נוסף(?:ים)?)\s*(?:ב)?ישראל/i, label: 'ספורט ישראלי אחר' },
  { pattern: /ספורט\s*ישראלי/i, label: 'ספורט ישראלי' },
  // World / international sports (general)
  { pattern: /ספורט\s*עולמי\s*כללי/i, label: 'ספורט עולמי כללי' },
  { pattern: /ספורט\s*(?:עולמי|בינלאומי)/i, label: 'ספורט עולמי' },
  // Generic categories
  { pattern: /ספורט/i, label: 'ספורט' },
  { pattern: /חדשות/i, label: 'חדשות' },
  { pattern: /פוליטיקה/i, label: 'פוליטיקה' },
  { pattern: /כלכלה/i, label: 'כלכלה' },
  { pattern: /בידור/i, label: 'בידור' },
  { pattern: /תרבות/i, label: 'תרבות' },
  { pattern: /טכנולוגיה/i, label: 'טכנולוגיה' },
  // English
  { pattern: /sports?/i, label: 'sports' },
  { pattern: /news/i, label: 'news' },
  { pattern: /politics/i, label: 'politics' },
  { pattern: /business/i, label: 'business' },
  { pattern: /entertainment/i, label: 'entertainment' },
  { pattern: /culture/i, label: 'culture' },
  { pattern: /tech(?:nology)?/i, label: 'tech' },
  { pattern: /football|soccer/i, label: 'football' },
];

/**
 * Extract category distribution from a natural-language message.
 *
 * Handles patterns like:
 * - "5 אייטמים על כדורגל ישראלי" → { "כדורגל ישראלי": 5 }
 * - "3 ספורט, 2 פוליטיקה" → { "ספורט": 3, "פוליטיקה": 2 }
 * - "2 items about world sports" → { "ספורט עולמי": 2 }
 *
 * Strategy: split message into count-segments by digit boundaries, then classify each.
 */
export function extractCategoryCounts(message: string): Record<string, number> | undefined {
  const counts: Record<string, number> = {};

  // Split message into chunks, each starting with a number.
  // e.g. "5 אייטמים על כדורגל ישראלי 3 אייטמים על ..." →
  //   ["5 אייטמים על כדורגל ישראלי ", "3 אייטמים על ..."]
  const chunks: Array<{ count: number; text: string }> = [];
  const splitPattern = /(?:^|[\s,;ו])(\d+)\s+/g;
  const indices: Array<{ idx: number; count: number }> = [];
  let splitMatch;

  while ((splitMatch = splitPattern.exec(message)) !== null) {
    indices.push({
      idx: splitMatch.index,
      count: parseInt(splitMatch[1], 10),
    });
  }

  // Build text chunks between numeric anchors
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].idx;
    const end = i + 1 < indices.length ? indices[i + 1].idx : message.length;
    const rawText = message.substring(start, end);
    // Strip the leading number and filler words
    const text = rawText
      .replace(/^[\s,;ו]*\d+\s*/, '')
      .replace(/^(?:אייטמים|פריטים|כתבות|ידיעות|items)\s*/i, '')
      .replace(/^(?:על|about|of|on|עבור)\s*/i, '')
      .trim();

    chunks.push({ count: indices[i].count, text });
  }

  // Classify each chunk against topic patterns (most specific first)
  for (const { count, text } of chunks) {
    if (text.length === 0) continue;

    let matched = false;
    for (const { pattern, label } of CATEGORY_TOPIC_PATTERNS) {
      if (pattern.test(text)) {
        counts[label] = (counts[label] || 0) + count;
        matched = true;
        break;
      }
    }

    // If the chunk has meaningful text but no pattern matched, use cleaned text as label
    if (!matched && text.length > 1) {
      counts[text] = (counts[text] || 0) + count;
    }
  }

  return Object.keys(counts).length > 0 ? counts : undefined;
}

// ─── End lineup subtype detection ────────────────────────────────────────────

/**
 * Quick keyword-based classification
 */
function quickClassify(message: string): { intent: string; confidence: number; isGreeting?: boolean; entities?: Record<string, string> } | null {
  const lowerMessage = message.toLowerCase();
  
  // Check for greetings first - return general with high confidence
  if (isGreeting(message)) {
    return { intent: 'general', confidence: 0.9, isGreeting: true };
  }
  
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        // For lineup intent, detect subtype
        if (intent === 'lineup') {
          const lineupType = detectLineupType(message);
          const entities: Record<string, string> = {};
          if (lineupType) {
            entities.lineupType = lineupType;
          }
          const itemCount = extractItemCount(message);
          if (itemCount !== undefined) {
            entities.totalItems = String(itemCount);
          }
          return { intent, confidence: 0.7, entities };
        }
        return { intent, confidence: 0.7 };
      }
    }
  }
  
  return null;
}

/**
 * Classify user intent using LLM
 */
export async function classifyIntent(
  message: string,
  conversationContext?: string
): Promise<Intent> {
  const startTime = Date.now();
  
  // Try quick classification first
  const quickResult = quickClassify(message);
  if (quickResult && quickResult.confidence >= 0.7) {
    logger.debug('Quick intent classification', {
      intent: quickResult.intent,
      confidence: quickResult.confidence,
      entities: quickResult.entities,
      durationMs: Date.now() - startTime,
    });
    return {
      primary: quickResult.intent as Intent['primary'],
      confidence: quickResult.confidence,
      entities: quickResult.entities || {},
    };
  }
  
  // Fall back to LLM classification
  try {
    const provider = getLLMProvider();
    
    let prompt = `Classify this user message:\n\n"${message}"`;
    if (conversationContext) {
      prompt += `\n\nConversation context:\n${conversationContext}`;
    }
    
    const result = await provider.generateStructured<IntentResult>(
      prompt,
      IntentResultSchema,
      {
        systemPrompt: INTENT_CLASSIFICATION_PROMPT,
        temperature: 0.3, // Low temperature for classification
        maxTokens: 256,
      }
    );
    
    if (result.success && result.data) {
      logger.debug('LLM intent classification', {
        intent: result.data.intent,
        confidence: result.data.confidence,
        reasoning: result.data.reasoning,
        durationMs: result.durationMs,
      });
      
      return {
        primary: result.data.intent,
        confidence: result.data.confidence,
        entities: result.data.entities,
      };
    }
    
    // Classification failed, return general with low confidence
    logger.warn('Intent classification failed, defaulting to general', {
      errors: result.errors,
    });
    
    return {
      primary: 'general',
      confidence: 0.3,
      entities: {},
    };
  } catch (error) {
    logger.error('Intent classification error', {
      error: (error as Error).message,
    });
    
    // Fallback to general intent
    return {
      primary: 'general',
      confidence: 0.2,
      entities: {},
    };
  }
}

/**
 * Check if intent requires clarification
 */
export function needsClarification(intent: Intent): boolean {
  // General conversation (including greetings) never needs clarification
  if (intent.primary === 'general') {
    return false;
  }
  
  // Specific intents need clarification if confidence is too low
  return intent.primary === 'clarification' || intent.confidence < 0.4;
}

/**
 * Generate clarification request
 */
export function generateClarificationRequest(intent: Intent, originalMessage: string): string {
  if (intent.primary === 'lineup') {
    return 'לאיזו תוכנית אתה מתכוון? ספר לי על הערוץ, התאריך וסוג התוכנית.';
  }
  if (intent.primary === 'cg') {
    return 'איזה סוג גרפיקה אתה צריך? (שם תחתון, סקורבאג, טיקר, שלט פתיחה)';
  }
  if (intent.primary === 'shifts') {
    return 'לאיזה שבוע ומחלקה אתה מתכוון?';
  }
  if (intent.primary === 'news') {
    return 'לאיזה נושא או קטגוריה אתה מחפש חדשות?';
  }
  if (intent.primary === 'rights') {
    return 'על איזו ליגה או תחרות תרצה מידע?';
  }
  
  return 'לא הבנתי בדיוק מה אתה מחפש. תוכל לפרט יותר?';
}

export default {
  classifyIntent,
  needsClarification,
  generateClarificationRequest,
  isGreetingMessage,
  getGreetingResponse,
  detectLineupType,
  extractItemCount,
  extractCategoryCounts,
};
