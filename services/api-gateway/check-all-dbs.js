const { MongoClient } = require('mongodb');

async function checkAllDatabases() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    // List all databases
    const dbList = await client.db().admin().listDatabases();
    console.log('\nDatabases found:');
    
    for (const dbInfo of dbList.databases) {
      console.log(`\n📁 Database: ${dbInfo.name}`);
      
      if (dbInfo.name !== 'admin' && dbInfo.name !== 'local' && dbInfo.name !== 'config') {
        const db = client.db(dbInfo.name);
        const collections = await db.listCollections().toArray();
        
        // Check for users collection
        const usersCollection = collections.find(c => c.name === 'users');
        if (usersCollection) {
          console.log('  ✅ Found users collection!');
          
          // Search for the user
          const users = db.collection('users');
          const user = await users.findOne({ 
            email: { $regex: /mcr@rge\.co\.il/i } 
          });
          
          if (user) {
            console.log('  🎯 FOUND USER mcr@example.com:');
            console.log('    - Database:', dbInfo.name);
            console.log('    - ID:', user._id);
            console.log('    - Email:', user.email);
            console.log('    - Name:', user.firstName, user.lastName);
            console.log('    - System Role:', user.systemRole);
            console.log('    - Password exists:', !!user.password);
          }
          
          // Count total users
          const userCount = await users.countDocuments();
          console.log(`  Total users in ${dbInfo.name}: ${userCount}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkAllDatabases();

