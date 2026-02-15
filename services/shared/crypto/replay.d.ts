export type ReplayCacheLoader = (conversationId: string) => Promise<string[]>;
export type ReplayCacheSaver = (conversationId: string, messageIds: string[]) => Promise<void>;
export declare class ReplayDetector {
    private readonly loadCache;
    private readonly saveCache;
    private cache;
    constructor(loadCache?: ReplayCacheLoader, saveCache?: ReplayCacheSaver);
    checkReplay(conversationId: string, messageId: string): Promise<boolean>;
}
//# sourceMappingURL=replay.d.ts.map