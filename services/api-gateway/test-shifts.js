const { MongoClient } = require('mongodb');

async function testShifts() {
  console.log('🔍 Testing shifts in local MongoDB...');
  
  // Connect to local MongoDB without authentication
  const client = new MongoClient('mongodb://127.0.0.1:27017/broadcast');
  
  try {
    await client.connect();
    console.log('✅ Connected to local MongoDB');
    
    const db = client.db('broadcast');
    const shiftsCollection = db.collection('shifts');
    
    // Find shifts with assigned workers
    const shifts = await shiftsCollection.find({ 
      assignedWorkers: { $exists: true, $ne: [] } 
    }).toArray();
    
    console.log(`\n📊 Found ${shifts.length} shifts with assigned workers`);
    
    // Check each shift
    shifts.forEach((shift, index) => {
      console.log(`\nShift ${index + 1} (ID: ${shift._id}):`);
      console.log(`  Date: ${shift.date}`);
      console.log(`  Type: ${shift.shiftType}`);
      console.log(`  Department: ${shift.department}`);
      console.log(`  Assigned Workers:`);
      
      shift.assignedWorkers.forEach((worker) => {
        console.log(`    - userId: ${worker.userId} (type: ${typeof worker.userId})`);
        if (worker.user) {
          console.log(`      displayName: ${worker.user.displayName}`);
        }
      });
    });
    
    // Test a specific query
    const testUserId = shifts[0]?.assignedWorkers[0]?.userId;
    if (testUserId) {
      console.log(`\n🔍 Testing query for userId: ${testUserId}`);
      const userShifts = await shiftsCollection.find({
        'assignedWorkers.userId': testUserId
      }).toArray();
      console.log(`Found ${userShifts.length} shifts for this user`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

testShifts(); 