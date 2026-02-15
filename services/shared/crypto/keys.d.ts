export interface KeyPair {
    publicKey: string;
    secretKey: string;
}
export declare function generateKeyPair(): KeyPair;
export declare function computeFingerprint(publicKey: string): Promise<string>;
export declare function formatFingerprint(fullFingerprint: string): string;
//# sourceMappingURL=keys.d.ts.map