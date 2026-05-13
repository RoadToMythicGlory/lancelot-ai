import { TextItem } from './extractText';

export interface BroadcastDetails {
  date: string;
  city: string;
  venue: string;
  broadcastTime: string;
  gameTime: string;
  league: string;
  broadcastName: string;
  broadcastType: string;
}

const FIELD_PATTERNS: Array<{ key: keyof BroadcastDetails; patterns: RegExp[] }> = [
  { key: 'date', patterns: [/תאריך(?:\s*המשחק)?\s*:\s*(.+)/i, /(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/] },
  { key: 'city', patterns: [/^עיר\s*:\s*(.+)/i, /מיקום\s*:\s*(.+)/i] },
  { key: 'venue', patterns: [/א[יי]?צטדיון\s*:\s*(.+)/i, /אולם\s*:\s*(.+)/i, /מגרש\s*:\s*(.+)/i] },
  { key: 'broadcastTime', patterns: [/שעת שידור\s*:\s*(.+)/i, /זמן שידור\s*:\s*(.+)/i] },
  { key: 'gameTime', patterns: [/שעת משחק\s*:\s*(.+)/i, /שעת התחלה\s*:\s*(.+)/i, /KO\s*:\s*(.+)/i] },
  { key: 'league', patterns: [/^ליגה\s*:\s*(.+)/i, /תחרות\s*:\s*(.+)/i] },
  { key: 'broadcastName', patterns: [/^שידור\s*:\s*(.+)/i, /שם שידור\s*:\s*(.+)/i, /שם האירוע\s*:\s*(.+)/i] },
  { key: 'broadcastType', patterns: [/סוג שידור\s*:\s*(.+)/i] },
];

/**
 * Extracts broadcast details from the "פרטי שידור" section items.
 * Uses key:value label matching on each text line.
 */
export function parseBroadcastDetails(items: TextItem[]): BroadcastDetails {
  const result: BroadcastDetails = {
    date: '',
    city: '',
    venue: '',
    broadcastTime: '',
    gameTime: '',
    league: '',
    broadcastName: '',
    broadcastType: '',
  };

  // Build lines by grouping items with similar y-coordinates
  const lines = buildLines(items);

  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;

    for (const field of FIELD_PATTERNS) {
      if (result[field.key]) continue; // already matched
      for (const pattern of field.patterns) {
        const m = text.match(pattern);
        if (m && m[1]) {
          result[field.key] = m[1].trim();
          break;
        }
      }
    }
  }

  // Try to extract date from any text if not found via labels
  if (!result.date) {
    const allText = lines.join(' ');
    const dateMatch = allText.match(/(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/);
    if (dateMatch) {
      result.date = normalizeDateString(dateMatch[1]);
    }
  } else {
    result.date = normalizeDateString(result.date);
  }

  // Extract time patterns if not matched by label
  if (!result.broadcastTime) {
    const allText = lines.join(' ');
    const timeMatch = allText.match(/(\d{1,2}:\d{2})/);
    if (timeMatch) result.broadcastTime = timeMatch[1];
  }

  return result;
}

function buildLines(items: TextItem[]): string[] {
  if (items.length === 0) return [];

  const yThreshold = 3;
  const sorted = [...items].sort((a, b) => {
    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
    if (Math.abs(a.y - b.y) > yThreshold) return b.y - a.y;
    // RTL: higher x first (right to left)
    return b.x - a.x;
  });

  const lines: string[] = [];
  let currentLine: string[] = [];
  let lastY = sorted[0].y;
  let lastPage = sorted[0].pageNum;

  for (const item of sorted) {
    if (item.pageNum !== lastPage || Math.abs(item.y - lastY) > yThreshold) {
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
      }
      currentLine = [];
      lastY = item.y;
      lastPage = item.pageNum;
    }
    currentLine.push(item.str.trim());
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.join(' '));
  }

  return lines;
}

function normalizeDateString(raw: string): string {
  // Convert DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY to YYYY-MM-DD
  const m = raw.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
  if (!m) return raw;

  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  let year = m[3];
  if (year.length === 2) {
    year = (parseInt(year) > 50 ? '19' : '20') + year;
  }

  return `${year}-${month}-${day}`;
}
