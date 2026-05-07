import mongoose, { Schema, Document } from 'mongoose';

// ==================== WORKFLOW ENGINE ====================

export interface IWorkflowTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  name: string;
  nameHe?: string;
  description?: string;
  
  // Trigger
  triggerType: 'manual' | 'event_created' | 'event_updated' | 'status_change' | 'scheduled' | 'approval_needed';
  triggerConditions?: any; // JSON conditions
  
  // Steps
  steps: {
    order: number;
    type: 'approval' | 'notification' | 'assignment' | 'status_change' | 'webhook' | 'checklist';
    name: string;
    config: any;
    assigneeType?: 'user' | 'role' | 'department';
    assigneeId?: string;
    timeoutMinutes?: number;
    onTimeout?: 'escalate' | 'auto_approve' | 'reject';
  }[];
  
  // Context
  resourceType: 'broadcast_event' | 'shift' | 'equipment' | 'general';
  
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkflowInstance extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  templateId: mongoose.Types.ObjectId;
  templateName: string;
  
  // Resource being processed
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  
  // Current state
  status: 'in_progress' | 'completed' | 'cancelled' | 'failed' | 'waiting';
  currentStepIndex: number;
  
  // Step history
  stepHistory: {
    stepIndex: number;
    stepName: string;
    status: 'pending' | 'approved' | 'rejected' | 'completed' | 'skipped' | 'timed_out';
    assigneeId?: string;
    assigneeName?: string;
    completedAt?: Date;
    comment?: string;
    metadata?: any;
  }[];
  
  // SLA
  slaDeadline?: Date;
  slaBreached: boolean;
  
  initiatedBy: string;
  initiatedByName?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const workflowTemplateSchema = new Schema<IWorkflowTemplate>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  name: { type: String, required: true },
  nameHe: String,
  description: String,
  
  triggerType: {
    type: String,
    enum: ['manual', 'event_created', 'event_updated', 'status_change', 'scheduled', 'approval_needed'],
    required: true
  },
  triggerConditions: Schema.Types.Mixed,
  
  steps: [{
    order: { type: Number, required: true },
    type: {
      type: String,
      enum: ['approval', 'notification', 'assignment', 'status_change', 'webhook', 'checklist'],
      required: true
    },
    name: { type: String, required: true },
    config: Schema.Types.Mixed,
    assigneeType: {
      type: String,
      enum: ['user', 'role', 'department']
    },
    assigneeId: String,
    timeoutMinutes: Number,
    onTimeout: {
      type: String,
      enum: ['escalate', 'auto_approve', 'reject']
    }
  }],
  
  resourceType: {
    type: String,
    enum: ['broadcast_event', 'shift', 'equipment', 'general'],
    required: true
  },
  
  isActive: { type: Boolean, default: true },
  createdBy: { type: String, required: true },
}, {
  timestamps: true,
});

const workflowInstanceSchema = new Schema<IWorkflowInstance>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  templateId: { type: Schema.Types.ObjectId, ref: 'WorkflowTemplate', required: true },
  templateName: { type: String, required: true },
  
  resourceType: { type: String, required: true },
  resourceId: { type: String, required: true },
  resourceName: String,
  
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'cancelled', 'failed', 'waiting'],
    default: 'in_progress'
  },
  currentStepIndex: { type: Number, default: 0 },
  
  stepHistory: [{
    stepIndex: Number,
    stepName: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'completed', 'skipped', 'timed_out']
    },
    assigneeId: String,
    assigneeName: String,
    completedAt: Date,
    comment: String,
    metadata: Schema.Types.Mixed,
  }],
  
  slaDeadline: Date,
  slaBreached: { type: Boolean, default: false },
  
  initiatedBy: { type: String, required: true },
  initiatedByName: String,
  completedAt: Date,
}, {
  timestamps: true,
});

// Indexes
workflowTemplateSchema.index({ organizationId: 1, isActive: 1 });
workflowTemplateSchema.index({ resourceType: 1, triggerType: 1 });

workflowInstanceSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
workflowInstanceSchema.index({ resourceType: 1, resourceId: 1 });
workflowInstanceSchema.index({ templateId: 1 });
workflowInstanceSchema.index({ 'stepHistory.assigneeId': 1, status: 1 });
workflowInstanceSchema.index({ slaDeadline: 1, slaBreached: 1 });

export const WorkflowTemplate = mongoose.model<IWorkflowTemplate>('WorkflowTemplate', workflowTemplateSchema);
export const WorkflowInstance = mongoose.model<IWorkflowInstance>('WorkflowInstance', workflowInstanceSchema);
