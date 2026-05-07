import mongoose, { Schema, Document } from 'mongoose';

export interface IStreamEvent extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  userId: string;

  title: string;
  description?: string;
  platforms: ('twitch' | 'youtube' | 'kick' | 'tiktok')[];
  scheduledDate: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string;
  category?: string; // game/topic
  tags: string[];
  status: 'draft' | 'scheduled' | 'live' | 'completed' | 'cancelled';
  streamType: 'solo' | 'collab' | 'subathon' | 'special_event' | 'restream';
  goLiveReminder: number; // minutes before
  equipmentChecklist: string[]; // equipment IDs
  collaborators: { name: string; platform?: string; role?: string }[];
  notes?: string;
  thumbnailUrl?: string;
  vodUrl?: string;
  isRecurring: boolean;
  recurringPattern?: string;

  metrics?: {
    peakViewers?: number;
    avgViewers?: number;
    chatMessages?: number;
    newFollowers?: number;
    revenue?: number;
  };

  createdAt: Date;
  updatedAt: Date;
}

const streamEventSchema = new Schema<IStreamEvent>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  userId: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  platforms: [{ type: String, enum: ['twitch', 'youtube', 'kick', 'tiktok'] }],
  scheduledDate: { type: String, required: true },
  startTime: String,
  endTime: String,
  category: String,
  tags: [String],
  status: { type: String, enum: ['draft', 'scheduled', 'live', 'completed', 'cancelled'], default: 'draft' },
  streamType: { type: String, enum: ['solo', 'collab', 'subathon', 'special_event', 'restream'], default: 'solo' },
  goLiveReminder: { type: Number, default: 30 },
  equipmentChecklist: [String],
  collaborators: [{ name: String, platform: String, role: String }],
  notes: String,
  thumbnailUrl: String,
  vodUrl: String,
  isRecurring: { type: Boolean, default: false },
  recurringPattern: String,
  metrics: {
    peakViewers: Number,
    avgViewers: Number,
    chatMessages: Number,
    newFollowers: Number,
    revenue: Number,
  },
}, { timestamps: true });

streamEventSchema.index({ organizationId: 1, userId: 1, scheduledDate: -1 });
streamEventSchema.index({ status: 1 });
streamEventSchema.index({ platforms: 1 });

export const StreamEvent = mongoose.model<IStreamEvent>('StreamEvent', streamEventSchema);
