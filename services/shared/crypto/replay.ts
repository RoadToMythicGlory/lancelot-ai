export type ReplayCacheLoader = (conversationId: string) => Promise<string[]>;
export type ReplayCacheSaver = (conversationId: string, messageIds: string[]) => Promise<void>;

export class ReplayDetector {
  private cache = new Map<string, Set<string>>();

  constructor(
    private readonly loadCache: ReplayCacheLoader = async () => [],
    private readonly saveCache: ReplayCacheSaver = async () => undefined
  ) {}

  async checkReplay(conversationId: string, messageId: string): Promise<boolean> {
    if (!this.cache.has(conversationId)) {
      const existing = await this.loadCache(conversationId);
      this.cache.set(conversationId, new Set(existing));
    }

    const seenIds = this.cache.get(conversationId)!;
    if (seenIds.has(messageId)) {
      return true;
    }

    seenIds.add(messageId);
    await this.saveCache(conversationId, Array.from(seenIds));
    return false;
  }
}
