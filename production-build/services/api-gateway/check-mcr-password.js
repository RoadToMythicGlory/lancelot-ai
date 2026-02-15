const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

async function checkMCRPassword() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    console.log('Connected to MongoDB\n');
    
    // Check broadcast database
    const broadcastDb = client.db('broadcast');
    const broadcastUsers = broadcastDb.collection('users');
    
    const mcrUser = await broadcastUsers.findOne({ 
      email: { $regex: /mcr@rge\.co\.il/i } 
    });
    
    if (mcrUser) {
      console.log('✅ Found MCR user in broadcast database:');
      console.log('  Email:', mcrUser.email);
      console.log('  ID:', mcrUser._id);
      console.log('  Password exists:', !!mcrUser.password);
      
      if (mcrUser.password) {
        console.log('  Password hash:', mcrUser.password);
        
        // Test some common passwords
        const testPasswords = ['test123', 'Test123', 'password', 'Password', 'admin', 'Admin', 'mcr', 'MCR', '123456', 'MCR123456', 'WIz5xLRb0SR5^A0S', 'Wlz5xLRb0SR5^A0S'];
        console.log('\n  Testing common passwords:');
        
        for (const testPwd of testPasswords) {
          if (mcrUser.password.startsWith('$2')) {
            const matches = await bcrypt.compare(testPwd, mcrUser.password);
            if (matches) {
              console.log(`  ✅ PASSWORD FOUND: "${testPwd}"`);
              break;
            }
          }
        }
      }
    }
    
    // Also check lancelot database
    console.log('\n\nChecking lancelot database...');
    const lancelotDb = client.db('lancelot');
    const lancelotUsers = lancelotDb.collection('users');
    
    const lancelotUser = await lancelotUsers.findOne({ 
      email: { $regex: /mcr@rge\.co\.il/i } 
    });
    
    if (lancelotUser) {
      console.log('✅ Found user in lancelot database too!');
      console.log('  Password exists:', !!lancelotUser.password);
      if (lancelotUser.password) {
        console.log('  Password hash:', lancelotUser.password);
      }
    } else {
      console.log('❌ No user in lancelot database');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkMCRPassword();
