const { MongoClient } = require('mongodb');

async function checkUserPassword() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    // Connect to broadcast database
    const db = client.db('broadcast');
    const users = db.collection('users');
    
    // Find the user
    const user = await users.findOne({ 
      email: { $regex: /mcr@rge\.co\.il/i } 
    });
    
    if (user) {
      console.log('\n🎯 User found in broadcast database:');
      console.log('  - Email:', user.email);
      console.log('  - ID:', user._id);
      console.log('  - Name:', user.firstName, user.lastName);
      console.log('  - Has password field:', !!user.password);
      
      if (user.password) {
        console.log('  - Password type:', user.password.startsWith('$2') ? 'Bcrypt hashed' : 'Plain text');
        console.log('  - Password length:', user.password.length);
        if (!user.password.startsWith('$2')) {
          console.log('  - Plain password:', user.password);
        }
      } else {
        console.log('  - ⚠️  NO PASSWORD SET FOR THIS USER');
      }
    } else {
      console.log('❌ User not found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkUserPassword();

