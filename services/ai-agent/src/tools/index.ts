/**
 * Tools Module Index
 * 
 * Export all AI agent tools.
 */

export * from './registry';
export * from './news-fetcher';
export * from './lineup-builder';
export * from './cg-spec-generator';
export * from './shift-solver';
export * from './rights-board';

export { default as registry } from './registry';
export { default as newsFetcher } from './news-fetcher';
export { default as lineupBuilder } from './lineup-builder';
export { default as cgSpecGenerator } from './cg-spec-generator';
export { default as shiftSolver } from './shift-solver';
export { default as rightsBoard } from './rights-board';

import { registerAgentTool } from './registry';
import { generateNewsBrief, fetchAllSources } from './news-fetcher';
import { buildLineup, parseLineupRequest, generateItemsLineup } from './lineup-builder';
import { generateCGSpec, parseCGRequest, parseLiveCGMessage } from './cg-spec-generator';
import { buildShiftSchedule, parseShiftRequest, extractShiftConstraints, runSolverPipeline, SolverPipelineResult } from './shift-solver';
import { SOLVER_VERSION } from '../shift/types';
import { buildRightsBoard, parseRightsBoardRequest, initializeRightsStore } from './rights-board';
import { detectLineupType, extractItemCount, extractCategoryCounts } from '../agent/intent-classifier';
import { createLogger } from '../utils/logger';
import { rssPipelineConfig, getActiveFeeds } from '../rss/rss-config';
import { fetchActiveFeeds } from '../rss/rss-client';
import { rankPool } from '../rss/rss-ranking';
import { selectForLineup } from '../rss/rss-selection';
import { initializeRssArticlesStore, storeArticles, getArticlesByTimeWindow } from '../data/rss-articles-store';
import { ArticleCandidate } from '../rss/rss-types';

const logger = createLogger('tools');

/**
 * Initialize all tools
 */
export async function initializeTools(): Promise<void> {
  logger.info('Initializing AI agent tools...');

  // Conditionally initialize RSS articles store when pipeline is enabled
  if (rssPipelineConfig.enabled) {
    try {
      await initializeRssArticlesStore();
      logger.info('RSS articles store initialized (pipeline enabled)');
    } catch (rssErr) {
      logger.warn('Failed to initialize RSS articles store', {
        error: (rssErr as Error).message,
      });
    }
  }
  
  // Register News tool
  registerAgentTool({
    name: 'news-fetcher',
    description: 'Fetches news from trusted sources and generates briefs',
    intentType: 'news',
    version: '1.0.0',
    isAsync: true,
    handler: async (input, context) => {
      try {
        // ── RSS Pipeline path (when enabled) ───────────────────
        // Lightweight: fetch → store → rank → select (skips LLM briefs to stay under gateway timeout)
        if (rssPipelineConfig.enabled) {
          const userMessage = (input.message as string) || context.message || '';

          // Extract requested item count from message (default 10)
          const countMatch = userMessage.match(/(\d+)\s*(?:נושאים|פריטים|כתבות|חדשות|אייטמים|items)/i);
          const requestedCount = countMatch ? Math.min(parseInt(countMatch[1], 10), 30) : 10;

          // Detect user intent to tailor category distribution
          const isIsraeliRequest = /ישראל|israeli|הפועל|מכבי|בית"ר|ליגת\s*העל|ליגה\s*לאומית|סכנין|בני\s*יהודה/i.test(userMessage);
          const isInternationalRequest = /עולמי|בעולם|international|premier|champions|la\s*liga|bundesliga|nba|nfl/i.test(userMessage);

          let categoryCounts: Record<string, number>;
          if (isIsraeliRequest && !isInternationalRequest) {
            categoryCounts = {
              'כדורגל ישראלי': Math.ceil(requestedCount * 0.5),
              'ספורט ישראלי': Math.ceil(requestedCount * 0.3),
              'ספורט ישראלי אחר': Math.ceil(requestedCount * 0.2),
            };
          } else if (isInternationalRequest && !isIsraeliRequest) {
            categoryCounts = {
              'כדורגל עולמי': Math.ceil(requestedCount * 0.35),
              'ספורט עולמי כללי': Math.ceil(requestedCount * 0.35),
              'ספורט עולמי': Math.ceil(requestedCount * 0.3),
            };
          } else {
            categoryCounts = {
              'ספורט ישראלי': Math.ceil(requestedCount * 0.3),
              'כדורגל ישראלי': Math.ceil(requestedCount * 0.2),
              'כדורגל עולמי': Math.ceil(requestedCount * 0.25),
              'ספורט עולמי כללי': Math.ceil(requestedCount * 0.25),
            };
          }

          // Ensure categoryCounts sum to at least requestedCount
          const totalFromCounts = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
          const totalItems = Math.max(requestedCount, totalFromCounts);

          const errors: Array<{ feedId: string; error: string }> = [];

          // Step 1: Get active feeds
          const activeFeeds = getActiveFeeds(undefined, errors);

          // Step 2: Fetch all active feeds
          let fetchedCandidates: ArticleCandidate[] = [];
          if (activeFeeds.length > 0) {
            const fetchResult = await fetchActiveFeeds(activeFeeds);
            fetchedCandidates = fetchResult.candidates;
            errors.push(...fetchResult.errors);
          }

          // Step 3: Store to rssArticles collection
          if (fetchedCandidates.length > 0) {
            try {
              await storeArticles(fetchedCandidates);
            } catch (storeErr) {
              logger.warn('Failed to store RSS articles', { error: (storeErr as Error).message });
            }
          }

          // Step 4: Retrieve pool from store (48h for larger requests)
          const hoursBack = requestedCount > 10 ? 48 : 24;
          const pool = await getArticlesByTimeWindow(hoursBack);

          // Step 5: Rank pool for requested categories
          const rankedPool = rankPool(pool, categoryCounts);

          // Step 6: Build candidate map and select
          const candidateMap = new Map<string, ArticleCandidate>();
          for (const article of pool) {
            candidateMap.set(article.id, article);
          }
          const selected = selectForLineup(rankedPool, candidateMap, totalItems, categoryCounts);

          // Filter out placeholders
          let realItems = selected
            .filter((s) => !s.isPlaceholder)
            .map((s) => s.article);

          // Post-filter: Israeli request → only keep articles whose title/summary
          // actually mention Israeli content (not just from an Israeli feed)
          const ISRAELI_CONTENT_FILTER = /מכבי|הפועל|בית"ר|בני\s*(?:יהודה|סכנין)|סכנין|עירוני|אשדוד|ליגת\s*העל|ליגה\s*לאומית|גביע\s*(?:המדינה|הטוטו)|כדורגל\s*ישראל|ישראל|israeli/i;
          if (isIsraeliRequest && !isInternationalRequest) {
            realItems = realItems.filter((item) =>
              ISRAELI_CONTENT_FILTER.test(item.title) || ISRAELI_CONTENT_FILTER.test(item.summary),
            );
          }

          if (realItems.length === 0) {
            return {
              success: true,
              data: { items: [], status: 'no_sources' },
              text: 'לא נמצאו חדשות ממקורות מאומתים ב-24 השעות האחרונות.\n\n' +
                'אפשרויות:\n' +
                '• ספק נקודות תוכן (bullet points) ואבנה סיכום על בסיסן.\n' +
                '• בדוק שמקורות ה-RSS מוגדרים ופעילים.\n' +
                '• נסה שוב מאוחר יותר.',
            };
          }

          const itemsList = realItems.map((item, i) => {
            return `${i + 1}. ${item.title} [${item.sourceName}]`;
          }).join('\n');

          return {
            success: true,
            data: { items: realItems, errors },
            text: `הנה סיכום החדשות האחרונות (${realItems.length} פריטים ממקורות מאומתים):\n\n${itemsList}`,
          };
        }

        // ── Legacy path (trusted sources) ──────────────────────
        // First, try to fetch fresh news
        let fetchResult: { fetched: number; cached: number; duplicates: number } | null = null;
        try {
          fetchResult = await fetchAllSources();
        } catch (fetchError) {
          logger.warn('News fetch failed, will try cached data', {
            error: (fetchError as Error).message,
          });
        }
        
        // Generate a brief
        const brief = await generateNewsBrief({
          maxItems: 10,
          timeRangeHours: 24,
        });

        // ── Truth boundary check ────────────────────────────────
        if (brief.items.length === 0) {
          // No data from any source → ask user for notes or return empty
          return {
            success: true,
            data: { items: [], status: 'no_sources' },
            text: 'לא נמצאו חדשות ממקורות מאומתים ב-24 השעות האחרונות.\n\n' +
              'אפשרויות:\n' +
              '• ספק נקודות תוכן (bullet points) ואבנה סיכום על בסיסן.\n' +
              '• בדוק שמקורות ה-RSS מוגדרים ופעילים.\n' +
              '• נסה שוב מאוחר יותר.',
          };
        }

        // Build response with source citations
        const itemsList = brief.items.slice(0, 5).map((item, i) => {
          const source = item.source?.sourceName || 'unknown';
          return `${i + 1}. ${item.headline} [${source}]`;
        }).join('\n');

        return {
          success: true,
          data: brief,
          text: `הנה סיכום החדשות האחרונות (${brief.items.length} פריטים ממקורות מאומתים):\n\n${itemsList}` +
            (brief.items.length > 5 ? `\n\n...ועוד ${brief.items.length - 5} פריטים.` : ''),
        };
      } catch (error) {
        return {
          success: false,
          text: 'לא הצלחתי לשלוף חדשות כרגע. אין מידע זמין ממקורות מאומתים.',
          error: (error as Error).message,
        };
      }
    },
  });
  
  // Register Lineup Builder tool
  registerAgentTool({
    name: 'lineup-builder',
    description: 'Builds program rundowns and lineups for broadcasts',
    intentType: 'lineup',
    version: '1.0.0',
    isAsync: true,
    handler: async (input, context) => {
      try {
        const message = input.message as string || '';
        const entities = (input.entities as Record<string, string>) || {};

        // Detect lineup type from entities or message
        const lineupType = (entities.lineupType as 'items' | 'structure' | undefined)
          || detectLineupType(message);

        // ── Items-based lineup path ──────────────────────────────
        if (lineupType === 'items') {
          const totalItems = entities.totalItems
            ? parseInt(entities.totalItems, 10)
            : extractItemCount(message) || 10; // safe default

          const categoryCounts = extractCategoryCounts(message);

          // Parse basic request fields (programType, channel, duration, etc.)
          const parsedRequest = await parseLineupRequest(message);

          const itemsLineup = await generateItemsLineup({
            programType: parsedRequest.programType || 'news',
            channel: parsedRequest.channel || 'Default',
            scheduledDate: new Date().toISOString(),
            duration: parsedRequest.duration,
            sport: parsedRequest.sport,
            league: parsedRequest.league,
            additionalContext: message,
            lineupType: 'items',
            totalItems,
            categoryCounts,
          });

          // Format response
          const realItems = itemsLineup.items.filter(i => !i.isPlaceholder);
          const placeholderItems = itemsLineup.items.filter(i => i.isPlaceholder);

          const itemList = itemsLineup.items.map((item, i) => {
            const src = item.isPlaceholder ? '⚠️' : `[${item.source}]`;
            return `${i + 1}. [${item.category}] ${item.title} ${src}`;
          }).join('\n');

          let statusNote = '';
          if (realItems.length === itemsLineup.totalItems) {
            statusNote = `\n\n✅ כל ${realItems.length} הפריטים ממקורות מאומתים.`;
          } else if (realItems.length > 0) {
            statusNote = `\n\n✅ ${realItems.length} פריטים ממקורות מאומתים.`;
            if (placeholderItems.length > 0) {
              statusNote += `\n⚠️ ${placeholderItems.length} פריטים מסומנים כ-placeholder — יש לספק תוכן ידנית.`;
            }
          } else {
            statusNote = '\n\n⚠️ לא נמצאו מקורות מאומתים. כל הפריטים מסומנים כ-placeholder.';
          }

          return {
            success: true,
            data: itemsLineup,
            text: `הנה רנדאון ${itemsLineup.totalItems} פריטים לתוכנית ${itemsLineup.programType}:\n\n${itemList}${statusNote}`,
          };
        }

        // ── Structure-based lineup path (existing behavior) ──────
        const parsedRequest = await parseLineupRequest(message);
        
        const lineup = await buildLineup({
          programType: parsedRequest.programType || 'sports',
          channel: parsedRequest.channel || 'Default',
          scheduledDate: new Date().toISOString(),
          duration: parsedRequest.duration,
          sport: parsedRequest.sport,
          league: parsedRequest.league,
          additionalContext: message,
        });
        
        // Format response
        const segmentList = lineup.segments.slice(0, 5).map((s, i) => 
          `${i + 1}. ${s.title} (${Math.round(s.duration / 60)} דק')`
        ).join('\n');
        
        return {
          success: true,
          data: lineup,
          text: `הנה הרנדאון שבניתי לתוכנית ${lineup.programType}:\n\n${segmentList}\n\n...ועוד ${Math.max(0, lineup.segments.length - 5)} סגמנטים. סה"כ: ${lineup.totalDuration} דקות.`,
        };
      } catch (error) {
        return {
          success: false,
          text: 'לא הצלחתי לבנות את הרנדאון',
          error: (error as Error).message,
        };
      }
    },
  });
  
  // Register CG Spec Generator tool
  registerAgentTool({
    name: 'cg-spec-generator',
    description: 'Generates CG/graphics specifications for lower thirds, scorebugs, tickers, etc.',
    intentType: 'cg',
    version: '1.0.0',
    isAsync: true,
    handler: async (input, context) => {
      try {
        const message = input.message as string || '';

        // ── LIVE CG deterministic fast path ──────────────────────
        const { isLiveCGRequest: isLiveCG } = await import('./cg-spec-generator');
        const mode = (context.metadata?.mode) || (context.additionalContext?.mode as string | undefined);
        const liveCG = isLiveCG(message, mode);

        if (liveCG) {
          const parsed = parseLiveCGMessage(message);

          // If deterministic parsing found missing required fields → clarification
          if (!parsed.parseSuccess) {
            const missingDesc = parsed.missing.length > 0
              ? `חסרים שדות: ${parsed.missing.join(', ')}`
              : '';
            const validationDesc = parsed.validationErrors.length > 0
              ? `שגיאות ולידציה: ${parsed.validationErrors.join(', ')}`
              : '';

            return {
              success: false,
              text: `לא ניתן ליצור גרפיקה LIVE. ${missingDesc} ${validationDesc}`.trim(),
              error: `LIVE_CG parse incomplete: missing=[${parsed.missing.join(',')}] errors=[${parsed.validationErrors.join(',')}]`,
            };
          }

          // Generate spec from deterministic fields
          const spec = await generateCGSpec({
            templateType: parsed.templateType!,
            fields: parsed.fields as Record<string, unknown>,
          });

          // Return JSON-only response with requiresApproval flag
          return {
            success: true,
            data: {
              ...spec,
              requiresApproval: true,
              mode: 'LIVE_CG',
            },
            text: JSON.stringify(spec),
          };
        }

        // ── Standard CG path (existing behavior) ────────────────
        const parsedRequest = await parseCGRequest(message);
        
        // Generate the CG spec
        const spec = await generateCGSpec({
          templateType: parsedRequest.templateType || 'lower_third',
          context: message,
          fields: parsedRequest.fields,
        });
        
        // Format response based on template type
        let responseText = `יצרתי מפרט גרפיקה מסוג ${spec.templateType}:\n\n`;
        
        for (const [key, value] of Object.entries(spec.fields)) {
          responseText += `• ${key}: ${value}\n`;
        }
        
        if (spec.validation.warnings.length > 0) {
          responseText += `\n⚠️ אזהרות: ${spec.validation.warnings.join(', ')}`;
        }
        
        return {
          success: true,
          data: spec,
          text: responseText,
        };
      } catch (error) {
        return {
          success: false,
          text: 'לא הצלחתי ליצור את מפרט הגרפיקה',
          error: (error as Error).message,
        };
      }
    },
  });
  
  // Register Shift Solver tool (v1.1 - deterministic solver pipeline)
  registerAgentTool({
    name: 'shift-solver',
    description: 'Builds and optimizes shift schedules with deterministic constraint solving and fairness metrics',
    intentType: 'shifts',
    version: '1.1.0',
    isAsync: true,
    handler: async (input, context) => {
      const traceId = `shift-${Date.now()}-${context.conversationId?.slice(0, 8) || 'unknown'}`;

      try {
        const message = input.message as string || '';

        // Step 1: Extract constraints (LLM as constraint-extractor only)
        const extracted = extractShiftConstraints(message);

        logger.info('Shift constraints extracted', {
          traceId,
          department: extracted.department,
          weekStartDate: extracted.weekStartDate,
          roles: extracted.roles,
          missingCount: extracted.missingConstraints.length,
          solverVersion: SOLVER_VERSION,
        });

        // If critical constraints are missing, return what we extracted + questions
        if (extracted.missingConstraints.length > 0) {
          return {
            success: true,
            data: {
              extractedConstraints: extracted,
              status: 'incomplete',
            },
            text: `חילצתי את האילוצים הבאים:\n` +
              (extracted.department ? `• מחלקה: ${extracted.department}\n` : '') +
              (extracted.weekStartDate ? `• שבוע: ${extracted.weekStartDate}\n` : '') +
              (extracted.roles.length > 0 ? `• תפקידים: ${extracted.roles.join(', ')}\n` : '') +
              (extracted.availabilityNotes.length > 0 ? `• הערות זמינות: ${extracted.availabilityNotes.join('; ')}\n` : '') +
              `\n❓ חסר מידע: ${extracted.missingConstraints.join(', ')}.\nאנא ספק את הפרטים החסרים.`,
          };
        }

        // Step 2: Parse additional details from message
        const parsedRequest = await parseShiftRequest(message);

        // Step 3: Run deterministic solver pipeline
        const pipelineResult = await runSolverPipeline({
          department: parsedRequest.department || extracted.department || 'mcr',
          weekStartDate: parsedRequest.weekStartDate || extracted.weekStartDate || new Date().toISOString().split('T')[0],
          prioritize: parsedRequest.prioritize || 'fairness',
          constraints: {
            ...extracted.hardConstraints,
            ...parsedRequest.constraints,
          },
          traceId,
        });

        // Step 3b: If pipeline returned clarification instead of a schedule
        if ('type' in pipelineResult && pipelineResult.type === 'clarification') {
          return {
            success: true,
            data: {
              extractedConstraints: extracted,
              status: 'clarification',
              missingData: pipelineResult.missingData,
            },
            text: pipelineResult.message,
          };
        }

        // Step 4: Format response
        const scheduleResult = pipelineResult as SolverPipelineResult;
        const schedule = scheduleResult.schedule;
        let responseText = `${schedule.explanation}\n\n`;
        responseText += `📊 סטטיסטיקות:\n`;
        responseText += `• משמרות: ${schedule.stats.assignedShifts}/${schedule.stats.totalShifts} (${schedule.stats.assignmentPercentage.toFixed(0)}%)\n`;
        responseText += `• עובדים: ${schedule.stats.totalEmployees}\n`;
        responseText += `• שעות ממוצעות לעובד: ${schedule.stats.averageHoursPerEmployee.toFixed(1)}\n`;

        if (schedule.fairnessSummary) {
          responseText += `\n⚖️ הוגנות: ${schedule.fairnessSummary.fairnessScore}/100\n`;
          responseText += `• סטיית תקן: ${schedule.fairnessSummary.standardDeviation} שעות\n`;
        }

        if (schedule.violations.length > 0) {
          responseText += `\n⚠️ ${schedule.violations.length} אזהרות`;
        }

        if (scheduleResult.dataWarnings.length > 0) {
          responseText += `\n\nℹ️ הערות: ${scheduleResult.dataWarnings.join('; ')}`;
        }

        responseText += `\n\n🔒 נדרש אישור לפני החלה. (requiresApproval: true)`;

        logger.info('Shift solver tool completed', {
          traceId,
          solverVersion: SOLVER_VERSION,
          objectiveUsed: schedule.objectiveSummary?.objectiveUsed,
          fairnessScore: schedule.fairnessSummary?.fairnessScore,
          solverTimeMs: schedule.solverTimeMs,
          assignedCount: schedule.stats.assignedShifts,
          conflictCount: schedule.violations.length,
        });

        return {
          success: true,
          data: schedule,
          text: responseText,
        };
      } catch (error) {
        const errorMessage = (error as Error).message || String(error);
        logger.error('Shift solver tool failed', {
          traceId,
          error: errorMessage,
          solverVersion: SOLVER_VERSION,
        });
        return {
          success: false,
          text: 'לא הצלחתי לבנות את לוח המשמרות',
          error: errorMessage,
        };
      }
    },
  });
  
  // Register Rights Board tool
  registerAgentTool({
    name: 'rights-board',
    description: 'Provides broadcast rights and sports intelligence information',
    intentType: 'rights',
    version: '1.0.0',
    isAsync: true,
    handler: async (input, context) => {
      try {
        const message = input.message as string || '';
        
        // Parse the request
        const parsedRequest = await parseRightsBoardRequest(message);
        
        // Build the rights board
        const board = await buildRightsBoard(parsedRequest);
        
        // Format response
        let responseText = `${board.summary}\n\n`;
        
        if (board.rights.length > 0) {
          responseText += `📺 זכויות שידור פעילות:\n`;
          for (const right of board.rights.slice(0, 5)) {
            responseText += `• ${right.league} (${right.channels.join(', ')})\n`;
          }
        }
        
        if (board.upcomingFixtures.length > 0) {
          responseText += `\n⚽ משחקים קרובים:\n`;
          for (const fixture of board.upcomingFixtures.slice(0, 5)) {
            const date = new Date(fixture.kickoffTime).toLocaleDateString('he-IL');
            const rights = fixture.hasRights ? '✓' : '✗';
            responseText += `• ${fixture.homeTeam} vs ${fixture.awayTeam} - ${date} [${rights}]\n`;
          }
        }
        
        return {
          success: true,
          data: board,
          text: responseText,
        };
      } catch (error) {
        return {
          success: false,
          text: 'לא הצלחתי לטעון את לוח הזכויות',
          error: (error as Error).message,
        };
      }
    },
  });
  
  // Initialize rights store
  try {
    await initializeRightsStore();
  } catch (error) {
    logger.warn('Failed to initialize rights store', { error: (error as Error).message });
  }
  
  logger.info('Tools initialized', {
    registeredTools: ['news-fetcher', 'lineup-builder', 'cg-spec-generator', 'shift-solver', 'rights-board'],
  });
}
