/**
 * RSS Ranking Engine
 *
 * Scores ArticleCandidates against category rules (mustMatch / boostMatch / excludeMatch).
 * Imports CATEGORY_RULES from lineup-builder for consistency.
 */

import { createLogger } from '../utils/logger';
import { ArticleCandidate, RankedArticle } from './rss-types';
import { CATEGORY_RULES, CategoryMatchRules, SPORTS_CONTENT_FILTER } from '../tools/lineup-builder';

const logger = createLogger('rss-ranking');

/**
 * Score an article for a specific category.
 * Returns -1 if excluded, 0 if no match, positive for match quality.
 */
export function rankArticle(
  candidate: ArticleCandidate,
  category: string,
  rules: CategoryMatchRules,
): RankedArticle {
  const text = `${candidate.title} ${candidate.summary} ${(candidate.rawCategories || []).join(' ')}`;
  const reasons: string[] = [];

  // Pre-filter: sports categories require sports content
  const isSportsCategory = /ספורט|כדורגל|sports|football|sport/i.test(category);
  if (isSportsCategory && !SPORTS_CONTENT_FILTER.test(text)) {
    return { articleId: candidate.id, category, score: -1, reasons: ['Not sports content'], reject: true };
  }

  // Check exclusions
  if (rules.excludeMatch) {
    for (const pattern of rules.excludeMatch) {
      if (pattern.test(text)) {
        reasons.push(`Excluded by pattern: ${pattern.source.substring(0, 30)}`);
        return { articleId: candidate.id, category, score: -1, reasons, reject: true };
      }
    }
  }

  // Check must-match (at least one required)
  let mustPassed = false;
  for (const pattern of rules.mustMatch) {
    if (pattern.test(text)) {
      mustPassed = true;
      reasons.push(`Must-match: ${pattern.source.substring(0, 30)}`);
      break;
    }
  }
  if (!mustPassed) {
    return { articleId: candidate.id, category, score: 0, reasons: ['No must-match hit'], reject: false };
  }

  // Base score for passing must-match
  let score = 1.0;

  // Boost score
  for (const pattern of rules.boostMatch) {
    if (pattern.test(text)) {
      score += 0.3;
      reasons.push(`Boost: ${pattern.source.substring(0, 20)}`);
    }
  }

  // Recency boost based on publishedAt
  const hoursOld = (Date.now() - new Date(candidate.publishedAt).getTime()) / (1000 * 60 * 60);
  // Reduced recency boost when date was estimated
  const recencyMultiplier = candidate.publishedAtEstimated ? 0.5 : 1.0;
  if (hoursOld < 6) {
    score += 0.5 * recencyMultiplier;
    reasons.push('Recency: <6h');
  } else if (hoursOld < 12) {
    score += 0.3 * recencyMultiplier;
    reasons.push('Recency: <12h');
  } else if (hoursOld < 24) {
    score += 0.1 * recencyMultiplier;
    reasons.push('Recency: <24h');
  }

  if (candidate.publishedAtEstimated) {
    reasons.push('publishedAt estimated (reduced recency)');
  }

  return { articleId: candidate.id, category, score, reasons, reject: false };
}

/**
 * Rank a pool of candidates across multiple categories.
 * Returns a map of category → sorted RankedArticle[] (highest score first, excludes rejected).
 */
export function rankPool(
  candidates: ArticleCandidate[],
  categoryCounts: Record<string, number>,
): Record<string, RankedArticle[]> {
  const result: Record<string, RankedArticle[]> = {};

  for (const category of Object.keys(categoryCounts)) {
    const rules = CATEGORY_RULES[category];
    if (!rules) {
      logger.warn(`No CATEGORY_RULES for "${category}", will produce empty pool`);
      result[category] = [];
      continue;
    }

    const ranked = candidates
      .map((c) => rankArticle(c, category, rules))
      .filter((r) => !r.reject && r.score > 0)
      .sort((a, b) => b.score - a.score);

    result[category] = ranked;
  }

  logger.info('Ranking complete', {
    categories: Object.keys(categoryCounts).length,
    poolSizes: Object.fromEntries(
      Object.entries(result).map(([k, v]) => [k, v.length]),
    ),
  });

  return result;
}

export default {
  rankArticle,
  rankPool,
};
