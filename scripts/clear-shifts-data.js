/**
 * Clears shifts (and optionally related collections) from the configured
 * MongoDB instance. Credentials are read from the environment so we do not
 * ship them in the repo.
 *
 * Required env: MONGODB_URI (full connection string)
 * Optional env: MONGO_DATABASE (default: lancelot)
 *
 * Optional flags:
 *   --include-templates      Also clear shiftTemplates
 *   --include-vacations      Also clear vacationRequests
 *   --include-swaps          Also clear shiftSwapRequests
 *   --include-constraints    Also clear availabilityConstraints
 */

const { MongoClient } = require('mongodb');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const MONGODB_URI = requireEnv('MONGODB_URI');
const DATABASE = process.env.MONGO_DATABASE || 'lancelot';

async function clearShiftsData() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(DATABASE);

    const shiftsResult = await db.collection('shifts').deleteMany({});
    console.log(`Cleared ${shiftsResult.deletedCount} shifts`);

    if (process.argv.includes('--include-templates')) {
      const r = await db.collection('shiftTemplates').deleteMany({});
      console.log(`Cleared ${r.deletedCount} shift templates`);
    }

    if (process.argv.includes('--include-vacations')) {
      const r = await db.collection('vacationRequests').deleteMany({});
      console.log(`Cleared ${r.deletedCount} vacation requests`);
    }

    if (process.argv.includes('--include-swaps')) {
      const r = await db.collection('shiftSwapRequests').deleteMany({});
      console.log(`Cleared ${r.deletedCount} shift swap requests`);
    }

    if (process.argv.includes('--include-constraints')) {
      const r = await db.collection('availabilityConstraints').deleteMany({});
      console.log(`Cleared ${r.deletedCount} availability constraints`);
    }

    console.log('\nShifts data cleared successfully.');
    console.log('\nOptions:');
    console.log('  --include-templates    Also clear shift templates');
    console.log('  --include-vacations    Also clear vacation requests');
    console.log('  --include-swaps        Also clear shift swap requests');
    console.log('  --include-constraints  Also clear availability constraints');
  } catch (error) {
    console.error('Error clearing shifts data:', error);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

clearShiftsData();
