/**
 * Vector Store
 * 
 * Simple in-memory vector store for RAG.
 * For production, consider using pgvector or Qdrant.
 */

import { createLogger } from '../utils/logger';

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
 * Add text to vector store with auto-embedding
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
 * Search vector store by text query
 */
export function searchByText(
  query: string,
  topK: number = 5
): SearchResult[] {
  const queryEmbedding = simpleTextEmbedding(query);
  return getVectorStore().search(queryEmbedding, topK);
}

export default {
  getVectorStore,
  simpleTextEmbedding,
  addTextToStore,
  searchByText,
};
