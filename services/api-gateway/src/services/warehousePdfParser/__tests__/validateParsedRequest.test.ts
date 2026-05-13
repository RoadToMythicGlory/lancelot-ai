import { validateParsedRequest } from '../validateParsedRequest';
import { MatchResult } from '../matchInventoryItem';

function makeMatch(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    matchedItemId: 'item1',
    matchedName: 'TEST ITEM',
    confidence: 1.0,
    status: 'matched',
    ...overrides,
  };
}

describe('validateParsedRequest', () => {
  it('merges duplicate items with same matchedItemId', () => {
    const rows = [
      { rawName: 'TRIPOD BIG', quantity: 2, match: makeMatch({ matchedItemId: 'x1' }) },
      { rawName: 'TRIPOD BIG', quantity: 3, match: makeMatch({ matchedItemId: 'x1' }) },
    ];
    const result = validateParsedRequest(rows, []);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(5);
    expect(result.items[0].rawNames).toHaveLength(2);
    expect(result.items[0].status).toBe('duplicate_merged');
  });

  it('flags zero-quantity rows', () => {
    const rows = [
      { rawName: 'EMPTY ITEM', quantity: 0, match: makeMatch() },
    ];
    const result = validateParsedRequest(rows, []);
    expect(result.items[0].warnings).toContain('zero_quantity');
  });

  it('flags quantity exceeding total', () => {
    const inventory = [{ id: 'item1', name: 'TEST', category: 'other', quantityTotal: 3 }] as any;
    const rows = [
      { rawName: 'TEST', quantity: 10, match: makeMatch({ matchedItemId: 'item1' }) },
    ];
    const result = validateParsedRequest(rows, inventory);
    expect(result.items[0].warnings).toContain('quantity_exceeds_total');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('keeps unmatched items as-is', () => {
    const rows = [
      {
        rawName: 'UNKNOWN ITEM',
        quantity: 1,
        match: makeMatch({ matchedItemId: '', status: 'unmatched', confidence: 0 }),
      },
    ];
    const result = validateParsedRequest(rows, []);
    expect(result.items[0].status).toBe('unmatched');
    expect(result.items[0].matchedItemId).toBe('');
  });

  it('does not merge items with different matchedItemId', () => {
    const rows = [
      { rawName: 'ITEM A', quantity: 2, match: makeMatch({ matchedItemId: 'a' }) },
      { rawName: 'ITEM B', quantity: 3, match: makeMatch({ matchedItemId: 'b' }) },
    ];
    const result = validateParsedRequest(rows, []);
    expect(result.items).toHaveLength(2);
  });
});
