// Idempotent seed for the EquipmentCategory collection.
//
// Runs on every API startup (see `index.ts`). On first boot it copies the
// legacy `EQUIPMENT_CATEGORIES` map from `equipment.models.ts` into the
// new collection so the existing 41 categories are immediately available
// in the new admin UI and pickers without manual SQL/Mongo work.
//
// Behavior:
//   • Upsert by `slug`. We NEVER overwrite admin-managed fields (labelHe,
//     sortOrder, isActive) on rows that already exist. Only new rows are
//     created, with sortOrder reflecting the declaration order from the
//     legacy map.
//   • As a safety net, any distinct category slug found on existing
//     `equipment` documents that isn't already in the collection is also
//     inserted (with the slug as a placeholder Hebrew label, so admins
//     can immediately spot it in the catalog and fix the label).
//
// Re-running the seed is always safe: it inserts only missing rows.

import { EquipmentCategory } from '../models/equipmentCategory.models';
import { Equipment, EQUIPMENT_CATEGORIES } from '../models/equipment.models';
import { createLogger } from '../utils/logger';

const log = createLogger('seed-equipment-categories');

export async function seedEquipmentCategories(): Promise<void> {
  // Legacy hardcoded map → ordered seed source. The order of `Object.entries`
  // matches the property-declaration order in the source file, which is what
  // we want for `sortOrder` (Lancelot-original categories come first).
  const legacyEntries = Object.entries(EQUIPMENT_CATEGORIES) as [string, string][];

  let createdCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < legacyEntries.length; i++) {
    const [slug, labelHe] = legacyEntries[i];
    const existing = await EquipmentCategory.findOne({ slug }).exec();
    if (existing) {
      skippedCount += 1;
      continue;
    }
    await EquipmentCategory.create({
      slug,
      labelHe,
      sortOrder: (i + 1) * 10,
      isActive: true,
    });
    createdCount += 1;
  }

  // Backfill any orphan slugs that exist on equipment but aren't in the
  // legacy map (defensive — older imports may have introduced bespoke
  // category strings). Insert them as inactive so they don't appear in
  // the "new equipment" picker, but the data remains valid.
  try {
    const distinctOnEquipment = await Equipment.distinct('category');
    const baseSortOrder = (legacyEntries.length + 1) * 10;
    let orphanIndex = 0;
    for (const raw of distinctOnEquipment as unknown[]) {
      if (typeof raw !== 'string') continue;
      const slug = raw.trim().toLowerCase().replace(/[-\s]+/g, '_');
      if (!slug || !/^[a-z][a-z0-9_]*$/.test(slug)) continue;
      const known = await EquipmentCategory.findOne({ slug }).exec();
      if (known) continue;
      await EquipmentCategory.create({
        slug,
        // Placeholder label = slug. Admin can rename via the UI.
        labelHe: slug,
        sortOrder: baseSortOrder + orphanIndex * 10,
        isActive: false,
      });
      orphanIndex += 1;
      createdCount += 1;
    }
  } catch (err) {
    // Equipment collection may not exist yet on a brand-new install — that's fine.
    log.warn('Skipping equipment backfill while seeding categories', err as any);
  }

  log.info(
    `Equipment categories seeded — created: ${createdCount}, skipped (already present): ${skippedCount}`,
  );
}

// Allow running this file directly via `ts-node` / npm script as well.
if (require.main === module) {
  (async () => {
    const { connectMongoose } = await import('../config/mongodb');
    const mongoose = (await import('mongoose')).default;
    try {
      await connectMongoose();
      await seedEquipmentCategories();
    } catch (err) {
      log.error('Seed failed', err as any);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect().catch(() => {});
    }
  })();
}
