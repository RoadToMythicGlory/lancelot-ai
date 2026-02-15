// MongoDB Schemas for Chat Operations

// Chat Room Schema
const ChatRoomSchema = {
  _id: "ObjectId",
  id: "string", // UUID for compatibility with existing frontend
  name: "string",
  hebrewName: "string",
  description: "string",
  roomType: "string", // 'department', 'project', 'general', 'private'
  departmentId: "string", // UUID reference to PostgreSQL departments table
  isActive: "boolean",
  maxParticipants: "number",
  participants: ["string"], // Array of user UUIDs
  createdBy: "string", // User UUID
  createdAt: "Date",
  updatedAt: "Date",
  metadata: "object" // Additional room-specific data
};

// Chat Message Schema
const ChatMessageSchema = {
  _id: "ObjectId",
  id: "string", // UUID for compatibility
  roomId: "string", // For room messages, null for private messages
  conversationId: "string", // For private messages, null for room messages
  fromUserId: "string", // User UUID
  toUserId: "string", // For direct messages (legacy support)
  message: "string",
  messageType: "string", // 'text', 'file', 'image', 'system'
  isRead: "boolean",
  isSystemMessage: "boolean",
  readAt: "Date",
  editedAt: "Date",
  replyToId: "string", // ID of message being replied to
  metadata: "object", // File info, mentions, reactions, etc.
  createdAt: "Date",
  updatedAt: "Date"
};

// Private Conversation Schema
const PrivateConversationSchema = {
  _id: "ObjectId",
  id: "string", // UUID for compatibility
  participant1Id: "string", // User UUID (always the smaller UUID for consistency)
  participant2Id: "string", // User UUID (always the larger UUID for consistency)
  lastMessageAt: "Date",
  lastMessage: {
    id: "string",
    fromUserId: "string",
    message: "string",
    messageType: "string",
    createdAt: "Date"
  },
  unreadCounts: {
    // Track unread count per participant
    participant1: "number",
    participant2: "number"
  },
  isActive: "boolean", // Can be used to soft-delete conversations
  createdAt: "Date",
  updatedAt: "Date",
  metadata: "object" // Additional conversation settings
};

// Online User Schema (for real-time status)
const OnlineUserSchema = {
  _id: "ObjectId",
  userId: "string", // User UUID
  socketId: "string", // Current socket connection ID
  status: "string", // 'online', 'away', 'busy', 'offline'
  lastSeen: "Date",
  currentRoom: "string", // Current chat room if any
  metadata: {
    userAgent: "string",
    ipAddress: "string",
    platform: "string"
  },
  createdAt: "Date",
  updatedAt: "Date"
};

// Chat Notification Schema
const ChatNotificationSchema = {
  _id: "ObjectId",
  id: "string", // UUID for compatibility
  userId: "string", // Recipient user UUID
  type: "string", // 'new_message', 'mention', 'room_invite', 'user_online'
  title: "string",
  message: "string",
  data: {
    chatMessageId: "string",
    conversationId: "string",
    roomId: "string",
    fromUserId: "string",
    actionUrl: "string"
  },
  isRead: "boolean",
  readAt: "Date",
  expiresAt: "Date",
  createdAt: "Date"
};

// Typing Indicator Schema (for real-time typing status)
const TypingIndicatorSchema = {
  _id: "ObjectId",
  userId: "string", // User UUID who is typing
  roomId: "string", // For room typing (null for private)
  conversationId: "string", // For private conversation typing (null for rooms)
  isTyping: "boolean",
  lastTypingAt: "Date",
  expiresAt: "Date" // Auto-expire typing indicators
};

// Export schemas
module.exports = {
  ChatRoomSchema,
  ChatMessageSchema,
  PrivateConversationSchema,
  OnlineUserSchema,
  ChatNotificationSchema,
  TypingIndicatorSchema
}; 