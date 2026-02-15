import { generateKeyPair } from '../../../shared/crypto/keys';

type AIAgentKeyPair = {
  publicKey: string;
  secretKey: string;
};

let cachedKeyPair: AIAgentKeyPair | null = null;
const fingerprintStore = new Map<string, string>();

function loadKeyPairFromEnv(): AIAgentKeyPair | null {
  const publicKey = process.env.AI_AGENT_PUBLIC_KEY;
  const secretKey = process.env.AI_AGENT_PRIVATE_KEY;
  if (!publicKey || !secretKey) {
    return null;
  }
  return { publicKey, secretKey };
}

export function getOrCreateAIAgentKeyPair(): AIAgentKeyPair {
  if (cachedKeyPair) {
    return cachedKeyPair;
  }

  const envPair = loadKeyPairFromEnv();
  if (envPair) {
    cachedKeyPair = envPair;
    return envPair;
  }

  cachedKeyPair = generateKeyPair();
  return cachedKeyPair;
}

export function getAIPublicKey(): string {
  return getOrCreateAIAgentKeyPair().publicKey;
}

export function getAIPrivateKey(): string {
  return getOrCreateAIAgentKeyPair().secretKey;
}

export function getStoredFingerprint(userId: string): string | null {
  return fingerprintStore.get(userId) || null;
}

export function storeFingerprint(userId: string, fingerprint: string): void {
  fingerprintStore.set(userId, fingerprint);
}
