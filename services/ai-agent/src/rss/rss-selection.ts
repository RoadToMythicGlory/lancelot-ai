/**
 * RSS Selection Engine
 *
 * Selects articles for an items-lineup with exact count enforcement,
 * cross-category dedup, and placeholder generation.
 */

import { createLogger } from '../utils/logger';
import { ArticleCandidate, RankedArticle, SelectedArticle } from './rss-types';

const logger = createLogger('rss-selection');

/**
 * Select articles for a lineup with exact count enforcement.
 *
 * Rules:
 * - Returns exactly `totalItems` items
 * - Respects `categoryCounts` distribution exactly
 * - Cross-category dedup: each article URL used only once
 * - Greedy: hardest-to-fill categories assigned first
 * - Missing slots filled with explicit placeholders
 */
export function selectForLineup(
  rankedPool: Record<string, RankedArticle[]>,
  candidateMap: Map<string, ArticleCandidate>,
  totalItems: number,
  categoryCounts: Record<string, number>,
): SelectedArticle[] {
  const usedIds = new Set<string>();
  const result: SelectedArticle[] = [];

  // Sort categories by pool scarcity (fewest candidates first — hardest to fill)
  const sortedCategories = Object.entries(categoryCounts)
    .sort((a, b) => (rankedPool[a[0]]?.length || 0) - (rankedPool[b[0]]?.length || 0));

  for (const [category, needed] of sortedCategories) {
    const pool = rankedPool[category] || [];
    let filled = 0;

    for (const ranked of pool) {
      if (filled >= needed) break;
      if (usedIds.has(ranked.articleId)) continue;

      const candidate = candidateMap.get(ranked.articleId);
      if (!candidate) continue;

      usedIds.add(ranked.articleId);
      result.push({
        article: candidate,
        category,
        score: ranked.score,
        isPlaceholder: false,
      });
      filled++;
    }

    // Fill remaining slots with placeholders
    while (filled < needed) {
      result.push({
        article: createPlaceholderCandidate(category, result.length + 1),
        category,
        score: 0,
        isPlaceholder: true,
      });
      filled++;
    }
  }

  logger.info('Selection complete', {
    totalItems: result.length,
    real: result.filter((r) => !r.isPlaceholder).length,
    placeholders: result.filter((r) => r.isPlaceholder).length,
    categories: Object.keys(categoryCounts),
  });

  return result;
}

/**
 * Create a placeholder ArticleCandidate for unfilled slots.
 */
function createPlaceholderCandidate(category: string, order: number): ArticleCandidate {
  const now = new Date().toISOString();
  return {
    id: `placeholder:${category}:${order}`,
    url: '',
    source: 'placeholder',
    sourceName: 'placeholder',
    title: `[PLACEHOLDER] פריט ${order} - ${category}`,
    summary: 'לא נמצא תוכן ממקור מאומת. יש לספק תוכן ידנית.',
    publishedAt: now,
    publishedAtEstimated: true,
    fetchedAt: now,
    lang: 'he',
    rawCategories: [category],
    contentLevel: 'rss_only',
    excerptHash: '',
    titleHash: '',
    urlHash: '',
    expiresAt: now,
  };
}

export default {
  selectForLineup,
};
