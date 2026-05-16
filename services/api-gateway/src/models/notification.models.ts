import mongoose, { Schema, Document } from 'mongoose';

// ==================== NOTIFICATIONS ====================

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  recipientId: string;
  
  // Content
  type: 'info' | 'warning' | 'error' | 'success' | 'broadcast' | 'shift' | 'approval' | 'system';
  title: string;
  titleHe?: string;
  message: string;
  messageHe?: string;
  
  // Linking
  resource?: string; // e.g., 'broadcast_event', 'shift', 'equipment'
  resourceId?: string;
  actionUrl?: string;
  
  // Status
  isRead: boolean;
  readAt?: Date;
  isDismissed: boolean;
  
  // Delivery
  channels: ('in_app' | 'email' | 'push' | 'sms')[];
  emailSent: boolean;
  pushSent: boolean;
  
  // Sender
  senderId?: string;
  senderName?: string;
  
  // Priority
  priority: 'low' | 'normal' | 'high' | 'urgent';
  
  // Metadata
  metadata?: any;
  
  createdAt: Date;
  expiresAt?: Date;
}

export interface INotificationPreference extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  organizationId?: mongoose.Types.ObjectId;
  
  // Channel preferences per notification type
  preferences: {
    broadcast_created: { inApp: boolean; email: boolean; push: boolean };
    broadcast_updated: { inApp: boolean; email: boolean; push: boolean };
    broadcast_cancelled: { inApp: boolean; email: boolean; push: boolean };
    shift_assigned: { inApp: boolean; email: boolean; push: boolean };
    shift_swap_request: { inApp: boolean; email: boolean; push: boolean };
    shift_reminder: { inApp: boolean; email: boolean; push: boolean };
    approval_required: { inApp: boolean; email: boolean; push: boolean };
    approval_resolved: { inApp: boolean; email: boolean; push: boolean };
    equipment_assigned: { inApp: boolean; email: boolean; push: boolean };
    system_alert: { inApp: boolean; email: boolean; push: boolean };
    chat_message: { inApp: boolean; email: boolean; push: boolean };
  };
  
  // Global settings
  muteAll: boolean;
  muteUntil?: Date;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string; // "07:00"
  
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  recipientId: { type: String, required: true },
  
  type: {
    type: String,
    enum: ['info', 'warning', 'error', 'success', 'broadcast', 'shift', 'approval', 'system'],
    required: true
  },
  title: { type: String, required: true },
  titleHe: String,
  message: { type: String, required: true },
  messageHe: String,
  
  resource: String,
  resourceId: String,
  actionUrl: String,
  
  isRead: { type: Boolean, default: false },
  readAt: Date,
  isDismissed: { type: Boolean, default: false },
  
  channels: [{
    type: String,
    enum: ['in_app', 'email', 'push', 'sms']
  }],
  emailSent: { type: Boolean, default: false },
  pushSent: { type: Boolean, default: false },
  
  senderId: String,
  senderName: String,
  
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  metadata: Schema.Types.Mixed,
  
  createdAt: { type: Date, default: Date.now },
  expiresAt: Date,
});

const notificationPreferenceSchema = new Schema<INotificationPreference>({
  userId: { type: String, required: true, unique: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  
  preferences: {
    broadcast_created: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    broadcast_updated: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      push: { type: Boolean, default: false },
    },
    broadcast_cancelled: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    shift_assigned: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    shift_swap_request: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: false },
    },
    shift_reminder: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    approval_required: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    approval_resolved: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: false },
    },
    equipment_assigned: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      push: { type: Boolean, default: false },
    },
    system_alert: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    chat_message: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
    },
  },
  
  muteAll: { type: Boolean, default: false },
  muteUntil: Date,
  quietHoursStart: String,
  quietHoursEnd: String,
  
  updatedAt: { type: Date, default: Date.now },
});

// Indexes
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, type: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ recipientId: 1, isDismissed: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, priority: 1, createdAt: -1 });
notificationSchema.index({ resource: 1, resourceId: 1 });
notificationSchema.index({ senderId: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });

notificationPreferenceSchema.index({ userId: 1 }, { unique: true });
notificationPreferenceSchema.index({ organizationId: 1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
export const NotificationPreference = mongoose.model<INotificationPreference>('NotificationPreference', notificationPreferenceSchema);
