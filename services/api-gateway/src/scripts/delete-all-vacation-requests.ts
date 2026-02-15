import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function deleteAllVacationRequests() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('broadcast');
    
    console.log('🗑️  Deleting all vacation requests...');
    
    // Count before deletion
    const countBefore = await db.collection('vacation_requests').countDocuments();
    console.log(`Found ${countBefore} vacation requests to delete`);
    
    // Delete all
    const result = await db.collection('vacation_requests').deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} vacation requests`);
    
    // Verify
    const countAfter = await db.collection('vacation_requests').countDocuments();
    console.log(`Remaining vacation requests: ${countAfter}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

deleteAllVacationRequests().catch(console.error);


