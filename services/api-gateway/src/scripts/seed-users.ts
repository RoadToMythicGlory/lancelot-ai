import { connectMongoDB, closeMongoDB } from '../config/mongodb';
import bcrypt from 'bcrypt';
import { config } from '../config';

interface User {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const users: Omit<User, 'createdAt' | 'updatedAt'>[] = [
  {
    email: 'admin@example.com',
    password: '123456',
    firstName: 'Admin',
    lastName: 'Channel1',
    role: 'admin',
    department: 'Management',
    permissions: ['admin', 'user']
  },
  {
    email: 'admin@example.com',
    password: '123456',
    firstName: 'Idan',
    lastName: 'Magor',
    role: 'user',
    department: 'IT',
    permissions: ['user']
  },
  {
    email: 'operator@example.com',
    password: '123456',
    firstName: 'Shay',
    lastName: 'Shtar',
    role: 'user',
    department: 'Operations',
    permissions: ['user']
  }
];

async function seedUsers() {
  try {
    console.log('🌱 Starting user seeding process...');
    
    // Connect to MongoDB
    const db = await connectMongoDB();
    const usersCollection = db.collection('users');
    
    // Clear existing users (for development only!)
    if (config.NODE_ENV === 'development') {
      await usersCollection.deleteMany({});
      console.log('🗑️  Cleared existing users');
    }
    
    // Hash passwords and insert users
    const hashedUsers = await Promise.all(
      users.map(async (user) => {
        const hashedPassword = await bcrypt.hash(user.password, config.BCRYPT_ROUNDS);
        return {
          ...user,
          password: hashedPassword,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      })
    );
    
    const result = await usersCollection.insertMany(hashedUsers);
    console.log(`✅ Successfully seeded ${result.insertedCount} users`);
    
    // Create indexes
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    console.log('📑 Created unique index on email field');
    
    // List seeded users (without passwords)
    console.log('\n👥 Seeded users:');
    users.forEach(user => {
      console.log(`   - ${user.email} (${user.role})`);
    });
    
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    process.exit(1);
  } finally {
    await closeMongoDB();
    process.exit(0);
  }
}

// Run the seed script
seedUsers(); 