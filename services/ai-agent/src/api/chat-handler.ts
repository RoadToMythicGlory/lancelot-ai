/**
 * Chat Handler
 * 
 * Handler for /ai/chat endpoint.
 */

import { Response } from 'express';
import { AuthenticatedRequest } from './middleware';
import { processMessage, getAgentStatus } from '../agent/orchestrator';
import { createLogger } from '../utils/logger';
import { ChatAgentResponse } from '../schemas/chat-response';
import { computeFingerprint } from '../../../shared/crypto/keys';
import type { EncryptedMessage, MessagePayload } from '../../../shared/crypto/types';
import { decryptFromSender, encryptForRecipient, createMessageId } from '../crypto/e2ee';
import { getAIPublicKey, getStoredFingerprint, storeFingerprint } from '../crypto/keyManager';
import { config } from '../config';

const logger = createLogger('chat-handler');

/**
 * Chat request body
 */
interface ChatRequest {
  conversationId: string;
  message: string;
  messageType?: string;
  context?: {
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    metadata?: Record<string, unknown>;
  };
  encryption?: {
    enabled: boolean;
    version: 1;
    senderPublicKeyFingerprint?: string;
  };
}

/**
 * Handle chat message
 */
export async function handleChatMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    const body = req.body as ChatRequest;
    
    // Validate request
    if (!body.conversationId || !body.message) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'conversationId and message are required',
      });
      return;
    }
    
    // Get user info
    const userId = req.user?.userId || 'anonymous';

    let payload: MessagePayload;

    const e2eeEnabled = config.features.enableE2eeChat;
    if (!e2eeEnabled && body.encryption?.enabled) {
      res.status(400).json({
        error: 'E2EE disabled',
        message: 'Encrypted messages are not accepted when E2EE is disabled.',
      });
      return;
    }
    let senderPublicKey: string | null = null;
    if (e2eeEnabled && body.encryption?.enabled && body.messageType === 'encrypted') {
      const encrypted = JSON.parse(body.message) as EncryptedMessage;
      senderPublicKey = encrypted.senderPublicKey;

      if (body.encryption.senderPublicKeyFingerprint) {
        const storedFingerprint = getStoredFingerprint(userId);
        const currentFingerprint = await computeFingerprint(encrypted.senderPublicKey);

        if (storedFingerprint && storedFingerprint !== currentFingerprint) {
          logger.warn('Key fingerprint mismatch', {
            conversationId: body.conversationId,
            userId,
          });
          res.status(400).json({
            error: 'Key fingerprint mismatch',
            message: 'Sender public key has changed. Please verify identity.',
          });
          return;
        }

        if (!storedFingerprint) {
          storeFingerprint(userId, currentFingerprint);
        }
      }

      payload = decryptFromSender(encrypted, userId, body.conversationId);
    } else {
      payload = {
        text: body.message,
        conversationId: body.conversationId,
        senderId: userId,
        messageId: createMessageId('msg'),
        createdAt: new Date().toISOString(),
      };
    }
    
    logger.info('Processing chat message', {
      conversationId: body.conversationId,
      userId,
      messageLength: payload.text.length,
      traceId: req.traceId,
    });
    
    // Process the message
    const response: ChatAgentResponse = await processMessage({
      conversationId: payload.conversationId,
      userId: payload.senderId,
      message: payload.text,
      conversationHistory: body.context?.history,
      additionalContext: body.context?.metadata,
      user: req.user
        ? {
            userId: req.user.userId,
            email: req.user.email,
            displayName: req.user.displayName,
            permissions: req.user.permissions,
            departmentId: req.user.departmentId,
            systemRole: req.user.systemRole,
          }
        : undefined,
    });
    
    logger.info('Chat message processed', {
      conversationId: payload.conversationId,
      intent: response.intent.primary,
      durationMs: Date.now() - startTime,
      traceId: req.traceId,
    });

    if (e2eeEnabled && body.encryption?.enabled && body.messageType === 'encrypted' && senderPublicKey) {
      const aiUserId = config.agent.userId;
      const responsePayload: MessagePayload = {
        text: response.response.text,
        conversationId: payload.conversationId,
        senderId: aiUserId,
        messageId: createMessageId('ai'),
        createdAt: new Date().toISOString(),
      };

      const encryptedResponse = encryptForRecipient(responsePayload, senderPublicKey);

      res.json({
        ...response,
        response: {
          ...response.response,
          text: JSON.stringify(encryptedResponse),
        },
        encryption: {
          enabled: true,
          version: 1,
          senderPublicKeyFingerprint: await computeFingerprint(getAIPublicKey()),
        },
      });
      return;
    }

    res.json(response);
    
  } catch (error) {
    logger.error('Chat handler error', {
      error: (error as Error).message,
      traceId: req.traceId,
    });
    
    res.status(500).json({
      error: 'Processing Error',
      message: 'Failed to process chat message',
      traceId: req.traceId,
    });
  }
}

/**
 * Get AI agent status
 */
export async function handleStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const status = await getAgentStatus();
    
    res.json({
      status: status.isOnline ? 'online' : 'offline',
      modelLoaded: status.modelLoaded,
      capabilities: status.capabilities,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    logger.error('Status check error', {
      error: (error as Error).message,
    });
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to check agent status',
    });
  }
}

/**
 * Health check endpoint
 */
export function handleHealth(req: AuthenticatedRequest, res: Response): void {
  res.json({
    status: 'healthy',
    service: 'ai-agent',
    timestamp: new Date().toISOString(),
  });
}

export default {
  handleChatMessage,
  handleStatus,
  handleHealth,
};
