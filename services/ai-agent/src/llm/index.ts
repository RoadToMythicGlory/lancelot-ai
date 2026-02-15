/**
 * LLM Module Index
 * 
 * Export LLM provider and utilities.
 */

export * from './provider';
export * from './ollama-client';
export * from './prompt-templates';

export { default as OllamaClient } from './ollama-client';

import { config } from '../config';
import { OllamaClient } from './ollama-client';
import { LLMProvider, ProviderConfig } from './provider';

/**
 * Create the configured LLM provider
 */
export function createLLMProvider(): LLMProvider {
  const providerConfig: ProviderConfig = {
    baseUrl: config.llm.baseUrl,
    primaryModel: config.llm.primaryModel,
    hebrewModel: config.llm.hebrewModel,
    timeout: config.llm.timeout,
    maxRetries: config.llm.maxRetries,
    temperature: config.llm.temperature,
    maxTokens: config.llm.maxTokens,
  };
  
  // Currently only Ollama is supported
  return new OllamaClient(providerConfig);
}

// Singleton instance
let providerInstance: LLMProvider | null = null;

/**
 * Get the LLM provider singleton
 */
export function getLLMProvider(): LLMProvider {
  if (!providerInstance) {
    providerInstance = createLLMProvider();
  }
  return providerInstance;
}
