/**
 * Repairs equipment records whose quantity counters drifted out of sync with
 * the actual EquipmentAssignment + event-metadata sources of truth.
 *
 * Background: a unit can become "stuck-assigned" when the event that owned it
 * is deleted or its metadata is overwritten, or when an admin manually
 * deducts quantityTotal below quantityAssigned (which used to silently
 * produce negative quantityAvailable). Once stuck, the Return modal cannot
 * surface the unit because there's no event to attach it to.
 *
 * Usage:
 *   ts-node src/scripts/repair-equipment-orphans.ts            # dry run
 *   ts-node src/scripts/repair-equipment-orphans.ts --apply    # execute
 *   ts-node src/scripts/repair-equipment-orphans.ts --apply --restore-canon-c300
 *
 * Defaults to DRY RUN. The Canon C300 Mark III restore (back to its seed
 * defaults of total=3) only runs when --restore-canon-c300 is passed.
 */

import mongoose from 'mongoose';
import { connectMongoose } from '../config/mongodb';
import {
  Equipment,
  EquipmentAssignment,
  EquipmentHistory,
} from '../models/equipment.models';
import { BroadcastEvent } from '../models/broadcast.models';

const APPLY = process.argv.includes('--apply');
const RESTORE_CANON = process.argv.includes('--restore-canon-c300');

const CANON_C300_NAME = 'Canon C300 Mark III';
const CANON_C300_SEED_TOTAL = 3;

interface OrphanReport {
  equipmentId: string;
  name: string;
  barcode: string;
  quantityTotal: number;
  quantityAvailable: number;
  quantityAssigned: number;
  status: string;
  reasons: string[];
  activeAssignmentCount: number;
  metadataReferenceCount: number;
  proposedFix: {
    quantityTotal: number;
    quantityAvailable: number;
    quantityAssigned: number;
    status: string;
  };
}

/**
 * Counts how many BroadcastEvent documents currently reference this
 * equipment ID or barcode in any of the known metadata locations the
 * Return modal scans.
 */
async function countMetadataReferences(
  equipmentId: mongoose.Types.ObjectId,
  barcode: string,
): Promise<number> {
  const idStr = equipmentId.toString();
  return BroadcastEvent.countDocuments({
    $or: [
      { equipment_list: { $in: [idStr, barcode] } },
      { 'metadata.departments.warehouse.assignedItems.equipmentId': idStr },
      { 'metadata.departments.warehouse.assignedItems.barcode': barcode },
      { 'metadata.departments.warehouse.customData.assignedItems.equipmentId': idStr },
      { 'metadata.departments.warehouse.customData.assignedItems.barcode': barcode },
      { 'metadata.departments.externalBroadcasts.equipmentList.equipmentId': idStr },
      { 'metadata.departments.externalBroadcasts.equipmentList.id': idStr },
      { 'metadata.departments.externalBroadcasts.customData.equipmentList.equipmentId': idStr },
      { 'metadata.departments.externalBroadcasts.customData.equipmentList.id': idStr },
      { 'metadata.warehouseData.assignedItems.equipmentId': idStr },
      { 'metadata.warehouseData.assignedItems.barcode': barcode },
      { 'metadata.warehouseData.customData.assignedItems.equipmentId': idStr },
      { 'metadata.warehouseData.customData.assignedItems.barcode': barcode },
    ],
  }).exec();
}

/**
 * Sums quantityAssigned across active EquipmentAssignment rows so we can
 * reconcile against equipment.quantityAssigned.
 */
async function sumActiveAssignedQuantity(
  equipmentId: mongoose.Types.ObjectId,
): Promise<{ total: number; count: number }> {
  const rows = await EquipmentAssignment.find({
    equipmentId,
    status: 'active',
  }).select('quantityAssigned').lean().exec();
  const total = rows.reduce((sum, r) => sum + (r.quantityAssigned || 0), 0);
  return { total, count: rows.length };
}

async function findOrphans(): Promise<OrphanReport[]> {
  const all = await Equipment.find({}).exec();
  const reports: OrphanReport[] = [];

  for (const eq of all) {
    const reasons: string[] = [];
    const total = eq.quantityTotal ?? 0;
    const assigned = eq.quantityAssigned ?? 0;
    const available = eq.quantityAvailable ?? 0;

    if (available < 0) {
      reasons.push(`quantityAvailable is negative (${available})`);
    }
    if (assigned > total) {
      reasons.push(`quantityAssigned (${assigned}) exceeds quantityTotal (${total})`);
    }
    if (assigned < 0) {
      reasons.push(`quantityAssigned is negative (${assigned})`);
    }
    if (total - assigned !== available) {
      reasons.push(
        `quantityAvailable (${available}) != quantityTotal (${total}) - quantityAssigned (${assigned})`,
      );
    }

    const { total: activeAssignedSum, count: activeAssignmentCount } =
      await sumActiveAssignedQuantity(eq._id);
    const metadataReferenceCount = await countMetadataReferences(eq._id, eq.barcode);

    if (assigned > 0 && activeAssignedSum === 0 && metadataReferenceCount === 0) {
      reasons.push(
        `quantityAssigned=${assigned} but no active EquipmentAssignment and no event metadata references it`,
      );
    } else if (assigned > 0 && activeAssignedSum !== assigned && metadataReferenceCount === 0) {
      reasons.push(
        `quantityAssigned=${assigned} disagrees with active EquipmentAssignment sum=${activeAssignedSum} (and no metadata refs)`,
      );
    }

    if (reasons.length === 0) continue;

    // Proposed fix: clear orphan assignments back to a known-good state.
    // We don't change quantityTotal here unless the Canon-C300 flag fires.
    let proposedTotal = Math.max(0, total);
    let proposedAssigned = activeAssignedSum > 0 ? Math.min(activeAssignedSum, proposedTotal) : 0;

    if (
      RESTORE_CANON &&
      eq.name === CANON_C300_NAME &&
      proposedTotal < CANON_C300_SEED_TOTAL
    ) {
      proposedTotal = CANON_C300_SEED_TOTAL;
    }

    const proposedAvailable = proposedTotal - proposedAssigned;
    let proposedStatus = eq.status;
    if (eq.isDisabled) {
      proposedStatus = 'maintenance';
    } else if (proposedAvailable === 0 && proposedTotal > 0) {
      proposedStatus = 'assigned';
    } else if (proposedTotal > 0) {
      proposedStatus = 'available';
    }

    reports.push({
      equipmentId: eq._id.toString(),
      name: eq.name,
      barcode: eq.barcode,
      quantityTotal: total,
      quantityAvailable: available,
      quantityAssigned: assigned,
      status: eq.status,
      reasons,
      activeAssignmentCount,
      metadataReferenceCount,
      proposedFix: {
        quantityTotal: proposedTotal,
        quantityAvailable: proposedAvailable,
        quantityAssigned: proposedAssigned,
        status: proposedStatus,
      },
    });
  }

  return reports;
}

async function applyFixes(reports: OrphanReport[]): Promise<void> {
  for (const r of reports) {
    const eq = await Equipment.findById(r.equipmentId).exec();
    if (!eq) continue;

    eq.quantityTotal = r.proposedFix.quantityTotal;
    eq.quantityAssigned = r.proposedFix.quantityAssigned;
    eq.quantityAvailable = r.proposedFix.quantityAvailable;
    eq.status = r.proposedFix.status as typeof eq.status;
    await eq.save();

    // Cancel any orphan active assignment rows whose owning event no longer exists.
    const activeRows = await EquipmentAssignment.find({
      equipmentId: eq._id,
      status: 'active',
    }).exec();
    for (const row of activeRows) {
      const ownerExists = await BroadcastEvent.exists({ _id: row.eventId });
      if (!ownerExists) {
        row.status = 'cancelled';
        row.returnedAt = new Date();
        row.notes = `${row.notes ? row.notes + ' | ' : ''}Auto-cancelled by repair-equipment-orphans script (owning event missing)`;
        await row.save();
      }
    }

    await new EquipmentHistory({
      equipmentId: eq._id,
      action: 'returned',
      quantity: r.quantityAssigned,
      performedByName: 'system:repair-equipment-orphans',
      notes: `Repaired orphan state. Reasons: ${r.reasons.join('; ')}. ` +
        `Before: total=${r.quantityTotal}, available=${r.quantityAvailable}, assigned=${r.quantityAssigned}. ` +
        `After: total=${r.proposedFix.quantityTotal}, available=${r.proposedFix.quantityAvailable}, assigned=${r.proposedFix.quantityAssigned}.`,
      previousValue: `${r.quantityTotal}/${r.quantityAvailable}/${r.quantityAssigned}`,
      newValue: `${r.proposedFix.quantityTotal}/${r.proposedFix.quantityAvailable}/${r.proposedFix.quantityAssigned}`,
      date: new Date(),
    }).save();

    console.log(`✅ Repaired ${eq.name} (${eq.barcode})`);
  }
}

async function main() {
  console.log('🔧 Equipment orphan repair');
  console.log(`   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`   Restore Canon C300 Mark III to seed total=${CANON_C300_SEED_TOTAL}: ${RESTORE_CANON ? 'YES' : 'no'}`);
  console.log('');

  await connectMongoose();
  console.log('🔗 Connected to MongoDB');

  const reports = await findOrphans();

  if (reports.length === 0) {
    console.log('✅ No orphan equipment records found. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\n⚠️  Found ${reports.length} equipment record(s) needing repair:\n`);
  for (const r of reports) {
    console.log(`────────────────────────────────────────────────────────`);
    console.log(`  ${r.name}  (${r.barcode})  [${r.equipmentId}]`);
    console.log(`  Current:    total=${r.quantityTotal}  available=${r.quantityAvailable}  assigned=${r.quantityAssigned}  status=${r.status}`);
    console.log(`  Active assignments: ${r.activeAssignmentCount}   Event metadata refs: ${r.metadataReferenceCount}`);
    console.log(`  Reasons:`);
    for (const reason of r.reasons) console.log(`    - ${reason}`);
    console.log(`  Proposed:   total=${r.proposedFix.quantityTotal}  available=${r.proposedFix.quantityAvailable}  assigned=${r.proposedFix.quantityAssigned}  status=${r.proposedFix.status}`);
  }
  console.log(`────────────────────────────────────────────────────────\n`);

  if (!APPLY) {
    console.log('💡 This was a DRY RUN. Re-run with --apply to perform the repair.');
    console.log('   Optional flag: --restore-canon-c300 to also restore the Canon C300 Mark III quantityTotal back to the seed default of 3.');
    await mongoose.disconnect();
    return;
  }

  await applyFixes(reports);
  console.log(`\n🎉 Repaired ${reports.length} equipment record(s).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌ Repair script failed:', err);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
