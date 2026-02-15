export interface EncryptedMessage {
  v: 1;
  nonce: string;
  ciphertext: string;
  senderPublicKey: string;
}

export interface MessagePayload {
  text: string;
  conversationId: string;
  senderId: string;
  messageId: string;
  createdAt: string;
}

export interface EncryptionMetadata {
  enabled: boolean;
  version: 1;
  senderPublicKeyFingerprint?: string;
}

export interface ChatMessageEnvelope {
  id: string;
  conversationId: string;
  message: string;
  messageType: 'text' | 'encrypted';
  fromUserId: string;
  fromUserName: string;
  isRead: boolean;
  createdAt: Date | string;
  encryption?: EncryptionMetadata;
}
