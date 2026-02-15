/**
 * RSS Client
 *
 * Fetches and parses RSS/Atom feeds from trusted sources.
 * Uses fast-xml-parser for robust XML handling.
 * Uses withTimeout (Promise.race pattern) matching orchestrator philosophy.
 */

import { XMLParser } from 'fast-xml-parser';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { isDomainAllowed } from '../config/trusted-sources';
import { hashUrl, hashTitle, hashExcerpt } from './rss-dedup';
import { ArticleCandidate, RSSFeedConfig, FeedError } from './rss-types';
import { rssPipelineConfig } from './rss-config';

const logger = createLogger('rss-client');

// ─── withTimeout (same pattern as orchestrator.ts) ───────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

// ─── XML Parser ──────────────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['item', 'entry'].includes(name),
  trimValues: true,
});

// ─── Feed Fetching ───────────────────────────────────────────────────────────

/**
 * Fetch and parse a single RSS/Atom feed.
 * Returns ArticleCandidate[] — per-feed error isolation.
 */
export async function fetchFeed(config: RSSFeedConfig): Promise<ArticleCandidate[]> {
  // Domain allowlist enforcement
  if (!isDomainAllowed(extractDomain(config.url))) {
    logger.warn(`Feed ${config.id}: domain not in allowlist, skipping`, { url: config.url });
    return [];
  }

  try {
    const fetchPromise = fetch(config.url, {
      headers: {
        'User-Agent': 'Lancelot-AI-Agent/2.0 RSS-Pipeline',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
    });

    const response = await withTimeout(
      fetchPromise,
      rssPipelineConfig.fetchTimeoutMs,
      `rss-fetch:${config.id}`,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    const parsed = xmlParser.parse(xml);

    // Detect RSS 2.0 vs Atom
    const items = extractItems(parsed, config);
    const now = new Date().toISOString();

    const candidates: ArticleCandidate[] = [];
    for (const item of items.slice(0, rssPipelineConfig.maxArticlesPerFeed)) {
      const title = cleanText(item.title || '');
      // Normalise link: may be string or object with @_href
      const rawLink = item.link;
      const link: string = typeof rawLink === 'object'
        ? (rawLink as any)?.['@_href'] || (rawLink as any)?.['#text'] || ''
        : String(rawLink || '');
      if (!title || !link) continue; // Required fields

      const summary = cleanText(item.description || item.summary || item.content || '');
      const pubDateRaw = item.pubDate || item.published || item.updated || '';
      const pubDate = parseDate(pubDateRaw);
      const publishedAtEstimated = !pubDate;
      const publishedAt = pubDate ? pubDate.toISOString() : now;

      const uHash = hashUrl(link);
      const tHash = hashTitle(title);
      const eHash = hashExcerpt(summary);

      const candidateId = `${config.id}:${uHash}`;
      const ttlMs = rssPipelineConfig.cacheTtlMinutes * 60 * 1000;
      const fetchedDate = new Date();
      const expiresAt = new Date(fetchedDate.getTime() + ttlMs).toISOString();

      candidates.push({
        id: candidateId,
        url: link,
        source: config.id,
        sourceName: config.name,
        title,
        summary: summary.substring(0, 500),
        publishedAt,
        publishedAtEstimated,
        fetchedAt: fetchedDate.toISOString(),
        lang: config.lang,
        rawCategories: config.categories,
        contentLevel: 'rss_only',
        excerptHash: eHash,
        titleHash: tHash,
        urlHash: uHash,
        expiresAt,
      });
    }

    logger.info(`Fetched ${candidates.length} items from ${config.name}`, {
      feedId: config.id,
    });

    return candidates;
  } catch (error) {
    logger.error(`Failed to fetch feed ${config.name}`, {
      feedId: config.id,
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Fetch all active feeds in parallel with concurrency limit.
 * Uses Promise.allSettled for per-feed failure isolation.
 */
export async function fetchActiveFeeds(
  configs: RSSFeedConfig[],
): Promise<{ candidates: ArticleCandidate[]; errors: FeedError[] }> {
  const allCandidates: ArticleCandidate[] = [];
  const errors: FeedError[] = [];

  // Process in batches of concurrentFeedLimit
  const batchSize = rssPipelineConfig.concurrentFeedLimit;
  for (let i = 0; i < configs.length; i += batchSize) {
    const batch = configs.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((c) => fetchFeed(c)));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const feedConfig = batch[j];
      if (result.status === 'fulfilled') {
        if (result.value.length === 0) {
          // Feed returned nothing — could be empty or failed inside fetchFeed
          errors.push({ feedId: feedConfig.id, error: 'Feed returned 0 items' });
        }
        allCandidates.push(...result.value);
      } else {
        errors.push({ feedId: feedConfig.id, error: result.reason?.message || 'Unknown error' });
      }
    }
  }

  logger.info('Feed fetch round complete', {
    feedsProcessed: configs.length,
    totalCandidates: allCandidates.length,
    errors: errors.length,
  });

  return { candidates: allCandidates, errors };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

interface RSSItem {
  title?: string;
  link?: string | Record<string, string>;
  description?: string;
  summary?: string;
  content?: string;
  pubDate?: string;
  published?: string;
  updated?: string;
  category?: string | string[];
  author?: string;
}

function extractItems(parsed: any, config: RSSFeedConfig): RSSItem[] {
  // RSS 2.0: rss.channel.item
  const rssItems = parsed?.rss?.channel?.item;
  if (rssItems) return normaliseItems(rssItems);

  // Atom: feed.entry
  const atomEntries = parsed?.feed?.entry;
  if (atomEntries) return normaliseAtomEntries(atomEntries);

  // RDF: rdf:RDF.item
  const rdfItems = parsed?.['rdf:RDF']?.item;
  if (rdfItems) return normaliseItems(rdfItems);

  logger.warn(`Unknown feed format for ${config.id}`);
  return [];
}

function normaliseItems(items: any): RSSItem[] {
  if (!Array.isArray(items)) items = [items];
  return items.filter(Boolean).map((item: any) => ({
    title: typeof item.title === 'object' ? item.title?.['#text'] || '' : String(item.title || ''),
    link: typeof item.link === 'object' ? item.link?.['#text'] || item.link?.['@_href'] || '' : String(item.link || ''),
    description: typeof item.description === 'object' ? item.description?.['#text'] || '' : String(item.description || ''),
    pubDate: item.pubDate || item['dc:date'] || '',
    category: item.category,
    author: item.author || item['dc:creator'],
  }));
}

function normaliseAtomEntries(entries: any): RSSItem[] {
  if (!Array.isArray(entries)) entries = [entries];
  return entries.filter(Boolean).map((entry: any) => {
    // Atom link can be an object with @_href
    let link = '';
    if (Array.isArray(entry.link)) {
      const altLink = entry.link.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel']);
      link = altLink?.['@_href'] || entry.link[0]?.['@_href'] || '';
    } else if (typeof entry.link === 'object') {
      link = entry.link['@_href'] || '';
    } else {
      link = String(entry.link || '');
    }

    return {
      title: typeof entry.title === 'object' ? entry.title?.['#text'] || '' : String(entry.title || ''),
      link,
      summary: typeof entry.summary === 'object' ? entry.summary?.['#text'] || '' : String(entry.summary || ''),
      content: typeof entry.content === 'object' ? entry.content?.['#text'] || '' : String(entry.content || ''),
      published: entry.published || '',
      updated: entry.updated || '',
      category: entry.category?.['@_term'] || entry.category,
    };
  });
}

function cleanText(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

export default {
  fetchFeed,
  fetchActiveFeeds,
};
