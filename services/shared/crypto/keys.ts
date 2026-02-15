import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

export interface KeyPair {
  publicKey: string;
  secretKey: string;
}

export function generateKeyPair(): KeyPair {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    secretKey: encodeBase64(keyPair.secretKey),
  };
}

async function getSha256(input: Uint8Array): Promise<Uint8Array> {
  const subtle = (globalThis as any)?.crypto?.subtle;
  if (subtle) {
    const buffer = await subtle.digest('SHA-256', input);
    return new Uint8Array(buffer);
  }

  const cryptoModule = await import('crypto');
  const hash = cryptoModule.createHash('sha256').update(input).digest();
  return new Uint8Array(hash);
}

export async function computeFingerprint(publicKey: string): Promise<string> {
  const keyBytes = decodeBase64(publicKey);
  const hashBytes = await getSha256(keyBytes);
  return encodeBase64(hashBytes);
}

export function formatFingerprint(fullFingerprint: string): string {
  const fingerprintBytes = decodeBase64(fullFingerprint);
  return encodeBase64(fingerprintBytes.slice(0, 16));
}
