import mongoose, { Schema, Document } from 'mongoose';

export interface IClip extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  userId: string;

  title: string;
  sourceType: 'stream' | 'podcast';
  sourceStreamId?: string;
  sourceEpisodeId?: string;
  platform?: string;
  clipUrl?: string;
  thumbnailUrl?: string;
  startTimestamp?: number; // seconds
  endTimestamp?: number;
  duration?: number;
  tags: string[];
  status: 'raw' | 'edited' | 'published' | 'archived';
  clipType: 'stream_clip' | 'audiogram' | 'podcast_highlight' | 'video_podcast_clip';
  publishedTo: { platform: string; url?: string; publishedAt?: Date }[];
  viewCount: number;
  likeCount: number;

  createdAt: Date;
  updatedAt: Date;
}

const clipSchema = new Schema<IClip>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  userId: { type: String, required: true },
  title: { type: String, required: true },
  sourceType: { type: String, enum: ['stream', 'podcast'], default: 'stream' },
  sourceStreamId: String,
  sourceEpisodeId: String,
  platform: String,
  clipUrl: String,
  thumbnailUrl: String,
  startTimestamp: Number,
  endTimestamp: Number,
  duration: Number,
  tags: [String],
  status: { type: String, enum: ['raw', 'edited', 'published', 'archived'], default: 'raw' },
  clipType: { type: String, enum: ['stream_clip', 'audiogram', 'podcast_highlight', 'video_podcast_clip'], default: 'stream_clip' },
  publishedTo: [{ platform: String, url: String, publishedAt: Date }],
  viewCount: { type: Number, default: 0 },
  likeCount: { type: Number, default: 0 },
}, { timestamps: true });

clipSchema.index({ organizationId: 1, userId: 1, status: 1 });
clipSchema.index({ sourceStreamId: 1 });
clipSchema.index({ sourceEpisodeId: 1 });

export const Clip = mongoose.model<IClip>('Clip', clipSchema);
