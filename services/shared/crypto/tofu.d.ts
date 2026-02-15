export interface TrustedKey {
    userId: string;
    publicKey: string;
    fingerprint: string;
    trustedAt: string;
}
export declare function verifyKeyFingerprint(publicKey: string, storedFingerprint: string): Promise<boolean>;
export declare function onKeyChange(): 'warn';
//# sourceMappingURL=tofu.d.ts.map