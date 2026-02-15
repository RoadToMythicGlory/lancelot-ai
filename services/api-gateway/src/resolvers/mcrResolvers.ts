import { AuthenticationError, UserInputError } from 'apollo-server-express';
import MCREvent, { IMCREvent } from '../models/mcrEvent';
import BulletinPost, { IBulletinPost } from '../models/bulletinPost';
import ActivityRow, { IActivityRow } from '../models/activityRow';
import { pubsub } from '../utils/pubsub';
import { withAuth } from '../utils/auth';

// Subscription topics
const MCR_EVENT_CREATED = 'MCR_EVENT_CREATED';
const MCR_EVENT_UPDATED = 'MCR_EVENT_UPDATED';
const MCR_EVENT_DELETED = 'MCR_EVENT_DELETED';
const BULLETIN_POST_CREATED = 'BULLETIN_POST_CREATED';
const BULLETIN_POST_UPDATED = 'BULLETIN_POST_UPDATED';
const BULLETIN_POST_DELETED = 'BULLETIN_POST_DELETED';
const ACTIVITY_ROW_CREATED = 'ACTIVITY_ROW_CREATED';
const ACTIVITY_ROW_UPDATED = 'ACTIVITY_ROW_UPDATED';
const ACTIVITY_ROW_DELETED = 'ACTIVITY_ROW_DELETED';

const resolvers = {
  Query: {
    // MCR Events
    mcrEvents: withAuth(async (_: any, args: any, context: any) => {
      const query: any = {};
      
      if (args.start && args.end) {
        query.$or = [
          { start: { $gte: args.start, $lte: args.end } },
          { end: { $gte: args.start, $lte: args.end } },
          { start: { $lte: args.start }, end: { $gte: args.end } }
        ];
      }
      
      if (args.broadcastType) {
        query.broadcastType = args.broadcastType;
      }
      
      return await MCREvent.find(query)
        .sort({ start: 1 });
    }),

    mcrEvent: withAuth(async (_: any, args: any) => {
      return await MCREvent.findById(args.id);
    }),

    // Bulletin Posts
    mcrBulletinPosts: withAuth(async (_: any, args: any, context: any) => {
      const query: any = {};
      
      if (args.departmentId) {
        query.departmentId = args.departmentId;
      } else {
        // Get MCR department ID
        // Get MCR department from MongoDB
        const db = await context.mongoDb;
        const departmentsCollection = db.collection('departments');
        const mcrDepartment = await departmentsCollection.findOne({ name: 'MCR' });
        if (mcrDepartment) {
          query.departmentId = mcrDepartment._id;
        }
      }
      
      if (args.activeOnly !== false) {
        query.isActive = true;
        query.$or = [
          { untilNewPost: true },
          { expiryDate: { $gt: new Date() } },
          { expiryDate: null }
        ];
      }
      
      return await BulletinPost.find(query)
        .sort({ createdAt: -1 });
    }),

    mcrBulletinPost: withAuth(async (_: any, args: any) => {
      return await BulletinPost.findById(args.id);
    }),

    // Activity Rows
    activityRows: withAuth(async (_: any, args: any) => {
      const startOfDay = new Date(args.date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(args.date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const query: any = {
        date: { $gte: startOfDay, $lte: endOfDay }
      };
      
      if (!args.includeHidden) {
        query.isHidden = false;
      }
      
      return await ActivityRow.find(query)
        .sort({ time: 1 });
    }),

    activityRow: withAuth(async (_: any, args: any) => {
      return await ActivityRow.findById(args.id);
    }),
  },

  Mutation: {
    // MCR Events
    createMCREvent: withAuth(async (_: any, args: any, context: any) => {
      const mcrEvent = new MCREvent({
        ...args.input,
        createdBy: context.user.userId
      });
      
      const savedEvent = await mcrEvent.save();
      
      pubsub.publish(MCR_EVENT_CREATED, { mcrEventCreated: savedEvent });
      
      return savedEvent;
    }),

    updateMCREvent: withAuth(async (_: any, args: any, context: any) => {
      const mcrEvent = await MCREvent.findById(args.id);
      
      if (!mcrEvent) {
        throw new UserInputError('MCR Event not found');
      }
      
      // Check permissions - only creator or admin can update
      if (mcrEvent.createdBy.toString() !== context.user.userId && context.user.systemRole !== 'ADMIN') {
        throw new AuthenticationError('Not authorized to update this event');
      }
      
      Object.assign(mcrEvent, args.input);
      const savedEvent = await mcrEvent.save();
      
      pubsub.publish(MCR_EVENT_UPDATED, { mcrEventUpdated: savedEvent });
      
      return savedEvent;
    }),

    deleteMCREvent: withAuth(async (_: any, args: any, context: any) => {
      const mcrEvent = await MCREvent.findById(args.id);
      
      if (!mcrEvent) {
        throw new UserInputError('MCR Event not found');
      }
      
      // Check permissions - only creator or admin can delete
      if (mcrEvent.createdBy.toString() !== context.user.userId && context.user.systemRole !== 'ADMIN') {
        throw new AuthenticationError('Not authorized to delete this event');
      }
      
      await MCREvent.deleteOne({ _id: args.id });
      
      pubsub.publish(MCR_EVENT_DELETED, { mcrEventDeleted: args.id });
      
      return true;
    }),

    // Bulletin Posts
    createMCRBulletinPost: withAuth(async (_: any, args: any, context: any) => {
      // Get MCR department ID
      const db = await context.mongoDb;
      const departmentsCollection = db.collection('departments');
      const mcrDepartment = await departmentsCollection.findOne({ name: 'MCR' });
      if (!mcrDepartment) {
        throw new UserInputError('MCR department not found');
      }
      
      // If untilNewPost is true, deactivate other "until new post" posts
      if (args.input.untilNewPost) {
        await BulletinPost.deactivateUntilNewPosts(mcrDepartment._id);
      }
      
      const bulletinPost = new BulletinPost({
        ...args.input,
        createdBy: context.user.userId,
        departmentId: mcrDepartment._id
      });
      
      const savedPost = await bulletinPost.save();
      
      pubsub.publish(BULLETIN_POST_CREATED, { mcrBulletinPostCreated: savedPost });
      
      return savedPost;
    }),

    updateMCRBulletinPost: withAuth(async (_: any, args: any, context: any) => {
      const bulletinPost = await BulletinPost.findById(args.id);
      
      if (!bulletinPost) {
        throw new UserInputError('Bulletin Post not found');
      }
      
      // Check permissions - only creator or admin can update
      if (bulletinPost.createdBy.toString() !== context.user.userId && context.user.systemRole !== 'ADMIN') {
        throw new AuthenticationError('Not authorized to update this post');
      }
      
      Object.assign(bulletinPost, args.input);
      const savedPost = await bulletinPost.save();
      
      pubsub.publish(BULLETIN_POST_UPDATED, { mcrBulletinPostUpdated: savedPost });
      
      return savedPost;
    }),

    deleteMCRBulletinPost: withAuth(async (_: any, args: any, context: any) => {
      const bulletinPost = await BulletinPost.findById(args.id);
      
      if (!bulletinPost) {
        throw new UserInputError('Bulletin Post not found');
      }
      
      // Check permissions - only creator or MCR admin can delete
      const isMCRAdmin = context.user.departments?.some((dept: any) => 
        dept.name === 'MCR' && dept.role === 'admin'
      ) || context.user.systemRole === 'ADMIN';
      
      if (bulletinPost.createdBy.toString() !== context.user.userId && !isMCRAdmin) {
        throw new AuthenticationError('Not authorized to delete this post');
      }
      
      await BulletinPost.deleteOne({ _id: args.id });
      
      pubsub.publish(BULLETIN_POST_DELETED, { mcrBulletinPostDeleted: args.id });
      
      return true;
    }),

    // Activity Rows
    createActivityRow: withAuth(async (_: any, args: any, context: any) => {
      const activityRow = new ActivityRow({
        ...args.input,
        createdBy: context.user.userId
      });
      
      const savedRow = await activityRow.save();
      
      pubsub.publish(ACTIVITY_ROW_CREATED, { activityRowCreated: savedRow });
      
      return savedRow;
    }),

    updateActivityRow: withAuth(async (_: any, args: any, context: any) => {
      const activityRow = await ActivityRow.findById(args.id);
      
      if (!activityRow) {
        throw new UserInputError('Activity Row not found');
      }
      
      Object.assign(activityRow, args.input);
      activityRow.updatedBy = context.user.userId;
      
      const savedRow = await activityRow.save();
      
      pubsub.publish(ACTIVITY_ROW_UPDATED, { activityRowUpdated: savedRow });
      
      return savedRow;
    }),

    deleteActivityRow: withAuth(async (_: any, args: any, context: any) => {
      const activityRow = await ActivityRow.findById(args.id);
      
      if (!activityRow) {
        throw new UserInputError('Activity Row not found');
      }
      
      await ActivityRow.deleteOne({ _id: args.id });
      
      pubsub.publish(ACTIVITY_ROW_DELETED, { activityRowDeleted: args.id });
      
      return true;
    }),

    hideActivityRow: withAuth(async (_: any, args: any, context: any) => {
      const activityRow = await ActivityRow.findById(args.id);
      
      if (!activityRow) {
        throw new UserInputError('Activity Row not found');
      }
      
      activityRow.isHidden = true;
      activityRow.updatedBy = context.user.userId;
      
      const savedRow = await activityRow.save();
      
      pubsub.publish(ACTIVITY_ROW_UPDATED, { activityRowUpdated: savedRow });
      
      return savedRow;
    }),
  },

  Subscription: {
    // MCR Events
    mcrEventCreated: {
      subscribe: withAuth(() => pubsub.asyncIterator([MCR_EVENT_CREATED]))
    },
    mcrEventUpdated: {
      subscribe: withAuth(() => pubsub.asyncIterator([MCR_EVENT_UPDATED]))
    },
    mcrEventDeleted: {
      subscribe: withAuth(() => pubsub.asyncIterator([MCR_EVENT_DELETED]))
    },

    // Bulletin Posts
    mcrBulletinPostCreated: {
      subscribe: withAuth(() => pubsub.asyncIterator([BULLETIN_POST_CREATED]))
    },
    mcrBulletinPostUpdated: {
      subscribe: withAuth(() => pubsub.asyncIterator([BULLETIN_POST_UPDATED]))
    },
    mcrBulletinPostDeleted: {
      subscribe: withAuth(() => pubsub.asyncIterator([BULLETIN_POST_DELETED]))
    },

    // Activity Rows
    activityRowCreated: {
      subscribe: withAuth(() => pubsub.asyncIterator([ACTIVITY_ROW_CREATED]))
    },
    activityRowUpdated: {
      subscribe: withAuth(() => pubsub.asyncIterator([ACTIVITY_ROW_UPDATED]))
    },
    activityRowDeleted: {
      subscribe: withAuth(() => pubsub.asyncIterator([ACTIVITY_ROW_DELETED]))
    },
  },

  // Field resolvers
  MCREvent: {
    createdBy: async (parent: IMCREvent, _: any, context: any) => {
      if (parent.createdBy && typeof parent.createdBy === 'object') {
        return parent.createdBy;
      }
      const db = await context.mongoDb;
      const usersCollection = db.collection('users');
      return await usersCollection.findOne({ _id: parent.createdBy });
    }
  },

  MCRBulletinPost: {
    createdBy: async (parent: IBulletinPost, _: any, context: any) => {
      if (parent.createdBy && typeof parent.createdBy === 'object') {
        return parent.createdBy;
      }
      const db = await context.mongoDb;
      const usersCollection = db.collection('users');
      return await usersCollection.findOne({ _id: parent.createdBy });
    }
  },

  ActivityRow: {
    createdBy: async (parent: IActivityRow, _: any, context: any) => {
      if (parent.createdBy && typeof parent.createdBy === 'object') {
        return parent.createdBy;
      }
      const db = await context.mongoDb;
      const usersCollection = db.collection('users');
      return await usersCollection.findOne({ _id: parent.createdBy });
    },
    updatedBy: async (parent: IActivityRow, _: any, context: any) => {
      if (!parent.updatedBy) return null;
      if (parent.updatedBy && typeof parent.updatedBy === 'object') {
        return parent.updatedBy;
      }
      const db = await context.mongoDb;
      const usersCollection = db.collection('users');
      return await usersCollection.findOne({ _id: parent.updatedBy });
    }
  }
};

export const mcrResolvers = resolvers;
