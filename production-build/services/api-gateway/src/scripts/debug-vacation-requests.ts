import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function debugVacationRequests() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const dbName = 'broadcast'; // The API uses broadcast database
    console.log(`Connected to database: ${dbName}`);
    const db = client.db(dbName);
    
    console.log('🔍 Debugging vacation requests...\n');
    
    // First, check what collections exist
    const collections = await db.listCollections().toArray();
    console.log('Collections in database:', collections.map(c => c.name).join(', '));
    
    // Get all vacation requests
    const vacationRequests = await db.collection('vacation_requests').find({}).toArray();
    console.log(`\nFound ${vacationRequests.length} total vacation requests`);
    
    for (const request of vacationRequests) {
      console.log('Vacation Request:', {
        _id: request._id,
        userId: request.userId,
        userIdType: typeof request.userId,
        status: request.status,
        startDate: request.startDate,
        endDate: request.endDate
      });
      
      if (request.userId) {
        // Try to find user with ObjectId
        let userWithObjectId = null;
        try {
          userWithObjectId = await db.collection('users').findOne({ _id: new ObjectId(request.userId) });
        } catch (e) {
          console.log('  ❌ Cannot convert userId to ObjectId');
        }
        
        // Try to find user with string
        const userWithString = await db.collection('users').findOne({ _id: request.userId });
        
        console.log('  User lookup results:');
        console.log('    - With ObjectId:', userWithObjectId ? '✅ Found' : '❌ Not found');
        console.log('    - With string:', userWithString ? '✅ Found' : '❌ Not found');
        
        if (userWithObjectId) {
          console.log('    - User:', userWithObjectId.displayName, userWithObjectId.email);
        } else if (userWithString) {
          console.log('    - User:', userWithString.displayName, userWithString.email);
        }
      }
      console.log('---');
    }
    
    // Check users collection _id types
    console.log('\n🔍 Checking users collection _id types...\n');
    const users = await db.collection('users').find({}).limit(3).toArray();
    for (const user of users) {
      console.log('User:', {
        _id: user._id,
        _idType: typeof user._id,
        isObjectId: user._id instanceof ObjectId,
        displayName: user.displayName,
        email: user.email
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

debugVacationRequests().catch(console.error);
