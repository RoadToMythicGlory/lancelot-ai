import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';
import type { EncryptedMessage, MessagePayload } from './types';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encryptMessage(
  payload: MessagePayload,
  recipientPublicKey: string,
  senderSecretKey: string,
  senderPublicKey: string
): EncryptedMessage {
  const payloadJson = JSON.stringify(payload);
  const payloadBytes = textEncoder.encode(payloadJson);

  // Strict nonce rule: random 24 bytes, never reuse per sender secret key.
  // Nonce history storage is not required in v1.
  const nonce = nacl.randomBytes(24);

  const recipientKeyBytes = decodeBase64(recipientPublicKey);
  const senderKeyBytes = decodeBase64(senderSecretKey);

  const ciphertext = nacl.box(payloadBytes, nonce, recipientKeyBytes, senderKeyBytes);
  if (!ciphertext) {
    throw new Error('Encryption failed');
  }

  return {
    v: 1,
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(ciphertext),
    senderPublicKey,
  };
}

export function decryptMessage(
  encrypted: EncryptedMessage,
  recipientSecretKey: string,
  expectedSenderId: string,
  expectedConversationId: string
): MessagePayload {
  const nonce = decodeBase64(encrypted.nonce);
  const ciphertext = decodeBase64(encrypted.ciphertext);
  const senderPublicKey = decodeBase64(encrypted.senderPublicKey);
  const recipientSecretKeyBytes = decodeBase64(recipientSecretKey);

  const decryptedBytes = nacl.box.open(
    ciphertext,
    nonce,
    senderPublicKey,
    recipientSecretKeyBytes
  );
  if (!decryptedBytes) {
    throw new Error('Decryption failed - invalid ciphertext or key');
  }

  const payloadJson = textDecoder.decode(decryptedBytes);
  const payload = JSON.parse(payloadJson) as MessagePayload;

  if (payload.senderId !== expectedSenderId) {
    throw new Error('Decryption failed - sender ID mismatch');
  }

  if (payload.conversationId !== expectedConversationId) {
    throw new Error('Decryption failed - conversation ID mismatch');
  }

  return payload;
}
