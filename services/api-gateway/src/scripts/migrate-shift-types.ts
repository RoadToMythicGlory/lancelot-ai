/**
 * One-time migration: lift `department_shift_configs[i].shiftTypes[]` into a
 * standalone `shift_type_defs` collection so the new shifts sub-app can treat
 * shift types as first-class, orderable, soft-deletable rows.
 *
 * Idempotent: re-runnable. For each `(departmentId, name)` pair that does
 * not yet exist in `shift_type_defs`, we insert a new doc; otherwise we update
 * its non-name fields to match the source-of-truth config.
 *
 * Usage:
 *   ts-node services/api-gateway/src/scripts/migrate-shift-types.ts
 *
 * Or from repo root:
 *   npx ts-node services/api-gateway/src/scripts/migrate-shift-types.ts
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const TARGET_COLLECTION = 'shift_type_defs';
const SOURCE_COLLECTION = 'department_shift_configs';

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'broadcast';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    console.log(`✅ Connected to ${dbName}`);

    const collections = (await db.listCollections().toArray()).map((c) => c.name);
    if (!collections.includes(SOURCE_COLLECTION)) {
      console.warn(
        `⚠️  ${SOURCE_COLLECTION} not found — nothing to migrate. Skipping.`,
      );
      return;
    }

    // Ensure indexes on the target collection.
    await db.collection(TARGET_COLLECTION).createIndex({ departmentId: 1, name: 1 }, { unique: true });
    await db.collection(TARGET_COLLECTION).createIndex({ departmentId: 1, order: 1 });

    const configs = await db.collection(SOURCE_COLLECTION).find({}).toArray();
    console.log(`Scanned ${configs.length} department_shift_configs documents.`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const cfg of configs) {
      const deptId = String(cfg.departmentId || cfg._id);
      const types: any[] = Array.isArray(cfg.shiftTypes) ? cfg.shiftTypes : [];

      for (let i = 0; i < types.length; i += 1) {
        const t = types[i];
        if (!t || !t.label) {
          skipped += 1;
          continue;
        }
        const filter = {
          departmentId: deptId,
          name: String(t.label),
        };
        const set: any = {
          departmentId: deptId,
          name: String(t.label),
          startTime: String(t.defaultStartTime || '00:00'),
          endTime: String(t.defaultEndTime || '00:00'),
          color: t.color || null,
          role: t.role || null,
          order: typeof t.order === 'number' ? t.order : i,
          active: t.enabled !== false,
          updatedAt: new Date(),
          // Track that this row originated from the legacy config so we
          // can spot it later if the schemas drift.
          originalKey: t.type || null,
          migrationSource: SOURCE_COLLECTION,
        };
        const result = await db.collection(TARGET_COLLECTION).updateOne(
          filter,
          {
            $set: set,
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true },
        );
        if (result.upsertedCount) inserted += 1;
        else if (result.modifiedCount) updated += 1;
        else skipped += 1;
      }
    }

    console.log(
      `✅ Migration complete — inserted: ${inserted}, updated: ${updated}, skipped: ${skipped}`,
    );
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error('❌ Unhandled migration error:', err);
  process.exit(1);
});
