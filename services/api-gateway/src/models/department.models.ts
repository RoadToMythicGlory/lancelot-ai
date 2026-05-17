import mongoose, { Schema, Document } from 'mongoose';

/**
 * Department role definition. Roles are explicit job titles within a department
 * (e.g. "MCR Supervisor", "VTR Operator"). Each role can grant additional
 * permissions when a user is assigned to it, replacing the previous hardcoded
 * `DEPT_ROLE_EXTRAS` map in rbac/matrix.ts.
 */
export interface IDepartmentRole {
  /** Stable id within the department; used as the saved value on users. */
  key: string;
  /** Human label, English by default. */
  name: string;
  /** Hebrew label shown in UI. */
  hebrewName?: string;
  description?: string;
  /** Extra Permission strings granted to a user with this role inside the department. */
  permissions: string[];
  /** Optional ordering hint (lower = higher in lists). */
  order?: number;
  isActive: boolean;
}

export interface IDepartment extends Document {
  _id: mongoose.Types.ObjectId;
  /** Stable external id used by users, events, presets, filters, etc. */
  code: string;
  /** English display name. */
  name: string;
  /** Hebrew display name (preferred for UI). */
  hebrewName?: string;
  /** Group label for browsing (e.g. "MCR", "Production"). */
  category: string;
  description?: string;
  /** Roles this department offers. */
  roles: IDepartmentRole[];
  /**
   * Other department codes whose users are considered part of this department
   * for staffing/listing purposes (replaces the hardcoded MCR expansion).
   */
  includesDepartmentCodes: string[];
  /** Free-form per-department permission grants (rarely used). */
  permissions: string[];
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentRoleSchema = new Schema<IDepartmentRole>(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    hebrewName: { type: String, trim: true },
    description: { type: String },
    permissions: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

const DepartmentSchema = new Schema<IDepartment>(
  {
    code: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    hebrewName: { type: String, trim: true },
    category: { type: String, default: 'General', trim: true },
    description: { type: String },
    roles: { type: [DepartmentRoleSchema], default: [] },
    includesDepartmentCodes: { type: [String], default: [] },
    permissions: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'departments' },
);

DepartmentSchema.index({ category: 1, name: 1 });
DepartmentSchema.index({ isActive: 1 });

export const Department = mongoose.models.Department
  || mongoose.model<IDepartment>('Department', DepartmentSchema);
