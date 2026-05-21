/**
 * Lancelot AI Agent Configuration
 * 
 * All configuration for the AI agent service.
 * Environment variables override defaults.
 */

export interface AIConfig {
  // Service settings
  port: number;
  environment: 'development' | 'production';
  
  // LLM settings
  llm: {
    provider: 'ollama' | 'llamacpp';
    baseUrl: string;
    primaryModel: string;
    hebrewModel: string;
    timeout: number;
    maxRetries: number;
    temperature: number;
    maxTokens: number;
  };
  
  // Performance targets
  performance: {
    standardLatencyMs: number;
    heavyPlanningLatencyMs: number;
  };
  
  // MongoDB settings (reuse from api-gateway)
  mongodb: {
    url: string;
    database: string;
  };
  
  // AI Agent identity
  agent: {
    userId: string;
    email: string;
    displayName: string;
  };

  features: {
    enableE2eeChat: boolean;
    e2eeFallbackWarning: boolean;
  };

  // Embeddings + RAG knowledge base (help articles, presets)
  knowledge: {
    /** Ollama model used for text embeddings. */
    embeddingModel: string;
    /** Re-index interval in milliseconds (default 10 min). */
    indexRefreshMs: number;
    /** Mongo collection name for help articles. */
    helpCollectionName: string;
    /** Optional folder of curated .md files to index alongside DB articles. */
    knowledgeDir?: string;
    /** Whether to persist embeddings in Mongo (so we don't re-embed on restart). */
    persistEmbeddings: boolean;
    /** Mongo collection name for the persistent vector index. */
    vectorIndexCollection: string;
  };
}

function buildMongoUrl(): string {
  if (process.env.MONGODB_URL) {
    return process.env.MONGODB_URL;
  }
  
  const host = process.env.MONGO_HOST || '127.0.0.1';
  const port = process.env.MONGO_PORT || '27017';
  const database = process.env.MONGO_DATABASE || 'broadcast';
  
  if (process.env.NODE_ENV === 'development') {
    return `mongodb://${host}:${port}/${database}`;
  }
  
  const username = process.env.MONGO_USERNAME || 'LancelotERP_DB';
  const password = process.env.MONGO_PASSWORD || '';
  
  if (!password) {
    console.warn('⚠️ MONGO_PASSWORD not set, using unauthenticated connection');
    return `mongodb://${host}:${port}/${database}`;
  }
  
  return `mongodb://${username}:${encodeURIComponent(password)}@${host}:${port}/${database}?authSource=admin`;
}

export const config: AIConfig = {
  port: parseInt(process.env.AI_AGENT_PORT || '4001', 10),
  environment: (process.env.NODE_ENV as 'development' | 'production') || 'development',
  
  llm: {
    provider: (process.env.LLM_PROVIDER as 'ollama' | 'llamacpp') || 'ollama',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    // aya-expanse:8b is Cohere's explicitly-multilingual model — handles both
    // Hebrew and English without "language drift" (qwen2.5 leaks Chinese on
    // ambiguous Hebrew prompts, which broke the chat assistant in prod).
    primaryModel: process.env.LLM_PRIMARY_MODEL || 'aya-expanse:8b',
    hebrewModel: process.env.LLM_HEBREW_MODEL || 'aya-expanse:8b',
    timeout: parseInt(process.env.LLM_TIMEOUT || '30000', 10),
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '3', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '2048', 10),
  },
  
  performance: {
    standardLatencyMs: 8000,    // 2-8 seconds for standard requests
    heavyPlanningLatencyMs: 30000, // 15-30 seconds for heavy planning
  },
  
  mongodb: {
    url: buildMongoUrl(),
    database: process.env.MONGO_DATABASE || 'broadcast',
  },
  
  agent: {
    userId: process.env.AI_AGENT_USER_ID || 'ai-agent-lancelot',
    email: 'lancelot-ai@internal.system',
    displayName: 'Lancelot AI',
  },
  features: {
    enableE2eeChat: process.env.ENABLE_E2EE_CHAT === 'true',
    e2eeFallbackWarning: process.env.E2EE_FALLBACK_WARNING === 'true',
  },

  knowledge: {
    embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    indexRefreshMs: parseInt(process.env.AI_INDEX_REFRESH_MS || '600000', 10),
    helpCollectionName: process.env.AI_HELP_COLLECTION_NAME || 'helparticles',
    knowledgeDir: process.env.AI_KNOWLEDGE_DIR || undefined,
    persistEmbeddings: process.env.AI_PERSIST_EMBEDDINGS !== 'false',
    vectorIndexCollection: process.env.AI_VECTOR_INDEX_COLLECTION || 'aiVectorIndex',
  },
};

export default config;
