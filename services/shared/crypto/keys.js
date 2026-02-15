"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateKeyPair = generateKeyPair;
exports.computeFingerprint = computeFingerprint;
exports.formatFingerprint = formatFingerprint;
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const tweetnacl_util_1 = require("tweetnacl-util");
function generateKeyPair() {
    const keyPair = tweetnacl_1.default.box.keyPair();
    return {
        publicKey: (0, tweetnacl_util_1.encodeBase64)(keyPair.publicKey),
        secretKey: (0, tweetnacl_util_1.encodeBase64)(keyPair.secretKey),
    };
}
async function getSha256(input) {
    const subtle = globalThis?.crypto?.subtle;
    if (subtle) {
        const buffer = await subtle.digest('SHA-256', input);
        return new Uint8Array(buffer);
    }
    const cryptoModule = await Promise.resolve().then(() => __importStar(require('crypto')));
    const hash = cryptoModule.createHash('sha256').update(input).digest();
    return new Uint8Array(hash);
}
async function computeFingerprint(publicKey) {
    const keyBytes = (0, tweetnacl_util_1.decodeBase64)(publicKey);
    const hashBytes = await getSha256(keyBytes);
    return (0, tweetnacl_util_1.encodeBase64)(hashBytes);
}
function formatFingerprint(fullFingerprint) {
    const fingerprintBytes = (0, tweetnacl_util_1.decodeBase64)(fullFingerprint);
    return (0, tweetnacl_util_1.encodeBase64)(fingerprintBytes.slice(0, 16));
}
//# sourceMappingURL=keys.js.map