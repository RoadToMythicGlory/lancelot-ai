import mongoose, { Schema, Document } from 'mongoose';

/**
 * Lightweight per-field change log for External Broadcasts metadata.
 *
 * Distinct from `AuditLog` because:
 *  - It only records changes to External Broadcasts operational fields
 *    (status, double broadcast, control checks, documents, NEVION, LiveU,
 *    finance, exclude/restore). Planning changes are intentionally NOT
 *    duplicated here — they remain owned by the planning workflow.
 *  - It is queried per-event by the External Broadcasts change log view,
 *    so it carries `eventId` as a first-class indexed field.
 */
export interface IExternalBroadcastChangeLog extends Document {
  _id: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  field: string;
  previousValue?: any;
  newValue?: any;
  changedBy?: string;
  changedByName?: string;
  changedAt: Date;
}

const schema = new Schema<IExternalBroadcastChangeLog>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'BroadcastEvent', required: true, index: true },
    field: { type: String, required: true },
    previousValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed,
    changedBy: String,
    changedByName: String,
    changedAt: { type: Date, default: Date.now, required: true, index: true },
  },
  {
    timestamps: false,
    collection: 'external_broadcast_change_logs',
  },
);

schema.index({ eventId: 1, changedAt: -1 });

export const ExternalBroadcastChangeLog =
  mongoose.model<IExternalBroadcastChangeLog>('ExternalBroadcastChangeLog', schema);
