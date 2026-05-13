import mongoose, { Schema, Document } from 'mongoose';

// ==================== TrackerTag ====================

export interface ITrackerTag extends Document {
  _id: mongoose.Types.ObjectId;
  bleAddress: string;
  equipmentId?: mongoose.Types.ObjectId;
  label: string;
  status: 'active' | 'lost' | 'retired';
  lastBattery?: number;
  lastTemperature?: number;
  lastSeenAt?: Date;
  lastReadingId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const trackerTagSchema = new Schema<ITrackerTag>({
  bleAddress: {
    type: String,
    required: true,
    unique: true,
    index: true,
    uppercase: true,
    trim: true,
  },
  equipmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Equipment',
    default: null,
  },
  label: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['active', 'lost', 'retired'],
    default: 'active',
    required: true,
  },
  lastBattery: Number,
  lastTemperature: Number,
  lastSeenAt: Date,
  lastReadingId: { type: Schema.Types.ObjectId, ref: 'TrackerReading' },
}, {
  timestamps: true,
  collection: 'tracker_tags',
});

trackerTagSchema.index({ equipmentId: 1 });
trackerTagSchema.index({ status: 1 });

export const TrackerTag = mongoose.model<ITrackerTag>('TrackerTag', trackerTagSchema);

// ==================== TrackerSite ====================

export interface ITrackerSite extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  floorPlanImageUrl?: string;
  widthMeters: number;
  heightMeters: number;
  geoAnchor?: {
    lat: number;
    lng: number;
    rotationDeg: number;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const trackerSiteSchema = new Schema<ITrackerSite>({
  name: { type: String, required: true, trim: true },
  floorPlanImageUrl: String,
  widthMeters: { type: Number, required: true, default: 50 },
  heightMeters: { type: Number, required: true, default: 30 },
  geoAnchor: {
    lat: Number,
    lng: Number,
    rotationDeg: { type: Number, default: 0 },
  },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  collection: 'tracker_sites',
});

export const TrackerSite = mongoose.model<ITrackerSite>('TrackerSite', trackerSiteSchema);

// ==================== TrackerGateway ====================

export interface ITrackerGateway extends Document {
  _id: mongoose.Types.ObjectId;
  gatewayKey: string;
  name: string;
  kind: 'fixed' | 'mobile';
  siteId?: mongoose.Types.ObjectId;
  position?: { x: number; y: number };
  zoneName?: string;
  vehicleLabel?: string;
  lastHeartbeatAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const trackerGatewaySchema = new Schema<ITrackerGateway>({
  gatewayKey: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  kind: {
    type: String,
    enum: ['fixed', 'mobile'],
    required: true,
  },
  siteId: { type: Schema.Types.ObjectId, ref: 'TrackerSite' },
  position: {
    x: Number,
    y: Number,
  },
  zoneName: String,
  vehicleLabel: String,
  lastHeartbeatAt: Date,
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  collection: 'tracker_gateways',
});

trackerGatewaySchema.index({ siteId: 1, kind: 1 });

export const TrackerGateway = mongoose.model<ITrackerGateway>('TrackerGateway', trackerGatewaySchema);

// ==================== TrackerReading ====================

export interface ITrackerReading extends Document {
  _id: mongoose.Types.ObjectId;
  tagId: mongoose.Types.ObjectId;
  gatewayId: mongoose.Types.ObjectId;
  rssi: number;
  battery?: number;
  temperature?: number;
  lat?: number;
  lng?: number;
  ts: Date;
  createdAt: Date;
}

const trackerReadingSchema = new Schema<ITrackerReading>({
  tagId: {
    type: Schema.Types.ObjectId,
    ref: 'TrackerTag',
    required: true,
    index: true,
  },
  gatewayId: {
    type: Schema.Types.ObjectId,
    ref: 'TrackerGateway',
    required: true,
  },
  rssi: { type: Number, required: true },
  battery: Number,
  temperature: Number,
  lat: Number,
  lng: Number,
  ts: { type: Date, required: true, default: Date.now },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'tracker_readings',
});

const retentionDays = parseInt(process.env.TRACKING_RETENTION_DAYS || '30', 10);
trackerReadingSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionDays * 86400 });
trackerReadingSchema.index({ tagId: 1, ts: -1 });

export const TrackerReading = mongoose.model<ITrackerReading>('TrackerReading', trackerReadingSchema);

// ==================== TrackerLatestPosition ====================

export type PositionKind = 'indoor' | 'outdoor' | 'stale';

export interface ITrackerLatestPosition extends Document {
  _id: mongoose.Types.ObjectId;
  tagId: mongoose.Types.ObjectId;
  kind: PositionKind;
  siteId?: mongoose.Types.ObjectId;
  gatewayId: mongoose.Types.ObjectId;
  gatewayName?: string;
  zoneName?: string;
  x?: number;
  y?: number;
  lat?: number;
  lng?: number;
  rssi: number;
  confidence: number;
  computedAt: Date;
}

const trackerLatestPositionSchema = new Schema<ITrackerLatestPosition>({
  tagId: {
    type: Schema.Types.ObjectId,
    ref: 'TrackerTag',
    required: true,
    unique: true,
    index: true,
  },
  kind: {
    type: String,
    enum: ['indoor', 'outdoor', 'stale'],
    required: true,
  },
  siteId: { type: Schema.Types.ObjectId, ref: 'TrackerSite' },
  gatewayId: {
    type: Schema.Types.ObjectId,
    ref: 'TrackerGateway',
    required: true,
  },
  gatewayName: String,
  zoneName: String,
  x: Number,
  y: Number,
  lat: Number,
  lng: Number,
  rssi: { type: Number, required: true },
  confidence: { type: Number, default: 1, min: 0, max: 1 },
  computedAt: { type: Date, required: true, default: Date.now },
}, {
  timestamps: false,
  collection: 'tracker_latest_positions',
});

trackerLatestPositionSchema.index({ siteId: 1 });
trackerLatestPositionSchema.index({ kind: 1 });

export const TrackerLatestPosition = mongoose.model<ITrackerLatestPosition>(
  'TrackerLatestPosition',
  trackerLatestPositionSchema,
);
