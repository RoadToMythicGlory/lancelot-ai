/**
 * Vector Store
 *
 * Simple in-memory vector store for RAG, backed by:
 *  - Real semantic embeddings via Ollama (`llm/embeddings.ts`) when available.
 *  - Deterministic trigram-hash fallback for fully-offline operation.
 *
 * The store auto-adjusts to the embedding dimension on first add, so
 * switching embedding models (e.g. nomic-embed-text → bge-m3) is
 * transparent on a fresh boot.
 *
 * For production-scale corpora (>50k chunks) replace with pgvector or
 * Qdrant — the public API here is intentionally narrow so that's a
 * drop-in change.
 */

import { createLogger } from '../utils/logger';
import { embed as embedWithProvider } from '../llm/embeddings';

const logger = createLogger('vector-store');

/**
 * Vector document
 */
export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Search result
 */
export interface SearchResult {
  document: VectorDocument;
  score: number;
}

/**
 * In-memory vector store
 */
class InMemoryVectorStore {
  private documents: Map<string, VectorDocument> = new Map();
  private embeddingDimension: number = 384; // Default for small models
  
  /**
   * Add a document with its embedding
   */
  add(id: string, content: string, embedding: number[], metadata: Record<string, unknown> = {}): void {
    if (embedding.length !== this.embeddingDimension) {
      // Auto-adjust dimension on first add
      if (this.documents.size === 0) {
        this.embeddingDimension = embedding.length;
      } else {
        throw new Error(`Embedding dimension mismatch: expected ${this.embeddingDimension}, got ${embedding.length}`);
      }
    }
    
    this.documents.set(id, {
      id,
      content,
      embedding,
      metadata,
      createdAt: new Date(),
    });
    
    logger.debug('Added document to vector store', { id });
  }
  
  /**
   * Remove a document
   */
  remove(id: string): boolean {
    return this.documents.delete(id);
  }
  
  /**
   * Search for similar documents
   */
  search(queryEmbedding: number[], topK: number = 5): SearchResult[] {
    const results: SearchResult[] = [];
    
    for (const doc of this.documents.values()) {
      const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
      results.push({ document: doc, score });
    }
    
    // Sort by score descending and take top K
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
  
  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    
    if (denominator === 0) {
      return 0;
    }
    
    return dotProduct / denominator;
  }
  
  /**
   * Get store statistics
   */
  getStats(): { documentCount: number; embeddingDimension: number } {
    return {
      documentCount: this.documents.size,
      embeddingDimension: this.embeddingDimension,
    };
  }
  
  /**
   * Clear all documents
   */
  clear(): void {
    this.documents.clear();
    logger.info('Vector store cleared');
  }

  /**
   * Remove all documents whose metadata.source equals the given value.
   * Used by the indexer to atomically replace e.g. all "help" docs.
   */
  clearBySource(source: string): number {
    let removed = 0;
    for (const [id, doc] of this.documents.entries()) {
      if (doc.metadata?.source === source) {
        this.documents.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Get a document by ID
   */
  get(id: string): VectorDocument | undefined {
    return this.documents.get(id);
  }

  /**
   * Check if document exists
   */
  has(id: string): boolean {
    return this.documents.has(id);
  }

  /**
   * Search for similar documents, optionally filtered by metadata.source.
   */
  searchBySource(
    queryEmbedding: number[],
    source: string,
    topK: number = 5,
  ): SearchResult[] {
    const results: SearchResult[] = [];
    for (const doc of this.documents.values()) {
      if (doc.metadata?.source !== source) continue;
      results.push({ document: doc, score: this.cosineSimilarity(queryEmbedding, doc.embedding) });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Reset the dimension. Needed if the operator switches embedding
   * models — the indexer calls this before a full re-index.
   */
  resetDimension(): void {
    this.embeddingDimension = 384;
  }
}

// Singleton instance
let vectorStoreInstance: InMemoryVectorStore | null = null;

/**
 * Get the vector store instance
 */
export function getVectorStore(): InMemoryVectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new InMemoryVectorStore();
    logger.info('Vector store initialized');
  }
  return vectorStoreInstance;
}

/**
 * Simple text embedding using character n-grams
 * This is a basic fallback - for production, use a proper embedding model
 */
export function simpleTextEmbedding(text: string, dimension: number = 384): number[] {
  const normalized = text.toLowerCase().trim();
  const embedding = new Array(dimension).fill(0);
  
  // Create character trigram hash
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.slice(i, i + 3);
    let hash = 0;
    for (let j = 0; j < trigram.length; j++) {
      hash = (hash * 31 + trigram.charCodeAt(j)) % dimension;
    }
    embedding[hash] += 1;
  }
  
  // Normalize the embedding
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }
  }
  
  return embedding;
}

/**
 * Add text to vector store with auto-embedding (sync, trigram fallback only).
 *
 * Kept for backwards compatibility with the legacy news/RSS pipeline.
 * For new code prefer `addTextToStoreAsync` which uses real semantic
 * embeddings from Ollama when available.
 */
export function addTextToStore(
  id: string,
  content: string,
  metadata: Record<string, unknown> = {}
): void {
  const embedding = simpleTextEmbedding(content);
  getVectorStore().add(id, content, embedding, metadata);
}

/**
 * Async variant — embeds via Ollama (`nomic-embed-text` by default) and
 * falls back to the trigram hash if the embedding service is down.
 */
export async function addTextToStoreAsync(
  id: string,
  content: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const result = await embedWithProvider(content);
  if (!result.embedding || result.embedding.length === 0) {
    logger.warn('Skipping vector add — empty embedding', { id });
    return;
  }
  getVectorStore().add(id, content, result.embedding, {
    ...metadata,
    embeddingModel: result.model,
    embeddingSource: result.source,
  });
}

/**
 * Search vector store by text query (sync, trigram fallback only).
 */
export function searchByText(
  query: string,
  topK: number = 5
): SearchResult[] {
  const queryEmbedding = simpleTextEmbedding(query);
  return getVectorStore().search(queryEmbedding, topK);
}

/**
 * Async variant — embeds the query with the same provider used during
 * indexing so cosine similarity is meaningful.
 */
export async function searchByTextAsync(
  query: string,
  topK: number = 5,
): Promise<SearchResult[]> {
  const result = await embedWithProvider(query);
  if (!result.embedding || result.embedding.length === 0) return [];
  return getVectorStore().search(result.embedding, topK);
}

export default {
  getVectorStore,
  simpleTextEmbedding,
  addTextToStore,
  addTextToStoreAsync,
  searchByText,
  searchByTextAsync,
};
