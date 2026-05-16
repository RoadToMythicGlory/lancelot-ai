import mongoose, { Schema, Document } from 'mongoose';

// ==================== BILLING & SUBSCRIPTIONS ====================

export interface ISubscription extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  
  // Plan details
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'paused';
  
  // Stripe integration
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  stripePriceId?: string;
  
  // Billing cycle
  billingCycle: 'monthly' | 'yearly';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  
  // Trial
  trialStart?: Date;
  trialEnd?: Date;
  
  // Limits
  limits: {
    maxUsers: number;
    maxBroadcastEvents: number;
    maxStorageGB: number;
    maxDepartments: number;
    maxApiCalls: number; // per month
  };
  
  // Usage tracking
  currentUsage: {
    users: number;
    broadcastEvents: number;
    storageUsedGB: number;
    departments: number;
    apiCalls: number;
  };
  
  cancelledAt?: Date;
  cancelReason?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface IInvoice extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  
  // Stripe
  stripeInvoiceId?: string;
  stripePaymentIntentId?: string;
  
  // Invoice details
  invoiceNumber: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  currency: string;
  subtotal: number; // in cents
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  
  // Line items
  lineItems: {
    description: string;
    quantity: number;
    unitAmount: number;
    amount: number;
  }[];
  
  // Dates
  periodStart: Date;
  periodEnd: Date;
  dueDate?: Date;
  paidAt?: Date;
  
  // PDF
  invoicePdfUrl?: string;
  hostedInvoiceUrl?: string;
  
  createdAt: Date;
}

export interface IPaymentMethod extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  stripePaymentMethodId: string;
  
  type: 'card' | 'bank_transfer' | 'other';
  brand?: string; // visa, mastercard, etc.
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
  
  isDefault: boolean;
  
  createdAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  
  plan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'past_due', 'cancelled', 'trialing', 'paused'],
    default: 'trialing'
  },
  
  stripeSubscriptionId: { type: String, sparse: true },
  stripeCustomerId: String,
  stripePriceId: String,
  
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly'
  },
  currentPeriodStart: { type: Date, required: true },
  currentPeriodEnd: { type: Date, required: true },
  
  trialStart: Date,
  trialEnd: Date,
  
  limits: {
    maxUsers: { type: Number, default: 5 },
    maxBroadcastEvents: { type: Number, default: 50 },
    maxStorageGB: { type: Number, default: 1 },
    maxDepartments: { type: Number, default: 3 },
    maxApiCalls: { type: Number, default: 1000 },
  },
  
  currentUsage: {
    users: { type: Number, default: 0 },
    broadcastEvents: { type: Number, default: 0 },
    storageUsedGB: { type: Number, default: 0 },
    departments: { type: Number, default: 0 },
    apiCalls: { type: Number, default: 0 },
  },
  
  cancelledAt: Date,
  cancelReason: String,
}, {
  timestamps: true,
});

const invoiceSchema = new Schema<IInvoice>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true },
  
  stripeInvoiceId: { type: String, sparse: true },
  stripePaymentIntentId: String,
  
  invoiceNumber: { type: String, required: true, unique: true },
  status: {
    type: String,
    enum: ['draft', 'open', 'paid', 'void', 'uncollectible'],
    default: 'draft'
  },
  currency: { type: String, default: 'usd' },
  subtotal: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true },
  amountPaid: { type: Number, default: 0 },
  amountDue: { type: Number, required: true },
  
  lineItems: [{
    description: String,
    quantity: Number,
    unitAmount: Number,
    amount: Number,
  }],
  
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  dueDate: Date,
  paidAt: Date,
  
  invoicePdfUrl: String,
  hostedInvoiceUrl: String,
  
  createdAt: { type: Date, default: Date.now },
});

const paymentMethodSchema = new Schema<IPaymentMethod>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  stripePaymentMethodId: { type: String, required: true },
  
  type: {
    type: String,
    enum: ['card', 'bank_transfer', 'other'],
    default: 'card'
  },
  brand: String,
  last4: String,
  expiryMonth: Number,
  expiryYear: Number,
  
  isDefault: { type: Boolean, default: false },
  
  createdAt: { type: Date, default: Date.now },
});

// Indexes
subscriptionSchema.index({ organizationId: 1 }, { unique: true });
subscriptionSchema.index({ stripeSubscriptionId: 1 }, { sparse: true });
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
subscriptionSchema.index({ stripeCustomerId: 1 });
subscriptionSchema.index({ plan: 1, status: 1 });
subscriptionSchema.index({ trialEnd: 1 });

invoiceSchema.index({ organizationId: 1, createdAt: -1 });
invoiceSchema.index({ stripeInvoiceId: 1 }, { sparse: true });
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ subscriptionId: 1, createdAt: -1 });
invoiceSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
invoiceSchema.index({ status: 1, dueDate: 1 });

paymentMethodSchema.index({ organizationId: 1 });
paymentMethodSchema.index({ organizationId: 1, isDefault: 1 });
paymentMethodSchema.index({ stripePaymentMethodId: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);
export const PaymentMethod = mongoose.model<IPaymentMethod>('PaymentMethod', paymentMethodSchema);
