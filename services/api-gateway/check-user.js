const { MongoClient } = require('mongodb');

async function checkUser() {
  const client = new MongoClient('mongodb://localhost:27017/lancelot');
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('lancelot');
    const usersCollection = db.collection('users');
    
    // Find user by email
    const user = await usersCollection.findOne({ 
      email: { $regex: new RegExp('^mcr@example.com$', 'i') } 
    });
    
    if (user) {
      console.log('User found:', {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        systemRole: user.systemRole,
        isActive: user.isActive,
        hasPassword: !!user.password,
        passwordType: user.password ? (user.password.startsWith('$2') ? 'hashed' : 'plain') : 'none'
      });
    } else {
      console.log('User NOT found with email: mcr@example.com');
      
      // List all users to see what's there
      console.log('\nListing all users:');
      const allUsers = await usersCollection.find({}).limit(10).toArray();
      allUsers.forEach(u => {
        console.log(`- ${u.email} (${u.firstName} ${u.lastName})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkUser();

