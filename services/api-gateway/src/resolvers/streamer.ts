import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { connectMongoDB } from '../config/mongodb';
import { config } from '../config';
import { StreamEvent } from '../models/streamEvent.models';
import { PodcastEpisode } from '../models/podcastEpisode.models';
import { PodcastShow } from '../models/podcastShow.models';
import { GuestContact } from '../models/guestContact.models';
import { Clip } from '../models/clip.models';
import { RevenueEntry } from '../models/revenueEntry.models';
import { StreamerActivity } from '../models/streamerActivity.models';
import { Organization } from '../models/organization.models';
import { Subscription } from '../models/billing.models';
import { jwtService } from '../services/jwtService';

async function requireStreamerAuth(context: any) {
  if (!context.user || !context.user.userId) {
    throw new Error('Not authenticated');
  }
  return context.user;
}

function toItem(doc: any) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  return { ...obj, id: (obj._id || obj.id).toString() };
}

function toItems(docs: any[]) {
  return docs.map(toItem);
}

export const streamerResolvers = {
  Query: {
    // ---- Stream Events ----
    streamerEvents: async (_: any, { limit = 50, offset = 0, status }: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const query: any = { userId: user.userId };
      if (status) query.status = status;
      const items = await StreamEvent.find(query).sort({ scheduledDate: -1 }).skip(offset).limit(limit);
      return toItems(items);
    },

    streamerEvent: async (_: any, { id }: any, context: any) => {
      await requireStreamerAuth(context);
      return toItem(await StreamEvent.findById(id));
    },

    // ---- Podcast Episodes ----
    podcastEpisodes: async (_: any, { limit = 50, offset = 0, status, showId }: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const query: any = { userId: user.userId };
      if (status) query.status = status;
      if (showId) query.showId = showId;
      const items = await PodcastEpisode.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit);
      return toItems(items);
    },

    podcastEpisode: async (_: any, { id }: any, context: any) => {
      await requireStreamerAuth(context);
      return toItem(await PodcastEpisode.findById(id));
    },

    // ---- Podcast Shows ----
    podcastShows: async (_: any, __: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const items = await PodcastShow.find({ userId: user.userId }).sort({ createdAt: -1 });
      return toItems(items);
    },

    podcastShow: async (_: any, { id }: any, context: any) => {
      await requireStreamerAuth(context);
      return toItem(await PodcastShow.findById(id));
    },

    // ---- Guest Contacts ----
    guestContacts: async (_: any, { status, searchTerm }: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const query: any = { userId: user.userId };
      if (status) query.status = status;
      if (searchTerm) {
        query.$or = [
          { name: { $regex: searchTerm, $options: 'i' } },
          { topicsExpertise: { $regex: searchTerm, $options: 'i' } },
        ];
      }
      const items = await GuestContact.find(query).sort({ createdAt: -1 });
      return toItems(items);
    },

    guestContact: async (_: any, { id }: any, context: any) => {
      await requireStreamerAuth(context);
      return toItem(await GuestContact.findById(id));
    },

    // ---- Clips ----
    streamerClips: async (_: any, { status, sourceType, limit = 50 }: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const query: any = { userId: user.userId };
      if (status) query.status = status;
      if (sourceType) query.sourceType = sourceType;
      const items = await Clip.find(query).sort({ createdAt: -1 }).limit(limit);
      return toItems(items);
    },

    streamerClip: async (_: any, { id }: any, context: any) => {
      await requireStreamerAuth(context);
      return toItem(await Clip.findById(id));
    },

    // ---- Revenue ----
    revenueEntries: async (_: any, { limit = 200, offset = 0 }: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const items = await RevenueEntry.find({ userId: user.userId }).sort({ date: -1 }).skip(offset).limit(limit);
      return toItems(items);
    },

    // ---- Activity ----
    streamerActivities: async (_: any, { limit = 20 }: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const items = await StreamerActivity.find({ userId: user.userId }).sort({ createdAt: -1 }).limit(limit);
      return toItems(items);
    },

    // ---- Profile ----
    streamerMe: async (_: any, __: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const db = await connectMongoDB();
      const dbUser = await db.collection('users').findOne({ _id: new ObjectId(user.userId) });
      if (!dbUser) return null;
      return { ...dbUser, id: dbUser._id.toString(), displayName: dbUser.displayName || `${dbUser.firstName} ${dbUser.lastName}` };
    },
  },

  Mutation: {
    // ---- Stream Events ----
    createStreamEvent: async (_: any, { input }: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const doc = await StreamEvent.create({ ...input, userId: user.userId });
      await StreamerActivity.create({ userId: user.userId, action: 'stream_scheduled', entityType: 'stream', entityId: doc._id.toString(), description: `Scheduled stream: ${input.title}` });
      return toItem(doc);
    },

    updateStreamEvent: async (_: any, { id, input }: any, context: any) => {
      await requireStreamerAuth(context);
      const doc = await StreamEvent.findByIdAndUpdate(id, { $set: input }, { new: true });
      if (!doc) throw new Error('Stream event not found');
      return toItem(doc);
    },

    deleteStreamEvent: async (_: any, { id }: any, context: any) => {
      await requireStreamerAuth(context);
      await StreamEvent.findByIdAndDelete(id);
      return true;
    },

    // ---- Podcast Episodes ----
    createPodcastEpisode: async (_: any, { input }: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const doc = await PodcastEpisode.create({ ...input, userId: user.userId });
      await StreamerActivity.create({ userId: user.userId, action: 'episode_created', entityType: 'episode', entityId: doc._id.toString(), description: `Created episode: ${input.title}` });
      return toItem(doc);
    },

    updatePodcastEpisode: async (_: any, { id, input }: any, context: any) => {
      await requireStreamerAuth(context);
      const doc = await PodcastEpisode.findByIdAndUpdate(id, { $set: input }, { new: true });
      if (!doc) throw new Error('Podcast episode not found');
      return toItem(doc);
    },

    deletePodcastEpisode: async (_: any, { id }: any, context: any) => {
      await requireStreamerAuth(context);
      await PodcastEpisode.findByIdAndDelete(id);
      return true;
    },

    // ---- Podcast Shows ----
    createPodcastShow: async (_: any, { input }: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const doc = await PodcastShow.create({ ...input, userId: user.userId });
      return toItem(doc);
    },

    updatePodcastShow: async (_: any, { id, input }: any, context: any) => {
      await requireStreamerAuth(context);
      const doc = await PodcastShow.findByIdAndUpdate(id, { $set: input }, { new: true });
      if (!doc) throw new Error('Podcast show not found');
      return toItem(doc);
    },

    deletePodcastShow: async (_: any, { id }: any, context: any) => {
      await requireStreamerAuth(context);
      await PodcastShow.findByIdAndDelete(id);
      return true;
    },

    // ---- Guest Contacts ----
    createGuestContact: async (_: any, { input }: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const doc = await GuestContact.create({ ...input, userId: user.userId });
      await StreamerActivity.create({ userId: user.userId, action: 'guest_added', entityType: 'guest', entityId: doc._id.toString(), description: `Added guest: ${input.name}` });
      return toItem(doc);
    },

    updateGuestContact: async (_: any, { id, input }: any, context: any) => {
      await requireStreamerAuth(context);
      const doc = await GuestContact.findByIdAndUpdate(id, { $set: input }, { new: true });
      if (!doc) throw new Error('Guest contact not found');
      return toItem(doc);
    },

    deleteGuestContact: async (_: any, { id }: any, context: any) => {
      await requireStreamerAuth(context);
      await GuestContact.findByIdAndDelete(id);
      return true;
    },

    // ---- Clips ----
    createClip: async (_: any, { input }: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const doc = await Clip.create({ ...input, userId: user.userId });
      await StreamerActivity.create({ userId: user.userId, action: 'clip_created', entityType: 'clip', entityId: doc._id.toString(), description: `Created clip: ${input.title}` });
      return toItem(doc);
    },

    updateClip: async (_: any, { id, input }: any, context: any) => {
      await requireStreamerAuth(context);
      const doc = await Clip.findByIdAndUpdate(id, { $set: input }, { new: true });
      if (!doc) throw new Error('Clip not found');
      return toItem(doc);
    },

    deleteClip: async (_: any, { id }: any, context: any) => {
      await requireStreamerAuth(context);
      await Clip.findByIdAndDelete(id);
      return true;
    },

    // ---- Revenue ----
    createRevenueEntry: async (_: any, { input }: any, context: any) => {
      const user = await requireStreamerAuth(context);
      const doc = await RevenueEntry.create({ ...input, userId: user.userId });
      return toItem(doc);
    },

    deleteRevenueEntry: async (_: any, { id }: any, context: any) => {
      await requireStreamerAuth(context);
      await RevenueEntry.findByIdAndDelete(id);
      return true;
    },

    // ---- Streamer Self-Serve Registration ----
    registerStreamer: async (_: any, { email, password, displayName }: any) => {
      const db = await connectMongoDB();

      // Check if email exists
      const existing = await db.collection('users').findOne({ email });
      if (existing) throw new Error('Email already registered');

      // Hash password
      const hashedPassword = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
      const nameParts = displayName.split(' ');

      // Create user
      const newUser = {
        email,
        password: hashedPassword,
        firstName: nameParts[0] || displayName,
        lastName: nameParts.slice(1).join(' ') || '',
        displayName,
        systemRole: 'DEPARTMENT_USER',
        accountType: 'streamer',
        departments: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const userResult = await db.collection('users').insertOne(newUser);
      const userId = userResult.insertedId.toString();

      // Auto-provision organization
      const org = await Organization.create({
        name: `${displayName}'s Workspace`,
        slug: `streamer-${userId.substring(0, 8)}`,
        plan: 'free',
        isActive: true,
        isTrial: true,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        settings: {
          timezone: 'UTC',
          locale: 'en',
          dateFormat: 'MM/DD/YYYY',
          features: {
            chat: true,
            aiAgent: true,
            warehouse: false,
            vizrt: false,
            shifts: false,
            mcr: false,
            broadcasting: true,
            liveMonitoring: false,
          },
          security: {
            mfaRequired: false,
            ssoEnabled: false,
            passwordMinLength: 8,
            sessionTimeoutMinutes: 1440,
            ipWhitelist: [],
          },
        },
        createdBy: userId,
      });

      // Link user to org
      await db.collection('users').updateOne(
        { _id: userResult.insertedId },
        { $set: { organizationId: org._id } }
      );

      // Create free subscription
      await Subscription.create({
        organizationId: org._id,
        plan: 'free',
        status: 'trialing',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        trialStart: new Date(),
        trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        limits: { maxUsers: 1, maxBroadcastEvents: 10, maxStorageGB: 1, maxDepartments: 1, maxApiCalls: 500 },
        currentUsage: { users: 1, broadcastEvents: 0, storageUsedGB: 0, departments: 0, apiCalls: 0 },
      });

      // Generate JWT
      const token = jwtService.sign({
        userId,
        email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        displayName,
        role: 'user',
        systemRole: 'DEPARTMENT_USER',
        accountType: 'streamer',
        departments: [],
      });

      return {
        token,
        user: {
          id: userId,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          displayName,
          email,
        },
      };
    },
  },
};
