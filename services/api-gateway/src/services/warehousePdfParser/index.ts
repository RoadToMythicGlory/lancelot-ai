import { extractTextFromPdf } from './extractText';
import { splitSections } from './splitSections';
import { parseBroadcastDetails, BroadcastDetails } from './parseBroadcastDetails';
import { parseCrew, CrewList } from './parseCrew';
import { parseNotes } from './parseNotes';
import { parseEquipmentTable, RawEquipmentRow } from './parseEquipmentTable';
import { normalizeEquipmentName } from './normalizeEquipmentName';
import { matchInventoryItem, InventoryItem } from './matchInventoryItem';
import { validateParsedRequest, ParsedEquipmentItem } from './validateParsedRequest';
import { computeDocumentConfidence } from './computeDocumentConfidence';
import { detectParserProfile, ParserProfile } from './detectProfile';

export const PARSER_VERSION = '1.1.0';

const TOTAL_EXPECTED_SECTIONS = 4;

export interface ParseEquipmentPdfResult {
  broadcastDetails: BroadcastDetails;
  crew: CrewList;
  notes: string;
  equipmentItems: ParsedEquipmentItem[];
  warnings: string[];
  parserVersion: string;
  parserProfile: ParserProfile;
  documentConfidence: number;
}

/**
 * Main orchestrator: takes a raw PDF buffer and inventory list,
 * returns fully parsed and matched equipment request data.
 * Individual parse steps are wrapped in try/catch to allow partial results.
 */
export async function parseEquipmentPdf(
  pdfBuffer: Buffer,
  inventory: InventoryItem[]
): Promise<ParseEquipmentPdfResult> {
  const warnings: string[] = [];

  // 1. Extract all text items with coordinates
  const textItems = await extractTextFromPdf(pdfBuffer);

  // 2. Split into sections by Hebrew anchors
  const sections = splitSections(textItems);

  // 3. Parse each section with individual error isolation
  let broadcastDetails: BroadcastDetails = {
    date: '', city: '', venue: '', broadcastTime: '',
    gameTime: '', league: '', broadcastName: '', broadcastType: '',
  };
  let crew: CrewList = {
    technicians: [], producers: [], cameraOperators: [],
    assistants: [], other: [],
  };
  let notes = '';
  let rawRows: RawEquipmentRow[] = [];

  try {
    broadcastDetails = parseBroadcastDetails(sections.broadcastDetails);
  } catch (err: any) {
    warnings.push(`Broadcast details parsing failed: ${err.message}`);
  }

  try {
    crew = parseCrew(sections.crew);
  } catch (err: any) {
    warnings.push(`Crew parsing failed: ${err.message}`);
  }

  try {
    notes = parseNotes(sections.notes);
  } catch (err: any) {
    warnings.push(`Notes parsing failed: ${err.message}`);
  }

  try {
    rawRows = parseEquipmentTable(sections.equipmentItems);
  } catch (err: any) {
    warnings.push(`Equipment table parsing failed: ${err.message}`);
  }

  // 4. Normalize and match each equipment row
  const matchedRows = rawRows.map(row => ({
    rawName: row.rawName,
    quantity: row.quantity,
    match: matchInventoryItem(row.rawName, inventory),
  }));

  // 5. Validate, merge duplicates, flag warnings
  const validation = validateParsedRequest(matchedRows, inventory);
  warnings.push(...validation.warnings);

  // 6. Detect parser profile
  const parserProfile = detectParserProfile(textItems, broadcastDetails, rawRows);

  // 7. Compute document-level confidence score
  const documentConfidence = computeDocumentConfidence({
    equipmentItems: validation.items,
    rawRows,
    broadcastDetails,
    sectionsFound: sections.sectionsFound,
    totalSections: TOTAL_EXPECTED_SECTIONS,
  });

  return {
    broadcastDetails,
    crew,
    notes,
    equipmentItems: validation.items,
    warnings,
    parserVersion: PARSER_VERSION,
    parserProfile,
    documentConfidence,
  };
}

// Re-export sub-modules for unit testing
export { extractTextFromPdf } from './extractText';
export { splitSections } from './splitSections';
export { parseBroadcastDetails } from './parseBroadcastDetails';
export { parseCrew } from './parseCrew';
export { parseNotes } from './parseNotes';
export { parseEquipmentTable } from './parseEquipmentTable';
export { normalizeEquipmentName, canonicalKey } from './normalizeEquipmentName';
export { matchInventoryItem } from './matchInventoryItem';
export { validateParsedRequest } from './validateParsedRequest';
export { computeDocumentConfidence } from './computeDocumentConfidence';
export { detectParserProfile } from './detectProfile';
export { getParserConfig, resetParserConfigCache } from './parserConfig';
export { submitParsePdfJob } from './parsePdfJob';
export type { BroadcastDetails } from './parseBroadcastDetails';
export type { CrewList } from './parseCrew';
export type { ParsedEquipmentItem } from './validateParsedRequest';
export type { InventoryItem, MatchResult } from './matchInventoryItem';
export type { TextItem } from './extractText';
export type { RawEquipmentRow } from './parseEquipmentTable';
export type { ParserProfile } from './detectProfile';
export type { ParserConfig } from './parserConfig';
export type { ParsePdfJobInput, ParsePdfJobResult } from './parsePdfJob';
