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
    category: string;
    categoryLabel: string;
    count: number;
    unitSettings?: Array<{
      unitIndex: number;
      purpose?: string;
      audioConfig?: string;
      assignedEquipmentId?: string;
      assignedEquipmentName?: string;
    }>;
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
        category: { type: String, required: true },
        categoryLabel: { type: String, required: true },
        count: { type: Number, required: true },
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
