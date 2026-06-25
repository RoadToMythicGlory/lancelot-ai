import mongoose, { Schema, Document } from 'mongoose';

/**
 * Equipment fault report.
 *
 * Created from the External Broadcasts editor whenever a broadcast reports
 * equipment as faulty. Two behaviors fall out of an open fault report:
 *
 *  1. The warehouse cannot assign the equipment to a new event until the
 *     fault is resolved (enforced server-side in `warehouse.service.ts`).
 *  2. The External Broadcasts UI and reports surface the open fault so
 *     operators see why the equipment is unavailable.
 *
 * Resolution is recorded inline (resolvedAt / resolvedBy / resolutionNotes)
 * rather than as a separate document so a single read returns the full
 * lifecycle. We never delete fault reports — closed reports are kept for
 * audit and reporting.
 */
export type FaultSeverity = 'minor' | 'major' | 'critical';
export type FaultStatus = 'open' | 'in_progress' | 'resolved';

export interface IEquipmentFaultReport extends Document {
  _id: mongoose.Types.ObjectId;
  equipmentId: mongoose.Types.ObjectId;
  equipmentName?: string;
  equipmentBarcode?: string;

  // Source event (External Broadcasts is the only writer today, but the
  // column is generic so other surfaces can adopt the workflow later).
  eventId?: mongoose.Types.ObjectId;
  eventName?: string;

  description: string;
  severity: FaultSeverity;
  status: FaultStatus;

  reportedBy?: string;
  reportedByName?: string;
  reportedAt: Date;

  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;

  createdAt: Date;
  updatedAt: Date;
}

const equipmentFaultReportSchema = new Schema<IEquipmentFaultReport>(
  {
    equipmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Equipment',
      required: true,
      index: true,
    },
    equipmentName: String,
    equipmentBarcode: String,
    eventId: { type: Schema.Types.ObjectId, ref: 'BroadcastEvent', index: true },
    eventName: String,
    description: { type: String, required: true },
    severity: {
      type: String,
      enum: ['minor', 'major', 'critical'],
      default: 'major',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved'],
      default: 'open',
      required: true,
      index: true,
    },
    reportedBy: String,
    reportedByName: String,
    reportedAt: { type: Date, default: Date.now, required: true },
    resolvedBy: String,
    resolvedByName: String,
    resolvedAt: Date,
    resolutionNotes: String,
  },
  {
    timestamps: true,
    collection: 'equipment_fault_reports',
  },
);

// Compound index that powers the "is this equipment blocked?" lookup used
// by the warehouse assignment guard.
equipmentFaultReportSchema.index({ equipmentId: 1, status: 1 });
equipmentFaultReportSchema.index({ reportedAt: -1 });

export const EquipmentFaultReport = mongoose.model<IEquipmentFaultReport>(
  'EquipmentFaultReport',
  equipmentFaultReportSchema,
);
