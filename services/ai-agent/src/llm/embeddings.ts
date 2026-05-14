/**
 * Local Embeddings via Ollama
 *
 * Uses Ollama's `/api/embeddings` endpoint with a local embedding model
 * (default `nomic-embed-text`, ~270MB). Falls back gracefully to the
 * trigram-hash embedding from `data/vector-store.ts` when Ollama is
 * unreachable, so the agent still works fully offline.
 *
 * Why a separate file from ollama-client.ts?
 *  - Embeddings have a different request shape and a different timeout
 *    profile (small, fast — no need for the 30s LLM timeout).
 *  - Keeps `vector-store.ts` decoupled from any specific provider.
 */

import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('embeddings');

const EMBEDDING_TIMEOUT_MS = 8000;

/**
 * Result of a single embedding call.
 *  - `embedding`: the dense vector (length depends on model).
 *  - `model`: which model produced it (for logging and dimension checks).
 *  - `source`: 'ollama' for the real embedder, 'fallback' for the trigram hash.
 */
export interface EmbedResult {
  embedding: number[];
  model: string;
  source: 'ollama' | 'fallback';
}

interface OllamaEmbeddingsResponse {
  embedding?: number[];
  // newer Ollama returns `embeddings: number[][]`
  embeddings?: number[][];
}

let cachedAvailability: { value: boolean; expiresAt: number } | null = null;
const AVAILABILITY_CACHE_MS = 30_000;

/**
 * Cheap availability check (cached for 30s) so we don't hammer Ollama
 * with a probe on every embed call when it's down.
 */
export async function isEmbeddingProviderAvailable(): Promise<boolean> {
  const now = Date.now();
  if (cachedAvailability && cachedAvailability.expiresAt > now) {
    return cachedAvailability.value;
  }
  try {
    const baseUrl = config.llm.baseUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    const ok = response.ok;
    cachedAvailability = { value: ok, expiresAt: now + AVAILABILITY_CACHE_MS };
    return ok;
  } catch {
    cachedAvailability = { value: false, expiresAt: now + AVAILABILITY_CACHE_MS };
    return false;
  }
}

/**
 * Embed a single text into a dense vector.
 *
 * If the Ollama embedding endpoint fails, returns a deterministic
 * trigram-hash fallback so the caller can still index/query without
 * crashing — but flags `source: 'fallback'` so callers can warn.
 */
export async function embed(text: string): Promise<EmbedResult> {
  const trimmed = (text || '').toString().trim();
  if (trimmed.length === 0) {
    return { embedding: [], model: 'empty', source: 'fallback' };
  }

  // If Ollama is known to be down (cached), skip straight to fallback.
  const available = await isEmbeddingProviderAvailable();
  if (!available) {
    return { embedding: trigramFallback(trimmed), model: 'trigram-fallback', source: 'fallback' };
  }

  const baseUrl = config.llm.baseUrl.replace(/\/$/, '');
  const model = config.knowledge.embeddingModel;

  try {
    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: trimmed }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      logger.warn('Ollama embeddings non-OK response, using fallback', {
        status: response.status,
        snippet: errText.slice(0, 120),
        model,
      });
      // Invalidate the cache so we re-probe next time.
      cachedAvailability = null;
      return { embedding: trigramFallback(trimmed), model: 'trigram-fallback', source: 'fallback' };
    }

    const data = (await response.json()) as OllamaEmbeddingsResponse;
    const vec = data.embedding || data.embeddings?.[0];

    if (!vec || vec.length === 0) {
      logger.warn('Ollama returned empty embedding, using fallback', { model });
      return { embedding: trigramFallback(trimmed), model: 'trigram-fallback', source: 'fallback' };
    }

    return { embedding: vec, model, source: 'ollama' };
  } catch (error) {
    logger.warn('Ollama embeddings call failed, using fallback', {
      error: (error as Error).message,
      model,
    });
    cachedAvailability = null;
    return { embedding: trigramFallback(trimmed), model: 'trigram-fallback', source: 'fallback' };
  }
}

/**
 * Embed a batch of texts sequentially. We don't parallelize to keep
 * pressure on a single local Ollama instance reasonable.
 */
export async function embedBatch(texts: string[]): Promise<EmbedResult[]> {
  const out: EmbedResult[] = [];
  for (const t of texts) {
    out.push(await embed(t));
  }
  return out;
}

/**
 * Deterministic 384-dim trigram-hash fallback. Exact copy of the math
 * in `data/vector-store.ts:simpleTextEmbedding` so the two stay in
 * sync — we keep it here too to avoid an import cycle.
 */
function trigramFallback(text: string, dimension = 384): number[] {
  const normalized = text.toLowerCase().trim();
  const embedding = new Array(dimension).fill(0);
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.slice(i, i + 3);
    let hash = 0;
    for (let j = 0; j < trigram.length; j++) {
      hash = (hash * 31 + trigram.charCodeAt(j)) % dimension;
    }
    embedding[hash] += 1;
  }
  const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) embedding[i] /= norm;
  }
  return embedding;
}

export default {
  embed,
  embedBatch,
  isEmbeddingProviderAvailable,
};
