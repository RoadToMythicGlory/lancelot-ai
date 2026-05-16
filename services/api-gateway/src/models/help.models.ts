import mongoose, { Schema, Document } from 'mongoose';

// ==================== HELP & SUPPORT SYSTEM ====================

export interface IHelpArticle extends Document {
  _id: mongoose.Types.ObjectId;
  
  // Content
  title: string;
  titleHe?: string;
  slug: string;
  content: string; // Markdown
  contentHe?: string;
  excerpt?: string;
  excerptHe?: string;
  
  // Classification
  category: 'getting_started' | 'broadcast' | 'mcr' | 'shifts' | 'warehouse' | 'chat' | 'ai' | 'admin' | 'billing' | 'api' | 'troubleshooting';
  tags: string[];
  
  // Ordering
  order: number;
  
  // Status
  isPublished: boolean;
  
  // Analytics
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  
  // Author
  authorId: string;
  authorName: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface ISupportTicket extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  
  // Ticket info
  ticketNumber: string;
  subject: string;
  description: string;
  
  // Classification
  category: 'bug' | 'feature_request' | 'question' | 'billing' | 'account' | 'technical' | 'other';
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'waiting_on_customer' | 'waiting_on_support' | 'resolved' | 'closed';
  
  // People
  createdBy: string;
  createdByName: string;
  createdByEmail: string;
  assignedTo?: string;
  assignedToName?: string;
  
  // Messages
  messages: {
    senderId: string;
    senderName: string;
    senderType: 'customer' | 'support' | 'system';
    message: string;
    attachments?: { name: string; url: string }[];
    createdAt: Date;
  }[];
  
  // Metadata
  tags: string[];
  metadata?: any;
  
  // Resolution
  resolvedAt?: Date;
  closedAt?: Date;
  satisfactionRating?: number; // 1-5
  satisfactionComment?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface IChangelog extends Document {
  _id: mongoose.Types.ObjectId;
  
  // Release info
  version: string;
  title: string;
  titleHe?: string;
  description: string; // Markdown
  descriptionHe?: string;
  
  // Changes
  changes: {
    type: 'feature' | 'improvement' | 'fix' | 'breaking';
    description: string;
    descriptionHe?: string;
  }[];
  
  // Status
  isPublished: boolean;
  publishedAt?: Date;
  
  authorId: string;
  authorName: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const helpArticleSchema = new Schema<IHelpArticle>({
  title: { type: String, required: true },
  titleHe: String,
  slug: { type: String, required: true, unique: true },
  content: { type: String, required: true },
  contentHe: String,
  excerpt: String,
  excerptHe: String,
  
  category: {
    type: String,
    enum: ['getting_started', 'broadcast', 'mcr', 'shifts', 'warehouse', 'chat', 'ai', 'admin', 'billing', 'api', 'troubleshooting'],
    required: true
  },
  tags: [String],
  
  order: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: false },
  
  viewCount: { type: Number, default: 0 },
  helpfulCount: { type: Number, default: 0 },
  notHelpfulCount: { type: Number, default: 0 },
  
  authorId: { type: String, required: true },
  authorName: { type: String, required: true },
}, {
  timestamps: true,
});

const supportTicketSchema = new Schema<ISupportTicket>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  
  ticketNumber: { type: String, required: true, unique: true },
  subject: { type: String, required: true },
  description: { type: String, required: true },
  
  category: {
    type: String,
    enum: ['bug', 'feature_request', 'question', 'billing', 'account', 'technical', 'other'],
    default: 'question'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'critical'],
    default: 'normal'
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'waiting_on_customer', 'waiting_on_support', 'resolved', 'closed'],
    default: 'open'
  },
  
  createdBy: { type: String, required: true },
  createdByName: { type: String, required: true },
  createdByEmail: { type: String, required: true },
  assignedTo: String,
  assignedToName: String,
  
  messages: [{
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    senderType: {
      type: String,
      enum: ['customer', 'support', 'system'],
      required: true
    },
    message: { type: String, required: true },
    attachments: [{
      name: String,
      url: String,
    }],
    createdAt: { type: Date, default: Date.now },
  }],
  
  tags: [String],
  metadata: Schema.Types.Mixed,
  
  resolvedAt: Date,
  closedAt: Date,
  satisfactionRating: { type: Number, min: 1, max: 5 },
  satisfactionComment: String,
}, {
  timestamps: true,
});

const changelogSchema = new Schema<IChangelog>({
  version: { type: String, required: true },
  title: { type: String, required: true },
  titleHe: String,
  description: { type: String, required: true },
  descriptionHe: String,
  
  changes: [{
    type: {
      type: String,
      enum: ['feature', 'improvement', 'fix', 'breaking'],
      required: true
    },
    description: { type: String, required: true },
    descriptionHe: String,
  }],
  
  isPublished: { type: Boolean, default: false },
  publishedAt: Date,
  
  authorId: { type: String, required: true },
  authorName: { type: String, required: true },
}, {
  timestamps: true,
});

// Indexes
helpArticleSchema.index({ slug: 1 }, { unique: true });
helpArticleSchema.index({ category: 1, isPublished: 1, order: 1 });
helpArticleSchema.index({ title: 'text', content: 'text', tags: 'text' });
helpArticleSchema.index({ tags: 1 });
helpArticleSchema.index({ authorId: 1 });
helpArticleSchema.index({ isPublished: 1, updatedAt: -1 });

supportTicketSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
supportTicketSchema.index({ ticketNumber: 1 }, { unique: true });
supportTicketSchema.index({ createdBy: 1, status: 1 });
supportTicketSchema.index({ assignedTo: 1, status: 1 });
supportTicketSchema.index({ organizationId: 1, priority: 1, status: 1 });
supportTicketSchema.index({ organizationId: 1, category: 1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ priority: 1, status: 1, createdAt: -1 });

changelogSchema.index({ isPublished: 1, publishedAt: -1 });
changelogSchema.index({ version: 1 });
changelogSchema.index({ authorId: 1 });

export const HelpArticle = mongoose.model<IHelpArticle>('HelpArticle', helpArticleSchema);
export const SupportTicket = mongoose.model<ISupportTicket>('SupportTicket', supportTicketSchema);
export const Changelog = mongoose.model<IChangelog>('Changelog', changelogSchema);
