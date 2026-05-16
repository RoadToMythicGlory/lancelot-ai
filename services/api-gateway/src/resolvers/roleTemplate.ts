import { AuthenticationError } from 'apollo-server-express';
import { ObjectId } from 'mongodb';
import { RoleTemplate } from '../models/roleTemplate';
import { requireAuth, requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';
import type { Context } from '../types';

// Default cap on role-template list queries — admin tooling only, but we
// still want to avoid pulling thousands of rows in one request.
const DEFAULT_TEMPLATE_LIMIT = 200;

export const roleTemplateResolvers = {
  RoleTemplate: {
    id: (parent: any) => {
      if (parent._id) return parent._id.toString ? parent._id.toString() : parent._id;
      return parent.id;
    },
  },

  Query: {
    roleTemplates: async (_: any, args: { departmentId?: string }, context: Context) => {
      requirePermission(context, Permission.USERS_VIEW);
      const filter: any = { isActive: true };
      if (args.departmentId) {
        filter.$or = [
          { departmentScope: args.departmentId },
          { departmentScope: null },
          { departmentScope: { $exists: false } },
        ];
      }
      return RoleTemplate.find(filter).sort({ name: 1 }).limit(DEFAULT_TEMPLATE_LIMIT).lean();
    },

    roleTemplate: async (_: any, args: { id: string }, context: Context) => {
      requirePermission(context, Permission.USERS_VIEW);
      if (!ObjectId.isValid(args.id)) {
        throw new Error('Invalid role template ID');
      }
      return RoleTemplate.findById(args.id).lean();
    },

    assignableRoleTemplates: async (_: any, __: any, context: Context) => {
      const user = requireAuth(context);
      const filter: any = { isActive: true };

      if (user.systemRole === 'DEPARTMENT_ADMIN') {
        filter.allowedForDeptAdmins = true;
        const deptIds = (user.departments ?? []).map((d: any) => d.departmentId);
        filter.$or = [
          { departmentScope: null },
          { departmentScope: { $exists: false } },
          ...(deptIds.length > 0 ? [{ departmentScope: { $in: deptIds } }] : []),
        ];
      }

      return RoleTemplate.find(filter).sort({ name: 1 }).limit(DEFAULT_TEMPLATE_LIMIT).lean();
    },
  },

  Mutation: {
    createRoleTemplate: async (_: any, args: { input: any }, context: Context) => {
      const user = requirePermission(context, Permission.ROLE_TEMPLATES_MANAGE);
      const { input } = args;

      const existing = await RoleTemplate.findOne({ name: input.name });
      if (existing) {
        throw new AuthenticationError('A role template with this name already exists');
      }

      const template = new RoleTemplate({
        ...input,
        createdBy: new ObjectId(user.userId),
      });

      await template.save();
      return template.toObject();
    },

    updateRoleTemplate: async (_: any, args: { id: string; input: any }, context: Context) => {
      const user = requirePermission(context, Permission.ROLE_TEMPLATES_MANAGE);

      if (!ObjectId.isValid(args.id)) {
        throw new Error('Invalid role template ID');
      }

      if (args.input.name) {
        const existing = await RoleTemplate.findOne({
          name: args.input.name,
          _id: { $ne: new ObjectId(args.id) },
        });
        if (existing) {
          throw new AuthenticationError('A role template with this name already exists');
        }
      }

      const template = await RoleTemplate.findByIdAndUpdate(
        args.id,
        { ...args.input, updatedBy: new ObjectId(user.userId) },
        { new: true },
      ).lean();

      if (!template) {
        throw new AuthenticationError('Role template not found');
      }
      return template;
    },

    deleteRoleTemplate: async (_: any, args: { id: string }, context: Context) => {
      requirePermission(context, Permission.ROLE_TEMPLATES_MANAGE);

      if (!ObjectId.isValid(args.id)) {
        throw new Error('Invalid role template ID');
      }

      const result = await RoleTemplate.findByIdAndUpdate(
        args.id,
        { isActive: false },
        { new: true },
      );
      return !!result;
    },
  },
};
