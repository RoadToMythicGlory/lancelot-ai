const { MongoClient } = require('mongodb');

async function clearShiftsData() {
  // Use localhost with authentication
  const uri = 'mongodb://LancelotERP_DB:<MONGO_PASSWORD>@localhost:27017/lancelot?authSource=admin';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('lancelot');

    // Clear shifts collection
    const shiftsResult = await db.collection('shifts').deleteMany({});
    console.log(`✅ Cleared ${shiftsResult.deletedCount} shifts`);

    // Clear shift templates if you want
    const confirmTemplates = process.argv.includes('--include-templates');
    if (confirmTemplates) {
      const templatesResult = await db.collection('shiftTemplates').deleteMany({});
      console.log(`✅ Cleared ${templatesResult.deletedCount} shift templates`);
    }

    // Clear vacation requests if you want
    const confirmVacations = process.argv.includes('--include-vacations');
    if (confirmVacations) {
      const vacationsResult = await db.collection('vacationRequests').deleteMany({});
      console.log(`✅ Cleared ${vacationsResult.deletedCount} vacation requests`);
    }

    // Clear shift swap requests if you want
    const confirmSwaps = process.argv.includes('--include-swaps');
    if (confirmSwaps) {
      const swapsResult = await db.collection('shiftSwapRequests').deleteMany({});
      console.log(`✅ Cleared ${swapsResult.deletedCount} shift swap requests`);
    }

    // Clear availability constraints if you want
    const confirmConstraints = process.argv.includes('--include-constraints');
    if (confirmConstraints) {
      const constraintsResult = await db.collection('availabilityConstraints').deleteMany({});
      console.log(`✅ Cleared ${constraintsResult.deletedCount} availability constraints`);
    }

    console.log('\n🎉 Shifts data cleared successfully!');
    console.log('\nOptions:');
    console.log('  --include-templates    Also clear shift templates');
    console.log('  --include-vacations    Also clear vacation requests');
    console.log('  --include-swaps        Also clear shift swap requests');
    console.log('  --include-constraints  Also clear availability constraints');
    console.log('\nTo clear everything, run: node scripts/clear-shifts-data.js --include-templates --include-vacations --include-swaps --include-constraints');

  } catch (error) {
    console.error('Error clearing shifts data:', error);
  } finally {
    await client.close();
  }
}

clearShiftsData();
