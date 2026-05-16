import mongoose, { Schema, Document } from 'mongoose';

// Interfaces for TypeScript
export interface IBroadcastEvent extends Document {
  _id: mongoose.Types.ObjectId;
  eventNumber: number;
  title: string;
  hebrewTitle?: string;
  description?: string;
  eventType: 'live' | 'recorded' | 'remote' | 'studio';
  status: 'planned' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  startTime: Date;
  endTime: Date;
  actualStartTime?: Date;
  actualEndTime?: Date;
  koTime?: Date; // kick-off time for sports
  arrivalTime?: Date; // crew arrival time
  location?: string;
  venue?: string;
  synopsis?: string;
  translationType?: 'translated' | 'sign_language' | 'none';
  outlookEventId?: string;
  
  // Legacy fields for compatibility
  source?: string;
  destination?: string;
  satellite?: string;
  technicalDirectorId?: string;
  controlOperatorId?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  routingConfig?: any;
  metadata?: any;
  
  // Enhanced fields
  channel?: string;
  parallelChannel?: string;
  channel1_4k?: boolean;
  live?: boolean;
  endTimeActual?: Date;
  notes?: string;
  subtitles?: string;
  sport?: string;
  league?: string;
  stage?: string;
  homeTeam?: string;
  awayTeam?: string;
  productionCrew?: any[];
  equipmentList?: any[];
  routingPreset?: string;
  filePath?: string;
  synopsisFile?: string;
  receptionStartTime?: Date;
  gmtStartTime?: Date;
  gmtEndTime?: Date;
  departmentId?: string;
  
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEventStaffAssignment extends Document {
  _id: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  userId: string;
  role: 'videographer' | 'producer' | 'director' | 'editor' | 'soundman' | 'field_tech';
  isConfirmed: boolean;
  notes?: string;
  assignedBy?: string;
  assignedAt: Date;
}

export interface IRoutingConfig extends Document {
  _id: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  routingType: 'primary' | 'backup' | 'emergency';
  controlType: 'mcr' | 'remote' | 'studio';
  templateId?: string; // Reference to MongoDB routing template
  isActive: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoutingSource extends Document {
  routingId: mongoose.Types.ObjectId;
  sourceType: 'camera' | 'liveu' | 'satellite' | 'remote' | 'playback';
  sourceName: string;
  inputNumber?: number;
  equipmentId?: string;
  status: 'pending' | 'approved' | 'active' | 'failed';
  metadata?: any;
  requestedBy?: string;
  approvedBy?: string;
  createdAt: Date;
}

export interface ISatelliteSchedule extends Document {
  satelliteName: string;
  frequency?: string;
  polarization?: string;
  symbolRate?: string;
  eventId: mongoose.Types.ObjectId;
  startTime: Date;
  endTime: Date;
  bookingReference?: string;
  cost?: number;
  status: 'booked' | 'confirmed' | 'active' | 'completed' | 'cancelled';
  createdBy?: string;
  createdAt: Date;
}

// Schemas
const broadcastEventSchema = new Schema<IBroadcastEvent>({
  eventNumber: { type: Number, unique: true },
  title: { type: String, required: true, maxlength: 500 },
  hebrewTitle: { type: String, maxlength: 500 },
  description: String,
  eventType: { 
    type: String, 
    enum: ['live', 'recorded', 'remote', 'studio'],
    required: true 
  },
  status: { 
    type: String, 
    enum: ['planned', 'confirmed', 'in_progress', 'completed', 'cancelled'],
    default: 'planned' 
  },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  actualStartTime: Date,
  actualEndTime: Date,
  koTime: Date,
  arrivalTime: Date,
  location: String,
  venue: String,
  synopsis: String,
  translationType: { 
    type: String, 
    enum: ['translated', 'sign_language', 'none'] 
  },
  outlookEventId: String,
  
  // Legacy fields
  source: String,
  destination: String,
  satellite: String,
  technicalDirectorId: String,
  controlOperatorId: String,
  priority: { 
    type: String, 
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal' 
  },
  routingConfig: { type: Schema.Types.Mixed, default: {} },
  metadata: { type: Schema.Types.Mixed, default: {} },
  
  // Enhanced fields
  channel: String,
  parallelChannel: String,
  channel1_4k: { type: Boolean, default: false },
  live: { type: Boolean, default: false },
  endTimeActual: Date,
  notes: String,
  subtitles: String,
  sport: String,
  league: String,
  stage: String,
  homeTeam: String,
  awayTeam: String,
  productionCrew: [Schema.Types.Mixed],
  equipmentList: [Schema.Types.Mixed],
  routingPreset: String,
  filePath: String,
  synopsisFile: String,
  receptionStartTime: Date,
  gmtStartTime: Date,
  gmtEndTime: Date,
  departmentId: String,
  
  createdBy: String,
}, {
  timestamps: true
});

const eventStaffAssignmentSchema = new Schema<IEventStaffAssignment>({
  eventId: { type: Schema.Types.ObjectId, ref: 'BroadcastEvent', required: true },
  userId: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['videographer', 'producer', 'director', 'editor', 'soundman', 'field_tech'],
    required: true 
  },
  isConfirmed: { type: Boolean, default: false },
  notes: String,
  assignedBy: String,
  assignedAt: { type: Date, default: Date.now }
});

const routingConfigSchema = new Schema<IRoutingConfig>({
  eventId: { type: Schema.Types.ObjectId, ref: 'BroadcastEvent' },
  routingType: { 
    type: String, 
    enum: ['primary', 'backup', 'emergency'],
    required: true 
  },
  controlType: { 
    type: String, 
    enum: ['mcr', 'remote', 'studio'],
    required: true 
  },
  templateId: String,
  isActive: { type: Boolean, default: true },
  approvedBy: String,
  approvedAt: Date,
  createdBy: String,
}, {
  timestamps: true
});

const routingSourceSchema = new Schema<IRoutingSource>({
  routingId: { type: Schema.Types.ObjectId, ref: 'RoutingConfig', required: true },
  sourceType: { 
    type: String, 
    enum: ['camera', 'liveu', 'satellite', 'remote', 'playback'],
    required: true 
  },
  sourceName: { type: String, required: true },
  inputNumber: Number,
  equipmentId: String,
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'active', 'failed'],
    default: 'pending' 
  },
  metadata: { type: Schema.Types.Mixed, default: {} },
  requestedBy: String,
  approvedBy: String,
  createdAt: { type: Date, default: Date.now }
});

const satelliteScheduleSchema = new Schema<ISatelliteSchedule>({
  satelliteName: { type: String, required: true },
  frequency: String,
  polarization: String,
  symbolRate: String,
  eventId: { type: Schema.Types.ObjectId, ref: 'BroadcastEvent' },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  bookingReference: String,
  cost: Number,
  status: { 
    type: String, 
    enum: ['booked', 'confirmed', 'active', 'completed', 'cancelled'],
    default: 'booked' 
  },
  createdBy: String,
  createdAt: { type: Date, default: Date.now }
});

// Counter for auto-incrementing eventNumber
const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', counterSchema);

// Pre-save middleware to auto-increment eventNumber
broadcastEventSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const counter = await Counter.findByIdAndUpdate(
        { _id: 'eventNumber' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.eventNumber = counter.seq;
    } catch (error) {
      return next(error as Error);
    }
  }
  next();
});

// Create indexes
// Single-field indexes for the most common filters and sorts.
broadcastEventSchema.index({ status: 1 });
broadcastEventSchema.index({ startTime: 1, endTime: 1 });
broadcastEventSchema.index({ outlookEventId: 1 });
broadcastEventSchema.index({ departmentId: 1 });
broadcastEventSchema.index({ createdAt: -1 });
broadcastEventSchema.index({ eventType: 1 });
// Compound indexes for common filtered+sorted queries.
broadcastEventSchema.index({ departmentId: 1, status: 1 });
broadcastEventSchema.index({ startTime: 1, departmentId: 1 });
broadcastEventSchema.index({ status: 1, startTime: 1 });

eventStaffAssignmentSchema.index({ eventId: 1 });
eventStaffAssignmentSchema.index({ userId: 1 });
eventStaffAssignmentSchema.index({ role: 1 });
eventStaffAssignmentSchema.index({ userId: 1, eventId: 1 });

routingConfigSchema.index({ eventId: 1 });
routingConfigSchema.index({ isActive: 1 });
routingConfigSchema.index({ eventId: 1, isActive: 1 });

routingSourceSchema.index({ routingId: 1 });
routingSourceSchema.index({ equipmentId: 1 });
routingSourceSchema.index({ status: 1 });

satelliteScheduleSchema.index({ eventId: 1 });
satelliteScheduleSchema.index({ startTime: 1, endTime: 1 });
satelliteScheduleSchema.index({ status: 1 });

// Export models
export const BroadcastEvent = mongoose.model<IBroadcastEvent>('BroadcastEvent', broadcastEventSchema);
export const EventStaffAssignment = mongoose.model<IEventStaffAssignment>('EventStaffAssignment', eventStaffAssignmentSchema);
export const RoutingConfig = mongoose.model<IRoutingConfig>('RoutingConfig', routingConfigSchema);
export const RoutingSource = mongoose.model<IRoutingSource>('RoutingSource', routingSourceSchema);
export const SatelliteSchedule = mongoose.model<ISatelliteSchedule>('SatelliteSchedule', satelliteScheduleSchema); 