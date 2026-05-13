import { parseEquipmentTable } from '../parseEquipmentTable';
import { TextItem } from '../extractText';

function makeItem(str: string, y: number, x: number, pageNum = 1): TextItem {
  return { str, y, pageNum, x, width: 50, dir: 'rtl' };
}

describe('parseEquipmentTable', () => {
  it('extracts items from a simple two-column table', () => {
    const quantityX = 50;
    const items: TextItem[] = [
      makeItem('שם פריט', 800, 300),
      makeItem('כמות', 800, quantityX),
      makeItem('TRIPOD BIG', 760, 300),
      makeItem('3', 760, quantityX),
      makeItem('LIVEU 800', 720, 300),
      makeItem('2', 720, quantityX),
    ];

    const rows = parseEquipmentTable(items);
    expect(rows).toHaveLength(2);
    expect(rows[0].rawName).toContain('TRIPOD BIG');
    expect(rows[0].quantity).toBe(3);
    expect(rows[1].rawName).toContain('LIVEU 800');
    expect(rows[1].quantity).toBe(2);
  });

  it('handles items with numbers in names (RED Komodo 6K)', () => {
    const quantityX = 50;
    const items: TextItem[] = [
      makeItem('שם פריט', 800, 300),
      makeItem('כמות', 800, quantityX),
      makeItem('RED Komodo 6K', 760, 300),
      makeItem('1', 760, quantityX),
    ];

    const rows = parseEquipmentTable(items);
    expect(rows).toHaveLength(1);
    expect(rows[0].rawName).toContain('RED Komodo 6K');
    expect(rows[0].quantity).toBe(1);
  });

  it('handles zero-quantity rows', () => {
    const quantityX = 50;
    const items: TextItem[] = [
      makeItem('שם פריט', 800, 300),
      makeItem('כמות', 800, quantityX),
      makeItem('EMPTY ITEM', 760, 300),
      makeItem('0', 760, quantityX),
    ];

    const rows = parseEquipmentTable(items);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(0);
  });

  it('returns empty for empty input', () => {
    const rows = parseEquipmentTable([]);
    expect(rows).toHaveLength(0);
  });

  it('detects and splits two-column layout', () => {
    // Right column headers
    const rightQtyX = 310;
    const rightNameX = 420;
    // Left column headers
    const leftQtyX = 55;
    const leftNameX = 170;

    const items: TextItem[] = [
      // Two column headers at same Y
      makeItem('שם פריט', 450, rightNameX),
      makeItem('כמות', 450, rightQtyX),
      makeItem('שם פריט', 450, leftNameX),
      makeItem('כמות', 450, leftQtyX),
      // Row 1: right col = BIG TRIPOD (2), left col = MONITOR (1)
      makeItem('BIG TRIPOD', 430, rightNameX),
      makeItem('2', 430, rightQtyX),
      makeItem('MONITOR', 430, leftNameX),
      makeItem('1', 430, leftQtyX),
      // Row 2: right col = CAM 400 (3), left col = LED 1000 (2)
      makeItem('CAM 400', 410, rightNameX),
      makeItem('3', 410, rightQtyX),
      makeItem('LED 1000', 410, leftNameX),
      makeItem('2', 410, leftQtyX),
    ];

    const rows = parseEquipmentTable(items);
    expect(rows).toHaveLength(4);

    const names = rows.map(r => r.rawName);
    expect(names).toContain('BIG TRIPOD');
    expect(names).toContain('MONITOR');
    expect(names).toContain('CAM 400');
    expect(names).toContain('LED 1000');

    const tripod = rows.find(r => r.rawName === 'BIG TRIPOD');
    expect(tripod?.quantity).toBe(2);

    const monitor = rows.find(r => r.rawName === 'MONITOR');
    expect(monitor?.quantity).toBe(1);
  });

  it('filters out page header noise from row names', () => {
    const quantityX = 50;
    const items: TextItem[] = [
      makeItem('כמות', 800, quantityX),
      makeItem('שם פריט', 800, 300),
      makeItem('TRIPOD', 760, 300),
      makeItem('3', 760, quantityX),
      makeItem('טופס השכרת ציוד מחסן', 700, 300),
    ];

    const rows = parseEquipmentTable(items);
    const names = rows.map(r => r.rawName);
    expect(names).not.toContain('טופס השכרת ציוד מחסן');
    expect(names).toContain('TRIPOD');
  });
});
