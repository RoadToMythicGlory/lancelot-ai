import { BroadcastDetails } from './parseBroadcastDetails';
import { ParsedEquipmentItem } from './validateParsedRequest';
import { RawEquipmentRow } from './parseEquipmentTable';

export interface DocumentConfidenceInput {
  equipmentItems: ParsedEquipmentItem[];
  rawRows: RawEquipmentRow[];
  broadcastDetails: BroadcastDetails;
  sectionsFound: number;
  totalSections: number;
}

const WEIGHTS = {
  matchRate: 0.50,
  sectionRate: 0.20,
  detailsRate: 0.15,
  qualityRate: 0.15,
};

const DETAILS_KEY_FIELDS: (keyof BroadcastDetails)[] = [
  'date', 'venue', 'broadcastName', 'broadcastType',
];

/**
 * Computes an overall document-level confidence score (0–1) for a parsed PDF.
 */
export function computeDocumentConfidence(input: DocumentConfidenceInput): number {
  const { equipmentItems, rawRows, broadcastDetails, sectionsFound, totalSections } = input;

  const matchRate = equipmentItems.length > 0
    ? equipmentItems.filter(i => i.status === 'matched' || i.status === 'duplicate_merged' || i.status === 'low_confidence').length / equipmentItems.length
    : 0;

  const sectionRate = totalSections > 0 ? sectionsFound / totalSections : 0;

  const filledDetails = DETAILS_KEY_FIELDS.filter(k => !!broadcastDetails[k]?.trim()).length;
  const detailsRate = DETAILS_KEY_FIELDS.length > 0 ? filledDetails / DETAILS_KEY_FIELDS.length : 0;

  const malformedRows = rawRows.filter(r => r.quantity === 0 || !r.rawName.trim()).length;
  const qualityRate = rawRows.length > 0 ? 1 - (malformedRows / rawRows.length) : 0;

  const score =
    WEIGHTS.matchRate * matchRate +
    WEIGHTS.sectionRate * sectionRate +
    WEIGHTS.detailsRate * detailsRate +
    WEIGHTS.qualityRate * qualityRate;

  return parseFloat(score.toFixed(2));
}
