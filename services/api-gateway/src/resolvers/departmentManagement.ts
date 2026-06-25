import mongoose from 'mongoose';
import { connectMongoose } from '../config/mongodb';
import { Department, IDepartment, IDepartmentRole } from '../models/department.models';
import {
  AssignmentFormConfig,
  AssignmentPreset,
  IAssignmentFormConfig,
  IAssignmentPreset,
} from '../models/assignmentForm.models';
import { requireAuth, requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';
import { reloadDepartmentRoleRegistry } from '../services/departmentRegistry';

let mongooseConnected = false;
async function ensureMongoConnection() {
  if (!mongooseConnected) {
    await connectMongoose();
    mongooseConnected = true;
  }
}

function toDepartmentDoc(doc: any) {
  if (!doc) return null;
  const code = doc.code ? String(doc.code) : (doc._id ? String(doc._id) : null);
  const now = new Date();
  return {
    id: code || doc._id?.toString() || '',
    name: doc.name ? String(doc.name) : (code || 'Unknown'),
    hebrewName: doc.hebrewName ?? null,
    code,
    createdAt: doc.createdAt || now,
    category: doc.category ? String(doc.category) : 'General',
    // legacy `roles` (string array of role names) — kept for compatibility
    roles: Array.isArray(doc.roles)
      ? doc.roles
          .map((r: any) => (typeof r === 'string' ? r : r?.name))
          .filter(Boolean)
      : [],
    description: doc.description ?? null,
    isActive: doc.isActive !== false,
    updatedAt: doc.updatedAt || doc.createdAt || now,
    departmentRoles: Array.isArray(doc.roles)
      ? doc.roles
          .filter((r: any) => r && typeof r === 'object' && r.key)
          .map((r: any): IDepartmentRole => ({
            key: String(r.key),
            name: String(r.name || r.key),
            hebrewName: r.hebrewName ?? null,
            description: r.description ?? null,
            permissions: Array.isArray(r.permissions) ? r.permissions : [],
            order: typeof r.order === 'number' ? r.order : 0,
            isActive: r.isActive !== false,
          }))
      : [],
    includesDepartmentCodes: Array.isArray(doc.includesDepartmentCodes)
      ? doc.includesDepartmentCodes
      : [],
    permissions: Array.isArray(doc.permissions) ? doc.permissions : [],
  };
}

function toFormConfigDoc(doc: any) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: obj._id?.toString() || obj.id,
    formKey: obj.formKey,
    name: obj.name,
    hebrewName: obj.hebrewName ?? null,
    description: obj.description ?? null,
    departments: Array.isArray(obj.departments) ? obj.departments : [],
    columns: Array.isArray(obj.columns)
      ? obj.columns.map((c: any, i: number) => ({
          key: c.key,
          hebrewLabel: c.hebrewLabel,
          englishLabel: c.englishLabel ?? null,
          allowedDepartmentCodes: Array.isArray(c.allowedDepartmentCodes)
            ? c.allowedDepartmentCodes
            : [],
          allowedUserIds: Array.isArray(c.allowedUserIds) ? c.allowedUserIds : [],
          requireUser: !!c.requireUser,
          defaultCount: typeof c.defaultCount === 'number' ? c.defaultCount : 1,
          order: typeof c.order === 'number' ? c.order : i,
        }))
      : [],
    roleScopes: Array.isArray(obj.roleScopes)
      ? obj.roleScopes.map((r: any) => ({
          departmentCode: r.departmentCode,
          roleKey: r.roleKey,
          roleLabel: r.roleLabel ?? null,
          scope: r.scope || 'broadcastArray',
        }))
      : [],
    specialRoles: Array.isArray(obj.specialRoles) ? obj.specialRoles : [],
    allowUserPresets: obj.allowUserPresets !== false,
    isActive: obj.isActive !== false,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function toPresetDoc(doc: any) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: obj._id?.toString() || obj.id,
    formKey: obj.formKey,
    name: obj.name,
    description: obj.description ?? null,
    tags: Array.isArray(obj.tags) ? obj.tags : [],
    jobs: Array.isArray(obj.jobs) ? obj.jobs : [],
    isDefault: obj.isDefault === true,
    isShared: obj.isShared !== false,
    createdBy: obj.createdBy ? String(obj.createdBy) : null,
    createdByName: obj.createdByName ?? null,
    isActive: obj.isActive !== false,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function getActorId(context: any): string | null {
  return context?.user?.userId || context?.user?.id || null;
}

function getActorName(context: any): string | null {
  const u = context?.user;
  if (!u) return null;
  return u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || null;
}

function canManageDepartments(context: any): boolean {
  const user = context?.user;
  if (!user) return false;
  if (typeof user.has === 'function') {
    return (
      user.has(Permission.SETTINGS_MANAGE) ||
      user.has(Permission.ROLE_TEMPLATES_MANAGE)
    );
  }
  return user.systemRole === 'SYSTEM_ADMIN' || user.systemRole === 'IT_ADMIN';
}

export const departmentManagementResolvers = {
  Query: {
    department: async (_: any, { code }: { code: string }, context: any) => {
      requireAuth(context);
      await ensureMongoConnection();
      const doc = await Department.findOne({ code }).lean();
      return toDepartmentDoc(doc);
    },

    departmentById: async (_: any, { id }: { id: string }, context: any) => {
      requireAuth(context);
      await ensureMongoConnection();
      let doc: any = null;
      if (mongoose.isValidObjectId(id)) {
        doc = await Department.findById(id).lean();
      }
      if (!doc) {
        // also accept code in this getter for convenience
        doc = await Department.findOne({ code: id }).lean();
      }
      return toDepartmentDoc(doc);
    },

    assignmentFormConfigs: async (_: any, __: any, context: any) => {
      requireAuth(context);
      await ensureMongoConnection();
      const docs = await AssignmentFormConfig.find().sort({ name: 1 }).lean();
      return docs.map((d) => toFormConfigDoc(d));
    },

    assignmentFormConfig: async (_: any, { formKey }: { formKey: string }, context: any) => {
      requireAuth(context);
      await ensureMongoConnection();
      const doc = await AssignmentFormConfig.findOne({ formKey }).lean();
      return toFormConfigDoc(doc);
    },

    assignmentPresets: async (_: any, { formKey }: { formKey: string }, context: any) => {
      requireAuth(context);
      await ensureMongoConnection();
      const docs = await AssignmentPreset.find({ formKey, isActive: { $ne: false } })
        .sort({ isDefault: -1, name: 1 })
        .lean();
      return docs.map((d) => toPresetDoc(d));
    },

    assignmentPreset: async (_: any, { id }: { id: string }, context: any) => {
      requireAuth(context);
      await ensureMongoConnection();
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await AssignmentPreset.findById(id).lean();
      return toPresetDoc(doc);
    },
  },

  Mutation: {
    // ---- Department CRUD ----
    createDepartment: async (_: any, { input }: { input: any }, context: any) => {
      requireAuth(context);
      if (!canManageDepartments(context)) {
        throw new Error('Forbidden: department management requires admin permissions');
      }
      await ensureMongoConnection();

      const code = String(input.code || '').trim();
      if (!code) throw new Error('Department code is required');
      const existing = await Department.findOne({ code });
      if (existing) throw new Error(`Department with code "${code}" already exists`);

      const actorId = getActorId(context);
      const dept = new Department({
        code,
        name: input.name,
        hebrewName: input.hebrewName,
        category: input.category || 'General',
        description: input.description,
        roles: Array.isArray(input.roles) ? input.roles : [],
        includesDepartmentCodes: Array.isArray(input.includesDepartmentCodes)
          ? input.includesDepartmentCodes
          : [],
        permissions: Array.isArray(input.permissions) ? input.permissions : [],
        isActive: input.isActive !== false,
        createdBy: actorId && mongoose.isValidObjectId(actorId) ? new mongoose.Types.ObjectId(actorId) : undefined,
      });
      await dept.save();
      reloadDepartmentRoleRegistry().catch(() => {});
      return toDepartmentDoc(dept.toObject());
    },

    updateDepartment: async (_: any, { code, input }: { code: string; input: any }, context: any) => {
      requireAuth(context);
      if (!canManageDepartments(context)) {
        throw new Error('Forbidden: department management requires admin permissions');
      }
      await ensureMongoConnection();

      const actorId = getActorId(context);
      const update: any = {};
      const fields = [
        'name',
        'hebrewName',
        'category',
        'description',
        'roles',
        'includesDepartmentCodes',
        'permissions',
        'isActive',
      ];
      for (const f of fields) {
        if (input[f] !== undefined) update[f] = input[f];
      }
      if (actorId && mongoose.isValidObjectId(actorId)) {
        update.updatedBy = new mongoose.Types.ObjectId(actorId);
      }
      const doc = await Department.findOneAndUpdate({ code }, update, { new: true }).lean();
      if (!doc) throw new Error('Department not found');
      reloadDepartmentRoleRegistry().catch(() => {});
      return toDepartmentDoc(doc);
    },

    deleteDepartment: async (_: any, { code }: { code: string }, context: any) => {
      requireAuth(context);
      if (!canManageDepartments(context)) {
        throw new Error('Forbidden: department management requires admin permissions');
      }
      await ensureMongoConnection();
      // Soft delete to avoid breaking historical user/department references.
      const result = await Department.findOneAndUpdate({ code }, { isActive: false }, { new: true });
      if (result) reloadDepartmentRoleRegistry().catch(() => {});
      return !!result;
    },

    // ---- Form configuration ----
    upsertAssignmentFormConfig: async (_: any, { input }: { input: any }, context: any) => {
      requireAuth(context);
      if (!canManageDepartments(context)) {
        throw new Error('Forbidden: form configuration requires admin permissions');
      }
      await ensureMongoConnection();
      const actorId = getActorId(context);
      const update: any = {
        formKey: input.formKey,
        name: input.name,
        hebrewName: input.hebrewName,
        description: input.description,
        departments: Array.isArray(input.departments) ? input.departments : [],
        columns: Array.isArray(input.columns)
          ? input.columns.map((c: any, i: number) => ({
              key: String(c.key || '').trim(),
              hebrewLabel: String(c.hebrewLabel || '').trim(),
              englishLabel: c.englishLabel ? String(c.englishLabel).trim() : undefined,
              allowedDepartmentCodes: Array.isArray(c.allowedDepartmentCodes)
                ? c.allowedDepartmentCodes
                : [],
              allowedUserIds: Array.isArray(c.allowedUserIds) ? c.allowedUserIds : [],
              requireUser: !!c.requireUser,
              defaultCount: typeof c.defaultCount === 'number' ? c.defaultCount : 1,
              order: typeof c.order === 'number' ? c.order : i,
            }))
          : [],
        allowUserPresets: input.allowUserPresets !== false,
        isActive: input.isActive !== false,
      };
      if (Array.isArray(input.roleScopes)) {
        update.roleScopes = input.roleScopes
          .filter((r: any) => r && r.departmentCode && r.roleKey)
          .map((r: any) => ({
            departmentCode: String(r.departmentCode).trim(),
            roleKey: String(r.roleKey).trim(),
            roleLabel: r.roleLabel ? String(r.roleLabel).trim() : undefined,
            scope: ['broadcastArray', 'externalBroadcasts', 'both'].includes(r.scope)
              ? r.scope
              : 'broadcastArray',
          }));
      }
      if (Array.isArray(input.specialRoles)) {
        update.specialRoles = input.specialRoles
          .map((s: any) => String(s || '').trim())
          .filter((s: string) => s.length > 0);
      }
      if (actorId && mongoose.isValidObjectId(actorId)) {
        update.updatedBy = new mongoose.Types.ObjectId(actorId);
      }
      const doc = await AssignmentFormConfig.findOneAndUpdate(
        { formKey: input.formKey },
        update,
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();
      return toFormConfigDoc(doc);
    },

    deleteAssignmentFormConfig: async (_: any, { formKey }: { formKey: string }, context: any) => {
      requireAuth(context);
      if (!canManageDepartments(context)) {
        throw new Error('Forbidden: form configuration requires admin permissions');
      }
      await ensureMongoConnection();
      const result = await AssignmentFormConfig.findOneAndDelete({ formKey });
      return !!result;
    },

    // ---- Assignment presets (shared) ----
    createAssignmentPreset: async (_: any, { input }: { input: any }, context: any) => {
      requireAuth(context);
      // Anyone allowed to manage broadcasts can create shared presets.
      requirePermission(context, Permission.BROADCAST_VIEW);
      await ensureMongoConnection();
      const actorId = getActorId(context);
      const doc = new AssignmentPreset({
        formKey: input.formKey,
        name: input.name,
        description: input.description,
        tags: Array.isArray(input.tags) ? input.tags : [],
        jobs: Array.isArray(input.jobs) ? input.jobs : [],
        isDefault: input.isDefault === true,
        isShared: input.isShared !== false,
        createdBy: actorId && mongoose.isValidObjectId(actorId) ? new mongoose.Types.ObjectId(actorId) : undefined,
        createdByName: getActorName(context),
        isActive: true,
      });
      await doc.save();
      return toPresetDoc(doc.toObject());
    },

    updateAssignmentPreset: async (_: any, { id, input }: { id: string; input: any }, context: any) => {
      requireAuth(context);
      requirePermission(context, Permission.BROADCAST_VIEW);
      await ensureMongoConnection();
      if (!mongoose.isValidObjectId(id)) throw new Error('Invalid preset id');
      const existing = await AssignmentPreset.findById(id);
      if (!existing) throw new Error('Preset not found');

      const actorId = getActorId(context);
      const isAdmin = canManageDepartments(context);
      const isOwner = actorId && existing.createdBy && existing.createdBy.toString() === actorId;
      if (!isAdmin && !isOwner) {
        throw new Error('Forbidden: you can only edit presets you created (admins can edit any)');
      }

      const fields = ['name', 'description', 'tags', 'jobs', 'isDefault', 'isShared', 'isActive'];
      for (const f of fields) {
        if (input[f] !== undefined) (existing as any)[f] = input[f];
      }
      if (actorId && mongoose.isValidObjectId(actorId)) {
        (existing as any).updatedBy = new mongoose.Types.ObjectId(actorId);
      }
      await existing.save();
      return toPresetDoc(existing.toObject());
    },

    deleteAssignmentPreset: async (_: any, { id }: { id: string }, context: any) => {
      requireAuth(context);
      requirePermission(context, Permission.BROADCAST_VIEW);
      await ensureMongoConnection();
      if (!mongoose.isValidObjectId(id)) throw new Error('Invalid preset id');
      const existing = await AssignmentPreset.findById(id);
      if (!existing) return false;

      const actorId = getActorId(context);
      const isAdmin = canManageDepartments(context);
      const isOwner = actorId && existing.createdBy && existing.createdBy.toString() === actorId;
      if (!isAdmin && !isOwner) {
        throw new Error('Forbidden: you can only delete presets you created (admins can delete any)');
      }
      await AssignmentPreset.deleteOne({ _id: id });
      return true;
    },
  },
};
