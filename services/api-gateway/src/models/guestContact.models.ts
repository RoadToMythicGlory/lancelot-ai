import mongoose, { Schema, Document } from 'mongoose';

export interface IGuestContact extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  userId: string;

  name: string;
  email?: string;
  phone?: string;
  title?: string;
  company?: string;
  bio?: string;
  socialLinks?: { twitter?: string; linkedin?: string; instagram?: string; website?: string };
  avatarUrl?: string;
  topicsExpertise: string[];
  previousAppearances: { episodeId?: string; date?: string; topic?: string }[];
  status: 'potential' | 'contacted' | 'confirmed' | 'declined' | 'appeared';
  rating?: number;
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

const guestContactSchema = new Schema<IGuestContact>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  userId: { type: String, required: true },
  name: { type: String, required: true },
  email: String,
  phone: String,
  title: String,
  company: String,
  bio: String,
  socialLinks: { twitter: String, linkedin: String, instagram: String, website: String },
  avatarUrl: String,
  topicsExpertise: [String],
  previousAppearances: [{ episodeId: String, date: String, topic: String }],
  status: { type: String, enum: ['potential', 'contacted', 'confirmed', 'declined', 'appeared'], default: 'potential' },
  rating: { type: Number, min: 1, max: 5 },
  notes: String,
}, { timestamps: true });

guestContactSchema.index({ organizationId: 1, userId: 1, status: 1 });
guestContactSchema.index({ name: 'text', topicsExpertise: 'text' });

export const GuestContact = mongoose.model<IGuestContact>('GuestContact', guestContactSchema);
