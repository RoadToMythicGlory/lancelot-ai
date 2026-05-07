import mongoose, { Schema, Document } from 'mongoose';

export interface IStreamerActivity extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  userId: string;

  action: string; // e.g., 'stream_scheduled', 'episode_published', 'guest_confirmed', 'clip_created'
  entityType: string; // 'stream', 'episode', 'clip', 'guest', 'equipment', 'collab'
  entityId?: string;
  description: string;
  metadata?: any;

  createdAt: Date;
}

const streamerActivitySchema = new Schema<IStreamerActivity>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  userId: { type: String, required: true },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: String,
  description: { type: String, required: true },
  metadata: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});

streamerActivitySchema.index({ organizationId: 1, userId: 1, createdAt: -1 });

export const StreamerActivity = mongoose.model<IStreamerActivity>('StreamerActivity', streamerActivitySchema);
