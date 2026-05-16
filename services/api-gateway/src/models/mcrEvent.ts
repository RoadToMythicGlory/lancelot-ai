import { Schema, model, Document, Types } from 'mongoose';

export type MCRPreparationStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
export type MCRPlatformStatus = 'PENDING' | 'CONFIRMED' | 'LIVE' | 'OFF';

export interface IMCRFeed {
  _id?: Types.ObjectId | string;
  name?: string;
  satellite?: string;
  frequency?: string;
  symbolRate?: string;
  polarization?: string;
  fec?: string;
  encryptionType?: string;
  encryptionKey?: string;
  bissKey?: string;
  format?: string;
  notes?: string;
}

export interface IMCRContact {
  _id?: Types.ObjectId | string;
  fullName?: string;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface IMCROutputPlatform {
  _id?: Types.ObjectId | string;
  name?: string;
  outputType?: string;
  status?: MCRPlatformStatus;
  details?: string;
}

// Snapshot of a shared engineering equipment assignment ("ציוד הנדסה
// שיתופי"). Persisted on the shadow MCR event so the MCR tab can show
// flagged inventory without having to cross-query the warehouse models on
// every render. Re-derived from `EquipmentAssignment` whenever the
// underlying assignment changes (allocate / return / transfer).
export interface IMCRSharedEngineeringEquipment {
  _id?: Types.ObjectId | string;
  assignmentId: string;
  equipmentId: string;
  equipmentName: string;
  barcode?: string | null;
  category?: string | null;
  quantity: number;
  status: string;
  assignedAt?: Date | null;
  returnedAt?: Date | null;
  assignedByName?: string | null;
  notes?: string | null;
}

export interface IMCREvent extends Document {
  title: string;
  start: Date;
  end: Date;
  broadcastType?: string;
  isMCROnly?: boolean;
  details?: {
    ip?: string;
    port?: string;
    passphrase?: string;
    contact?: string;
    notes?: string;
    satelliteConfig?: string;
    fileContent?: string;
    filePath?: string;
    cameraCount?: number;
  };

  // ===== Operational preparation fields =====
  preparationStatus: MCRPreparationStatus;
  controlStudio?: string;
  broadcastChannel?: string;
  mcrStartTime?: Date;
  mcrEndTime?: Date;
  preparationNotes?: string;
  sourceLabel?: string;
  feeds: IMCRFeed[];
  contacts: IMCRContact[];
  outputPlatforms: IMCROutputPlatform[];
  exchangeGroupIds: string[];
  sharedEngineeringEquipment: IMCRSharedEngineeringEquipment[];

  createdBy: Types.ObjectId;
  broadcastEventId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const feedSchema = new Schema<IMCRFeed>({
  name: { type: String, trim: true },
  satellite: { type: String, trim: true },
  frequency: { type: String, trim: true },
  symbolRate: { type: String, trim: true },
  polarization: { type: String, trim: true },
  fec: { type: String, trim: true },
  encryptionType: { type: String, trim: true },
  encryptionKey: { type: String, trim: true },
  bissKey: { type: String, trim: true },
  format: { type: String, trim: true },
  notes: { type: String },
}, { _id: true });

const contactSchema = new Schema<IMCRContact>({
  fullName: { type: String, trim: true },
  role: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true },
  notes: { type: String },
}, { _id: true });

const outputPlatformSchema = new Schema<IMCROutputPlatform>({
  name: { type: String, trim: true },
  outputType: { type: String, trim: true },
  status: {
    type: String,
    enum: ['PENDING', 'CONFIRMED', 'LIVE', 'OFF'],
    default: 'PENDING',
  },
  details: { type: String },
}, { _id: true });

const sharedEngineeringEquipmentSchema = new Schema<IMCRSharedEngineeringEquipment>({
  assignmentId: { type: String, required: true },
  equipmentId: { type: String, required: true },
  equipmentName: { type: String, required: true },
  barcode: { type: String, default: null },
  category: { type: String, default: null },
  quantity: { type: Number, default: 1 },
  status: { type: String, default: 'active' },
  assignedAt: { type: Date, default: null },
  returnedAt: { type: Date, default: null },
  assignedByName: { type: String, default: null },
  notes: { type: String, default: null },
}, { _id: true });

const mcrEventSchema = new Schema<IMCREvent>({
  title: {
    type: String,
    required: true,
    trim: true
  },
  start: {
    type: Date,
    required: true
  },
  end: {
    type: Date,
    required: true
  },
  broadcastType: {
    type: String,
    enum: [
      'SRT_CALLER',
      'SRT_LISTENER',
      'DVBS2',
      'DVBS2X',
      'NS3',
      'NS4',
      'RTMP',
      'ZIXI',
      'PRT',
      'LIVEU',
      'KLITA_MOU',
      'OTHER'
    ]
  },
  isMCROnly: {
    type: Boolean,
    default: false
  },
  details: {
    ip: String,
    port: String,
    passphrase: String,
    contact: String,
    notes: String,
    satelliteConfig: String,
    fileContent: String,
    filePath: String,
    cameraCount: {
      type: Number,
      default: 1
    }
  },

  // ===== Operational preparation =====
  preparationStatus: {
    type: String,
    enum: ['NOT_STARTED', 'IN_PROGRESS', 'READY'],
    default: 'NOT_STARTED',
    required: true,
  },
  controlStudio: { type: String, trim: true },
  broadcastChannel: { type: String, trim: true },
  mcrStartTime: { type: Date },
  mcrEndTime: { type: Date },
  preparationNotes: { type: String },
  sourceLabel: { type: String, trim: true },
  feeds: { type: [feedSchema], default: [] },
  contacts: { type: [contactSchema], default: [] },
  outputPlatforms: { type: [outputPlatformSchema], default: [] },
  exchangeGroupIds: { type: [String], default: [] },
  sharedEngineeringEquipment: { type: [sharedEngineeringEquipmentSchema], default: [] },

  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  broadcastEventId: {
    type: Schema.Types.ObjectId,
    ref: 'BroadcastEvent'
  }
}, {
  timestamps: true
});

mcrEventSchema.index({ start: 1, end: 1 });
mcrEventSchema.index({ broadcastType: 1 });
mcrEventSchema.index({ createdBy: 1 });
mcrEventSchema.index({ broadcastEventId: 1 });
mcrEventSchema.index({ isMCROnly: 1, start: 1 });
mcrEventSchema.index({ createdBy: 1, start: -1 });
mcrEventSchema.index({ start: -1 });
mcrEventSchema.index({ preparationStatus: 1, start: 1 });

const MCREvent = model<IMCREvent>('MCREvent', mcrEventSchema);

export default MCREvent;
