import { connectMongoDB } from '../config/mongodb';

async function migrateUsersToHierarchical() {
  try {
    console.log('🔄 Starting user migration to hierarchical structure...');
    
    const db = await connectMongoDB();
    const usersCollection = db.collection('users');
    
    // Get all existing users
    const existingUsers = await usersCollection.find({}).toArray();
    console.log(`Found ${existingUsers.length} users to migrate`);
    
    let migrated = 0;
    let failed = 0;
    
    for (const user of existingUsers) {
      try {
        // Skip if already migrated
        if (user.systemRole) {
          console.log(`✅ User ${user.email} already migrated`);
          continue;
        }
        
        // Determine system role based on existing data
        let systemRole = 'DEPARTMENT_USER'; // Default
        let departments: Array<{
          departmentId: string;
          departmentName: string;
          roles: string[];
        }> = [];
        
        // Map old role/permissions to new system
        if (user.role === 'admin' || user.permissions?.includes('admin')) {
          systemRole = 'IT_ADMIN';
        }
        
        // Map department to new structure
        if (user.department) {
          let departmentId = user.department;
          let roles = ['User']; // Default role
          
          // Map old department names to new codes
          const departmentMapping: {[key: string]: string} = {
            'IT': 'IT',
            'Operations': 'MCR-General',
            'Management': 'IT',
            'MCR': 'MCR-General',
            'Warehouse': 'Warehouse',
            'Production': 'Production-Technicians'
          };
          
          if (departmentMapping[user.department]) {
            departmentId = departmentMapping[user.department];
          }
          
          departments = [{
            departmentId,
            departmentName: user.department,
            roles
          }];
        }
        
        // Update user
        const updateData = {
          systemRole,
          departments,
          displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          isActive: true,
          phone: user.phone || '',
          mobile: user.mobile || '',
          updatedAt: new Date(),
          updatedBy: 'migration'
        };
        
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: updateData }
        );
        
        migrated++;
        console.log(`✅ Migrated user: ${user.email} (${systemRole})`);
        
      } catch (error) {
        failed++;
        console.error(`❌ Failed to migrate user ${user.email}:`, error);
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`   Total users: ${existingUsers.length}`);
    console.log(`   Successfully migrated: ${migrated}`);
    console.log(`   Already migrated: ${existingUsers.length - migrated - failed}`);
    console.log(`   Failed: ${failed}`);
    
    console.log('\n✅ Migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run the migration
migrateUsersToHierarchical(); 