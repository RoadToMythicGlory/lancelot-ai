import { parseEquipmentPdf, ParseEquipmentPdfResult } from './index';
import { InventoryItem } from './matchInventoryItem';

export interface ParsePdfJobInput {
  pdfBuffer: Buffer;
  inventory: InventoryItem[];
  importId: string;
  userId: string;
}

export interface ParsePdfJobResult {
  status: 'completed' | 'queued';
  result?: ParseEquipmentPdfResult;
  jobId?: string;
}

/**
 * Abstraction layer for PDF parsing.
 * Today: runs synchronously inline.
 * Future: swap internals to Bull/BullMQ queue without changing route or frontend.
 */
export async function submitParsePdfJob(input: ParsePdfJobInput): Promise<ParsePdfJobResult> {
  const result = await parseEquipmentPdf(input.pdfBuffer, input.inventory);
  return { status: 'completed', result };
}
