import mongoose, { Schema, Document } from 'mongoose';

export interface IShiftRoleAssignment {
  roleId: string;
  roleName: string;
  count: number;
}

export interface IShiftRoleTemplate extends Document {
  name: string;
  departmentId: string;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  shiftType: string;
  roleAssignments: IShiftRoleAssignment[];
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ShiftRoleAssignmentSchema = new Schema<IShiftRoleAssignment>({
  roleId: { type: String, required: true },
  roleName: { type: String, required: true },
  count: { type: Number, required: true, min: 0 }
}, { _id: false });

const ShiftRoleTemplateSchema = new Schema<IShiftRoleTemplate>({
  name: { type: String, required: true },
  departmentId: { type: String, required: true },
  dayOfWeek: { 
    type: Number, 
    required: true,
    min: 0,
    max: 6,
    validate: {
      validator: Number.isInteger,
      message: 'Day of week must be an integer between 0 and 6'
    }
  },
  shiftType: { type: String, required: true },
  roleAssignments: {
    type: [ShiftRoleAssignmentSchema],
    required: true,
    validate: {
      validator: function(assignments: IShiftRoleAssignment[]) {
        return assignments.length > 0;
      },
      message: 'At least one role assignment is required'
    }
  },
  isActive: { type: Boolean, default: true },
  createdBy: { type: String }
}, {
  timestamps: true
});

// Compound index for uniqueness per department, day, and shift type
ShiftRoleTemplateSchema.index({ departmentId: 1, dayOfWeek: 1, shiftType: 1, name: 1 }, { unique: true });

// Index for querying templates by department
ShiftRoleTemplateSchema.index({ departmentId: 1, isActive: 1 });

// Virtual for total required workers
ShiftRoleTemplateSchema.virtual('totalRequiredWorkers').get(function() {
  return this.roleAssignments.reduce((total, assignment) => total + assignment.count, 0);
});

export const ShiftRoleTemplate = mongoose.model<IShiftRoleTemplate>('ShiftRoleTemplate', ShiftRoleTemplateSchema);
