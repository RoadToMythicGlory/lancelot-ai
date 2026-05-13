import { normalizeEquipmentName, canonicalKey } from './normalizeEquipmentName';
import { distance as levenshteinDistance } from 'fastest-levenshtein';
import { getParserConfig } from './parserConfig';

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
}

export interface MatchResult {
  matchedItemId: string;
  matchedName: string;
  confidence: number;
  status: 'matched' | 'low_confidence' | 'unmatched';
}

let aliasMap: Map<string, string> | null = null;

function getAliasMap(): Map<string, string> {
  if (aliasMap) return aliasMap;
  aliasMap = new Map<string, string>();
  const config = getParserConfig();
  for (const [canonical, aliases] of Object.entries(config.aliases)) {
    const normalizedCanonical = normalizeEquipmentName(canonical);
    aliasMap.set(normalizedCanonical, normalizedCanonical);
    for (const alias of aliases) {
      aliasMap.set(normalizeEquipmentName(alias), normalizedCanonical);
    }
  }
  return aliasMap;
}

/**
 * Matches a parsed item name against the inventory list.
 * Match order: exact → alias → normalized → canonical key → fuzzy.
 */
export function matchInventoryItem(
  rawName: string,
  inventory: InventoryItem[]
): MatchResult {
  const unmatched: MatchResult = {
    matchedItemId: '',
    matchedName: '',
    confidence: 0,
    status: 'unmatched',
  };

  if (!rawName.trim() || inventory.length === 0) return unmatched;

  const normalized = normalizeEquipmentName(rawName);
  const rawCanonical = canonicalKey(rawName);

  // 1. Exact match against inventory name
  for (const item of inventory) {
    if (normalizeEquipmentName(item.name) === normalized) {
      return {
        matchedItemId: item.id,
        matchedName: item.name,
        confidence: 1.0,
        status: 'matched',
      };
    }
  }

  // 2. Alias match: resolve rawName via alias table, then find inventory item
  const aliasResolved = getAliasMap().get(normalized);
  if (aliasResolved) {
    for (const item of inventory) {
      if (normalizeEquipmentName(item.name) === aliasResolved) {
        return {
          matchedItemId: item.id,
          matchedName: item.name,
          confidence: 0.95,
          status: 'matched',
        };
      }
    }
  }

  // 3. Canonical key match
  for (const item of inventory) {
    if (canonicalKey(item.name) === rawCanonical) {
      return {
        matchedItemId: item.id,
        matchedName: item.name,
        confidence: 0.90,
        status: 'matched',
      };
    }
  }

  // 4. Fuzzy match using Levenshtein distance
  const fuzzyThreshold = getParserConfig().fuzzyThreshold;
  let bestMatch: MatchResult = unmatched;
  let bestScore = 0;

  for (const item of inventory) {
    const itemNorm = normalizeEquipmentName(item.name);
    const maxLen = Math.max(normalized.length, itemNorm.length);
    if (maxLen === 0) continue;

    const dist = levenshteinDistance(normalized, itemNorm);
    const similarity = 1 - dist / maxLen;

    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = {
        matchedItemId: item.id,
        matchedName: item.name,
        confidence: parseFloat(similarity.toFixed(2)),
        status: similarity >= fuzzyThreshold ? 'low_confidence' : 'unmatched',
      };
    }
  }

  // Don't assign a matchedItemId for truly unmatched items — otherwise
  // validateParsedRequest merges unrelated items under the same key
  // and their quantities snowball into the inventory total.
  if (bestMatch.status === 'unmatched') {
    return {
      ...bestMatch,
      matchedItemId: '',
      matchedName: '',
    };
  }

  return bestMatch;
}
