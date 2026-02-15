/**
 * Validation Utilities for Lancelot AI Agent
 * 
 * Schema validation helpers using Zod.
 */

import { z, ZodError, ZodSchema } from 'zod';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Validate data against a Zod schema
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): ValidationResult<T> {
  try {
    const parsed = schema.parse(data);
    return {
      success: true,
      data: parsed,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      };
    }
    return {
      success: false,
      errors: ['Unknown validation error'],
    };
  }
}

/**
 * Validate and throw if invalid
 */
export function validateOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safe JSON parse with validation
 */
export function parseJSON<T>(json: string, schema: ZodSchema<T>): ValidationResult<T> {
  try {
    const parsed = JSON.parse(json);
    return validate(schema, parsed);
  } catch (error) {
    return {
      success: false,
      errors: [`Invalid JSON: ${(error as Error).message}`],
    };
  }
}

/**
 * Extract JSON from LLM response that may contain markdown code blocks
 */
export function extractJSON(text: string): string {
  // Try to find JSON in code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  
  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  // Try to find raw JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return arrayMatch[0];
  }
  
  // Return original text if no JSON found
  return text;
}

/**
 * Safely parse LLM output as JSON with schema validation
 */
export function parseLLMOutput<T>(output: string, schema: ZodSchema<T>): ValidationResult<T> {
  const jsonStr = extractJSON(output);
  return parseJSON(jsonStr, schema);
}

/**
 * Check if text contains Hebrew characters
 */
export function containsHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

/**
 * Generate a hash for content deduplication
 */
export function generateHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

// ─── CG / Viz field validators ───────────────────────────────────────────────

/**
 * Validate a CG text field against Viz broadcast constraints.
 * Returns { valid, error } — error is defined only when invalid.
 */
export function validateCGTextField(
  value: string,
  maxLen: number = 40,
): { valid: boolean; error?: string } {
  if (!value || value.trim().length === 0) {
    return { valid: false, error: 'Field is empty' };
  }
  if (value.length > maxLen) {
    return { valid: false, error: `Exceeds max length (${value.length}/${maxLen})` };
  }
  // Disallow control characters except standard whitespace
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)) {
    return { valid: false, error: 'Contains invalid control characters' };
  }
  return { valid: true };
}

/**
 * Basic RTL normalization for Hebrew CG text.
 * - Trims whitespace
 * - Removes LTR/RTL marks that could confuse Viz engines
 * - Normalizes multiple spaces to single space
 */
export function normalizeRTL(text: string): string {
  return text
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '') // Remove bidi control chars
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}

// ─── Structured output enforcement ──────────────────────────────────────────

/**
 * Enforce structured output from LLM with a single repair attempt.
 *
 * Flow:
 * 1. Parse rawOutput with Zod via parseLLMOutput.
 * 2. If valid → return data.
 * 3. If invalid → call repairFn once with the error description.
 * 4. Parse repaired output with Zod.
 * 5. If still invalid → return explicit error (never partial data).
 */
export async function enforceStructuredOutput<T>(
  rawOutput: string,
  schema: ZodSchema<T>,
  repairFn: (errorDescription: string) => Promise<string>,
): Promise<ValidationResult<T>> {
  // First attempt
  const firstResult = parseLLMOutput(rawOutput, schema);
  if (firstResult.success) {
    return firstResult;
  }

  // Single repair attempt
  const errorDesc = (firstResult.errors || ['Unknown validation error']).join('; ');
  try {
    const repairedOutput = await repairFn(errorDesc);
    const secondResult = parseLLMOutput(repairedOutput, schema);
    if (secondResult.success) {
      return secondResult;
    }

    // Repair failed — return explicit error with details
    return {
      success: false,
      errors: [
        'Structured output validation failed after repair attempt.',
        ...(secondResult.errors || []),
      ],
    };
  } catch (repairError) {
    return {
      success: false,
      errors: [
        'Structured output validation failed and repair threw an error.',
        (repairError as Error).message,
        ...(firstResult.errors || []),
      ],
    };
  }
}

// ─── End additions ──────────────────────────────────────────────────────────

export default {
  validate,
  validateOrThrow,
  parseJSON,
  extractJSON,
  parseLLMOutput,
  containsHebrew,
  generateHash,
  validateCGTextField,
  normalizeRTL,
  enforceStructuredOutput,
};
