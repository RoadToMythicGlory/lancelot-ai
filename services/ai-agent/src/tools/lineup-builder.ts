/**
 * Lineup Builder Tool
 * 
 * Generates structured program rundowns for sports, news, and entertainment shows.
 */

import { v4 as uuidv4 } from 'uuid';
import { getLLMProvider } from '../llm';
import { LINEUP_BUILDER_PROMPT } from '../llm/prompt-templates';
import { createLogger } from '../utils/logger';
import { 
  LineupRundown, 
  LineupRequest, 
  Segment, 
  SegmentType, 
  Priority,
  ProgramType,
  Asset,
  StaffRequirement,
  LineupRundownSchema,
  ItemsLineup,
  LineupItem,
} from '../schemas/lineup-rundown';
import { Citation } from '../schemas/chat-response';
import { getRecentArticles, searchArticles, CachedArticle } from '../data/news-cache';
import { fetchAllSources } from './news-fetcher';
import { rssPipelineConfig } from '../rss/rss-config';
import { runRssPipeline } from '../rss/rss-pipeline';
import type { Brief } from '../rss/rss-types';

const logger = createLogger('lineup-builder');

/**
 * Default segment templates by program type
 */
const DEFAULT_SEGMENTS: Record<ProgramType, Partial<Segment>[]> = {
  sports: [
    { title: 'פתיח', type: 'graphics', duration: 30, priority: 'critical' },
    { title: 'סקירת מחזור', type: 'vtr', duration: 180, priority: 'high' },
    { title: 'ראיון אורח', type: 'interview', duration: 300, priority: 'high' },
    { title: 'הפסקה 1', type: 'break', duration: 180, priority: 'normal' },
    { title: 'מבט למשחקים', type: 'live', duration: 420, priority: 'critical' },
    { title: 'הפסקה 2', type: 'break', duration: 180, priority: 'normal' },
    { title: 'סיכום', type: 'graphics', duration: 60, priority: 'high' },
  ],
  news: [
    { title: 'פתיח חדשות', type: 'graphics', duration: 20, priority: 'critical' },
    { title: 'כותרות', type: 'live', duration: 60, priority: 'critical' },
    { title: 'ידיעה ראשית', type: 'vtr', duration: 180, priority: 'critical' },
    { title: 'ידיעה 2', type: 'vtr', duration: 120, priority: 'high' },
    { title: 'ידיעה 3', type: 'vtr', duration: 120, priority: 'high' },
    { title: 'הפסקה', type: 'break', duration: 180, priority: 'normal' },
    { title: 'ספורט', type: 'vtr', duration: 120, priority: 'normal' },
    { title: 'מזג אוויר', type: 'graphics', duration: 60, priority: 'normal' },
    { title: 'סיום', type: 'graphics', duration: 20, priority: 'high' },
  ],
  comedy: [
    { title: 'פתיח', type: 'graphics', duration: 30, priority: 'critical' },
    { title: 'מונולוג פתיחה', type: 'live', duration: 300, priority: 'critical' },
    { title: 'סקטץ\' 1', type: 'vtr', duration: 240, priority: 'high' },
    { title: 'הפסקה 1', type: 'break', duration: 180, priority: 'normal' },
    { title: 'אורח מיוחד', type: 'interview', duration: 480, priority: 'high' },
    { title: 'הפסקה 2', type: 'break', duration: 180, priority: 'normal' },
    { title: 'סקטץ\' 2', type: 'vtr', duration: 240, priority: 'normal' },
    { title: 'סיום', type: 'live', duration: 60, priority: 'high' },
  ],
  talk: [
    { title: 'פתיח', type: 'graphics', duration: 30, priority: 'critical' },
    { title: 'מבוא מנחה', type: 'live', duration: 180, priority: 'high' },
    { title: 'אורח 1', type: 'interview', duration: 600, priority: 'critical' },
    { title: 'הפסקה 1', type: 'break', duration: 180, priority: 'normal' },
    { title: 'אורח 2', type: 'interview', duration: 600, priority: 'high' },
    { title: 'הפסקה 2', type: 'break', duration: 180, priority: 'normal' },
    { title: 'פאנל', type: 'live', duration: 480, priority: 'high' },
    { title: 'סיום', type: 'graphics', duration: 60, priority: 'normal' },
  ],
  documentary: [
    { title: 'פתיח', type: 'graphics', duration: 30, priority: 'critical' },
    { title: 'חלק 1', type: 'vtr', duration: 900, priority: 'critical' },
    { title: 'הפסקה', type: 'break', duration: 180, priority: 'normal' },
    { title: 'חלק 2', type: 'vtr', duration: 900, priority: 'high' },
    { title: 'הפסקה 2', type: 'break', duration: 180, priority: 'normal' },
    { title: 'חלק 3', type: 'vtr', duration: 600, priority: 'high' },
    { title: 'קרדיטים', type: 'graphics', duration: 60, priority: 'normal' },
  ],
  entertainment: [
    { title: 'פתיח', type: 'graphics', duration: 30, priority: 'critical' },
    { title: 'מופע פתיחה', type: 'live', duration: 300, priority: 'high' },
    { title: 'משחק/תחרות 1', type: 'live', duration: 600, priority: 'critical' },
    { title: 'הפסקה 1', type: 'break', duration: 180, priority: 'normal' },
    { title: 'משחק/תחרות 2', type: 'live', duration: 600, priority: 'high' },
    { title: 'הפסקה 2', type: 'break', duration: 180, priority: 'normal' },
    { title: 'גמר', type: 'live', duration: 480, priority: 'critical' },
    { title: 'סיום', type: 'graphics', duration: 60, priority: 'high' },
  ],
  special: [
    { title: 'פתיח', type: 'graphics', duration: 30, priority: 'critical' },
    { title: 'חלק מרכזי', type: 'live', duration: 1800, priority: 'critical' },
    { title: 'סיום', type: 'graphics', duration: 60, priority: 'high' },
  ],
};

/**
 * Default staff requirements by program type
 */
const DEFAULT_STAFF: Record<ProgramType, StaffRequirement[]> = {
  sports: [
    { role: 'במאי', count: 1 },
    { role: 'מפיק', count: 1 },
    { role: 'עורך', count: 2 },
    { role: 'פרשן', count: 2 },
    { role: 'צלם', count: 3 },
  ],
  news: [
    { role: 'במאי', count: 1 },
    { role: 'מפיק', count: 1 },
    { role: 'עורך', count: 2 },
    { role: 'מגיש', count: 1 },
    { role: 'כתב', count: 3 },
  ],
  comedy: [
    { role: 'במאי', count: 1 },
    { role: 'מפיק', count: 1 },
    { role: 'עורך', count: 1 },
    { role: 'מנחה', count: 1 },
  ],
  talk: [
    { role: 'במאי', count: 1 },
    { role: 'מפיק', count: 1 },
    { role: 'עורך', count: 1 },
    { role: 'מנחה', count: 1 },
  ],
  documentary: [
    { role: 'במאי', count: 1 },
    { role: 'מפיק', count: 1 },
    { role: 'עורך', count: 2 },
  ],
  entertainment: [
    { role: 'במאי', count: 1 },
    { role: 'מפיק', count: 2 },
    { role: 'עורך', count: 2 },
    { role: 'מנחה', count: 1 },
  ],
  special: [
    { role: 'במאי', count: 1 },
    { role: 'מפיק', count: 2 },
    { role: 'עורך', count: 2 },
  ],
};

/**
 * Parse lineup request from natural language
 */
export async function parseLineupRequest(message: string): Promise<Partial<LineupRequest>> {
  const request: Partial<LineupRequest> = {};
  const lower = message.toLowerCase();
  
  // Detect program type
  if (lower.includes('ספורט') || lower.includes('sport') || lower.includes('כדורגל') || lower.includes('משחק')) {
    request.programType = 'sports';
  } else if (lower.includes('חדשות') || lower.includes('news')) {
    request.programType = 'news';
  } else if (lower.includes('קומדי') || lower.includes('comedy') || lower.includes('בידור')) {
    request.programType = 'comedy';
  } else if (lower.includes('טוק') || lower.includes('talk') || lower.includes('שיחה')) {
    request.programType = 'talk';
  } else if (lower.includes('דוקו') || lower.includes('documentary')) {
    request.programType = 'documentary';
  } else {
    request.programType = 'entertainment';
  }
  
  // Detect channel
  const channelMatch = lower.match(/ערוץ\s*(\d+|הספורט|one|1|5)/i);
  if (channelMatch) {
    request.channel = `Channel ${channelMatch[1]}`;
  }
  
  // Detect duration
  const durationMatch = lower.match(/(\d+)\s*(דקות|minutes|שעה|hour)/i);
  if (durationMatch) {
    const value = parseInt(durationMatch[1]);
    if (durationMatch[2].includes('שעה') || durationMatch[2].includes('hour')) {
      request.duration = value * 60;
    } else {
      request.duration = value;
    }
  }
  
  // Detect sport/league
  if (lower.includes('פרמייר') || lower.includes('premier')) {
    request.league = 'Premier League';
    request.sport = 'football';
  } else if (lower.includes('לה ליגה') || lower.includes('la liga')) {
    request.league = 'La Liga';
    request.sport = 'football';
  } else if (lower.includes('ליגת האלופות') || lower.includes('champions')) {
    request.league = 'Champions League';
    request.sport = 'football';
  }
  
  return request;
}

/**
 * Generate a lineup using templates
 */
export function generateTemplateLineup(request: LineupRequest): LineupRundown {
  const programType = request.programType || 'entertainment';
  const templateSegments = DEFAULT_SEGMENTS[programType] || DEFAULT_SEGMENTS.entertainment;
  const defaultStaff = DEFAULT_STAFF[programType] || DEFAULT_STAFF.entertainment;
  
  // Calculate total duration from segments
  const segmentTotalSeconds = templateSegments.reduce((sum, s) => sum + (s.duration || 0), 0);
  const targetDuration = request.duration ? request.duration * 60 : segmentTotalSeconds;
  const scaleFactor = targetDuration / segmentTotalSeconds;
  
  // Build segments with scaled durations
  const segments: Segment[] = templateSegments.map((template, index) => ({
    order: index + 1,
    title: template.title || `Segment ${index + 1}`,
    type: (template.type as SegmentType) || 'live',
    duration: Math.round((template.duration || 60) * scaleFactor),
    priority: (template.priority as Priority) || 'normal',
    notes: template.notes,
  }));
  
  // Generate lineup
  const lineup: LineupRundown = {
    id: uuidv4(),
    programType,
    title: request.title || `${programType} Program`,
    scheduledDate: request.scheduledDate || new Date().toISOString(),
    channel: request.channel || 'Default Channel',
    totalDuration: Math.round(targetDuration / 60),
    segments,
    requiredStaff: defaultStaff,
    requiredAssets: [],
    generatedAt: new Date().toISOString(),
    confidence: 0.85,
    notes: `Generated from ${programType} template`,
  };
  
  return lineup;
}

/**
 * Enhance lineup with LLM suggestions
 */
export async function enhanceLineupWithLLM(
  lineup: LineupRundown,
  context?: string
): Promise<LineupRundown> {
  try {
    const provider = getLLMProvider();
    const isAvailable = await provider.isAvailable();
    
    if (!isAvailable) {
      logger.warn('LLM not available, returning template lineup');
      return lineup;
    }
    
    const prompt = `Given this lineup for a ${lineup.programType} show:
${JSON.stringify(lineup.segments.map(s => ({ title: s.title, type: s.type, duration: s.duration })), null, 2)}

${context ? `Additional context: ${context}` : ''}

Suggest improvements to make it more engaging. Return JSON with:
- suggestedChanges: array of { segmentOrder, suggestion }
- overallNotes: string`;
    
    const result = await provider.generate(prompt, {
      systemPrompt: LINEUP_BUILDER_PROMPT,
      temperature: 0.7,
      maxTokens: 512,
    });
    
    // Add LLM suggestions to notes
    lineup.notes = `${lineup.notes || ''}\n\nAI Suggestions: ${result.text}`;
    
    return lineup;
  } catch (error) {
    logger.error('Failed to enhance lineup with LLM', {
      error: (error as Error).message,
    });
    return lineup;
  }
}

/**
 * Incorporate breaking news into lineup
 */
export async function incorporateBreakingNews(
  lineup: LineupRundown,
  sport?: string,
  league?: string
): Promise<{ lineup: LineupRundown; citations: Citation[] }> {
  const citations: Citation[] = [];
  
  try {
    // Get recent news
    const articles = await getRecentArticles({
      limit: 5,
      category: 'sports',
      sport,
      league,
      hoursBack: 6,
      minRelevance: 0.6,
    });
    
    if (articles.length > 0) {
      // Find a suitable segment to add news
      const newsSegmentIndex = lineup.segments.findIndex(s => 
        s.type === 'vtr' || s.title.includes('סקירה') || s.title.includes('חדשות')
      );
      
      if (newsSegmentIndex >= 0) {
        // Add news references to segment notes
        const newsNotes = articles.slice(0, 3).map((a, i) => 
          `${i + 1}. ${a.title}`
        ).join('\n');
        
        lineup.segments[newsSegmentIndex].notes = 
          `${lineup.segments[newsSegmentIndex].notes || ''}\n\nBreaking news to include:\n${newsNotes}`;
        
        // Add citations
        for (const article of articles.slice(0, 3)) {
          citations.push({
            sourceName: article.sourceName,
            sourceUrl: article.url,
            fetchedAt: article.fetchedAt.toISOString(),
            excerptHash: article.excerptHash,
            confidence: article.relevanceScore,
            relevanceReason: 'Breaking news for lineup',
          });
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to incorporate breaking news', {
      error: (error as Error).message,
    });
  }
  
  lineup.citations = citations;
  return { lineup, citations };
}

/**
 * Build a complete lineup
 */
export async function buildLineup(request: LineupRequest): Promise<LineupRundown> {
  logger.info('Building lineup', { request });
  
  // Step 1: Generate template-based lineup
  let lineup = generateTemplateLineup(request);
  
  // Step 2: Incorporate breaking news if sports
  if (request.programType === 'sports' || request.includeBreakingNews) {
    const { lineup: updatedLineup, citations } = await incorporateBreakingNews(
      lineup,
      request.sport,
      request.league
    );
    lineup = updatedLineup;
  }
  
  // Step 3: Enhance with LLM if available
  if (request.additionalContext) {
    lineup = await enhanceLineupWithLLM(lineup, request.additionalContext);
  }
  
  logger.info('Lineup built successfully', {
    id: lineup.id,
    segments: lineup.segments.length,
    totalDuration: lineup.totalDuration,
  });
  
  return lineup;
}

// ─── Items-based lineup generation ───────────────────────────────────────────

/**
 * Default category label mapping (Hebrew ↔ English normalization)
 */
const CATEGORY_LABELS: Record<string, string> = {
  'ספורט': 'sports',
  'sports': 'sports',
  'חדשות': 'news',
  'news': 'news',
  'פוליטיקה': 'politics',
  'politics': 'politics',
  'כלכלה': 'business',
  'business': 'business',
  'בידור': 'entertainment',
  'entertainment': 'entertainment',
  'תרבות': 'culture',
  'culture': 'culture',
  'טכנולוגיה': 'tech',
  'tech': 'tech',
};

/**
 * Normalize a category key to a canonical English label.
 */
function normalizeCategory(raw: string): string {
  return CATEGORY_LABELS[raw.toLowerCase()] || raw.toLowerCase();
}

/**
 * Category matching rules for scoring articles.
 * Each category has:
 *   - mustMatch: at least ONE of these patterns must appear in the article text (hard filter)
 *   - boostMatch: each match adds to the score (soft ranking)
 *   - excludeMatch: if any of these match, the article is excluded
 */
export interface CategoryMatchRules {
  mustMatch: RegExp[];
  boostMatch: RegExp[];
  excludeMatch?: RegExp[];
  sport?: string;
  league?: string;
  searchKeywords: string[];
}

/**
 * Sports-related content patterns — an article must match at least one of these
 * to be considered sports content at all (prevents politics/security articles leaking in).
 */
export const SPORTS_CONTENT_FILTER = /כדורגל|כדורסל|טניס|שחייה|אתלטיקה|ג'ודו|קריקט|רוגבי|אגרוף|הוקי|גולף|football|soccer|basketball|tennis|swimming|athletics|rugby|cricket|boxing|hockey|golf|nba|nfl|nhl|mlb|ufc|mma|f1|formula|olympics|sport|ספורט|ליגה|league|match|tournament|championship|cup|גביע|אליפות|קבוצ|team|player|שחקן|מאמן|coach|משחק|game|תוצא|score|שער|goal|transfer|העברה|draft|playoff|גמר|final/i;

/**
 * Israeli football team names and league keywords.
 */
const ISRAELI_FOOTBALL_FILTER = /מכבי\s*(?:תל\s*אביב|חיפה|נתניה|פ\.?תח\s*תקווה|הרצליה|בני\s*ריינה)|הפועל\s*(?:תל\s*אביב|חיפה|באר\s*שבע|פ\.?תח\s*תקווה|ראשון|ירושלים|עפולה|נוף\s*הגליל|קריית\s*שמונה|חדרה)|בית"ר\s*(?:ירושלים)?|עירוני\s*(?:קריית\s*שמונה|טבריה|אשדוד|אשקלון)|בני\s*(?:יהודה|סכנין)|סכנין|אשדוד|ליגת\s*העל|ליגה\s*לאומית|גביע\s*המדינה|גביע\s*הטוטו|israeli\s*(?:football|soccer|premier)|כדורגל\s*ישראל/i;

export const CATEGORY_RULES: Record<string, CategoryMatchRules> = {
  'כדורגל ישראלי': {
    mustMatch: [
      // Must mention Israeli football team/league AND be sports content
      ISRAELI_FOOTBALL_FILTER,
    ],
    boostMatch: [
      /כדורגל/i, /מחזור/i, /ליגה/i, /שער/i, /מאמן/i, /העברה/i, /תוצאות/i, /גביע/i,
    ],
    excludeMatch: [
      /premier\s*league|la\s*liga|champions\s*league|bundesliga|serie\s*a|ligue\s*1/i,
    ],
    sport: 'football',
    league: 'Israeli Premier League',
    searchKeywords: ['ליגת העל', 'הפועל כדורגל', 'מכבי כדורגל', 'כדורגל ישראלי', 'גביע המדינה'],
  },
  'כדורגל עולמי': {
    mustMatch: [
      /premier\s*league|la\s*liga|champions\s*league|bundesliga|serie\s*a|ligue\s*1|פרמייר|לה\s*ליגה|ליגת\s*האלופות|בונדסליגה|football|soccer/i,
    ],
    boostMatch: [
      /liverpool|arsenal|barcelona|real\s*madrid|bayern|manchester|chelsea|psg|juventus|inter|milan|dortmund|atletico/i,
      /transfer|העברה|שער|goal|match|כדורגל/i,
    ],
    excludeMatch: [
      /ליגת\s*העל|israeli|ישראל/i,
      // Must not be non-football sports
      /nba|nfl|nhl|mlb|tennis|formula|f1|ufc|mma|basketball|כדורסל|טניס/i,
    ],
    sport: 'football',
    searchKeywords: ['premier league', 'champions league', 'la liga', 'football transfer', 'soccer'],
  },
  'ספורט ישראלי אחר': {
    mustMatch: [
      // Must be BOTH Israeli AND sports content (but not football)
      /(?=.*(?:ישראל|israeli|מכבי|הפועל|אליפות\s*ישראל))(?=.*(?:כדורסל|basketball|טניס|tennis|שחייה|swim|אתלטיקה|athletics|ג'ודו|judo|אגרוף|boxing|ספורט|sport|משחק|game|קבוצ|team|שחקן|player|מאמן|coach|ליגה|league|אליפות|championship))/i,
    ],
    boostMatch: [
      /כדורסל|basketball/i, /טניס|tennis/i, /שחייה|swimming/i,
      /אליפות/i, /תוצאות|results/i, /מדליה|medal/i,
    ],
    excludeMatch: [
      /כדורגל|football|soccer/i,
      // Exclude obvious non-sports content
      /פוליטי|כנסת|ממשלה|שר\s*ה|טילים|איראן|קבינט|מנדט|בחירות|political|parliament|minister|missile|iran|cabinet/i,
    ],
    searchKeywords: ['כדורסל ישראלי', 'מכבי כדורסל', 'ספורט ישראלי', 'אליפות ישראל'],
  },
  'ספורט עולמי כללי': {
    mustMatch: [
      /nba|nfl|nhl|mlb|tennis|formula|f1|olympics|ufc|mma|grand\s*slam|super\s*bowl|world\s*cup|אולימפי|טניס|פורמולה|boxing|golf|rugby|cricket/i,
    ],
    boostMatch: [
      /championship|final|playoffs|record|breaking|trophy|winner/i,
    ],
    excludeMatch: [
      /ישראל|israeli|ליגת\s*העל/i,
      /premier\s*league|la\s*liga|champions\s*league|כדורגל|football|soccer/i,
    ],
    searchKeywords: ['NBA', 'NFL', 'tennis', 'formula 1', 'UFC', 'olympics', 'Super Bowl'],
  },
  // Generic fallbacks
  'ספורט עולמי': {
    mustMatch: [SPORTS_CONTENT_FILTER],
    boostMatch: [],
    excludeMatch: [/ישראל|israeli/i],
    searchKeywords: ['world sports', 'international sports'],
  },
  'ספורט ישראלי': {
    mustMatch: [/(?=.*(?:ישראל|israeli))(?=.*(?:ספורט|sport|כדורגל|כדורסל|טניס|football|basketball|tennis))/i],
    boostMatch: [],
    excludeMatch: [],
    searchKeywords: ['ספורט ישראלי'],
  },
  'ספורט': {
    mustMatch: [SPORTS_CONTENT_FILTER],
    boostMatch: [],
    searchKeywords: ['ספורט', 'sport'],
  },
  'חדשות': {
    mustMatch: [/חדשות|news|breaking|עדכון/i],
    boostMatch: [],
    searchKeywords: ['חדשות', 'news'],
  },
};

/**
 * Score how well an article matches a category.
 * Returns -1 if excluded, 0 if no match, positive for match quality.
 */
function scoreArticleForCategory(article: CachedArticle, rules: CategoryMatchRules, categoryName: string): number {
  const text = `${article.title} ${article.titleHebrew || ''} ${article.excerpt} ${(article.tags || []).join(' ')}`;

  // Pre-filter: any sports-related category requires the article to be sports content
  const isSportsCategory = /ספורט|כדורגל|sports|football|sport/i.test(categoryName);
  if (isSportsCategory && !SPORTS_CONTENT_FILTER.test(text)) {
    return -1; // Not sports content at all
  }

  // Check exclusions
  if (rules.excludeMatch) {
    for (const pattern of rules.excludeMatch) {
      if (pattern.test(text)) return -1;
    }
  }

  // Check must-match (at least one required)
  let mustPassed = false;
  for (const pattern of rules.mustMatch) {
    if (pattern.test(text)) {
      mustPassed = true;
      break;
    }
  }
  if (!mustPassed) return 0;

  // Base score for passing must-match
  let score = 1.0;

  // Boost score
  for (const pattern of rules.boostMatch) {
    if (pattern.test(text)) {
      score += 0.3;
    }
  }

  // Boost for recency
  const hoursOld = (Date.now() - new Date(article.fetchedAt).getTime()) / (1000 * 60 * 60);
  if (hoursOld < 6) score += 0.5;
  else if (hoursOld < 12) score += 0.3;
  else if (hoursOld < 24) score += 0.1;

  // Boost for original relevance score
  score += article.relevanceScore * 0.5;

  return score;
}

/**
 * Fetch ALL available articles, then score and assign them to categories.
 * Handles cross-category deduplication — each article used only ONCE.
 */
async function fetchAndAssignArticles(
  categoryRequests: Record<string, number>,
): Promise<Record<string, CachedArticle[]>> {
  // Step 1: Fetch a broad pool of articles
  const allArticles: CachedArticle[] = [];
  const seenUrls = new Set<string>();

  // Fetch recent articles broadly
  const recentAll = await getRecentArticles({ limit: 100, hoursBack: 72 });
  for (const a of recentAll) {
    if (!seenUrls.has(a.url)) {
      allArticles.push(a);
      seenUrls.add(a.url);
    }
  }

  // Also search by category-specific keywords
  for (const category of Object.keys(categoryRequests)) {
    const rules = CATEGORY_RULES[category];
    if (!rules) continue;

    // Search by metadata
    if (rules.sport) {
      const sportResults = await getRecentArticles({
        limit: 30,
        sport: rules.sport,
        league: rules.league,
        hoursBack: 72,
      });
      for (const a of sportResults) {
        if (!seenUrls.has(a.url)) {
          allArticles.push(a);
          seenUrls.add(a.url);
        }
      }
    }

    // Search by keywords
    for (const keyword of rules.searchKeywords.slice(0, 3)) {
      const keywordResults = await searchArticles(keyword, 15);
      for (const a of keywordResults) {
        if (!seenUrls.has(a.url)) {
          allArticles.push(a);
          seenUrls.add(a.url);
        }
      }
    }
  }

  logger.info(`Fetched ${allArticles.length} total articles for scoring`);

  // Step 2: Score each article for each category
  const categoryScores: Record<string, Array<{ article: CachedArticle; score: number }>> = {};
  for (const category of Object.keys(categoryRequests)) {
    const rules = CATEGORY_RULES[category];
    if (!rules) {
      categoryScores[category] = [];
      continue;
    }

    categoryScores[category] = allArticles
      .map(article => ({ article, score: scoreArticleForCategory(article, rules, category) }))
      .filter(item => item.score > 0) // Only articles that actually match
      .sort((a, b) => b.score - a.score);
  }

  // Step 3: Assign articles to categories — greedy, highest-demand first, no duplicates
  const usedUrls = new Set<string>();
  const result: Record<string, CachedArticle[]> = {};

  // Sort categories by how hard they are to fill (fewest candidates first)
  const sortedCategories = Object.entries(categoryRequests)
    .sort((a, b) => (categoryScores[a[0]]?.length || 0) - (categoryScores[b[0]]?.length || 0));

  for (const [category, needed] of sortedCategories) {
    result[category] = [];
    const candidates = categoryScores[category] || [];

    for (const { article } of candidates) {
      if (result[category].length >= needed) break;
      if (usedUrls.has(article.url)) continue; // Already used in another category

      result[category].push(article);
      usedUrls.add(article.url);
    }

    logger.info(`Category "${category}": assigned ${result[category].length}/${needed} real articles`);
  }

  return result;
}

/**
 * Generate an items-based lineup with EXACT item count and category distribution.
 *
 * This is the ASYNC version that fetches real articles from trusted sources.
 *
 * Rules:
 * - MUST return exactly `totalItems` items.
 * - MUST respect `categoryCounts` distribution exactly.
 * - Tries to fill items with REAL articles from news sources.
 * - Falls back to placeholder skeletons only when no real data is available.
 * - NEVER invents facts, titles, or dates.
 */
export async function generateItemsLineup(request: LineupRequest & {
  totalItems: number;
  categoryCounts?: Record<string, number>;
}): Promise<ItemsLineup> {
  const { totalItems, categoryCounts, programType, channel, scheduledDate, title } = request;

  logger.info('Generating items lineup', { totalItems, categoryCounts, programType });

  // ── RSS Pipeline path (env-gated) ──────────────────────────────────────────
  if (rssPipelineConfig.enabled) {
    try {
      // Normalize counts first (same logic as below)
      const pipelineCounts: Record<string, number> = {};
      let pipelineSpecifiedTotal = 0;
      if (categoryCounts && Object.keys(categoryCounts).length > 0) {
        for (const [rawCat, count] of Object.entries(categoryCounts)) {
          pipelineCounts[rawCat] = (pipelineCounts[rawCat] || 0) + count;
          pipelineSpecifiedTotal += count;
        }
      }
      if (pipelineSpecifiedTotal < totalItems) {
        pipelineCounts['general'] = (pipelineCounts['general'] || 0) + (totalItems - pipelineSpecifiedTotal);
      }

      const pipelineResult = await runRssPipeline({
        categoryCounts: pipelineCounts,
        totalItems,
        timeWindowHours: (request as any).timeWindowHours,
        sources: (request as any).sources,
      });

      // Build brief lookup
      const briefMap = new Map<string, Brief>();
      for (const brief of pipelineResult.briefs) {
        briefMap.set(brief.articleId, brief);
      }

      // Convert pipeline result to ItemsLineup
      const pipelineItems: LineupItem[] = [];
      const pipelineCitations: Citation[] = [];
      let pipelineOrder = 1;

      for (const item of pipelineResult.items) {
        const isPlaceholder = item.id.startsWith('placeholder:');
        const brief = briefMap.get(item.id);

        const lineupItem: LineupItem = {
          order: pipelineOrder++,
          title: item.title,
          category: (item.rawCategories || [])[0] || 'general',
          priority: pipelineOrder <= 3 ? 'high' : 'normal',
          isPlaceholder,
          source: isPlaceholder ? 'placeholder' : item.sourceName,
          notes: isPlaceholder ? item.summary : undefined,
          // RSS pipeline fields
          brief: brief?.briefText,
          bullets: brief?.bullets,
          whyItMatters: brief?.whyItMatters,
          briefQuality: brief?.briefQuality,
          citation: brief ? {
            source: brief.citation.source,
            url: brief.citation.url,
            publishedAt: brief.citation.publishedAt,
          } : undefined,
          score: isPlaceholder ? undefined : undefined, // Score is internal unless debug
        };

        pipelineItems.push(lineupItem);

        if (!isPlaceholder) {
          pipelineCitations.push({
            sourceName: item.sourceName,
            sourceUrl: item.url,
            fetchedAt: item.fetchedAt,
            excerptHash: item.excerptHash,
            confidence: 0.85,
            relevanceReason: `RSS pipeline: ${(item.rawCategories || []).join(', ')}`,
          });
        }
      }

      const realCount = pipelineItems.filter((i) => !i.isPlaceholder).length;
      const placeholderCount = pipelineItems.filter((i) => i.isPlaceholder).length;
      const confidenceScore = realCount / (realCount + placeholderCount) || 0;
      const notesLines: string[] = [];
      if (realCount > 0) notesLines.push(`${realCount} פריטים ממקורות מאומתים (RSS pipeline).`);
      if (placeholderCount > 0) notesLines.push(`${placeholderCount} פריטים מסומנים כ-placeholder.`);
      if (pipelineResult.errors.length > 0) {
        notesLines.push(`${pipelineResult.errors.length} שגיאות בהרצת ה-pipeline.`);
      }

      const pipelineLineup: ItemsLineup = {
        id: uuidv4(),
        programType: programType || 'news',
        title: title || `רנדאון פריטים (${totalItems} פריטים)`,
        scheduledDate: scheduledDate || new Date().toISOString(),
        channel: channel || 'Default Channel',
        lineupType: 'items',
        totalItems: pipelineItems.length,
        items: pipelineItems,
        categoryCounts: pipelineCounts,
        citations: pipelineCitations.length > 0 ? pipelineCitations : undefined,
        generatedAt: new Date().toISOString(),
        confidence: Math.round(confidenceScore * 100) / 100,
        notes: notesLines.join(' '),
      };

      logger.info('Items lineup generated via RSS pipeline', {
        id: pipelineLineup.id,
        totalItems: pipelineLineup.totalItems,
        realArticles: realCount,
        placeholders: placeholderCount,
      });

      return pipelineLineup;
    } catch (pipelineErr) {
      const legacyEnabled = process.env.LEGACY_NEWS_CACHE_ENABLED === 'true';
      if (!legacyEnabled) {
        // No silent fallback — RSS is canonical. Re-throw so the caller gets a clear error.
        logger.error('RSS pipeline failed and legacy cache is not enabled (LEGACY_NEWS_CACHE_ENABLED != true)', {
          error: (pipelineErr as Error).message,
        });
        throw pipelineErr;
      }
      logger.warn('RSS pipeline failed, falling back to legacy cache (LEGACY_NEWS_CACHE_ENABLED=true)', {
        error: (pipelineErr as Error).message,
      });
      // TRIPWIRE: legacy cache path activated — record for monitoring
      try {
        const { recordTripwireLegacyNewsCacheUsed } = require('../middleware/monitoring');
        recordTripwireLegacyNewsCacheUsed();
      } catch (_) { /* monitoring not available */ }
      // Falls through to existing fetchAndAssignArticles logic below
    }
  }
  // ── End RSS Pipeline path ──────────────────────────────────────────────────

  // Legacy news cache path — only reached when LEGACY_NEWS_CACHE_ENABLED=true

  // Step 0: Try to fetch fresh news from sources
  try {
    await fetchAllSources({ sports: ['football'], leagues: [] });
  } catch (fetchErr) {
    logger.warn('Could not refresh news sources, will use cached data', {
      error: (fetchErr as Error).message,
    });
  }

  // Normalize category counts (keep original Hebrew labels for display)
  const normalizedCounts: Record<string, number> = {};
  let specifiedTotal = 0;

  if (categoryCounts && Object.keys(categoryCounts).length > 0) {
    for (const [rawCat, count] of Object.entries(categoryCounts)) {
      // Keep the original category label (don't normalize to English)
      // so the output matches what the user asked for
      normalizedCounts[rawCat] = (normalizedCounts[rawCat] || 0) + count;
      specifiedTotal += count;
    }
  }

  // If specified counts don't add up to totalItems, distribute remainder as "general"
  if (specifiedTotal < totalItems) {
    normalizedCounts['general'] = (normalizedCounts['general'] || 0) + (totalItems - specifiedTotal);
  }

  // If specified counts exceed totalItems, proportionally scale down
  if (specifiedTotal > totalItems) {
    const scale = totalItems / specifiedTotal;
    let runningTotal = 0;
    const entries = Object.entries(normalizedCounts);
    for (let i = 0; i < entries.length; i++) {
      const [key] = entries[i];
      if (i === entries.length - 1) {
        normalizedCounts[key] = totalItems - runningTotal;
      } else {
        normalizedCounts[key] = Math.round(normalizedCounts[key] * scale);
        runningTotal += normalizedCounts[key];
      }
    }
  }

  // Step 1: Fetch and assign real articles to categories (with dedup + relevance scoring)
  const articlesByCategory = await fetchAndAssignArticles(normalizedCounts);
  const citations: Citation[] = [];

  // Step 2: Build items — real articles first, placeholders for unfilled slots
  const items: LineupItem[] = [];
  let order = 1;
  let realCount = 0;
  let placeholderCount = 0;

  for (const [category, count] of Object.entries(normalizedCounts)) {
    const articles = articlesByCategory[category] || [];

    for (let i = 0; i < count; i++) {
      if (i < articles.length) {
        // Real article from trusted source
        const article = articles[i];
        items.push({
          order: order++,
          title: article.titleHebrew || article.title,
          category,
          priority: i === 0 ? 'high' : 'normal',
          isPlaceholder: false,
          source: article.sourceName,
          notes: article.excerpt || undefined,
        });

        // Add citation
        citations.push({
          sourceName: article.sourceName,
          sourceUrl: article.url,
          fetchedAt: article.fetchedAt.toISOString(),
          excerptHash: article.excerptHash,
          confidence: article.relevanceScore,
          relevanceReason: `מאמר עבור קטגוריה: ${category}`,
        });
        realCount++;
      } else {
        // No more real articles — placeholder
        items.push({
          order: order++,
          title: `[PLACEHOLDER] פריט ${order - 1} - ${category}`,
          category,
          priority: 'normal',
          isPlaceholder: true,
          source: 'placeholder',
          notes: 'לא נמצא תוכן ממקור מאומת. יש לספק תוכן ידנית.',
        });
        placeholderCount++;
      }
    }
  }

  const confidenceScore = realCount / (realCount + placeholderCount) || 0;
  const notesLines: string[] = [];
  if (realCount > 0) {
    notesLines.push(`${realCount} פריטים ממקורות מאומתים.`);
  }
  if (placeholderCount > 0) {
    notesLines.push(`${placeholderCount} פריטים מסומנים כ-placeholder — לא נמצא תוכן מתאים ויש לספק ידנית.`);
  }

  const result: ItemsLineup = {
    id: uuidv4(),
    programType: programType || 'news',
    title: title || `רנדאון פריטים (${totalItems} פריטים)`,
    scheduledDate: scheduledDate || new Date().toISOString(),
    channel: channel || 'Default Channel',
    lineupType: 'items',
    totalItems: items.length,
    items,
    categoryCounts: normalizedCounts,
    citations: citations.length > 0 ? citations : undefined,
    generatedAt: new Date().toISOString(),
    confidence: Math.round(confidenceScore * 100) / 100,
    notes: notesLines.join(' '),
  };

  logger.info('Items lineup generated', {
    id: result.id,
    totalItems: result.totalItems,
    realArticles: realCount,
    placeholders: placeholderCount,
    categories: Object.keys(normalizedCounts),
  });

  return result;
}

// ─── End items-based lineup generation ───────────────────────────────────────

export default {
  parseLineupRequest,
  generateTemplateLineup,
  enhanceLineupWithLLM,
  incorporateBreakingNews,
  buildLineup,
  generateItemsLineup,
};
