import { computeFingerprint } from './keys';

export interface TrustedKey {
  userId: string;
  publicKey: string;
  fingerprint: string;
  trustedAt: string;
}

export async function verifyKeyFingerprint(
  publicKey: string,
  storedFingerprint: string
): Promise<boolean> {
  const currentFingerprint = await computeFingerprint(publicKey);
  return currentFingerprint === storedFingerprint;
}

export function onKeyChange(): 'warn' {
  // Policy: disable E2EE until user verifies new key out-of-band.
  return 'warn';
}
