import { TextItem } from './extractText';
import { BroadcastDetails } from './parseBroadcastDetails';
import { RawEquipmentRow } from './parseEquipmentTable';

export type ParserProfile = 'LIVEUX1' | 'LIVEUX2' | 'UNIFIED' | 'MINION' | 'MEGA_SONY' | 'UNKNOWN';

/**
 * Detects the PDF layout profile based on content fingerprints.
 * This helps track which template generated the PDF and enables
 * profile-specific tuning as formats drift.
 */
export function detectParserProfile(
  textItems: TextItem[],
  broadcastDetails: BroadcastDetails,
  rawRows: RawEquipmentRow[]
): ParserProfile {
  const pageCount = new Set(textItems.map(i => i.pageNum)).size;
  const allText = textItems.map(i => i.str).join(' ').toLowerCase();

  const hasLiveU = allText.includes('liveu') ||
    broadcastDetails.broadcastType?.toLowerCase().includes('liveu');

  const hasMegaSony = allText.includes('מגה סוני') || allText.includes('mega sony');
  const hasMinion = rawRows.some(r => r.rawName.toLowerCase().includes('minion')) ||
    allText.includes('minion');

  const hasMultiColumn = detectMultiColumnHint(textItems);

  if (hasMegaSony || (pageCount >= 3 && hasMultiColumn)) {
    return 'MEGA_SONY';
  }

  if (hasMinion) {
    return 'MINION';
  }

  if (hasLiveU) {
    if (allText.includes('liveux2') || allText.includes('liveu x2') ||
        broadcastDetails.broadcastType?.toLowerCase().includes('x2')) {
      return 'LIVEUX2';
    }
    return 'LIVEUX1';
  }

  if (pageCount <= 2 && !hasMultiColumn && rawRows.length > 0) {
    return 'UNIFIED';
  }

  return 'UNKNOWN';
}

function detectMultiColumnHint(items: TextItem[]): boolean {
  const quantityHeaders = items.filter(i => /^כמות$/i.test(i.str.trim()));
  if (quantityHeaders.length < 2) return false;
  const xs = quantityHeaders.map(h => h.x);
  const spread = Math.max(...xs) - Math.min(...xs);
  return spread > 50;
}
