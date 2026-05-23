import mongoose, { Schema, Document } from 'mongoose';

/**
 * External broadcast presets describe a re-usable bundle of crew roles +
 * equipment requirements. Equipment used to be expressed as one row per
 * category with a `count` and a per-unit settings map; the new shape is
 * item-based — one row per concrete `Equipment` document, with `quantity`,
 * `purpose` and `audioConfig` carried directly on the row.
 *
 * The legacy `count`/`unitSettings` fields are retained as optional read-only
 * fallback so existing presets keep rendering until they're re-saved. New
 * write paths must produce only the item-based shape (resolvers reject
 * legacy fields explicitly).
 */
export interface IPresetEquipmentItem {
  equipmentId: string;
  equipmentName: string;
  category: string;
  categoryLabel: string;
  quantity: number;
  purpose?: string;
  audioConfig?: string;

  // Legacy fields — retained for read-only fallback only. New presets
  // never write these; resolvers strip them on create/update.
  count?: number;
  unitSettings?: Array<{
    unitIndex: number;
    purpose?: string;
    audioConfig?: string;
    assignedEquipmentId?: string;
    assignedEquipmentName?: string;
  }>;
}

export interface IExternalBroadcastPreset extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  tags?: string[];
  roles: Array<{
    roleKey: string;
    roleLabel: string;
    count: number;
    isCustom: boolean;
  }>;
  equipment: IPresetEquipmentItem[];
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExternalBroadcastPresetSchema = new Schema<IExternalBroadcastPreset>(
  {
    name: { type: String, required: true },
    description: { type: String },
    tags: [{ type: String }],
    roles: [
      {
        roleKey: { type: String, required: true },
        roleLabel: { type: String, required: true },
        count: { type: Number, required: true },
        isCustom: { type: Boolean, required: true },
      },
    ],
    equipment: [
      {
        // New item-based fields. Optional at the schema level so legacy
        // documents (which only have `count`/`unitSettings`) keep loading
        // — the resolvers enforce required-on-write via input validation.
        equipmentId: { type: String },
        equipmentName: { type: String },
        category: { type: String, required: true },
        categoryLabel: { type: String, required: true },
        quantity: { type: Number },
        purpose: { type: String },
        audioConfig: { type: String },

        // Legacy fields (read-only fallback).
        count: { type: Number },
        unitSettings: [
          {
            unitIndex: { type: Number, required: true },
            purpose: { type: String },
            audioConfig: { type: String },
            assignedEquipmentId: { type: String },
            assignedEquipmentName: { type: String },
          },
        ],
      },
    ],
    createdBy: { type: String },
  },
  { timestamps: true }
);

ExternalBroadcastPresetSchema.index({ name: 1 });
ExternalBroadcastPresetSchema.index({ createdBy: 1 });
ExternalBroadcastPresetSchema.index({ tags: 1 });
ExternalBroadcastPresetSchema.index({ createdAt: -1 });

export const ExternalBroadcastPreset = mongoose.model<IExternalBroadcastPreset>(
  'ExternalBroadcastPreset',
  ExternalBroadcastPresetSchema
);
