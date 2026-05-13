import { Schema, model, Document, Types } from 'mongoose';

export interface IActivityRow extends Document {
  date: Date;
  activityName: string;
  time: string;
  endTime: string;
  source?: string;
  equipment?: string;
  backup?: string;
  routing?: string;
  channel?: string;
  broadcastType?: string;
  notes?: string;
  status: string;
  isHidden: boolean;
  isManual: boolean;
  broadcastEventId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const activityRowSchema = new Schema<IActivityRow>({
  date: {
    type: Date,
    required: true
  },
  activityName: {
    type: String,
    required: true,
    trim: true
  },
  time: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  source: {
    type: String,
    trim: true
  },
  equipment: {
    type: String,
    trim: true
  },
  backup: {
    type: String,
    trim: true
  },
  routing: {
    type: String,
    trim: true
  },
  channel: {
    type: String,
    trim: true
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
  notes: {
    type: String
  },
  status: {
    type: String,
    enum: ['READY', 'NOT_READY', 'ERROR', 'UNKNOWN'],
    default: 'UNKNOWN',
    required: true
  },
  isHidden: {
    type: Boolean,
    default: false
  },
  isManual: {
    type: Boolean,
    default: false
  },
  broadcastEventId: {
    type: Schema.Types.ObjectId,
    ref: 'BroadcastEvent'
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
activityRowSchema.index({ date: 1, isHidden: 1 });
activityRowSchema.index({ createdBy: 1 });
activityRowSchema.index({ status: 1 });
activityRowSchema.index({ broadcastEventId: 1 });

const ActivityRow = model<IActivityRow>('ActivityRow', activityRowSchema);

export default ActivityRow;





