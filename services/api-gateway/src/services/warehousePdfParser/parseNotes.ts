import { TextItem } from './extractText';

/**
 * Captures the notes section verbatim, preserving LiveU serial numbers and line breaks.
 */
export function parseNotes(items: TextItem[]): string {
  if (items.length === 0) return '';

  const yThreshold = 3;
  const sorted = [...items].sort((a, b) => {
    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
    if (Math.abs(a.y - b.y) > yThreshold) return b.y - a.y;
    return b.x - a.x;
  });

  const lines: string[] = [];
  let currentLine: string[] = [];
  let lastY = sorted[0].y;
  let lastPage = sorted[0].pageNum;

  for (const item of sorted) {
    if (item.pageNum !== lastPage || Math.abs(item.y - lastY) > yThreshold) {
      if (currentLine.length > 0) lines.push(currentLine.join(' '));
      currentLine = [];
      lastY = item.y;
      lastPage = item.pageNum;
    }
    currentLine.push(item.str.trim());
  }

  if (currentLine.length > 0) lines.push(currentLine.join(' '));

  return lines.join('\n').trim();
}
