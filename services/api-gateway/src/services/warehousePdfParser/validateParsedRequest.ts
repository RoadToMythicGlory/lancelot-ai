import { normalizeEquipmentName } from './normalizeEquipmentName';
import { MatchResult, InventoryItem } from './matchInventoryItem';

export interface ParsedEquipmentItem {
  rawName: string;
  rawNames: string[];
  normalizedName: string;
  quantity: number;
  matchedItemId: string;
  matchedName: string;
  confidence: number;
  status: 'matched' | 'low_confidence' | 'duplicate_merged' | 'unmatched';
  warnings: string[];
}

export interface ValidationResult {
  items: ParsedEquipmentItem[];
  warnings: string[];
}

/**
 * Merges duplicate items, flags zero-quantity rows, and checks inventory thresholds.
 */
export function validateParsedRequest(
  rows: Array<{
    rawName: string;
    quantity: number;
    match: MatchResult;
  }>,
  inventory: InventoryItem[]
): ValidationResult {
  const warnings: string[] = [];

  // Build a map keyed by normalized name to merge duplicates
  const mergeMap = new Map<
    string,
    {
      rawNames: string[];
      normalizedName: string;
      quantity: number;
      match: MatchResult;
    }
  >();

  for (const row of rows) {
    const normalized = normalizeEquipmentName(row.rawName);
    const key = row.match.matchedItemId || normalized;

    const existing = mergeMap.get(key);
    if (existing) {
      existing.rawNames.push(row.rawName);
      existing.quantity += row.quantity;
      // Keep the higher-confidence match
      if (row.match.confidence > existing.match.confidence) {
        existing.match = row.match;
      }
    } else {
      mergeMap.set(key, {
        rawNames: [row.rawName],
        normalizedName: normalized,
        quantity: row.quantity,
        match: row.match,
      });
    }
  }

  const items: ParsedEquipmentItem[] = [];

  for (const [, entry] of mergeMap) {
    const itemWarnings: string[] = [];
    let status: ParsedEquipmentItem['status'] = entry.match.status;

    // Flag duplicates
    if (entry.rawNames.length > 1) {
      status = 'duplicate_merged';
      itemWarnings.push(`merged_from_${entry.rawNames.length}_rows`);
    }

    // Flag zero quantity
    if (entry.quantity === 0) {
      itemWarnings.push('zero_quantity');
    }

    // Check inventory availability
    if (entry.match.matchedItemId) {
      const invItem = inventory.find(i => i.id === entry.match.matchedItemId) as any;
      if (invItem && typeof invItem.quantityTotal === 'number') {
        if (entry.quantity > invItem.quantityTotal) {
          itemWarnings.push('quantity_exceeds_total');
          warnings.push(
            `${entry.normalizedName}: requested ${entry.quantity} but total inventory is ${invItem.quantityTotal}`
          );
        }
      }
    }

    items.push({
      rawName: entry.rawNames[0],
      rawNames: entry.rawNames,
      normalizedName: entry.normalizedName,
      quantity: entry.quantity,
      matchedItemId: entry.match.matchedItemId,
      matchedName: entry.match.matchedName,
      confidence: entry.match.confidence,
      status,
      warnings: itemWarnings,
    });
  }

  return { items, warnings };
}
