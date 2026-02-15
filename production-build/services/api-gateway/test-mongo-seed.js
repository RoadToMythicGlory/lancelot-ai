// Force development mode
process.env.NODE_ENV = 'development';

// Now require the modules
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

async function seedUsers() {
  try {
    console.log('🌱 Starting user seeding process...');
    
    // Connect to LOCAL MongoDB without auth
    const url = 'mongodb://127.0.0.1:27017/broadcast';
    console.log('Connecting to:', url);
    
    const client = new MongoClient(url);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('broadcast');
    const usersCollection = db.collection('users');
    
    // Clear existing users
    await usersCollection.deleteMany({});
    console.log('🗑️  Cleared existing users');
    
    // Create users
    const users = [
      {
        email: 'admin@example.com',
        password: await bcrypt.hash('123456', 10),
        firstName: 'Admin',
        lastName: 'Channel1',
        role: 'admin',
        department: 'Management',
        permissions: ['admin', 'user'],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        email: 'admin@example.com',
        password: await bcrypt.hash('123456', 10),
        firstName: 'Idan',
        lastName: 'Magor',
        role: 'user',
        department: 'IT',
        permissions: ['user'],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        email: 'operator@example.com',
        password: await bcrypt.hash('123456', 10),
        firstName: 'Shay',
        lastName: 'Shtar',
        role: 'user',
        department: 'Operations',
        permissions: ['user'],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    const result = await usersCollection.insertMany(users);
    console.log(`✅ Successfully seeded ${result.insertedCount} users`);
    
    // Create index
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    console.log('📑 Created unique index on email field');
    
    // List users
    console.log('\n👥 Seeded users:');
    users.forEach(user => {
      console.log(`   - ${user.email} / 123456 (${user.role})`);
    });
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

seedUsers(); 