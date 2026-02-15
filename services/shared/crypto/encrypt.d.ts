import type { EncryptedMessage, MessagePayload } from './types';
export declare function encryptMessage(payload: MessagePayload, recipientPublicKey: string, senderSecretKey: string, senderPublicKey: string): EncryptedMessage;
export declare function decryptMessage(encrypted: EncryptedMessage, recipientSecretKey: string, expectedSenderId: string, expectedConversationId: string): MessagePayload;
//# sourceMappingURL=encrypt.d.ts.map