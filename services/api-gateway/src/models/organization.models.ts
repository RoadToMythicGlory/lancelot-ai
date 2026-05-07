import mongoose, { Schema, Document } from 'mongoose';

// ==================== ORGANIZATION / MULTI-TENANCY ====================

export interface IOrganization extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string; // URL-friendly identifier (subdomain)
  hebrewName?: string;
  logo?: string;
  favicon?: string;
  domain?: string; // Custom domain
  
  // Subscription / billing
  plan: 'free' | 'pro' | 'enterprise';
  planExpiresAt?: Date;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  maxUsers: number;
  maxBroadcastEvents: number;
  maxStorageGB: number;
  
  // Settings
  settings: {
    timezone: string;
    locale: string;
    dateFormat: string;
    defaultChannel?: string;
    brandColor?: string;
    features: {
      chat: boolean;
      aiAgent: boolean;
      warehouse: boolean;
      vizrt: boolean;
      shifts: boolean;
      mcr: boolean;
      broadcasting: boolean;
      liveMonitoring: boolean;
    };
    security: {
      mfaRequired: boolean;
      ssoEnabled: boolean;
      ssoProvider?: string;
      ssoConfig?: any;
      passwordMinLength: number;
      sessionTimeoutMinutes: number;
      ipWhitelist: string[];
    };
  };
  
  // Contact info
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  country?: string;
  
  // Status
  isActive: boolean;
  isTrial: boolean;
  trialEndsAt?: Date;
  
  // Metadata
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrganizationInvite extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  email: string;
  role: string;
  departments: any[];
  invitedBy: string;
  token: string;
  expiresAt: Date;
  acceptedAt?: Date;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  createdAt: Date;
}

const organizationSchema = new Schema<IOrganization>({
  name: { type: String, required: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  hebrewName: { type: String, maxlength: 200 },
  logo: String,
  favicon: String,
  domain: { type: String, unique: true, sparse: true },
  
  // Subscription / billing
  plan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free'
  },
  planExpiresAt: Date,
  stripeCustomerId: { type: String, sparse: true },
  stripeSubscriptionId: { type: String, sparse: true },
  maxUsers: { type: Number, default: 5 },
  maxBroadcastEvents: { type: Number, default: 50 },
  maxStorageGB: { type: Number, default: 1 },
  
  // Settings
  settings: {
    timezone: { type: String, default: 'Asia/Jerusalem' },
    locale: { type: String, default: 'he' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    defaultChannel: String,
    brandColor: { type: String, default: '#3B82F6' },
    features: {
      chat: { type: Boolean, default: true },
      aiAgent: { type: Boolean, default: false },
      warehouse: { type: Boolean, default: true },
      vizrt: { type: Boolean, default: false },
      shifts: { type: Boolean, default: true },
      mcr: { type: Boolean, default: true },
      broadcasting: { type: Boolean, default: true },
      liveMonitoring: { type: Boolean, default: false },
    },
    security: {
      mfaRequired: { type: Boolean, default: false },
      ssoEnabled: { type: Boolean, default: false },
      ssoProvider: String,
      ssoConfig: Schema.Types.Mixed,
      passwordMinLength: { type: Number, default: 8 },
      sessionTimeoutMinutes: { type: Number, default: 480 },
      ipWhitelist: [String],
    }
  },
  
  // Contact info
  contactEmail: String,
  contactPhone: String,
  address: String,
  country: String,
  
  // Status
  isActive: { type: Boolean, default: true },
  isTrial: { type: Boolean, default: true },
  trialEndsAt: Date,
  
  createdBy: String,
}, {
  timestamps: true,
});

const organizationInviteSchema = new Schema<IOrganizationInvite>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  email: { type: String, required: true },
  role: { type: String, required: true },
  departments: [Schema.Types.Mixed],
  invitedBy: { type: String, required: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  acceptedAt: Date,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'expired', 'cancelled'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now },
});

// Indexes
organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ domain: 1 }, { sparse: true });
organizationSchema.index({ stripeCustomerId: 1 }, { sparse: true });
organizationSchema.index({ isActive: 1 });
organizationSchema.index({ plan: 1 });

organizationInviteSchema.index({ organizationId: 1 });
organizationInviteSchema.index({ email: 1 });
organizationInviteSchema.index({ token: 1 }, { unique: true });
organizationInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Organization = mongoose.model<IOrganization>('Organization', organizationSchema);
export const OrganizationInvite = mongoose.model<IOrganizationInvite>('OrganizationInvite', organizationInviteSchema);
