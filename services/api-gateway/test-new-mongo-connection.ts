import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

config();

/**
 * Smoke test for MongoDB connectivity. Reads credentials only from the
 * environment / `.env` file — never hardcoded — so it is safe to commit.
 */
async function testNewMongoConnection() {
  console.log('🔍 Testing MongoDB connection');
  console.log('=============================\n');

  const username = process.env.MONGO_USERNAME;
  const password = process.env.MONGO_PASSWORD;
  const database = process.env.MONGO_DATABASE || 'lancelot';
  const host = process.env.MONGO_HOST || 'localhost';
  const port = process.env.MONGO_PORT || '27017';

  let url = process.env.MONGODB_URL || process.env.MONGODB_URI;
  if (!url) {
    if (!username || !password) {
      console.error('❌ Set MONGODB_URL/MONGODB_URI or MONGO_USERNAME + MONGO_PASSWORD in your environment.');
      process.exit(1);
    }
    url = `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}?authSource=admin`;
  }

  const sanitizedUrl = url.replace(/:[^:@/]+@/, ':***@');
  console.log(`Connection URL: ${sanitizedUrl}\n`);

  try {
    console.log('Attempting connection...');
    const client = new MongoClient(url, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    await client.connect();
    console.log('✅ Connected successfully!');

    const db = client.db();
    await db.admin().ping();
    console.log('✅ Ping successful!');

    const adminDb = client.db().admin();
    const dbList = await adminDb.listDatabases();
    console.log('\nAvailable databases:');
    dbList.databases.forEach((d) => {
      console.log(`  - ${d.name} (${(d.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });

    const collections = await db.listCollections().toArray();
    console.log(`\nCollections in '${database}' database:`);
    if (collections.length === 0) {
      console.log('  (No collections found - database is empty)');
    } else {
      collections.forEach((col) => {
        console.log(`  - ${col.name}`);
      });
    }

    await client.close();
    console.log('\n✅ Connection test completed successfully!');
  } catch (error: any) {
    console.error('\n❌ Connection failed:', error?.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure MongoDB container is running:');
    console.log('   docker-compose up -d mongodb');
    console.log('\n2. Check container logs:');
    console.log('   docker-compose logs mongodb');
    console.log('\n3. Verify your .env credentials match the running container.');
    process.exit(1);
  }
}

testNewMongoConnection().catch(console.error);
