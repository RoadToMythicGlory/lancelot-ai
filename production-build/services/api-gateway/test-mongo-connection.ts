import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

// Load environment variables
config();

console.log('🔍 MongoDB Connection Test');
console.log('==========================\n');

// Show environment variables (masked)
console.log('Environment Variables:');
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`MONGO_HOST: ${process.env.MONGO_HOST || 'not set (default: 127.0.0.1)'}`);
console.log(`MONGO_PORT: ${process.env.MONGO_PORT || 'not set (default: 27017)'}`);
console.log(`MONGO_DATABASE: ${process.env.MONGO_DATABASE || 'not set (default: lancelot)'}`);
console.log(`MONGO_USERNAME: ${process.env.MONGO_USERNAME || 'not set (default: LancelotERP_DB)'}`);
console.log(`MONGO_PASSWORD: ${process.env.MONGO_PASSWORD ? '***SET***' : 'NOT SET'}`);
console.log(`MONGODB_URL: ${process.env.MONGODB_URL ? '***SET***' : 'NOT SET'}`);
console.log('\n');

// Build connection URL
const buildMongoUrl = (): string => {
  // First check if MONGODB_URL is provided (from docker-compose)
  if (process.env.MONGODB_URL) {
    console.log('Using MONGODB_URL from environment');
    return process.env.MONGODB_URL;
  }

  const host = process.env.MONGO_HOST || '127.0.0.1';
  const port = process.env.MONGO_PORT || '27017';
  const database = process.env.MONGO_DATABASE || 'lancelot';
  const username = process.env.MONGO_USERNAME || 'LancelotERP_DB';
  const password = process.env.MONGO_PASSWORD;

  // In development, use the docker-compose default password
  if (!password && process.env.NODE_ENV === 'development') {
    console.warn('⚠️  WARNING: Using default MongoDB password in development');
    const devPassword = '<MONGO_PASSWORD>';
    return `mongodb://${username}:${encodeURIComponent(devPassword)}@${host}:${port}/${database}?authSource=admin`;
  }

  if (!password) {
    console.error('❌ ERROR: MONGO_PASSWORD not set!');
    throw new Error('MONGO_PASSWORD is required');
  }

  // Build URL with authentication
  return `mongodb://${username}:${encodeURIComponent(password)}@${host}:${port}/${database}?authSource=admin`;
};

async function testConnection() {
  try {
    const url = buildMongoUrl();
    const sanitizedUrl = url.replace(/:[^:@]+@/, ':***@');
    console.log(`Connection URL: ${sanitizedUrl}\n`);

    console.log('Attempting connection...');
    const client = new MongoClient(url);
    
    await client.connect();
    console.log('✅ Connected successfully!');
    
    // Test the connection
    const db = client.db();
    await db.admin().ping();
    console.log('✅ Ping successful!');
    
    // List databases
    const adminDb = client.db().admin();
    const dbList = await adminDb.listDatabases();
    console.log('\nAvailable databases:');
    dbList.databases.forEach(db => {
      console.log(`  - ${db.name}`);
    });
    
    await client.close();
    console.log('\n✅ Connection closed successfully');
    
  } catch (error) {
    console.error('\n❌ Connection failed:', error);
    
    if (error.message.includes('Authentication failed')) {
      console.log('\n🔧 Troubleshooting tips:');
      console.log('1. Make sure MongoDB is running:');
      console.log('   docker ps | grep mongodb');
      console.log('\n2. Check if you have a .env file with MONGO_PASSWORD set');
      console.log('\n3. If using docker-compose, the default password is: <MONGO_PASSWORD>');
      console.log('\n4. You can set the password in your .env file:');
      console.log('   MONGO_PASSWORD=<MONGO_PASSWORD>');
      console.log('   MONGO_USERNAME=LancelotERP_DB');
      console.log('\n5. Or set the full connection string:');
      console.log('   MONGODB_URL=mongodb://LancelotERP_DB:<MONGO_PASSWORD>@localhost:27017/lancelot?authSource=admin');
    }
  }
}

testConnection(); 