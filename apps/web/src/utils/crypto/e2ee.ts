import { decryptMessage, encryptMessage } from '../../../../../services/shared/crypto/encrypt';
import { generateKeyPair } from '../../../../../services/shared/crypto/keys';
import { ReplayDetector } from '../../../../../services/shared/crypto/replay';
import type { EncryptedMessage, MessagePayload } from '../../../../../services/shared/crypto/types';
import {
  getFingerprint,
  getKeyPair,
  getReplayMessageIds,
  saveFingerprint,
  saveKeyPair,
  saveReplayMessageIds,
} from './keyStore';

export async function getOrCreateKeyPair(userId: string) {
  const existing = await getKeyPair(userId);
  if (existing) {
    return existing;
  }

  const keyPair = generateKeyPair();
  await saveKeyPair(userId, keyPair.publicKey, keyPair.secretKey);
  return {
    id: userId,
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    updatedAt: new Date().toISOString(),
  };
}

export function createReplayDetector() {
  return new ReplayDetector(
    async (conversationId) => getReplayMessageIds(conversationId),
    async (conversationId, messageIds) => saveReplayMessageIds(conversationId, messageIds)
  );
}

export function createMessageId(): string {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).substring(2)}`;
}

export function encryptChatPayload(params: {
  payload: MessagePayload;
  recipientPublicKey: string;
  senderSecretKey: string;
  senderPublicKey: string;
}): EncryptedMessage {
  return encryptMessage(
    params.payload,
    params.recipientPublicKey,
    params.senderSecretKey,
    params.senderPublicKey
  );
}

export function decryptChatPayload(params: {
  encrypted: EncryptedMessage;
  recipientSecretKey: string;
  expectedSenderId: string;
  expectedConversationId: string;
}): MessagePayload {
  return decryptMessage(
    params.encrypted,
    params.recipientSecretKey,
    params.expectedSenderId,
    params.expectedConversationId
  );
}

export async function getStoredFingerprint(userId: string) {
  return getFingerprint(userId);
}

export async function storeFingerprint(userId: string, fingerprint: string) {
  await saveFingerprint(userId, fingerprint);
}
