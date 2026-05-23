/**
 * External Broadcast Presets ERP Data Module
 *
 * Read-only access to the `externalbroadcastpresets` Mongo collection
 * (see services/api-gateway/src/models/externalBroadcastPreset.models.ts).
 *
 * Used by:
 *  - the indexer (to embed preset names + descriptions for semantic search)
 *  - the preset-search tool (to fetch full preset details after a vector hit)
 */

import { connectMongoDB } from '../mongodb-adapter';
import { createLogger } from '../../utils/logger';
import type { UserContext } from '../../agent/orchestrator';
import { Perm, userHasPermission, permissionRefusal } from './rbac';

const logger = createLogger('erp-presets');

export interface PresetRole {
  roleKey: string;
  roleLabel: string;
  count: number;
  isCustom: boolean;
}

/**
 * A preset equipment row. New (post-migration) presets are item-based and
 * carry `equipmentId` + `quantity`; legacy presets are category-based and
 * carry `count` + `unitSettings`. Both shapes coexist in the collection
 * so the indexer/search keep working until every preset is re-saved.
 */
export interface PresetEquipment {
  // Item-based fields (new shape)
  equipmentId?: string;
  equipmentName?: string;
  quantity?: number;
  purpose?: string;
  audioConfig?: string;

  // Always present (denormalized category snapshot)
  category: string;
  categoryLabel: string;

  // Legacy fields (read-only fallback)
  count?: number;
  unitSettings?: Array<{
    unitIndex: number;
    purpose?: string;
    audioConfig?: string;
    assignedEquipmentName?: string;
  }>;
}

export interface PresetDoc {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  roles: PresetRole[];
  equipment: PresetEquipment[];
}

const COLLECTION = 'externalbroadcastpresets';

/**
 * List ALL presets for indexing (no RBAC — public read inside the org).
 */
export async function listAllPresets(): Promise<PresetDoc[]> {
  try {
    const db = await connectMongoDB();
    const docs = await db.collection(COLLECTION).find({}).toArray();
    return docs.map(normalize);
  } catch (error) {
    logger.warn('Failed to list presets', {
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Search presets by name / tag / description text.
 *
 * Used as a fallback when the vector index is empty. Returns up to
 * `limit` matches sorted by descending relevance (very rough).
 */
export async function searchPresets(query: string, limit = 5): Promise<PresetDoc[]> {
  try {
    const db = await connectMongoDB();
    const tokens = query
      .toLowerCase()
      .split(/[\s,;]+/)
      .filter((t) => t.length >= 2);

    if (tokens.length === 0) {
      const docs = await db.collection(COLLECTION).find({}).limit(limit).toArray();
      return docs.map(normalize);
    }

    const orClauses = tokens.flatMap((t) => [
      { name: { $regex: t, $options: 'i' } },
      { description: { $regex: t, $options: 'i' } },
      { tags: { $elemMatch: { $regex: t, $options: 'i' } } },
    ]);

    const docs = await db
      .collection(COLLECTION)
      .find({ $or: orClauses })
      .limit(limit * 2) // overfetch then re-rank in memory
      .toArray();

    const normalized = docs.map(normalize);
    normalized.sort((a, b) => scorePreset(b, tokens) - scorePreset(a, tokens));
    return normalized.slice(0, limit);
  } catch (error) {
    logger.warn('Failed to search presets', {
      query,
      error: (error as Error).message,
    });
    return [];
  }
}

/**
 * Permission gate for the AI preset tool — anyone with BROADCAST_VIEW can
 * inspect presets.
 */
export function canReadPresets(user: UserContext | undefined): {
  allowed: boolean;
  refusal?: string;
} {
  if (userHasPermission(user, Perm.BROADCAST_VIEW)) return { allowed: true };
  return { allowed: false, refusal: permissionRefusal('פריסטים של שידורי חוץ') };
}

function scorePreset(doc: PresetDoc, tokens: string[]): number {
  const haystack = [doc.name, doc.description || '', ...doc.tags].join(' ').toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (doc.name.toLowerCase().includes(t)) score += 5;
    if (doc.tags.some((tag) => tag.toLowerCase().includes(t))) score += 3;
    if (haystack.includes(t)) score += 1;
  }
  return score;
}

function normalize(doc: any): PresetDoc {
  return {
    id: doc._id?.toString() || doc.id || '',
    name: String(doc.name || ''),
    description: doc.description ? String(doc.description) : undefined,
    tags: Array.isArray(doc.tags)
      ? doc.tags.filter((t: unknown): t is string => typeof t === 'string')
      : [],
    roles: Array.isArray(doc.roles)
      ? doc.roles.map((r: any) => ({
          roleKey: String(r.roleKey || ''),
          roleLabel: String(r.roleLabel || r.roleKey || ''),
          count: Number(r.count || 0),
          isCustom: !!r.isCustom,
        }))
      : [],
    equipment: Array.isArray(doc.equipment)
      ? doc.equipment.map((e: any) => ({
          equipmentId: e.equipmentId ? String(e.equipmentId) : undefined,
          equipmentName: e.equipmentName ? String(e.equipmentName) : undefined,
          quantity:
            e.quantity !== undefined && e.quantity !== null
              ? Number(e.quantity)
              : undefined,
          purpose: e.purpose ? String(e.purpose) : undefined,
          audioConfig: e.audioConfig ? String(e.audioConfig) : undefined,
          category: String(e.category || ''),
          categoryLabel: String(e.categoryLabel || e.category || ''),
          count:
            e.count !== undefined && e.count !== null ? Number(e.count) : undefined,
          unitSettings: Array.isArray(e.unitSettings)
            ? e.unitSettings.map((u: any) => ({
                unitIndex: Number(u.unitIndex || 0),
                purpose: u.purpose ? String(u.purpose) : undefined,
                audioConfig: u.audioConfig ? String(u.audioConfig) : undefined,
                assignedEquipmentName: u.assignedEquipmentName
                  ? String(u.assignedEquipmentName)
                  : undefined,
              }))
            : undefined,
        }))
      : [],
  };
}

export default {
  listAllPresets,
  searchPresets,
  canReadPresets,
};
