import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';
import { jwtService } from '../services/jwtService';
import { PARSER_VERSION } from '../services/warehousePdfParser';
import { submitParsePdfJob } from '../services/warehousePdfParser/parsePdfJob';
import { normalizeEquipmentName, canonicalKey } from '../services/warehousePdfParser/normalizeEquipmentName';
import { Equipment } from '../models/equipment.models';
import { BroadcastEvent } from '../models/broadcast.models';
import { WarehousePdfImport } from '../models/warehousePdfImport.models';
import { WarehouseParserUnknownItem } from '../models/warehouseParserUnknownItem.models';
import { Permission, computePermissions, hasPermission } from '../rbac';
import { connectMongoDB } from '../config/mongodb';
import { ObjectId } from 'mongodb';
import { createLogger } from '../utils/logger';
import { uploadLimiter } from '../middleware/rateLimiter';

const logger = createLogger('warehouseRoutes');

const router = Router();

const MAX_PDF_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Strict allowlist — both MIME and extension. Multer's `mimetype` comes from
    // the client and is not trustworthy on its own; combining the two gives a
    // small but real defense against trivially renamed payloads.
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt = /\.pdf$/i.test(file.originalname || '');
    if (isPdfMime && isPdfExt) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

const UPLOADS_DIR = join(__dirname, '../../uploads/pdf-imports');

interface UploadAuthUser {
  userId: string;
  displayName: string;
  permissions: string[];
  systemRole: string;
  departments: any[];
}

/**
 * Express middleware that validates the bearer token and loads live user
 * permissions from the database, then enforces a required permission for the
 * route. Used to gate file-upload endpoints behind real RBAC instead of just
 * "anyone with a JWT can hit this".
 */
function requireUploadPermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const token = authHeader.substring(7);
      const payload = jwtService.verify(token);

      if (!payload.userId || !ObjectId.isValid(payload.userId)) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
      }

      const mongoDb = await connectMongoDB();
      const userDoc = await mongoDb.collection('users').findOne({ _id: new ObjectId(payload.userId) });
      if (!userDoc || userDoc.isActive === false) {
        return res.status(401).json({ success: false, error: 'User not found or inactive' });
      }

      const computed = computePermissions({
        systemRole: userDoc.systemRole,
        departments: userDoc.departments,
        permissions: userDoc.permissions,
      });

      if (!hasPermission(computed, permission)) {
        logger.warn('Upload permission denied', { userId: payload.userId, permission });
        return res.status(403).json({ success: false, error: 'Permission denied' });
      }

      (req as any).authUser = {
        userId: userDoc._id.toString(),
        displayName:
          userDoc.displayName ||
          `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() ||
          userDoc.email,
        permissions: userDoc.permissions || [],
        systemRole: userDoc.systemRole || 'DEPARTMENT_USER',
        departments: userDoc.departments || [],
      } satisfies UploadAuthUser;

      next();
    } catch (error: any) {
      logger.warn('Upload auth failed', { error: error.message });
      return res.status(401).json({ success: false, error: 'Authentication failed' });
    }
  };
}

/**
 * Multer error handler. Without this, multer surfaces raw errors (file too
 * large, unexpected field, etc.) that bubble up to a generic 500 response.
 */
function handleMulterError(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, error: `File exceeds maximum size of ${MAX_PDF_BYTES} bytes` });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
  }
  next();
}

function extractUser(req: Request): UploadAuthUser | null {
  return ((req as any).authUser as UploadAuthUser) || null;
}

/**
 * Sanitize a filename for safe persistence on disk. Strips path separators and
 * keeps only filename-safe characters; falls back to the importId if nothing
 * is left.
 */
function sanitizeFilename(name: string | undefined, fallback: string): string {
  if (!name) return `${fallback}.pdf`;
  const base = name.split(/[\\/]/).pop() || name;
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 200);
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

function safelyDeleteFile(path: string): void {
  try {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch (err: any) {
    logger.warn('Failed to clean up upload file', { path, error: err.message });
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
router.post(
  '/import-equipment-pdf',
  uploadLimiter,
  requireUploadPermission(Permission.WAREHOUSE_MANAGE),
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) return handleMulterError(err, req, res, next);
      next();
    });
  },
  async (req: Request, res: Response) => {
  const importId = uuidv4();
  const user = extractUser(req);
  let pdfPath: string | null = null;
  let parseSucceeded = false;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
    }

    // Defense in depth: re-check the file size and that the buffer starts with %PDF.
    if (req.file.size > MAX_PDF_BYTES) {
      return res.status(413).json({ success: false, error: 'File too large' });
    }
    if (!req.file.buffer || req.file.buffer.length < 4 || req.file.buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
      return res.status(400).json({ success: false, error: 'Uploaded file is not a valid PDF' });
    }

    // Persist the PDF to disk for audit (before parsing, so failures are also retained)
    ensureUploadsDir();
    pdfPath = join(UPLOADS_DIR, `${importId}.pdf`);
    writeFileSync(pdfPath, req.file.buffer);

    // Fetch inventory for matching. Project only the fields the parser needs to keep
    // memory + bandwidth bounded even on large catalogs (the equipment collection
    // can grow to thousands of rows). Indexed on `isDisabled`.
    const inventoryDocs = await Equipment.find(
      { isDisabled: false },
      { _id: 1, name: 1, category: 1, quantityTotal: 1, quantityAvailable: 1 }
    ).lean();
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
    const safeFileName = sanitizeFilename(req.file.originalname, importId);
    await WarehousePdfImport.create({
      importId,
      uploadedFileName: safeFileName,
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

    parseSucceeded = true;
    logger.info('PDF import parsed', {
      importId,
      userId: user?.userId,
      itemCount: result.equipmentItems.length,
      matched: result.equipmentItems.filter(i => i.status === 'matched').length,
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
    logger.error('Error parsing equipment PDF', {
      importId,
      userId: user?.userId,
      error: error.message,
    });

    // Save failed parse for debugging
    try {
      ensureUploadsDir();
      if (req.file && pdfPath) {
        if (!existsSync(pdfPath)) {
          writeFileSync(pdfPath, req.file.buffer);
        }
      }
      await WarehousePdfImport.create({
        importId,
        uploadedFileName: sanitizeFilename(req.file?.originalname, importId),
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
        rawPdfPath: pdfPath || undefined,
      });
    } catch (auditErr: any) {
      logger.error('Failed to save failed-parse audit record', { error: auditErr.message });
    }

    // Don't expose raw error details to clients in production.
    const clientMessage = process.env.NODE_ENV === 'production'
      ? 'Failed to parse PDF'
      : (error.message || 'Failed to parse PDF');

    return res.status(500).json({
      success: false,
      error: clientMessage,
    });
  } finally {
    // If parsing never wrote an audit row and never finished, clean up the
    // PDF on disk to avoid filling the uploads directory with orphan files.
    if (!parseSucceeded && pdfPath) {
      // Note: we still keep the file when there is a failed audit row so it
      // can be debugged. Only clean up if there is no audit row (shouldn't
      // happen, but defensive).
      try {
        const audit = await WarehousePdfImport.findOne({ importId }).lean();
        if (!audit) safelyDeleteFile(pdfPath);
      } catch {
        // best-effort cleanup
      }
    }
  }
}
);

/**
 * POST /api/warehouse/import-equipment-pdf/check-duplicates
 * Lightweight pre-commit check: returns overlap info between
 * the parsed items and the event's existing equipment list.
 */
router.post(
  '/import-equipment-pdf/check-duplicates',
  requireUploadPermission(Permission.WAREHOUSE_VIEW),
  async (req: Request, res: Response) => {
  try {
    const { eventId, importContentHash } = req.body;

    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, error: 'Invalid eventId' });
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
    logger.error('Error checking duplicates', { error: error.message });
    return res.status(500).json({ success: false, error: 'Failed to check duplicates' });
  }
}
);

/**
 * POST /api/warehouse/import-equipment-pdf/commit
 * Writes the confirmed equipment list to the event's externalBroadcasts department data.
 * Safety: only writes to metadata.departments.externalBroadcasts.customData.equipmentList.
 * Does NOT auto-allocate, create EquipmentAssignment rows, or modify Equipment quantities.
 */
router.post(
  '/import-equipment-pdf/commit',
  requireUploadPermission(Permission.WAREHOUSE_MANAGE),
  async (req: Request, res: Response) => {
  try {
    const { importId, eventId, items } = req.body;

    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, error: 'Invalid eventId' });
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
    logger.error('Error committing equipment PDF import', { error: error.message });
    const clientMessage = process.env.NODE_ENV === 'production'
      ? 'Failed to commit import'
      : (error.message || 'Failed to commit import');
    return res.status(500).json({
      success: false,
      error: clientMessage,
    });
  }
}
);

/**
 * GET /api/warehouse/import-equipment-pdf/status/:jobId
 * Stub endpoint for future async job polling.
 * Today: always returns completed (parsing is synchronous).
 */
router.get(
  '/import-equipment-pdf/status/:jobId',
  requireUploadPermission(Permission.WAREHOUSE_VIEW),
  async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    status: 'completed',
    message: 'Parsing is currently synchronous. This endpoint is reserved for future async support.',
  });
}
);

export { router as warehouseRoutes };
