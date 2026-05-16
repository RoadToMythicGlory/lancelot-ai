const { MongoClient } = require('mongodb');

// Credentials must be supplied via the environment so we never ship a
// hardcoded MongoDB connection string.
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing required environment variable: MONGODB_URI');
  process.exit(1);
}

async function fixMCRAdminPermissions() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('🔗 Connected to MongoDB');

    const db = client.db('lancelot');
    const usersCollection = db.collection('users');

    // Search for MCR users (case insensitive)
    const mcrUsers = await usersCollection.find({
      email: { $regex: /mcr.*@.*rge\.co\.il/i }
    }).toArray();

    console.log(`\nFound ${mcrUsers.length} MCR user(s):`);
    mcrUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} - Current systemRole: ${user.systemRole || 'not set'}`);
    });

    if (mcrUsers.length === 0) {
      console.log('❌ No MCR users found. Please check the email pattern.');
      return;
    }

    // Use the first MCR user found
    const selectedUser = mcrUsers[0];
    console.log(`\n🎯 Updating user: ${selectedUser.email}`);
    
    console.log('Current user details:');
    console.log(`Email: ${selectedUser.email}`);
    console.log(`System Role: ${selectedUser.systemRole || 'not set'}`);
    console.log(`Departments: ${JSON.stringify(selectedUser.departments || [], null, 2)}`);

    // Update the user with department admin permissions
    const updateResult = await usersCollection.updateOne(
      { _id: selectedUser._id },
      {
        $set: {
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
          updatedAt: new Date(),
          updatedBy: 'fix-mcr-admin-permissions-script'
        }
      }
    );

    if (updateResult.modifiedCount > 0) {
      console.log('\n✅ MCR admin permissions UPDATED successfully!');
      console.log('');
      console.log('=' .repeat(60));
      console.log('UPDATED USER DETAILS');
      console.log('=' .repeat(60));
      console.log(`Email: ${selectedUser.email}`);
      console.log(`System Role: DEPARTMENT_ADMIN`);
      console.log(`Departments:`);
      console.log(`  - MCR (MCR-General): MCR Supervisor, Department Admin`);
      console.log(`  - Playout (MCR-Playout): Department Admin`);
      console.log(`  - Ingest (MCR-Ingest): Department Admin`);
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
    await client.close();
    console.log('📡 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the fix
console.log('🔧 Starting MCR admin permissions fix...');
console.log('⚠️  This will update the MCR user to have DEPARTMENT_ADMIN permissions');
console.log('');

fixMCRAdminPermissions().catch(console.error);
