/**
 * Equipment ERP Data Module
 *
 * Read-only access to the `equipment` Mongo collection
 * (see services/api-gateway/src/models/equipment.models.ts).
 *
 * Surfaces availability, status, and stock counts to the AI agent for
 * questions like "כמה מצלמות ENG פנויות" or "איזה ציוד תקול".
 */

import { connectMongoDB } from '../mongodb-adapter';
import { createLogger } from '../../utils/logger';
import type { UserContext } from '../../agent/orchestrator';
import { Perm, userHasPermission, permissionRefusal } from './rbac';

const logger = createLogger('erp-equipment');

const COLLECTION = 'equipment';

export interface EquipmentDoc {
  id: string;
  barcode: string;
  name: string;
  category: string;
  status: string;
  quantityTotal: number;
  quantityAvailable: number;
  quantityAssigned: number;
  isDisabled: boolean;
  suspensionStatus?: string;
  disabledReason?: string;
  currentLocation?: string;
}

export interface CategorySummary {
  category: string;
  totalUnits: number;
  totalAvailable: number;
  totalAssigned: number;
  totalDisabled: number;
}

/**
 * Permission gate. Anyone with WAREHOUSE_VIEW can ask the AI about equipment.
 */
export function canReadEquipment(user: UserContext | undefined): {
  allowed: boolean;
  refusal?: string;
} {
  if (userHasPermission(user, Perm.WAREHOUSE_VIEW)) return { allowed: true };
  return { allowed: false, refusal: permissionRefusal('המחסן והציוד') };
}

/**
 * Look up equipment by free-text query against name / barcode / category.
 */
export async function searchEquipment(query: string, limit = 10): Promise<EquipmentDoc[]> {
  try {
    const db = await connectMongoDB();
    const trimmed = query.trim();
    if (!trimmed) return [];

    const docs = await db
      .collection(COLLECTION)
      .find({
        $or: [
          { name: { $regex: trimmed, $options: 'i' } },
          { barcode: { $regex: trimmed, $options: 'i' } },
          { category: { $regex: trimmed, $options: 'i' } },
          { equipmentModel: { $regex: trimmed, $options: 'i' } },
        ],
      })
      .limit(limit)
      .toArray();

    return docs.map(normalize);
  } catch (error) {
    logger.warn('Failed to search equipment', { query, error: (error as Error).message });
    return [];
  }
}

/**
 * Return availability summary per category, optionally filtered to one
 * category. Used to answer "כמה מצלמות פנויות".
 */
export async function summarizeByCategory(
  category?: string,
): Promise<CategorySummary[]> {
  try {
    const db = await connectMongoDB();
    const match: Record<string, unknown> = {};
    if (category) match.category = category;

    const cursor = db.collection(COLLECTION).aggregate([
      { $match: match },
      {
        $group: {
          _id: '$category',
          totalUnits: { $sum: '$quantityTotal' },
          totalAvailable: { $sum: '$quantityAvailable' },
          totalAssigned: { $sum: '$quantityAssigned' },
          totalDisabled: { $sum: { $cond: [{ $eq: ['$isDisabled', true] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const out: CategorySummary[] = [];
    for await (const doc of cursor) {
      out.push({
        category: String(doc._id || 'other'),
        totalUnits: Number(doc.totalUnits || 0),
        totalAvailable: Number(doc.totalAvailable || 0),
        totalAssigned: Number(doc.totalAssigned || 0),
        totalDisabled: Number(doc.totalDisabled || 0),
      });
    }
    return out;
  } catch (error) {
    logger.warn('Failed to summarize equipment', {
      category,
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Equipment that's currently disabled / suspended (broken, lost, etc.).
 */
export async function listSuspended(limit = 20): Promise<EquipmentDoc[]> {
  try {
    const db = await connectMongoDB();
    const docs = await db
      .collection(COLLECTION)
      .find({ isDisabled: true })
      .limit(limit)
      .toArray();
    return docs.map(normalize);
  } catch (error) {
    logger.warn('Failed to list suspended equipment', {
      error: (error as Error).message,
    });
    return [];
  }
}

function normalize(doc: any): EquipmentDoc {
  return {
    id: doc._id?.toString() || doc.id || '',
    barcode: String(doc.barcode || ''),
    name: String(doc.name || ''),
    category: String(doc.category || 'other'),
    status: String(doc.status || 'available'),
    quantityTotal: Number(doc.quantityTotal || 0),
    quantityAvailable: Number(doc.quantityAvailable || 0),
    quantityAssigned: Number(doc.quantityAssigned || 0),
    isDisabled: !!doc.isDisabled,
    suspensionStatus: doc.suspensionStatus ? String(doc.suspensionStatus) : undefined,
    disabledReason: doc.disabledReason ? String(doc.disabledReason) : undefined,
    currentLocation: doc.currentLocation ? String(doc.currentLocation) : undefined,
  };
}

export default {
  canReadEquipment,
  searchEquipment,
  summarizeByCategory,
  listSuspended,
};
