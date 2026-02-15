// Test script to verify production MongoDB connection before seeding
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

// Production MongoDB connection details
// Prefer full URL if provided. Otherwise, build from individual parts with URL-encoded password
const PRODUCTION_MONGO_URL = (() => {
  if (process.env.MONGODB_URL) return process.env.MONGODB_URL;
  if (process.env.PRODUCTION_MONGO_URL) return process.env.PRODUCTION_MONGO_URL;
  const username = process.env.MONGO_USERNAME || 'LancelotERP_DB';
  const rawPassword = process.env.MONGO_PASSWORD || '';
  const password = encodeURIComponent(rawPassword);
  const host = process.env.MONGO_HOST || 'localhost';
  const port = process.env.MONGO_PORT || '27017';
  const dbName = process.env.MONGO_DATABASE || 'lancelot';
  return `mongodb://${username}:${password}@${host}:${port}/${dbName}?authSource=admin`;
})();

async function testProductionConnection() {
  let client: MongoClient | null = null;
  
  try {
    console.log('🔍 Testing Production MongoDB Connection...');
    console.log('');
    
    // Mask password in URL for logging
    const maskedUrl = PRODUCTION_MONGO_URL.replace(/:([^:@]+)@/, ':****@');
    console.log('📡 Connection URL:', maskedUrl);
    console.log('');
    
    // Test connection
    console.log('⏳ Attempting to connect...');
    client = new MongoClient(PRODUCTION_MONGO_URL, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
    });
    
    await client.connect();
    console.log('✅ Successfully connected to MongoDB!');
    
    // Test database access
    const db = client.db('lancelot');
    console.log('📊 Database:', db.databaseName);
    
    // List collections
    const collections = await db.listCollections().toArray();
    console.log(`📁 Found ${collections.length} collections:`);
    collections.forEach(col => {
      console.log(`   - ${col.name}`);
    });
    
    // Check users collection specifically
    const usersCollection = db.collection('users');
    const userCount = await usersCollection.countDocuments();
    console.log(`\n👥 Users collection has ${userCount} documents`);
    
    // Check if mcr@example.com already exists
    const existingUser = await usersCollection.findOne({ email: 'mcr@example.com' });
    if (existingUser) {
      console.log('\n⚠️  User mcr@example.com already exists!');
      console.log('   System Role:', existingUser.systemRole);
      console.log('   Active:', existingUser.isActive);
    } else {
      console.log('\n✅ User mcr@example.com does not exist yet - ready to seed!');
    }
    
    // Test write permissions
    console.log('\n🔐 Testing write permissions...');
    const testCollection = db.collection('connection_test');
    const testDoc = { 
      test: true, 
      timestamp: new Date(), 
      source: 'production-connection-test' 
    };
    
    const insertResult = await testCollection.insertOne(testDoc);
    if (insertResult.insertedId) {
      console.log('✅ Write test successful!');
      // Clean up test document
      await testCollection.deleteOne({ _id: insertResult.insertedId });
      console.log('🧹 Test document cleaned up');
    }
    
    console.log('\n✅ All tests passed! Production MongoDB is ready for seeding.');
    
  } catch (error) {
    console.error('\n❌ Connection test failed!');
    console.error('Error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        console.error('\n🔧 Troubleshooting tips:');
        console.error('1. Check if MongoDB port 27017 is accessible from your local machine');
        console.error('2. Verify your VPS firewall allows connections from your IP');
        console.error('3. Make sure MongoDB is running on the VPS');
      } else if (error.message.includes('Authentication failed')) {
        console.error('\n🔧 Authentication issue:');
        console.error('1. Verify the username and password are correct');
        console.error('2. Check if the user has the right permissions');
        console.error('3. Ensure authSource is set correctly (usually "admin")');
      }
    }
    
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Connection closed');
    }
  }
}

// Run the test
testProductionConnection();





