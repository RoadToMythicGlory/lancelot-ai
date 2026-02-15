/**
 * RSS Pipeline Orchestrator
 *
 * Full ingest-to-brief pipeline:
 * 1. Get active feeds
 * 2. Fetch all active feeds
 * 3. Dedup + store to rssArticles collection
 * 4. Retrieve pool from store by time window
 * 5. Rank pool for requested categories
 * 6. Select for lineup with exact counts
 * 7. Generate briefs for real articles only (placeholders bypass)
 */

import { createLogger } from '../utils/logger';
import { getActiveFeeds, rssPipelineConfig } from './rss-config';
import { fetchActiveFeeds } from './rss-client';
import { storeArticles, getArticlesByTimeWindow } from '../data/rss-articles-store';
import { rankPool } from './rss-ranking';
import { selectForLineup } from './rss-selection';
import { generateBriefs } from './rss-brief-generator';
import { ArticleCandidate, RSSPipelineResult, FeedError } from './rss-types';

const logger = createLogger('rss-pipeline');

export interface RssPipelineOptions {
  categoryCounts: Record<string, number>;
  totalItems: number;
  timeWindowHours?: number;
  sources?: string[];
}

/**
 * Run the full RSS pipeline.
 *
 * Graceful degradation:
 * - Per-feed errors logged, pipeline continues
 * - Zero active feeds → explicit error entry, empty result
 * - Placeholders are NEVER sent to the brief generator
 */
export async function runRssPipeline(options: RssPipelineOptions): Promise<RSSPipelineResult> {
  const { categoryCounts, totalItems, timeWindowHours, sources } = options;
  const errors: FeedError[] = [];

  logger.info('Starting RSS pipeline', { totalItems, categories: Object.keys(categoryCounts) });

  // Step 1: Get active feeds
  const activeFeeds = getActiveFeeds(sources, errors);

  if (activeFeeds.length === 0) {
    logger.warn('No active feeds configured');
    errors.push({
      feedId: '_pipeline',
      error: 'No active feeds configured. Run npm run rss:verify and activate feeds.',
    });
    return {
      items: [],
      briefs: [],
      errors,
      stats: { feedsFetched: 0, feedsFailed: 0, articlesIngested: 0, duplicatesSkipped: 0 },
    };
  }

  // Step 2: Fetch all active feeds
  const { candidates: fetchedCandidates, errors: fetchErrors } = await fetchActiveFeeds(activeFeeds);
  errors.push(...fetchErrors);

  // Step 3: Dedup + store to rssArticles collection
  let stored = 0;
  let duplicates = 0;
  if (fetchedCandidates.length > 0) {
    try {
      const storeResult = await storeArticles(fetchedCandidates);
      stored = storeResult.stored;
      duplicates = storeResult.duplicates;
    } catch (storeErr) {
      logger.error('Failed to store articles, will use cached data', {
        error: (storeErr as Error).message,
      });
      errors.push({ feedId: '_store', error: (storeErr as Error).message });
    }
  }

  // Step 4: Retrieve pool from store by time window (cache fallback)
  const windowHours = timeWindowHours || rssPipelineConfig.timeWindowHours;
  const allCategories = Object.keys(categoryCounts).reduce<string[]>((acc, cat) => {
    // Collect all category tags for filtering
    return acc;
  }, []);

  const pool = await getArticlesByTimeWindow(windowHours);

  if (pool.length === 0) {
    logger.warn('No articles in store for the given time window');
  }

  // Step 5: Rank pool for requested categories
  const rankedPool = rankPool(pool, categoryCounts);

  // Build candidate lookup map
  const candidateMap = new Map<string, ArticleCandidate>();
  for (const article of pool) {
    candidateMap.set(article.id, article);
  }

  // Step 6: Select for lineup with exact counts
  const selected = selectForLineup(rankedPool, candidateMap, totalItems, categoryCounts);

  // Step 7: Generate briefs for REAL articles only — placeholders bypass
  const realArticles = selected
    .filter((s) => !s.isPlaceholder)
    .map((s) => s.article);

  const briefs = realArticles.length > 0
    ? await generateBriefs(realArticles)
    : [];

  // Build final items list (preserving selection order)
  const items = selected.map((s) => s.article);

  const feedsFetched = activeFeeds.length - fetchErrors.length;
  const feedsFailed = fetchErrors.length;

  logger.info('RSS pipeline complete', {
    feedsFetched,
    feedsFailed,
    articlesIngested: stored,
    duplicatesSkipped: duplicates,
    poolSize: pool.length,
    selectedReal: realArticles.length,
    selectedPlaceholders: selected.filter((s) => s.isPlaceholder).length,
    briefsGenerated: briefs.length,
  });

  return {
    items,
    briefs,
    errors,
    stats: {
      feedsFetched,
      feedsFailed,
      articlesIngested: stored,
      duplicatesSkipped: duplicates,
    },
  };
}

export default {
  runRssPipeline,
};
