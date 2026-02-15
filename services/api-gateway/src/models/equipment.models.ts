import mongoose, { Schema, Document } from 'mongoose';

// Interface for TypeScript
export interface IEquipment extends Document {
  _id: mongoose.Types.ObjectId;
  barcode: string;
  name: string;
  category: 'cameras' | 'batteries' | 'liveu_kits' | 'unity_kits' | 'monitors' | 'headphones' | 'stabilizers' | 'cards' | 'adapters' | 'matrix_components' | 'other';
  
  // Additional details
  price?: number;
  purchaseDate?: Date;
  warrantyExpiryDate?: Date;
  company?: string;
  equipmentModel?: string;
  contactPerson?: string;
  manualLink?: string;
  imageUrl?: string;
  
  // Storage location
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
  
  // Equipment state
  isDisabled: boolean;
  disabledAt?: Date;
  disabledBy?: string;
  disabledReason?: string;
  
  // System fields
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Category translations for UI
export const EQUIPMENT_CATEGORIES = {
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
  other: 'אחר'
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
    enum: Object.keys(EQUIPMENT_CATEGORIES),
    required: true 
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
  
  // Storage location
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
  
  // Equipment state
  isDisabled: { 
    type: Boolean, 
    default: false,
    required: true 
  },
  disabledAt: Date,
  disabledBy: String,
  disabledReason: String,
  
  // System fields
  createdBy: String
}, {
  timestamps: true,
  collection: 'equipment'
});

// Indexes for performance
equipmentSchema.index({ category: 1, status: 1 });
equipmentSchema.index({ name: 'text' });

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
  action: 'assigned' | 'returned' | 'transferred' | 'maintenance' | 'status_change' | 'quantity_adjusted' | 'disabled' | 'enabled';
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
    enum: ['assigned', 'returned', 'transferred', 'maintenance', 'status_change', 'quantity_adjusted', 'disabled', 'enabled'],
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
equipmentHistorySchema.index({ equipmentId: 1, date: -1 });

// Export models
export const EquipmentAssignment = mongoose.model<IEquipmentAssignment>('EquipmentAssignment', equipmentAssignmentSchema);
export const EquipmentHistory = mongoose.model<IEquipmentHistory>('EquipmentHistory', equipmentHistorySchema); 