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

const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const MONGODB_URI = requireEnv('MONGODB_URI');
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
      systemRole: 'DEPARTMENT_ADMIN',
      departments: [{
        departmentId: DEPARTMENT_CODE,
        departmentName: 'MCR',
        roles: ['MCR Supervisor'],
      }],
      permissions: ['admin', 'shift_admin', 'broadcast_admin', 'equipment_admin'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await usersCollection.insertOne(mcrUser);
    console.log(`Created user: ${USER_EMAIL} (department: ${DEPARTMENT_CODE})`);
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
