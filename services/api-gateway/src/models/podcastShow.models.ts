import mongoose, { Schema, Document } from 'mongoose';

export interface IPodcastShow extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  userId: string;

  name: string;
  description?: string;
  coverArtUrl?: string;
  category: string;
  language: string;
  authorName?: string;
  websiteUrl?: string;
  rssFeedUrl?: string;
  platforms: { platform: string; profileUrl?: string; subscriberCount?: number }[];
  isActive: boolean;
  totalEpisodes: number;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'irregular';
  averageDurationMinutes?: number;

  createdAt: Date;
  updatedAt: Date;
}

const podcastShowSchema = new Schema<IPodcastShow>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  userId: { type: String, required: true },
  name: { type: String, required: true },
  description: String,
  coverArtUrl: String,
  category: { type: String, default: 'other' },
  language: { type: String, default: 'en' },
  authorName: String,
  websiteUrl: String,
  rssFeedUrl: String,
  platforms: [{ platform: String, profileUrl: String, subscriberCount: Number }],
  isActive: { type: Boolean, default: true },
  totalEpisodes: { type: Number, default: 0 },
  frequency: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly', 'irregular'], default: 'weekly' },
  averageDurationMinutes: Number,
}, { timestamps: true });

podcastShowSchema.index({ organizationId: 1, userId: 1 });

export const PodcastShow = mongoose.model<IPodcastShow>('PodcastShow', podcastShowSchema);
