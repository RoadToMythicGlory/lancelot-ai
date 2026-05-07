import mongoose, { Schema, Document } from 'mongoose';

// ==================== RIGHTS & LICENSING MANAGEMENT ====================

export interface IBroadcastRight extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  
  // Content identification
  title: string;
  titleHe?: string;
  contentType: 'sports' | 'entertainment' | 'news' | 'documentary' | 'movie' | 'series' | 'other';
  sport?: string;
  league?: string;
  season?: string;
  
  // Rights holder
  rightsHolder: string;
  contractNumber?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  
  // Territory & Platform
  territories: string[]; // Country codes
  platforms: ('linear_tv' | 'ott' | 'web' | 'mobile' | 'social_media' | 'radio')[];
  channels: string[]; // Allowed channels
  
  // Time period
  startDate: Date;
  endDate: Date;
  
  // Restrictions
  blackoutRegions?: string[];
  blackoutTimes?: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }[];
  maxRebroadcasts?: number;
  delayMinutes?: number; // Delayed broadcast requirement
  exclusivity: 'exclusive' | 'non_exclusive' | 'co_exclusive';
  
  // Financial
  cost: number;
  currency: string;
  paymentTerms?: string;
  paymentSchedule?: {
    dueDate: Date;
    amount: number;
    status: 'pending' | 'paid' | 'overdue';
  }[];
  
  // Status
  status: 'draft' | 'active' | 'expiring_soon' | 'expired' | 'terminated';
  
  // Documents
  contractDocuments?: {
    name: string;
    url: string;
    uploadedAt: Date;
  }[];
  
  // Notifications
  expiryNotificationSent: boolean;
  expiryNotificationDays: number[]; // e.g., [90, 30, 7]
  
  notes?: string;
  
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const broadcastRightSchema = new Schema<IBroadcastRight>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  
  title: { type: String, required: true },
  titleHe: String,
  contentType: {
    type: String,
    enum: ['sports', 'entertainment', 'news', 'documentary', 'movie', 'series', 'other'],
    required: true
  },
  sport: String,
  league: String,
  season: String,
  
  rightsHolder: { type: String, required: true },
  contractNumber: String,
  contactPerson: String,
  contactEmail: String,
  contactPhone: String,
  
  territories: [{ type: String }],
  platforms: [{
    type: String,
    enum: ['linear_tv', 'ott', 'web', 'mobile', 'social_media', 'radio']
  }],
  channels: [{ type: String }],
  
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  
  blackoutRegions: [String],
  blackoutTimes: [{
    dayOfWeek: Number,
    startTime: String,
    endTime: String,
  }],
  maxRebroadcasts: Number,
  delayMinutes: Number,
  exclusivity: {
    type: String,
    enum: ['exclusive', 'non_exclusive', 'co_exclusive'],
    default: 'non_exclusive'
  },
  
  cost: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  paymentTerms: String,
  paymentSchedule: [{
    dueDate: Date,
    amount: Number,
    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue'],
      default: 'pending'
    }
  }],
  
  status: {
    type: String,
    enum: ['draft', 'active', 'expiring_soon', 'expired', 'terminated'],
    default: 'draft'
  },
  
  contractDocuments: [{
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now },
  }],
  
  expiryNotificationSent: { type: Boolean, default: false },
  expiryNotificationDays: {
    type: [Number],
    default: [90, 30, 7]
  },
  
  notes: String,
  
  createdBy: { type: String, required: true },
}, {
  timestamps: true,
});

// Indexes
broadcastRightSchema.index({ organizationId: 1, status: 1 });
broadcastRightSchema.index({ endDate: 1, status: 1 });
broadcastRightSchema.index({ contentType: 1, sport: 1, league: 1 });
broadcastRightSchema.index({ rightsHolder: 1 });
broadcastRightSchema.index({ territories: 1 });
broadcastRightSchema.index({ title: 'text', rightsHolder: 'text' });

export const BroadcastRightManaged = mongoose.model<IBroadcastRight>('BroadcastRightManaged', broadcastRightSchema);
