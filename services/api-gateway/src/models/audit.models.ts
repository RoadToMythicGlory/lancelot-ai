import mongoose, { Schema, Document } from 'mongoose';

// ==================== AUDIT LOGGING ====================

export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  userId: string;
  userEmail: string;
  userName: string;
  
  // Action details
  action: string; // e.g., 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'
  resource: string; // e.g., 'broadcast_event', 'shift', 'user', 'equipment'
  resourceId?: string;
  resourceName?: string;
  
  // Change details
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  
  // Context
  ipAddress?: string;
  userAgent?: string;
  graphqlOperation?: string;
  
  // Severity
  severity: 'info' | 'warning' | 'critical';
  
  // Metadata
  metadata?: any;
  
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  userId: { type: String, required: true },
  userEmail: { type: String, required: true },
  userName: { type: String, required: true },
  
  action: { type: String, required: true, index: true },
  resource: { type: String, required: true, index: true },
  resourceId: String,
  resourceName: String,
  
  changes: [{
    field: String,
    oldValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed,
  }],
  
  ipAddress: String,
  userAgent: String,
  graphqlOperation: String,
  
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  },
  
  metadata: Schema.Types.Mixed,
  
  createdAt: { type: Date, default: Date.now },
}, {
  timestamps: false, // We only need createdAt, audit logs are immutable
});

// Indexes for efficient querying
auditLogSchema.index({ organizationId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ severity: 1 });
auditLogSchema.index({ organizationId: 1, resource: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, severity: 1, createdAt: -1 });
// TTL index - auto-delete after 365 days (configurable)
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
