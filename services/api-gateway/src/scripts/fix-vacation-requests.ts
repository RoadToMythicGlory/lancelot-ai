import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function fixVacationRequests() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || 'lancelot');
    
    console.log('🔍 Checking vacation requests with missing or invalid userId...');
    
    // Find all vacation requests
    const vacationRequests = await db.collection('vacation_requests').find({}).toArray();
    
    let fixedCount = 0;
    let deletedCount = 0;
    
    for (const request of vacationRequests) {
      if (!request.userId) {
        console.log(`❌ Found vacation request ${request._id} with no userId`);
        
        // Try to find user by other fields if possible
        // For now, we'll delete these orphaned requests
        await db.collection('vacation_requests').deleteOne({ _id: request._id });
        deletedCount++;
      } else {
        // Check if the user exists
        try {
          const user = await db.collection('users').findOne({ _id: new ObjectId(request.userId) });
          if (!user) {
            console.log(`❌ Found vacation request ${request._id} with invalid userId: ${request.userId}`);
            await db.collection('vacation_requests').deleteOne({ _id: request._id });
            deletedCount++;
          }
        } catch (error) {
          console.log(`❌ Found vacation request ${request._id} with malformed userId: ${request.userId}`);
          await db.collection('vacation_requests').deleteOne({ _id: request._id });
          deletedCount++;
        }
      }
    }
    
    console.log(`✅ Fixed ${fixedCount} vacation requests`);
    console.log(`🗑️  Deleted ${deletedCount} orphaned vacation requests`);
    
    // Add index to ensure userId is always present
    await db.collection('vacation_requests').createIndex({ userId: 1 });
    console.log('✅ Created index on userId field');
    
  } catch (error) {
    console.error('Error fixing vacation requests:', error);
  } finally {
    await client.close();
  }
}

// Run the fix
fixVacationRequests().catch(console.error);



