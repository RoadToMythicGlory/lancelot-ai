import { TextItem } from './extractText';

export interface PdfSectionArrays {
  broadcastDetails: TextItem[];
  crew: TextItem[];
  notes: TextItem[];
  equipmentItems: TextItem[];
}

export interface PdfSections extends PdfSectionArrays {
  all: TextItem[];
  sectionsFound: number;
}

const SECTION_ANCHORS = [
  { key: 'broadcastDetails', patterns: ['פרטי שידור', 'פרטי השידור'] },
  { key: 'crew', patterns: ['רשימת אנשי צוות', 'אנשי צוות', 'צוות'] },
  { key: 'notes', patterns: ['הערות למשחק', 'הערות'] },
  { key: 'equipmentItems', patterns: ['רשימת פריטים', 'רשימת ציוד', 'פריטים'] },
] as const;

interface AnchorHit {
  key: string;
  pageNum: number;
  y: number;
  x: number;
  index: number;
}

const Y_THRESHOLD = 5;

/**
 * Splits extracted text items into logical sections based on Hebrew anchor headers.
 *
 * Handles the common PDF template where "פרטי שידור" (broadcast details) and
 * "רשימת אנשי צוות" (crew) appear SIDE-BY-SIDE on the same Y line. In that case,
 * items are split between the two sections by X position.
 */
export function splitSections(items: TextItem[]): PdfSections {
  const sorted = [...items].sort((a, b) => {
    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
    return b.y - a.y;
  });

  const anchors: AnchorHit[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const text = sorted[i].str.trim();
    for (const anchor of SECTION_ANCHORS) {
      if (anchor.patterns.some(p => text.includes(p))) {
        if (!anchors.find(a => a.key === anchor.key)) {
          anchors.push({
            key: anchor.key,
            pageNum: sorted[i].pageNum,
            y: sorted[i].y,
            x: sorted[i].x,
            index: i,
          });
        }
        break;
      }
    }
  }

  anchors.sort((a, b) => a.index - b.index);

  const sections: PdfSections = {
    broadcastDetails: [],
    crew: [],
    notes: [],
    equipmentItems: [],
    all: sorted,
    sectionsFound: anchors.length,
  };

  if (anchors.length === 0) {
    sections.equipmentItems = sorted;
    return sections;
  }

  // Detect side-by-side anchor pairs (same Y line)
  const sideBySidePairs = detectSideBySidePairs(anchors);

  // Build section ranges, handling side-by-side pairs
  const processed = new Set<number>();

  for (let ai = 0; ai < anchors.length; ai++) {
    if (processed.has(ai)) continue;

    const pair = sideBySidePairs.find(
      p => p.leftIdx === ai || p.rightIdx === ai
    );

    if (pair) {
      // Side-by-side pair: find the next anchor that is NOT part of this pair
      const pairEndIdx = Math.max(pair.leftIdx, pair.rightIdx);
      const nextAnchorIdx = pairEndIdx + 1 < anchors.length
        ? anchors[pairEndIdx + 1].index
        : sorted.length;

      const startIdx = Math.min(
        anchors[pair.leftIdx].index,
        anchors[pair.rightIdx].index
      ) + 1;

      // Skip the other anchor item too
      const skipIndices = new Set([
        anchors[pair.leftIdx].index,
        anchors[pair.rightIdx].index,
      ]);

      const sectionItems = sorted.slice(startIdx, nextAnchorIdx).filter(
        (_, idx) => !skipIndices.has(startIdx + idx)
      );

      // Split items by X position relative to the anchor midpoint
      const leftAnchor = anchors[pair.leftIdx];
      const rightAnchor = anchors[pair.rightIdx];
      const xMidpoint = (leftAnchor.x + rightAnchor.x) / 2;

      for (const item of sectionItems) {
        const key = item.x < xMidpoint
          ? leftAnchor.key
          : rightAnchor.key;
        const sectionKey = key as keyof PdfSectionArrays;
        if (sectionKey in sections) {
          sections[sectionKey].push(item);
        }
      }

      processed.add(pair.leftIdx);
      processed.add(pair.rightIdx);
    } else {
      // Regular sequential anchor
      const startIdx = anchors[ai].index + 1;
      const endIdx = ai + 1 < anchors.length ? anchors[ai + 1].index : sorted.length;
      const sectionItems = sorted.slice(startIdx, endIdx);

      const key = anchors[ai].key as keyof PdfSectionArrays;
      if (key in sections) {
        sections[key] = sectionItems;
      }
    }
  }

  // Items before the first anchor go into broadcastDetails (title, subtitle)
  if (anchors.length > 0 && anchors[0].index > 0) {
    const preItems = sorted.slice(0, anchors[0].index);
    sections.broadcastDetails = [...preItems, ...sections.broadcastDetails];
  }

  return sections;
}

/**
 * Finds pairs of anchors that sit side-by-side on the same Y line.
 * In the standard template, "פרטי שידור" (broadcast) and "רשימת אנשי צוות" (crew)
 * appear next to each other.
 */
function detectSideBySidePairs(
  anchors: AnchorHit[]
): Array<{ leftIdx: number; rightIdx: number }> {
  const pairs: Array<{ leftIdx: number; rightIdx: number }> = [];

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (
      a.pageNum === b.pageNum &&
      Math.abs(a.y - b.y) < Y_THRESHOLD
    ) {
      // Lower X = left side of page (in PDF coords)
      const [leftIdx, rightIdx] = a.x < b.x ? [i, i + 1] : [i + 1, i];
      pairs.push({ leftIdx, rightIdx });
      // Skip b so it's not also paired with a third anchor
      i++;
    }
  }

  return pairs;
}
