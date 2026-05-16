/**
 * Shared engineering equipment ("ציוד הנדסה שיתופי") snapshot syncing.
 *
 * Whenever a piece of inventory with `isSharedEngineeringEquipment === true`
 * is allocated to a broadcast event (or returned / transferred), we re-derive
 * a compact snapshot of every active allocation of that flag for the event
 * and persist it in two places so MCR can rely on it:
 *
 *   1. `BroadcastEvent.metadata.departments.warehouse.customData.sharedEngineeringEquipment`
 *      — keeps the broadcast event self-describing.
 *   2. `MCREvent.sharedEngineeringEquipment` (matched via `broadcastEventId`)
 *      — so the MCR shadow event surfaces the assignment data even though
 *      `EquipmentAssignment` is keyed against `BroadcastEvent`.
 *
 * The function is idempotent — it always rebuilds the snapshot from the
 * current state of `EquipmentAssignment` + `Equipment`, so callers don't
 * need to do any diffing.
 */

import mongoose from 'mongoose';
import { Equipment, EquipmentAssignment } from '../models/equipment.models';
import { BroadcastEvent } from '../models/broadcast.models';
import MCREvent from '../models/mcrEvent';

export interface SharedEngineeringSnapshotItem {
  assignmentId: string;
  equipmentId: string;
  equipmentName: string;
  barcode: string | null;
  category: string | null;
  quantity: number;
  status: string;
  assignedAt: Date | null;
  returnedAt: Date | null;
  assignedByName: string | null;
  notes: string | null;
}

/**
 * Re-derive and persist the shared engineering equipment snapshot for the
 * given broadcast event. Safe to call from any allocation / return /
 * transfer path. Errors are swallowed (logged) so they never block the
 * primary mutation.
 */
export async function syncSharedEngineeringSnapshotForEvent(
  broadcastEventId: string | mongoose.Types.ObjectId,
): Promise<SharedEngineeringSnapshotItem[]> {
  const idStr =
    typeof broadcastEventId === 'string'
      ? broadcastEventId
      : broadcastEventId.toString();
  if (!mongoose.Types.ObjectId.isValid(idStr)) {
    return [];
  }
  const eventObjectId = new mongoose.Types.ObjectId(idStr);

  try {
    // Pull every active assignment for the event and join in equipment
    // metadata so we can both filter by the flag and embed display fields.
    const assignments = await EquipmentAssignment.find({
      eventId: eventObjectId,
      status: 'active',
    })
      .lean()
      .exec();

    if (assignments.length === 0) {
      await persistSnapshot(eventObjectId, []);
      return [];
    }

    const equipmentIds = assignments.map((a) => a.equipmentId).filter(Boolean);
    const equipmentDocs = await Equipment.find({ _id: { $in: equipmentIds } })
      .select({
        _id: 1,
        name: 1,
        barcode: 1,
        category: 1,
        isSharedEngineeringEquipment: 1,
      })
      .lean()
      .exec();

    const equipmentById = new Map<string, any>();
    for (const eq of equipmentDocs) {
      equipmentById.set(eq._id.toString(), eq);
    }

    const items: SharedEngineeringSnapshotItem[] = [];
    for (const a of assignments) {
      const eq = equipmentById.get(a.equipmentId?.toString() || '');
      if (!eq || !eq.isSharedEngineeringEquipment) continue;
      items.push({
        assignmentId: a._id.toString(),
        equipmentId: eq._id.toString(),
        equipmentName: eq.name || 'ציוד',
        barcode: eq.barcode || null,
        category: eq.category || null,
        quantity: a.quantityAssigned ?? 1,
        status: a.status || 'active',
        assignedAt: a.assignedAt || a.createdAt || null,
        returnedAt: a.returnedAt || null,
        assignedByName: a.assignedByName || null,
        notes: a.notes || null,
      });
    }

    await persistSnapshot(eventObjectId, items);
    return items;
  } catch (err) {
    console.error('[sharedEngineeringSnapshot] sync failed', {
      broadcastEventId: idStr,
      error: err instanceof Error ? err.message : err,
    });
    return [];
  }
}

async function persistSnapshot(
  eventObjectId: mongoose.Types.ObjectId,
  items: SharedEngineeringSnapshotItem[],
): Promise<void> {
  // 1) Update the broadcast event metadata. Stored under the existing
  // warehouse department's customData so existing tooling doesn't need to
  // learn about a brand-new metadata path.
  try {
    const serialized = items.map((it) => ({
      ...it,
      assignedAt: it.assignedAt ? it.assignedAt.toISOString() : null,
      returnedAt: it.returnedAt ? it.returnedAt.toISOString() : null,
    }));
    await BroadcastEvent.updateOne(
      { _id: eventObjectId },
      {
        $set: {
          'metadata.departments.warehouse.customData.sharedEngineeringEquipment':
            serialized,
        },
      },
    ).exec();
  } catch (err) {
    console.error(
      '[sharedEngineeringSnapshot] failed to write broadcast metadata',
      err,
    );
  }

  // 2) Mirror to the linked shadow MCR event so MCR sees the data in its
  // own workspace. `broadcastEventId` is the connector — when present it
  // uniquely points at the shadow.
  try {
    await MCREvent.updateOne(
      { broadcastEventId: eventObjectId },
      { $set: { sharedEngineeringEquipment: items } },
    ).exec();
  } catch (err) {
    console.error(
      '[sharedEngineeringSnapshot] failed to write MCR shadow snapshot',
      err,
    );
  }
}
