import mongoose, { Schema, Document } from 'mongoose';

/**
 * Reference data used by Broadcasts across the whole Lancelot app:
 *   - `controlRoom` — the single source of truth for control rooms
 *     (קונטרול / יוניפייד / רדיו / וכו'). Consumed by the Broadcast
 *     Array form, External Broadcasts (incl. the double-broadcast
 *     secondary control selector), MCR views, reports, etc. Seeded
 *     on startup; operators add/remove entries from the Settings UI.
 *   - `vehicle`, `trailer` — operational fleet lists.
 *   - `broadcastType` — broadcast type catalog (fibers/calc/etc.).
 *
 * Crew is NOT a reference kind — crew members come from the Users
 * collection (`apps/web/src/app/users`).
 *
 * Venues/stadiums stay in their own collection — they're far richer
 * and already have a full editor (`VenuesManager.tsx`).
 */
export type ReferenceKind =
  | 'vehicle'
  | 'trailer'
  | 'controlRoom'
  | 'broadcastType';

export interface IExternalBroadcastReference extends Document {
  _id: mongoose.Types.ObjectId;
  kind: ReferenceKind;
  name: string;
  description?: string;
  // Broadcast type extra fields (legacy `add_broadcast_types.php`).
  broadcastTypeGroup?: string;
  fiberCount?: number;
  fiberPort?: string;
  fiberPrice?: number;
  returnFiber?: string;
  setupTimeMinutes?: number;
  calculationType?: string;
  // Free-form bag for anything else the operator wants to capture.
  extra?: any;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IExternalBroadcastReference>(
  {
    kind: {
      type: String,
      enum: ['vehicle', 'trailer', 'controlRoom', 'broadcastType'],
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: String,
    broadcastTypeGroup: String,
    fiberCount: Number,
    fiberPort: String,
    fiberPrice: Number,
    returnFiber: String,
    setupTimeMinutes: Number,
    calculationType: String,
    extra: Schema.Types.Mixed,
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
    collection: 'external_broadcast_reference',
  },
);

schema.index({ kind: 1, name: 1 });

export const ExternalBroadcastReference =
  mongoose.model<IExternalBroadcastReference>(
    'ExternalBroadcastReference',
    schema,
  );
