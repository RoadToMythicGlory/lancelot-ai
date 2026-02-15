/**
 * RSS Pipeline Configuration
 *
 * Environment-driven config + feed source definitions.
 *
 * The RSS pipeline is the CANONICAL news ingestion path (enabled by default).
 * The legacy news cache is break-glass only (LEGACY_NEWS_CACHE_ENABLED=true).
 * Feeds with url: '<TODO_VERIFY>' are excluded from getActiveFeeds() until verified.
 */

import { RSSPipelineConfig, RSSFeedConfig } from './rss-types';

// ─── Pipeline Configuration ──────────────────────────────────────────────────

export const rssPipelineConfig: RSSPipelineConfig = {
  enabled: process.env.RSS_PIPELINE_ENABLED !== 'false', // enabled by default
  debugRanking: process.env.RSS_DEBUG_RANKING === 'true',
  cacheTtlMinutes: parseInt(process.env.RSS_CACHE_TTL_MINUTES || '60', 10),
  fetchTimeoutMs: parseInt(process.env.RSS_FETCH_TIMEOUT_MS || '10000', 10),
  maxArticlesPerFeed: 50,
  timeWindowHours: parseInt(process.env.RSS_TIME_WINDOW_HOURS || '24', 10),
  concurrentFeedLimit: 5,
};

// ─── Feed Source Definitions ─────────────────────────────────────────────────
// All feeds start active: false with url: '<TODO_VERIFY>'.
// After running `npm run rss:verify` and reviewing results,
// operators manually set active: true on verified feeds.

export const rssFeedSources: RSSFeedConfig[] = [
  // Sports — Israeli
  {
    id: 'channel1_sports',
    name: 'Channel1',
    url: 'https://www.example.com/rss.aspx',
    lang: 'he',
    categories: ['ספורט ישראלי', 'כדורגל ישראלי'],
    priority: 90,
    active: true,
    type: 'rss',
  },
  {
    id: 'one_sports',
    name: 'ONE',
    url: 'https://www.one.co.il/cat/news/rss',
    lang: 'he',
    categories: ['ספורט ישראלי'],
    priority: 85,
    active: true,
    type: 'rss',
  },
  {
    id: 'ynet_sports',
    name: 'Ynet Sports',
    url: 'https://www.ynet.co.il/Integration/StoryRss3.xml',
    lang: 'he',
    categories: ['ספורט ישראלי'],
    priority: 88,
    active: true,
    type: 'rss',
  },

  // Sports — International
  {
    id: 'espn_sports',
    name: 'ESPN',
    url: 'https://www.espn.com/espn/rss/news',
    lang: 'en',
    categories: ['כדורגל עולמי', 'ספורט עולמי כללי'],
    priority: 95,
    active: true,
    type: 'rss',
  },
  {
    id: 'bbc_sport',
    name: 'BBC Sport',
    url: 'https://feeds.bbci.co.uk/sport/rss.xml',
    lang: 'en',
    categories: ['כדורגל עולמי', 'ספורט עולמי כללי'],
    priority: 95,
    active: true,
    type: 'rss',
  },
  {
    id: 'skysports_football',
    name: 'Sky Sports',
    url: '<TODO_VERIFY>',
    lang: 'en',
    categories: ['כדורגל עולמי'],
    priority: 90,
    active: false,
    type: 'rss',
  },

  // News — Israeli
  {
    id: 'ynet_news',
    name: 'Ynet',
    url: '<TODO_VERIFY>',
    lang: 'he',
    categories: ['חדשות'],
    priority: 85,
    active: false,
    type: 'rss',
  },
  {
    id: 'mako_news',
    name: 'Mako',
    url: '<TODO_VERIFY>',
    lang: 'he',
    categories: ['חדשות'],
    priority: 85,
    active: false,
    type: 'rss',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get active, verified feeds.
 *
 * Rules:
 * - Returns only feeds where `active === true` AND `url !== '<TODO_VERIFY>'`
 * - If `sourceIds` provided, further filters by `id` match.
 *   Feeds matching by ID but inactive / unverified are skipped and a warning
 *   entry is appended to the optional `warnings` array.
 * - `<TODO_VERIFY>` feeds are NEVER returned.
 */
export function getActiveFeeds(
  sourceIds?: string[],
  warnings?: Array<{ feedId: string; error: string }>,
): RSSFeedConfig[] {
  let feeds = rssFeedSources.filter(
    (f) => f.active && f.url !== '<TODO_VERIFY>',
  );

  if (sourceIds && sourceIds.length > 0) {
    const activeIds = new Set(feeds.map((f) => f.id));
    feeds = feeds.filter((f) => sourceIds.includes(f.id));

    // Report requested but inactive/unverified feeds
    if (warnings) {
      for (const requestedId of sourceIds) {
        if (!activeIds.has(requestedId)) {
          const feed = rssFeedSources.find((f) => f.id === requestedId);
          if (feed) {
            const reason = feed.url === '<TODO_VERIFY>'
              ? 'URL not configured'
              : 'Feed is inactive';
            warnings.push({ feedId: requestedId, error: reason });
          } else {
            warnings.push({ feedId: requestedId, error: 'Feed ID not found in config' });
          }
        }
      }
    }
  }

  return feeds;
}

export default {
  rssPipelineConfig,
  rssFeedSources,
  getActiveFeeds,
};
