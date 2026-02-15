/**
 * Conversation Memory
 * 
 * Manages short-term and long-term memory for AI conversations.
 */

import { v4 as uuidv4 } from 'uuid';
import { connectMongoDB } from '../data/mongodb-adapter';
import { createLogger } from '../utils/logger';

const logger = createLogger('memory');

/**
 * Message in conversation history
 */
export interface MemoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolsUsed?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Conversation context
 */
export interface ConversationContext {
  currentTopic?: string;
  activeTools?: string[];
  lastIntent?: string;
  entities?: Record<string, string>;
}

/**
 * Full conversation memory record
 */
export interface ConversationMemory {
  _id?: string;
  conversationId: string;
  userId: string;
  messages: MemoryMessage[];
  context: ConversationContext;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Maximum messages to keep in memory per conversation
 */
const MAX_MESSAGES = 50;

/**
 * Maximum context window for LLM (recent messages)
 */
const CONTEXT_WINDOW = 10;

/**
 * Get conversation memory from MongoDB
 */
export async function getConversationMemory(
  conversationId: string
): Promise<ConversationMemory | null> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<ConversationMemory>('aiConversationMemory');
    
    const memory = await collection.findOne({ conversationId });
    return memory;
  } catch (error) {
    logger.error('Failed to get conversation memory', {
      conversationId,
      error: (error as Error).message,
    });
    return null;
  }
}

/**
 * Get recent messages for LLM context
 */
export async function getRecentMessages(
  conversationId: string,
  limit: number = CONTEXT_WINDOW
): Promise<MemoryMessage[]> {
  const memory = await getConversationMemory(conversationId);
  
  if (!memory || !memory.messages) {
    return [];
  }
  
  // Return most recent messages
  return memory.messages.slice(-limit);
}

/**
 * Add a message to conversation memory
 */
export async function addMessage(
  conversationId: string,
  userId: string,
  message: Omit<MemoryMessage, 'id' | 'timestamp'>
): Promise<void> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<ConversationMemory>('aiConversationMemory');
    
    const newMessage: MemoryMessage = {
      id: uuidv4(),
      ...message,
      timestamp: new Date(),
    };
    
    // Try to update existing conversation
    const result = await collection.updateOne(
      { conversationId },
      {
        $push: {
          messages: {
            $each: [newMessage],
            $slice: -MAX_MESSAGES, // Keep only last MAX_MESSAGES
          },
        },
        $set: {
          updatedAt: new Date(),
        },
        $setOnInsert: {
          userId,
          context: {},
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    
    logger.debug('Added message to memory', {
      conversationId,
      messageId: newMessage.id,
      role: message.role,
      upserted: result.upsertedCount > 0,
    });
  } catch (error) {
    logger.error('Failed to add message to memory', {
      conversationId,
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Update conversation context
 */
export async function updateContext(
  conversationId: string,
  context: Partial<ConversationContext>
): Promise<void> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<ConversationMemory>('aiConversationMemory');
    
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined) {
        updateFields[`context.${key}`] = value;
      }
    }
    
    await collection.updateOne(
      { conversationId },
      { $set: updateFields }
    );
    
    logger.debug('Updated conversation context', {
      conversationId,
      context,
    });
  } catch (error) {
    logger.error('Failed to update context', {
      conversationId,
      error: (error as Error).message,
    });
  }
}

/**
 * Get conversation context
 */
export async function getContext(
  conversationId: string
): Promise<ConversationContext | null> {
  const memory = await getConversationMemory(conversationId);
  return memory?.context || null;
}

/**
 * Clear conversation memory
 */
export async function clearMemory(conversationId: string): Promise<void> {
  try {
    const db = await connectMongoDB();
    const collection = db.collection<ConversationMemory>('aiConversationMemory');
    
    await collection.deleteOne({ conversationId });
    
    logger.info('Cleared conversation memory', { conversationId });
  } catch (error) {
    logger.error('Failed to clear memory', {
      conversationId,
      error: (error as Error).message,
    });
  }
}

/**
 * Format messages for LLM prompt
 */
export function formatMessagesForPrompt(
  messages: MemoryMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * Summarize old messages (for long conversations)
 * This would be called by a background job to compress old messages
 */
export async function summarizeOldMessages(
  conversationId: string,
  summarizer: (messages: MemoryMessage[]) => Promise<string>
): Promise<void> {
  const memory = await getConversationMemory(conversationId);
  
  if (!memory || memory.messages.length <= CONTEXT_WINDOW * 2) {
    return; // Not enough messages to summarize
  }
  
  // Get old messages (beyond context window)
  const oldMessages = memory.messages.slice(0, -CONTEXT_WINDOW);
  const recentMessages = memory.messages.slice(-CONTEXT_WINDOW);
  
  // Summarize old messages
  const summary = await summarizer(oldMessages);
  
  // Create summary message
  const summaryMessage: MemoryMessage = {
    id: uuidv4(),
    role: 'assistant',
    content: `[סיכום שיחה קודמת]: ${summary}`,
    timestamp: new Date(),
    metadata: {
      isSummary: true,
      originalMessageCount: oldMessages.length,
    },
  };
  
  // Update memory with summary + recent messages
  const db = await connectMongoDB();
  const collection = db.collection<ConversationMemory>('aiConversationMemory');
  
  await collection.updateOne(
    { conversationId },
    {
      $set: {
        messages: [summaryMessage, ...recentMessages],
        updatedAt: new Date(),
      },
    }
  );
  
  logger.info('Summarized old messages', {
    conversationId,
    originalCount: oldMessages.length,
  });
}

export default {
  getConversationMemory,
  getRecentMessages,
  addMessage,
  updateContext,
  getContext,
  clearMemory,
  formatMessagesForPrompt,
  summarizeOldMessages,
};
