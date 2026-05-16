import mongoose, { Schema, Document } from 'mongoose';

// Internal (worker-based) equipment dispatch — equipment checked out to a
// person rather than a broadcast event. Used by the "הקצאות פנימיות" tab in
// the warehouse UI. The recipient can be either an internal Lancelot user
// or a free-text external worker name (contractors, freelancers, etc.).
export interface IInternalEquipmentAssignment extends Document {
  _id: mongoose.Types.ObjectId;

  equipmentId: mongoose.Types.ObjectId;

  // Recipient — exactly one of (assignedToUserId) or (assignedToExternalName)
  // is populated. assignedToName is always populated as a denormalized label.
  assignedToType: 'internal' | 'external';
  assignedToUserId?: mongoose.Types.ObjectId | null;
  assignedToExternalName?: string;
  assignedToName: string;
  assignedToPhone?: string;

  quantityAssigned: number;

  status: 'active' | 'returned' | 'transferred' | 'cancelled';

  // Dispatch metadata
  assignedAt: Date;
  assignedBy?: string;          // user id of warehouse operator
  assignedByName?: string;      // denormalized for display
  notes?: string;

  // Return metadata
  returnedAt?: Date;
  returnedBy?: string;
  returnedByName?: string;
  returnNotes?: string;

  // Transfer metadata — when this assignment is rolled into a new one
  // (העבר ציוד), we mark the current row "transferred" and create a new
  // active row pointing back at this one.
  transferredAt?: Date;
  transferredBy?: string;
  transferredByName?: string;
  transferredToAssignmentId?: mongoose.Types.ObjectId | null;
  transferredFromAssignmentId?: mongoose.Types.ObjectId | null;
  transferNotes?: string;

  createdAt: Date;
  updatedAt: Date;
}

const internalEquipmentAssignmentSchema = new Schema<IInternalEquipmentAssignment>(
  {
    equipmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Equipment',
      required: true,
      index: true,
    },

    assignedToType: {
      type: String,
      enum: ['internal', 'external'],
      required: true,
    },
    assignedToUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedToExternalName: String,
    assignedToName: { type: String, required: true },
    assignedToPhone: String,

    quantityAssigned: { type: Number, required: true, default: 1, min: 1 },

    status: {
      type: String,
      enum: ['active', 'returned', 'transferred', 'cancelled'],
      default: 'active',
      required: true,
      index: true,
    },

    assignedAt: { type: Date, default: Date.now, required: true },
    assignedBy: String,
    assignedByName: String,
    notes: String,

    returnedAt: Date,
    returnedBy: String,
    returnedByName: String,
    returnNotes: String,

    transferredAt: Date,
    transferredBy: String,
    transferredByName: String,
    transferredToAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'InternalEquipmentAssignment',
      default: null,
    },
    transferredFromAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'InternalEquipmentAssignment',
      default: null,
    },
    transferNotes: String,
  },
  {
    timestamps: true,
    collection: 'internal_equipment_assignments',
  },
);

internalEquipmentAssignmentSchema.index({ status: 1, assignedAt: -1 });
internalEquipmentAssignmentSchema.index({ assignedToUserId: 1, status: 1 });
internalEquipmentAssignmentSchema.index({ equipmentId: 1, status: 1 });
internalEquipmentAssignmentSchema.index({ assignedToType: 1, status: 1 });
internalEquipmentAssignmentSchema.index({ assignedBy: 1, assignedAt: -1 });
internalEquipmentAssignmentSchema.index({ transferredToAssignmentId: 1 });
internalEquipmentAssignmentSchema.index({ transferredFromAssignmentId: 1 });
internalEquipmentAssignmentSchema.index({ assignedToExternalName: 1 });

export const InternalEquipmentAssignment = mongoose.model<IInternalEquipmentAssignment>(
  'InternalEquipmentAssignment',
  internalEquipmentAssignmentSchema,
);
