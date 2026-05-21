/**
 * AI Knowledge Indexer
 *
 * Loads the AI's "live" knowledge corpus into the in-memory vector store
 * so the help-search and preset-search tools can answer real questions:
 *   - All published help articles (apps/web/src/app/help/page.tsx)
 *   - All external broadcast presets
 *   - Optional curated markdown files in `AI_KNOWLEDGE_DIR`
 *
 * Re-indexing strategy:
 *   - On boot: load + embed everything once (best-effort, errors logged
 *     but do not block service start).
 *   - Periodic: re-embed every `AI_INDEX_REFRESH_MS` (default 10 min).
 *   - On demand: `POST /ai/admin/reindex` (admin only) for ops + UI button.
 *
 * Persistence:
 *   - Embeddings are also written to the `aiVectorIndex` Mongo collection
 *     keyed by (sourceId, contentHash) so a service restart only re-embeds
 *     CHANGED documents, not the whole corpus.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { config } from '../config';
import { createLogger } from '../utils/logger';
import { connectMongoDB } from './mongodb-adapter';
import { getVectorStore } from './vector-store';
import { embed as embedText } from '../llm/embeddings';
import { listPublishedArticles } from './erp/help-articles';
import { listAllPresets } from './erp/presets';

const logger = createLogger('indexer');

export type IndexSource = 'help' | 'preset' | 'knowledge_file';

interface IndexableDoc {
  id: string;
  source: IndexSource;
  content: string;
  metadata: Record<string, unknown>;
}

interface PersistedVector {
  sourceId: string;
  source: IndexSource;
  contentHash: string;
  embeddingModel: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  content: string;
  updatedAt: Date;
}

export interface IndexerStats {
  helpArticles: number;
  presets: number;
  knowledgeFiles: number;
  totalIndexed: number;
  durationMs: number;
}

let refreshTimer: NodeJS.Timeout | null = null;
let isIndexing = false;

/**
 * Run a full re-index. Idempotent and safe to call concurrently — a
 * second invocation while one is in flight is a no-op.
 */
export async function reindexAll(): Promise<IndexerStats> {
  if (isIndexing) {
    logger.info('Reindex already in progress, skipping concurrent call');
    return { helpArticles: 0, presets: 0, knowledgeFiles: 0, totalIndexed: 0, durationMs: 0 };
  }
  isIndexing = true;
  const startedAt = Date.now();
  const stats: IndexerStats = {
    helpArticles: 0,
    presets: 0,
    knowledgeFiles: 0,
    totalIndexed: 0,
    durationMs: 0,
  };

  try {
    const docs: IndexableDoc[] = [];

    // ── Help articles ────────────────────────────────────────────
    try {
      const articles = await listPublishedArticles();
      for (const a of articles) {
        const titleHe = a.titleHe || a.title;
        const body = a.contentHe || a.content;
        const excerpt = a.excerptHe || a.excerpt || '';
        const text = [titleHe, excerpt, body].filter(Boolean).join('\n\n');
        docs.push({
          id: `help:${a.id}`,
          source: 'help',
          content: text,
          metadata: {
            source: 'help',
            articleId: a.id,
            slug: a.slug,
            title: titleHe,
            category: a.category,
            tags: a.tags,
          },
        });
      }
      stats.helpArticles = articles.length;
    } catch (err) {
      logger.warn('Indexer: help articles failed', { error: (err as Error).message });
    }

    // ── External broadcast presets ───────────────────────────────
    try {
      const presets = await listAllPresets();
      for (const p of presets) {
        const equipmentSummary = p.equipment
          .map((e) => `${e.count}x ${e.categoryLabel}`)
          .join(', ');
        const rolesSummary = p.roles
          .map((r) => `${r.count}x ${r.roleLabel}`)
          .join(', ');
        const text = [
          `פריסט: ${p.name}`,
          p.description ? `תיאור: ${p.description}` : '',
          p.tags.length > 0 ? `תגיות: ${p.tags.join(', ')}` : '',
          rolesSummary ? `צוות: ${rolesSummary}` : '',
          equipmentSummary ? `ציוד: ${equipmentSummary}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        docs.push({
          id: `preset:${p.id}`,
          source: 'preset',
          content: text,
          metadata: {
            source: 'preset',
            presetId: p.id,
            name: p.name,
            tags: p.tags,
          },
        });
      }
      stats.presets = presets.length;
    } catch (err) {
      logger.warn('Indexer: presets failed', { error: (err as Error).message });
    }

    // ── Curated markdown knowledge files (optional) ──────────────
    // Indexed alongside Mongo `helparticles` so the same RAG tool can
    // serve both DB-backed and repo-backed documentation (e.g.
    // docs/user-manual/05-broadcast-planning.md).
    try {
      const dir = config.knowledge.knowledgeDir;
      const resolvedDir = dir ? path.resolve(dir) : undefined;
      if (resolvedDir && fs.existsSync(resolvedDir)) {
        const files = fs
          .readdirSync(resolvedDir)
          .filter((f) => f.endsWith('.md') && !f.startsWith('_'));
        for (const file of files) {
          const fullPath = path.join(resolvedDir, file);
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const title = extractMarkdownTitle(raw) || file.replace(/\.md$/, '');
          const slug = file.replace(/\.md$/, '');
          // Prepend an explicit title line so the embedding model gets a
          // strong signal about what the chunk is about.
          docs.push({
            id: `knowledge:${file}`,
            source: 'knowledge_file',
            content: `${title}\n\n${raw}`,
            metadata: {
              source: 'knowledge_file',
              filename: file,
              path: fullPath,
              slug,
              title,
              category: 'user_manual',
            },
          });
        }
        stats.knowledgeFiles = files.length;
        logger.info('Indexer: loaded knowledge files', {
          dir: resolvedDir,
          count: files.length,
        });
      } else if (dir) {
        logger.warn('Indexer: AI_KNOWLEDGE_DIR set but path not found', {
          dir,
          resolved: resolvedDir,
        });
      }
    } catch (err) {
      logger.warn('Indexer: knowledge files failed', { error: (err as Error).message });
    }

    if (docs.length === 0) {
      logger.warn('Indexer: nothing to index');
      stats.durationMs = Date.now() - startedAt;
      return stats;
    }

    // ── Load persisted vectors so we only re-embed changed docs ──
    const persisted = await loadPersistedVectors();

    // ── Reset the in-memory store (we'll repopulate atomically) ──
    const store = getVectorStore();
    store.clear();
    store.resetDimension();

    let reusedFromCache = 0;
    let newlyEmbedded = 0;
    const newPersist: PersistedVector[] = [];

    for (const doc of docs) {
      const hash = sha256(doc.content);
      const cached = persisted.get(doc.id);

      let embedding: number[] | undefined;
      let model = 'unknown';

      if (cached && cached.contentHash === hash && cached.embedding.length > 0) {
        embedding = cached.embedding;
        model = cached.embeddingModel;
        reusedFromCache++;
      } else {
        const result = await embedText(doc.content);
        if (result.embedding.length > 0) {
          embedding = result.embedding;
          model = result.model;
          newlyEmbedded++;
        } else {
          logger.warn('Indexer: empty embedding, skipping doc', { id: doc.id });
          continue;
        }
      }

      store.add(doc.id, doc.content, embedding, doc.metadata);
      stats.totalIndexed++;

      newPersist.push({
        sourceId: doc.id,
        source: doc.source,
        contentHash: hash,
        embeddingModel: model,
        embedding,
        metadata: doc.metadata,
        content: doc.content,
        updatedAt: new Date(),
      });
    }

    if (config.knowledge.persistEmbeddings) {
      try {
        await persistVectors(newPersist);
      } catch (err) {
        logger.warn('Indexer: failed to persist vectors', {
          error: (err as Error).message,
        });
      }
    }

    stats.durationMs = Date.now() - startedAt;
    logger.info('Indexer: reindex complete', {
      helpArticles: stats.helpArticles,
      presets: stats.presets,
      knowledgeFiles: stats.knowledgeFiles,
      totalIndexed: stats.totalIndexed,
      reusedFromCache,
      newlyEmbedded,
      durationMs: stats.durationMs,
    });
    return stats;
  } finally {
    isIndexing = false;
  }
}

/**
 * Initialize the indexer: do an initial reindex (best-effort), then
 * schedule periodic refreshes. Safe to call once at boot.
 */
export async function initializeKnowledgeIndexer(): Promise<void> {
  // Stop any pre-existing timer (defensive — supports hot-reload in dev)
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  // Initial reindex — failures are logged but don't block startup
  try {
    await reindexAll();
  } catch (err) {
    logger.warn('Indexer: initial reindex failed', {
      error: (err as Error).message,
    });
  }

  const intervalMs = config.knowledge.indexRefreshMs;
  if (intervalMs > 0) {
    refreshTimer = setInterval(() => {
      reindexAll().catch((err) => {
        logger.warn('Indexer: scheduled reindex failed', {
          error: (err as Error).message,
        });
      });
    }, intervalMs);
    // Ensure the timer doesn't keep the process alive on shutdown
    refreshTimer.unref?.();
    logger.info('Indexer: periodic refresh scheduled', { intervalMs });
  }
}

/**
 * Stop the periodic indexer (used by graceful shutdown).
 */
export function shutdownKnowledgeIndexer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// ── Persistence helpers ──────────────────────────────────────────────

async function loadPersistedVectors(): Promise<Map<string, PersistedVector>> {
  const out = new Map<string, PersistedVector>();
  if (!config.knowledge.persistEmbeddings) return out;

  try {
    const db = await connectMongoDB();
    const docs = await db
      .collection<PersistedVector>(config.knowledge.vectorIndexCollection)
      .find({})
      .toArray();
    for (const d of docs) {
      out.set(d.sourceId, d);
    }
    logger.debug('Indexer: loaded persisted vectors', { count: out.size });
  } catch (err) {
    logger.warn('Indexer: failed to load persisted vectors', {
      error: (err as Error).message,
    });
  }
  return out;
}

async function persistVectors(vectors: PersistedVector[]): Promise<void> {
  if (vectors.length === 0) return;
  const db = await connectMongoDB();
  const coll = db.collection<PersistedVector>(config.knowledge.vectorIndexCollection);

  // Upsert each vector — bulkWrite for atomicity + speed.
  await coll.bulkWrite(
    vectors.map((v) => ({
      replaceOne: {
        filter: { sourceId: v.sourceId },
        replacement: v,
        upsert: true,
      },
    })),
    { ordered: false },
  );

  // Garbage-collect vectors that are no longer in the live set.
  const liveIds = new Set(vectors.map((v) => v.sourceId));
  const allDocs = await coll.find({}, { projection: { sourceId: 1 } }).toArray();
  const stale = allDocs.filter((d) => !liveIds.has(d.sourceId));
  if (stale.length > 0) {
    await coll.deleteMany({ sourceId: { $in: stale.map((d) => d.sourceId) } });
    logger.info('Indexer: removed stale persisted vectors', { count: stale.length });
  }
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

/**
 * Pull the first `# Heading` line from a markdown file. Used to give curated
 * knowledge files a real title in citations instead of the raw filename.
 */
function extractMarkdownTitle(content: string): string | null {
  // Strip a YAML frontmatter block if present.
  let body = content;
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 3);
    if (end !== -1) body = body.slice(end + 4);
  }
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
    // Stop scanning after the first ~20 non-empty lines — titles always
    // appear near the top.
    if (trimmed.length > 0 && !trimmed.startsWith('#')) break;
  }
  return null;
}

export default {
  reindexAll,
  initializeKnowledgeIndexer,
  shutdownKnowledgeIndexer,
};
