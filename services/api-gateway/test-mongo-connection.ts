import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

config();

console.log('🔍 MongoDB Connection Test');
console.log('==========================\n');

console.log('Environment Variables:');
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`MONGO_HOST: ${process.env.MONGO_HOST || 'not set (default: 127.0.0.1)'}`);
console.log(`MONGO_PORT: ${process.env.MONGO_PORT || 'not set (default: 27017)'}`);
console.log(`MONGO_DATABASE: ${process.env.MONGO_DATABASE || 'not set (default: lancelot)'}`);
console.log(`MONGO_USERNAME: ${process.env.MONGO_USERNAME ? '***SET***' : 'NOT SET'}`);
console.log(`MONGO_PASSWORD: ${process.env.MONGO_PASSWORD ? '***SET***' : 'NOT SET'}`);
console.log(`MONGODB_URL: ${process.env.MONGODB_URL ? '***SET***' : 'NOT SET'}`);
console.log('\n');

const buildMongoUrl = (): string => {
  if (process.env.MONGODB_URL) {
    console.log('Using MONGODB_URL from environment');
    return process.env.MONGODB_URL;
  }

  const host = process.env.MONGO_HOST || '127.0.0.1';
  const port = process.env.MONGO_PORT || '27017';
  const database = process.env.MONGO_DATABASE || 'lancelot';
  const username = process.env.MONGO_USERNAME;
  const password = process.env.MONGO_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'MONGO_USERNAME and MONGO_PASSWORD are required. Set them in your environment or .env file.'
    );
  }

  return `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}?authSource=admin`;
};

async function testConnection() {
  try {
    const url = buildMongoUrl();
    const sanitizedUrl = url.replace(/:[^:@/]+@/, ':***@');
    console.log(`Connection URL: ${sanitizedUrl}\n`);

    console.log('Attempting connection...');
    const client = new MongoClient(url);

    await client.connect();
    console.log('✅ Connected successfully!');

    const db = client.db();
    await db.admin().ping();
    console.log('✅ Ping successful!');

    const adminDb = client.db().admin();
    const dbList = await adminDb.listDatabases();
    console.log('\nAvailable databases:');
    dbList.databases.forEach((db) => {
      console.log(`  - ${db.name}`);
    });

    await client.close();
    console.log('\n✅ Connection closed successfully');
  } catch (error: any) {
    console.error('\n❌ Connection failed:', error);

    if (error?.message?.includes('Authentication failed')) {
      console.log('\n🔧 Troubleshooting tips:');
      console.log('1. Make sure MongoDB is running:');
      console.log('   docker ps | grep mongodb');
      console.log('\n2. Check that your .env file has MONGO_USERNAME and MONGO_PASSWORD set');
      console.log('   (or alternatively MONGODB_URL with the full connection string).');
      console.log('\n3. Never commit real credentials — see .env.example for the canonical');
      console.log('   variable list.');
    }
  }
}

testConnection();
