import mongoose, { Schema, Document } from 'mongoose';

export interface IRevenueEntry extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  userId: string;

  date: string; // YYYY-MM-DD
  source: string; // twitch_subs, youtube_superchat, sponsorship, podcast_sponsorship, etc.
  amount: number;
  currency: string;
  platform?: string;
  notes?: string;
  relatedStreamId?: string;
  relatedEpisodeId?: string;

  createdAt: Date;
  updatedAt: Date;
}

const revenueEntrySchema = new Schema<IRevenueEntry>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  userId: { type: String, required: true },
  date: { type: String, required: true },
  source: { type: String, required: true },
  amount: { type: Number, required: true, default: 0 },
  currency: { type: String, default: 'USD' },
  platform: String,
  notes: String,
  relatedStreamId: String,
  relatedEpisodeId: String,
}, { timestamps: true });

revenueEntrySchema.index({ organizationId: 1, userId: 1, date: -1 });
revenueEntrySchema.index({ source: 1 });

export const RevenueEntry = mongoose.model<IRevenueEntry>('RevenueEntry', revenueEntrySchema);
