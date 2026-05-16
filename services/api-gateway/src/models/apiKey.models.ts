import mongoose, { Schema, Document } from 'mongoose';

// ==================== API KEYS & WEBHOOKS ====================

export interface IApiKey extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  
  name: string;
  description?: string;
  keyHash: string; // Hashed API key (never store plaintext)
  keyPrefix: string; // First 8 chars for identification
  
  // Permissions
  scopes: string[]; // e.g., ['broadcasts:read', 'shifts:read', 'shifts:write']
  
  // Rate limiting
  rateLimit: number; // requests per minute
  
  // Status
  isActive: boolean;
  lastUsedAt?: Date;
  usageCount: number;
  
  // Expiry
  expiresAt?: Date;
  
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWebhook extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  
  name: string;
  description?: string;
  url: string;
  secret: string; // For signature verification
  
  // Events to subscribe to
  events: string[]; // e.g., ['broadcast.created', 'broadcast.updated', 'shift.assigned']
  
  // Status
  isActive: boolean;
  
  // Delivery tracking
  lastDeliveryAt?: Date;
  lastDeliveryStatus?: number; // HTTP status code
  consecutiveFailures: number;
  
  // Settings
  retryCount: number; // How many retries on failure
  timeoutSeconds: number;
  
  // Headers
  customHeaders?: { key: string; value: string }[];
  
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWebhookDelivery extends Document {
  _id: mongoose.Types.ObjectId;
  webhookId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  
  event: string;
  payload: any;
  
  // Response
  responseStatus?: number;
  responseBody?: string;
  responseHeaders?: any;
  
  // Status
  status: 'pending' | 'success' | 'failed' | 'retrying';
  attempts: number;
  
  // Timing
  deliveredAt?: Date;
  durationMs?: number;
  nextRetryAt?: Date;
  
  error?: string;
  
  createdAt: Date;
}

const apiKeySchema = new Schema<IApiKey>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  
  name: { type: String, required: true },
  description: String,
  keyHash: { type: String, required: true },
  keyPrefix: { type: String, required: true },
  
  scopes: [{ type: String }],
  
  rateLimit: { type: Number, default: 60 },
  
  isActive: { type: Boolean, default: true },
  lastUsedAt: Date,
  usageCount: { type: Number, default: 0 },
  
  expiresAt: Date,
  
  createdBy: { type: String, required: true },
  createdByName: { type: String, required: true },
}, {
  timestamps: true,
});

const webhookSchema = new Schema<IWebhook>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  
  name: { type: String, required: true },
  description: String,
  url: { type: String, required: true },
  secret: { type: String, required: true },
  
  events: [{ type: String }],
  
  isActive: { type: Boolean, default: true },
  
  lastDeliveryAt: Date,
  lastDeliveryStatus: Number,
  consecutiveFailures: { type: Number, default: 0 },
  
  retryCount: { type: Number, default: 3 },
  timeoutSeconds: { type: Number, default: 30 },
  
  customHeaders: [{
    key: String,
    value: String,
  }],
  
  createdBy: { type: String, required: true },
}, {
  timestamps: true,
});

const webhookDeliverySchema = new Schema<IWebhookDelivery>({
  webhookId: { type: Schema.Types.ObjectId, ref: 'Webhook', required: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  
  event: { type: String, required: true },
  payload: Schema.Types.Mixed,
  
  responseStatus: Number,
  responseBody: String,
  responseHeaders: Schema.Types.Mixed,
  
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'retrying'],
    default: 'pending'
  },
  attempts: { type: Number, default: 0 },
  
  deliveredAt: Date,
  durationMs: Number,
  nextRetryAt: Date,
  
  error: String,
  
  createdAt: { type: Date, default: Date.now },
});

// Indexes
apiKeySchema.index({ organizationId: 1 });
apiKeySchema.index({ keyPrefix: 1 });
apiKeySchema.index({ keyHash: 1 });
apiKeySchema.index({ organizationId: 1, isActive: 1 });
apiKeySchema.index({ expiresAt: 1 });
apiKeySchema.index({ createdBy: 1 });

webhookSchema.index({ organizationId: 1 });
webhookSchema.index({ events: 1, isActive: 1 });
webhookSchema.index({ organizationId: 1, isActive: 1 });
webhookSchema.index({ consecutiveFailures: 1 });

webhookDeliverySchema.index({ webhookId: 1, createdAt: -1 });
webhookDeliverySchema.index({ organizationId: 1, createdAt: -1 });
webhookDeliverySchema.index({ status: 1, nextRetryAt: 1 });
webhookDeliverySchema.index({ webhookId: 1, status: 1 });
webhookDeliverySchema.index({ event: 1, createdAt: -1 });
// TTL - auto-delete deliveries after 30 days
webhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const ApiKey = mongoose.model<IApiKey>('ApiKey', apiKeySchema);
export const Webhook = mongoose.model<IWebhook>('Webhook', webhookSchema);
export const WebhookDelivery = mongoose.model<IWebhookDelivery>('WebhookDelivery', webhookDeliverySchema);
