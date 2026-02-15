/**
 * CG Spec Generator Tool
 * 
 * Generates structured CG (Character Generator) specifications.
 * Integrates with the existing VizrtTemplate system.
 */

import { v4 as uuidv4 } from 'uuid';
import { getLLMProvider } from '../llm';
import { CG_SPEC_PROMPT } from '../llm/prompt-templates';
import { createLogger } from '../utils/logger';
import { validateCGTextField, normalizeRTL } from '../utils/validation';
import { connectMongoDB } from '../data/mongodb-adapter';
import {
  CGSpec,
  CGTemplateType,
  CGRequest,
  LowerThirdFields,
  ScoreBugFields,
  TickerFields,
  MatchSlateFields,
  CGValidation,
} from '../schemas/cg-spec';

const logger = createLogger('cg-spec-generator');

/**
 * VizRT template from database
 */
interface VizrtTemplate {
  _id: string;
  name: string;
  description?: string;
  category: string;
  fields: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    defaultValue?: string;
  }>;
}

/**
 * Get VizRT templates from MongoDB
 */
async function getVizrtTemplates(category?: string): Promise<VizrtTemplate[]> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<VizrtTemplate>('vizrtTemplates');
    
    const query = category ? { category: category.toUpperCase() } : {};
    return await collection.find(query).toArray();
  } catch (error) {
    logger.warn('Failed to fetch VizRT templates', {
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Map CG template type to VizRT category
 */
function mapTemplateTypeToCategory(type: CGTemplateType): string {
  const mapping: Record<CGTemplateType, string> = {
    lower_third: 'LOWER_THIRD',
    scorebug: 'SCORE_BUG',
    ticker: 'SPORTS_TICKER',
    match_slate: 'CUSTOM',
    sponsor_bug: 'CUSTOM',
    name_super: 'LOWER_THIRD',
    full_screen: 'CUSTOM',
    side_panel: 'CUSTOM',
    breaking_news: 'BREAKING_NEWS',
    weather: 'WEATHER',
    custom: 'CUSTOM',
  };
  return mapping[type] || 'CUSTOM';
}

/**
 * Validate CG spec fields
 */
function validateCGSpec(spec: Partial<CGSpec>, template?: VizrtTemplate): CGValidation {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Check required fields
  if (!spec.templateType) {
    errors.push('Template type is required');
  }
  
  if (!spec.fields || Object.keys(spec.fields).length === 0) {
    errors.push('At least one field is required');
  }
  
  // Check text length limits (typical CG limits)
  if (spec.fields) {
    for (const [key, value] of Object.entries(spec.fields)) {
      if (typeof value === 'string') {
        if (value.length > 100) {
          warnings.push(`Field "${key}" is very long (${value.length} chars), may be truncated`);
        }
        if (value.length > 200) {
          errors.push(`Field "${key}" exceeds maximum length (${value.length} > 200)`);
        }
      }
    }
  }
  
  // Validate against template if available
  if (template) {
    const requiredFields = template.fields.filter(f => f.required).map(f => f.key);
    for (const field of requiredFields) {
      if (!spec.fields || !(field in spec.fields)) {
        warnings.push(`Required field "${field}" is missing`);
      }
    }
  }
  
  // Check timing
  if (spec.timing) {
    if (spec.timing.duration <= 0) {
      errors.push('Duration must be positive');
    }
    if (spec.timing.duration > 60) {
      warnings.push('Duration is longer than 60 seconds');
    }
  }
  
  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Generate lower third CG spec
 */
export function generateLowerThird(fields: LowerThirdFields): CGSpec {
  const id = uuidv4();
  
  return {
    id,
    templateType: 'lower_third',
    fields: {
      name: fields.name,
      title: fields.title || '',
      subtitle: fields.subtitle || '',
    },
    timing: {
      inPoint: '00:00:00:00',
      duration: 5,
      outAnimation: 'fade',
    },
    validation: validateCGSpec({
      templateType: 'lower_third',
      fields: { name: fields.name },
    }),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate score bug CG spec
 */
export function generateScoreBug(fields: ScoreBugFields): CGSpec {
  const id = uuidv4();
  
  return {
    id,
    templateType: 'scorebug',
    fields: {
      homeTeam: fields.homeTeam,
      awayTeam: fields.awayTeam,
      homeScore: fields.homeScore,
      awayScore: fields.awayScore,
      time: fields.time,
      period: fields.period || '',
      competition: fields.competition || '',
    },
    timing: {
      inPoint: '00:00:00:00',
      duration: 0, // Persistent until updated
    },
    validation: validateCGSpec({
      templateType: 'scorebug',
      fields: {
        homeTeam: fields.homeTeam,
        awayTeam: fields.awayTeam,
        homeScore: fields.homeScore,
        awayScore: fields.awayScore,
      },
    }),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate ticker CG spec
 */
export function generateTicker(fields: TickerFields): CGSpec {
  const id = uuidv4();
  
  // Format items as a single string or keep as structured
  const itemsText = fields.items.map(item => item.text).join(' | ');
  
  return {
    id,
    templateType: 'ticker',
    fields: {
      items: itemsText,
      speed: fields.speed || 'normal',
      loop: fields.loop !== false,
    },
    timing: {
      inPoint: '00:00:00:00',
      duration: 0, // Continuous
    },
    validation: {
      isValid: true,
      warnings: fields.items.length > 10 ? ['Many ticker items may cause performance issues'] : [],
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate match slate CG spec
 */
export function generateMatchSlate(fields: MatchSlateFields): CGSpec {
  const id = uuidv4();
  
  return {
    id,
    templateType: 'match_slate',
    fields: {
      competition: fields.competition,
      homeTeam: fields.homeTeam,
      awayTeam: fields.awayTeam,
      venue: fields.venue || '',
      kickoffTime: fields.kickoffTime,
      date: fields.date,
    },
    timing: {
      inPoint: '00:00:00:00',
      duration: 10,
      outAnimation: 'fade',
    },
    validation: validateCGSpec({
      templateType: 'match_slate',
      fields: {
        homeTeam: fields.homeTeam,
        awayTeam: fields.awayTeam,
        kickoffTime: fields.kickoffTime,
      },
    }),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Parse CG request from natural language
 */
export async function parseCGRequest(message: string): Promise<Partial<CGRequest>> {
  const lower = message.toLowerCase();
  const request: Partial<CGRequest> = {};
  
  // Detect template type
  if (lower.includes('שם') || lower.includes('name') || lower.includes('תחתון') || lower.includes('lower')) {
    request.templateType = 'lower_third';
  } else if (lower.includes('סקור') || lower.includes('score') || lower.includes('תוצאה')) {
    request.templateType = 'scorebug';
  } else if (lower.includes('טיקר') || lower.includes('ticker') || lower.includes('רץ')) {
    request.templateType = 'ticker';
  } else if (lower.includes('שלט') || lower.includes('slate') || lower.includes('פתיחה')) {
    request.templateType = 'match_slate';
  } else if (lower.includes('breaking') || lower.includes('מבזק')) {
    request.templateType = 'breaking_news';
  }
  
  request.context = message;
  
  return request;
}

/**
 * Extract fields from natural language using LLM
 */
export async function extractFieldsWithLLM(
  message: string,
  templateType: CGTemplateType
): Promise<Record<string, string | number>> {
  try {
    const provider = getLLMProvider();
    const isAvailable = await provider.isAvailable();
    
    if (!isAvailable) {
      logger.warn('LLM not available for field extraction');
      return {};
    }
    
    let fieldPrompt = '';
    
    switch (templateType) {
      case 'lower_third':
        fieldPrompt = `Extract name and title from: "${message}"
Return JSON: { "name": "...", "title": "..." }`;
        break;
      case 'scorebug':
        fieldPrompt = `Extract teams and score from: "${message}"
Return JSON: { "homeTeam": "...", "awayTeam": "...", "homeScore": 0, "awayScore": 0, "time": "..." }`;
        break;
      case 'match_slate':
        fieldPrompt = `Extract match details from: "${message}"
Return JSON: { "homeTeam": "...", "awayTeam": "...", "competition": "...", "kickoffTime": "...", "date": "..." }`;
        break;
      default:
        fieldPrompt = `Extract relevant fields from: "${message}"
Return JSON with key-value pairs.`;
    }
    
    const result = await provider.generate(fieldPrompt, {
      systemPrompt: CG_SPEC_PROMPT,
      temperature: 0.3,
      maxTokens: 256,
    });
    
    // Try to parse JSON from response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return {};
  } catch (error) {
    logger.error('Failed to extract fields with LLM', {
      error: (error as Error).message,
    });
    return {};
  }
}

/**
 * Generate CG spec from request
 */
export async function generateCGSpec(request: CGRequest): Promise<CGSpec> {
  logger.info('Generating CG spec', { request });
  
  const templateType = request.templateType;
  
  // Get matching VizRT template if available
  const category = mapTemplateTypeToCategory(templateType);
  const templates = await getVizrtTemplates(category);
  const matchingTemplate = templates.length > 0 ? templates[0] : undefined;
  
  // Extract fields from context if not provided
  let fields = request.fields || {};
  if (request.context && Object.keys(fields).length === 0) {
    fields = await extractFieldsWithLLM(request.context, templateType);
  }
  
  // Generate spec based on type
  let spec: CGSpec;
  
  switch (templateType) {
    case 'lower_third':
    case 'name_super':
      spec = generateLowerThird(fields as LowerThirdFields);
      break;
    case 'scorebug':
      spec = generateScoreBug(fields as ScoreBugFields);
      break;
    case 'ticker':
      spec = generateTicker({
        items: [{ text: fields.text as string || 'Ticker item' }],
      });
      break;
    case 'match_slate':
      spec = generateMatchSlate(fields as MatchSlateFields);
      break;
    default:
      spec = {
        id: uuidv4(),
        templateType,
        templateId: matchingTemplate?._id,
        templateName: matchingTemplate?.name,
        fields: fields as Record<string, string | number | boolean>,
        validation: validateCGSpec({ templateType, fields: fields as unknown as Record<string, string | number | boolean> }),
        generatedAt: new Date().toISOString(),
      };
  }
  
  // Add template reference if found
  if (matchingTemplate) {
    spec.templateId = matchingTemplate._id;
    spec.templateName = matchingTemplate.name;
  }
  
  logger.info('CG spec generated', {
    id: spec.id,
    templateType: spec.templateType,
    isValid: spec.validation.isValid,
  });
  
  return spec;
}

// ─── LIVE CG Deterministic Parsing ───────────────────────────────────────────

/**
 * Result from deterministic LIVE CG message parsing.
 */
export interface LiveCGParseResult {
  parseSuccess: boolean;
  templateType?: CGTemplateType;
  fields: Record<string, string | number>;
  missing: string[];
  validationErrors: string[];
}

/**
 * Check if a message or context indicates LIVE CG mode.
 */
export function isLiveCGRequest(message: string, mode?: string): boolean {
  if (mode === 'LIVE_CG') return true;
  const lower = message.toLowerCase();
  return lower.startsWith('cg live') ||
    lower.startsWith('live_cg') ||
    lower.startsWith('live cg') ||
    /\bcg\s*live\b/i.test(lower) ||
    /\blive[_\s]cg\b/i.test(lower);
}

/**
 * Deterministic parser for LIVE CG messages.
 *
 * Extracts match data using regex/fixed rules. NEVER guesses.
 * Returns only explicitly provided data; missing fields are listed.
 *
 * Supported patterns:
 * - "TeamA vs TeamB" or "TeamA נגד TeamB"
 * - "score 1-0" or "תוצאה 1-0"
 * - "time 45:00" or "דקה 45"
 * - "HH:MM" for broadcast start time
 * - Template type keywords (scorebug, lower third, slate, etc.)
 */
export function parseLiveCGMessage(message: string): LiveCGParseResult {
  const missing: string[] = [];
  const validationErrors: string[] = [];
  const fields: Record<string, string | number> = {};

  // Strip LIVE CG prefix for cleaner parsing
  const cleaned = message
    .replace(/^(cg\s*live|live[_\s]cg)\s*/i, '')
    .trim();

  // ── Template type detection ──
  let templateType: CGTemplateType | undefined;
  const lower = cleaned.toLowerCase();

  if (/סקור|score|תוצאה|scorebug/i.test(lower)) {
    templateType = 'scorebug';
  } else if (/שם\s*תחתון|lower.?third|name.?super/i.test(lower)) {
    templateType = 'lower_third';
  } else if (/שלט|slate|פתיחה|match.?slate/i.test(lower)) {
    templateType = 'match_slate';
  } else if (/טיקר|ticker/i.test(lower)) {
    templateType = 'ticker';
  } else if (/מבזק|breaking/i.test(lower)) {
    templateType = 'breaking_news';
  }

  if (!templateType) {
    missing.push('templateType');
  }

  // ── Teams extraction: "TeamA vs TeamB", "TeamA נגד TeamB" ──
  const teamsMatch = cleaned.match(
    /([^\d\n,;:]+?)\s*(?:vs\.?|נגד|VS\.?|Vs\.?)\s*([^\d\n,;:]+?)(?:\s*[-–]\s*|\s*$|\s*(?:score|תוצאה|time|דקה|\d))/i
  );
  if (teamsMatch) {
    const home = normalizeRTL(teamsMatch[1]);
    const away = normalizeRTL(teamsMatch[2]);

    const homeValid = validateCGTextField(home, 40);
    const awayValid = validateCGTextField(away, 40);

    if (homeValid.valid) {
      fields.homeTeam = home;
    } else {
      validationErrors.push(`homeTeam: ${homeValid.error}`);
    }
    if (awayValid.valid) {
      fields.awayTeam = away;
    } else {
      validationErrors.push(`awayTeam: ${awayValid.error}`);
    }
  } else {
    // Try simpler extraction - just "Team1 Team2" without separator
    // Only if templateType suggests teams are needed
    if (templateType === 'scorebug' || templateType === 'match_slate') {
      missing.push('homeTeam', 'awayTeam');
    }
  }

  // ── Score extraction: "1-0", "score 2-1", "תוצאה 0-3" ──
  const scoreMatch = cleaned.match(/(?:score|תוצאה)?\s*(\d{1,2})\s*[-–:]\s*(\d{1,2})/i);
  if (scoreMatch) {
    fields.homeScore = parseInt(scoreMatch[1], 10);
    fields.awayScore = parseInt(scoreMatch[2], 10);
  } else if (templateType === 'scorebug') {
    // Score defaults to 0-0 for scorebug (explicit default, not a guess)
    fields.homeScore = 0;
    fields.awayScore = 0;
  }

  // ── Match time: "45:00", "דקה 73", "minute 89" ──
  const timeMatch = cleaned.match(/(?:time|דקה|minute)\s*(\d{1,3}(?::\d{2})?)/i);
  if (timeMatch) {
    fields.time = timeMatch[1].includes(':') ? timeMatch[1] : `${timeMatch[1]}:00`;
  } else if (templateType === 'scorebug') {
    missing.push('time');
  }

  // ── Broadcast start time: "HH:MM" ──
  const broadcastTimeMatch = cleaned.match(/(?:שידור|broadcast|start)\s*(?:at|ב?)\s*(\d{1,2}:\d{2})/i);
  if (broadcastTimeMatch) {
    fields.broadcastTime = broadcastTimeMatch[1];
  }

  // ── Name/Title for lower thirds ──
  if (templateType === 'lower_third') {
    // Pattern: "name: X" or "שם: X" 
    const nameMatch = cleaned.match(/(?:name|שם)\s*[:=]\s*(.+?)(?:\s*(?:title|תפקיד|כותרת)|$)/i);
    if (nameMatch) {
      const name = normalizeRTL(nameMatch[1]);
      const nameValid = validateCGTextField(name, 40);
      if (nameValid.valid) {
        fields.name = name;
      } else {
        validationErrors.push(`name: ${nameValid.error}`);
      }
    } else {
      missing.push('name');
    }

    const titleMatch = cleaned.match(/(?:title|תפקיד|כותרת)\s*[:=]\s*(.+?)$/i);
    if (titleMatch) {
      const title = normalizeRTL(titleMatch[1]);
      const titleValid = validateCGTextField(title, 60);
      if (titleValid.valid) {
        fields.title = title;
      } else {
        validationErrors.push(`title: ${titleValid.error}`);
      }
    }
  }

  // ── Competition ──
  const compMatch = cleaned.match(/(?:competition|תחרות|ליגה|league)\s*[:=]\s*(.+?)(?:\s|$)/i);
  if (compMatch) {
    fields.competition = normalizeRTL(compMatch[1]);
  }

  const parseSuccess = missing.length === 0 && validationErrors.length === 0;

  return {
    parseSuccess,
    templateType,
    fields,
    missing,
    validationErrors,
  };
}

// ─── End LIVE CG ─────────────────────────────────────────────────────────────

export default {
  generateLowerThird,
  generateScoreBug,
  generateTicker,
  generateMatchSlate,
  parseCGRequest,
  extractFieldsWithLLM,
  generateCGSpec,
  parseLiveCGMessage,
  isLiveCGRequest,
};
