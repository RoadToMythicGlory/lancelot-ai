import mongoose, { Schema, Document } from 'mongoose';

/**
 * Venue (stadium / arena / outdoor location) saved in advance so external
 * broadcasts can hydrate a sensible default crew + equipment preset
 * picker the moment the user selects it.
 *
 * Design decisions (locked in with the user 2026-05-17):
 *  - Multiple equipment preset references per venue. The user picks one
 *    at event-creation time; we don't merge them server-side.
 *  - Multiple crew structures per venue (different shapes of crew for
 *    different events at the same place).
 *  - Permissions: management is gated by the existing BROADCAST_MANAGE
 *    permission since venues are surfaced inside External Broadcasts.
 */
export interface IVenueCrewStructure {
  name: string;
  notes?: string | null;
  jobs: Array<{
    departmentCode: string;
    roleKey?: string | null;
    roleLabel?: string | null;
    count: number;
    userId?: string | null;
    userName?: string | null;
  }>;
}

export interface IVenue extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  hebrewName?: string | null;
  city?: string | null;
  address?: string | null;
  notes?: string | null;
  capacity?: number | null;
  // Pointers (string IDs to keep cross-collection serialization cheap)
  // to ExternalBroadcastPreset documents to use as default equipment
  // sets when picking this venue.
  equipmentPresetIds: string[];
  crewStructures: IVenueCrewStructure[];
  isActive: boolean;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const venueCrewStructureSchema = new Schema<IVenueCrewStructure>(
  {
    name: { type: String, required: true },
    notes: { type: String, default: null },
    jobs: [
      {
        departmentCode: { type: String, required: true },
        roleKey: { type: String, default: null },
        roleLabel: { type: String, default: null },
        count: { type: Number, default: 1 },
        userId: { type: String, default: null },
        userName: { type: String, default: null },
      },
    ],
  },
  { _id: false },
);

const venueSchema = new Schema<IVenue>(
  {
    name: { type: String, required: true, trim: true },
    hebrewName: { type: String, default: null },
    city: { type: String, default: null },
    address: { type: String, default: null },
    notes: { type: String, default: null },
    capacity: { type: Number, default: null },
    equipmentPresetIds: { type: [String], default: [] },
    crewStructures: { type: [venueCrewStructureSchema], default: [] },
    isActive: { type: Boolean, default: true },
    createdBy: { type: String, default: null },
  },
  { timestamps: true },
);

venueSchema.index({ name: 1 });
venueSchema.index({ isActive: 1 });
venueSchema.index({ city: 1 });

export const Venue = mongoose.model<IVenue>('Venue', venueSchema);
