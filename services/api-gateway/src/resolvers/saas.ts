import { ObjectId } from 'mongodb';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { connectMongoDB } from '../config/mongodb';
import { Organization } from '../models/organization.models';
import { AuditLog } from '../models/audit.models';
import { Notification, NotificationPreference } from '../models/notification.models';
import { WorkflowTemplate, WorkflowInstance } from '../models/workflow.models';
import { MediaAsset, MediaFolder } from '../models/mediaAsset.models';
import { BroadcastRightManaged } from '../models/rights.models';
import { HelpArticle, SupportTicket, Changelog } from '../models/help.models';
import { ApiKey, Webhook, WebhookDelivery } from '../models/apiKey.models';
import { withFilter } from 'graphql-subscriptions';
import { pubsub } from '../utils/pubsub';
import { requireAuth as requireAuthMiddleware } from '../middleware/auth';

// NOTE: This module is the ex-SaaS resolver bundle. The product is now
// deployed on-prem for a single company, so multi-tenant signup, billing,
// invoicing, and subscription operations were removed. We keep the
// `saasResolvers` export name for compatibility with `index.ts` wiring.

function assertValidObjectId(id: string, resourceName: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`Invalid ${resourceName} ID`);
  }
}

// ==================== HELPER FUNCTIONS ====================

async function requireAuth(context: any) {
  requireAuthMiddleware(context);
  const db = await connectMongoDB();
  const user = await db.collection('users').findOne({ _id: new ObjectId(context.user.userId) });
  if (!user) throw new Error('User not found');
  return user;
}

function requireSystemAdmin(user: any) {
  if (!['SYSTEM_ADMIN', 'IT_ADMIN'].includes(user.systemRole)) {
    throw new Error('Unauthorized: System admin access required');
  }
}

/**
 * Singleton site/company settings record. On-prem deployments don't have
 * organization signup; we lazily create a default doc the first time it's
 * accessed and cache the id in-process so writes always update the same row.
 */
let cachedSiteOrgId: mongoose.Types.ObjectId | null = null;
async function getOrCreateSiteOrg() {
  if (cachedSiteOrgId) {
    const cached = await Organization.findById(cachedSiteOrgId);
    if (cached) return cached;
    cachedSiteOrgId = null;
  }
  let org = await Organization.findOne().sort({ createdAt: 1 });
  if (!org) {
    org = await Organization.create({
      name: 'Site',
      slug: 'site',
      isActive: true,
    });
  }
  cachedSiteOrgId = org._id;
  return org;
}

async function createAuditEntry(params: {
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  resource: string;
  resourceId?: string;
  resourceName?: string;
  changes?: any[];
  severity?: string;
  metadata?: any;
}) {
  try {
    await AuditLog.create({
      ...params,
      severity: params.severity || 'info',
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}

function generateTicketNumber(): string {
  const date = new Date();
  const prefix = `TKT-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${random}`;
}

// ==================== RESOLVERS ====================

export const saasResolvers = {
  Query: {
    // ---- Site / Company settings (single-tenant) ----
    myOrganization: async (_: any, __: any, context: any) => {
      await requireAuth(context);
      const org = await getOrCreateSiteOrg();
      return { ...org.toObject(), id: org._id.toString() };
    },

    // ---- Audit Logs ----
    auditLogs: async (_: any, { filter, limit = 50, offset = 0 }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);

      const query: any = {};
      if (filter) {
        if (filter.userId) query.userId = filter.userId;
        if (filter.action) query.action = filter.action;
        if (filter.resource) query.resource = filter.resource;
        if (filter.resourceId) query.resourceId = filter.resourceId;
        if (filter.severity) query.severity = filter.severity.toLowerCase();
        if (filter.startDate || filter.endDate) {
          query.createdAt = {};
          if (filter.startDate) query.createdAt.$gte = new Date(filter.startDate);
          if (filter.endDate) query.createdAt.$lte = new Date(filter.endDate);
        }
        if (filter.searchTerm) {
          query.$or = [
            { userName: { $regex: filter.searchTerm, $options: 'i' } },
            { resourceName: { $regex: filter.searchTerm, $options: 'i' } },
            { action: { $regex: filter.searchTerm, $options: 'i' } },
          ];
        }
      }

      const [items, totalCount] = await Promise.all([
        AuditLog.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit),
        AuditLog.countDocuments(query),
      ]);

      return {
        items: items.map(i => ({ ...i.toObject(), id: i._id.toString() })),
        totalCount,
        hasMore: offset + limit < totalCount,
      };
    },

    // ---- Notifications ----
    notifications: async (_: any, { limit = 20, offset = 0, unreadOnly = false }: any, context: any) => {
      const user = await requireAuth(context);
      const query: any = { recipientId: user._id.toString() };
      if (unreadOnly) query.isRead = false;

      const [items, totalCount, unreadCount] = await Promise.all([
        Notification.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit),
        Notification.countDocuments({ recipientId: user._id.toString() }),
        Notification.countDocuments({ recipientId: user._id.toString(), isRead: false }),
      ]);

      return {
        items: items.map(i => ({ ...i.toObject(), id: i._id.toString() })),
        totalCount,
        unreadCount,
        hasMore: offset + limit < totalCount,
      };
    },

    notificationPreferences: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      let prefs = await NotificationPreference.findOne({ userId: user._id.toString() });
      if (!prefs) {
        prefs = await NotificationPreference.create({ userId: user._id.toString() });
      }
      return { ...prefs.toObject(), id: prefs._id.toString() };
    },

    // ---- Workflows ----
    workflowTemplates: async (_: any, { resourceType, limit = 200, offset = 0 }: any, context: any) => {
      await requireAuth(context);
      const query: any = {};
      if (resourceType) query.resourceType = resourceType;
      const boundedLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
      const boundedOffset = Math.max(Number(offset) || 0, 0);
      const templates = await WorkflowTemplate.find(query).sort({ createdAt: -1 }).skip(boundedOffset).limit(boundedLimit);
      return templates.map(t => ({ ...t.toObject(), id: t._id.toString() }));
    },

    workflowTemplate: async (_: any, { id }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'workflow template');
      const t = await WorkflowTemplate.findById(id);
      return t ? { ...t.toObject(), id: t._id.toString() } : null;
    },

    workflowInstances: async (_: any, { status, resourceType, limit = 20, offset = 0 }: any, context: any) => {
      await requireAuth(context);
      const query: any = {};
      if (status) query.status = status.toLowerCase();
      if (resourceType) query.resourceType = resourceType;
      const boundedLimit = Math.min(Math.max(Number(limit) || 20, 1), 500);
      const boundedOffset = Math.max(Number(offset) || 0, 0);
      const instances = await WorkflowInstance.find(query).sort({ createdAt: -1 }).skip(boundedOffset).limit(boundedLimit);
      return instances.map(i => ({ ...i.toObject(), id: i._id.toString() }));
    },

    workflowInstance: async (_: any, { id }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'workflow instance');
      const i = await WorkflowInstance.findById(id);
      return i ? { ...i.toObject(), id: i._id.toString() } : null;
    },

    myPendingApprovals: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      const instances = await WorkflowInstance.find({
        status: { $in: ['in_progress', 'waiting'] },
        'stepHistory.assigneeId': user._id.toString(),
        'stepHistory.status': 'pending',
      }).sort({ createdAt: -1 }).limit(500);
      return instances.map(i => ({ ...i.toObject(), id: i._id.toString() }));
    },

    // ---- Media Assets ----
    mediaAssets: async (_: any, { filter, limit = 20, offset = 0 }: any, context: any) => {
      await requireAuth(context);
      const query: any = { status: { $ne: 'deleted' } };

      if (filter) {
        if (filter.type) query.type = filter.type.toLowerCase();
        if (filter.category) query.category = filter.category;
        if (filter.status) query.status = filter.status.toLowerCase();
        if (filter.tags?.length) query.tags = { $in: filter.tags };
        if (filter.uploadedBy) query.uploadedBy = filter.uploadedBy;
        if (filter.folderId) query.folderId = filter.folderId;
        if (filter.searchTerm) {
          query.$or = [
            { title: { $regex: filter.searchTerm, $options: 'i' } },
            { description: { $regex: filter.searchTerm, $options: 'i' } },
            { tags: { $regex: filter.searchTerm, $options: 'i' } },
          ];
        }
      }

      const [items, totalCount] = await Promise.all([
        MediaAsset.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit),
        MediaAsset.countDocuments(query),
      ]);

      return {
        items: items.map(i => ({ ...i.toObject(), id: i._id.toString() })),
        totalCount,
        hasMore: offset + limit < totalCount,
      };
    },

    mediaAsset: async (_: any, { id }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'media asset');
      const asset = await MediaAsset.findById(id);
      return asset ? { ...asset.toObject(), id: asset._id.toString() } : null;
    },

    mediaFolders: async (_: any, { parentFolderId }: any, context: any) => {
      await requireAuth(context);
      const query: any = {};
      if (parentFolderId) {
        query.parentFolderId = parentFolderId;
      } else {
        query.parentFolderId = { $exists: false };
      }
      const folders = await MediaFolder.find(query).sort({ name: 1 }).limit(500);
      return folders.map(f => ({ ...f.toObject(), id: f._id.toString() }));
    },

    // ---- Rights & Licensing ----
    broadcastRights: async (_: any, { filter, limit = 20, offset = 0 }: any, context: any) => {
      await requireAuth(context);
      const query: any = {};

      if (filter) {
        if (filter.contentType) query.contentType = filter.contentType;
        if (filter.sport) query.sport = filter.sport;
        if (filter.league) query.league = filter.league;
        if (filter.status) query.status = filter.status.toLowerCase();
        if (filter.rightsHolder) query.rightsHolder = { $regex: filter.rightsHolder, $options: 'i' };
        if (filter.searchTerm) {
          query.$or = [
            { title: { $regex: filter.searchTerm, $options: 'i' } },
            { rightsHolder: { $regex: filter.searchTerm, $options: 'i' } },
          ];
        }
        if (filter.expiringWithinDays) {
          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + filter.expiringWithinDays);
          query.endDate = { $lte: futureDate, $gte: new Date() };
          query.status = { $ne: 'expired' };
        }
      }

      const items = await BroadcastRightManaged.find(query).sort({ endDate: 1 }).skip(offset).limit(limit);
      return items.map(i => ({ ...i.toObject(), id: i._id.toString() }));
    },

    broadcastRight: async (_: any, { id }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'broadcast right');
      const right = await BroadcastRightManaged.findById(id);
      return right ? { ...right.toObject(), id: right._id.toString() } : null;
    },

    expiringRights: async (_: any, { days }: any, context: any) => {
      await requireAuth(context);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      const query: any = {
        endDate: { $lte: futureDate, $gte: new Date() },
        status: { $ne: 'expired' },
      };
      const items = await BroadcastRightManaged.find(query).sort({ endDate: 1 }).limit(500);
      return items.map(i => ({ ...i.toObject(), id: i._id.toString() }));
    },

    // ---- Help articles & changelog ----
    helpArticles: async (_: any, { category, searchTerm }: any) => {
      const query: any = { isPublished: true };
      if (category) query.category = category;
      if (searchTerm) {
        query.$or = [
          { title: { $regex: searchTerm, $options: 'i' } },
          { content: { $regex: searchTerm, $options: 'i' } },
          { tags: { $regex: searchTerm, $options: 'i' } },
        ];
      }
      const articles = await HelpArticle.find(query).sort({ order: 1, createdAt: -1 }).limit(500);
      return articles.map(a => ({ ...a.toObject(), id: a._id.toString() }));
    },

    helpArticle: async (_: any, { slug }: any) => {
      const article = await HelpArticle.findOneAndUpdate(
        { slug, isPublished: true },
        { $inc: { viewCount: 1 } },
        { new: true }
      );
      return article ? { ...article.toObject(), id: article._id.toString() } : null;
    },

    changelog: async (_: any, { limit = 20 }: any) => {
      const items = await Changelog.find({ isPublished: true }).sort({ publishedAt: -1 }).limit(limit);
      return items.map(c => ({ ...c.toObject(), id: c._id.toString() }));
    },

    // ---- Internal IT support tickets ----
    itTickets: async (_: any, { status, limit = 20, offset = 0 }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const query: any = {};
      if (status) query.status = status.toLowerCase();
      const tickets = await SupportTicket.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit);
      return tickets.map(t => ({ ...t.toObject(), id: t._id.toString() }));
    },

    itTicket: async (_: any, { id }: any, context: any) => {
      const user = await requireAuth(context);
      assertValidObjectId(id, 'support ticket');
      const ticket = await SupportTicket.findById(id);
      if (!ticket) return null;
      // Non-admins may only read their own tickets.
      const isStaff = ['SYSTEM_ADMIN', 'IT_ADMIN'].includes(user.systemRole);
      if (!isStaff && String(ticket.createdBy) !== String(user._id)) {
        throw new Error('Unauthorized: You can only view your own tickets');
      }
      return { ...ticket.toObject(), id: ticket._id.toString() };
    },

    myItTickets: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      const tickets = await SupportTicket.find({ createdBy: user._id.toString() }).sort({ createdAt: -1 }).limit(500);
      return tickets.map(t => ({ ...t.toObject(), id: t._id.toString() }));
    },

    // ---- API Keys & Webhooks ----
    apiKeys: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const keys = await ApiKey.find().sort({ createdAt: -1 }).limit(500);
      return keys.map(k => ({ ...k.toObject(), id: k._id.toString() }));
    },

    webhooks: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const hooks = await Webhook.find().sort({ createdAt: -1 }).limit(500);
      return hooks.map(h => ({ ...h.toObject(), id: h._id.toString() }));
    },

    webhookDeliveries: async (_: any, { webhookId, limit = 50 }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      assertValidObjectId(webhookId, 'webhook');
      const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
      const deliveries = await WebhookDelivery.find({ webhookId }).sort({ createdAt: -1 }).limit(boundedLimit);
      return deliveries.map(d => ({ ...d.toObject(), id: d._id.toString() }));
    },

    // ---- Live Monitoring ----
    liveStreams: async (_: any, __: any, context: any) => {
      await requireAuth(context);
      return [];
    },

    signalMonitor: async (_: any, __: any, context: any) => {
      await requireAuth(context);
      return [];
    },

    // ---- Global Search ----
    globalSearch: async (_: any, { query, types, limit = 10 }: any, context: any) => {
      await requireAuth(context);
      const db = await connectMongoDB();
      const results: any = {};
      const searchTypes = types || ['broadcasts', 'users', 'equipment', 'shifts', 'media'];

      if (searchTypes.includes('broadcasts')) {
        const broadcasts = await db.collection('broadcastevents').find({
          $or: [
            { title: { $regex: query, $options: 'i' } },
            { hebrewTitle: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
          ]
        }).limit(limit).toArray();
        results.broadcasts = broadcasts.map((b: any) => ({ ...b, id: b._id.toString() }));
      }

      if (searchTypes.includes('users')) {
        const users = await db.collection('users').find({
          $or: [
            { firstName: { $regex: query, $options: 'i' } },
            { lastName: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } },
          ]
        }).limit(limit).toArray();
        results.users = users.map((u: any) => ({ ...u, id: u._id.toString(), displayName: `${u.firstName} ${u.lastName}` }));
      }

      if (searchTypes.includes('equipment')) {
        const equipment = await db.collection('equipment').find({
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { barcode: { $regex: query, $options: 'i' } },
            { brand: { $regex: query, $options: 'i' } },
          ]
        }).limit(limit).toArray();
        results.equipment = equipment.map((e: any) => ({ ...e, id: e._id.toString() }));
      }

      if (searchTypes.includes('media')) {
        const media = await MediaAsset.find({
          $or: [
            { title: { $regex: query, $options: 'i' } },
            { tags: { $regex: query, $options: 'i' } },
          ],
          status: { $ne: 'deleted' },
        }).limit(limit);
        results.media = media.map(m => ({ ...m.toObject(), id: m._id.toString() }));
      }

      return results;
    },
  },

  Mutation: {
    // ---- Site / Company settings ----
    updateOrganization: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const org = await getOrCreateSiteOrg();
      Object.assign(org, input);
      await org.save();

      await createAuditEntry({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'UPDATE',
        resource: 'organization',
        resourceId: org._id.toString(),
        resourceName: org.name,
      });

      return { ...org.toObject(), id: org._id.toString() };
    },

    updateOrganizationSettings: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const org = await getOrCreateSiteOrg();
      const updateFields: any = {};
      for (const [key, value] of Object.entries(input)) {
        updateFields[`settings.${key}`] = value;
      }
      const updated = await Organization.findByIdAndUpdate(
        org._id,
        { $set: updateFields },
        { new: true }
      );
      return { ...updated!.toObject(), id: updated!._id.toString() };
    },

    updateFeatureFlags: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const org = await getOrCreateSiteOrg();
      const updateFields: any = {};
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) updateFields[`settings.features.${key}`] = value;
      }
      const updated = await Organization.findByIdAndUpdate(
        org._id,
        { $set: updateFields },
        { new: true }
      );
      return { ...updated!.toObject(), id: updated!._id.toString() };
    },

    updateSecuritySettings: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const org = await getOrCreateSiteOrg();
      const updateFields: any = {};
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) updateFields[`settings.security.${key}`] = value;
      }
      const updated = await Organization.findByIdAndUpdate(
        org._id,
        { $set: updateFields },
        { new: true }
      );

      await createAuditEntry({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'UPDATE',
        resource: 'security_settings',
        severity: 'warning',
      });

      return { ...updated!.toObject(), id: updated!._id.toString() };
    },

    // ---- Notifications ----
    markNotificationRead: async (_: any, { id }: any, context: any) => {
      const user = await requireAuth(context);
      assertValidObjectId(id, 'notification');
      const notif = await Notification.findOneAndUpdate(
        { _id: id, recipientId: user._id.toString() },
        { $set: { isRead: true, readAt: new Date() } },
        { new: true }
      );
      if (!notif) throw new Error('Notification not found');
      return { ...notif.toObject(), id: notif._id.toString() };
    },

    markAllNotificationsRead: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      await Notification.updateMany(
        { recipientId: user._id.toString(), isRead: false },
        { $set: { isRead: true, readAt: new Date() } }
      );
      return true;
    },

    dismissNotification: async (_: any, { id }: any, context: any) => {
      const user = await requireAuth(context);
      assertValidObjectId(id, 'notification');
      await Notification.findOneAndUpdate(
        { _id: id, recipientId: user._id.toString() },
        { $set: { isDismissed: true } }
      );
      return true;
    },

    updateNotificationPreferences: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      const prefs = await NotificationPreference.findOneAndUpdate(
        { userId: user._id.toString() },
        { $set: { ...input, updatedAt: new Date() } },
        { new: true, upsert: true }
      );
      return { ...prefs.toObject(), id: prefs._id.toString() };
    },

    sendInternalNotification: async (_: any, { recipientId, type, title, message, actionUrl }: any, context: any) => {
      const user = await requireAuth(context);
      const notif = await Notification.create({
        recipientId,
        type: type.toLowerCase(),
        title,
        message,
        actionUrl,
        channels: ['in_app'],
        senderId: user._id.toString(),
        senderName: `${user.firstName} ${user.lastName}`,
        priority: 'normal',
      });

      pubsub.publish('NOTIFICATION_RECEIVED', {
        notificationReceived: { ...notif.toObject(), id: notif._id.toString() },
      });

      return { ...notif.toObject(), id: notif._id.toString() };
    },

    // ---- Workflows ----
    createWorkflowTemplate: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const template = await WorkflowTemplate.create({
        ...input,
        createdBy: user._id.toString(),
      });
      return { ...template.toObject(), id: template._id.toString() };
    },

    updateWorkflowTemplate: async (_: any, { id, input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      assertValidObjectId(id, 'workflow template');
      const template = await WorkflowTemplate.findByIdAndUpdate(id, { $set: input }, { new: true });
      if (!template) throw new Error('Workflow template not found');
      return { ...template.toObject(), id: template._id.toString() };
    },

    deleteWorkflowTemplate: async (_: any, { id }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      assertValidObjectId(id, 'workflow template');
      await WorkflowTemplate.findByIdAndDelete(id);
      return true;
    },

    toggleWorkflowTemplate: async (_: any, { id, isActive }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      assertValidObjectId(id, 'workflow template');
      const template = await WorkflowTemplate.findByIdAndUpdate(id, { $set: { isActive } }, { new: true });
      if (!template) throw new Error('Workflow template not found');
      return { ...template.toObject(), id: template._id.toString() };
    },

    startWorkflow: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      assertValidObjectId(input.templateId, 'workflow template');
      const template = await WorkflowTemplate.findById(input.templateId);
      if (!template) throw new Error('Workflow template not found');

      const instance = await WorkflowInstance.create({
        templateId: template._id,
        templateName: template.name,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        resourceName: input.resourceName,
        status: 'in_progress',
        currentStepIndex: 0,
        stepHistory: template.steps.map((step, idx) => ({
          stepIndex: idx,
          stepName: step.name,
          status: idx === 0 ? 'pending' : 'pending',
          assigneeId: step.assigneeId,
        })),
        initiatedBy: user._id.toString(),
        initiatedByName: `${user.firstName} ${user.lastName}`,
      });

      return { ...instance.toObject(), id: instance._id.toString() };
    },

    processWorkflowAction: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      assertValidObjectId(input.instanceId, 'workflow instance');
      const instance = await WorkflowInstance.findById(input.instanceId);
      if (!instance) throw new Error('Workflow instance not found');

      const currentStep = instance.stepHistory[instance.currentStepIndex];
      if (currentStep) {
        currentStep.status = input.action;
        currentStep.assigneeId = user._id.toString();
        currentStep.assigneeName = `${user.firstName} ${user.lastName}`;
        currentStep.completedAt = new Date();
        currentStep.comment = input.comment;
      }

      if (input.action === 'rejected') {
        instance.status = 'failed';
      } else if (instance.currentStepIndex >= instance.stepHistory.length - 1) {
        instance.status = 'completed';
        instance.completedAt = new Date();
      } else {
        instance.currentStepIndex += 1;
      }

      await instance.save();
      return { ...instance.toObject(), id: instance._id.toString() };
    },

    cancelWorkflow: async (_: any, { id }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'workflow instance');
      const instance = await WorkflowInstance.findByIdAndUpdate(
        id,
        { $set: { status: 'cancelled' } },
        { new: true }
      );
      if (!instance) throw new Error('Workflow instance not found');
      return { ...instance.toObject(), id: instance._id.toString() };
    },

    // ---- Media Assets ----
    createMediaAsset: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      const asset = await MediaAsset.create({
        ...input,
        type: input.type.toLowerCase(),
        uploadedBy: user._id.toString(),
        uploadedByName: `${user.firstName} ${user.lastName}`,
        status: 'ready',
        tags: input.tags || [],
      });
      return { ...asset.toObject(), id: asset._id.toString() };
    },

    updateMediaAsset: async (_: any, { id, input }: any, context: any) => {
      const user = await requireAuth(context);
      assertValidObjectId(id, 'media asset');
      const asset = await MediaAsset.findByIdAndUpdate(
        id,
        { $set: { ...input, lastModifiedBy: user._id.toString() } },
        { new: true }
      );
      if (!asset) throw new Error('Media asset not found');
      return { ...asset.toObject(), id: asset._id.toString() };
    },

    deleteMediaAsset: async (_: any, { id }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'media asset');
      await MediaAsset.findByIdAndUpdate(id, { $set: { status: 'deleted' } });
      return true;
    },

    archiveMediaAsset: async (_: any, { id }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'media asset');
      const asset = await MediaAsset.findByIdAndUpdate(
        id,
        { $set: { status: 'archived' } },
        { new: true }
      );
      if (!asset) throw new Error('Media asset not found');
      return { ...asset.toObject(), id: asset._id.toString() };
    },

    createMediaFolder: async (_: any, { name, nameHe, parentFolderId }: any, context: any) => {
      const user = await requireAuth(context);
      let path = `/${name}`;
      if (parentFolderId) {
        assertValidObjectId(parentFolderId, 'parent folder');
        const parent = await MediaFolder.findById(parentFolderId);
        if (parent) path = `${parent.path}/${name}`;
      }
      const folder = await MediaFolder.create({
        name,
        nameHe,
        parentFolderId,
        path,
        createdBy: user._id.toString(),
      });
      return { ...folder.toObject(), id: folder._id.toString() };
    },

    deleteMediaFolder: async (_: any, { id }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'media folder');
      await MediaFolder.findByIdAndDelete(id);
      return true;
    },

    // ---- Rights & Licensing ----
    createBroadcastRight: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      const right = await BroadcastRightManaged.create({
        ...input,
        exclusivity: input.exclusivity || 'non_exclusive',
        status: 'active',
        createdBy: user._id.toString(),
      });

      await createAuditEntry({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'CREATE',
        resource: 'broadcast_right',
        resourceId: right._id.toString(),
        resourceName: right.title,
      });

      return { ...right.toObject(), id: right._id.toString() };
    },

    updateBroadcastRight: async (_: any, { id, input }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'broadcast right');
      if (input.status) input.status = input.status.toLowerCase();
      const right = await BroadcastRightManaged.findByIdAndUpdate(id, { $set: input }, { new: true });
      if (!right) throw new Error('Broadcast right not found');
      return { ...right.toObject(), id: right._id.toString() };
    },

    deleteBroadcastRight: async (_: any, { id }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'broadcast right');
      await BroadcastRightManaged.findByIdAndDelete(id);
      return true;
    },

    // ---- Internal IT support tickets ----
    createItTicket: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      const ticket = await SupportTicket.create({
        ticketNumber: generateTicketNumber(),
        subject: input.subject,
        description: input.description,
        category: input.category || 'question',
        priority: input.priority?.toLowerCase() || 'normal',
        status: 'open',
        createdBy: user._id.toString(),
        createdByName: `${user.firstName} ${user.lastName}`,
        createdByEmail: user.email,
        messages: [{
          senderId: user._id.toString(),
          senderName: `${user.firstName} ${user.lastName}`,
          senderType: 'customer',
          message: input.description,
          createdAt: new Date(),
        }],
        tags: [],
      });
      return { ...ticket.toObject(), id: ticket._id.toString() };
    },

    addItTicketMessage: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      assertValidObjectId(input.ticketId, 'support ticket');
      const ticket = await SupportTicket.findByIdAndUpdate(
        input.ticketId,
        {
          $push: {
            messages: {
              senderId: user._id.toString(),
              senderName: `${user.firstName} ${user.lastName}`,
              senderType: ['SYSTEM_ADMIN', 'IT_ADMIN'].includes(user.systemRole) ? 'support' : 'customer',
              message: input.message,
              createdAt: new Date(),
            }
          },
          $set: { updatedAt: new Date() },
        },
        { new: true }
      );
      if (!ticket) throw new Error('Support ticket not found');
      return { ...ticket.toObject(), id: ticket._id.toString() };
    },

    assignItTicket: async (_: any, { id, assigneeId }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      assertValidObjectId(id, 'support ticket');
      const update: any = {};
      if (assigneeId) {
        assertValidObjectId(assigneeId, 'assignee');
        const db = await connectMongoDB();
        const assignee = await db.collection('users').findOne({ _id: new ObjectId(assigneeId) });
        if (!assignee) throw new Error('Assignee not found');
        update.assignedTo = assigneeId;
        update.assignedToName = `${assignee.firstName} ${assignee.lastName}`;
      } else {
        update.assignedTo = null;
        update.assignedToName = null;
      }
      const ticket = await SupportTicket.findByIdAndUpdate(
        id,
        { $set: update },
        { new: true }
      );
      if (!ticket) throw new Error('Support ticket not found');
      return { ...ticket.toObject(), id: ticket._id.toString() };
    },

    updateItTicketStatus: async (_: any, { id, status }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      assertValidObjectId(id, 'support ticket');
      const set: any = { status: String(status).toLowerCase() };
      if (set.status === 'resolved') set.resolvedAt = new Date();
      if (set.status === 'closed') {
        set.closedAt = new Date();
        if (!set.resolvedAt) set.resolvedAt = new Date();
      }
      const ticket = await SupportTicket.findByIdAndUpdate(
        id,
        { $set: set },
        { new: true }
      );
      if (!ticket) throw new Error('Support ticket not found');
      return { ...ticket.toObject(), id: ticket._id.toString() };
    },

    closeItTicket: async (_: any, { id, satisfactionRating, satisfactionComment }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'support ticket');
      const ticket = await SupportTicket.findByIdAndUpdate(
        id,
        {
          $set: {
            status: 'closed',
            closedAt: new Date(),
            resolvedAt: new Date(),
            satisfactionRating,
            satisfactionComment,
          }
        },
        { new: true }
      );
      if (!ticket) throw new Error('Support ticket not found');
      return { ...ticket.toObject(), id: ticket._id.toString() };
    },

    rateHelpArticle: async (_: any, { articleId, helpful }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(articleId, 'help article');
      const update = helpful ? { $inc: { helpfulCount: 1 } } : { $inc: { notHelpfulCount: 1 } };
      const article = await HelpArticle.findByIdAndUpdate(articleId, update, { new: true });
      if (!article) throw new Error('Help article not found');
      return { ...article.toObject(), id: article._id.toString() };
    },

    // ---- API Keys & Webhooks ----
    createApiKey: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);

      const rawKey = `lnc_${crypto.randomBytes(32).toString('hex')}`;
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const keyPrefix = rawKey.substring(0, 12);

      const apiKey = await ApiKey.create({
        ...input,
        keyHash,
        keyPrefix,
        createdBy: user._id.toString(),
        createdByName: `${user.firstName} ${user.lastName}`,
      });

      await createAuditEntry({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'CREATE',
        resource: 'api_key',
        resourceName: input.name,
        severity: 'warning',
      });

      return {
        apiKey: { ...apiKey.toObject(), id: apiKey._id.toString() },
        secret: rawKey,
      };
    },

    revokeApiKey: async (_: any, { id }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      assertValidObjectId(id, 'API key');
      await ApiKey.findByIdAndUpdate(id, { $set: { isActive: false } });

      await createAuditEntry({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'REVOKE',
        resource: 'api_key',
        resourceId: id,
        severity: 'warning',
      });

      return true;
    },

    createWebhook: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);

      const secret = crypto.randomBytes(32).toString('hex');
      const webhook = await Webhook.create({
        ...input,
        secret,
        createdBy: user._id.toString(),
      });
      return { ...webhook.toObject(), id: webhook._id.toString() };
    },

    updateWebhook: async (_: any, { id, input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      assertValidObjectId(id, 'webhook');
      const webhook = await Webhook.findByIdAndUpdate(id, { $set: input }, { new: true });
      if (!webhook) throw new Error('Webhook not found');
      return { ...webhook.toObject(), id: webhook._id.toString() };
    },

    deleteWebhook: async (_: any, { id }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      assertValidObjectId(id, 'webhook');
      await Webhook.findByIdAndDelete(id);
      return true;
    },

    testWebhook: async (_: any, { id }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      assertValidObjectId(id, 'webhook');
      const webhook = await Webhook.findById(id);
      if (!webhook) throw new Error('Webhook not found');

      await WebhookDelivery.create({
        webhookId: webhook._id,
        event: 'test.ping',
        payload: { type: 'test', timestamp: new Date().toISOString() },
        status: 'pending',
      });

      return true;
    },
  },

  Subscription: {
    notificationReceived: {
      subscribe: withFilter(
        (_: any, __: any, context: any) => {
          requireAuthMiddleware(context);
          return pubsub.asyncIterator(['NOTIFICATION_RECEIVED']);
        },
        (payload: any, _vars: any, context: any) => {
          const recipientId = payload?.notificationReceived?.recipientId;
          const userId = context?.user?.userId;
          if (!recipientId || !userId) return false;
          return String(recipientId) === String(userId);
        }
      ),
    },
    workflowUpdated: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuthMiddleware(context);
        return pubsub.asyncIterator(['WORKFLOW_UPDATED']);
      },
    },
    liveStreamStatusChanged: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuthMiddleware(context);
        return pubsub.asyncIterator(['LIVE_STREAM_STATUS_CHANGED']);
      },
    },
    signalMonitorUpdated: {
      subscribe: (_: any, __: any, context: any) => {
        requireAuthMiddleware(context);
        return pubsub.asyncIterator(['SIGNAL_MONITOR_UPDATED']);
      },
    },
  },
};
