import mongoose, { Schema, Document } from 'mongoose';

export interface IPodcastEpisode extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  userId: string;

  title: string;
  description?: string;
  showName?: string;
  showId?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  scheduledRecordDate?: string;
  scheduledPublishDate?: string;
  recordStartTime?: string;
  recordEndTime?: string;
  status: 'idea' | 'scripted' | 'scheduled' | 'recording' | 'editing' | 'review' | 'published' | 'archived';
  format: 'solo' | 'interview' | 'co_hosted' | 'panel' | 'narrative' | 'live_recording';
  guests: { name: string; title?: string; email?: string; socialHandle?: string; bio?: string; confirmed: boolean }[];
  topics: string[];
  showNotes?: string;
  script?: string;
  recordingFileUrl?: string;
  editedFileUrl?: string;
  coverArtUrl?: string;
  durationMinutes?: number;
  platformsPublished: { platform: string; url?: string; publishedAt?: Date }[];
  tags: string[];
  equipmentChecklist: string[];
  metrics?: {
    downloads?: number;
    listens?: number;
    avgListenDuration?: number;
    completionRate?: number;
    reviews?: number;
    rating?: number;
  };
  monetization?: {
    hasSponsor: boolean;
    sponsorName?: string;
    sponsorReadType?: 'pre_roll' | 'mid_roll' | 'post_roll' | 'host_read';
    sponsorAmount?: number;
    adRevenue?: number;
  };
  relatedStreamId?: string;
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

const podcastEpisodeSchema = new Schema<IPodcastEpisode>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  userId: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  showName: String,
  showId: String,
  episodeNumber: Number,
  seasonNumber: Number,
  scheduledRecordDate: String,
  scheduledPublishDate: String,
  recordStartTime: String,
  recordEndTime: String,
  status: { type: String, enum: ['idea', 'scripted', 'scheduled', 'recording', 'editing', 'review', 'published', 'archived'], default: 'idea' },
  format: { type: String, enum: ['solo', 'interview', 'co_hosted', 'panel', 'narrative', 'live_recording'], default: 'solo' },
  guests: [{ name: String, title: String, email: String, socialHandle: String, bio: String, confirmed: { type: Boolean, default: false } }],
  topics: [String],
  showNotes: String,
  script: String,
  recordingFileUrl: String,
  editedFileUrl: String,
  coverArtUrl: String,
  durationMinutes: Number,
  platformsPublished: [{ platform: String, url: String, publishedAt: Date }],
  tags: [String],
  equipmentChecklist: [String],
  metrics: { downloads: Number, listens: Number, avgListenDuration: Number, completionRate: Number, reviews: Number, rating: Number },
  monetization: { hasSponsor: { type: Boolean, default: false }, sponsorName: String, sponsorReadType: { type: String, enum: ['pre_roll', 'mid_roll', 'post_roll', 'host_read'] }, sponsorAmount: Number, adRevenue: Number },
  relatedStreamId: String,
  notes: String,
}, { timestamps: true });

podcastEpisodeSchema.index({ organizationId: 1, userId: 1, status: 1 });
podcastEpisodeSchema.index({ showId: 1 });
podcastEpisodeSchema.index({ scheduledPublishDate: -1 });
podcastEpisodeSchema.index({ showId: 1, status: 1 });
podcastEpisodeSchema.index({ showId: 1, episodeNumber: -1 });
podcastEpisodeSchema.index({ userId: 1, status: 1, scheduledRecordDate: -1 });
podcastEpisodeSchema.index({ scheduledRecordDate: -1 });
podcastEpisodeSchema.index({ status: 1, scheduledPublishDate: -1 });
podcastEpisodeSchema.index({ relatedStreamId: 1 });
podcastEpisodeSchema.index({ format: 1 });

export const PodcastEpisode = mongoose.model<IPodcastEpisode>('PodcastEpisode', podcastEpisodeSchema);
