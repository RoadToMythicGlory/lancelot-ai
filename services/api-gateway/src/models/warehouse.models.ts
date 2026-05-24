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

// Default alert threshold (percentage) used when neither the warehouse
// nor the storage place defines its own value. Surfaced via the
// warehouse capacity calculations + scheduled near-full notifications.
export const DEFAULT_CAPACITY_ALERT_THRESHOLD_PERCENT = 75;

export interface IWarehouseStoragePlace {
  _id: Types.ObjectId;
  name: string;
  type: WarehouseStoragePlaceType;
  code?: string;
  notes?: string;
  isActive: boolean;
  // Optional physical capacity for this specific place (a shelf, a bin,
  // ...). When fully populated, drives the volume occupancy reporting in
  // the warehouse UI and the near-full alerts. Falls back to "capacity
  // not configured" when any of length/width/height is missing.
  dimensions?: IWarehouseDimensions;
  // Optional per-place override of the warehouse-level alert threshold.
  // Stored as a percentage (0-100). When undefined the warehouse value
  // (or the system default) is used.
  capacityAlertThresholdPercent?: number;
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
  // Default alert threshold (percent) applied to every storage place that
  // doesn't override it explicitly. When undefined the system-wide
  // DEFAULT_CAPACITY_ALERT_THRESHOLD_PERCENT (75%) is used.
  capacityAlertThresholdPercent?: number;
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
    capacityAlertThresholdPercent: { type: Number, min: 0, max: 100 },
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
    capacityAlertThresholdPercent: { type: Number, min: 0, max: 100 },
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
