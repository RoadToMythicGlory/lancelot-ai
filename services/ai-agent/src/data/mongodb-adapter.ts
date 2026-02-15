/**
 * MongoDB Adapter
 * 
 * Provides MongoDB connection for the AI agent service.
 * Reuses connection pattern from api-gateway.
 */

import { MongoClient, Db, MongoClientOptions } from 'mongodb';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('mongodb-adapter');

// MongoDB connection options
const mongoOptions: MongoClientOptions = {
  maxPoolSize: 5,
  minPoolSize: 1,
  maxIdleTimeMS: 60000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 30000,
  retryWrites: true,
  retryReads: true,
};

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connect to MongoDB
 */
export async function connectMongoDB(): Promise<Db> {
  if (db && client) {
    try {
      await db.admin().ping();
      return db;
    } catch {
      db = null;
      client = null;
    }
  }
  
  try {
    const sanitizedUrl = config.mongodb.url.replace(/:[^:@]+@/, ':***@');
    logger.info('Connecting to MongoDB', { url: sanitizedUrl });
    
    client = new MongoClient(config.mongodb.url, mongoOptions);
    await client.connect();
    
    db = client.db(config.mongodb.database);
    await db.admin().ping();
    
    logger.info('Connected to MongoDB successfully');
    
    return db;
  } catch (error) {
    logger.error('Failed to connect to MongoDB', {
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Get the MongoDB database instance
 */
export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongoDB first.');
  }
  return db;
}

/**
 * Check if MongoDB is connected
 */
export async function isConnected(): Promise<boolean> {
  try {
    if (db) {
      await db.admin().ping();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Close MongoDB connection
 */
export async function closeMongoDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('MongoDB connection closed');
  }
}

/**
 * Get AI agent user from database
 */
export async function getAIAgentUser(): Promise<{ _id: string; displayName: string } | null> {
  const database = await connectMongoDB();
  const usersCollection = database.collection('users');
  
  const aiUser = await usersCollection.findOne({
    isAIAgent: true,
    email: 'lancelot-ai@internal.system',
  });
  
  if (aiUser) {
    return {
      _id: aiUser._id.toString(),
      displayName: aiUser.displayName,
    };
  }
  
  return null;
}

export default {
  connectMongoDB,
  getDb,
  isConnected,
  closeMongoDB,
  getAIAgentUser,
};
