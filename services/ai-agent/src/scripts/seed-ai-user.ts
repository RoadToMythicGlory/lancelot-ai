/**
 * Seed AI User Script
 * 
 * Creates the Lancelot AI virtual user in MongoDB.
 * This user represents the AI agent in the chat system.
 */

import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';
import { config } from '../config';

dotenv.config();

const AI_USER = {
  email: 'lancelot-ai@internal.system',
  firstName: 'Lancelot',
  lastName: 'AI',
  displayName: 'Lancelot AI',
  department: 'AI_SYSTEM',
  systemRole: 'SYSTEM_ADMIN',
  isActive: true,
  isAIAgent: true,
  permissions: [
    'ai:chat',
    'ai:lineup',
    'ai:cg',
    'ai:shifts',
    'ai:news',
    'ai:rights',
  ],
  departments: [
    {
      departmentId: 'ai-system',
      departmentName: 'AI System',
      roles: ['AI_AGENT'],
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

async function seedAIUser(): Promise<void> {
  console.log('🤖 Seeding Lancelot AI User...');
  console.log(`📍 MongoDB URL: ${config.mongodb.url.replace(/:[^:@]+@/, ':***@')}`);
  
  let client: MongoClient | null = null;
  
  try {
    client = new MongoClient(config.mongodb.url);
    await client.connect();
    
    const db: Db = client.db(config.mongodb.database);
    const usersCollection = db.collection('users');
    
    // Check if AI user already exists
    const existingUser = await usersCollection.findOne({
      email: AI_USER.email,
    });
    
    if (existingUser) {
      console.log('✅ AI User already exists');
      console.log(`   ID: ${existingUser._id}`);
      console.log(`   Display Name: ${existingUser.displayName}`);
      
      // Update the user to ensure all fields are current
      await usersCollection.updateOne(
        { email: AI_USER.email },
        {
          $set: {
            ...AI_USER,
            updatedAt: new Date(),
          },
        }
      );
      console.log('✅ AI User updated with latest configuration');
      
    } else {
      // Create new AI user
      const result = await usersCollection.insertOne(AI_USER);
      
      console.log('✅ AI User created successfully');
      console.log(`   ID: ${result.insertedId}`);
      console.log(`   Email: ${AI_USER.email}`);
      console.log(`   Display Name: ${AI_USER.displayName}`);
    }
    
    // Verify the user
    const verifiedUser = await usersCollection.findOne({
      email: AI_USER.email,
    });
    
    if (verifiedUser) {
      console.log('\n📋 AI User Details:');
      console.log(`   _id: ${verifiedUser._id}`);
      console.log(`   email: ${verifiedUser.email}`);
      console.log(`   displayName: ${verifiedUser.displayName}`);
      console.log(`   isAIAgent: ${verifiedUser.isAIAgent}`);
      console.log(`   permissions: ${verifiedUser.permissions?.join(', ')}`);
      
      // Store the ID for configuration
      console.log('\n🔧 Set this environment variable:');
      console.log(`   AI_AGENT_USER_ID=${verifiedUser._id.toString()}`);
    }
    
  } catch (error) {
    console.error('❌ Error seeding AI user:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 MongoDB connection closed');
    }
  }
}

// Run the script
seedAIUser()
  .then(() => {
    console.log('\n✅ AI User seeding complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ AI User seeding failed:', error);
    process.exit(1);
  });
