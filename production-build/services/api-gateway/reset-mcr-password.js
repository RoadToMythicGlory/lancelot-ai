const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

async function resetMCRPassword() {
  const client = new MongoClient('mongodb://localhost:27017');
  const newPassword = 'Sport2025!';
  
  try {
    await client.connect();
    console.log('Connected to MongoDB\n');
    
    // Connect to broadcast database (where the user exists)
    const db = client.db('broadcast');
    const usersCollection = db.collection('users');
    
    // Find the user
    const user = await usersCollection.findOne({ 
      email: { $regex: /mcr@rge\.co\.il/i } 
    });
    
    if (!user) {
      console.log('❌ User mcr@example.com not found!');
      return;
    }
    
    console.log('✅ Found user:', user.email);
    console.log('🔐 Resetting password to:', newPassword);
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update the user's password
    const result = await usersCollection.updateOne(
      { _id: user._id },
      { 
        $set: { 
          password: hashedPassword,
          updatedAt: new Date()
        }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log('✅ Password successfully reset!');
      console.log('\n📋 Login credentials:');
      console.log('   Email:', user.email);
      console.log('   Password:', newPassword);
    } else {
      console.log('❌ Failed to update password');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

resetMCRPassword();
