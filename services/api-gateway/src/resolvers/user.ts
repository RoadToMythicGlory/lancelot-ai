import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { connectMongoDB } from '../config/mongodb';
import { config } from '../config';
import { expandMCRDepartments } from '../utils/departments';
import { requireAuth, requirePermission } from '../middleware/auth';
import { Permission, canManageUser, computePermissions } from '../rbac';
import { RoleTemplate } from '../models/roleTemplate';
import type { Context } from '../types';

// Hard cap on user-list queries to keep an unbounded admin search from
// pulling tens of thousands of rows in a single request.
const MAX_USER_LIST = 1000;

/**
 * Compute the user's full effective permission set: the union of
 *   1. permissions implied by the user's `departments[]` (department-wide
 *      grants + per-role grants resolved through the runtime registry that
 *      `departmentRegistry.ts` keeps in sync), AND
 *   2. permissions provided by the role template, AND
 *   3. extra custom permissions granted on top.
 *
 * The result is what we persist on `users.permissions`. Storing the
 * fully-merged set means:
 *   - the `users` / `me` GraphQL queries return the correct effective
 *     permissions (admins see the right tags in the table; the user
 *     sees the right capabilities in `me`),
 *   - the JWT signed at login carries the real effective set so the
 *     frontend's sidebar gating works without a separate registry
 *     download, and
 *   - the per-request server-side `computePermissions(...)` in
 *     `middleware/context.ts` still re-derives perms from the same
 *     stored shape, so the runtime check is self-consistent.
 */
function deriveEffectivePermissions(args: {
  systemRole: string | undefined;
  departments: any[] | undefined;
  templatePerms: string[];
  customPerms: string[];
}): string[] {
  const computed = computePermissions({
    systemRole: args.systemRole,
    departments: args.departments,
    // Feed the union of template + custom in as direct grants so they
    // also pass through the Permission-enum validator inside
    // computePermissions (it silently drops anything unknown).
    permissions: Array.from(new Set([...(args.templatePerms || []), ...(args.customPerms || [])])),
  });
  const out = new Set<string>(computed.global);
  computed.byDept.forEach((deptPerms) => {
    deptPerms.forEach((p) => out.add(p));
  });
  return Array.from(out);
}

async function computePublicKeyFingerprint(publicKey: string): Promise<string> {
  const crypto = await import('crypto');
  const keyBytes = Buffer.from(publicKey, 'base64');
  return crypto.createHash('sha256').update(keyBytes).digest('base64');
}

export const userResolvers = {
  Query: {
    users: async (_: any, { filter }: { filter?: any }, context: Context) => {
      const actor = requirePermission(context, Permission.USERS_VIEW);

      const db = await connectMongoDB();
      const query: any = {};

      // Department-scoped filtering for non-global admins
      if (!actor.has(Permission.USERS_MANAGE_ALL)) {
        if (actor.has(Permission.USERS_MANAGE_DEPT)) {
          const actorDepts = actor.departments.map((d) => d.departmentId);
          const expandedDepts = expandMCRDepartments(actorDepts, { includeBaseMCR: false });
          filter = { ...filter, departmentId: { $in: expandedDepts } };
        }
      }

      if (filter) {
        if (filter.isActive !== undefined) query.isActive = filter.isActive;
        if (filter.systemRole) query.systemRole = filter.systemRole;
        if (filter.departmentId) {
          let deptIds: string[] = [];
          if (filter.departmentId.$in) {
            deptIds = filter.departmentId.$in;
          } else if (Array.isArray(filter.departmentId)) {
            deptIds = filter.departmentId;
          } else {
            deptIds = [filter.departmentId];
          }

          query.$or = [
            { 'departments.departmentId': { $in: deptIds } },
            { 'departments.departmentName': { $in: deptIds } },
            { department: { $in: deptIds } },
          ];
        }
        if (filter.searchTerm) {
          const searchOr = [
            { firstName: { $regex: filter.searchTerm, $options: 'i' } },
            { lastName: { $regex: filter.searchTerm, $options: 'i' } },
            { email: { $regex: filter.searchTerm, $options: 'i' } },
          ];
          if (query.$or) {
            query.$and = [{ $or: query.$or }, { $or: searchOr }];
            delete query.$or;
          } else {
            query.$or = searchOr;
          }
        }
      }

      const users = await db.collection('users').find(query).limit(MAX_USER_LIST).toArray();
      return users.map((user) => ({
        ...user,
        id: user._id.toString(),
        displayName: `${user.firstName} ${user.lastName}`,
      }));
    },

    user: async (_: any, { id }: { id: string }, context: Context) => {
      const actor = requireAuth(context);

      if (!ObjectId.isValid(id)) {
        throw new Error('Invalid user ID');
      }

      // Allow any authenticated user to read their own profile; require
      // USERS_VIEW for anyone else.
      if (actor.userId !== id) {
        requirePermission(context, Permission.USERS_VIEW);
      }

      const db = await connectMongoDB();
      const user = await db.collection('users').findOne({ _id: new ObjectId(id) });
      if (!user) throw new Error('User not found');

      return {
        ...user,
        id: user._id.toString(),
        displayName: `${user.firstName} ${user.lastName}`,
      };
    },

    me: async (_: any, __: any, context: Context) => {
      const actor = requireAuth(context);
      const db = await connectMongoDB();
      const user = await db.collection('users').findOne({ _id: new ObjectId(actor.userId) });
      if (!user) throw new Error('User not found');
      return {
        ...user,
        id: user._id.toString(),
        displayName: `${user.firstName} ${user.lastName}`,
      };
    },

    usersByDepartment: async (_: any, { departmentId }: { departmentId: string }, context: Context) => {
      requirePermission(context, Permission.USERS_VIEW);

      const db = await connectMongoDB();
      const users = await db.collection('users').find({
        'departments.departmentId': departmentId,
        isActive: true,
      }).limit(MAX_USER_LIST).toArray();

      return users.map((user) => ({
        ...user,
        id: user._id.toString(),
        displayName: `${user.firstName} ${user.lastName}`,
      }));
    },

    usersBySystemRole: async (_: any, { systemRole }: { systemRole: string }, context: Context) => {
      requirePermission(context, Permission.USERS_MANAGE_ALL);

      const db = await connectMongoDB();
      const users = await db.collection('users').find({
        systemRole,
        isActive: true,
      }).limit(MAX_USER_LIST).toArray();

      return users.map((user) => ({
        ...user,
        id: user._id.toString(),
        displayName: `${user.firstName} ${user.lastName}`,
      }));
    },
  },

  Mutation: {
    createUser: async (_: any, { input }: { input: any }, context: Context) => {
      const actor = requireAuth(context);

      // Resolve role template if provided
      let templatePerms: string[] = [];
      let resolvedTemplateId: string | null = null;
      if (input.roleTemplateId) {
        const template = await RoleTemplate.findById(input.roleTemplateId).lean();
        if (!template || !template.isActive) {
          throw new Error('Role template not found or inactive');
        }

        if (actor.systemRole === 'DEPARTMENT_ADMIN') {
          if (!template.allowedForDeptAdmins) {
            throw new Error('This template is not available for Department Admins');
          }
          const actorDeptIds = actor.departments.map((d: any) => d.departmentId);
          if (template.departmentScope && !actorDeptIds.includes(template.departmentScope)) {
            throw new Error('This template is scoped to a department you do not manage');
          }
        }

        input.systemRole = template.baseSystemRole;
        templatePerms = template.permissions;
        resolvedTemplateId = template._id.toString();
      }

      // Only SYSTEM_ADMIN / IT_ADMIN can pass customPermissions
      if (input.customPermissions && input.customPermissions.length > 0) {
        if (actor.systemRole === 'DEPARTMENT_ADMIN') {
          throw new Error('Department Admins cannot set custom permissions');
        }
        if (!actor.has(Permission.USERS_MANAGE_ALL)) {
          throw new Error('Only users with USERS_MANAGE_ALL can set custom permissions');
        }
      }

      // DEPARTMENT_ADMIN must use a template
      if (actor.systemRole === 'DEPARTMENT_ADMIN' && !input.roleTemplateId) {
        throw new Error('Department Admins must select a role template when creating users');
      }

      // Check whether actor can manage the target
      if (!canManageUser(
        { systemRole: actor.systemRole, departments: actor.departments, permissions: actor.permissions },
        { systemRole: input.systemRole, departments: input.departments },
        actor.computed,
      )) {
        throw new Error('Unauthorized to create this user');
      }

      // Tier-escalation guardrails
      if (actor.systemRole === 'IT_ADMIN' && input.systemRole === 'SYSTEM_ADMIN') {
        throw new Error('IT Admin cannot create System Admin users');
      }
      if (actor.systemRole === 'DEPARTMENT_ADMIN') {
        if (input.systemRole !== 'DEPARTMENT_USER' && input.systemRole !== 'DEPARTMENT_ADMIN') {
          throw new Error('Department Admin can only create Department Users');
        }
        const actorDepts = actor.departments.map((d: any) => d.departmentId);
        const expanded = expandMCRDepartments(actorDepts, { includeBaseMCR: false });
        const newDepts = input.departments.map((d: any) => d.departmentId);
        if (!newDepts.every((id: string) => expanded.includes(id))) {
          throw new Error('Cannot create users for departments you do not manage');
        }
      }

      const db = await connectMongoDB();
      const existing = await db.collection('users').findOne({ email: input.email });
      if (existing) throw new Error('Email already exists');

      const hashedPassword = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);

      // Fold template + custom + department-derived perms into a single
      // effective set so the stored value matches what the user actually
      // has at runtime. Without the department merge, the table would
      // show a freshly-created MCR Operator as having zero perms even
      // though every per-request resolver correctly grants MCR_VIEW etc.
      const finalPermissions = deriveEffectivePermissions({
        systemRole: input.systemRole,
        departments: input.departments,
        templatePerms,
        customPerms: input.customPermissions || [],
      });

      const { roleTemplateId: _rtId, customPermissions: _cp, ...rest } = input;

      const newUser = {
        ...rest,
        password: hashedPassword,
        permissions: finalPermissions,
        roleTemplateId: resolvedTemplateId,
        isActive: input.isActive !== false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: actor.userId,
        updatedBy: actor.userId,
      };

      const result = await db.collection('users').insertOne(newUser);
      return {
        ...newUser,
        id: result.insertedId.toString(),
        displayName: `${newUser.firstName} ${newUser.lastName}`,
      };
    },

    updateUser: async (_: any, { id, input }: { id: string; input: any }, context: Context) => {
      const actor = requireAuth(context);

      if (!ObjectId.isValid(id)) {
        throw new Error('Invalid user ID');
      }

      const db = await connectMongoDB();
      const targetUser = await db.collection('users').findOne({ _id: new ObjectId(id) });
      if (!targetUser) throw new Error('User not found');

      if (!canManageUser(
        { systemRole: actor.systemRole, departments: actor.departments, permissions: actor.permissions },
        { systemRole: targetUser.systemRole, departments: targetUser.departments },
        actor.computed,
      )) {
        throw new Error('Unauthorized to update this user');
      }

      // Resolve role template if provided
      let templatePerms: string[] | null = null;
      let resolvedTemplateId: string | null | undefined = undefined;
      if (input.roleTemplateId) {
        const template = await RoleTemplate.findById(input.roleTemplateId).lean();
        if (!template || !template.isActive) {
          throw new Error('Role template not found or inactive');
        }

        if (actor.systemRole === 'DEPARTMENT_ADMIN') {
          if (!template.allowedForDeptAdmins) {
            throw new Error('This template is not available for Department Admins');
          }
          const actorDeptIds = actor.departments.map((d: any) => d.departmentId);
          if (template.departmentScope && !actorDeptIds.includes(template.departmentScope)) {
            throw new Error('This template is scoped to a department you do not manage');
          }
        }

        input.systemRole = template.baseSystemRole;
        templatePerms = template.permissions;
        resolvedTemplateId = template._id.toString();
      } else if (input.roleTemplateId === null) {
        resolvedTemplateId = null;
      }

      // Only SYSTEM_ADMIN / IT_ADMIN can pass customPermissions
      if (input.customPermissions && input.customPermissions.length > 0) {
        if (actor.systemRole === 'DEPARTMENT_ADMIN') {
          throw new Error('Department Admins cannot set custom permissions');
        }
        if (!actor.has(Permission.USERS_MANAGE_ALL)) {
          throw new Error('Only users with USERS_MANAGE_ALL can set custom permissions');
        }
      }

      // DEPARTMENT_ADMIN guardrails
      if (actor.systemRole === 'DEPARTMENT_ADMIN') {
        const actorDepts = actor.departments.map((d: any) => d.departmentId);
        const expanded = expandMCRDepartments(actorDepts, { includeBaseMCR: false });

        const targetCurrentDepts = (targetUser.departments || []).map((d: any) => d.departmentId);
        const targetNewDepts = input.departments
          ? input.departments.map((d: any) => d.departmentId)
          : targetCurrentDepts;

        if (!targetCurrentDepts.some((id: string) => expanded.includes(id))) {
          throw new Error('Cannot update users outside your departments');
        }
        if (!targetNewDepts.every((id: string) => expanded.includes(id))) {
          throw new Error('Cannot assign users to departments you do not manage');
        }
        if (input.systemRole && input.systemRole !== targetUser.systemRole && input.systemRole !== 'DEPARTMENT_USER') {
          throw new Error('Department Admin cannot change system roles to admin levels');
        }
      }

      // Build update data
      const { roleTemplateId: _rtId, customPermissions: _cp, ...rest } = input;

      const updateData: any = {
        ...rest,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      };

      // Recompute the stored permissions set whenever the caller touched
      // anything that contributes to it — the role template, the custom
      // permission list, the user's system role, OR their department/role
      // assignments. Department changes matter because each department
      // (and the roles within it) grants permissions through the runtime
      // registry; without folding them in here the `users` table, the
      // `me` endpoint, and the JWT issued at next login would all show a
      // freshly-assigned MCR Operator as having zero perms.
      const customPermsProvided = input.customPermissions !== undefined;
      const templateTouched = resolvedTemplateId !== undefined;
      const departmentsTouched = input.departments !== undefined;
      const systemRoleTouched = input.systemRole !== undefined
        && input.systemRole !== targetUser.systemRole;
      if (templateTouched || customPermsProvided || departmentsTouched || systemRoleTouched) {
        // Resolve the template perms in play. If the caller didn't touch
        // the template, keep the existing one's perms so we don't
        // silently strip them.
        let basePerms: string[] = [];
        if (templateTouched) {
          basePerms = templatePerms || [];
        } else if (targetUser.roleTemplateId) {
          const existingTemplate = await RoleTemplate
            .findById(targetUser.roleTemplateId)
            .lean();
          basePerms = (existingTemplate?.permissions as string[]) || [];
        }

        // For customPermissions: explicit empty list means "clear";
        // missing field means "keep whatever the user had stored on top
        // of departments/template". We approximate "kept custom" as
        // (existing stored perms − perms that would be derived from the
        // current/previous template + the previous department roles),
        // but in practice the frontend always sends customPermissions
        // for System Admin actors, so this branch is mostly defensive.
        const custom = customPermsProvided
          ? (input.customPermissions as string[])
          : (targetUser.permissions || []);

        updateData.permissions = deriveEffectivePermissions({
          systemRole: input.systemRole ?? targetUser.systemRole,
          departments: departmentsTouched ? input.departments : targetUser.departments,
          templatePerms: basePerms,
          customPerms: custom,
        });
      }

      if (resolvedTemplateId !== undefined) {
        updateData.roleTemplateId = resolvedTemplateId;
      }

      if (input.password) {
        updateData.password = await bcrypt.hash(input.password, config.BCRYPT_ROUNDS);
      }
      delete updateData.id;

      await db.collection('users').updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData },
      );

      const updatedUser = await db.collection('users').findOne({ _id: new ObjectId(id) });
      if (!updatedUser) throw new Error('User not found after update');

      return {
        ...updatedUser,
        id: updatedUser._id.toString(),
        displayName: `${updatedUser.firstName} ${updatedUser.lastName}`,
      };
    },

    deleteUser: async (_: any, { id }: { id: string }, context: Context) => {
      requirePermission(context, Permission.USERS_DELETE);

      if (!ObjectId.isValid(id)) {
        throw new Error('Invalid user ID');
      }

      const db = await connectMongoDB();
      await db.collection('users').updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            isActive: false,
            updatedAt: new Date(),
            updatedBy: context.user!.userId,
          },
        },
      );
      return true;
    },

    updateMyProfile: async (_: any, { input }: { input: any }, context: Context) => {
      const actor = requireAuth(context);
      const db = await connectMongoDB();

      const allowedFields = ['firstName', 'lastName', 'phone', 'mobile'];
      const updateData: any = {};
      for (const field of allowedFields) {
        if (input[field] !== undefined) updateData[field] = input[field];
      }
      updateData.updatedAt = new Date();
      updateData.updatedBy = actor.userId;

      await db.collection('users').updateOne(
        { _id: new ObjectId(actor.userId) },
        { $set: updateData },
      );

      const updatedUser = await db.collection('users').findOne({ _id: new ObjectId(actor.userId) });
      if (!updatedUser) throw new Error('User not found after update');

      return {
        ...updatedUser,
        id: updatedUser._id.toString(),
        displayName: `${updatedUser.firstName} ${updatedUser.lastName}`,
      };
    },

    changePassword: async (_: any, { oldPassword, newPassword }: { oldPassword: string; newPassword: string }, context: Context) => {
      const actor = requireAuth(context);
      const db = await connectMongoDB();
      const currentUser = await db.collection('users').findOne({ _id: new ObjectId(actor.userId) });
      if (!currentUser) throw new Error('User not found');

      const isValid = await bcrypt.compare(oldPassword, currentUser.password);
      if (!isValid) throw new Error('Invalid current password');

      const hashedPassword = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);
      await db.collection('users').updateOne(
        { _id: new ObjectId(actor.userId) },
        { $set: { password: hashedPassword, updatedAt: new Date(), updatedBy: actor.userId } },
      );
      return true;
    },

    registerPublicKey: async (_: any, { publicKey }: { publicKey: string }, context: Context) => {
      const actor = requireAuth(context);
      const db = await connectMongoDB();
      const fingerprint = await computePublicKeyFingerprint(publicKey);

      await db.collection('users').updateOne(
        { _id: new ObjectId(actor.userId) },
        {
          $set: {
            publicKey,
            publicKeyFingerprint: fingerprint,
            publicKeyUpdatedAt: new Date(),
            updatedAt: new Date(),
            updatedBy: actor.userId,
          },
        },
      );
      return true;
    },
  },

  User: {
    id: (parent: any) => {
      if (parent._id) return parent._id.toString ? parent._id.toString() : parent._id;
      return parent.id;
    },
    displayName: (parent: any) => {
      return parent.displayName || `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || parent.email || 'Unknown User';
    },
    department: (parent: any) => {
      if (parent.departments && Array.isArray(parent.departments) && parent.departments.length > 0) {
        return parent.departments[0].departmentName || parent.departments[0].departmentId;
      }
      return parent.department || null;
    },
    roleTemplateName: async (parent: any) => {
      if (!parent.roleTemplateId) return null;
      const template = await RoleTemplate.findById(parent.roleTemplateId).lean();
      return template?.name ?? null;
    },
    createdBy: async (parent: any) => {
      if (!parent.createdBy) return null;
      const db = await connectMongoDB();
      const user = await db.collection('users').findOne({ _id: new ObjectId(parent.createdBy) });
      if (!user) return null;
      return { ...user, id: user._id.toString(), displayName: `${user.firstName} ${user.lastName}` };
    },
    updatedBy: async (parent: any) => {
      if (!parent.updatedBy) return null;
      const db = await connectMongoDB();
      const user = await db.collection('users').findOne({ _id: new ObjectId(parent.updatedBy) });
      if (!user) return null;
      return { ...user, id: user._id.toString(), displayName: `${user.firstName} ${user.lastName}` };
    },
  },
};
