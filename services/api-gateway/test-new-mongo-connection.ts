import { MongoClient } from 'mongodb';

async function testNewMongoConnection() {
  console.log('🔍 Testing MongoDB connection with new credentials');
  console.log('==================================================\n');

  const credentials = {
    username: 'LancelotERP_DB',
    password: '<MONGO_PASSWORD>',
    database: 'lancelot',
    host: process.env.MONGO_HOST || 'localhost',
    port: process.env.MONGO_PORT || '27017'
  };

  console.log('Connection Details:');
  console.log(`  Host: ${credentials.host}:${credentials.port}`);
  console.log(`  Database: ${credentials.database}`);
  console.log(`  Username: ${credentials.username}`);
  console.log(`  Password: ${credentials.password.substring(0, 4)}...${credentials.password.substring(credentials.password.length - 4)}`);
  console.log('');

  // Build connection URL
  const url = `mongodb://${credentials.username}:${encodeURIComponent(credentials.password)}@${credentials.host}:${credentials.port}/${credentials.database}?authSource=admin`;
  
  try {
    console.log('Attempting connection...');
    const client = new MongoClient(url, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    
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
      console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    
    // Check collections in lancelot database
    const collections = await db.listCollections().toArray();
    console.log(`\nCollections in '${credentials.database}' database:`);
    if (collections.length === 0) {
      console.log('  (No collections found - database is empty)');
    } else {
      collections.forEach(col => {
        console.log(`  - ${col.name}`);
      });
    }
    
    await client.close();
    console.log('\n✅ Connection test completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Update your .env file with:');
    console.log(`   MONGO_USERNAME=${credentials.username}`);
    console.log(`   MONGO_PASSWORD=${credentials.password}`);
    console.log(`   MONGODB_URL=mongodb://${credentials.username}:${encodeURIComponent(credentials.password)}@${credentials.host}:${credentials.port}/${credentials.database}?authSource=admin`);
    console.log('\n2. Run docker-compose up -d mongodb to start MongoDB container');
    console.log('\n3. Run npm run dev to start the API gateway');
    
  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure MongoDB container is running:');
    console.log('   docker-compose up -d mongodb');
    console.log('\n2. Check container logs:');
    console.log('   docker-compose logs mongodb');
    console.log('\n3. Verify the credentials match docker-compose.yml:');
    console.log('   - MONGO_INITDB_ROOT_USERNAME: LancelotERP_DB');
    console.log('   - MONGO_INITDB_ROOT_PASSWORD: <MONGO_PASSWORD>');
    console.log('\n4. If container was already running with old credentials:');
    console.log('   docker-compose down -v  # This will delete data!');
    console.log('   docker-compose up -d mongodb');
    
    process.exit(1);
  }
}

// Run the test
testNewMongoConnection().catch(console.error);














