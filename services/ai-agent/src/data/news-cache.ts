/**
 * News Cache
 * 
 * MongoDB storage for fetched articles with deduplication.
 */

import { connectMongoDB } from './mongodb-adapter';
import { createLogger } from '../utils/logger';
import { generateHash } from '../utils/validation';

const logger = createLogger('news-cache');

/**
 * Cached news article
 */
export interface CachedArticle {
  _id?: string;
  sourceId: string;
  sourceDomain: string;
  sourceName: string;
  url: string;
  title: string;
  titleHebrew?: string;
  excerpt: string;
  excerptHash: string;
  content?: string;
  fetchedAt: Date;
  publishedAt?: Date;
  relevanceScore: number;
  category: string;
  tags: string[];
  metadata: {
    sport?: string;
    league?: string;
    teams?: string[];
    players?: string[];
  };
  embedding?: number[]; // For RAG (future)
  isProcessed: boolean;
  expiresAt: Date;
}

const COLLECTION_NAME = 'fetchedArticles';
const DEFAULT_TTL_HOURS = 24;

/**
 * Initialize news cache collection with indexes
 */
export async function initializeNewsCache(): Promise<void> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<CachedArticle>(COLLECTION_NAME);
    
    // Create indexes
    await collection.createIndex({ excerptHash: 1 }, { unique: true });
    await collection.createIndex({ sourceDomain: 1 });
    await collection.createIndex({ category: 1 });
    await collection.createIndex({ fetchedAt: -1 });
    await collection.createIndex({ relevanceScore: -1 });
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
    await collection.createIndex({ 'metadata.sport': 1 });
    await collection.createIndex({ 'metadata.league': 1 });
    await collection.createIndex({ tags: 1 });
    
    logger.info('News cache indexes created');
  } catch (error) {
    logger.error('Failed to initialize news cache', {
      error: (error as Error).message,
    });
  }
}

/**
 * Cache an article (with deduplication)
 */
export async function cacheArticle(
  article: Omit<CachedArticle, '_id' | 'excerptHash' | 'fetchedAt' | 'expiresAt' | 'isProcessed'>
): Promise<{ cached: boolean; isDuplicate: boolean }> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<CachedArticle>(COLLECTION_NAME);
    
    // Generate hash for deduplication
    const excerptHash = generateHash(article.excerpt + article.title);
    
    // Check for duplicate
    const existing = await collection.findOne({ excerptHash });
    
    if (existing) {
      logger.debug('Duplicate article skipped', {
        url: article.url,
        excerptHash,
      });
      return { cached: false, isDuplicate: true };
    }
    
    // Insert new article
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_TTL_HOURS * 60 * 60 * 1000);
    
    await collection.insertOne({
      ...article,
      excerptHash,
      fetchedAt: now,
      expiresAt,
      isProcessed: false,
    });
    
    logger.debug('Article cached', {
      url: article.url,
      title: article.title.substring(0, 50),
    });
    
    return { cached: true, isDuplicate: false };
  } catch (error) {
    // Handle duplicate key error gracefully
    if ((error as Error).message.includes('duplicate key')) {
      return { cached: false, isDuplicate: true };
    }
    
    logger.error('Failed to cache article', {
      url: article.url,
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Get recent articles
 */
export async function getRecentArticles(
  options: {
    limit?: number;
    category?: string;
    sport?: string;
    league?: string;
    minRelevance?: number;
    hoursBack?: number;
  } = {}
): Promise<CachedArticle[]> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<CachedArticle>(COLLECTION_NAME);
    
    const query: Record<string, unknown> = {};
    
    if (options.category) {
      query.category = options.category;
    }
    
    if (options.sport) {
      query['metadata.sport'] = options.sport;
    }
    
    if (options.league) {
      query['metadata.league'] = options.league;
    }
    
    if (options.minRelevance) {
      query.relevanceScore = { $gte: options.minRelevance };
    }
    
    if (options.hoursBack) {
      const cutoff = new Date(Date.now() - options.hoursBack * 60 * 60 * 1000);
      query.fetchedAt = { $gte: cutoff };
    }
    
    return await collection
      .find(query)
      .sort({ relevanceScore: -1, fetchedAt: -1 })
      .limit(options.limit || 20)
      .toArray();
  } catch (error) {
    logger.error('Failed to get recent articles', {
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Get articles by tags
 */
export async function getArticlesByTags(
  tags: string[],
  limit: number = 10
): Promise<CachedArticle[]> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<CachedArticle>(COLLECTION_NAME);
    
    return await collection
      .find({ tags: { $in: tags } })
      .sort({ relevanceScore: -1, fetchedAt: -1 })
      .limit(limit)
      .toArray();
  } catch (error) {
    logger.error('Failed to get articles by tags', {
      tags,
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Search articles by text
 */
export async function searchArticles(
  searchText: string,
  limit: number = 10
): Promise<CachedArticle[]> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<CachedArticle>(COLLECTION_NAME);
    
    // Simple text search (for more advanced search, use text indexes or external search)
    const regex = new RegExp(searchText, 'i');
    
    return await collection
      .find({
        $or: [
          { title: regex },
          { titleHebrew: regex },
          { excerpt: regex },
          { tags: regex },
        ],
      })
      .sort({ relevanceScore: -1, fetchedAt: -1 })
      .limit(limit)
      .toArray();
  } catch (error) {
    logger.error('Failed to search articles', {
      searchText,
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalArticles: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  oldestArticle: Date | null;
  newestArticle: Date | null;
}> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<CachedArticle>(COLLECTION_NAME);
    
    const total = await collection.countDocuments();
    
    // Aggregate by category
    const categoryAgg = await collection.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]).toArray();
    
    const byCategory: Record<string, number> = {};
    for (const cat of categoryAgg) {
      byCategory[cat._id] = cat.count;
    }
    
    // Aggregate by source
    const sourceAgg = await collection.aggregate([
      { $group: { _id: '$sourceDomain', count: { $sum: 1 } } },
    ]).toArray();
    
    const bySource: Record<string, number> = {};
    for (const src of sourceAgg) {
      bySource[src._id] = src.count;
    }
    
    // Get date range
    const oldest = await collection.findOne({}, { sort: { fetchedAt: 1 } });
    const newest = await collection.findOne({}, { sort: { fetchedAt: -1 } });
    
    return {
      totalArticles: total,
      byCategory,
      bySource,
      oldestArticle: oldest?.fetchedAt || null,
      newestArticle: newest?.fetchedAt || null,
    };
  } catch (error) {
    logger.error('Failed to get cache stats', {
      error: (error as Error).message,
    });
    return {
      totalArticles: 0,
      byCategory: {},
      bySource: {},
      oldestArticle: null,
      newestArticle: null,
    };
  }
}

/**
 * Clear expired articles manually
 */
export async function clearExpiredArticles(): Promise<number> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<CachedArticle>(COLLECTION_NAME);
    
    const result = await collection.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    
    logger.info('Cleared expired articles', {
      deleted: result.deletedCount,
    });
    
    return result.deletedCount;
  } catch (error) {
    logger.error('Failed to clear expired articles', {
      error: (error as Error).message,
    });
    return 0;
  }
}

export default {
  initializeNewsCache,
  cacheArticle,
  getRecentArticles,
  getArticlesByTags,
  searchArticles,
  getCacheStats,
  clearExpiredArticles,
};
