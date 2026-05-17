/**
 * Seed script for the dynamic department/assignment redesign.
 *
 * What it does:
 *  1. Backfills any existing `departments` documents that pre-date the new
 *     Department schema so they have the required fields (`code`, `category`,
 *     `isActive`, `roles[]`). Non-destructive — only fills missing values.
 *  2. UPSERTs default `AssignmentFormConfig` rows for the forms the app
 *     already exposes today (`broadcastArray`, `externalBroadcasts`, `mcr`,
 *     `closedCaptions`, `rundown`, `playout`, `warehouseInternalAssignment`)
 *     using the department codes those forms historically use, so admins see
 *     a sensible default and users get a working picker before any manual
 *     customization.
 *  3. Reloads the runtime department role registry so the API gateway
 *     immediately reflects whatever permissions the seeded departments grant.
 *
 * Run with: npm run seed:assignment-form-configs
 *
 * The script is idempotent: it can safely be re-run whenever new defaults
 * need to be installed.
 */

import { connectMongoose } from '../config/mongodb';
import { Department } from '../models/department.models';
import { AssignmentFormConfig } from '../models/assignmentForm.models';
import { reloadDepartmentRoleRegistry } from '../services/departmentRegistry';

interface DefaultFormDeptDef {
  departmentCode: string;
  allowedRoleKeys?: string[];
  defaultCount?: number;
  requireUser?: boolean;
  order?: number;
}

interface DefaultFormConfig {
  formKey: string;
  name: string;
  hebrewName: string;
  description?: string;
  allowUserPresets: boolean;
  departments: DefaultFormDeptDef[];
}

// Department codes mirror what `seed-departments-users.ts` already creates.
// Keeping the codes here in sync with the live database means admins see
// real, selectable departments in the form configuration UI on day one.
const FORM_DEFAULTS: DefaultFormConfig[] = [
  {
    formKey: 'broadcastArray',
    name: 'Broadcast Array',
    hebrewName: 'מערך שידור',
    description: 'הגדרת מחלקות ותפקידים זמינים בטופס מערך השידור',
    allowUserPresets: true,
    departments: [
      { departmentCode: 'Production-Directors', defaultCount: 1, order: 1 },
      { departmentCode: 'Production-VTR', defaultCount: 1, order: 2 },
      { departmentCode: 'Production-CG', defaultCount: 1, order: 3 },
      { departmentCode: 'Production-Soundmen', defaultCount: 1, order: 4 },
      { departmentCode: 'Production-Technicians', defaultCount: 1, order: 5 },
      { departmentCode: 'Production-Commentators', defaultCount: 0, order: 6 },
      { departmentCode: 'MCR-General', defaultCount: 1, order: 7 },
    ],
  },
  {
    formKey: 'externalBroadcasts',
    name: 'External Broadcasts',
    hebrewName: 'שידורים חיצוניים',
    description: 'הגדרת מחלקות זמינות בשידורים חיצוניים',
    allowUserPresets: true,
    departments: [
      { departmentCode: 'Production-Directors', defaultCount: 1, order: 1 },
      { departmentCode: 'Production-Technicians', defaultCount: 2, order: 2 },
      { departmentCode: 'Production-Soundmen', defaultCount: 1, order: 3 },
      { departmentCode: 'Production-CG', defaultCount: 1, order: 4 },
      { departmentCode: 'Production-Commentators', defaultCount: 1, order: 5 },
      { departmentCode: 'Production-ExternalTechnicians', defaultCount: 1, order: 6 },
    ],
  },
  {
    formKey: 'mcr',
    name: 'MCR Assignments',
    hebrewName: 'שיבוצי MCR',
    description: 'מחלקות וצוותי MCR לשיבוץ',
    allowUserPresets: true,
    departments: [
      { departmentCode: 'MCR-General', defaultCount: 1, order: 1 },
      { departmentCode: 'MCR-Playout', defaultCount: 1, order: 2 },
      { departmentCode: 'MCR-Ingest', defaultCount: 1, order: 3 },
    ],
  },
  {
    formKey: 'closedCaptions',
    name: 'Closed Captions',
    hebrewName: 'כתוביות סמויות',
    description: 'מחלקות זמינות לטופס כתוביות',
    allowUserPresets: true,
    departments: [
      { departmentCode: 'NewMedia-Editors', defaultCount: 1, order: 1 },
      { departmentCode: 'News-Editors', defaultCount: 1, order: 2 },
      { departmentCode: 'Visuals-VideoEditors', defaultCount: 1, order: 3 },
    ],
  },
  {
    formKey: 'rundown',
    name: 'Rundown',
    hebrewName: 'ראנדאון',
    description: 'מחלקות זמינות בטופס הראנדאון',
    allowUserPresets: true,
    departments: [
      { departmentCode: 'News-Producers', defaultCount: 1, order: 1 },
      { departmentCode: 'News-Editors', defaultCount: 1, order: 2 },
      { departmentCode: 'News-Desk', defaultCount: 1, order: 3 },
      { departmentCode: 'News-Researchers', defaultCount: 1, order: 4 },
      { departmentCode: 'News-ProductionAssistants', defaultCount: 1, order: 5 },
    ],
  },
  {
    formKey: 'playout',
    name: 'Playout',
    hebrewName: 'פלייאאוט',
    description: 'מחלקות זמינות בטופס הפלייאאוט',
    allowUserPresets: true,
    departments: [
      { departmentCode: 'MCR-Playout', defaultCount: 1, order: 1 },
      { departmentCode: 'MCR-General', defaultCount: 1, order: 2 },
    ],
  },
  {
    formKey: 'warehouseInternalAssignment',
    name: 'Warehouse Internal Assignment',
    hebrewName: 'שיבוץ מחסן פנימי',
    description: 'מחלקות שמהן ניתן לבחור עובדים פנימיים בטופס המחסן',
    allowUserPresets: false,
    departments: [
      { departmentCode: 'Warehouse', defaultCount: 0, requireUser: true, order: 1 },
      { departmentCode: 'Production-Technicians', defaultCount: 0, requireUser: true, order: 2 },
      { departmentCode: 'Production-ExternalTechnicians', defaultCount: 0, requireUser: true, order: 3 },
    ],
  },
];

async function backfillExistingDepartments(): Promise<void> {
  console.log('🩹 Backfilling missing fields on existing department docs...');

  const docs = await Department.find({}).lean();
  let touched = 0;

  for (const doc of docs as any[]) {
    const updates: Record<string, any> = {};

    if (!doc.code) {
      updates.code = (doc.name && String(doc.name)) || String(doc._id);
    }
    if (!doc.category) {
      updates.category = 'General';
    }
    if (typeof doc.isActive !== 'boolean') {
      updates.isActive = true;
    }
    if (!Array.isArray(doc.roles)) {
      updates.roles = [];
    }
    if (!Array.isArray(doc.includesDepartmentCodes)) {
      updates.includesDepartmentCodes = [];
    }
    if (!Array.isArray(doc.permissions)) {
      updates.permissions = [];
    }

    if (Object.keys(updates).length > 0) {
      await Department.updateOne({ _id: doc._id }, { $set: updates });
      touched++;
    }
  }

  console.log(`✅ Backfilled ${touched} department doc(s).`);
}

async function seedFormConfigs(): Promise<void> {
  console.log('🧩 Upserting default AssignmentFormConfig rows...');

  const knownCodes = new Set<string>(
    (await Department.find({}, { code: 1 }).lean()).map((d: any) => d.code).filter(Boolean),
  );

  let inserted = 0;
  let updated = 0;

  for (const cfg of FORM_DEFAULTS) {
    const existing: any = await AssignmentFormConfig.findOne({ formKey: cfg.formKey });

    // Only seed departments that actually exist; skip silently otherwise so we
    // don't inject phantom codes if an operator removed a department.
    const departments = cfg.departments
      .filter((d) => knownCodes.has(d.departmentCode))
      .map((d, idx) => ({
        departmentCode: d.departmentCode,
        allowedRoleKeys: d.allowedRoleKeys || [],
        requireUser: d.requireUser ?? false,
        defaultCount: d.defaultCount ?? 1,
        order: d.order ?? idx,
      }));

    if (existing) {
      // Don't override an admin's customization. Only fill in fields that are
      // missing on the existing doc.
      let dirty = false;
      if (!existing.name) { existing.name = cfg.name; dirty = true; }
      if (!existing.hebrewName) { existing.hebrewName = cfg.hebrewName; dirty = true; }
      if (!existing.description) { existing.description = cfg.description; dirty = true; }
      if (typeof existing.allowUserPresets !== 'boolean') {
        existing.allowUserPresets = cfg.allowUserPresets; dirty = true;
      }
      if (typeof existing.isActive !== 'boolean') {
        existing.isActive = true; dirty = true;
      }
      if (!Array.isArray(existing.departments) || existing.departments.length === 0) {
        existing.departments = departments;
        dirty = true;
      }
      if (dirty) {
        await existing.save();
        updated++;
        console.log(`🔄 Updated form config: ${cfg.formKey}`);
      } else {
        console.log(`⏭️  Skipped (already configured): ${cfg.formKey}`);
      }
    } else {
      await AssignmentFormConfig.create({
        formKey: cfg.formKey,
        name: cfg.name,
        hebrewName: cfg.hebrewName,
        description: cfg.description,
        departments,
        allowUserPresets: cfg.allowUserPresets,
        isActive: true,
      });
      inserted++;
      console.log(`➕ Inserted form config: ${cfg.formKey} (${departments.length} departments)`);
    }
  }

  console.log(`✅ Form configs: ${inserted} inserted, ${updated} updated.`);
}

async function main(): Promise<void> {
  try {
    console.log('🌱 Seeding assignment form configs and backfilling departments...');
    await connectMongoose();
    console.log('🔗 Connected to MongoDB');

    await backfillExistingDepartments();
    await seedFormConfigs();

    // Pick up any new permission grants in the runtime registry without
    // requiring an API gateway restart.
    await reloadDepartmentRoleRegistry();
    console.log('🔁 Department role registry reloaded.');

    console.log('🎉 Done.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
