/**
 * RSS Pipeline Types
 *
 * Core data types for the RSS ingestion pipeline.
 * Independent of existing CachedArticle — converters bridge where needed.
 */

// ─── Article Candidate ───────────────────────────────────────────────────────

/**
 * Normalised article produced by rss-client after parsing an RSS/Atom item.
 *
 * ID convention: `${source}:${urlHash}` — compound key stored as Mongo `_id`.
 */
export interface ArticleCandidate {
  /** Compound ID: `source + ':' + urlHash` (e.g. 'channel1_sports:a3f1b2') */
  id: string;
  url: string;
  /** Feed id (e.g. 'channel1_sports') */
  source: string;
  /** Human-readable feed name (e.g. 'Channel1') */
  sourceName: string;
  title: string;
  /** RSS description / excerpt */
  summary: string;
  /** ISO datetime — real pubDate or fetchedAt fallback */
  publishedAt: string;
  /** true when publishedAt was missing and set to fetchedAt */
  publishedAtEstimated: boolean;
  /** ISO datetime — when we fetched this item */
  fetchedAt: string;
  lang: 'he' | 'en';
  rawCategories?: string[];
  /** MVP: always 'rss_only'. Full-text extraction deferred. */
  contentLevel: 'rss_only';
  excerptHash: string;
  titleHash: string;
  urlHash: string;
  /** ISO datetime — per-document TTL for MongoDB expiry */
  expiresAt: string;
}

// ─── Ranked Article ──────────────────────────────────────────────────────────

export interface RankedArticle {
  /** Matches ArticleCandidate.id (`source:urlHash`) */
  articleId: string;
  category: string;
  score: number;
  /** Internal by default; exposed in output only when RSS_DEBUG_RANKING=true */
  reasons: string[];
  reject: boolean;
}

// ─── Brief ───────────────────────────────────────────────────────────────────

export type BriefQuality = 'llm' | 'rss_only';

export interface BriefCitation {
  source: string;
  url: string;
  publishedAt: string;
}

export interface Brief {
  /** Matches ArticleCandidate.id */
  articleId: string;
  briefText: string;
  bullets: string[];
  whyItMatters: string;
  /** Explicit quality marker — never present RSS snippet as LLM-generated */
  briefQuality: BriefQuality;
  citation: BriefCitation;
}

// ─── Feed Config ─────────────────────────────────────────────────────────────

export interface RSSFeedConfig {
  id: string;
  name: string;
  /** '<TODO_VERIFY>' until manually verified via npm run rss:verify */
  url: string;
  lang: 'he' | 'en';
  categories: string[];
  /** 1-100, higher = more trusted / preferred */
  priority: number;
  /** false until verified and manually activated */
  active: boolean;
  type: 'rss' | 'atom';
}

// ─── Pipeline Config ─────────────────────────────────────────────────────────

export interface RSSPipelineConfig {
  /** From RSS_PIPELINE_ENABLED env var (default false) */
  enabled: boolean;
  /** From RSS_DEBUG_RANKING env var — exposes reasons[] in output */
  debugRanking: boolean;
  cacheTtlMinutes: number;
  fetchTimeoutMs: number;
  maxArticlesPerFeed: number;
  timeWindowHours: number;
  concurrentFeedLimit: number;
}

// ─── Pipeline Result ─────────────────────────────────────────────────────────

export interface FeedError {
  feedId: string;
  error: string;
}

export interface RSSPipelineStats {
  feedsFetched: number;
  feedsFailed: number;
  articlesIngested: number;
  duplicatesSkipped: number;
}

export interface RSSPipelineResult {
  items: ArticleCandidate[];
  briefs: Brief[];
  errors: FeedError[];
  stats: RSSPipelineStats;
}

// ─── Selected Article (output of selection engine) ───────────────────────────

export interface SelectedArticle {
  article: ArticleCandidate;
  category: string;
  score: number;
  isPlaceholder: boolean;
}
