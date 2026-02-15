import { decryptMessage, encryptMessage } from '../../../shared/crypto/encrypt';
import type { EncryptedMessage, MessagePayload } from '../../../shared/crypto/types';
import { getAIPublicKey, getAIPrivateKey } from './keyManager';

export function createMessageId(prefix = 'ai'): string {
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2)}`;
}

export function encryptForRecipient(payload: MessagePayload, recipientPublicKey: string): EncryptedMessage {
  return encryptMessage(payload, recipientPublicKey, getAIPrivateKey(), getAIPublicKey());
}

export function decryptFromSender(
  encrypted: EncryptedMessage,
  expectedSenderId: string,
  expectedConversationId: string
): MessagePayload {
  return decryptMessage(encrypted, getAIPrivateKey(), expectedSenderId, expectedConversationId);
}
