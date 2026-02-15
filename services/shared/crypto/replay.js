"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplayDetector = void 0;
class ReplayDetector {
    constructor(loadCache = async () => [], saveCache = async () => undefined) {
        this.loadCache = loadCache;
        this.saveCache = saveCache;
        this.cache = new Map();
    }
    async checkReplay(conversationId, messageId) {
        if (!this.cache.has(conversationId)) {
            const existing = await this.loadCache(conversationId);
            this.cache.set(conversationId, new Set(existing));
        }
        const seenIds = this.cache.get(conversationId);
        if (seenIds.has(messageId)) {
            return true;
        }
        seenIds.add(messageId);
        await this.saveCache(conversationId, Array.from(seenIds));
        return false;
    }
}
exports.ReplayDetector = ReplayDetector;
//# sourceMappingURL=replay.js.map