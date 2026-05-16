import { GraphQLResolveInfo } from 'graphql';
import { v4 as uuidv4 } from 'uuid';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { connectMongoDB } from '../config/mongodb';
import { requireAuth } from '../middleware/auth';
import { Permission } from '../rbac';

interface Context {
  user: { userId: string; email: string; firstName: string; lastName: string; displayName?: string } | null;
  mongoDb: Db;
}

// Bound list-style chat queries.
const MAX_CONVERSATIONS = 200;
const MAX_CHAT_MESSAGES = 200;

// Chat resolvers implementation
export const chatResolvers = {
  Query: {
    privateConversations: async (_: any, __: any, context: Context) => {
      requireAuth(context as any);

      try {
        const mongoDb = await connectMongoDB();
        if (!mongoDb) {
          console.error('MongoDB connection not available');
          return [];
        }
        
        const conversationsCollection = mongoDb.collection('privateConversations');
        
        // Find all conversations where the user is a participant.
        // Cap at MAX_CONVERSATIONS to avoid unbounded reads.
        const conversations = await conversationsCollection.find({
          $or: [
            { participant1Id: context.user!.userId },
            { participant2Id: context.user!.userId }
          ],
          isActive: { $ne: false }
        }).sort({ lastMessageAt: -1 }).limit(MAX_CONVERSATIONS).toArray();

        // Get user details for participants
        const userIds = new Set<string>();
        conversations.forEach(conv => {
          userIds.add(conv.participant1Id);
          userIds.add(conv.participant2Id);
        });

        // Get user details from MongoDB
        const usersCollection = mongoDb.collection('users');
        const userObjectIds = Array.from(userIds).map(id => {
          try {
            return new ObjectId(id);
          } catch {
            return null;
          }
        }).filter(id => id !== null) as ObjectId[];
        
        const users = await usersCollection.find({
          $or: [
            { _id: { $in: userObjectIds } },
            { id: { $in: Array.from(userIds) } }
          ]
        }).toArray();
        
        const userMap = new Map(users.map((u: any) => [u._id.toString(), {
          id: u._id.toString(),
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          department: u.department,
          displayName: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim()
        }]));

        // Calculate unread counts and format response
        const formattedConversations = await Promise.all(conversations.map(async (conv) => {
          const messagesCollection = mongoDb.collection('chatMessages');
          
          // Count unread messages for the current user
          const unreadCount = await messagesCollection.countDocuments({
            conversationId: conv.id,
            fromUserId: { $ne: context.user!.userId },
            isRead: false
          });

          return {
            id: conv.id,
            participant1: userMap.get(conv.participant1Id) || { id: conv.participant1Id },
            participant2: userMap.get(conv.participant2Id) || { id: conv.participant2Id },
            unreadCount: conv.participant1Id === context.user!.userId 
              ? conv.unreadCounts?.participant1 || unreadCount
              : conv.unreadCounts?.participant2 || unreadCount,
            lastMessageAt: conv.lastMessageAt
          };
        }));

        return formattedConversations || [];
      } catch (error) {
        console.error('Error fetching conversations:', error);
        return [];
      }
    },

    conversationMessages: async (_: any, args: { conversationId: string; limit?: number; offset?: number }, context: Context) => {
      requireAuth(context as any);

      try {
        const mongoDb = await connectMongoDB();
        const messagesCollection = mongoDb.collection('chatMessages');
        const conversationsCollection = mongoDb.collection('privateConversations');

        // Cap caller-provided pagination so a client can't pull thousands of
        // messages in one shot.
        const limit = Math.max(1, Math.min(Number(args.limit) || 50, MAX_CHAT_MESSAGES));
        const offset = Math.max(0, Number(args.offset) || 0);

        // Verify the requesting user is actually a participant in the
        // conversation before returning any messages.
        const conversation = await conversationsCollection.findOne({
          id: args.conversationId,
          $or: [
            { participant1Id: context.user!.userId },
            { participant2Id: context.user!.userId },
          ],
        });
        if (!conversation) {
          throw new Error('Conversation not found or unauthorized');
        }

        // Fetch messages for the conversation
        const messages = await messagesCollection
          .find({ conversationId: args.conversationId })
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .toArray();

        // Get user details for message senders from MongoDB
        const userIds = [...new Set(messages.map(m => m.fromUserId))];
        const usersCollection = mongoDb.collection('users');
        const userObjectIds = userIds.map(id => {
          try {
            return new ObjectId(id);
          } catch {
            return null;
          }
        }).filter(id => id !== null) as ObjectId[];
        
        const users = await usersCollection.find({
          $or: [
            { _id: { $in: userObjectIds } },
            { id: { $in: userIds } }
          ]
        }).toArray();

        const userMap = new Map(users.map((u: any) => [u._id.toString(), {
          id: u._id.toString(),
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          displayName: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim()
        }]));

        // Format messages with user details
        const formattedMessages = messages.map(msg => ({
          id: msg.id,
          conversationId: msg.conversationId,
          message: msg.message,
          messageType: msg.messageType || 'text',
          fromUser: userMap.get(msg.fromUserId) || { id: msg.fromUserId },
          isRead: msg.isRead || false,
          createdAt: msg.createdAt
        })).reverse(); // Reverse to get chronological order

        return formattedMessages || [];
      } catch (error) {
        console.error('Error fetching messages:', error);
        return [];
      }
    }
  },

  Mutation: {
    createOrGetConversation: async (_: any, args: { userId: string }, context: Context) => {
      requireAuth(context as any);

      if (!ObjectId.isValid(args.userId)) {
        throw new Error('Invalid user ID');
      }

      if (context.user!.userId === args.userId) {
        throw new Error('Cannot create conversation with yourself');
      }

      try {
        const mongoDb = await connectMongoDB();
        const conversationsCollection = mongoDb.collection('privateConversations');
        
        // Ensure consistent ordering of participant IDs
        const [participant1Id, participant2Id] = [context.user!.userId, args.userId].sort();

        // Check if conversation already exists
        let conversation = await conversationsCollection.findOne({
          participant1Id,
          participant2Id
        });

        if (!conversation) {
          // Create new conversation
          const conversationId = uuidv4();
          const newConversation = {
            _id: conversationId as any, // MongoDB will handle this
            id: conversationId,
            participant1Id,
            participant2Id,
            unreadCounts: {
              participant1: 0,
              participant2: 0
            },
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          await conversationsCollection.insertOne(newConversation);
          conversation = newConversation as any;
        }

        // Get user details from MongoDB
        const usersCollection = mongoDb.collection('users');
        const participantObjectIds = [participant1Id, participant2Id].map(id => {
          try {
            return new ObjectId(id);
          } catch {
            return null;
          }
        }).filter(id => id !== null) as ObjectId[];
        
        const users = await usersCollection.find({
          $or: [
            { _id: { $in: participantObjectIds } },
            { id: { $in: [participant1Id, participant2Id] } }
          ]
        }).toArray();

        const userMap = new Map(users.map((u: any) => [u._id.toString(), {
          id: u._id.toString(),
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          department: u.department,
          displayName: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim()
        }]));

        return {
          id: conversation!.id,
          participant1: userMap.get(participant1Id) || { id: participant1Id },
          participant2: userMap.get(participant2Id) || { id: participant2Id },
          unreadCount: 0,
          lastMessageAt: conversation!.lastMessageAt
        };
      } catch (error) {
        console.error('Error creating/getting conversation:', error);
        throw new Error('Failed to create or get conversation');
      }
    },

    sendPrivateMessage: async (_: any, args: { conversationId: string; message: string; messageType?: string }, context: Context) => {
      requireAuth(context as any);

      try {
        const mongoDb = await connectMongoDB();
        const conversationsCollection = mongoDb.collection('privateConversations');
        const messagesCollection = mongoDb.collection('chatMessages');

        // Verify user is part of the conversation
        const conversation = await conversationsCollection.findOne({
          id: args.conversationId,
          $or: [
            { participant1Id: context.user!.userId },
            { participant2Id: context.user!.userId }
          ]
        });

        if (!conversation) {
          throw new Error('Conversation not found or unauthorized');
        }

        // Create the message
        const newMessage = {
          id: uuidv4(),
          conversationId: args.conversationId,
          fromUserId: context.user!.userId,
          message: args.message,
          messageType: args.messageType || 'text',
          isRead: false,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await messagesCollection.insertOne(newMessage);

        // Update conversation's last message info
        const otherParticipantPosition = conversation.participant1Id === context.user!.userId ? 'participant2' : 'participant1';
        await conversationsCollection.updateOne(
          { id: args.conversationId },
          {
            $set: {
              lastMessageAt: newMessage.createdAt,
              lastMessage: {
                id: newMessage.id,
                fromUserId: newMessage.fromUserId,
                message: newMessage.message,
                messageType: newMessage.messageType,
                createdAt: newMessage.createdAt
              },
              updatedAt: new Date()
            },
            $inc: {
              [`unreadCounts.${otherParticipantPosition}`]: 1
            }
          }
        );

        // Return the message with user details
        return {
          id: newMessage.id,
          conversationId: newMessage.conversationId,
          message: newMessage.message,
          messageType: newMessage.messageType,
          fromUser: {
            id: context.user!.userId,
            displayName: context.user!.displayName || `${context.user!.firstName} ${context.user!.lastName}`.trim(),
            email: context.user!.email
          },
          isRead: false,
          createdAt: newMessage.createdAt
        };
      } catch (error) {
        console.error('Error sending message:', error);
        throw new Error('Failed to send message');
      }
    },

    markMessagesAsRead: async (_: any, args: { conversationId: string }, context: Context) => {
      requireAuth(context as any);

      try {
        const mongoDb = await connectMongoDB();
        const conversationsCollection = mongoDb.collection('privateConversations');
        const messagesCollection = mongoDb.collection('chatMessages');

        // Verify user is part of the conversation
        const conversation = await conversationsCollection.findOne({
          id: args.conversationId,
          $or: [
            { participant1Id: context.user!.userId },
            { participant2Id: context.user!.userId }
          ]
        });

        if (!conversation) {
          throw new Error('Conversation not found or unauthorized');
        }

        // Mark all messages from the other user as read
        await messagesCollection.updateMany(
          {
            conversationId: args.conversationId,
            fromUserId: { $ne: context.user!.userId },
            isRead: false
          },
          {
            $set: {
              isRead: true,
              readAt: new Date()
            }
          }
        );

        // Reset unread count for the current user
        const participantPosition = conversation.participant1Id === context.user!.userId ? 'participant1' : 'participant2';
        await conversationsCollection.updateOne(
          { id: args.conversationId },
          {
            $set: {
              [`unreadCounts.${participantPosition}`]: 0,
              updatedAt: new Date()
            }
          }
        );

        return true;
      } catch (error) {
        console.error('Error marking messages as read:', error);
        return false;
      }
    }
  }
};
