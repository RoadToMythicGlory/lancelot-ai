import mongoose, { Schema, Document } from 'mongoose';
import {
  WAREHOUSE_DIMENSION_UNITS,
  WarehouseDimensionUnit,
} from './warehouse.models';

// Suspension status types — surfaced separately from `isDisabled` so we can
// represent why a unit is out of rotation (maintenance, repair, lost, etc.).
export type EquipmentSuspensionStatus =
  | 'under_maintenance'
  | 'broken'
  | 'lost'
  | 'reserved'
  | 'other';

// Optional physical dimensions for an equipment item. Used by the warehouse
// occupancy calculations — when all three lengths (and a unit) are present
// the helper in `warehouseCapacity.service.ts` can compute the volume each
// unit consumes inside its storage place.
export interface IEquipmentDimensions {
  length?: number;
  width?: number;
  height?: number;
  unit: WarehouseDimensionUnit;
}

// Interface for TypeScript
export interface IEquipment extends Document {
  _id: mongoose.Types.ObjectId;
  barcode: string;
  name: string;
  category: EquipmentCategory;
  
  // Additional details
  price?: number;
  purchaseDate?: Date;
  warrantyExpiryDate?: Date;
  company?: string;
  equipmentModel?: string;
  contactPerson?: string;
  manualLink?: string;
  imageUrl?: string;

  // Optional physical size. When fully populated, drives the volume-based
  // occupancy math on each storage place / warehouse. Items without a full
  // dimension set contribute 0 volume (capacity reporting just shows them
  // as "size unknown" until the user fills the values in).
  dimensions?: IEquipmentDimensions;

  // Structured storage location. `warehouseId` (plus optional
  // `storagePlaceId`) is the new canonical reference; the legacy
  // `storage { row, shelf, cell }` strings are kept for backward
  // compatibility with imported / pre-migration documents so the
  // details/edit modals can still display them until reassigned.
  warehouseId?: mongoose.Types.ObjectId;
  storagePlaceId?: mongoose.Types.ObjectId;
  storage?: {
    row?: string;
    shelf?: string;
    cell?: string;
  };
  
  // Inventory tracking
  status: 'available' | 'assigned' | 'maintenance' | 'broken';
  condition?: 'new' | 'good' | 'fair' | 'needs_repair';
  quantityTotal: number;
  quantityAvailable: number;
  quantityAssigned: number;
  currentLocation?: string;
  
  // Quantity-based items (consumables, cables, etc.) are NOT scanned per-unit.
  // Only items where this is true expose the "Adjust Quantity" UI affordance.
  isQuantityBased: boolean;

  // Shared engineering equipment ("ציוד הנדסה שיתופי") — flagged inventory
  // that MCR needs to track explicitly whenever it is dispatched, whether to a
  // broadcast event or directly to a staff member. Surfaced on the dedicated
  // MCR tab and embedded as a snapshot on the assigned event's metadata.
  isSharedEngineeringEquipment: boolean;

  // Equipment state
  isDisabled: boolean;
  disabledAt?: Date;
  disabledBy?: string;
  disabledReason?: string;
  // Distinct suspension reason — populated whenever a unit is taken out
  // of service (maintenance, broken, lost, ...). Keeps the meaning of
  // `disabledReason` (free-text) separate from a structured status code.
  suspensionStatus?: EquipmentSuspensionStatus;
  
  // BLE tracker binding (Minew E8 or compatible)
  trackerTagId?: mongoose.Types.ObjectId;
  
  // Activity tracking — used by the "items unused over 2 weeks" notification
  // job. We refresh this whenever an equipment is assigned, returned, or
  // adjusted so we don't have to scan EquipmentHistory on every scheduler tick.
  lastUsedAt?: Date;
  unusedNotificationSentAt?: Date;
  
  // System fields
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Category translations for UI.
//
// @deprecated — this hardcoded map is no longer the source of truth.
// Equipment categories now live in the `equipment_categories` Mongo
// collection (see `equipmentCategory.models.ts`) and are exposed via the
// `equipmentCategories` GraphQL query. This constant is kept solely as
// the initial-seed source for that collection (see
// `scripts/seed-equipment-categories.ts`) and for legacy callers like
// the barcode-prefix helper below that still want a quick local lookup.
//
// To add or rename a category in production, use the Warehouse > קטגוריות
// ציוד admin UI — never edit this map.
export const EQUIPMENT_CATEGORIES = {
  // ---- Original Lancelot categories ----
  cameras: 'מצלמות',
  batteries: 'סוללות',
  liveu_kits: 'ערכות LIVEU',
  unity_kits: 'ערכות UNITY',
  monitors: 'מוניטורים',
  headphones: 'אוזניות',
  stabilizers: 'מייצבים',
  cards: 'כרטיסים',
  adapters: 'מתאמים',
  matrix_components: 'רכיבי מטריצה',
  other: 'אחר',

  // ---- Imported from legacy shidureyhuts warehouse ----
  battery_charger: 'מטענים',
  braids_and_reels: 'כבלים וגלילים',
  broadcast_kit: 'ערכות שידור',
  cables: 'כבלים',
  computers: 'מחשבים',
  converter: 'ממירים',
  datapower_supply: 'ספקי כוח לנתונים',
  digital_telephone_hybrid: 'היברידי טלפון דיגיטלי',
  distribution_amplifier: 'מגברי הפצה',
  electricity: 'חשמל',
  fiber: 'סיב אופטי',
  fiber_optic_transmission: 'מערכת שידור סיב אופטי',
  focus: 'פוקוס',
  grip: 'אביזרי תפיסה',
  handle: 'ידיות',
  hollyland_antenna: 'אנטנת HOLLYLAND',
  hollyland_stand: 'מעמד HOLLYLAND',
  hybrid: 'היברידי',
  intercom: 'אינטרקום',
  lens: 'עדשות',
  lighting: 'תאורה',
  microphones: 'מיקרופונים',
  multi: 'רב-תכליתי',
  network: 'תקשורת',
  optical: 'אופטי',
  panasonic: 'PANASONIC',
  power_supply: 'ספקי כוח',
  sets: 'ערכות',
  sound: 'סאונד',
  tripod: 'חצובות',
  trismo: 'TRISMO',
  universal: 'אוניברסלי',
  video: 'וידאו',
  zoom_handle: 'ידית זום',
} as const;

export type EquipmentCategory = keyof typeof EQUIPMENT_CATEGORIES;

// Categories that default to quantity-based tracking (no per-unit barcodes).
// New equipment in these categories gets `isQuantityBased: true` automatically;
// the user can still flip the flag manually for individual items.
export const QUANTITY_BASED_DEFAULT_CATEGORIES = new Set<EquipmentCategory>([
  'batteries',
  'cards',
  'adapters',
  'cables',
  'battery_charger',
  'braids_and_reels',
]);

// Suspension status translations for UI
export const EQUIPMENT_SUSPENSION_STATUSES = {
  under_maintenance: 'בתחזוקה',
  broken: 'תקול',
  lost: 'אבד',
  reserved: 'משוריין',
  other: 'אחר',
} as const;

// MongoDB Schema
const equipmentSchema = new Schema<IEquipment>({
  barcode: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  category: {
    type: String,
    required: true,
    // Validated against the `equipment_categories` collection at write time —
    // this is now the single source of truth for valid category slugs
    // (replacing the legacy static enum derived from EQUIPMENT_CATEGORIES).
    //
    // We resolve the model lazily via `mongoose.model('EquipmentCategory')`
    // to avoid a circular import between equipment.models.ts and
    // equipmentCategory.models.ts. Both active AND inactive categories are
    // accepted so a category that's been soft-disabled doesn't invalidate
    // updates to equipment that already references it.
    validate: {
      validator: async function (value: string) {
        if (!value || typeof value !== 'string') return false;
        try {
          const EquipmentCategoryModel = mongoose.model('EquipmentCategory');
          const exists = await EquipmentCategoryModel.exists({ slug: value });
          return !!exists;
        } catch {
          // Model not registered yet (e.g. during boot before the seed has
          // run, or in a non-app script that didn't import it). Fall back
          // to the legacy hardcoded map so writes don't fail before the
          // collection is materialized.
          return Object.prototype.hasOwnProperty.call(EQUIPMENT_CATEGORIES, value);
        }
      },
      message: (props: any) => `Unknown equipment category: ${props.value}`,
    },
  },
  
  // Additional details
  price: Number,
  purchaseDate: Date,
  warrantyExpiryDate: Date,
  company: String,
  equipmentModel: String,
  contactPerson: String,
  manualLink: String,
  imageUrl: String,

  // Optional per-item physical dimensions. All fields are optional so
  // legacy equipment keeps working unchanged; only items with the full
  // length/width/height set contribute to capacity occupancy math.
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

  // Structured storage location (see IEquipment for the rationale —
  // warehouseId/storagePlaceId is the new canonical pair, the embedded
  // `storage` strings are kept for legacy reads).
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null, index: true },
  storagePlaceId: { type: Schema.Types.ObjectId, ref: 'Warehouse.storagePlaces', default: null },
  storage: {
    row: String,
    shelf: String,
    cell: String
  },
  
  // Inventory tracking
  status: { 
    type: String, 
    enum: ['available', 'assigned', 'maintenance', 'broken'],
    default: 'available',
    required: true 
  },
  condition: {
    type: String,
    enum: ['new', 'good', 'fair', 'needs_repair'],
    default: 'good'
  },
  quantityTotal: { 
    type: Number, 
    required: true, 
    default: 1 
  },
  quantityAvailable: { 
    type: Number, 
    required: true, 
    default: 1 
  },
  quantityAssigned: { 
    type: Number, 
    default: 0 
  },
  currentLocation: String,
  
  // Quantity-based items (cables, batteries, consumables, ...) are NOT
  // tracked per-unit by barcode. They live as a pool with adjustable totals.
  isQuantityBased: {
    type: Boolean,
    default: false,
    required: true
  },

  isSharedEngineeringEquipment: {
    type: Boolean,
    default: false,
    required: true
  },

  // Equipment state
  isDisabled: { 
    type: Boolean, 
    default: false,
    required: true 
  },
  disabledAt: Date,
  disabledBy: String,
  disabledReason: String,
  suspensionStatus: {
    type: String,
    enum: Object.keys(EQUIPMENT_SUSPENSION_STATUSES),
  },
  
  // BLE tracker binding
  trackerTagId: { type: Schema.Types.ObjectId, ref: 'TrackerTag', default: null },
  
  // Activity tracking — see IEquipment for usage. We default lastUsedAt to
  // the document's creation time so brand-new equipment isn't immediately
  // flagged as "stale" by the unused-equipment notification job.
  lastUsedAt: { type: Date, default: Date.now },
  unusedNotificationSentAt: Date,
  
  // System fields
  createdBy: String
}, {
  timestamps: true,
  collection: 'equipment'
});

// Indexes for performance
equipmentSchema.index({ category: 1, status: 1 });
equipmentSchema.index({ name: 'text' });
equipmentSchema.index({ status: 1 });
equipmentSchema.index({ isDisabled: 1 });
equipmentSchema.index({ isSharedEngineeringEquipment: 1 });
equipmentSchema.index({ lastUsedAt: 1 });
equipmentSchema.index({ createdAt: -1 });
equipmentSchema.index({ trackerTagId: 1 });

// Pre-save hook to ensure quantityAvailable is correct
equipmentSchema.pre('save', function(next) {
  const equipment = this as IEquipment;
  equipment.quantityAvailable = equipment.quantityTotal - equipment.quantityAssigned;
  next();
});

// Export the model
export const Equipment = mongoose.model<IEquipment>('Equipment', equipmentSchema);

// Barcode generation helper
export async function generateBarcode(category: string): Promise<string> {
  // Get category prefix
  const categoryPrefixes: Record<string, string> = {
    cameras: 'CAM',
    batteries: 'BAT',
    liveu_kits: 'LVU',
    unity_kits: 'UNT',
    monitors: 'MON',
    headphones: 'HDP',
    stabilizers: 'STB',
    cards: 'CRD',
    adapters: 'ADP',
    matrix_components: 'MTX',
    other: 'OTH'
  };
  
  const prefix = categoryPrefixes[category] || 'EQP';
  
  // Find the highest barcode number for this category
  const lastEquipment = await Equipment.findOne({ 
    barcode: { $regex: `^${prefix}` } 
  }).sort({ barcode: -1 });
  
  let nextNumber = 1;
  if (lastEquipment && lastEquipment.barcode) {
    const match = lastEquipment.barcode.match(/(\d+)$/);
    if (match) {
      nextNumber = parseInt(match[1]) + 1;
    }
  }
  
  // Format: PREFIX-YYYY-NNNN (e.g., CAM-2025-0001)
  const year = new Date().getFullYear();
  const paddedNumber = nextNumber.toString().padStart(4, '0');
  
  return `${prefix}-${year}-${paddedNumber}`;
}

// Equipment Assignment Interface
export interface IEquipmentAssignment extends Document {
  _id: mongoose.Types.ObjectId;
  equipmentId: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  eventName: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  status: 'active' | 'completed' | 'cancelled';
  quantityAssigned: number;
  assignedBy?: string;
  assignedByName?: string;
  assignedAt: Date;
  returnedAt?: Date;
  returnedBy?: string;
  returnedByName?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Equipment History Interface
export interface IEquipmentHistory extends Document {
  _id: mongoose.Types.ObjectId;
  equipmentId: mongoose.Types.ObjectId;
  eventId?: mongoose.Types.ObjectId;
  eventName?: string;
  date: Date;
  action: 'assigned' | 'returned' | 'transferred' | 'maintenance' | 'status_change' | 'quantity_adjusted' | 'disabled' | 'enabled' | 'set_assigned' | 'set_returned' | 'item_replaced' | 'item_missing';
  quantity?: number;
  performedBy?: string;
  performedByName?: string;
  notes?: string;
  previousStatus?: string;
  newStatus?: string;
  previousLocation?: string;
  newLocation?: string;
  previousValue?: string;
  newValue?: string;
  transferDetails?: {
    sourceEventId: mongoose.Types.ObjectId;
    sourceEventName: string;
    targetEventId: mongoose.Types.ObjectId;
    targetEventName: string;
    transferredQuantity: number;
  };
  createdAt: Date;
}

// Equipment Assignment Schema
const equipmentAssignmentSchema = new Schema<IEquipmentAssignment>({
  equipmentId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Equipment', 
    required: true,
    index: true 
  },
  eventId: { 
    type: Schema.Types.ObjectId, 
    ref: 'BroadcastEvent', 
    required: true,
    index: true 
  },
  eventName: { 
    type: String, 
    required: true 
  },
  startDate: { 
    type: Date, 
    required: true 
  },
  endDate: { 
    type: Date, 
    required: true 
  },
  location: String,
  status: { 
    type: String, 
    enum: ['active', 'completed', 'cancelled'],
    default: 'active',
    required: true 
  },
  quantityAssigned: { 
    type: Number, 
    required: true, 
    default: 1 
  },
  assignedBy: String,
  assignedByName: String,
  assignedAt: { 
    type: Date, 
    default: Date.now 
  },
  returnedAt: Date,
  returnedBy: String,
  returnedByName: String,
  notes: String
}, {
  timestamps: true,
  collection: 'equipment_assignments'
});

// Equipment History Schema
const equipmentHistorySchema = new Schema<IEquipmentHistory>({
  equipmentId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Equipment', 
    required: true,
    index: true 
  },
  eventId: { 
    type: Schema.Types.ObjectId, 
    ref: 'BroadcastEvent' 
  },
  eventName: String,
  date: { 
    type: Date, 
    required: true, 
    default: Date.now 
  },
  action: { 
    type: String, 
    enum: ['assigned', 'returned', 'transferred', 'maintenance', 'status_change', 'quantity_adjusted', 'disabled', 'enabled', 'set_assigned', 'set_returned', 'item_replaced', 'item_missing'],
    required: true 
  },
  quantity: Number,
  performedBy: String,
  performedByName: String,
  notes: String,
  previousStatus: String,
  newStatus: String,
  previousLocation: String,
  newLocation: String,
  previousValue: String,
  newValue: String,
  transferDetails: {
    sourceEventId: { type: Schema.Types.ObjectId, ref: 'BroadcastEvent' },
    sourceEventName: String,
    targetEventId: { type: Schema.Types.ObjectId, ref: 'BroadcastEvent' },
    targetEventName: String,
    transferredQuantity: Number
  }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'equipment_history'
});

// Indexes for performance
equipmentAssignmentSchema.index({ status: 1, startDate: 1 });
equipmentAssignmentSchema.index({ equipmentId: 1, status: 1 });
equipmentAssignmentSchema.index({ eventId: 1, status: 1 });
equipmentAssignmentSchema.index({ assignedAt: -1 });
equipmentAssignmentSchema.index({ assignedBy: 1 });

equipmentHistorySchema.index({ equipmentId: 1, date: -1 });
equipmentHistorySchema.index({ eventId: 1, date: -1 });
equipmentHistorySchema.index({ action: 1, date: -1 });
equipmentHistorySchema.index({ performedBy: 1, date: -1 });

// Export models
export const EquipmentAssignment = mongoose.model<IEquipmentAssignment>('EquipmentAssignment', equipmentAssignmentSchema);
export const EquipmentHistory = mongoose.model<IEquipmentHistory>('EquipmentHistory', equipmentHistorySchema); 