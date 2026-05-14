/**
 * One-time migration: normalise user.permissions[] and ensure every user
 * has a valid systemRole.
 *
 * Run:  npx ts-node src/scripts/migrate-rbac-permissions.ts
 */

import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import {
  Permission,
  isValidPermission,
  isValidSystemRole,
  LEGACY_PERMISSION_MAP,
} from '../rbac';

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
dotenv.config(); // fallback to .env

const MONGO_URL = process.env.MONGODB_URL
  || process.env.MONGO_URL
  || 'mongodb://localhost:27017/lancelot';

async function migrate() {
  const client = new MongoClient(MONGO_URL, {
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await client.connect();
    const db = client.db();
    const users = db.collection('users');

    const allUsers = await users.find({}).toArray();
    console.log(`Found ${allUsers.length} user(s) to inspect.\n`);

    let updated = 0;
    let skipped = 0;

    for (const user of allUsers) {
      const changes: Record<string, any> = {};
      const notes: string[] = [];

      // 1. Ensure valid systemRole
      const raw = user.systemRole;
      if (!raw || !isValidSystemRole(raw)) {
        changes.systemRole = 'DEPARTMENT_USER';
        notes.push(`systemRole "${raw ?? '<missing>'}" -> DEPARTMENT_USER`);
      }

      // 2. Normalise permissions[]
      const oldPerms: string[] = Array.isArray(user.permissions)
        ? user.permissions
        : [];
      const newPerms: Permission[] = [];
      const dropped: string[] = [];

      for (const p of oldPerms) {
        if (isValidPermission(p)) {
          if (!newPerms.includes(p)) newPerms.push(p);
        } else if (LEGACY_PERMISSION_MAP[p]) {
          const mapped = LEGACY_PERMISSION_MAP[p];
          if (!newPerms.includes(mapped)) newPerms.push(mapped);
          notes.push(`permission "${p}" -> "${mapped}"`);
        } else if (p === 'admin' || p === 'user') {
          dropped.push(p);
        } else {
          dropped.push(p);
        }
      }

      if (dropped.length) notes.push(`dropped: [${dropped.join(', ')}]`);

      const permsChanged =
        oldPerms.length !== newPerms.length ||
        !oldPerms.every((p, i) => p === newPerms[i]);

      if (permsChanged) {
        changes.permissions = newPerms;
      }

      // 3. Deduplicate departments
      if (Array.isArray(user.departments)) {
        const seen = new Set<string>();
        const deduped = user.departments.filter((d: any) => {
          if (!d.departmentId) return false;
          if (seen.has(d.departmentId)) return false;
          seen.add(d.departmentId);
          return true;
        });
        if (deduped.length !== user.departments.length) {
          changes.departments = deduped;
          notes.push(`deduplicated departments: ${user.departments.length} -> ${deduped.length}`);
        }
      }

      if (Object.keys(changes).length === 0) {
        skipped++;
        continue;
      }

      changes.updatedAt = new Date();

      await users.updateOne({ _id: user._id }, { $set: changes });
      updated++;
      console.log(`[UPDATE] ${user.email || user._id}`);
      for (const n of notes) console.log(`         ${n}`);
    }

    console.log(`\nDone. Updated: ${updated}, Skipped (no changes): ${skipped}`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.close();
    process.exit(0);
  }
}

migrate();
