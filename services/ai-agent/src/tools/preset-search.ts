/**
 * preset-search Tool
 *
 * Answers "what equipment / crew do we take for X" by:
 *  1. Embedding the user's question
 *  2. Searching the vector store for the closest preset (filtered to source='preset')
 *  3. Falling back to a Mongo regex search on name/tags/description
 *  4. Returning a Hebrew-formatted breakdown of roles + equipment
 *
 * Permission: BROADCAST_VIEW.
 */

import { z } from 'zod';
import { getVectorStore } from '../data/vector-store';
import { embed as embedText } from '../llm/embeddings';
import {
  searchPresets,
  canReadPresets,
  type PresetDoc,
} from '../data/erp/presets';
import { createLogger } from '../utils/logger';
import type { ToolHandler } from '../agent/orchestrator';

const logger = createLogger('tool-preset-search');

const MIN_SCORE = 0.15;
const TOP_K = 3;

export const presetSearchInputSchema = z.object({
  message: z.string().min(1),
  entities: z.record(z.string()).optional(),
});

export const presetSearchTool: ToolHandler = async (input, context) => {
  const message = String(input.message || context.message || '').trim();

  // RBAC gate
  const gate = canReadPresets(context.user);
  if (!gate.allowed) {
    return { success: true, text: gate.refusal!, data: { presets: [] } };
  }

  // 1️⃣ Vector lookup (preferred — semantic match on Hebrew tags/descriptions)
  const presets: PresetDoc[] = [];
  try {
    const embedResult = await embedText(message);
    if (embedResult.embedding && embedResult.embedding.length > 0) {
      const store = getVectorStore();
      const hits = store.searchBySource(embedResult.embedding, 'preset', TOP_K);
      const goodHits = hits.filter((h) => h.score >= MIN_SCORE);
      const seen = new Set<string>();
      for (const h of goodHits) {
        const presetId = String(h.document.metadata?.presetId || '');
        if (!presetId || seen.has(presetId)) continue;
        seen.add(presetId);
        // We need the FULL preset doc — re-fetch since the vector doc only has summary text
        const full = await fetchPresetById(presetId);
        if (full) presets.push(full);
      }
    }
  } catch (error) {
    logger.warn('preset-search: vector lookup failed, will try regex fallback', {
      error: (error as Error).message,
    });
  }

  // 2️⃣ Regex fallback if vector store empty
  if (presets.length === 0) {
    const matches = await searchPresets(message, TOP_K);
    presets.push(...matches);
  }

  if (presets.length === 0) {
    return {
      success: true,
      data: { presets: [] },
      text:
        'לא מצאתי פריסט שמתאים בדיוק. הנה כמה דברים שיכולים לעזור:\n' +
        '• בדוק בעמוד "ניהול שידורי חוץ" את רשימת הפריסטים הקיימים.\n' +
        '• אם זה אירוע חדש — אפשר ליצור פריסט מותאם.\n' +
        '• ספר לי עוד על האירוע (סוג משחק, מיקום, מחלקה) ואחפש שוב.',
    };
  }

  // Format Hebrew response
  const sections = presets.map((p, i) => formatPreset(p, i));
  const text = sections.join('\n\n────────\n\n');

  return {
    success: true,
    data: { presets },
    text,
  };
};

function formatPreset(p: PresetDoc, index: number): string {
  const lines: string[] = [];
  lines.push(`📋 ${index + 1}. ${p.name}`);
  if (p.description) lines.push(`   ${p.description}`);
  if (p.tags.length > 0) lines.push(`   תגיות: ${p.tags.join(', ')}`);

  if (p.roles.length > 0) {
    lines.push('');
    lines.push('👥 צוות נדרש:');
    for (const r of p.roles) {
      lines.push(`   • ${r.count}x ${r.roleLabel}`);
    }
  }

  if (p.equipment.length > 0) {
    lines.push('');
    lines.push('🎥 ציוד:');
    for (const e of p.equipment) {
      lines.push(`   • ${e.count}x ${e.categoryLabel}`);
      if (e.unitSettings) {
        for (const u of e.unitSettings) {
          if (u.purpose || u.assignedEquipmentName) {
            const detail = [u.assignedEquipmentName, u.purpose].filter(Boolean).join(' — ');
            lines.push(`       · יחידה ${u.unitIndex}: ${detail}`);
          }
        }
      }
    }
  }

  return lines.join('\n');
}

async function fetchPresetById(id: string): Promise<PresetDoc | null> {
  try {
    const { connectMongoDB } = await import('../data/mongodb-adapter');
    const { ObjectId } = await import('mongodb');
    const db = await connectMongoDB();
    let doc;
    try {
      doc = await db
        .collection('externalbroadcastpresets')
        .findOne({ _id: new ObjectId(id) });
    } catch {
      // ID isn't a valid ObjectId — fall back to string match
      doc = await db.collection('externalbroadcastpresets').findOne({ _id: id as any });
    }
    if (!doc) return null;
    return {
      id: doc._id?.toString() || id,
      name: String(doc.name || ''),
      description: doc.description ? String(doc.description) : undefined,
      tags: Array.isArray(doc.tags) ? doc.tags : [],
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
            category: String(e.category || ''),
            categoryLabel: String(e.categoryLabel || e.category || ''),
            count: Number(e.count || 0),
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
  } catch (error) {
    logger.warn('preset-search: failed to fetch preset by id', {
      id,
      error: (error as Error).message,
    });
    return null;
  }
}

export default presetSearchTool;
