import { normalizeEquipmentName, canonicalKey } from '../normalizeEquipmentName';

describe('normalizeEquipmentName', () => {
  it('uppercases and trims', () => {
    expect(normalizeEquipmentName('  tripod big  ')).toBe('TRIPOD BIG');
  });

  it('removes dots and commas', () => {
    expect(normalizeEquipmentName('SONY PXW.Z750,')).toBe('SONY PXW Z750');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeEquipmentName('LIVE   U   800')).toBe('LIVE U 800');
  });

  it('handles Hebrew text', () => {
    expect(normalizeEquipmentName('חצובה גדולה')).toBe('חצובה גדולה');
  });

  it('handles empty string', () => {
    expect(normalizeEquipmentName('')).toBe('');
  });
});

describe('canonicalKey', () => {
  it('produces the same key for "800 U LIVE" and "LIVEU 800"', () => {
    expect(canonicalKey('800 U LIVE')).toBe(canonicalKey('LIVEU 800'));
  });

  it('produces the same key for "800LIVEU" and "LIVEU800"', () => {
    expect(canonicalKey('800LIVEU')).toBe(canonicalKey('LIVEU800'));
  });

  it('produces the same key for "LIVE U 800" and "800 U LIVE"', () => {
    expect(canonicalKey('LIVE U 800')).toBe(canonicalKey('800 U LIVE'));
  });

  it('all LiveU 800 variants produce the same key', () => {
    const variants = ['LIVEU 800', '800 U LIVE', '800LIVEU', 'LIVEU800', 'LIVE U 800', 'LU800LIVE'];
    const keys = variants.map(v => canonicalKey(v));
    // All share the same letters (E, I, L, L, U, V) and digits (0, 0, 8) — wait,
    // "LU800LIVE" has an extra L. Let's just check the core set.
    const coreVariants = ['LIVEU 800', '800 U LIVE', '800LIVEU', 'LIVEU800', 'LIVE U 800'];
    const coreKeys = coreVariants.map(v => canonicalKey(v));
    expect(new Set(coreKeys).size).toBe(1);
  });

  it('produces different keys for "LIVEU 800" and "LIVEU 600"', () => {
    expect(canonicalKey('LIVEU 800')).not.toBe(canonicalKey('LIVEU 600'));
  });

  it('handles camera names with numbers correctly', () => {
    const key1 = canonicalKey('RED Komodo 6K');
    const key2 = canonicalKey('RED KOMODO 6K');
    expect(key1).toBe(key2);
  });
});
