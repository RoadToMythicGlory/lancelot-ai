import { ObjectId } from 'mongodb';
import mongoose from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { connectMongoDB } from '../config/mongodb';
import { Organization, OrganizationInvite } from '../models/organization.models';
import { Subscription, Invoice, PaymentMethod } from '../models/billing.models';
import { AuditLog } from '../models/audit.models';
import { Notification, NotificationPreference } from '../models/notification.models';
import { WorkflowTemplate, WorkflowInstance } from '../models/workflow.models';
import { MediaAsset, MediaFolder } from '../models/mediaAsset.models';
import { BroadcastRightManaged } from '../models/rights.models';
import { HelpArticle, SupportTicket, Changelog } from '../models/help.models';
import { ApiKey, Webhook, WebhookDelivery } from '../models/apiKey.models';
import { withFilter } from 'graphql-subscriptions';
import { pubsub } from '../utils/pubsub';
import { requireAuth as requireAuthMiddleware, requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';

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
  organizationId?: string;
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

function generateInvoiceNumber(): string {
  const date = new Date();
  const prefix = `INV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${random}`;
}

// ==================== RESOLVERS ====================

export const saasResolvers = {
  Query: {
    // ---- Organization ----
    myOrganization: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      if (!user.organizationId) return null;
      const org = await Organization.findById(user.organizationId);
      return org ? { ...org.toObject(), id: org._id.toString() } : null;
    },

    organization: async (_: any, { id }: { id: string }, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'organization');
      const org = await Organization.findById(id);
      return org ? { ...org.toObject(), id: org._id.toString() } : null;
    },

    organizationBySlug: async (_: any, { slug }: { slug: string }, context: any) => {
      await requireAuth(context);
      const org = await Organization.findOne({ slug, isActive: true });
      return org ? { ...org.toObject(), id: org._id.toString() } : null;
    },

    organizationInvites: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const invites = await OrganizationInvite.find({
        organizationId: user.organizationId,
        status: 'pending',
      }).sort({ createdAt: -1 });
      return invites.map(i => ({ ...i.toObject(), id: i._id.toString() }));
    },

    // ---- Billing ----
    mySubscription: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      if (!user.organizationId) return null;
      const sub = await Subscription.findOne({ organizationId: user.organizationId });
      return sub ? { ...sub.toObject(), id: sub._id.toString() } : null;
    },

    invoices: async (_: any, { limit = 20, offset = 0 }: any, context: any) => {
      const user = await requireAuth(context);
      if (!user.organizationId) return [];
      const items = await Invoice.find({ organizationId: user.organizationId })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit);
      return items.map(i => ({ ...i.toObject(), id: i._id.toString() }));
    },

    paymentMethods: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      if (!user.organizationId) return [];
      const methods = await PaymentMethod.find({ organizationId: user.organizationId }).sort({ createdAt: -1 }).limit(200);
      return methods.map(m => ({ ...m.toObject(), id: m._id.toString() }));
    },

    // ---- Audit Logs ----
    auditLogs: async (_: any, { filter, limit = 50, offset = 0 }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);

      const query: any = {};
      if (user.organizationId) query.organizationId = user.organizationId;
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
      const user = await requireAuth(context);
      const query: any = {};
      if (user.organizationId) query.organizationId = user.organizationId;
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
      const user = await requireAuth(context);
      const query: any = {};
      if (user.organizationId) query.organizationId = user.organizationId;
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
      const user = await requireAuth(context);
      const query: any = { status: { $ne: 'deleted' } };
      if (user.organizationId) query.organizationId = user.organizationId;

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
      const user = await requireAuth(context);
      const query: any = {};
      if (user.organizationId) query.organizationId = user.organizationId;
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
      const user = await requireAuth(context);
      const query: any = {};
      if (user.organizationId) query.organizationId = user.organizationId;

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
      const user = await requireAuth(context);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      const query: any = {
        endDate: { $lte: futureDate, $gte: new Date() },
        status: { $ne: 'expired' },
      };
      if (user.organizationId) query.organizationId = user.organizationId;
      const items = await BroadcastRightManaged.find(query).sort({ endDate: 1 }).limit(500);
      return items.map(i => ({ ...i.toObject(), id: i._id.toString() }));
    },

    // ---- Help & Support ----
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

    saasTickets: async (_: any, { status, limit = 20, offset = 0 }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const query: any = {};
      if (user.organizationId) query.organizationId = user.organizationId;
      if (status) query.status = status.toLowerCase();
      const tickets = await SupportTicket.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit);
      return tickets.map(t => ({ ...t.toObject(), id: t._id.toString() }));
    },

    saasTicket: async (_: any, { id }: any, context: any) => {
      await requireAuth(context);
      assertValidObjectId(id, 'support ticket');
      const ticket = await SupportTicket.findById(id);
      return ticket ? { ...ticket.toObject(), id: ticket._id.toString() } : null;
    },

    mySaasTickets: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      const tickets = await SupportTicket.find({ createdBy: user._id.toString() }).sort({ createdAt: -1 }).limit(500);
      return tickets.map(t => ({ ...t.toObject(), id: t._id.toString() }));
    },

    changelog: async (_: any, { limit = 20 }: any) => {
      const items = await Changelog.find({ isPublished: true }).sort({ publishedAt: -1 }).limit(limit);
      return items.map(c => ({ ...c.toObject(), id: c._id.toString() }));
    },

    // ---- API Keys & Webhooks ----
    apiKeys: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const query: any = {};
      if (user.organizationId) query.organizationId = user.organizationId;
      const keys = await ApiKey.find(query).sort({ createdAt: -1 }).limit(500);
      return keys.map(k => ({ ...k.toObject(), id: k._id.toString() }));
    },

    webhooks: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const query: any = {};
      if (user.organizationId) query.organizationId = user.organizationId;
      const hooks = await Webhook.find(query).sort({ createdAt: -1 }).limit(500);
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
      // Returns mock data structure - actual integration with monitoring systems
      return [];
    },

    signalMonitor: async (_: any, __: any, context: any) => {
      await requireAuth(context);
      // Returns mock data structure - actual integration with signal monitoring hardware
      return [];
    },

    // ---- Global Search ----
    globalSearch: async (_: any, { query, types, limit = 10 }: any, context: any) => {
      const user = await requireAuth(context);
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
    // ---- Organization ----
    createOrganization: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);

      // Check if slug is available
      const existing = await Organization.findOne({ slug: input.slug });
      if (existing) throw new Error('Organization slug already taken');

      const org = await Organization.create({
        ...input,
        plan: input.plan?.toLowerCase() || 'free',
        isActive: true,
        isTrial: true,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
        createdBy: user._id.toString(),
      });

      // Assign org to user
      const db = await connectMongoDB();
      await db.collection('users').updateOne(
        { _id: new ObjectId(user._id) },
        { $set: { organizationId: org._id } }
      );

      // Create default subscription
      await Subscription.create({
        organizationId: org._id,
        plan: input.plan?.toLowerCase() || 'free',
        status: 'trialing',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        trialStart: new Date(),
        trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        limits: getPlanLimits(input.plan?.toLowerCase() || 'free'),
        currentUsage: { users: 1, broadcastEvents: 0, storageUsedGB: 0, departments: 0, apiCalls: 0 },
      });

      await createAuditEntry({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'CREATE',
        resource: 'organization',
        resourceId: org._id.toString(),
        resourceName: org.name,
      });

      return { ...org.toObject(), id: org._id.toString() };
    },

    updateOrganization: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      if (!user.organizationId) throw new Error('No organization found');

      const org = await Organization.findByIdAndUpdate(
        user.organizationId,
        { $set: input },
        { new: true }
      );
      if (!org) throw new Error('Organization not found');

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
      if (!user.organizationId) throw new Error('No organization found');

      const updateFields: any = {};
      for (const [key, value] of Object.entries(input)) {
        updateFields[`settings.${key}`] = value;
      }

      const org = await Organization.findByIdAndUpdate(
        user.organizationId,
        { $set: updateFields },
        { new: true }
      );
      if (!org) throw new Error('Organization not found');
      return { ...org.toObject(), id: org._id.toString() };
    },

    updateFeatureFlags: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      if (!user.organizationId) throw new Error('No organization found');

      const updateFields: any = {};
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) updateFields[`settings.features.${key}`] = value;
      }

      const org = await Organization.findByIdAndUpdate(
        user.organizationId,
        { $set: updateFields },
        { new: true }
      );
      if (!org) throw new Error('Organization not found');
      return { ...org.toObject(), id: org._id.toString() };
    },

    updateSecuritySettings: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      if (!user.organizationId) throw new Error('No organization found');

      const updateFields: any = {};
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) updateFields[`settings.security.${key}`] = value;
      }

      const org = await Organization.findByIdAndUpdate(
        user.organizationId,
        { $set: updateFields },
        { new: true }
      );
      if (!org) throw new Error('Organization not found');

      await createAuditEntry({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'UPDATE',
        resource: 'security_settings',
        severity: 'warning',
      });

      return { ...org.toObject(), id: org._id.toString() };
    },

    inviteUserToOrganization: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      if (!user.organizationId) throw new Error('No organization found');

      const token = crypto.randomBytes(32).toString('hex');
      const invite = await OrganizationInvite.create({
        organizationId: user.organizationId,
        email: input.email,
        role: input.role,
        departments: input.departments || [],
        invitedBy: user._id.toString(),
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        status: 'pending',
      });

      await createAuditEntry({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'INVITE',
        resource: 'user',
        resourceName: input.email,
      });

      return { ...invite.toObject(), id: invite._id.toString() };
    },

    acceptOrganizationInvite: async (_: any, { token }: any) => {
      const invite = await OrganizationInvite.findOne({ token, status: 'pending' });
      if (!invite) throw new Error('Invalid or expired invite');
      if (invite.expiresAt < new Date()) {
        await OrganizationInvite.updateOne({ _id: invite._id }, { $set: { status: 'expired' } });
        throw new Error('Invite has expired');
      }
      await OrganizationInvite.updateOne(
        { _id: invite._id },
        { $set: { status: 'accepted', acceptedAt: new Date() } }
      );
      return true;
    },

    cancelOrganizationInvite: async (_: any, { inviteId }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      assertValidObjectId(inviteId, 'invite');
      await OrganizationInvite.updateOne(
        { _id: new ObjectId(inviteId) },
        { $set: { status: 'cancelled' } }
      );
      return true;
    },

    // ---- Billing ----
    changePlan: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      if (!user.organizationId) throw new Error('No organization found');

      const newPlan = input.plan.toLowerCase();
      const limits = getPlanLimits(newPlan);

      const sub = await Subscription.findOneAndUpdate(
        { organizationId: user.organizationId },
        {
          $set: {
            plan: newPlan,
            billingCycle: input.billingCycle?.toLowerCase() || 'monthly',
            limits,
            status: 'active',
          }
        },
        { new: true, upsert: true }
      );

      await Organization.updateOne(
        { _id: user.organizationId },
        { $set: { plan: newPlan, ...limits } }
      );

      await createAuditEntry({
        userId: user._id.toString(),
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'CHANGE_PLAN',
        resource: 'subscription',
        resourceName: newPlan,
        severity: 'warning',
      });

      return { ...sub!.toObject(), id: sub!._id.toString() };
    },

    cancelSubscription: async (_: any, { reason }: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const sub = await Subscription.findOneAndUpdate(
        { organizationId: user.organizationId },
        { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason } },
        { new: true }
      );
      if (!sub) throw new Error('Subscription not found');
      return { ...sub.toObject(), id: sub._id.toString() };
    },

    resumeSubscription: async (_: any, __: any, context: any) => {
      const user = await requireAuth(context);
      requireSystemAdmin(user);
      const sub = await Subscription.findOneAndUpdate(
        { organizationId: user.organizationId },
        { $set: { status: 'active', cancelledAt: null, cancelReason: null } },
        { new: true }
      );
      if (!sub) throw new Error('Subscription not found');
      return { ...sub.toObject(), id: sub._id.toString() };
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

    sendSaasNotification: async (_: any, { recipientId, type, title, message, actionUrl }: any, context: any) => {
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

      // Publish for real-time subscription
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
        organizationId: user.organizationId,
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
        organizationId: user.organizationId,
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
        currentStep.status = input.action; // 'approved', 'rejected', etc.
        currentStep.assigneeId = user._id.toString();
        currentStep.assigneeName = `${user.firstName} ${user.lastName}`;
        currentStep.completedAt = new Date();
        currentStep.comment = input.comment;
      }

      // Move to next step or complete
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

    cancelWorkflow: async (_: any, { id, reason }: any, context: any) => {
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
        organizationId: user.organizationId,
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
        organizationId: user.organizationId,
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
        organizationId: user.organizationId,
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
      const user = await requireAuth(context);
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

    // ---- Help & Support ----
    createSaasTicket: async (_: any, { input }: any, context: any) => {
      const user = await requireAuth(context);
      const ticket = await SupportTicket.create({
        ticketNumber: generateTicketNumber(),
        subject: input.subject,
        description: input.description,
        category: input.category || 'question',
        priority: input.priority?.toLowerCase() || 'normal',
        status: 'open',
        organizationId: user.organizationId,
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

    addTicketMessage: async (_: any, { input }: any, context: any) => {
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

    closeSupportTicket: async (_: any, { id, satisfactionRating, satisfactionComment }: any, context: any) => {
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
        organizationId: user.organizationId,
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
        secret: rawKey, // Only returned once!
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
        organizationId: user.organizationId,
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

      // Create a test delivery
      await WebhookDelivery.create({
        webhookId: webhook._id,
        organizationId: webhook.organizationId,
        event: 'test.ping',
        payload: { type: 'test', timestamp: new Date().toISOString() },
        status: 'pending',
      });

      return true;
    },
  },

  Subscription: {
    // Scoped to the authenticated recipient — even if other clients are
    // listening on the same global topic, the resolver only forwards
    // notifications whose recipientId matches the connected user. This avoids
    // leaking another tenant's / user's notifications across the WS bus while
    // we still publish to a single channel.
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

// ==================== PLAN LIMITS HELPER ====================

function getPlanLimits(plan: string) {
  switch (plan) {
    case 'enterprise':
      return {
        maxUsers: 999,
        maxBroadcastEvents: 99999,
        maxStorageGB: 1000,
        maxDepartments: 50,
        maxApiCalls: 100000,
      };
    case 'pro':
      return {
        maxUsers: 50,
        maxBroadcastEvents: 5000,
        maxStorageGB: 100,
        maxDepartments: 15,
        maxApiCalls: 10000,
      };
    case 'free':
    default:
      return {
        maxUsers: 5,
        maxBroadcastEvents: 50,
        maxStorageGB: 1,
        maxDepartments: 3,
        maxApiCalls: 1000,
      };
  }
}