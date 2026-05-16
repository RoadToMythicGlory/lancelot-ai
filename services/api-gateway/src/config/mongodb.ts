import { MongoClient, Db, MongoClientOptions } from 'mongodb';
import mongoose from 'mongoose';

// MongoDB connection options with pooling
const mongoOptions: MongoClientOptions = {
  maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '10'),
  minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || '2'),
  maxIdleTimeMS: 60000, // 1 minute idle timeout
  waitQueueTimeoutMS: 5000, // 5 seconds queue timeout
  serverSelectionTimeoutMS: 5000, // 5 seconds server selection timeout
  socketTimeoutMS: 30000, // 30 seconds socket timeout
  retryWrites: true,
  retryReads: true,
};

// Build MongoDB URL from environment variables
const buildMongoUrl = (): string => {
  // For local development, ALWAYS use local MongoDB without authentication
  if (process.env.NODE_ENV === 'development') {
    const host = process.env.MONGO_HOST || '127.0.0.1';
    const port = process.env.MONGO_PORT || '27017';
    console.log('🔧 Development mode: Connecting to LOCAL MongoDB without authentication');
    return `mongodb://${host}:${port}/broadcast`;
  }

  // For production, check if MONGODB_URL is provided (from docker-compose)
  if (process.env.MONGODB_URL) {
    console.log('Using MONGODB_URL from environment');
    return process.env.MONGODB_URL;
  }

  const host = process.env.MONGO_HOST || '127.0.0.1';
  const port = process.env.MONGO_PORT || '27017';
  const database = process.env.MONGO_DATABASE || 'broadcast';

  // Production / staging require explicit credentials. No hardcoded password defaults.
  const username = process.env.MONGO_USERNAME;
  const password = process.env.MONGO_PASSWORD;

  if (!username || !password) {
    throw new Error(
      '❌ SECURITY ERROR: MONGO_USERNAME and MONGO_PASSWORD are required in non-development environments. ' +
      'Provide MONGODB_URL or set MONGO_USERNAME/MONGO_PASSWORD environment variables.'
    );
  }

  // Build URL with authentication for production
  return `mongodb://${username}:${encodeURIComponent(password)}@${host}:${port}/${database}?authSource=admin`;
};

// Get MongoDB URL
const MONGODB_URL = buildMongoUrl();

let mongoClient: MongoClient | null = null;
let db: Db | null = null;
let connectionAttempts = 0;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY = 2000; // 2 seconds

// Native MongoDB connection with retry logic
export async function connectMongoDB(): Promise<Db> {
  if (db && mongoClient) {
    try {
      // Test if connection is still alive
      await db.admin().ping();
      return db;
    } catch {
      // Connection lost, will reconnect below
      db = null;
      mongoClient = null;
    }
  }

  while (connectionAttempts < MAX_RETRY_ATTEMPTS) {
    try {
      connectionAttempts++;
      const sanitizedUrl = MONGODB_URL.replace(/:[^:@]+@/, ':***@');
      console.log(`🔗 MongoDB connection attempt ${connectionAttempts}/${MAX_RETRY_ATTEMPTS} with URL:`, sanitizedUrl);
      
      mongoClient = new MongoClient(MONGODB_URL, mongoOptions);
      await mongoClient.connect();
      
      db = mongoClient.db(process.env.MONGO_DATABASE || 'broadcast');
      
      // Test the connection
      await db.admin().ping();
      
      console.log('✅ Connected to MongoDB (native driver)');
      console.log(`📊 Connection pool: min=${mongoOptions.minPoolSize}, max=${mongoOptions.maxPoolSize}`);
      
      // Reset connection attempts on success
      connectionAttempts = 0;
      
      // Monitor connection events
      mongoClient.on('serverOpening', () => {
        console.log('MongoDB server connection opened');
      });
      
      mongoClient.on('serverClosed', () => {
        console.log('MongoDB server connection closed');
      });
      
      mongoClient.on('error', (error) => {
        console.error('MongoDB client error:', error);
      });
      
      return db;
    } catch (error) {
      console.error(`❌ MongoDB connection attempt ${connectionAttempts} failed:`, error);
      
      if (connectionAttempts >= MAX_RETRY_ATTEMPTS) {
        throw new Error(`Failed to connect to MongoDB after ${MAX_RETRY_ATTEMPTS} attempts`);
      }
      
      console.log(`Retrying in ${RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
  
  throw new Error('Failed to connect to MongoDB');
}

// Mongoose connection with retry logic
export async function connectMongoose(): Promise<void> {
  let mongooseAttempts = 0;
  
  while (mongooseAttempts < MAX_RETRY_ATTEMPTS) {
    try {
      mongooseAttempts++;
      const sanitizedUrl = MONGODB_URL.replace(/:[^:@]+@/, ':***@');
      console.log(`🔗 Mongoose connection attempt ${mongooseAttempts}/${MAX_RETRY_ATTEMPTS} with URL:`, sanitizedUrl);
      
      // Configure mongoose connection options
      const mongooseOptions = {
        maxPoolSize: mongoOptions.maxPoolSize,
        minPoolSize: mongoOptions.minPoolSize,
        serverSelectionTimeoutMS: mongoOptions.serverSelectionTimeoutMS,
        socketTimeoutMS: mongoOptions.socketTimeoutMS,
        retryWrites: true,
        retryReads: true,
      };
      
      await mongoose.connect(MONGODB_URL, mongooseOptions);
      console.log('✅ Connected to MongoDB (mongoose)');
      
      // Monitor mongoose connection events
      mongoose.connection.on('connected', () => {
        console.log('Mongoose connected to MongoDB');
      });
      
      mongoose.connection.on('error', (error) => {
        console.error('Mongoose connection error:', error);
      });
      
      mongoose.connection.on('disconnected', () => {
        console.log('Mongoose disconnected from MongoDB');
      });
      
      return;
    } catch (error) {
      console.error(`❌ Mongoose connection attempt ${mongooseAttempts} failed:`, error);
      
      if (mongooseAttempts >= MAX_RETRY_ATTEMPTS) {
        throw new Error(`Failed to connect Mongoose to MongoDB after ${MAX_RETRY_ATTEMPTS} attempts`);
      }
      
      console.log(`Retrying in ${RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
}

// Health check function
export async function checkMongoHealth(): Promise<boolean> {
  try {
    if (mongoClient && db) {
      await db.admin().ping();
      return true;
    }
    return false;
  } catch (error) {
    console.error('MongoDB health check failed:', error);
    return false;
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Gracefully shutting down MongoDB connections...');
  if (mongoClient) {
    await mongoClient.close();
    console.log('MongoDB native connection closed');
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('Mongoose connection closed');
  }
});

// Export graceful shutdown function
export async function closeMongoDB(): Promise<void> {
  try {
    if (mongoClient) {
      await mongoClient.close();
      console.log('MongoDB connection closed');
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Mongoose connection closed');
    }
  } catch (error) {
    console.error('Error closing MongoDB connections:', error);
  }
}

export { db, mongoClient }; 