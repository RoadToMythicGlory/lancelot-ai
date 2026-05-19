import { Context } from '../types';
import { ObjectId } from 'mongodb';
import mongoose from 'mongoose';
import { connectMongoDB, connectMongoose } from '../config/mongodb';
import { BroadcastEvent } from '../models/broadcast.models';
import BulletinPost from '../models/bulletinPost';
import { requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';

// Hard caps so an unbounded query can't pull thousands of rows.
const MAX_DASHBOARD_BROADCASTS = 1000;
const MAX_DASHBOARD_SHIFTS = 1000;
const MAX_BULLETIN_LIMIT = 200;

// Shapes a Mongoose BulletinPost doc into the GraphQL `BulletinPost` type
// the dashboard expects. Author info is resolved via a single
// `users.findOne` to keep round-trips small.
async function shapeBulletinPost(doc: any): Promise<any> {
  if (!doc) return null;
  const mongoDb = await connectMongoDB();
  let author: any = {
    id: doc.createdBy?.toString?.() || String(doc.createdBy || ''),
    displayName: 'Unknown User',
    email: '',
  };
  if (doc.createdBy) {
    try {
      const user = await mongoDb
        .collection('users')
        .findOne({ _id: new ObjectId(String(doc.createdBy)) });
      if (user) {
        author = {
          id: user._id.toString(),
          displayName:
            user.displayName ||
            `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
            user.email ||
            'Unknown User',
          email: user.email || '',
        };
      }
    } catch {
      // Bad ObjectId or user missing — fall through with the placeholder.
    }
  }
  let departmentName: string | null = null;
  if (doc.departmentId) {
    try {
      const dept = await mongoDb
        .collection('departments')
        .findOne({ _id: new ObjectId(String(doc.departmentId)) });
      departmentName = dept?.hebrewName || dept?.name || null;
    } catch {
      departmentName = null;
    }
  }
  return {
    id: doc._id ? doc._id.toString() : doc.id,
    title: doc.title || '',
    content: doc.content || '',
    isEmergency: !!doc.isEmergency,
    isPinned: !!doc.isPinned,
    departmentId: doc.departmentId ? String(doc.departmentId) : null,
    departmentName,
    author,
    createdAt: (doc.createdAt instanceof Date
      ? doc.createdAt
      : new Date(doc.createdAt || Date.now())
    ).toISOString(),
    updatedAt: (doc.updatedAt instanceof Date
      ? doc.updatedAt
      : new Date(doc.updatedAt || Date.now())
    ).toISOString(),
    expiresAt: doc.expiryDate
      ? (doc.expiryDate instanceof Date
          ? doc.expiryDate
          : new Date(doc.expiryDate)
        ).toISOString()
      : null,
    viewCount: doc.viewCount || 0,
    tags: Array.isArray(doc.tags) ? doc.tags : [],
  };
}

// Define resolver types
type ResolverFn = (parent: any, args: any, context: Context, info?: any) => any;
type ResolverMap = {
  Query?: Record<string, ResolverFn>;
  Mutation?: Record<string, ResolverFn>;
  Subscription?: Record<string, ResolverFn>;
  [key: string]: any;
};

export const dashboardResolvers = {
  Query: {
    // Today's broadcasts
    todaysBroadcasts: async (_parent: any, _args: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);

      try {
        // Connect with Mongoose to use the same models as broadcast planning
        await connectMongoose();
        
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Find broadcasts for today using Mongoose model
        const broadcasts = await BroadcastEvent.find({
          startTime: {
            $gte: today,
            $lt: tomorrow
          }
        }).sort({ startTime: 1 }).limit(MAX_DASHBOARD_BROADCASTS).exec();

        console.log(`Found ${broadcasts.length} broadcasts for today`);

        return broadcasts.map(broadcast => ({
          id: broadcast._id.toString(),
          eventNumber: broadcast.eventNumber,
          title: broadcast.title || broadcast.hebrewTitle || '',
          hebrewTitle: broadcast.hebrewTitle,
          startTime: broadcast.startTime.toISOString(),
          endTime: broadcast.endTime ? broadcast.endTime.toISOString() : null,
          channel: broadcast.channel,
          eventType: broadcast.eventType,
          live: broadcast.live || false,
          location: broadcast.location,
          venue: broadcast.venue
        }));
      } catch (error) {
        console.error('Error fetching today\'s broadcasts:', error);
        return [];
      }
    },

    // This week's shifts
    weeklyShifts: async (_parent: any, { userId }: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);

      try {
        const mongoDb = await connectMongoDB();
        const shiftsCollection = mongoDb.collection('shifts');
        const usersCollection = mongoDb.collection('users');
        
        const targetUserId = userId || context.userId;

        // If a caller passes an explicit userId we must validate it before
        // shoving it into an ObjectId() further down.
        if (userId && !ObjectId.isValid(userId)) {
          throw new Error('Invalid user ID');
        }

        // Get current week's date range
        const today = new Date();
        const currentDay = today.getDay();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - currentDay);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        // Find shifts for the week for this user.
        // IMPORTANT: shifts are assigned via `assignedWorkers` array (not a top-level `userId` field).
        // Support both common shapes: assignedWorkers.userId and assignedWorkers.user.id.
        const shifts = await shiftsCollection.find({
          date: { $gte: weekStart, $lt: weekEnd },
          status: { $ne: 'cancelled' },
          $or: [
            { 'assignedWorkers.userId': targetUserId },
            { 'assignedWorkers.user.id': targetUserId },
          ],
        }).sort({ date: 1, startTime: 1 }).limit(MAX_DASHBOARD_SHIFTS).toArray();

        // Get user info if needed
        let userInfo = null;
        if (targetUserId && shifts.length > 0) {
          const user = await usersCollection.findOne({ _id: new ObjectId(targetUserId) });
          userInfo = user ? {
            id: user._id.toString(),
            displayName: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
          } : null;
        }

        // Build a map of department configs so we can resolve default start/end times
        // for shifts that don't have them stored directly.
        const deptConfigsCollection = mongoDb.collection('department_shift_configs');
        const uniqueDepts = [...new Set(shifts.map((s: any) => s.department).filter(Boolean))];
        const deptConfigDocs = uniqueDepts.length > 0
          ? await deptConfigsCollection.find({ departmentId: { $in: uniqueDepts } }).toArray()
          : [];
        const deptConfigMap = new Map(deptConfigDocs.map((d: any) => [d.departmentId, d]));

        // Return all shifts for the week (UI will dim past shifts if needed)
        return shifts.map((shift: any) => {
          const shiftDate: Date = shift.date instanceof Date ? shift.date : new Date(shift.date);

          // Resolve start/end time: prefer stored values, then look up department shift-type config
          let startTime = shift.startTime;
          let endTime = shift.endTime;
          if (!startTime || !endTime) {
            const config = deptConfigMap.get(shift.department);
            const stConfig = config?.shiftTypes?.find((st: any) => st.type === shift.shiftType);
            if (!startTime) startTime = stConfig?.defaultStartTime || null;
            if (!endTime) endTime = stConfig?.defaultEndTime || null;
          }

          return ({
            id: shift._id.toString(),
            date: shiftDate.toISOString(),
            startTime: startTime || '',
            endTime: endTime || '',
            shiftType: shift.shiftType || 'regular',
            department: shift.department || 'General',
            status: shift.status || 'scheduled',
            user: userInfo || {
              id: targetUserId,
              displayName: 'User'
            }
          });
        });
      } catch (error) {
        console.error('Error fetching weekly shifts:', error);
        return [];
      }
    },
    // Bulletin board queries
    bulletinPosts: async (
      _parent: any,
      { departmentId, limit = 10, onlyEmergency = false, onlyPinned = false }: any,
      context: Context,
    ) => {
      requirePermission(context, Permission.BULLETIN_VIEW);
      const boundedLimit = Math.max(1, Math.min(Number(limit) || 10, MAX_BULLETIN_LIMIT));

      try {
        await connectMongoose();

        const query: any = { isActive: true };
        // Suppress expired posts from the board so stale announcements
        // don't linger forever.
        query.$or = [{ expiryDate: null }, { expiryDate: { $exists: false } }, { expiryDate: { $gt: new Date() } }];
        if (departmentId && ObjectId.isValid(String(departmentId))) {
          query.departmentId = new mongoose.Types.ObjectId(String(departmentId));
        }
        if (onlyEmergency) query.isEmergency = true;
        if (onlyPinned) query.isPinned = true;

        const docs = await BulletinPost.find(query)
          .sort({ isEmergency: -1, isPinned: -1, createdAt: -1 })
          .limit(boundedLimit)
          .lean()
          .exec();

        return Promise.all(docs.map(shapeBulletinPost));
      } catch (error) {
        console.error('Error fetching bulletin posts:', error);
        return [];
      }
    },

    bulletinPost: async (_parent: any, { id }: any, context: Context) => {
      requirePermission(context, Permission.BULLETIN_VIEW);
      if (!ObjectId.isValid(String(id))) return null;
      try {
        await connectMongoose();
        const doc = await BulletinPost.findById(id).lean().exec();
        return shapeBulletinPost(doc);
      } catch (error) {
        console.error('Error fetching bulletin post:', error);
        return null;
      }
    },

    // Dashboard statistics queries
    dashboardStats: async (_parent: any, _args: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);

      try {
        // Connect with Mongoose for broadcasts
        await connectMongoose();
        
        const mongoDb = await connectMongoDB();
        // Mongoose's default collection name (pluralised, lowercased) for
        // the `BulletinPost` model is `bulletinposts`. The old code queried
        // a `bulletin_posts` collection that never existed in this app.
        const bulletinCollection = mongoDb.collection('bulletinposts');
        
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Count today's broadcasts using Mongoose model
        const todaysBroadcasts = await BroadcastEvent.countDocuments({
          startTime: {
            $gte: today,
            $lt: tomorrow
          }
        });
        
        // Count upcoming broadcasts (next 7 days)
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        const upcomingBroadcasts = await BroadcastEvent.countDocuments({
          startTime: {
            $gte: today,
            $lt: nextWeek
          }
        });
        
        // Get user statistics from MongoDB
        const usersCollection = mongoDb.collection('users');
        const shiftsCollection = mongoDb.collection('shifts');
        
        // Count total users
        const totalUsers = await usersCollection.countDocuments({ isDeleted: { $ne: true } });
        
        // Count active users (logged in within last 7 days)
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        const activeUsers = await usersCollection.countDocuments({
          isDeleted: { $ne: true },
          lastLogin: { $gt: lastWeek }
        });
        
        // Count unique departments
        const departments = await usersCollection.distinct('department', { department: { $ne: null } });
        const totalDepartments = departments.length;
        
        // Count active shifts today
        const activeShifts = await shiftsCollection.countDocuments({
          date: {
            $gte: today,
            $lt: tomorrow
          },
          status: { $ne: 'cancelled' }
        });
        
        // Count critical alerts (emergency bulletins). The schema uses
        // `expiryDate` (matches the Mongoose model) — the prior `expiresAt`
        // field was a leftover from the mock dataset.
        const criticalAlerts = await bulletinCollection.countDocuments({
          isEmergency: true,
          isActive: { $ne: false },
          $or: [
            { expiryDate: null },
            { expiryDate: { $exists: false } },
            { expiryDate: { $gt: new Date() } }
          ]
        });
        
        // Count open tickets (using mock data for now as tickets aren't implemented)
        const openTickets = 0; // TODO: Implement when ticket system is ready
        
        return {
          totalUsers,
          activeUsers,
          totalDepartments,
          todaysBroadcasts,
          upcomingBroadcasts,
          activeShifts,
          openTickets,
          criticalAlerts
        };
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        throw new Error('Failed to fetch dashboard statistics');
      }
    },

    departmentStats: async (_parent: any, { departmentId }: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);

      try {
        // Mock department statistics
        const deptNames: Record<string, string> = {
          'IT': 'מחלקת IT',
          'News': 'חדשות',
          'MCR': 'מחלקת בקרה',
          'Playout': 'מחלקת שידור'
        };

        return {
          departmentId,
          departmentName: deptNames[departmentId] || departmentId,
          totalEmployees: Math.floor(Math.random() * 20) + 5,
          activeToday: Math.floor(Math.random() * 15) + 1,
          onLeave: Math.floor(Math.random() * 3),
          upcomingShifts: Math.floor(Math.random() * 10),
          assignedEquipment: Math.floor(Math.random() * 30),
          openTickets: Math.floor(Math.random() * 5)
        };
      } catch (error) {
        console.error('Error fetching department stats:', error);
        throw new Error('Failed to fetch department statistics');
      }
    },

    myDepartmentStats: async (_parent: any, _args: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);
      const primaryDept = context.user!.departments?.[0]?.departmentId;
      if (!primaryDept) {
        throw new Error('No department assigned');
      }

      return (dashboardResolvers as any).Query.departmentStats(
        _parent,
        { departmentId: primaryDept },
        context
      );
    },

    // Support ticket queries
    supportTickets: async (_parent: any, { status, priority, assignedToMe, departmentId }: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);

      try {
        // Mock support tickets
        const tickets = [
          {
            id: '1',
            title: 'בעיה בציוד צילום',
            description: 'המצלמה בסטודיו 3 לא עובדת כראוי',
            status: 'open',
            priority: 'high',
            category: 'ציוד',
            departmentId: 'Cameramen',
            departmentName: 'צלמים',
            assignedTo: null,
            createdBy: {
              id: '3',
              displayName: 'יוסי כהן',
              email: 'yossi@example.com'
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedAt: null,
            comments: []
          },
          {
            id: '2',
            title: 'בקשה לעדכון תוכנה',
            description: 'נדרש עדכון לתוכנת העריכה',
            status: 'in_progress',
            priority: 'medium',
            category: 'תוכנה',
            departmentId: 'IT',
            departmentName: 'מחלקת IT',
            assignedTo: {
              id: '1',
              displayName: 'מנהל IT',
              email: 'it@example.com'
            },
            createdBy: {
              id: '4',
              displayName: 'דני לוי',
              email: 'dani@example.com'
            },
            createdAt: new Date(Date.now() - 86400000).toISOString(),
            updatedAt: new Date(Date.now() - 3600000).toISOString(),
            resolvedAt: null,
            comments: []
          }
        ];

        let filteredTickets = [...tickets];

        // Apply filters
        if (status) {
          filteredTickets = filteredTickets.filter(t => t.status === status);
        }
        if (priority) {
          filteredTickets = filteredTickets.filter(t => t.priority === priority);
        }
        if (assignedToMe) {
          filteredTickets = filteredTickets.filter(t => t.assignedTo?.id === context.userId);
        }
        if (departmentId) {
          filteredTickets = filteredTickets.filter(t => t.departmentId === departmentId);
        }

        return filteredTickets;
      } catch (error) {
        console.error('Error fetching support tickets:', error);
        return [];
      }
    },

    supportTicket: async (_parent: any, { id }: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);

      const tickets = await (dashboardResolvers as any).Query.supportTickets(_parent, {}, context);
      return tickets.find((t: any) => t.id === id) || null;
    },

    myTickets: async (_parent: any, _args: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);

      const tickets = await (dashboardResolvers as any).Query.supportTickets(_parent, {}, context);
      return tickets.filter((t: any) => t.createdBy.id === context.userId);
    }
  },

  Mutation: {
    // Bulletin board mutations
    createBulletinPost: async (_parent: any, args: any, context: Context) => {
      requirePermission(context, Permission.BULLETIN_MANAGE);

      try {
        await connectMongoose();
        const userId = context.user?.userId;
        if (!userId || !ObjectId.isValid(userId)) {
          throw new Error('Invalid user');
        }
        const departmentId =
          args.departmentId && ObjectId.isValid(String(args.departmentId))
            ? new mongoose.Types.ObjectId(String(args.departmentId))
            : null;
        const doc = await BulletinPost.create({
          title: args.title,
          content: args.content,
          isEmergency: !!args.isEmergency,
          isPinned: !!args.isPinned,
          tags: Array.isArray(args.tags) ? args.tags : [],
          viewCount: 0,
          createdBy: new mongoose.Types.ObjectId(userId),
          departmentId,
          expiryDate: args.expiresAt ? new Date(args.expiresAt) : undefined,
          isActive: true,
        });
        return shapeBulletinPost(doc.toObject());
      } catch (error) {
        console.error('Error creating bulletin post:', error);
        throw new Error('Failed to create bulletin post');
      }
    },

    updateBulletinPost: async (_parent: any, { id, ...updates }: any, context: Context) => {
      requirePermission(context, Permission.BULLETIN_MANAGE);
      if (!ObjectId.isValid(String(id))) {
        throw new Error('Bulletin post not found');
      }
      await connectMongoose();
      const doc = await BulletinPost.findById(id).exec();
      if (!doc || !doc.isActive) throw new Error('Bulletin post not found');

      // Authors can always edit their own post; otherwise the user needs
      // the manage perm we already checked above, OR MCR_ADMIN for legacy
      // admin-only override flows.
      const userId = context.user?.userId;
      const isOwner = userId && doc.createdBy?.toString() === userId;
      if (
        !isOwner &&
        !context.user!.has(Permission.BULLETIN_MANAGE) &&
        !context.user!.has(Permission.MCR_ADMIN)
      ) {
        throw new Error('Not authorized to update this post');
      }

      if (updates.title !== undefined) doc.title = updates.title;
      if (updates.content !== undefined) doc.content = updates.content;
      if (updates.isEmergency !== undefined) doc.isEmergency = !!updates.isEmergency;
      if (updates.isPinned !== undefined) doc.isPinned = !!updates.isPinned;
      if (updates.tags !== undefined)
        doc.tags = Array.isArray(updates.tags) ? updates.tags : [];
      if (updates.expiresAt !== undefined)
        doc.expiryDate = updates.expiresAt ? new Date(updates.expiresAt) : undefined;
      await doc.save();
      return shapeBulletinPost(doc.toObject());
    },

    deleteBulletinPost: async (_parent: any, { id }: any, context: Context) => {
      requirePermission(context, Permission.BULLETIN_MANAGE);
      if (!ObjectId.isValid(String(id))) {
        throw new Error('Bulletin post not found');
      }
      await connectMongoose();
      const doc = await BulletinPost.findById(id).exec();
      if (!doc || !doc.isActive) throw new Error('Bulletin post not found');

      const userId = context.user?.userId;
      const isOwner = userId && doc.createdBy?.toString() === userId;
      if (
        !isOwner &&
        !context.user!.has(Permission.BULLETIN_MANAGE) &&
        !context.user!.has(Permission.MCR_ADMIN)
      ) {
        throw new Error('Not authorized to delete this post');
      }
      // Soft delete so we never lose the announcement history.
      doc.isActive = false;
      await doc.save();
      return true;
    },

    incrementBulletinViewCount: async (_parent: any, { id }: any, context: Context) => {
      requirePermission(context, Permission.BULLETIN_VIEW);
      if (!ObjectId.isValid(String(id))) {
        throw new Error('Bulletin post not found');
      }
      await connectMongoose();
      const doc = await BulletinPost.findByIdAndUpdate(
        id,
        { $inc: { viewCount: 1 } },
        { new: true },
      ).exec();
      if (!doc) throw new Error('Bulletin post not found');
      return shapeBulletinPost(doc.toObject());
    },

    // Support ticket mutations
    createSupportTicket: async (_parent: any, args: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);

      try {
        const newTicket = {
          id: new ObjectId().toString(),
          title: args.title,
          description: args.description,
          status: 'open',
          priority: args.priority,
          category: args.category,
          departmentId: args.departmentId || context.user?.departments?.[0]?.departmentId,
          departmentName: args.departmentId || context.user?.departments?.[0]?.departmentName || 'כללי',
          assignedTo: null,
          createdBy: {
            id: context.user!.userId,
            displayName: context.user?.displayName || 'Unknown User',
            email: context.user?.email || ''
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          resolvedAt: null,
          comments: []
        };

        // In production, save to MongoDB
        return newTicket;
      } catch (error) {
        console.error('Error creating support ticket:', error);
        throw new Error('Failed to create support ticket');
      }
    },

    updateSupportTicket: async (_parent: any, { id, ...updates }: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);

      // In production, this would update in the database
      // For now, return a mock updated ticket
      return {
        id,
        ...updates,
        updatedAt: new Date().toISOString()
      };
    },

    addTicketComment: async (_parent: any, { ticketId, content, isInternal }: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);

      const comment = {
        id: new ObjectId().toString(),
        ticketId,
        content,
        author: {
          id: context.userId,
          displayName: context.user?.displayName || 'Unknown User',
          email: context.user?.email || ''
        },
        createdAt: new Date().toISOString(),
        isInternal: isInternal || false
      };

      return comment;
    },

    resolveTicket: async (_parent: any, { id, resolution }: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);

      // In production, update the ticket in the database
      return {
        id,
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    },

    closeTicket: async (_parent: any, { id }: any, context: Context) => {
      requirePermission(context, Permission.DASHBOARD_VIEW);

      // In production, update the ticket in the database
      return {
        id,
        status: 'closed',
        updatedAt: new Date().toISOString()
      };
    }
  }
};
