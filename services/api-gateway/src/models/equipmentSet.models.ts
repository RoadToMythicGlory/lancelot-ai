import mongoose, { Schema, Document } from 'mongoose';

export interface IEquipmentSetItem {
  equipmentId: mongoose.Types.ObjectId;
  quantity: number;
  required: boolean;
}

export interface IEquipmentSet extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  barcode: string;
  description?: string;
  items: IEquipmentSetItem[];
  notes?: string;
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const equipmentSetItemSchema = new Schema(
  {
    equipmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Equipment',
      required: true,
    },
    quantity: { type: Number, required: true, default: 1 },
    required: { type: Boolean, default: true },
  },
  { _id: false },
);

const equipmentSetSchema = new Schema<IEquipmentSet>(
  {
    name: { type: String, required: true },
    barcode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    description: String,
    items: [equipmentSetItemSchema],
    notes: String,
    isActive: { type: Boolean, default: true, required: true },
    createdBy: String,
  },
  { timestamps: true, collection: 'equipment_sets' },
);

equipmentSetSchema.index({ name: 1 });
equipmentSetSchema.index({ isActive: 1 });
equipmentSetSchema.index({ isActive: 1, name: 1 });
equipmentSetSchema.index({ 'items.equipmentId': 1 });
equipmentSetSchema.index({ createdBy: 1 });

export const EquipmentSet = mongoose.model<IEquipmentSet>(
  'EquipmentSet',
  equipmentSetSchema,
);
