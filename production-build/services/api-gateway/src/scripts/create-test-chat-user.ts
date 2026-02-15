import { connectMongoDB, closeMongoDB } from '../config/mongodb';
import bcrypt from 'bcrypt';

async function createTestUser() {
  try {
    console.log('Creating test user for chat...');
    
    const db = await connectMongoDB();
    const usersCollection = db.collection('users');
    
    // Create a test user
    const testUser = {
      email: 'test@lancelot.com',
      password: await bcrypt.hash('test123', 10),
      firstName: 'Test',
      lastName: 'User',
      displayName: 'Test User',
      role: 'user',
      systemRole: 'DEPARTMENT_USER',
      departments: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email: testUser.email });
    
    if (existingUser) {
      console.log('Test user already exists, updating...');
      await usersCollection.updateOne(
        { email: testUser.email },
        { $set: testUser }
      );
    } else {
      console.log('Creating new test user...');
      await usersCollection.insertOne(testUser);
    }
    
    console.log('✅ Test user created/updated successfully!');
    console.log('📧 Email: test@lancelot.com');
    console.log('🔑 Password: test123');
    
    await closeMongoDB();
    process.exit(0);
  } catch (error) {
    console.error('Error creating test user:', error);
    process.exit(1);
  }
}

createTestUser();
