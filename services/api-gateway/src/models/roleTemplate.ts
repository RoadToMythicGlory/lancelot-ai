import mongoose, { Schema, Document } from 'mongoose';
import { SYSTEM_ROLES } from '../rbac/permissions';

export interface IRoleTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  baseSystemRole: string;
  departmentScope?: string;
  permissions: string[];
  allowedForDeptAdmins: boolean;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const roleTemplateSchema = new Schema<IRoleTemplate>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    baseSystemRole: {
      type: String,
      required: true,
      enum: [...SYSTEM_ROLES],
      default: 'DEPARTMENT_USER',
    },
    departmentScope: { type: String, default: null },
    permissions: [{ type: String }],
    allowedForDeptAdmins: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

roleTemplateSchema.index({ isActive: 1 });
roleTemplateSchema.index({ allowedForDeptAdmins: 1, isActive: 1 });
roleTemplateSchema.index({ departmentScope: 1, isActive: 1 });
roleTemplateSchema.index({ baseSystemRole: 1, isActive: 1 });
roleTemplateSchema.index({ createdBy: 1 });

export const RoleTemplate = mongoose.model<IRoleTemplate>(
  'RoleTemplate',
  roleTemplateSchema,
);
