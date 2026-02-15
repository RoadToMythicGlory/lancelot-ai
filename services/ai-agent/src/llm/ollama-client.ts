/**
 * Ollama Client
 * 
 * HTTP client for Ollama local LLM inference.
 * https://ollama.com/
 */

import { ZodSchema } from 'zod';
import { BaseLLMProvider, GenerateOptions, LLMResponse, ProviderConfig, StructuredResult } from './provider';
import { createLogger } from '../utils/logger';
import { extractJSON } from '../utils/validation';

const logger = createLogger('ollama-client');

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
    stop?: string[];
  };
  format?: 'json';
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaTagsResponse {
  models: Array<{
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
  }>;
}

export class OllamaClient extends BaseLLMProvider {
  private baseUrl: string;
  
  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }
  
  getName(): string {
    return 'ollama';
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      logger.warn('Ollama not available', { error: (error as Error).message });
      return false;
    }
  }
  
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`);
      }
      
      const data = await response.json() as OllamaTagsResponse;
      return data.models.map(m => m.name);
    } catch (error) {
      logger.error('Failed to list Ollama models', { error: (error as Error).message });
      return [];
    }
  }
  
  async generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const opts = this.buildOptions(options);
    const model = this.selectModel(prompt, opts.model);
    
    logger.debug('Generating with Ollama', { model, promptLength: prompt.length });
    
    const requestBody: OllamaGenerateRequest = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: opts.temperature,
        num_predict: opts.maxTokens,
        stop: opts.stopSequences.length > 0 ? opts.stopSequences : undefined,
      },
    };
    
    if (opts.systemPrompt) {
      requestBody.system = opts.systemPrompt;
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(opts.timeout),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json() as OllamaGenerateResponse;
      const durationMs = Date.now() - startTime;
      
      logger.debug('Ollama generation complete', {
        model,
        durationMs,
        responseLength: data.response.length,
      });
      
      return {
        text: data.response,
        model: data.model,
        tokensUsed: data.eval_count,
        durationMs,
        finishReason: 'stop',
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      if ((error as Error).name === 'AbortError') {
        logger.error('Ollama generation timed out', { model, timeout: opts.timeout });
        return {
          text: '',
          model,
          durationMs,
          finishReason: 'error',
        };
      }
      
      logger.error('Ollama generation failed', { 
        model, 
        error: (error as Error).message,
        durationMs,
      });
      
      throw error;
    }
  }
  
  async generateStructured<T>(
    prompt: string,
    schema: ZodSchema<T>,
    options?: GenerateOptions
  ): Promise<StructuredResult<T>> {
    const startTime = Date.now();
    const opts = this.buildOptions(options);
    const model = this.selectModel(prompt, opts.model);
    
    // Add JSON instruction to system prompt
    const jsonSystemPrompt = `${opts.systemPrompt || ''}

IMPORTANT: You MUST respond with valid JSON only. No markdown, no explanations, no code blocks.
The response must be a valid JSON object that matches the expected schema.`;
    
    logger.debug('Generating structured output with Ollama', { model });
    
    const requestBody: OllamaGenerateRequest = {
      model,
      prompt,
      system: jsonSystemPrompt,
      stream: false,
      format: 'json', // Request JSON format from Ollama
      options: {
        temperature: Math.min(opts.temperature, 0.5), // Lower temp for structured output
        num_predict: opts.maxTokens,
      },
    };
    
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(opts.timeout),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json() as OllamaGenerateResponse;
      const durationMs = Date.now() - startTime;
      
      // Extract and parse JSON
      const jsonStr = extractJSON(data.response);
      
      try {
        const parsed = JSON.parse(jsonStr);
        const validated = schema.safeParse(parsed);
        
        if (validated.success) {
          logger.debug('Structured output validated successfully', { model, durationMs });
          return {
            success: true,
            data: validated.data,
            raw: data.response,
            model: data.model,
            durationMs,
          };
        } else {
          const errors = validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
          logger.warn('Structured output validation failed', { model, errors });
          return {
            success: false,
            raw: data.response,
            errors,
            model: data.model,
            durationMs,
          };
        }
      } catch (parseError) {
        logger.warn('Failed to parse JSON from LLM response', {
          model,
          error: (parseError as Error).message,
          response: data.response.substring(0, 200),
        });
        return {
          success: false,
          raw: data.response,
          errors: [`JSON parse error: ${(parseError as Error).message}`],
          model: data.model,
          durationMs,
        };
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error('Structured generation failed', {
        model,
        error: (error as Error).message,
        durationMs,
      });
      
      return {
        success: false,
        raw: '',
        errors: [(error as Error).message],
        model,
        durationMs,
      };
    }
  }
}

export default OllamaClient;
