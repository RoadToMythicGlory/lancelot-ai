import mongoose, { Schema, Document } from 'mongoose';

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
  equipment: Array<{
    equipmentId?: string;
    name: string;
    category?: string;
    count: number;
  }>;
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
        equipmentId: { type: String },
        name: { type: String, required: true },
        category: { type: String },
        count: { type: Number, required: true },
      },
    ],
    createdBy: { type: String },
  },
  { timestamps: true }
);

ExternalBroadcastPresetSchema.index({ name: 1 });

export const ExternalBroadcastPreset = mongoose.model<IExternalBroadcastPreset>(
  'ExternalBroadcastPreset',
  ExternalBroadcastPresetSchema
);
