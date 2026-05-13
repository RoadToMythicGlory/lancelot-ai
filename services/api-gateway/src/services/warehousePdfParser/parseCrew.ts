import { TextItem } from './extractText';

export interface CrewList {
  technicians: string[];
  producers: string[];
  cameraOperators: string[];
  assistants: string[];
  other: Array<{ role: string; name: string }>;
}

const ROLE_PATTERNS: Array<{ key: keyof Omit<CrewList, 'other'>; patterns: RegExp[] }> = [
  { key: 'technicians', patterns: [/טכנאי/i, /טכנ/i, /במאי טכני/i] },
  { key: 'producers', patterns: [/מפיק/i, /הפקה/i] },
  { key: 'cameraOperators', patterns: [/צלם/i, /צילום/i, /מצלם/i] },
  { key: 'assistants', patterns: [/עוזר/i, /סייע/i, /עזר/i] },
];

/**
 * Extracts crew names from the "רשימת אנשי צוות" section.
 * Each line is expected to contain a role label followed by name(s).
 */
export function parseCrew(items: TextItem[]): CrewList {
  const result: CrewList = {
    technicians: [],
    producers: [],
    cameraOperators: [],
    assistants: [],
    other: [],
  };

  const lines = buildCrewLines(items);

  for (const line of lines) {
    const text = line.trim();
    if (!text || text.length < 2) continue;

    let matched = false;
    for (const role of ROLE_PATTERNS) {
      for (const pattern of role.patterns) {
        if (pattern.test(text)) {
          const name = extractNameFromLine(text, pattern);
          if (name) {
            result[role.key].push(name);
          }
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      // Try to split on colon or dash for role:name pairs
      const colonSplit = text.match(/^(.+?)\s*[:\-]\s*(.+)$/);
      if (colonSplit && colonSplit[2].trim()) {
        result.other.push({
          role: colonSplit[1].trim(),
          name: colonSplit[2].trim(),
        });
      }
    }
  }

  return result;
}

function extractNameFromLine(text: string, rolePattern: RegExp): string {
  // Remove the role label, then take the remainder as the name
  let cleaned = text.replace(rolePattern, '').trim();
  // Remove leading colon/dash
  cleaned = cleaned.replace(/^[\s:\-]+/, '').trim();
  return cleaned || '';
}

function buildCrewLines(items: TextItem[]): string[] {
  if (items.length === 0) return [];

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
  return lines;
}
