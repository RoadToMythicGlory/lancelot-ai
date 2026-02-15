import { MongoClient, ObjectId } from 'mongodb';

async function checkVacationUsers() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const dbName = 'broadcast';
    console.log(`Connected to database: ${dbName}`);
    const db = client.db(dbName);

    console.log('🔍 Checking vacation requests and their users...\n');

    // Get all vacation requests
    const vacationRequests = await db.collection('vacation_requests').find({}).toArray();
    console.log(`Found ${vacationRequests.length} vacation requests\n`);

    // Get all users for comparison
    const allUsers = await db.collection('users').find({}).toArray();
    console.log(`Found ${allUsers.length} users in database\n`);

    // Check each vacation request
    for (const request of vacationRequests) {
      console.log(`\n===== Vacation Request ${request._id} =====`);
      console.log(`Status: ${request.status}`);
      console.log(`Dates: ${request.startDate} to ${request.endDate}`);
      console.log(`userId: "${request.userId}" (type: ${typeof request.userId})`);

      // Try to find user different ways
      let userFound = false;
      let foundMethod = '';

      // Method 1: Direct ObjectId match
      try {
        const user1 = await db.collection('users').findOne({ _id: new ObjectId(request.userId) });
        if (user1) {
          userFound = true;
          foundMethod = 'ObjectId';
          console.log(`✅ User found with ObjectId: ${user1.displayName} (${user1.email})`);
        }
      } catch (e) {
        // Invalid ObjectId format
      }

      // Method 2: String match
      if (!userFound) {
        const user2 = await db.collection('users').findOne({ _id: request.userId });
        if (user2) {
          userFound = true;
          foundMethod = 'String';
          console.log(`✅ User found with string: ${user2.displayName} (${user2.email})`);
        }
      }

      // Method 3: Search by string representation
      if (!userFound) {
        const userIdStr = request.userId.toString();
        const user3 = allUsers.find(u => u._id.toString() === userIdStr);
        if (user3) {
          userFound = true;
          foundMethod = 'toString() match';
          console.log(`✅ User found with toString match: ${user3.displayName} (${user3.email})`);
        }
      }

      if (!userFound) {
        console.log(`❌ USER NOT FOUND!`);
        console.log(`   Checking if similar user exists...`);
        
        // Show some sample users for comparison
        console.log(`   Sample user _ids:`);
        allUsers.slice(0, 3).forEach(u => {
          console.log(`     - ${u._id} (${typeof u._id}) - ${u.displayName}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

checkVacationUsers();
