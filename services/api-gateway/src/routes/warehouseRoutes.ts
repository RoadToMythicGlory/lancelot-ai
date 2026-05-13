import { Router, Request, Response } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { jwtService } from '../services/jwtService';
import { PARSER_VERSION } from '../services/warehousePdfParser';
import { submitParsePdfJob } from '../services/warehousePdfParser/parsePdfJob';
import { normalizeEquipmentName, canonicalKey } from '../services/warehousePdfParser/normalizeEquipmentName';
import { Equipment } from '../models/equipment.models';
import { BroadcastEvent } from '../models/broadcast.models';
import { WarehousePdfImport } from '../models/warehousePdfImport.models';
import { WarehouseParserUnknownItem } from '../models/warehouseParserUnknownItem.models';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

const UPLOADS_DIR = join(__dirname, '../../uploads/pdf-imports');

function extractUser(req: Request): { userId: string; displayName: string } | null {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.substring(7);
    const payload = jwtService.verify(token);
    return {
      userId: payload.userId || '',
      displayName: payload.displayName || `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
    };
  } catch {
    return null;
  }
}

function computeInventoryHash(inventory: Array<{ id: string; name: string }>): string {
  const sorted = inventory.map(i => `${i.id}:${i.name}`).sort();
  return createHash('md5').update(JSON.stringify(sorted)).digest('hex');
}

function computeImportContentHash(items: Array<{ normalizedName: string; quantity: number }>): string {
  const sorted = items.map(i => `${i.normalizedName}:${i.quantity}`).sort();
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16);
}

function ensureUploadsDir(): void {
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * POST /api/warehouse/import-equipment-pdf
 * Parse-only: extracts equipment from a PDF and returns preview JSON.
 * Does NOT write to the database (except audit record).
 * Failed parses are also retained for debugging.
 */
router.post('/import-equipment-pdf', upload.single('file'), async (req: Request, res: Response) => {
  const importId = uuidv4();
  const user = extractUser(req);

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
    }

    // Persist the PDF to disk for audit (before parsing, so failures are also retained)
    ensureUploadsDir();
    const pdfPath = join(UPLOADS_DIR, `${importId}.pdf`);
    writeFileSync(pdfPath, req.file.buffer);

    // Fetch inventory for matching
    const inventoryDocs = await Equipment.find({ isDisabled: false }).lean();
    const inventory = inventoryDocs.map((doc: any) => ({
      id: doc._id.toString(),
      name: doc.name,
      category: doc.category,
      quantityTotal: doc.quantityTotal,
      quantityAvailable: doc.quantityAvailable,
    }));

    const inventoryHash = computeInventoryHash(inventory);
    const inventoryItemCount = inventory.length;

    // Run the parser via the job abstraction
    const jobResult = await submitParsePdfJob({
      pdfBuffer: req.file.buffer,
      inventory,
      importId,
      userId: user?.userId || 'anonymous',
    });

    if (jobResult.status === 'queued') {
      // Future: return jobId for polling
      return res.json({ success: true, importId, status: 'queued', jobId: jobResult.jobId });
    }

    const result = jobResult.result!;

    const importContentHash = computeImportContentHash(
      result.equipmentItems.map(i => ({ normalizedName: i.normalizedName, quantity: i.quantity }))
    );

    // Create a draft audit row
    await WarehousePdfImport.create({
      importId,
      uploadedFileName: req.file.originalname || 'upload.pdf',
      uploadedBy: user?.userId || 'anonymous',
      uploadedByName: user?.displayName || 'Unknown',
      uploadedAt: new Date(),
      parserVersion: PARSER_VERSION,
      parserProfile: result.parserProfile,
      parsedItemCount: result.equipmentItems.length,
      matchedItemCount: result.equipmentItems.filter(i => i.status === 'matched').length,
      unmatchedItemCount: result.equipmentItems.filter(i => i.status === 'unmatched').length,
      warnings: result.warnings,
      status: 'draft',
      rawPdfPath: pdfPath,
      documentConfidence: result.documentConfidence,
      importContentHash,
      inventoryHash,
      inventoryItemCount,
    });

    return res.json({
      success: true,
      importId,
      importContentHash,
      inventoryHash,
      inventoryItemCount,
      ...result,
    });
  } catch (error: any) {
    console.error('Error parsing equipment PDF:', error);

    // Save failed parse for debugging
    try {
      ensureUploadsDir();
      if (req.file) {
        const pdfPath = join(UPLOADS_DIR, `${importId}.pdf`);
        if (!existsSync(pdfPath)) {
          writeFileSync(pdfPath, req.file.buffer);
        }
      }
      await WarehousePdfImport.create({
        importId,
        uploadedFileName: req.file?.originalname || 'upload.pdf',
        uploadedBy: user?.userId || 'anonymous',
        uploadedByName: user?.displayName || 'Unknown',
        uploadedAt: new Date(),
        parserVersion: PARSER_VERSION,
        parsedItemCount: 0,
        matchedItemCount: 0,
        unmatchedItemCount: 0,
        warnings: [],
        status: 'failed',
        errorMessage: error.message || 'Unknown parsing error',
        rawPdfPath: req.file ? join(UPLOADS_DIR, `${importId}.pdf`) : undefined,
      });
    } catch (auditErr: any) {
      console.error('Failed to save failed-parse audit record:', auditErr);
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse PDF',
    });
  }
});

/**
 * POST /api/warehouse/import-equipment-pdf/check-duplicates
 * Lightweight pre-commit check: returns overlap info between
 * the parsed items and the event's existing equipment list.
 */
router.post('/import-equipment-pdf/check-duplicates', async (req: Request, res: Response) => {
  try {
    const { eventId, importContentHash } = req.body;

    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' });
    }

    // Check for existing equipment on the event
    const event = await BroadcastEvent.findById(eventId).exec();
    if (!event) {
      return res.status(404).json({ success: false, error: `Event ${eventId} not found` });
    }

    const metadata = event.metadata || {};
    const departments = metadata.departments || {};
    const externalDept = departments.externalBroadcasts || {};
    const existingCustomData = externalDept.customData || {};
    const existingEquipmentList: any[] = existingCustomData.equipmentList || [];

    // Check for recent duplicate import hash
    let recentDuplicateImport: any = null;
    if (importContentHash) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      recentDuplicateImport = await WarehousePdfImport.findOne({
        eventId,
        importContentHash,
        status: 'committed',
        committedAt: { $gte: twentyFourHoursAgo },
      }).exec();
    }

    return res.json({
      success: true,
      existingItemCount: existingEquipmentList.length,
      existingEquipmentIds: existingEquipmentList
        .filter((i: any) => i.equipmentId)
        .map((i: any) => i.equipmentId),
      duplicateImportWarning: recentDuplicateImport
        ? `This exact import was already committed to this event at ${recentDuplicateImport.committedAt?.toISOString()}`
        : null,
    });
  } catch (error: any) {
    console.error('Error checking duplicates:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/warehouse/import-equipment-pdf/commit
 * Writes the confirmed equipment list to the event's externalBroadcasts department data.
 * Safety: only writes to metadata.departments.externalBroadcasts.customData.equipmentList.
 * Does NOT auto-allocate, create EquipmentAssignment rows, or modify Equipment quantities.
 */
router.post('/import-equipment-pdf/commit', async (req: Request, res: Response) => {
  try {
    const { importId, eventId, items, broadcastDetails, crew, notes } = req.body;

    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' });
    }
    if (!importId) {
      return res.status(400).json({ success: false, error: 'importId is required' });
    }
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'items array is required' });
    }

    const user = extractUser(req);

    // Load the event
    const event = await BroadcastEvent.findById(eventId).exec();
    if (!event) {
      return res.status(404).json({ success: false, error: `Event ${eventId} not found` });
    }

    // Load existing equipment list from event
    const metadata = event.metadata || {};
    const departments = metadata.departments || {};
    const externalDept = departments.externalBroadcasts || {};
    const existingCustomData = externalDept.customData || {};
    const existingEquipmentList: any[] = existingCustomData.equipmentList || [];

    // Build a lookup of existing items by equipmentId
    const existingMap = new Map<string, any>();
    for (const item of existingEquipmentList) {
      if (item.equipmentId) {
        existingMap.set(item.equipmentId, item);
      }
    }

    // Compute overlap for duplicate warning
    const incomingMatchedIds = items
      .filter((i: any) => i.matchedItemId && i.action !== 'skip')
      .map((i: any) => i.matchedItemId);
    const overlappingItems = incomingMatchedIds.filter((id: string) => existingMap.has(id)).length;
    const duplicateWarning = existingEquipmentList.length > 0
      ? { existingItemCount: existingEquipmentList.length, overlappingItems }
      : undefined;

    // Check for recent duplicate import hash
    const auditRecord = await WarehousePdfImport.findOne({ importId }).exec();
    let duplicateImportWarning: string | undefined;
    if (auditRecord?.importContentHash) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentDuplicate = await WarehousePdfImport.findOne({
        eventId,
        importContentHash: auditRecord.importContentHash,
        status: 'committed',
        committedAt: { $gte: twentyFourHoursAgo },
      }).exec();
      if (recentDuplicate) {
        duplicateImportWarning = `This exact import was already committed to this event at ${recentDuplicate.committedAt?.toISOString()}`;
      }
    }

    // Process each imported item per its action
    const newEquipmentList: any[] = [];
    const replacedIds = new Set<string>();
    const mergedIds = new Set<string>();

    for (const item of items) {
      const action = item.action || 'merge';
      const equipmentId = item.matchedItemId || '';

      if (action === 'skip') continue;

      if (action === 'replace' && equipmentId) {
        replacedIds.add(equipmentId);
      }
      if (action === 'merge' && equipmentId) {
        mergedIds.add(equipmentId);
      }
    }

    // Carry forward existing items that are not being replaced
    for (const existing of existingEquipmentList) {
      if (existing.equipmentId && replacedIds.has(existing.equipmentId)) continue;
      if (existing.equipmentId && mergedIds.has(existing.equipmentId)) continue;
      newEquipmentList.push(existing);
    }

    // Add/merge imported items
    for (const item of items) {
      const action = item.action || 'merge';
      if (action === 'skip') continue;

      const equipmentId = item.matchedItemId || '';
      const quantity = item.quantity || 0;

      if (action === 'merge' && equipmentId) {
        const existing = existingMap.get(equipmentId);
        const mergedQuantity = existing ? (existing.quantity || 0) + quantity : quantity;
        newEquipmentList.push({
          equipmentId,
          quantity: mergedQuantity,
          name: item.normalizedName || item.rawName || '',
          rawName: item.rawName || '',
          category: item.category || '',
          importedFrom: 'pdf',
          importId,
        });
      } else {
        newEquipmentList.push({
          equipmentId,
          quantity,
          name: item.normalizedName || item.rawName || '',
          rawName: item.rawName || '',
          category: item.category || '',
          importedFrom: 'pdf',
          importId,
        });
      }
    }

    // Write to the event's externalBroadcasts department data
    const updatedExternalDept = {
      ...externalDept,
      customData: {
        ...existingCustomData,
        equipmentList: newEquipmentList,
        notApplicable: false,
        lastPdfImport: {
          importId,
          importedAt: new Date().toISOString(),
          importedBy: user?.userId || 'anonymous',
          importedByName: user?.displayName || 'Unknown',
          fileName: auditRecord?.uploadedFileName || undefined,
        },
      },
      lastUpdated: new Date().toISOString(),
    };

    const updatedDepartments = {
      ...departments,
      externalBroadcasts: updatedExternalDept,
    };

    const updatedMetadata = {
      ...metadata,
      departments: updatedDepartments,
    };

    await BroadcastEvent.findByIdAndUpdate(
      eventId,
      {
        metadata: updatedMetadata,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    ).exec();

    // Finalize the audit record
    if (auditRecord) {
      auditRecord.status = 'committed';
      auditRecord.committedAt = new Date();
      auditRecord.eventId = eventId;
      auditRecord.parsedItemCount = items.length;
      auditRecord.matchedItemCount = items.filter((i: any) => i.matchedItemId).length;
      auditRecord.unmatchedItemCount = items.filter((i: any) => !i.matchedItemId).length;
      await auditRecord.save();
    }

    // Upsert unmatched items into the unknown item review queue
    const unmatchedItems = items.filter(
      (i: any) => !i.matchedItemId && i.action !== 'skip'
    );
    if (unmatchedItems.length > 0) {
      const bulkOps = unmatchedItems.map((item: any) => {
        const normalized = normalizeEquipmentName(item.rawName || '');
        const canonical = canonicalKey(item.rawName || '');
        return {
          updateOne: {
            filter: { normalizedName: normalized },
            update: {
              $set: {
                lastSeenAt: new Date(),
                importId,
                eventId,
                pdfFileName: auditRecord?.uploadedFileName || 'unknown.pdf',
                quantity: item.quantity || 0,
              },
              $setOnInsert: {
                rawName: item.rawName || '',
                normalizedName: normalized,
                canonicalKey: canonical,
                firstSeenAt: new Date(),
              },
              $inc: { seenCount: 1 },
            },
            upsert: true,
          },
        };
      });
      try {
        await WarehouseParserUnknownItem.bulkWrite(bulkOps);
      } catch (unknownErr: any) {
        console.error('Failed to upsert unknown items:', unknownErr);
      }
    }

    return res.json({
      success: true,
      importId,
      eventId,
      itemsImported: newEquipmentList.length,
      duplicateWarning,
      duplicateImportWarning,
    });
  } catch (error: any) {
    console.error('Error committing equipment PDF import:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to commit import',
    });
  }
});

/**
 * GET /api/warehouse/import-equipment-pdf/status/:jobId
 * Stub endpoint for future async job polling.
 * Today: always returns completed (parsing is synchronous).
 */
router.get('/import-equipment-pdf/status/:jobId', async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    status: 'completed',
    message: 'Parsing is currently synchronous. This endpoint is reserved for future async support.',
  });
});

export { router as warehouseRoutes };
