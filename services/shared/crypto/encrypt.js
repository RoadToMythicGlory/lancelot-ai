"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptMessage = encryptMessage;
exports.decryptMessage = decryptMessage;
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const tweetnacl_util_1 = require("tweetnacl-util");
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
function encryptMessage(payload, recipientPublicKey, senderSecretKey, senderPublicKey) {
    const payloadJson = JSON.stringify(payload);
    const payloadBytes = textEncoder.encode(payloadJson);
    // Strict nonce rule: random 24 bytes, never reuse per sender secret key.
    // Nonce history storage is not required in v1.
    const nonce = tweetnacl_1.default.randomBytes(24);
    const recipientKeyBytes = (0, tweetnacl_util_1.decodeBase64)(recipientPublicKey);
    const senderKeyBytes = (0, tweetnacl_util_1.decodeBase64)(senderSecretKey);
    const ciphertext = tweetnacl_1.default.box(payloadBytes, nonce, recipientKeyBytes, senderKeyBytes);
    if (!ciphertext) {
        throw new Error('Encryption failed');
    }
    return {
        v: 1,
        nonce: (0, tweetnacl_util_1.encodeBase64)(nonce),
        ciphertext: (0, tweetnacl_util_1.encodeBase64)(ciphertext),
        senderPublicKey,
    };
}
function decryptMessage(encrypted, recipientSecretKey, expectedSenderId, expectedConversationId) {
    const nonce = (0, tweetnacl_util_1.decodeBase64)(encrypted.nonce);
    const ciphertext = (0, tweetnacl_util_1.decodeBase64)(encrypted.ciphertext);
    const senderPublicKey = (0, tweetnacl_util_1.decodeBase64)(encrypted.senderPublicKey);
    const recipientSecretKeyBytes = (0, tweetnacl_util_1.decodeBase64)(recipientSecretKey);
    const decryptedBytes = tweetnacl_1.default.box.open(ciphertext, nonce, senderPublicKey, recipientSecretKeyBytes);
    if (!decryptedBytes) {
        throw new Error('Decryption failed - invalid ciphertext or key');
    }
    const payloadJson = textDecoder.decode(decryptedBytes);
    const payload = JSON.parse(payloadJson);
    if (payload.senderId !== expectedSenderId) {
        throw new Error('Decryption failed - sender ID mismatch');
    }
    if (payload.conversationId !== expectedConversationId) {
        throw new Error('Decryption failed - conversation ID mismatch');
    }
    return payload;
}
//# sourceMappingURL=encrypt.js.map