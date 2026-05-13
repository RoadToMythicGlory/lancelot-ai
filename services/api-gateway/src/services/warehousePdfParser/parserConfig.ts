import aliasesJson from './aliases.json';

export interface ParserConfig {
  fuzzyThreshold: number;
  documentConfidenceThreshold: number;
  aliases: Record<string, string[]>;
  ignoreRowPatterns: string[];
  maxFileSizeMb: number;
  zeroQuantityBehavior: 'include' | 'exclude';
}

const DEFAULT_CONFIG: ParserConfig = {
  fuzzyThreshold: 0.82,
  documentConfidenceThreshold: 0.70,
  aliases: aliasesJson as Record<string, string[]>,
  ignoreRowPatterns: [
    '^טופס השכרת ציוד מחסן$',
    '^\\d{1,2}$',
    '^ליג[הת]',
  ],
  maxFileSizeMb: 10,
  zeroQuantityBehavior: 'exclude',
};

let cachedConfig: ParserConfig | null = null;

/**
 * Returns the current parser configuration.
 * Today: static defaults from aliases.json + hardcoded values.
 * Future: merge with overrides from a `parser_configs` MongoDB collection.
 */
export function getParserConfig(): ParserConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

/**
 * Resets the cached config (for testing or hot-reload from DB).
 */
export function resetParserConfigCache(): void {
  cachedConfig = null;
}
