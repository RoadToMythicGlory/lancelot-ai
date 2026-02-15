// Production seed script for mcr@example.com as department admin
// IMPORTANT: This script is for production use - handle with care!

import bcrypt from 'bcrypt';
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

// User details
const MCR_ADMIN_USER = {
  email: 'mcr@example.com',
  firstName: 'MCR',
  lastName: 'Admin',
  displayName: 'MCR Department Admin',
  systemRole: 'DEPARTMENT_ADMIN',
  departments: [
    {
      departmentId: 'MCR-General',
      departmentName: 'MCR',
      roles: ['MCR Supervisor', 'Department Admin']
    },
    {
      departmentId: 'MCR-Playout',
      departmentName: 'Playout',
      roles: ['Department Admin']
    },
    {
      departmentId: 'MCR-Ingest',
      departmentName: 'Ingest',
      roles: ['Department Admin']
    }
  ],
  phone: '',
  mobile: '',
  isActive: true,
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'production-seed-script',
  updatedBy: 'production-seed-script'
};

// Generate secure password
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function seedMCRAdmin() {
  let client: MongoClient | null = null;
  
  try {
    console.log('🚀 Starting production seed for mcr@example.com...');
    console.log('⚠️  WARNING: This will modify PRODUCTION database!');
    console.log('');
    
    // Confirm production deployment
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise<string>((resolve) => {
      readline.question('Are you sure you want to seed to PRODUCTION? Type "YES" to confirm: ', resolve);
    });
    
    readline.close();
    
    if (answer !== 'YES') {
      console.log('❌ Seed cancelled. No changes were made.');
      process.exit(0);
    }
    
    // Connect to production MongoDB
    console.log('🔗 Connecting to production MongoDB...');
    client = new MongoClient(PRODUCTION_MONGO_URL, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
    });
    
    await client.connect();
    const db = client.db('lancelot');
    const usersCollection = db.collection('users');
    
    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email: MCR_ADMIN_USER.email });
    
    if (existingUser) {
      console.log('⚠️  User mcr@example.com already exists in production!');
      console.log('');
      
      // Ask if should update the existing user
      const readline2 = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const updateAnswer = await new Promise<string>((resolve) => {
        readline2.question('Do you want to UPDATE the existing user? Type "UPDATE" to confirm: ', resolve);
      });
      
      readline2.close();
      
      if (updateAnswer !== 'UPDATE') {
        console.log('❌ Update cancelled. No changes were made.');
        process.exit(0);
      }
      
      // Generate new password
      const newPassword = generateSecurePassword();
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      // Update existing user
      const updateResult = await usersCollection.updateOne(
        { email: MCR_ADMIN_USER.email },
        {
          $set: {
            password: hashedPassword,
            firstName: MCR_ADMIN_USER.firstName,
            lastName: MCR_ADMIN_USER.lastName,
            displayName: MCR_ADMIN_USER.displayName,
            systemRole: MCR_ADMIN_USER.systemRole,
            departments: MCR_ADMIN_USER.departments,
            isActive: true,
            updatedAt: new Date(),
            updatedBy: 'production-seed-script-update'
          }
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        console.log('');
        console.log('✅ User UPDATED successfully!');
        console.log('');
        console.log('=' .repeat(60));
        console.log('PRODUCTION USER CREDENTIALS - KEEP SECURE!');
        console.log('=' .repeat(60));
        console.log(`Email: ${MCR_ADMIN_USER.email}`);
        console.log(`Password: ${newPassword}`);
        console.log(`Role: ${MCR_ADMIN_USER.systemRole}`);
        console.log(`Departments: MCR (all sub-departments)`);
        console.log('=' .repeat(60));
        console.log('');
        console.log('⚠️  IMPORTANT: Save these credentials securely and share with the user!');
        console.log('⚠️  The password will not be shown again!');
      } else {
        console.log('❌ Failed to update user.');
      }
      
    } else {
      // Create new user
      const password = generateSecurePassword();
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const newUser = {
        ...MCR_ADMIN_USER,
        password: hashedPassword
      };
      
      const result = await usersCollection.insertOne(newUser);
      
      if (result.insertedId) {
        console.log('');
        console.log('✅ User CREATED successfully!');
        console.log('');
        console.log('=' .repeat(60));
        console.log('PRODUCTION USER CREDENTIALS - KEEP SECURE!');
        console.log('=' .repeat(60));
        console.log(`Email: ${MCR_ADMIN_USER.email}`);
        console.log(`Password: ${password}`);
        console.log(`Role: ${MCR_ADMIN_USER.systemRole}`);
        console.log(`Departments: MCR (all sub-departments)`);
        console.log('=' .repeat(60));
        console.log('');
        console.log('⚠️  IMPORTANT: Save these credentials securely and share with the user!');
        console.log('⚠️  The password will not be shown again!');
      } else {
        console.log('❌ Failed to create user.');
      }
    }
    
    // Create index if not exists
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    
  } catch (error) {
    console.error('❌ Error during production seeding:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
    process.exit(0);
  }
}

// Add safety check for NODE_ENV
if (process.env.NODE_ENV === 'development' && !process.env.FORCE_PRODUCTION_SEED) {
  console.error('❌ SAFETY CHECK: This script is for PRODUCTION use only!');
  console.error('   Set NODE_ENV=production or FORCE_PRODUCTION_SEED=true to proceed.');
  process.exit(1);
}

// Run the seed
seedMCRAdmin();

