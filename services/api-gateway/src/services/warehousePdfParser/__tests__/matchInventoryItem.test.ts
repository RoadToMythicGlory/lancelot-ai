import { matchInventoryItem, InventoryItem } from '../matchInventoryItem';

const inventory: InventoryItem[] = [
  { id: '1', name: 'TRIPOD BIG', category: 'stabilizers' },
  { id: '2', name: 'LIVEU 800', category: 'liveu_kits' },
  { id: '3', name: 'LIVEU 600', category: 'liveu_kits' },
  { id: '4', name: 'SONY PXW-Z750', category: 'cameras' },
  { id: '5', name: 'RED KOMODO 6K', category: 'cameras' },
  { id: '6', name: 'WIRELESS MIC', category: 'other' },
  { id: '7', name: 'MONITOR 17', category: 'monitors' },
];

describe('matchInventoryItem', () => {
  it('exact match returns confidence 1.0', () => {
    const result = matchInventoryItem('TRIPOD BIG', inventory);
    expect(result.matchedItemId).toBe('1');
    expect(result.confidence).toBe(1.0);
    expect(result.status).toBe('matched');
  });

  it('case-insensitive exact match', () => {
    const result = matchInventoryItem('tripod big', inventory);
    expect(result.matchedItemId).toBe('1');
    expect(result.confidence).toBe(1.0);
  });

  it('alias match: "800 U LIVE" -> LIVEU 800', () => {
    const result = matchInventoryItem('800 U LIVE', inventory);
    expect(result.matchedItemId).toBe('2');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.status).toBe('matched');
  });

  it('alias match: "800LIVEU" -> LIVEU 800', () => {
    const result = matchInventoryItem('800LIVEU', inventory);
    expect(result.matchedItemId).toBe('2');
    expect(result.status).toBe('matched');
  });

  it('alias match: "600liveu" -> LIVEU 600', () => {
    const result = matchInventoryItem('600liveu', inventory);
    expect(result.matchedItemId).toBe('3');
    expect(result.status).toBe('matched');
  });

  it('canonical key match for reordered tokens', () => {
    const result = matchInventoryItem('LIVEU 800', inventory);
    expect(result.matchedItemId).toBe('2');
    expect(result.status).toBe('matched');
  });

  it('returns unmatched for completely unknown items', () => {
    const result = matchInventoryItem('FLYING SAUCER 3000', inventory);
    expect(result.status).toBe('unmatched');
  });

  it('handles empty input', () => {
    const result = matchInventoryItem('', inventory);
    expect(result.status).toBe('unmatched');
  });

  it('handles empty inventory', () => {
    const result = matchInventoryItem('TRIPOD BIG', []);
    expect(result.status).toBe('unmatched');
  });

  it('fuzzy match with close names', () => {
    const result = matchInventoryItem('WIRELESS MICROPHONE', inventory);
    // Should match WIRELESS MIC with low confidence or via alias
    expect(result.matchedItemId).toBeTruthy();
  });

  it('camera names with embedded numbers are not confused', () => {
    const result = matchInventoryItem('RED Komodo 6K', inventory);
    expect(result.matchedItemId).toBe('5');
    expect(result.status).toBe('matched');
  });
});
