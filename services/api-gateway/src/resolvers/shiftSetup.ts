/**
 * Resolvers for the shifts sub-app's first-class concepts:
 *
 *  - APL                    (sub-roles inside a shift, with eligible employees)
 *  - ShiftTypeDef           (shift type definitions, lifted to its own collection)
 *  - ShiftCategory + slots  (logical groupings of (day, shiftType) cells)
 *  - ConstraintRule         (limits applied to *preference* submissions)
 *  - SchedulingRule         (limits applied when *assigning* shifts)
 *  - Preference             (per-user, per-week preference matrix)
 *  - DepartmentShiftSetup   (bundled fetch of employees + APLs + types)
 *
 * RBAC contract:
 *   - Reads: any user with SHIFTS_VIEW_OWN scoped to that department.
 *   - Writes: SHIFTS_MANAGE scoped to that department (matches the
 *     "מנהל מחלקה" rule — DEPARTMENT_ADMINs can manage their own dept,
 *     SYSTEM_ADMIN / IT_ADMIN can manage anywhere).
 */

import { ObjectId } from 'mongodb';
import { connectMongoDB } from '../config/mongodb';
import {
  requireAuth,
  requirePermissionForDept,
} from '../middleware/auth';
import { Permission } from '../rbac';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const COL = {
  apls: 'apls',
  shiftTypeDefs: 'shift_type_defs',
  shiftCategories: 'shift_categories',
  constraintRules: 'constraint_rules',
  schedulingRules: 'scheduling_rules',
  preferences: 'preferences',
  users: 'users',
  shifts: 'shifts',
} as const;

async function getDB() {
  return await connectMongoDB();
}

function objectIdOrThrow(id: string, label: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new Error(`Invalid ${label} id: ${id}`);
  }
  return new ObjectId(id);
}

/** Read access: SHIFTS_VIEW_OWN (or higher) for the dept. */
function checkReadDept(context: any, deptId: string) {
  // SHIFTS_VIEW_OWN is granted to all logged-in employees globally, so
  // requirePermissionForDept(SHIFTS_VIEW_OWN) effectively asserts auth + the
  // user is allowed to see that dept's reference data.
  requirePermissionForDept(context, Permission.SHIFTS_VIEW_OWN, deptId);
}

/** Write access: SHIFTS_MANAGE for the dept. */
function checkManageDept(context: any, deptId: string) {
  requirePermissionForDept(context, Permission.SHIFTS_MANAGE, deptId);
}

/** Resolve the department id of a doc by `id` (used by mutations on existing rows). */
async function deptIdFor(collection: string, id: string): Promise<string> {
  const db = await getDB();
  const doc = await db
    .collection(collection)
    .findOne({ _id: objectIdOrThrow(id, collection) }, { projection: { departmentId: 1 } });
  if (!doc?.departmentId) {
    throw new Error(`Document not found in ${collection}: ${id}`);
  }
  return String(doc.departmentId);
}

function toIso(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

export const shiftSetupResolvers = {
  Query: {
    // ---------- APLs ----------
    apls: async (_: any, args: { departmentId: string }, context: any) => {
      checkReadDept(context, args.departmentId);
      const db = await getDB();
      const docs = await db
        .collection(COL.apls)
        .find({ departmentId: args.departmentId })
        .sort({ order: 1, name: 1 })
        .toArray();
      return docs;
    },

    apl: async (_: any, args: { id: string }, context: any) => {
      requireAuth(context);
      const db = await getDB();
      const doc = await db.collection(COL.apls).findOne({ _id: objectIdOrThrow(args.id, 'APL') });
      if (!doc) return null;
      checkReadDept(context, String(doc.departmentId));
      return doc;
    },

    // ---------- ShiftTypeDef ----------
    shiftTypeDefs: async (_: any, args: { departmentId: string }, context: any) => {
      checkReadDept(context, args.departmentId);
      const db = await getDB();
      const docs = await db
        .collection(COL.shiftTypeDefs)
        .find({ departmentId: args.departmentId })
        .sort({ order: 1, name: 1 })
        .toArray();
      return docs;
    },

    shiftTypeDef: async (_: any, args: { id: string }, context: any) => {
      requireAuth(context);
      const db = await getDB();
      const doc = await db.collection(COL.shiftTypeDefs).findOne({ _id: objectIdOrThrow(args.id, 'ShiftTypeDef') });
      if (!doc) return null;
      checkReadDept(context, String(doc.departmentId));
      return doc;
    },

    // ---------- ShiftCategory ----------
    shiftCategories: async (_: any, args: { departmentId: string }, context: any) => {
      checkReadDept(context, args.departmentId);
      const db = await getDB();
      return await db
        .collection(COL.shiftCategories)
        .find({ departmentId: args.departmentId })
        .sort({ name: 1 })
        .toArray();
    },

    shiftCategory: async (_: any, args: { id: string }, context: any) => {
      requireAuth(context);
      const db = await getDB();
      const doc = await db
        .collection(COL.shiftCategories)
        .findOne({ _id: objectIdOrThrow(args.id, 'ShiftCategory') });
      if (!doc) return null;
      checkReadDept(context, String(doc.departmentId));
      return doc;
    },

    // ---------- ConstraintRule ----------
    constraintRules: async (_: any, args: { departmentId: string }, context: any) => {
      checkReadDept(context, args.departmentId);
      const db = await getDB();
      return await db
        .collection(COL.constraintRules)
        .find({ departmentId: args.departmentId })
        .sort({ name: 1 })
        .toArray();
    },

    // ---------- SchedulingRule ----------
    schedulingRules: async (_: any, args: { departmentId: string }, context: any) => {
      checkReadDept(context, args.departmentId);
      const db = await getDB();
      return await db
        .collection(COL.schedulingRules)
        .find({ departmentId: args.departmentId })
        .sort({ name: 1 })
        .toArray();
    },

    // ---------- Preferences ----------
    myPreferences: async (_: any, args: { weekStartDate: string }, context: any) => {
      const user = requireAuth(context);
      const db = await getDB();
      return await db.collection(COL.preferences).findOne({
        userId: user.userId,
        weekStartDate: args.weekStartDate,
      });
    },

    preferences: async (
      _: any,
      args: { departmentId: string; weekStartDate: string },
      context: any,
    ) => {
      // Reading other employees' preferences is a manager action.
      checkManageDept(context, args.departmentId);
      const db = await getDB();
      return await db
        .collection(COL.preferences)
        .find({
          departmentId: args.departmentId,
          weekStartDate: args.weekStartDate,
        })
        .toArray();
    },

    // ---------- Bundled setup ----------
    departmentShiftSetup: async (
      _: any,
      args: { departmentId: string },
      context: any,
    ) => {
      checkReadDept(context, args.departmentId);
      const db = await getDB();

      const [apls, shiftTypes] = await Promise.all([
        db.collection(COL.apls).find({ departmentId: args.departmentId }).sort({ order: 1 }).toArray(),
        db.collection(COL.shiftTypeDefs).find({ departmentId: args.departmentId }).sort({ order: 1 }).toArray(),
      ]);

      // Employees: members of this department. Departments stored on user doc.
      const employees = await db
        .collection(COL.users)
        .find({
          isActive: { $ne: false },
          'departments.departmentId': args.departmentId,
        })
        .sort({ firstName: 1, lastName: 1 })
        .toArray();

      return {
        departmentId: args.departmentId,
        apls,
        shiftTypes,
        employees,
      };
    },

    // ---------- AI suggestions (read-only projection) ----------
    aiScheduleSuggest: async (
      _: any,
      args: { input: any },
      context: any,
    ) => {
      // Implemented in aiSchedule.ts to keep this file focused on CRUD.
      const { aiScheduleSuggestImpl } = await import('./aiSchedule');
      return aiScheduleSuggestImpl(args.input, context);
    },
  },

  Mutation: {
    // ---------- APLs ----------
    createAPL: async (_: any, args: { input: any }, context: any) => {
      checkManageDept(context, args.input.departmentId);
      const db = await getDB();
      const now = new Date();
      const doc = {
        departmentId: String(args.input.departmentId),
        name: String(args.input.name),
        color: String(args.input.color || '#1890ff'),
        order: typeof args.input.order === 'number' ? args.input.order : 0,
        active: args.input.active !== false,
        eligibleUserIds: Array.isArray(args.input.eligibleUserIds)
          ? args.input.eligibleUserIds.map(String)
          : [],
        createdAt: now,
        updatedAt: now,
      };
      const result = await db.collection(COL.apls).insertOne(doc as any);
      return { ...doc, _id: result.insertedId };
    },

    updateAPL: async (_: any, args: { id: string; input: any }, context: any) => {
      const deptId = await deptIdFor(COL.apls, args.id);
      checkManageDept(context, deptId);
      const db = await getDB();
      const update: any = { updatedAt: new Date() };
      for (const key of ['name', 'color', 'order', 'active', 'eligibleUserIds'] as const) {
        if (args.input[key] !== undefined) update[key] = args.input[key];
      }
      await db
        .collection(COL.apls)
        .updateOne({ _id: objectIdOrThrow(args.id, 'APL') }, { $set: update });
      return await db.collection(COL.apls).findOne({ _id: objectIdOrThrow(args.id, 'APL') });
    },

    deleteAPL: async (_: any, args: { id: string }, context: any) => {
      const deptId = await deptIdFor(COL.apls, args.id);
      checkManageDept(context, deptId);
      const db = await getDB();
      const result = await db
        .collection(COL.apls)
        .deleteOne({ _id: objectIdOrThrow(args.id, 'APL') });
      return result.deletedCount > 0;
    },

    setUserAplMembership: async (
      _: any,
      args: { userId: string; departmentId: string; aplIds: string[] },
      context: any,
    ) => {
      checkManageDept(context, args.departmentId);
      const db = await getDB();
      const wantedIds = new Set(args.aplIds.map(String));
      const allDeptApls = await db
        .collection(COL.apls)
        .find({ departmentId: args.departmentId })
        .toArray();

      const now = new Date();
      const ops: Array<Promise<any>> = [];
      for (const apl of allDeptApls) {
        const aplIdStr = apl._id.toString();
        const eligible: string[] = (apl.eligibleUserIds || []).map(String);
        const isMember = eligible.includes(args.userId);
        const shouldBeMember = wantedIds.has(aplIdStr);
        if (isMember === shouldBeMember) continue;

        const op = shouldBeMember
          ? db.collection(COL.apls).updateOne(
              { _id: apl._id },
              { $addToSet: { eligibleUserIds: args.userId }, $set: { updatedAt: now } },
            )
          : db.collection(COL.apls).updateOne(
              { _id: apl._id },
              { $pull: { eligibleUserIds: args.userId } as any, $set: { updatedAt: now } },
            );
        ops.push(op);
      }
      await Promise.all(ops);

      return await db
        .collection(COL.apls)
        .find({ departmentId: args.departmentId })
        .sort({ order: 1, name: 1 })
        .toArray();
    },

    // ---------- ShiftTypeDef ----------
    createShiftTypeDef: async (_: any, args: { input: any }, context: any) => {
      checkManageDept(context, args.input.departmentId);
      const db = await getDB();
      const now = new Date();
      const doc = {
        departmentId: String(args.input.departmentId),
        name: String(args.input.name),
        startTime: String(args.input.startTime),
        endTime: String(args.input.endTime),
        role: args.input.role ?? null,
        color: args.input.color ?? null,
        order: typeof args.input.order === 'number' ? args.input.order : 0,
        active: args.input.active !== false,
        createdAt: now,
        updatedAt: now,
      };
      const result = await db.collection(COL.shiftTypeDefs).insertOne(doc as any);
      return { ...doc, _id: result.insertedId };
    },

    updateShiftTypeDef: async (_: any, args: { id: string; input: any }, context: any) => {
      const deptId = await deptIdFor(COL.shiftTypeDefs, args.id);
      checkManageDept(context, deptId);
      const db = await getDB();
      const update: any = { updatedAt: new Date() };
      for (const key of ['name', 'startTime', 'endTime', 'role', 'color', 'order', 'active'] as const) {
        if (args.input[key] !== undefined) update[key] = args.input[key];
      }
      await db
        .collection(COL.shiftTypeDefs)
        .updateOne({ _id: objectIdOrThrow(args.id, 'ShiftTypeDef') }, { $set: update });
      return await db
        .collection(COL.shiftTypeDefs)
        .findOne({ _id: objectIdOrThrow(args.id, 'ShiftTypeDef') });
    },

    deleteShiftTypeDef: async (_: any, args: { id: string }, context: any) => {
      const deptId = await deptIdFor(COL.shiftTypeDefs, args.id);
      checkManageDept(context, deptId);
      const db = await getDB();
      const result = await db
        .collection(COL.shiftTypeDefs)
        .deleteOne({ _id: objectIdOrThrow(args.id, 'ShiftTypeDef') });
      return result.deletedCount > 0;
    },

    reorderShiftTypeDefs: async (
      _: any,
      args: { departmentId: string; orderedIds: string[] },
      context: any,
    ) => {
      checkManageDept(context, args.departmentId);
      const db = await getDB();
      const ops = args.orderedIds.map((id, idx) =>
        db.collection(COL.shiftTypeDefs).updateOne(
          { _id: objectIdOrThrow(id, 'ShiftTypeDef'), departmentId: args.departmentId },
          { $set: { order: idx, updatedAt: new Date() } },
        ),
      );
      await Promise.all(ops);
      return await db
        .collection(COL.shiftTypeDefs)
        .find({ departmentId: args.departmentId })
        .sort({ order: 1 })
        .toArray();
    },

    // ---------- ShiftCategory ----------
    createShiftCategory: async (_: any, args: { input: any }, context: any) => {
      checkManageDept(context, args.input.departmentId);
      const db = await getDB();
      const now = new Date();
      const doc = {
        departmentId: String(args.input.departmentId),
        name: String(args.input.name),
        color: args.input.color ?? null,
        maxPerWeek: args.input.maxPerWeek ?? null,
        slots: Array.isArray(args.input.slots) ? args.input.slots : [],
        active: args.input.active !== false,
        createdAt: now,
        updatedAt: now,
      };
      const result = await db.collection(COL.shiftCategories).insertOne(doc as any);
      return { ...doc, _id: result.insertedId };
    },

    updateShiftCategory: async (_: any, args: { id: string; input: any }, context: any) => {
      const deptId = await deptIdFor(COL.shiftCategories, args.id);
      checkManageDept(context, deptId);
      const db = await getDB();
      const update: any = { updatedAt: new Date() };
      for (const key of ['name', 'color', 'maxPerWeek', 'slots', 'active'] as const) {
        if (args.input[key] !== undefined) update[key] = args.input[key];
      }
      await db
        .collection(COL.shiftCategories)
        .updateOne({ _id: objectIdOrThrow(args.id, 'ShiftCategory') }, { $set: update });
      return await db
        .collection(COL.shiftCategories)
        .findOne({ _id: objectIdOrThrow(args.id, 'ShiftCategory') });
    },

    deleteShiftCategory: async (_: any, args: { id: string }, context: any) => {
      const deptId = await deptIdFor(COL.shiftCategories, args.id);
      checkManageDept(context, deptId);
      const db = await getDB();
      const result = await db
        .collection(COL.shiftCategories)
        .deleteOne({ _id: objectIdOrThrow(args.id, 'ShiftCategory') });
      return result.deletedCount > 0;
    },

    // ---------- ConstraintRule ----------
    createConstraintRule: async (_: any, args: { input: any }, context: any) => {
      checkManageDept(context, args.input.departmentId);
      const db = await getDB();
      const now = new Date();
      const doc = {
        departmentId: String(args.input.departmentId),
        name: String(args.input.name),
        type: String(args.input.type),
        value: args.input.value ?? null,
        active: args.input.active !== false,
        createdAt: now,
        updatedAt: now,
      };
      const result = await db.collection(COL.constraintRules).insertOne(doc as any);
      return { ...doc, _id: result.insertedId };
    },

    updateConstraintRule: async (_: any, args: { id: string; input: any }, context: any) => {
      const deptId = await deptIdFor(COL.constraintRules, args.id);
      checkManageDept(context, deptId);
      const db = await getDB();
      const update: any = { updatedAt: new Date() };
      for (const key of ['name', 'type', 'value', 'active'] as const) {
        if (args.input[key] !== undefined) update[key] = args.input[key];
      }
      await db
        .collection(COL.constraintRules)
        .updateOne({ _id: objectIdOrThrow(args.id, 'ConstraintRule') }, { $set: update });
      return await db
        .collection(COL.constraintRules)
        .findOne({ _id: objectIdOrThrow(args.id, 'ConstraintRule') });
    },

    deleteConstraintRule: async (_: any, args: { id: string }, context: any) => {
      const deptId = await deptIdFor(COL.constraintRules, args.id);
      checkManageDept(context, deptId);
      const db = await getDB();
      const result = await db
        .collection(COL.constraintRules)
        .deleteOne({ _id: objectIdOrThrow(args.id, 'ConstraintRule') });
      return result.deletedCount > 0;
    },

    // ---------- SchedulingRule ----------
    createSchedulingRule: async (_: any, args: { input: any }, context: any) => {
      checkManageDept(context, args.input.departmentId);
      const db = await getDB();
      const now = new Date();
      const doc = {
        departmentId: String(args.input.departmentId),
        name: String(args.input.name),
        active: args.input.active !== false,
        maxDaysPerWeek: args.input.maxDaysPerWeek ?? null,
        maxConsecutiveDays: args.input.maxConsecutiveDays ?? null,
        maxShiftsOfTypePerWeek: args.input.maxShiftsOfTypePerWeek ?? null,
        shiftTypeId: args.input.shiftTypeId ?? null,
        maxConsecutiveShiftsOfType: args.input.maxConsecutiveShiftsOfType ?? null,
        categoryId: args.input.categoryId ?? null,
        maxCategorySlotsPerWeek: args.input.maxCategorySlotsPerWeek ?? null,
        createdAt: now,
        updatedAt: now,
      };
      const result = await db.collection(COL.schedulingRules).insertOne(doc as any);
      return { ...doc, _id: result.insertedId };
    },

    updateSchedulingRule: async (_: any, args: { id: string; input: any }, context: any) => {
      const deptId = await deptIdFor(COL.schedulingRules, args.id);
      checkManageDept(context, deptId);
      const db = await getDB();
      const update: any = { updatedAt: new Date() };
      const keys = [
        'name',
        'active',
        'maxDaysPerWeek',
        'maxConsecutiveDays',
        'maxShiftsOfTypePerWeek',
        'shiftTypeId',
        'maxConsecutiveShiftsOfType',
        'categoryId',
        'maxCategorySlotsPerWeek',
      ] as const;
      for (const key of keys) {
        if (args.input[key] !== undefined) update[key] = args.input[key];
      }
      await db
        .collection(COL.schedulingRules)
        .updateOne({ _id: objectIdOrThrow(args.id, 'SchedulingRule') }, { $set: update });
      return await db
        .collection(COL.schedulingRules)
        .findOne({ _id: objectIdOrThrow(args.id, 'SchedulingRule') });
    },

    deleteSchedulingRule: async (_: any, args: { id: string }, context: any) => {
      const deptId = await deptIdFor(COL.schedulingRules, args.id);
      checkManageDept(context, deptId);
      const db = await getDB();
      const result = await db
        .collection(COL.schedulingRules)
        .deleteOne({ _id: objectIdOrThrow(args.id, 'SchedulingRule') });
      return result.deletedCount > 0;
    },

    // ---------- Preferences ----------
    submitPreferences: async (_: any, args: { input: any }, context: any) => {
      const user = requireAuth(context);
      // Submitting one's OWN preferences uses SHIFTS_VIEW_OWN within the dept.
      checkReadDept(context, args.input.departmentId);
      const db = await getDB();

      const filter = {
        userId: user.userId,
        weekStartDate: args.input.weekStartDate,
        departmentId: args.input.departmentId,
      };
      const now = new Date();
      const update: any = {
        $set: {
          ...filter,
          entries: Array.isArray(args.input.entries) ? args.input.entries : [],
          submittedAt: now,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      };
      await db.collection(COL.preferences).updateOne(filter, update, { upsert: true });
      return await db.collection(COL.preferences).findOne(filter);
    },

    // ---------- Apply AI suggestions in bulk ----------
    applyAiSuggestions: async (_: any, args: { input: any }, context: any) => {
      checkManageDept(context, args.input.departmentId);
      const { applyAiSuggestionsImpl } = await import('./aiSchedule');
      return applyAiSuggestionsImpl(args.input, context);
    },
  },

  // ---------------------------------------------------------------------------
  // Type field resolvers — mainly to coerce Mongo `_id` to GraphQL `id`.
  // ---------------------------------------------------------------------------

  APL: {
    id: (parent: any) => parent._id?.toString?.() || parent.id,
    eligibleUserIds: (parent: any) =>
      Array.isArray(parent.eligibleUserIds) ? parent.eligibleUserIds.map(String) : [],
  },

  ShiftTypeDef: {
    id: (parent: any) => parent._id?.toString?.() || parent.id,
  },

  ShiftCategory: {
    id: (parent: any) => parent._id?.toString?.() || parent.id,
    slots: (parent: any) => (Array.isArray(parent.slots) ? parent.slots : []),
  },

  ConstraintRule: {
    id: (parent: any) => parent._id?.toString?.() || parent.id,
  },

  SchedulingRule: {
    id: (parent: any) => parent._id?.toString?.() || parent.id,
  },

  Preference: {
    id: (parent: any) => parent._id?.toString?.() || parent.id,
    submittedAt: (parent: any) => toIso(parent.submittedAt),
    user: async (parent: any) => {
      if (!parent.userId) return null;
      const db = await getDB();
      try {
        const u = await db
          .collection(COL.users)
          .findOne({ _id: objectIdOrThrow(parent.userId, 'user') });
        if (!u) return null;
        return {
          ...u,
          id: u._id.toString(),
          displayName:
            u.displayName ||
            `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
            u.email,
        };
      } catch {
        return null;
      }
    },
    entries: (parent: any) => (Array.isArray(parent.entries) ? parent.entries : []),
  },

  DepartmentShiftSetup: {
    employees: (parent: any) =>
      (parent.employees || []).map((u: any) => ({
        ...u,
        id: u._id?.toString?.() || u.id,
        displayName:
          u.displayName ||
          `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
          u.email,
      })),
    apls: (parent: any) => parent.apls || [],
    shiftTypes: (parent: any) => parent.shiftTypes || [],
  },
};

export { COL };
