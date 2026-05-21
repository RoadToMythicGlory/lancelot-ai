import mongoose, { Schema, Document, Types } from 'mongoose';

// Supported measurement units for warehouse dimensions. The legacy data
// model only had free-text storage fields, so this list intentionally
// covers the common metric/imperial options the UI exposes — we don't
// need to support every esoteric unit (kilometers, miles, etc.).
export type WarehouseDimensionUnit =
  | 'meters'
  | 'centimeters'
  | 'millimeters'
  | 'feet'
  | 'yards'
  | 'inches';

export const WAREHOUSE_DIMENSION_UNITS: WarehouseDimensionUnit[] = [
  'meters',
  'centimeters',
  'millimeters',
  'feet',
  'yards',
  'inches',
];

// Types for storage places ("compartments") inside a warehouse. Users
// manage these manually so the value is mostly cosmetic — used to render
// an icon/label in the picker — but keeping it constrained makes filter
// dropdowns predictable.
export type WarehouseStoragePlaceType =
  | 'row'
  | 'shelf'
  | 'cell'
  | 'rack'
  | 'room'
  | 'cabinet'
  | 'bin'
  | 'other';

export const WAREHOUSE_STORAGE_PLACE_TYPES: WarehouseStoragePlaceType[] = [
  'row',
  'shelf',
  'cell',
  'rack',
  'room',
  'cabinet',
  'bin',
  'other',
];

export interface IWarehouseStoragePlace {
  _id: Types.ObjectId;
  name: string;
  type: WarehouseStoragePlaceType;
  code?: string;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWarehouseDimensions {
  length?: number;
  width?: number;
  height?: number;
  unit: WarehouseDimensionUnit;
}

export interface IWarehouse extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  address?: string;
  dimensions?: IWarehouseDimensions;
  storagePlaces: Types.DocumentArray<IWarehouseStoragePlace & Document>;
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const storagePlaceSchema = new Schema<IWarehouseStoragePlace>(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: WAREHOUSE_STORAGE_PLACE_TYPES,
      default: 'other',
      required: true,
    },
    code: { type: String, trim: true },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true, required: true },
  },
  { timestamps: true, _id: true },
);

const warehouseSchema = new Schema<IWarehouse>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    description: { type: String, trim: true },
    address: { type: String, trim: true },
    dimensions: {
      length: { type: Number, min: 0 },
      width: { type: Number, min: 0 },
      height: { type: Number, min: 0 },
      unit: {
        type: String,
        enum: WAREHOUSE_DIMENSION_UNITS,
        default: 'meters',
      },
    },
    storagePlaces: { type: [storagePlaceSchema], default: [] },
    isActive: { type: Boolean, default: true, required: true },
    createdBy: String,
  },
  { timestamps: true, collection: 'warehouses' },
);

warehouseSchema.index({ name: 'text', description: 'text' });
warehouseSchema.index({ isActive: 1 });
warehouseSchema.index({ createdAt: -1 });

export const Warehouse = mongoose.model<IWarehouse>('Warehouse', warehouseSchema);
