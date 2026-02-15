/**
 * RSS Articles Store
 *
 * Dedicated MongoDB storage layer for RSS pipeline articles.
 * Completely independent of news-cache.ts (fetchedArticles collection).
 *
 * Collection: rssArticles
 * _id: source + ':' + urlHash (compound identifier)
 * TTL: per-document expiresAt field with expireAfterSeconds: 0
 */

import { connectMongoDB } from './mongodb-adapter';
import { createLogger } from '../utils/logger';
import { ArticleCandidate } from '../rss/rss-types';
import { rssPipelineConfig } from '../rss/rss-config';

const logger = createLogger('rss-articles-store');

const COLLECTION_NAME = 'rssArticles';

// ─── Stored document shape ───────────────────────────────────────────────────

interface RssArticleDocument extends Omit<ArticleCandidate, 'id' | 'fetchedAt' | 'publishedAt' | 'expiresAt'> {
  _id: string; // source:urlHash
  expiresAt: Date; // real Date for Mongo TTL
  fetchedAt: Date;
  publishedAt: Date;
}

// ─── Initialise indexes ──────────────────────────────────────────────────────

/**
 * Create indexes on the rssArticles collection.
 * Idempotent — safe to call on every startup.
 */
export async function initializeRssArticlesStore(): Promise<void> {
  try {
    const db = await connectMongoDB();
    const col = db.collection(COLLECTION_NAME);

    // TTL index — MongoDB deletes documents when expiresAt is in the past
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    // Compound dedup diagnostics
    await col.createIndex({ titleHash: 1, excerptHash: 1 });

    // Time-window queries
    await col.createIndex({ fetchedAt: -1 });

    // Ranking recency queries (publishedAt may differ from fetchedAt)
    await col.createIndex({ publishedAt: -1 });

    // Per-feed queries
    await col.createIndex({ source: 1 });

    // Category filtering
    await col.createIndex({ rawCategories: 1 });

    logger.info('RSS articles store indexes created');
  } catch (error) {
    logger.error('Failed to initialize RSS articles store', {
      error: (error as Error).message,
    });
    throw error;
  }
}

// ─── Store articles ──────────────────────────────────────────────────────────

/**
 * Store a single ArticleCandidate.
 * Sets _id = candidate.id and persists expiresAt as a real Date field.
 */
export async function storeArticle(
  candidate: ArticleCandidate,
): Promise<{ stored: boolean; isDuplicate: boolean }> {
  try {
    const db = await connectMongoDB();
    const col = db.collection<RssArticleDocument>(COLLECTION_NAME);

    const doc = candidateToDocument(candidate);

    await col.insertOne(doc as any);

    logger.debug('RSS article stored', { _id: doc._id, title: candidate.title.substring(0, 50) });
    return { stored: true, isDuplicate: false };
  } catch (error) {
    // Duplicate key on _id → article already exists
    if ((error as Error).message.includes('duplicate key') ||
        (error as any).code === 11000) {
      return { stored: false, isDuplicate: true };
    }
    logger.error('Failed to store RSS article', {
      id: candidate.id,
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Store multiple ArticleCandidates. Uses ordered: false for best-effort bulk insert.
 */
export async function storeArticles(
  candidates: ArticleCandidate[],
): Promise<{ stored: number; duplicates: number }> {
  if (candidates.length === 0) return { stored: 0, duplicates: 0 };

  try {
    const db = await connectMongoDB();
    const col = db.collection<RssArticleDocument>(COLLECTION_NAME);

    const docs = candidates.map(candidateToDocument);

    const result = await col.insertMany(docs as any[], { ordered: false }).catch((bulkErr) => {
      // With ordered: false, some inserts may succeed even if others fail (dupes)
      if (bulkErr.code === 11000 || bulkErr.insertedCount !== undefined) {
        return bulkErr; // MongoBulkWriteError — has insertedCount
      }
      throw bulkErr;
    });

    const insertedCount = typeof result?.insertedCount === 'number'
      ? result.insertedCount
      : candidates.length;
    const duplicates = candidates.length - insertedCount;

    logger.info('RSS articles bulk stored', { stored: insertedCount, duplicates });
    return { stored: insertedCount, duplicates };
  } catch (error) {
    logger.error('Failed to bulk store RSS articles', {
      count: candidates.length,
      error: (error as Error).message,
    });
    throw error;
  }
}

// ─── Query articles ──────────────────────────────────────────────────────────

/**
 * Retrieve articles within a time window, optionally filtered by categories.
 */
export async function getArticlesByTimeWindow(
  hoursBack: number,
  categories?: string[],
  limit: number = 200,
): Promise<ArticleCandidate[]> {
  try {
    const db = await connectMongoDB();
    const col = db.collection<RssArticleDocument>(COLLECTION_NAME);

    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const query: Record<string, unknown> = {
      fetchedAt: { $gte: cutoff },
    };

    if (categories && categories.length > 0) {
      query.rawCategories = { $in: categories };
    }

    const docs = await col
      .find(query)
      .sort({ publishedAt: -1 })
      .limit(limit)
      .toArray();

    return docs.map(documentToCandidate);
  } catch (error) {
    logger.error('Failed to get articles by time window', {
      hoursBack,
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Direct _id lookup — O(1).
 */
export async function getArticleById(id: string): Promise<ArticleCandidate | null> {
  try {
    const db = await connectMongoDB();
    const col = db.collection<RssArticleDocument>(COLLECTION_NAME);

    const doc = await col.findOne({ _id: id as any });
    return doc ? documentToCandidate(doc) : null;
  } catch (error) {
    logger.error('Failed to get article by id', { id, error: (error as Error).message });
    return null;
  }
}

/**
 * Store statistics.
 */
export async function getRssStoreStats(): Promise<{
  total: number;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  try {
    const db = await connectMongoDB();
    const col = db.collection<RssArticleDocument>(COLLECTION_NAME);

    const total = await col.countDocuments();

    const sourceAgg = await col.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]).toArray();
    const bySource: Record<string, number> = {};
    for (const s of sourceAgg) bySource[s._id] = s.count;

    const catAgg = await col.aggregate([
      { $unwind: '$rawCategories' },
      { $group: { _id: '$rawCategories', count: { $sum: 1 } } },
    ]).toArray();
    const byCategory: Record<string, number> = {};
    for (const c of catAgg) byCategory[c._id] = c.count;

    return { total, bySource, byCategory };
  } catch (error) {
    logger.error('Failed to get RSS store stats', { error: (error as Error).message });
    return { total: 0, bySource: {}, byCategory: {} };
  }
}

// ─── Converters ──────────────────────────────────────────────────────────────

function candidateToDocument(candidate: ArticleCandidate): RssArticleDocument {
  const ttlMs = rssPipelineConfig.cacheTtlMinutes * 60 * 1000;
  const fetchedDate = new Date(candidate.fetchedAt);
  const expiresDate = new Date(fetchedDate.getTime() + ttlMs);

  const { id, expiresAt: _expiresAtStr, fetchedAt: _fetchedAtStr, publishedAt: _pubStr, ...rest } = candidate;
  return {
    _id: id,
    ...rest,
    fetchedAt: fetchedDate,
    publishedAt: new Date(candidate.publishedAt),
    expiresAt: expiresDate,
  };
}

function documentToCandidate(doc: RssArticleDocument): ArticleCandidate {
  return {
    id: doc._id,
    url: doc.url,
    source: doc.source,
    sourceName: doc.sourceName,
    title: doc.title,
    summary: doc.summary,
    publishedAt: doc.publishedAt instanceof Date ? doc.publishedAt.toISOString() : String(doc.publishedAt),
    publishedAtEstimated: doc.publishedAtEstimated,
    fetchedAt: doc.fetchedAt instanceof Date ? doc.fetchedAt.toISOString() : String(doc.fetchedAt),
    lang: doc.lang,
    rawCategories: doc.rawCategories,
    contentLevel: doc.contentLevel,
    excerptHash: doc.excerptHash,
    titleHash: doc.titleHash,
    urlHash: doc.urlHash,
    expiresAt: doc.expiresAt instanceof Date ? doc.expiresAt.toISOString() : String(doc.expiresAt),
  };
}

export default {
  initializeRssArticlesStore,
  storeArticle,
  storeArticles,
  getArticlesByTimeWindow,
  getArticleById,
  getRssStoreStats,
};
