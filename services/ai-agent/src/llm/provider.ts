/**
 * LLM Provider Abstraction
 * 
 * Provides a unified interface for local LLM inference.
 * Supports Ollama (primary) with potential for llama.cpp.
 */

import { ZodSchema } from 'zod';

/**
 * Options for LLM generation
 */
export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  systemPrompt?: string;
  stopSequences?: string[];
}

/**
 * Response from LLM generation
 */
export interface LLMResponse {
  text: string;
  model: string;
  tokensUsed?: number;
  durationMs: number;
  finishReason: 'stop' | 'length' | 'error';
}

/**
 * Structured generation result
 */
export interface StructuredResult<T> {
  success: boolean;
  data?: T;
  raw: string;
  errors?: string[];
  model: string;
  durationMs: number;
}

/**
 * LLM Provider interface
 */
export interface LLMProvider {
  /**
   * Check if the LLM is available and ready
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Get list of available models
   */
  listModels(): Promise<string[]>;
  
  /**
   * Generate text completion
   */
  generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse>;
  
  /**
   * Generate with structured output (JSON)
   */
  generateStructured<T>(
    prompt: string,
    schema: ZodSchema<T>,
    options?: GenerateOptions
  ): Promise<StructuredResult<T>>;
  
  /**
   * Get provider name
   */
  getName(): string;
}

/**
 * Base provider configuration
 */
export interface ProviderConfig {
  baseUrl: string;
  primaryModel: string;
  hebrewModel: string;
  timeout: number;
  maxRetries: number;
  temperature: number;
  maxTokens: number;
}

/**
 * Abstract base class for LLM providers
 */
export abstract class BaseLLMProvider implements LLMProvider {
  protected config: ProviderConfig;
  
  constructor(config: ProviderConfig) {
    this.config = config;
  }
  
  abstract isAvailable(): Promise<boolean>;
  abstract listModels(): Promise<string[]>;
  abstract generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse>;
  abstract generateStructured<T>(
    prompt: string,
    schema: ZodSchema<T>,
    options?: GenerateOptions
  ): Promise<StructuredResult<T>>;
  abstract getName(): string;
  
  /**
   * Select appropriate model based on content
   */
  protected selectModel(text: string, requestedModel?: string): string {
    if (requestedModel) {
      return requestedModel;
    }
    
    // Check for Hebrew content
    if (this.containsHebrew(text)) {
      return this.config.hebrewModel;
    }
    
    return this.config.primaryModel;
  }
  
  /**
   * Check if text contains Hebrew characters
   */
  protected containsHebrew(text: string): boolean {
    return /[\u0590-\u05FF]/.test(text);
  }
  
  /**
   * Build default options
   */
  protected buildOptions(options?: GenerateOptions): Required<GenerateOptions> {
    return {
      model: options?.model || this.config.primaryModel,
      temperature: options?.temperature ?? this.config.temperature,
      maxTokens: options?.maxTokens ?? this.config.maxTokens,
      timeout: options?.timeout ?? this.config.timeout,
      systemPrompt: options?.systemPrompt || '',
      stopSequences: options?.stopSequences || [],
    };
  }
}

export default LLMProvider;
