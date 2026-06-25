import mongoose from 'mongoose';
import { Equipment, EquipmentAssignment } from '../models/equipment.models';
import { InternalEquipmentAssignment } from '../models/internalEquipmentAssignment.models';

// One-shot "make everything available and unassigned" reset.
//
// This script is intentionally bulky: in addition to flipping the
// per-equipment `status`, it also closes out any *active* event-based and
// internal assignment rows so the UI (warehouse / internal / event screens)
// doesn't keep showing stale "currently checked out" lines that have no
// matching quantity on the equipment doc.
//
// Run with:    npx ts-node src/scripts/reset-equipment-status.ts
// or:          npm run reset:equipment   (if the script is wired into package.json)
async function resetEquipmentStatuses() {
  const startedAt = Date.now();
  try {
    const mongoUrl = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/lancelot';
    await mongoose.connect(mongoUrl);
    console.log(`✅ Connected to MongoDB at ${mongoUrl.replace(/:[^:@]+@/, ':***@')}`);

    const equipmentCount = await Equipment.countDocuments({});
    const activeEventAssignments = await EquipmentAssignment.countDocuments({ status: 'active' });
    const activeInternalAssignments = await InternalEquipmentAssignment.countDocuments({ status: 'active' });

    console.log(
      `📦 Found ${equipmentCount} equipment items, ${activeEventAssignments} active event ` +
        `assignments, and ${activeInternalAssignments} active internal assignments to reset.`,
    );

    // 1. Equipment — single bulk pass using an aggregation-pipeline update so
    //    we can set `quantityAvailable` from `quantityTotal` per-document
    //    without N round trips. Pre-save hooks are skipped (this is direct
    //    update), which is fine: we set every relevant field explicitly.
    const equipmentResult = await Equipment.updateMany({}, [
      {
        $set: {
          status: 'available',
          quantityAssigned: 0,
          quantityAvailable: '$quantityTotal',
          currentLocation: null,
        },
      },
    ]);
    console.log(
      `✅ Equipment: matched=${equipmentResult.matchedCount}, modified=${equipmentResult.modifiedCount}`,
    );

    // 2. Close out active event-based assignments — mark completed and stamp
    //    a return so the row stops showing in "currently checked out" lists.
    const now = new Date();
    const eventResult = await EquipmentAssignment.updateMany(
      { status: 'active' },
      {
        $set: {
          status: 'completed',
          returnedAt: now,
          returnedByName: 'Bulk reset',
          notes: 'Closed by reset-equipment-status admin script',
        },
      },
    );
    console.log(
      `✅ Event assignments closed: matched=${eventResult.matchedCount}, modified=${eventResult.modifiedCount}`,
    );

    // 3. Close out active internal (worker) assignments.
    const internalResult = await InternalEquipmentAssignment.updateMany(
      { status: 'active' },
      {
        $set: {
          status: 'returned',
          returnedAt: now,
          returnedByName: 'Bulk reset',
          returnNotes: 'Closed by reset-equipment-status admin script',
        },
      },
    );
    console.log(
      `✅ Internal assignments closed: matched=${internalResult.matchedCount}, modified=${internalResult.modifiedCount}`,
    );

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `\n🎉 Reset complete in ${elapsed}s. All equipment is now status="available", ` +
        `quantityAssigned=0, quantityAvailable=quantityTotal. No active assignment rows remain.`,
    );
  } catch (error) {
    console.error('❌ Error resetting equipment statuses:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
    process.exit(process.exitCode ?? 0);
  }
}

resetEquipmentStatuses();
