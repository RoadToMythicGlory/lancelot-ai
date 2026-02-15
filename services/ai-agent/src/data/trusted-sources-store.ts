/**
 * Trusted Sources Store
 * 
 * MongoDB-backed storage for trusted news sources.
 */

import { connectMongoDB } from './mongodb-adapter';
import { TrustedSource, defaultTrustedSources } from '../config/trusted-sources';
import { createLogger } from '../utils/logger';

const logger = createLogger('trusted-sources-store');

/**
 * Stored trusted source (with MongoDB fields)
 */
export interface StoredTrustedSource extends TrustedSource {
  _id?: string;
  lastFetched?: Date;
  fetchCount?: number;
  errorCount?: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION_NAME = 'trustedSources';

/**
 * Initialize trusted sources collection with defaults
 */
export async function initializeTrustedSources(): Promise<void> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<StoredTrustedSource>(COLLECTION_NAME);
    
    // Check if already initialized
    const count = await collection.countDocuments();
    
    if (count === 0) {
      // Insert default sources
      const sourcesToInsert: StoredTrustedSource[] = defaultTrustedSources.map(source => ({
        ...source,
        fetchCount: 0,
        errorCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      
      await collection.insertMany(sourcesToInsert);
      
      logger.info('Initialized trusted sources', {
        count: sourcesToInsert.length,
      });
    } else {
      logger.debug('Trusted sources already initialized', { count });
    }
    
    // Create index on domain
    await collection.createIndex({ domain: 1 }, { unique: true });
    await collection.createIndex({ isAllowed: 1 });
    await collection.createIndex({ category: 1 });
  } catch (error) {
    logger.error('Failed to initialize trusted sources', {
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Get all trusted sources
 */
export async function getAllTrustedSources(): Promise<StoredTrustedSource[]> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<StoredTrustedSource>(COLLECTION_NAME);
    
    return await collection.find({}).toArray();
  } catch (error) {
    logger.error('Failed to get trusted sources', {
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Get allowed sources only
 */
export async function getAllowedSources(): Promise<StoredTrustedSource[]> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<StoredTrustedSource>(COLLECTION_NAME);
    
    return await collection.find({ isAllowed: true }).toArray();
  } catch (error) {
    logger.error('Failed to get allowed sources', {
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Get sources by category
 */
export async function getSourcesByCategory(
  category: 'sports' | 'news' | 'weather' | 'general'
): Promise<StoredTrustedSource[]> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<StoredTrustedSource>(COLLECTION_NAME);
    
    return await collection.find({ 
      category,
      isAllowed: true,
    }).toArray();
  } catch (error) {
    logger.error('Failed to get sources by category', {
      category,
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Add a new trusted source
 */
export async function addTrustedSource(source: TrustedSource): Promise<void> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<StoredTrustedSource>(COLLECTION_NAME);
    
    const storedSource: StoredTrustedSource = {
      ...source,
      fetchCount: 0,
      errorCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await collection.insertOne(storedSource);
    
    logger.info('Added trusted source', {
      domain: source.domain,
      name: source.name,
    });
  } catch (error) {
    logger.error('Failed to add trusted source', {
      domain: source.domain,
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Update source status (allowed/blocked)
 */
export async function updateSourceStatus(
  domain: string,
  isAllowed: boolean
): Promise<void> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<StoredTrustedSource>(COLLECTION_NAME);
    
    await collection.updateOne(
      { domain },
      {
        $set: {
          isAllowed,
          updatedAt: new Date(),
        },
      }
    );
    
    logger.info('Updated source status', { domain, isAllowed });
  } catch (error) {
    logger.error('Failed to update source status', {
      domain,
      error: (error as Error).message,
    });
  }
}

/**
 * Record successful fetch
 */
export async function recordFetchSuccess(domain: string): Promise<void> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<StoredTrustedSource>(COLLECTION_NAME);
    
    await collection.updateOne(
      { domain },
      {
        $set: {
          lastFetched: new Date(),
          updatedAt: new Date(),
        },
        $inc: {
          fetchCount: 1,
        },
      }
    );
  } catch (error) {
    logger.error('Failed to record fetch success', {
      domain,
      error: (error as Error).message,
    });
  }
}

/**
 * Record fetch error
 */
export async function recordFetchError(domain: string, error: string): Promise<void> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<StoredTrustedSource>(COLLECTION_NAME);
    
    await collection.updateOne(
      { domain },
      {
        $set: {
          lastError: error,
          updatedAt: new Date(),
        },
        $inc: {
          errorCount: 1,
        },
      }
    );
  } catch (error) {
    logger.error('Failed to record fetch error', {
      domain,
      error: (error as Error).message,
    });
  }
}

/**
 * Check if domain is in trusted sources
 */
export async function isDomainTrusted(domain: string): Promise<boolean> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<StoredTrustedSource>(COLLECTION_NAME);
    
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
    
    const source = await collection.findOne({
      $or: [
        { domain: normalizedDomain },
        { domain: { $regex: new RegExp(normalizedDomain.replace('.', '\\.')) } },
      ],
      isAllowed: true,
    });
    
    return !!source;
  } catch (error) {
    logger.error('Failed to check domain trust', {
      domain,
      error: (error as Error).message,
    });
    return false;
  }
}

export default {
  initializeTrustedSources,
  getAllTrustedSources,
  getAllowedSources,
  getSourcesByCategory,
  addTrustedSource,
  updateSourceStatus,
  recordFetchSuccess,
  recordFetchError,
  isDomainTrusted,
};
