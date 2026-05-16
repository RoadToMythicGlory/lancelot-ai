import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

/**
 * One-shot bootstrap script that provisions a single MCR admin user.
 *
 * Required environment variables (no defaults — credentials must come from the
 * caller so we never check secrets into git):
 *
 *   MONGODB_URI       full connection string, e.g.
 *                     mongodb://USER:PASSWORD@host:27017/lancelot?authSource=admin
 *   MCR_USER_EMAIL    the email/login for the user to create
 *   MCR_USER_PASSWORD plaintext password to hash and store (rotate after use)
 *
 * Optional:
 *   MCR_USER_FIRST_NAME, MCR_USER_LAST_NAME, MCR_DEPARTMENT_CODE
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const MONGODB_URI = process.env.MONGODB_URI ||
  (() => {
    const user = process.env.MONGO_USERNAME;
    const pass = process.env.MONGO_PASSWORD;
    const host = process.env.MONGO_HOST || 'localhost';
    const db = process.env.MONGO_DATABASE || 'lancelot';
    if (!user || !pass) {
      throw new Error('Set MONGODB_URI or MONGO_USERNAME + MONGO_PASSWORD before running this script.');
    }
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:27017/${db}?authSource=admin`;
  })();

const USER_EMAIL = requireEnv('MCR_USER_EMAIL');
const USER_PASSWORD = requireEnv('MCR_USER_PASSWORD');
const USER_FIRST_NAME = process.env.MCR_USER_FIRST_NAME || 'MCR';
const USER_LAST_NAME = process.env.MCR_USER_LAST_NAME || 'Admin';
const DEPARTMENT_CODE = process.env.MCR_DEPARTMENT_CODE || 'MCR-General';

async function addMCRUser() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('lancelot');
    const usersCollection = db.collection('users');
    const departmentsCollection = db.collection('departments');

    const existingDepartment = await departmentsCollection.findOne({ code: DEPARTMENT_CODE });

    if (!existingDepartment) {
      const newDepartment = {
        id: uuidv4(),
        code: DEPARTMENT_CODE,
        name: 'MCR',
        category: 'MCR',
        roles: ['MCR Operator', 'MCR Supervisor'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await departmentsCollection.insertOne(newDepartment);
      console.log(`Created department: ${DEPARTMENT_CODE}`);
    }

    const existingUser = await usersCollection.findOne({ email: USER_EMAIL });

    if (existingUser) {
      console.log(`User ${USER_EMAIL} already exists`);
      return;
    }

    const hashedPassword = await bcrypt.hash(USER_PASSWORD, 10);

    const mcrUser = {
      id: uuidv4(),
      email: USER_EMAIL,
      password: hashedPassword,
      firstName: USER_FIRST_NAME,
      lastName: USER_LAST_NAME,
      role: 'MCR Supervisor',
      department: DEPARTMENT_CODE,
      permissions: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await usersCollection.insertOne(mcrUser);
    console.log(`Successfully created ${USER_EMAIL} user (department: ${DEPARTMENT_CODE})`);
    console.log('Rotate the password on first login — do not reuse the bootstrap value.');
  } catch (error) {
    console.error('Error:', error);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

addMCRUser().catch((err) => {
  console.error(err);
  process.exit(1);
});
