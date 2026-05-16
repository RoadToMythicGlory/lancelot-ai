/**
 * Diagnostic helper for checking the MCR admin user's bcrypt password hash
 * against a list of guesses you provide via the environment.
 *
 * Required env: MONGODB_URI (full connection string)
 * Optional env: CHECK_MCR_EMAIL (default: mcr@example.com)
 *               CHECK_MCR_PASSWORDS (newline- or comma-separated list of
 *                                    candidate passwords to test)
 *
 * No credentials are hardcoded here. The list of test passwords must be
 * supplied at runtime so the repository never ships hashes/plaintext to grep.
 */

const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const MONGODB_URI = requireEnv('MONGODB_URI');
const targetEmail = process.env.CHECK_MCR_EMAIL || 'mcr@example.com';
const candidates = (process.env.CHECK_MCR_PASSWORDS || '')
  .split(/[\n,]/)
  .map((s) => s.trim())
  .filter(Boolean);

async function checkMCRPassword() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    for (const dbName of ['broadcast', 'lancelot']) {
      const db = client.db(dbName);
      const users = db.collection('users');

      const user = await users.findOne({
        email: { $regex: new RegExp(`^${targetEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });

      if (!user) {
        console.log(`No user matching ${targetEmail} in '${dbName}' database`);
        continue;
      }

      console.log(`Found user in '${dbName}' database:`);
      console.log(`  Email: ${user.email}`);
      console.log(`  ID: ${user._id}`);
      console.log(`  Password hash present: ${!!user.password}`);

      if (user.password && user.password.startsWith('$2') && candidates.length > 0) {
        console.log('  Testing supplied candidate passwords...');
        let matched = false;
        for (const candidate of candidates) {
          if (await bcrypt.compare(candidate, user.password)) {
            console.log('  ✅ A supplied candidate matched.');
            matched = true;
            break;
          }
        }
        if (!matched) {
          console.log('  ❌ No supplied candidate matched.');
        }
      } else if (candidates.length === 0) {
        console.log('  Provide CHECK_MCR_PASSWORDS to test specific candidates.');
      }
    }
  } catch (error) {
    console.error('Error:', error);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

checkMCRPassword();
