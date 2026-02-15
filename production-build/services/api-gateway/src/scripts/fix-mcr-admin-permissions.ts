// Fix MCR admin user permissions - add department admin role
// This script updates an existing MCR user to have proper department admin permissions

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

// Production MongoDB connection details
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

// Updated user permissions for MCR admin
const MCR_ADMIN_PERMISSIONS = {
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
  ]
};

async function fixMCRAdminPermissions() {
  let client: MongoClient | null = null;
  
  try {
    console.log('🔧 Starting MCR admin permissions fix...');
    console.log('⚠️  WARNING: This will modify PRODUCTION database!');
    console.log('');
    
    // Connect to production MongoDB
    console.log('🔗 Connecting to production MongoDB...');
    client = new MongoClient(PRODUCTION_MONGO_URL, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
    });
    
    await client.connect();
    const db = client.db('lancelot');
    const usersCollection = db.collection('users');
    
    // Search for MCR users (case insensitive)
    const mcrUsers = await usersCollection.find({
      email: { $regex: /mcr.*@.*rge\.co\.il/i }
    }).toArray();
    
    console.log(`Found ${mcrUsers.length} MCR user(s):`);
    mcrUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} - Current systemRole: ${user.systemRole || 'not set'}`);
    });
    
    if (mcrUsers.length === 0) {
      console.log('❌ No MCR users found. Please check the email pattern.');
      return;
    }
    
    // Ask which user to update
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    let selectedUser;
    if (mcrUsers.length === 1) {
      selectedUser = mcrUsers[0];
      console.log(`\nSelected user: ${selectedUser.email}`);
    } else {
      const choice = await new Promise<string>((resolve) => {
        readline.question('\nEnter the number of the user to update: ', resolve);
      });
      
      const choiceIndex = parseInt(choice) - 1;
      if (choiceIndex >= 0 && choiceIndex < mcrUsers.length) {
        selectedUser = mcrUsers[choiceIndex];
      } else {
        console.log('❌ Invalid choice. Exiting.');
        readline.close();
        return;
      }
    }
    
    console.log('\nCurrent user details:');
    console.log(`Email: ${selectedUser.email}`);
    console.log(`System Role: ${selectedUser.systemRole || 'not set'}`);
    console.log(`Departments: ${JSON.stringify(selectedUser.departments || [], null, 2)}`);
    
    const answer = await new Promise<string>((resolve) => {
      readline.question('\nDo you want to update this user to DEPARTMENT_ADMIN? Type "YES" to confirm: ', resolve);
    });
    
    readline.close();
    
    if (answer !== 'YES') {
      console.log('❌ Update cancelled. No changes were made.');
      return;
    }
    
    // Update the user
    const updateResult = await usersCollection.updateOne(
      { _id: selectedUser._id },
      {
        $set: {
          systemRole: MCR_ADMIN_PERMISSIONS.systemRole,
          departments: MCR_ADMIN_PERMISSIONS.departments,
          updatedAt: new Date(),
          updatedBy: 'fix-mcr-admin-permissions-script'
        }
      }
    );
    
    if (updateResult.modifiedCount > 0) {
      console.log('');
      console.log('✅ MCR admin permissions UPDATED successfully!');
      console.log('');
      console.log('=' .repeat(60));
      console.log('UPDATED USER DETAILS');
      console.log('=' .repeat(60));
      console.log(`Email: ${selectedUser.email}`);
      console.log(`System Role: ${MCR_ADMIN_PERMISSIONS.systemRole}`);
      console.log(`Departments:`);
      MCR_ADMIN_PERMISSIONS.departments.forEach(dept => {
        console.log(`  - ${dept.departmentName} (${dept.departmentId}): ${dept.roles.join(', ')}`);
      });
      console.log('=' .repeat(60));
      console.log('');
      console.log('✅ The user now has department admin permissions!');
      console.log('🔄 User may need to log out and log back in for changes to take effect.');
    } else {
      console.log('❌ Failed to update user permissions.');
    }
    
  } catch (error) {
    console.error('❌ Error during permissions fix:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
    process.exit(0);
  }
}

// Add safety check for NODE_ENV
if (process.env.NODE_ENV === 'development' && !process.env.FORCE_PRODUCTION_FIX) {
  console.error('❌ SAFETY CHECK: This script is for PRODUCTION use only!');
  console.error('   Set NODE_ENV=production or FORCE_PRODUCTION_FIX=true to proceed.');
  process.exit(1);
}

// Run the fix
fixMCRAdminPermissions();
