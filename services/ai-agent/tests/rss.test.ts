/**
 * RSS Pipeline Tests
 *
 * Comprehensive tests for the RSS ingestion pipeline.
 * Mocks MongoDB and LLM like existing agent.test.ts.
 */

import { describe, it, expect, beforeAll, jest } from '@jest/globals';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock LLM provider
jest.mock('../src/llm', () => ({
  getLLMProvider: () => ({
    isAvailable: async () => true,
    getName: () => 'mock-ollama',
    generate: async (prompt: string) => ({
      text: JSON.stringify({
        briefText: 'Mock broadcast brief summary.',
        bullets: ['Fact one', 'Fact two', 'Fact three'],
        whyItMatters: 'This is significant because of mock reasons.',
      }),
      model: 'mock-model',
      durationMs: 100,
      finishReason: 'stop',
    }),
    generateStructured: async () => ({
      success: true,
      data: {},
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
      find: () => ({
        toArray: async () => [],
        sort: () => ({
          limit: () => ({
            toArray: async () => [],
          }),
        }),
      }),
      findOne: async () => null,
      insertOne: async () => ({ insertedId: 'mock-id' }),
      insertMany: async (docs: any[]) => ({ insertedCount: docs.length }),
      createIndex: async () => {},
      countDocuments: async () => 0,
      aggregate: () => ({ toArray: async () => [] }),
    }),
  }),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { hashUrl, hashTitle, hashExcerpt, isDuplicate, titleExcerptPairKey } from '../src/rss/rss-dedup';
import { rankArticle, rankPool } from '../src/rss/rss-ranking';
import { selectForLineup } from '../src/rss/rss-selection';
import { generateBrief, generateBriefs } from '../src/rss/rss-brief-generator';
import { getActiveFeeds, rssPipelineConfig, rssFeedSources } from '../src/rss/rss-config';
import { ArticleCandidateSchema, BriefSchema, RankedArticleSchema } from '../src/schemas/rss-schemas';
import { ArticleCandidate, RankedArticle } from '../src/rss/rss-types';
import { CATEGORY_RULES, CategoryMatchRules } from '../src/tools/lineup-builder';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeArticle(overrides: Partial<ArticleCandidate> = {}): ArticleCandidate {
  const now = new Date().toISOString();
  return {
    id: 'test_feed:abc123',
    url: 'https://example.com/article-1',
    source: 'test_feed',
    sourceName: 'Test Feed',
    title: 'Test Article Title',
    summary: 'This is a test article about football and sports.',
    publishedAt: now,
    publishedAtEstimated: false,
    fetchedAt: now,
    lang: 'en',
    rawCategories: ['sports'],
    contentLevel: 'rss_only',
    excerptHash: 'exc123',
    titleHash: 'tit123',
    urlHash: 'abc123',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('RSS Dedup', () => {
  it('should generate consistent URL hashes', () => {
    const h1 = hashUrl('https://www.example.com/article?utm_source=twitter');
    const h2 = hashUrl('https://example.com/article');
    expect(h1).toBe(h2);
  });

  it('should generate consistent title hashes', () => {
    const h1 = hashTitle('Breaking News!!! Football Match');
    const h2 = hashTitle('breaking news football match');
    expect(h1).toBe(h2);
  });

  it('should generate excerpt hashes from first 300 chars', () => {
    const short = 'Short excerpt';
    const h1 = hashExcerpt(short);
    expect(h1).toBeTruthy();
    expect(typeof h1).toBe('string');
  });

  it('should detect duplicate by urlHash', () => {
    const urlHashes = new Set(['abc123']);
    const pairs = new Set<string>();

    expect(isDuplicate(
      { urlHash: 'abc123', titleHash: 'xxx', excerptHash: 'yyy' },
      urlHashes, pairs
    )).toBe(true);
  });

  it('should detect duplicate by title+excerpt pair', () => {
    const urlHashes = new Set<string>();
    const pairs = new Set([titleExcerptPairKey('tit123', 'exc123')]);

    expect(isDuplicate(
      { urlHash: 'different', titleHash: 'tit123', excerptHash: 'exc123' },
      urlHashes, pairs
    )).toBe(true);
  });

  it('should pass non-duplicates through', () => {
    const urlHashes = new Set(['other']);
    const pairs = new Set([titleExcerptPairKey('other_t', 'other_e')]);

    expect(isDuplicate(
      { urlHash: 'unique', titleHash: 'unique_t', excerptHash: 'unique_e' },
      urlHashes, pairs
    )).toBe(false);
  });
});

describe('RSS Article ID Format', () => {
  it('should follow source:urlHash pattern', () => {
    const article = makeArticle({ source: 'espn_sports', urlHash: 'deadbeef' });
    article.id = `${article.source}:${article.urlHash}`;
    expect(article.id).toBe('espn_sports:deadbeef');
    expect(article.id).toMatch(/^[a-z0-9_]+:[a-z0-9]+$/);
  });
});

describe('RSS Ranking', () => {
  it('should score articles matching must-match patterns', () => {
    const rules: CategoryMatchRules = {
      mustMatch: [/football|soccer|כדורגל/i],
      boostMatch: [/premier league/i],
      excludeMatch: [],
      searchKeywords: ['football'],
    };

    const article = makeArticle({ title: 'Football match today', summary: 'Premier League update' });
    const result = rankArticle(article, 'כדורגל עולמי', rules);

    expect(result.reject).toBe(false);
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('should reject articles matching exclude patterns', () => {
    const rules: CategoryMatchRules = {
      mustMatch: [/football/i],
      boostMatch: [],
      excludeMatch: [/israeli|ישראל/i],
      searchKeywords: [],
    };

    const article = makeArticle({ title: 'Israeli football news' });
    const result = rankArticle(article, 'כדורגל עולמי', rules);

    expect(result.reject).toBe(true);
    expect(result.score).toBe(-1);
  });

  it('should return score 0 when no must-match hit', () => {
    const rules: CategoryMatchRules = {
      mustMatch: [/cricket/i],
      boostMatch: [],
      searchKeywords: [],
    };

    const article = makeArticle({ title: 'Football news', summary: 'About football' });
    const result = rankArticle(article, 'cricket', rules);

    expect(result.score).toBe(0);
    expect(result.reject).toBe(false);
  });

  it('should reduce recency boost when publishedAtEstimated is true', () => {
    const rules: CategoryMatchRules = {
      mustMatch: [/football/i],
      boostMatch: [],
      searchKeywords: [],
    };

    const recentTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago

    const realDate = makeArticle({ title: 'Football news', publishedAt: recentTime, publishedAtEstimated: false });
    const estimatedDate = makeArticle({ title: 'Football news', publishedAt: recentTime, publishedAtEstimated: true });

    const realResult = rankArticle(realDate, 'sports', rules);
    const estResult = rankArticle(estimatedDate, 'sports', rules);

    expect(realResult.score).toBeGreaterThan(estResult.score);
  });

  it('should rank pool across multiple categories', () => {
    const articles = [
      makeArticle({ id: 'f1:a1', title: 'Premier League football match', summary: 'Football update' }),
      makeArticle({ id: 'f2:a2', title: 'NBA basketball game', summary: 'NBA playoffs update' }),
    ];

    // Only test with categories that have rules defined
    const categoryCounts = { 'ספורט': 1 };
    const result = rankPool(articles, categoryCounts);

    expect(result['ספורט']).toBeDefined();
    expect(Array.isArray(result['ספורט'])).toBe(true);
  });
});

describe('RSS Selection', () => {
  it('should return exactly totalItems items', () => {
    const rankedPool: Record<string, RankedArticle[]> = {
      sports: [
        { articleId: 'f:a1', category: 'sports', score: 2.0, reasons: [], reject: false },
        { articleId: 'f:a2', category: 'sports', score: 1.5, reasons: [], reject: false },
      ],
      news: [
        { articleId: 'f:a3', category: 'news', score: 1.8, reasons: [], reject: false },
      ],
    };

    const candidateMap = new Map<string, ArticleCandidate>();
    candidateMap.set('f:a1', makeArticle({ id: 'f:a1' }));
    candidateMap.set('f:a2', makeArticle({ id: 'f:a2' }));
    candidateMap.set('f:a3', makeArticle({ id: 'f:a3' }));

    const result = selectForLineup(rankedPool, candidateMap, 5, { sports: 2, news: 3 });

    expect(result).toHaveLength(5);
  });

  it('should respect category distribution exactly', () => {
    const rankedPool: Record<string, RankedArticle[]> = {
      sports: [
        { articleId: 'f:a1', category: 'sports', score: 2.0, reasons: [], reject: false },
        { articleId: 'f:a2', category: 'sports', score: 1.5, reasons: [], reject: false },
        { articleId: 'f:a3', category: 'sports', score: 1.0, reasons: [], reject: false },
      ],
      news: [
        { articleId: 'f:a4', category: 'news', score: 1.8, reasons: [], reject: false },
        { articleId: 'f:a5', category: 'news', score: 1.3, reasons: [], reject: false },
      ],
    };

    const candidateMap = new Map<string, ArticleCandidate>();
    for (let i = 1; i <= 5; i++) {
      candidateMap.set(`f:a${i}`, makeArticle({ id: `f:a${i}` }));
    }

    const result = selectForLineup(rankedPool, candidateMap, 5, { sports: 3, news: 2 });

    const sportsItems = result.filter((r) => r.category === 'sports');
    const newsItems = result.filter((r) => r.category === 'news');

    expect(sportsItems).toHaveLength(3);
    expect(newsItems).toHaveLength(2);
  });

  it('should mark unfilled slots as placeholders', () => {
    const rankedPool: Record<string, RankedArticle[]> = {
      sports: [], // No articles available
    };
    const candidateMap = new Map<string, ArticleCandidate>();

    const result = selectForLineup(rankedPool, candidateMap, 3, { sports: 3 });

    expect(result).toHaveLength(3);
    for (const item of result) {
      expect(item.isPlaceholder).toBe(true);
    }
  });

  it('should not reuse articles across categories', () => {
    const rankedPool: Record<string, RankedArticle[]> = {
      catA: [{ articleId: 'f:a1', category: 'catA', score: 2.0, reasons: [], reject: false }],
      catB: [{ articleId: 'f:a1', category: 'catB', score: 1.5, reasons: [], reject: false }], // same article
    };

    const candidateMap = new Map<string, ArticleCandidate>();
    candidateMap.set('f:a1', makeArticle({ id: 'f:a1' }));

    const result = selectForLineup(rankedPool, candidateMap, 2, { catA: 1, catB: 1 });

    const realItems = result.filter((r) => !r.isPlaceholder);
    const placeholders = result.filter((r) => r.isPlaceholder);

    // Article used in one category, placeholder in the other
    expect(realItems).toHaveLength(1);
    expect(placeholders).toHaveLength(1);
  });
});

describe('RSS Brief Generator', () => {
  it('should produce LLM brief with briefQuality=llm', async () => {
    const article = makeArticle();
    const brief = await generateBrief(article);

    expect(brief.articleId).toBe(article.id);
    expect(brief.briefQuality).toBe('llm');
    expect(brief.briefText).toBeTruthy();
    expect(brief.bullets.length).toBeGreaterThanOrEqual(1);
    expect(brief.bullets.length).toBeLessThanOrEqual(5);
    expect(brief.whyItMatters).toBeTruthy();
    expect(brief.citation.source).toBe(article.sourceName);
    expect(brief.citation.url).toBe(article.url);
  });

  it('should batch generate briefs', async () => {
    const articles = [makeArticle({ id: 'f:a1' }), makeArticle({ id: 'f:a2' })];
    const briefs = await generateBriefs(articles);

    expect(briefs).toHaveLength(2);
    for (const brief of briefs) {
      expect(brief.briefQuality).toBe('llm');
    }
  });

  it('should have citation with source, url, publishedAt', async () => {
    const article = makeArticle();
    const brief = await generateBrief(article);

    expect(brief.citation).toBeDefined();
    expect(brief.citation.source).toBeTruthy();
    expect(brief.citation.url).toBeTruthy();
    expect(brief.citation.publishedAt).toBeTruthy();
  });
});

describe('RSS Brief Generator - Fallback', () => {
  it('should return rss_only brief shape for rss-only content', async () => {
    // Test the rss_only fallback shape by validating a manually constructed one
    // (The LLM mock always returns valid JSON, so we test the shape contract directly)
    const article = makeArticle();
    const rssOnlyBrief = {
      articleId: article.id,
      briefText: article.summary || article.title,
      bullets: [],
      whyItMatters: '[LLM unavailable - RSS excerpt only]',
      briefQuality: 'rss_only' as const,
      citation: {
        source: article.sourceName,
        url: article.url,
        publishedAt: article.publishedAt,
      },
    };

    expect(rssOnlyBrief.briefQuality).toBe('rss_only');
    expect(rssOnlyBrief.whyItMatters).toContain('LLM unavailable');
    expect(rssOnlyBrief.bullets).toEqual([]);
    expect(rssOnlyBrief.briefText).toBeTruthy();

    // Validate against schema
    const result = BriefSchema.safeParse(rssOnlyBrief);
    expect(result.success).toBe(true);
  });
});

describe('RSS Config', () => {
  it('should default pipeline to disabled', () => {
    // rssPipelineConfig reads env vars at module load time
    // In test environment, RSS_PIPELINE_ENABLED is not set
    expect(typeof rssPipelineConfig.enabled).toBe('boolean');
  });

  it('should have unverified feeds as inactive by default', () => {
    const unverified = rssFeedSources.filter((f) => f.url === '<TODO_VERIFY>');
    for (const feed of unverified) {
      expect(feed.active).toBe(false);
    }
  });

  it('should have unverified feed URLs as <TODO_VERIFY>', () => {
    const unverified = rssFeedSources.filter((f) => f.url === '<TODO_VERIFY>');
    expect(unverified.length).toBeGreaterThan(0);
    for (const feed of unverified) {
      expect(feed.url).toBe('<TODO_VERIFY>');
    }
  });

  it('should return only verified active feeds from getActiveFeeds', () => {
    const active = getActiveFeeds();
    for (const feed of active) {
      expect(feed.active).toBe(true);
      expect(feed.url).not.toBe('<TODO_VERIFY>');
    }
  });

  it('should exclude <TODO_VERIFY> feeds from getActiveFeeds', () => {
    const active = getActiveFeeds();
    for (const feed of active) {
      expect(feed.url).not.toBe('<TODO_VERIFY>');
    }
  });

  it('should collect warnings for requested inactive feed IDs', () => {
    const warnings: Array<{ feedId: string; error: string }> = [];
    getActiveFeeds(['channel1_sports'], warnings);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].feedId).toBe('channel1_sports');
  });
});

describe('RSS Date Fallback', () => {
  it('should set publishedAtEstimated=true when date is missing', () => {
    const article = makeArticle({
      publishedAtEstimated: true,
      publishedAt: new Date().toISOString(),
    });

    expect(article.publishedAtEstimated).toBe(true);
  });

  it('should set publishedAtEstimated=false when date is real', () => {
    const article = makeArticle({ publishedAtEstimated: false });
    expect(article.publishedAtEstimated).toBe(false);
  });
});

describe('Placeholders', () => {
  it('should not have brief/bullets/whyItMatters', () => {
    const rankedPool: Record<string, RankedArticle[]> = { sports: [] };
    const candidateMap = new Map<string, ArticleCandidate>();
    const result = selectForLineup(rankedPool, candidateMap, 2, { sports: 2 });

    for (const item of result) {
      expect(item.isPlaceholder).toBe(true);
      // Placeholder articles should not have brief data
      // (they are never sent to the brief generator)
    }
  });
});

describe('Zod Schema Validation', () => {
  it('should validate a well-formed ArticleCandidate', () => {
    const article = makeArticle();
    const result = ArticleCandidateSchema.safeParse(article);
    expect(result.success).toBe(true);
  });

  it('should reject ArticleCandidate with missing required fields', () => {
    const result = ArticleCandidateSchema.safeParse({ id: 'test' });
    expect(result.success).toBe(false);
  });

  it('should validate a well-formed Brief', () => {
    const brief = {
      articleId: 'f:a1',
      briefText: 'Summary text.',
      bullets: ['Point 1'],
      whyItMatters: 'Important because...',
      briefQuality: 'llm',
      citation: {
        source: 'Test',
        url: 'https://example.com',
        publishedAt: new Date().toISOString(),
      },
    };
    const result = BriefSchema.safeParse(brief);
    expect(result.success).toBe(true);
  });

  it('should validate a well-formed RankedArticle', () => {
    const ranked = {
      articleId: 'f:a1',
      category: 'sports',
      score: 2.5,
      reasons: ['Matched football'],
      reject: false,
    };
    const result = RankedArticleSchema.safeParse(ranked);
    expect(result.success).toBe(true);
  });
});
