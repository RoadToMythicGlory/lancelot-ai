import mongoose, { Schema, Document } from 'mongoose';

/**
 * Form configuration entry — one allowed department for a given assignment form.
 * Admins build a list of these to control what departments users can pick from
 * when populating jobs in a form (broadcast array, external broadcasts, etc.).
 */
export interface IAssignmentFormDepartment {
  /** Department code (matches `departments.code`). */
  departmentCode: string;
  /** Optional whitelist of role keys allowed for this department on this form. Empty = all roles. */
  allowedRoleKeys: string[];
  /** Whether picking a specific user is required when assigning a job. */
  requireUser: boolean;
  /** Default count of jobs suggested for this department on a brand-new event. */
  defaultCount: number;
  /** UI ordering hint. */
  order: number;
}

/**
 * Form column definition — one Broadcast-Array-style role column.
 * Currently only the `broadcastArray` form populates this; other forms
 * continue to use `departments[]` exclusively.
 */
export interface IAssignmentFormColumn {
  /** Stable slug (e.g. "editor", "producer"). */
  key: string;
  /** Hebrew display label. Also written as the `role` field on each
   * BroadcastEvent's crewAssignments[] so it must match what the
   * BroadcastArrayModal reads back. */
  hebrewLabel: string;
  /** Optional English label (admin UI only). */
  englishLabel?: string;
  /** Pull all active users from these department codes. */
  allowedDepartmentCodes: string[];
  /** Additionally allow these specific user ids (across any department). */
  allowedUserIds: string[];
  requireUser: boolean;
  defaultCount: number;
  order: number;
}

export interface IAssignmentFormConfig extends Document {
  _id: mongoose.Types.ObjectId;
  /** Stable form key (e.g. "broadcastArray", "externalBroadcasts", "mcr"). */
  formKey: string;
  /** Human label shown in admin UI. */
  name: string;
  hebrewName?: string;
  description?: string;
  departments: IAssignmentFormDepartment[];
  /** Column-based layout (broadcastArray form only). Empty for forms
   * that use the department-based layout. */
  columns: IAssignmentFormColumn[];
  /** Whether end-users can save shared presets on this form. */
  allowUserPresets: boolean;
  isActive: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AssignmentFormDepartmentSchema = new Schema<IAssignmentFormDepartment>(
  {
    departmentCode: { type: String, required: true, trim: true },
    allowedRoleKeys: { type: [String], default: [] },
    requireUser: { type: Boolean, default: false },
    defaultCount: { type: Number, default: 1, min: 0 },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const AssignmentFormColumnSchema = new Schema<IAssignmentFormColumn>(
  {
    key: { type: String, required: true, trim: true },
    hebrewLabel: { type: String, required: true, trim: true },
    englishLabel: { type: String, trim: true },
    allowedDepartmentCodes: { type: [String], default: [] },
    allowedUserIds: { type: [String], default: [] },
    requireUser: { type: Boolean, default: false },
    defaultCount: { type: Number, default: 1, min: 0 },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const AssignmentFormConfigSchema = new Schema<IAssignmentFormConfig>(
  {
    formKey: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    hebrewName: { type: String, trim: true },
    description: { type: String },
    departments: { type: [AssignmentFormDepartmentSchema], default: [] },
    columns: { type: [AssignmentFormColumnSchema], default: [] },
    allowUserPresets: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'assignmentFormConfigs' },
);

export const AssignmentFormConfig = mongoose.models.AssignmentFormConfig
  || mongoose.model<IAssignmentFormConfig>('AssignmentFormConfig', AssignmentFormConfigSchema);

/**
 * Shared assignment preset — a saved set of jobs (department + role + count + optional user)
 * that a permitted user can apply to fill an event quickly. Replaces the form-specific
 * external broadcast preset for the unified flow, but the legacy
 * ExternalBroadcastPreset model continues to exist for backward compatibility.
 */
export interface IAssignmentPresetJob {
  departmentCode: string;
  roleKey?: string;
  /** Display label captured at save time so renames don't break older presets. */
  roleLabel?: string;
  count: number;
  /** Optional pre-assigned user (kept in sync with current users when applied). */
  userId?: string;
  userName?: string;
}

export interface IAssignmentPreset extends Document {
  _id: mongoose.Types.ObjectId;
  formKey: string;
  name: string;
  description?: string;
  tags: string[];
  jobs: IAssignmentPresetJob[];
  /** True for "default" presets that admins want to apply automatically to regular events. */
  isDefault: boolean;
  /** When true the preset is shared with everyone allowed to see this form. */
  isShared: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdByName?: string;
  updatedBy?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AssignmentPresetJobSchema = new Schema<IAssignmentPresetJob>(
  {
    departmentCode: { type: String, required: true, trim: true },
    roleKey: { type: String, trim: true },
    roleLabel: { type: String, trim: true },
    count: { type: Number, default: 1, min: 0 },
    userId: { type: String, trim: true },
    userName: { type: String, trim: true },
  },
  { _id: false },
);

const AssignmentPresetSchema = new Schema<IAssignmentPreset>(
  {
    formKey: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    tags: { type: [String], default: [] },
    jobs: { type: [AssignmentPresetJobSchema], default: [] },
    isDefault: { type: Boolean, default: false },
    isShared: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'assignmentPresets' },
);

AssignmentPresetSchema.index({ formKey: 1, isActive: 1, name: 1 });
AssignmentPresetSchema.index({ formKey: 1, isDefault: 1, isActive: 1 });
AssignmentPresetSchema.index({ createdBy: 1 });

export const AssignmentPreset = mongoose.models.AssignmentPreset
  || mongoose.model<IAssignmentPreset>('AssignmentPreset', AssignmentPresetSchema);
