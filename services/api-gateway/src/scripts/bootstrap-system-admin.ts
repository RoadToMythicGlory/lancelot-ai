/**
 * Bootstrap script: create System Admin, wipe all other users.
 *
 * Usage:
 *   npx ts-node src/scripts/bootstrap-system-admin.ts
 *   npx ts-node src/scripts/bootstrap-system-admin.ts --dry-run
 */

import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

// Load env files — .env only (skip .env.production to avoid picking up
// authenticated production credentials when running locally).
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// In development, always use local unauthenticated MongoDB.
const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
const MONGO_URL = isDev
  ? `mongodb://${process.env.MONGO_HOST || '127.0.0.1'}:${process.env.MONGO_PORT || '27017'}/broadcast`
  : process.env.MONGODB_URL || process.env.MONGO_URL || 'mongodb://localhost:27017/broadcast';

const DRY_RUN = process.argv.includes('--dry-run');

const SYS_ADMIN = {
  email: 'sysadmin@example.com',
  password: 'CHANGE_ME_PASSWORD',
  firstName: 'System',
  lastName: 'Admin',
  displayName: 'System Admin',
  systemRole: 'SYSTEM_ADMIN' as const,
};

// Starter role templates seeded after admin creation
const SEED_TEMPLATES = [
  {
    name: 'MCR Operator',
    description: 'Basic MCR department operator',
    baseSystemRole: 'DEPARTMENT_USER',
    departmentScope: null,
    permissions: ['MCR_VIEW', 'MCR_MANAGE', 'BROADCAST_VIEW', 'SHIFTS_VIEW_OWN', 'DASHBOARD_VIEW', 'CHAT_USE', 'WAREHOUSE_VIEW'],
    allowedForDeptAdmins: true,
  },
  {
    name: 'MCR Supervisor',
    description: 'Senior MCR operator with management access',
    baseSystemRole: 'DEPARTMENT_USER',
    departmentScope: null,
    permissions: ['MCR_VIEW', 'MCR_MANAGE', 'MCR_ADMIN', 'BROADCAST_VIEW', 'BROADCAST_MANAGE', 'SHIFTS_VIEW_OWN', 'SHIFTS_VIEW_ALL', 'SHIFTS_MANAGE', 'DASHBOARD_VIEW', 'CHAT_USE', 'WAREHOUSE_VIEW'],
    allowedForDeptAdmins: true,
  },
  {
    name: 'Warehouse Operator',
    description: 'Equipment warehouse management',
    baseSystemRole: 'DEPARTMENT_USER',
    departmentScope: null,
    permissions: ['WAREHOUSE_VIEW', 'WAREHOUSE_MANAGE', 'BROADCAST_VIEW', 'SHIFTS_VIEW_OWN', 'DASHBOARD_VIEW', 'CHAT_USE'],
    allowedForDeptAdmins: true,
  },
  {
    name: 'Department Admin',
    description: 'Full department administrator — can manage users in their department',
    baseSystemRole: 'DEPARTMENT_ADMIN',
    departmentScope: null,
    permissions: [],
    allowedForDeptAdmins: false,
  },
  {
    name: 'Basic Employee',
    description: 'Read-only access to most modules',
    baseSystemRole: 'DEPARTMENT_USER',
    departmentScope: null,
    permissions: [],
    allowedForDeptAdmins: true,
  },
];

// Collections that reference userId / createdBy / updatedBy etc.
const COLLECTIONS_WITH_USER_REFS = [
  'broadcastevents',
  'equipment',
  'equipmentassignments',
  'equipmenthistories',
  'mcrevents',
  'bulletinposts',
  'activityrows',
  'shifts',
  'vacationrequests',
  'swaprequests',
  'auditlogs',
  'notifications',
  'workflowinstances',
  'mediaassets',
  'conversations',
  'messages',
  'equipmentsets',
  'internalequipmentassignments',
];

const USER_REF_FIELDS = [
  'createdBy',
  'updatedBy',
  'assignedBy',
  'assignedTo',
  'userId',
  'performedBy',
  'disabledBy',
  'returnedBy',
];

async function bootstrap() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');
  console.log(`Connecting to: ${MONGO_URL}\n`);

  const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    const db = client.db();

    // ---------------------------------------------------------------
    // 1. Gather existing user ids
    //
    // We deliberately exclude the virtual Lancelot AI user
    // (`lancelot-ai@internal.system`) — it backs the in-app chat AI and
    // is *not* a human account. Wiping it would break ChatManager's
    // `aiAgentUser` lookup and make the AI disappear from the contacts
    // list. Its references in history collections also stay untouched.
    // ---------------------------------------------------------------
    const AI_AGENT_EMAIL = 'lancelot-ai@internal.system';

    const existingUsers = await db
      .collection('users')
      .find(
        { email: { $ne: AI_AGENT_EMAIL }, isAIAgent: { $ne: true } },
        { projection: { _id: 1, email: 1 } }
      )
      .toArray();

    const oldUserIds = existingUsers.map((u) => u._id);
    console.log(`Found ${existingUsers.length} existing human user(s) (AI agent preserved):`);
    for (const u of existingUsers) {
      console.log(`  - ${u.email || u._id}`);
    }

    // ---------------------------------------------------------------
    // 2. Re-parent user references to the new admin id
    // ---------------------------------------------------------------
    const newAdminId = new ObjectId();
    const newAdminIdStr = newAdminId.toString();

    console.log(`\nNew System Admin _id: ${newAdminIdStr}`);
    console.log('\nRe-parenting user references in history collections...');

    for (const collName of COLLECTIONS_WITH_USER_REFS) {
      const coll = db.collection(collName);
      const count = await coll.estimatedDocumentCount();
      if (count === 0) continue;

      for (const field of USER_REF_FIELDS) {
        // Try both ObjectId and string variants
        const filterObj: any = { [field]: { $in: [...oldUserIds, ...oldUserIds.map((id) => id.toString())] } };
        const matched = await coll.countDocuments(filterObj);
        if (matched > 0) {
          console.log(`  ${collName}.${field}: ${matched} doc(s) → re-point to new admin`);
          if (!DRY_RUN) {
            await coll.updateMany(filterObj, { $set: { [field]: newAdminIdStr } });
          }
        }
      }
    }

    // ---------------------------------------------------------------
    // 3. Hard-delete ephemeral user-owned data
    // ---------------------------------------------------------------
    console.log('\nDeleting ephemeral user-owned data...');

    const ephemeralCollections = ['aiconversationmemory', 'notifications'];
    for (const collName of ephemeralCollections) {
      const coll = db.collection(collName);
      const count = await coll.estimatedDocumentCount();
      console.log(`  ${collName}: ${count} doc(s) → delete all`);
      if (!DRY_RUN) {
        await coll.deleteMany({});
      }
    }

    // ---------------------------------------------------------------
    // 4. Delete all human users (AI agent preserved)
    // ---------------------------------------------------------------
    console.log(`\nDeleting all ${existingUsers.length} human user(s) (AI agent preserved)...`);
    if (!DRY_RUN) {
      await db.collection('users').deleteMany({
        email: { $ne: AI_AGENT_EMAIL },
        isAIAgent: { $ne: true },
      });
    }

    // ---------------------------------------------------------------
    // 5. Insert new System Admin
    // ---------------------------------------------------------------
    const hashedPassword = await bcrypt.hash(SYS_ADMIN.password, 10);
    const now = new Date();

    const adminDoc = {
      _id: newAdminId,
      email: SYS_ADMIN.email,
      password: hashedPassword,
      firstName: SYS_ADMIN.firstName,
      lastName: SYS_ADMIN.lastName,
      displayName: SYS_ADMIN.displayName,
      systemRole: SYS_ADMIN.systemRole,
      departments: [],
      permissions: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    console.log(`\nInserting System Admin: ${SYS_ADMIN.email}`);
    if (!DRY_RUN) {
      await db.collection('users').insertOne(adminDoc);
    }

    // ---------------------------------------------------------------
    // 6. Seed starter role templates
    // ---------------------------------------------------------------
    console.log('\nSeeding role templates...');

    // Clear existing templates
    const existingTemplates = await db.collection('roletemplates').estimatedDocumentCount();
    if (existingTemplates > 0) {
      console.log(`  Clearing ${existingTemplates} existing template(s)`);
      if (!DRY_RUN) {
        await db.collection('roletemplates').deleteMany({});
      }
    }

    for (const tmpl of SEED_TEMPLATES) {
      console.log(`  + ${tmpl.name} (base: ${tmpl.baseSystemRole}, deptAdmin: ${tmpl.allowedForDeptAdmins})`);
      if (!DRY_RUN) {
        await db.collection('roletemplates').insertOne({
          ...tmpl,
          isActive: true,
          createdBy: newAdminId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // ---------------------------------------------------------------
    // Done
    // ---------------------------------------------------------------
    console.log('\n=== Bootstrap complete ===');
    if (DRY_RUN) {
      console.log('(No changes were written — re-run without --dry-run to apply)');
    } else {
      console.log(`\nLogin credentials:\n  Email: ${SYS_ADMIN.email}\n  Password: ${SYS_ADMIN.password}`);
    }
  } catch (err) {
    console.error('Bootstrap failed:', err);
    process.exit(1);
  } finally {
    await client.close();
    process.exit(0);
  }
}

bootstrap();
