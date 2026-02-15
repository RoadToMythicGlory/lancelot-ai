import { Schema, model, Document, Types } from 'mongoose';

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
  createdBy: Types.ObjectId;
  broadcastEventId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

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

// Indexes for efficient querying
mcrEventSchema.index({ start: 1, end: 1 });
mcrEventSchema.index({ broadcastType: 1 });
mcrEventSchema.index({ createdBy: 1 });
mcrEventSchema.index({ broadcastEventId: 1 });

const MCREvent = model<IMCREvent>('MCREvent', mcrEventSchema);

export default MCREvent;





