import bcrypt from 'bcrypt';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

// Load env (prefer production file if present)
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

const MONGO_URL = process.env.MONGODB_URL || (() => {
  const username = process.env.MONGO_USERNAME || 'LancelotERP_DB';
  const rawPassword = process.env.MONGO_PASSWORD || '';
  const password = encodeURIComponent(rawPassword);
  const host = process.env.MONGO_HOST || 'localhost';
  const port = process.env.MONGO_PORT || '27017';
  const dbName = process.env.MONGO_DATABASE || 'lancelot';
  return `mongodb://${username}:${password}@${host}:${port}/${dbName}?authSource=admin`;
})();

async function run() {
  const email = process.env.SEED_EMAIL;
  const passwordPlain = process.env.SEED_PASSWORD;
  if (!email || !passwordPlain) {
    throw new Error('SEED_EMAIL and SEED_PASSWORD must be provided as environment variables before seeding.');
  }
  const firstName = process.env.SEED_FIRST_NAME || 'MCR';
  const lastName = process.env.SEED_LAST_NAME || 'Admin';

  const systemRole = (process.env.SEED_SYSTEM_ROLE || 'DEPARTMENT_ADMIN') as any;

  // Department roles per requirements
  const departments = [
    { departmentId: 'MCR-General', departmentName: 'MCR', roles: ['Department Admin'] },
    { departmentId: 'MCR-Playout', departmentName: 'Playout', roles: ['Department Admin'] },
    { departmentId: 'MCR-Ingest', departmentName: 'Ingest', roles: ['Department Admin'] },
  ];

  let client: MongoClient | null = null;
  try {
    console.log('Connecting to MongoDB at', MONGO_URL.replace(/:[^:@]+@/, ':***@'));
    client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 10000, socketTimeoutMS: 30000 });
    await client.connect();
    const db = client.db(process.env.MONGO_DATABASE || 'lancelot');
    const users = db.collection('users');

    const existing = await users.findOne({ email });
    if (existing) {
      console.log('User already exists. Updating password and roles...');
      const hashed = await bcrypt.hash(passwordPlain, 10);
      const res = await users.updateOne(
        { email },
        {
          $set: {
            password: hashed,
            firstName,
            lastName,
            displayName: `${firstName} ${lastName}`,
            systemRole,
            departments,
            isActive: true,
            updatedAt: new Date(),
            updatedBy: 'seed-single-user-script'
          }
        }
      );
      console.log('Update result:', res.modifiedCount);
    } else {
      const hashed = await bcrypt.hash(passwordPlain, 10);
      const doc = {
        email,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        systemRole,
        departments,
        phone: '',
        mobile: '',
        isActive: true,
        lastLogin: null,
        password: hashed,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'seed-single-user-script',
        updatedBy: 'seed-single-user-script'
      };
      const res = await users.insertOne(doc);
      console.log('Inserted user id:', res.insertedId.toString());
      await users.createIndex({ email: 1 }, { unique: true });
    }

    console.log('✅ Seed complete for', email);
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  } finally {
    if (client) await client.close();
  }
}

run();
