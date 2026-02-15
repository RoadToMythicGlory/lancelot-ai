/**
 * Tool Registry
 * 
 * Central registry for all AI agent tools.
 */

import { ZodSchema } from 'zod';
import { registerTool, ToolHandler, MessageContext } from '../agent/orchestrator';
import { createLogger } from '../utils/logger';

const logger = createLogger('tool-registry');

/**
 * Tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  intentType: string;
  handler: ToolHandler;
  version: string;
  isAsync: boolean;
  /** Optional Zod schema for validating tool input before execution */
  inputSchema?: ZodSchema;
}

/**
 * Registry of all available tools
 */
const tools: Map<string, ToolDefinition> = new Map();

/**
 * Register a tool with the registry and orchestrator
 */
export function registerAgentTool(definition: ToolDefinition): void {
  tools.set(definition.name, definition);
  registerTool(definition.intentType, definition.handler);
  
  if (!definition.inputSchema) {
    logger.warn(`Tool "${definition.name}" registered without an inputSchema — inputs will not be validated`, {
      intentType: definition.intentType,
    });
  }

  logger.info(`Registered tool: ${definition.name}`, {
    intentType: definition.intentType,
    version: definition.version,
    hasInputSchema: !!definition.inputSchema,
  });
}

/**
 * Get all registered tools
 */
export function getRegisteredTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

/**
 * Get tool by name
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

/**
 * Get tool by intent type
 */
export function getToolByIntent(intentType: string): ToolDefinition | undefined {
  for (const tool of tools.values()) {
    if (tool.intentType === intentType) {
      return tool;
    }
  }
  return undefined;
}

/**
 * Check if a tool is registered
 */
export function isToolRegistered(name: string): boolean {
  return tools.has(name);
}

/**
 * Get tool capabilities summary
 */
export function getToolCapabilities(): string[] {
  return Array.from(tools.values()).map(t => t.intentType);
}

export default {
  registerAgentTool,
  getRegisteredTools,
  getToolByName,
  getToolByIntent,
  isToolRegistered,
  getToolCapabilities,
};
