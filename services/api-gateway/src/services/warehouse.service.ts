import mongoose from 'mongoose';
import { Equipment, EquipmentAssignment, EquipmentHistory } from '../models/equipment.models';
import { EquipmentFaultReport } from '../models/equipmentFaultReport.models';
import { syncSharedEngineeringSnapshotForEvent } from './sharedEngineeringSnapshot';
import { createLogger } from '../utils/logger';

const logger = createLogger('warehouse-service');

/**
 * Check whether an equipment has an open (un-resolved) fault report.
 *
 * Exposed so resolvers and the External Broadcasts UI can show a clear
 * "blocked: open fault" message instead of a generic stock error.
 */
export async function hasOpenFault(equipmentId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(equipmentId)) return false;
  const open = await EquipmentFaultReport.exists({
    equipmentId: new mongoose.Types.ObjectId(equipmentId),
    status: { $in: ['open', 'in_progress'] },
  });
  return !!open;
}

/**
 * Domain service that owns atomic warehouse equipment allocation.
 *
 * The previous resolver-driven flow was a classic read-modify-write race:
 * two operators allocating the same item at the same time could both observe
 * `quantityAvailable >= 1`, both decrement it, and end up overcommitting the
 * inventory. We move that logic here and replace the read-modify-write with
 * conditional `findOneAndUpdate` operations that only succeed when there is
 * still enough stock — giving us optimistic locking without needing a Mongo
 * replica set / transaction.
 */
export interface AllocationRequest {
  equipmentId: string;
  eventId: string;
  eventName: string;
  startDate: Date;
  endDate: Date;
  location?: string | null;
  quantity: number;
  assignedBy?: string;
  assignedByName?: string;
  notes?: string | null;
}

export interface AllocationResult {
  success: boolean;
  /** ID of the created assignment, when allocation succeeded. */
  assignmentId?: string;
  /** Updated equipment snapshot after the conditional update. */
  equipment?: {
    id: string;
    quantityTotal: number;
    quantityAvailable: number;
    quantityAssigned: number;
    status: string;
  };
  /** Reason for failure, suitable for surfacing back to the resolver. */
  reason?:
    | 'invalid_id'
    | 'not_found'
    | 'disabled'
    | 'insufficient_stock'
    | 'invalid_quantity'
    | 'fault_blocked'
    | 'unknown';
  error?: string;
}

/**
 * Atomically allocate `quantity` units of an equipment to a broadcast event.
 *
 * Uses a conditional `findOneAndUpdate` so two simultaneous callers cannot
 * both succeed when only one unit is available. Recheck-before-confirm is
 * built in: the update only matches when `quantityAvailable >= quantity`
 * AND `isDisabled !== true`.
 */
export async function allocateEquipment(req: AllocationRequest): Promise<AllocationResult> {
  if (!mongoose.Types.ObjectId.isValid(req.equipmentId)) {
    return { success: false, reason: 'invalid_id', error: 'Invalid equipmentId' };
  }
  if (!mongoose.Types.ObjectId.isValid(req.eventId)) {
    return { success: false, reason: 'invalid_id', error: 'Invalid eventId' };
  }
  if (!Number.isFinite(req.quantity) || req.quantity <= 0) {
    return { success: false, reason: 'invalid_quantity', error: 'quantity must be a positive number' };
  }

  // Hard block: equipment with an open fault report cannot be allocated to
  // any new event until the fault is resolved. This is the server-side
  // enforcement of the External Broadcasts fault workflow — UI hints alone
  // would be bypassable via direct GraphQL.
  const faultBlocked = await hasOpenFault(req.equipmentId);
  if (faultBlocked) {
    return {
      success: false,
      reason: 'fault_blocked',
      error: 'Equipment is blocked by an open fault report and cannot be assigned',
    };
  }

  // Conditional decrement — succeeds only when the equipment is enabled and
  // still has at least `quantity` units available. This is the atomic lock.
  const updated = await Equipment.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(req.equipmentId),
      isDisabled: { $ne: true },
      quantityAvailable: { $gte: req.quantity },
    },
    {
      $inc: {
        quantityAvailable: -req.quantity,
        quantityAssigned: req.quantity,
      },
      $set: {
        lastUsedAt: new Date(),
      },
    },
    { new: true }
  ).exec();

  if (!updated) {
    // Distinguish between "not found / disabled" and "insufficient stock"
    // so the caller can show a helpful error.
    const existing = await Equipment.findById(req.equipmentId).lean();
    if (!existing) {
      return { success: false, reason: 'not_found', error: 'Equipment not found' };
    }
    if (existing.isDisabled) {
      return { success: false, reason: 'disabled', error: 'Equipment is currently disabled' };
    }
    return {
      success: false,
      reason: 'insufficient_stock',
      error: `Only ${existing.quantityAvailable ?? 0} units available (requested ${req.quantity})`,
    };
  }

  // Re-derive status now that the counts moved. We do this in a second call
  // to avoid building a complex pipeline update; the small window between
  // updates is OK because the user-facing status field is informational.
  if (updated.quantityAvailable === 0 && updated.status !== 'assigned') {
    await Equipment.updateOne({ _id: updated._id }, { $set: { status: 'assigned' } }).exec();
  }

  // Persist the assignment + history in a separate step. If they fail, we
  // attempt to roll back the inventory change so we don't leak stock.
  let assignmentId: string | undefined;
  try {
    const assignment = await EquipmentAssignment.create({
      equipmentId: updated._id,
      eventId: new mongoose.Types.ObjectId(req.eventId),
      eventName: req.eventName,
      startDate: req.startDate,
      endDate: req.endDate,
      location: req.location ?? null,
      status: 'active',
      quantityAssigned: req.quantity,
      assignedBy: req.assignedBy || 'system',
      assignedByName: req.assignedByName || 'System',
      assignedAt: new Date(),
      notes: req.notes ?? null,
    });
    assignmentId = assignment._id.toString();

    await EquipmentHistory.create({
      equipmentId: updated._id,
      eventId: new mongoose.Types.ObjectId(req.eventId),
      eventName: req.eventName,
      date: new Date(),
      action: 'assigned',
      quantity: req.quantity,
      performedBy: req.assignedBy || 'system',
      performedByName: req.assignedByName || 'System',
      notes: req.notes ?? null,
    });
  } catch (auditErr: any) {
    logger.error('Failed to record assignment after inventory decrement; rolling back', {
      equipmentId: req.equipmentId,
      eventId: req.eventId,
      error: auditErr.message,
    });
    // Best-effort rollback — restore inventory so we don't leak units.
    await Equipment.updateOne(
      { _id: updated._id },
      {
        $inc: {
          quantityAvailable: req.quantity,
          quantityAssigned: -req.quantity,
        },
      }
    ).exec();
    return { success: false, reason: 'unknown', error: 'Failed to persist assignment' };
  }

  // If this is a shared engineering item, mirror the assignment into the
  // broadcast event metadata and the linked MCR shadow event so MCR can
  // surface it on the dedicated tab. Best-effort — failures here are
  // logged but do not roll back the (successful) allocation above.
  if (updated.isSharedEngineeringEquipment) {
    await syncSharedEngineeringSnapshotForEvent(req.eventId).catch((err) => {
      logger.error('Failed to sync shared engineering snapshot after allocate', {
        eventId: req.eventId,
        equipmentId: req.equipmentId,
        error: err?.message,
      });
    });
  }

  return {
    success: true,
    assignmentId,
    equipment: {
      id: updated._id.toString(),
      quantityTotal: updated.quantityTotal,
      quantityAvailable: updated.quantityAvailable,
      quantityAssigned: updated.quantityAssigned,
      status: updated.status,
    },
  };
}

export interface ReturnRequest {
  equipmentId: string;
  eventId: string;
  /**
   * Optional explicit quantity. When omitted, the matching active assignment's
   * `quantityAssigned` value is used so callers cannot accidentally return more
   * (or less) than what was actually allocated for that event.
   */
  quantity?: number;
  returnedBy?: string;
  returnedByName?: string;
  notes?: string | null;
}

export interface ReturnResult {
  success: boolean;
  /** ID of the assignment that was completed, when the return succeeded. */
  assignmentId?: string;
  /** Number of units that were actually returned. */
  quantityReturned?: number;
  /** Updated equipment snapshot after the conditional update. */
  equipment?: {
    id: string;
    quantityTotal: number;
    quantityAvailable: number;
    quantityAssigned: number;
    status: string;
  };
  reason?:
    | 'invalid_id'
    | 'invalid_quantity'
    | 'not_found'
    | 'no_active_assignment'
    | 'invalid_state'
    | 'unknown';
  error?: string;
}

/**
 * Atomically return `quantity` units of an equipment back to the available pool
 * and mark the related active assignment as completed.
 *
 * The flow is intentionally **assignment-first**:
 *
 *   1. Atomically claim a matching active `EquipmentAssignment` by flipping its
 *      `status` to `completed`. This acts as a one-shot lock — concurrent
 *      callers cannot both claim the same assignment.
 *   2. Only after the assignment is claimed do we touch inventory counts with
 *      a conditional `$inc` that requires `quantityAssigned >= quantity`.
 *   3. If either inventory or history persistence fails, the assignment claim
 *      is rolled back to `active` and any inventory change is reversed so we
 *      cannot end up with available > total or with phantom returns.
 *
 * This avoids the previous "increment inventory first, hope an assignment
 * exists" race that could silently inflate `quantityAvailable` even when no
 * matching active assignment was on file.
 */
export async function returnEquipment(opts: ReturnRequest): Promise<ReturnResult> {
  if (!mongoose.Types.ObjectId.isValid(opts.equipmentId) || !mongoose.Types.ObjectId.isValid(opts.eventId)) {
    return { success: false, reason: 'invalid_id', error: 'Invalid id' };
  }
  if (opts.quantity !== undefined && (!Number.isFinite(opts.quantity) || opts.quantity <= 0)) {
    return { success: false, reason: 'invalid_quantity', error: 'quantity must be > 0' };
  }

  const equipmentObjectId = new mongoose.Types.ObjectId(opts.equipmentId);
  const eventObjectId = new mongoose.Types.ObjectId(opts.eventId);
  const now = new Date();

  // -------------------------------------------------------------------------
  // Step 1: atomically claim a matching active assignment.
  //
  // We use `findOneAndUpdate` with `status: 'active'` in the filter so the
  // first caller wins; subsequent concurrent returns will see the assignment
  // as `completed` and report no_active_assignment instead of silently
  // double-incrementing inventory.
  // -------------------------------------------------------------------------
  const assignmentFilter: any = {
    equipmentId: equipmentObjectId,
    eventId: eventObjectId,
    status: 'active',
  };
  if (opts.quantity !== undefined) {
    assignmentFilter.quantityAssigned = { $gte: opts.quantity };
  }

  const claimedAssignment = await EquipmentAssignment.findOneAndUpdate(
    assignmentFilter,
    {
      $set: {
        status: 'completed',
        returnedAt: now,
        returnedBy: opts.returnedBy || 'system',
        returnedByName: opts.returnedByName || 'System',
        ...(opts.notes ? { notes: opts.notes } : {}),
      },
    },
    { new: true }
  ).exec();

  if (!claimedAssignment) {
    // Distinguish between "equipment doesn't exist" and "no active assignment
    // to return" so the caller can show a helpful error.
    const existing = await Equipment.findById(equipmentObjectId).lean();
    if (!existing) {
      return { success: false, reason: 'not_found', error: 'Equipment not found' };
    }
    return {
      success: false,
      reason: 'no_active_assignment',
      error: 'No matching active assignment to return',
    };
  }

  // Quantity actually being returned: explicit caller value, or whatever the
  // assignment recorded.
  const quantityToReturn = opts.quantity ?? claimedAssignment.quantityAssigned ?? 1;
  if (!Number.isFinite(quantityToReturn) || quantityToReturn <= 0) {
    // Should not happen, but defensively roll the assignment back.
    await rollbackAssignmentClaim(claimedAssignment._id);
    return { success: false, reason: 'invalid_quantity', error: 'Assignment has invalid quantityAssigned' };
  }

  // -------------------------------------------------------------------------
  // Step 2: update inventory counts conditionally.
  //
  // The condition `quantityAssigned >= quantityToReturn` makes this safe even
  // if other code paths are mutating the same document — we only succeed when
  // there's enough assigned stock to flip back.
  // -------------------------------------------------------------------------
  let updated;
  try {
    updated = await Equipment.findOneAndUpdate(
      {
        _id: equipmentObjectId,
        quantityAssigned: { $gte: quantityToReturn },
      },
      {
        $inc: {
          quantityAvailable: quantityToReturn,
          quantityAssigned: -quantityToReturn,
        },
        $set: { lastUsedAt: now },
      },
      { new: true }
    ).exec();
  } catch (invErr: any) {
    logger.error('Inventory update threw during return; rolling back assignment claim', {
      equipmentId: opts.equipmentId,
      eventId: opts.eventId,
      assignmentId: claimedAssignment._id.toString(),
      error: invErr?.message,
    });
    await rollbackAssignmentClaim(claimedAssignment._id);
    return { success: false, reason: 'unknown', error: 'Inventory update failed' };
  }

  if (!updated) {
    // Inventory state is inconsistent with the assignment we just claimed.
    // Roll the claim back so the assignment goes back to active and the
    // operator can investigate.
    logger.warn('Return blocked: equipment quantityAssigned < quantityToReturn; rolling back assignment claim', {
      equipmentId: opts.equipmentId,
      eventId: opts.eventId,
      assignmentId: claimedAssignment._id.toString(),
      quantityToReturn,
    });
    await rollbackAssignmentClaim(claimedAssignment._id);
    return {
      success: false,
      reason: 'invalid_state',
      error: 'Equipment inventory does not have enough assigned units to return',
    };
  }

  if (updated.quantityAssigned === 0 && updated.status !== 'available') {
    await Equipment.updateOne({ _id: updated._id }, { $set: { status: 'available' } }).exec();
  }

  // -------------------------------------------------------------------------
  // Step 3: best-effort audit history. If this fails, reverse both the
  // inventory change and the assignment claim so we don't end up with audit
  // gaps next to live inventory mutations.
  // -------------------------------------------------------------------------
  try {
    await EquipmentHistory.create({
      equipmentId: updated._id,
      eventId: eventObjectId,
      eventName: claimedAssignment.eventName,
      date: now,
      action: 'returned',
      quantity: quantityToReturn,
      performedBy: opts.returnedBy || 'system',
      performedByName: opts.returnedByName || 'System',
      notes: opts.notes ?? null,
    });
  } catch (auditErr: any) {
    logger.error('Failed to record return history; rolling back inventory and assignment', {
      equipmentId: opts.equipmentId,
      eventId: opts.eventId,
      assignmentId: claimedAssignment._id.toString(),
      error: auditErr?.message,
    });
    await Equipment.updateOne(
      { _id: updated._id },
      {
        $inc: {
          quantityAvailable: -quantityToReturn,
          quantityAssigned: quantityToReturn,
        },
      }
    ).exec();
    await rollbackAssignmentClaim(claimedAssignment._id);
    return { success: false, reason: 'unknown', error: 'Failed to persist return history' };
  }

  // Refresh the shared engineering snapshot for the event after a return.
  // We always invoke the helper rather than gating on equipment flag state
  // so a previously-flagged item that has since been un-flagged is also
  // removed from the snapshot.
  await syncSharedEngineeringSnapshotForEvent(opts.eventId).catch((err) => {
    logger.error('Failed to sync shared engineering snapshot after return', {
      eventId: opts.eventId,
      equipmentId: opts.equipmentId,
      error: err?.message,
    });
  });

  return {
    success: true,
    assignmentId: claimedAssignment._id.toString(),
    quantityReturned: quantityToReturn,
    equipment: {
      id: updated._id.toString(),
      quantityTotal: updated.quantityTotal,
      quantityAvailable: updated.quantityAvailable,
      quantityAssigned: updated.quantityAssigned,
      status: updated.status,
    },
  };
}

/**
 * Best-effort revert of an assignment we claimed via `findOneAndUpdate`.
 *
 * Only flips the assignment back to `active` if it is still in the
 * `completed` state we just set — never resurrects assignments that another
 * actor has since touched (e.g. cancelled).
 */
async function rollbackAssignmentClaim(assignmentId: mongoose.Types.ObjectId): Promise<void> {
  try {
    await EquipmentAssignment.updateOne(
      { _id: assignmentId, status: 'completed' },
      {
        $set: { status: 'active' },
        $unset: { returnedAt: '', returnedBy: '', returnedByName: '' },
      }
    ).exec();
  } catch (rollbackErr: any) {
    logger.error('Assignment rollback failed', {
      assignmentId: assignmentId.toString(),
      error: rollbackErr?.message,
    });
  }
}
