import { connectMongoDB } from '../config/mongodb';

async function addVizrtPermissions() {
  try {
    const db = await connectMongoDB();
    const usersCollection = db.collection('users');
    
    // Get the first user (or specify an email)
    const userEmail = process.argv[2]; // Pass email as argument
    
    if (!userEmail) {
      console.log('Usage: npm run ts-node src/scripts/add-vizrt-permissions.ts <user-email>');
      process.exit(1);
    }
    
    const user = await usersCollection.findOne({ 
      email: { $regex: new RegExp(`^${userEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
    });
    
    if (!user) {
      console.log(`❌ User with email ${userEmail} not found`);
      process.exit(1);
    }
    
    console.log(`📝 Found user: ${user.displayName || user.firstName + ' ' + user.lastName} (${user.email})`);
    console.log(`📋 Current permissions:`, user.permissions || []);
    
    // Add Vizrt permissions
    const vizrtPermissions = [
      'VIZRT_READ',
      'VIZRT_TRIGGER', 
      'VIZRT_ADMIN'
    ];
    
    const currentPermissions = user.permissions || [];
    const newPermissions = [...new Set([...currentPermissions, ...vizrtPermissions])];
    
    await usersCollection.updateOne(
      { _id: user._id },
      { 
        $set: { 
          permissions: newPermissions,
          updatedAt: new Date()
        } 
      }
    );
    
    console.log(`✅ Added Vizrt permissions to ${user.email}`);
    console.log(`🎯 New permissions:`, newPermissions);
    console.log('\n🚀 You can now use the Vizrt integration!');
    
  } catch (error) {
    console.error('❌ Error adding Vizrt permissions:', error);
  } finally {
    process.exit(0);
  }
}

addVizrtPermissions();
