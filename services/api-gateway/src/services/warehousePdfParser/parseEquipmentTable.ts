import { TextItem } from './extractText';
import { getParserConfig } from './parserConfig';

export interface RawEquipmentRow {
  rawName: string;
  quantity: number;
  pageNum: number;
}

const HEADER_PATTERNS = [/^שם פריט$/i, /^כמות$/i, /^רשימת פריטים$/i];

/**
 * Parses the equipment table from the "רשימת פריטים" section.
 *
 * Handles single-column AND two-column layouts. Two-column detection works
 * by finding duplicate "כמות" headers at different X positions on the same page.
 */
export function parseEquipmentTable(items: TextItem[]): RawEquipmentRow[] {
  if (items.length === 0) return [];

  // Sort top-to-bottom within each page
  const sorted = [...items].sort((a, b) => {
    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
    return b.y - a.y;
  });

  // Detect column layout
  const columns = detectColumns(sorted);

  if (columns.length === 2) {
    // Two-column layout: split items by X, process each column independently
    const xBoundary = (columns[0].quantityX + columns[1].quantityX) / 2;

    // Items in the right column (higher X) and left column (lower X)
    const rightColItems: TextItem[] = [];
    const leftColItems: TextItem[] = [];

    for (const item of sorted) {
      if (isHeader(item.str.trim())) continue;
      if (item.x > xBoundary) {
        rightColItems.push(item);
      } else {
        leftColItems.push(item);
      }
    }

    // The right column (higher X in PDF) is typically the "first" column in RTL
    const rightRows = parseSingleColumn(rightColItems, columns.find(c => c.quantityX > xBoundary)!.quantityX);
    const leftRows = parseSingleColumn(leftColItems, columns.find(c => c.quantityX < xBoundary)!.quantityX);

    return [...rightRows, ...leftRows];
  }

  // Single-column layout
  const filtered = sorted.filter(item => !isHeader(item.str.trim()));
  const quantityX = columns.length === 1 ? columns[0].quantityX : guessQuantityX(filtered);
  return parseSingleColumn(filtered, quantityX);
}

interface ColumnInfo {
  quantityX: number;
  nameX: number;
  pageNum: number;
}

function detectColumns(items: TextItem[]): ColumnInfo[] {
  const columns: ColumnInfo[] = [];

  // Find all "כמות" header items
  for (const item of items) {
    if (/^כמות$/i.test(item.str.trim())) {
      columns.push({
        quantityX: item.x,
        nameX: 0,
        pageNum: item.pageNum,
      });
    }
  }

  // Find matching "שם פריט" items for each column
  for (const item of items) {
    if (/^שם פריט$/i.test(item.str.trim())) {
      // Associate with the closest column by page and Y
      for (const col of columns) {
        if (!col.nameX || Math.abs(item.x - col.quantityX) < Math.abs(col.nameX - col.quantityX)) {
          // Only associate if on the same page
          if (item.pageNum === col.pageNum) {
            col.nameX = item.x;
          }
        }
      }
    }
  }

  // Deduplicate columns that are at the same X position (from multi-page repeated headers)
  const uniqueColumns: ColumnInfo[] = [];
  for (const col of columns) {
    const existing = uniqueColumns.find(c => Math.abs(c.quantityX - col.quantityX) < 30);
    if (!existing) {
      uniqueColumns.push(col);
    }
  }

  return uniqueColumns;
}

function guessQuantityX(items: TextItem[]): number {
  const allX = items.map(i => i.x);
  if (allX.length === 0) return 0;
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  return minX + (maxX - minX) * 0.15;
}

function isHeader(text: string): boolean {
  return HEADER_PATTERNS.some(p => p.test(text));
}

function getRowNoisePatterns(): RegExp[] {
  const config = getParserConfig();
  return config.ignoreRowPatterns.map(p => new RegExp(p));
}

function isRowNoise(name: string): boolean {
  return getRowNoisePatterns().some(p => p.test(name));
}

/**
 * Parses a single column of equipment items, given the known quantity X position.
 */
function parseSingleColumn(items: TextItem[], quantityX: number): RawEquipmentRow[] {
  if (items.length === 0) return [];

  const Y_THRESHOLD = 4;
  const rows: RawEquipmentRow[] = [];

  // Group items into horizontal bands
  type Band = { items: TextItem[]; pageNum: number; y: number };
  const bands: Band[] = [];
  let currentBand: Band = { items: [items[0]], pageNum: items[0].pageNum, y: items[0].y };

  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    if (
      item.pageNum === currentBand.pageNum &&
      Math.abs(item.y - currentBand.y) <= Y_THRESHOLD
    ) {
      currentBand.items.push(item);
    } else {
      bands.push(currentBand);
      currentBand = { items: [item], pageNum: item.pageNum, y: item.y };
    }
  }
  bands.push(currentBand);

  for (const band of bands) {
    const { name, quantity } = extractRowData(band.items, quantityX);
    if (!name && quantity === 0) continue;
    if (isHeader(name) || isRowNoise(name)) continue;

    rows.push({
      rawName: name,
      quantity,
      pageNum: band.pageNum,
    });
  }

  return rows;
}

function extractRowData(
  items: TextItem[],
  quantityX: number
): { name: string; quantity: number } {
  const Q_THRESHOLD = 30;
  const nameFragments: TextItem[] = [];
  const qtyFragments: TextItem[] = [];

  for (const item of items) {
    if (Math.abs(item.x - quantityX) < Q_THRESHOLD && /^\d+$/.test(item.str.trim())) {
      qtyFragments.push(item);
    } else {
      nameFragments.push(item);
    }
  }

  // Build name from fragments sorted right-to-left (RTL)
  nameFragments.sort((a, b) => b.x - a.x);
  const name = nameFragments.map(f => f.str.trim()).join(' ').trim();

  let quantity = 0;
  for (const qf of qtyFragments) {
    const n = parseInt(qf.str.trim(), 10);
    if (!isNaN(n)) {
      quantity = n;
      break;
    }
  }

  // If no quantity fragment found, try to extract trailing number from name
  if (quantity === 0 && nameFragments.length > 0) {
    const lastFragment = nameFragments[nameFragments.length - 1].str.trim();
    if (/^\d+$/.test(lastFragment)) {
      quantity = parseInt(lastFragment, 10);
    }
  }

  return { name, quantity };
}
