import { connectMongoose } from '../config/mongodb';
import { Equipment, EquipmentAssignment, EquipmentHistory, QUANTITY_BASED_DEFAULT_CATEGORIES } from '../models/equipment.models';
import { EquipmentSet } from '../models/equipmentSet.models';
import { BroadcastEvent } from '../models/broadcast.models';
import { requireAuth, requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';
import mongoose from 'mongoose';

let mongooseConnected = false;

async function ensureMongoConnection() {
  if (!mongooseConnected) {
    await connectMongoose();
    mongooseConnected = true;
  }
}

function mapEquipmentToGql(item: any) {
  return {
    id: item._id.toString(),
    name: item.name,
    category: item.category,
    brand: item.company || null,
    barcode: item.barcode,
    status: item.status,
    condition: item.condition || null,
    quantityTotal: item.quantityTotal,
    quantityAvailable: item.quantityAvailable,
    quantityAssigned: item.quantityAssigned,
    currentLocation: item.currentLocation || null,
    price: item.price || null,
    purchaseDate: item.purchaseDate?.toISOString() || null,
    warrantyExpiryDate: item.warrantyExpiryDate?.toISOString() || null,
    company: item.company || null,
    equipmentModel: item.equipmentModel || null,
    contactPerson: item.contactPerson || null,
    manualLink: item.manualLink || null,
    imageUrl: item.imageUrl || null,
    storage: item.storage || null,
    isQuantityBased: item.isQuantityBased || false,
    isDisabled: item.isDisabled || false,
    disabledAt: item.disabledAt?.toISOString() || null,
    disabledReason: item.disabledReason || null,
    suspensionStatus: item.suspensionStatus || null,
    lastUsedAt: item.lastUsedAt?.toISOString() || null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function mapSetToGql(doc: any) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    barcode: doc.barcode,
    description: doc.description || null,
    items: (doc.items || []).map((i: any) => ({
      equipmentId: i.equipmentId.toString(),
      equipment: null, // resolved lazily via field resolver
      quantity: i.quantity,
      required: i.required ?? true,
    })),
    notes: doc.notes || null,
    isActive: doc.isActive,
    createdBy: doc.createdBy || null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const equipmentSetsResolvers = {
  Query: {
    equipmentSets: async () => {
      await ensureMongoConnection();
      const docs = await EquipmentSet.find().sort({ name: 1 }).exec();
      return docs.map(mapSetToGql);
    },

    equipmentSet: async (_: any, { id }: { id: string }) => {
      await ensureMongoConnection();
      const doc = await EquipmentSet.findById(id).exec();
      return doc ? mapSetToGql(doc) : null;
    },

    equipmentSetByBarcode: async (_: any, { barcode }: { barcode: string }) => {
      await ensureMongoConnection();
      const doc = await EquipmentSet.findOne({
        barcode: { $regex: `^${barcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      }).exec();
      return doc ? mapSetToGql(doc) : null;
    },

    staleEquipment: async (_: any, { daysUnused }: { daysUnused?: number }) => {
      await ensureMongoConnection();
      const days = daysUnused ?? 14;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const items = await Equipment.find({
        isDisabled: false,
        $or: [
          { lastUsedAt: { $lt: cutoff } },
          { lastUsedAt: { $exists: false } },
        ],
      })
        .sort({ lastUsedAt: 1 })
        .exec();

      return items.map(mapEquipmentToGql);
    },
  },

  Mutation: {
    createEquipmentSet: async (_: any, { input }: { input: any }, context: any) => {
      await ensureMongoConnection();
      const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);

      const existing = await EquipmentSet.findOne({ barcode: input.barcode }).exec();
      if (existing) {
        throw new Error(`ברקוד "${input.barcode}" כבר קיים במערכת`);
      }

      const doc = new EquipmentSet({
        name: input.name,
        barcode: input.barcode,
        description: input.description,
        items: (input.items || []).map((i: any) => ({
          equipmentId: new mongoose.Types.ObjectId(i.equipmentId),
          quantity: i.quantity,
          required: i.required ?? true,
        })),
        notes: input.notes,
        createdBy: user.userId,
      });
      const saved = await doc.save();
      return mapSetToGql(saved);
    },

    updateEquipmentSet: async (_: any, { id, input }: { id: string; input: any }, context: any) => {
      await ensureMongoConnection();
      requirePermission(context, Permission.WAREHOUSE_MANAGE);

      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.barcode !== undefined) {
        const existing = await EquipmentSet.findOne({ barcode: input.barcode, _id: { $ne: id } }).exec();
        if (existing) {
          throw new Error(`ברקוד "${input.barcode}" כבר קיים במערכת`);
        }
        updateData.barcode = input.barcode;
      }
      if (input.description !== undefined) updateData.description = input.description;
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (input.items !== undefined) {
        updateData.items = input.items.map((i: any) => ({
          equipmentId: new mongoose.Types.ObjectId(i.equipmentId),
          quantity: i.quantity,
          required: i.required ?? true,
        }));
      }

      const updated = await EquipmentSet.findByIdAndUpdate(id, { $set: updateData }, { new: true }).exec();
      if (!updated) throw new Error('Equipment set not found');
      return mapSetToGql(updated);
    },

    deleteEquipmentSet: async (_: any, { id }: { id: string }, context: any) => {
      await ensureMongoConnection();
      requirePermission(context, Permission.WAREHOUSE_MANAGE);
      const result = await EquipmentSet.findByIdAndDelete(id).exec();
      if (!result) throw new Error('Equipment set not found');
      return true;
    },

    assignEquipmentSetToEvent: async (_: any, { eventId, setId }: { eventId: string; setId: string }, context: any) => {
      await ensureMongoConnection();
      const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);

      const set = await EquipmentSet.findById(setId).exec();
      if (!set) throw new Error('Equipment set not found');

      const event = await BroadcastEvent.findById(eventId).exec();
      if (!event) throw new Error('Broadcast event not found');

      const eventDoc = event as any;
      const now = new Date();
      const updatedEquipment: any[] = [];

      for (const setItem of set.items) {
        const equipment = await Equipment.findById(setItem.equipmentId).exec();
        if (!equipment) continue;

        if (equipment.quantityAvailable < setItem.quantity) {
          throw new Error(`אין מספיק יחידות זמינות עבור ${equipment.name} (נדרש: ${setItem.quantity}, זמין: ${equipment.quantityAvailable})`);
        }

        // Create assignment
        await EquipmentAssignment.create({
          equipmentId: equipment._id,
          eventId: eventDoc._id,
          eventName: eventDoc.title || eventDoc.hebrewTitle || 'Unknown',
          startDate: eventDoc.startTime || now,
          endDate: eventDoc.endTime || now,
          location: eventDoc.location || eventDoc.venue || '',
          status: 'active',
          quantityAssigned: setItem.quantity,
          assignedBy: user.userId,
          assignedByName: `${user.firstName} ${user.lastName}`,
          assignedAt: now,
        });

        // Update equipment quantities
        equipment.quantityAssigned += setItem.quantity;
        equipment.quantityAvailable = equipment.quantityTotal - equipment.quantityAssigned;
        equipment.status = equipment.quantityAvailable <= 0 ? 'assigned' : 'available';
        equipment.lastUsedAt = now;
        await equipment.save();

        // Write history
        await EquipmentHistory.create({
          equipmentId: equipment._id,
          eventId: eventDoc._id,
          eventName: eventDoc.title || eventDoc.hebrewTitle || 'Unknown',
          action: 'set_assigned',
          quantity: setItem.quantity,
          performedBy: user.userId,
          performedByName: `${user.firstName} ${user.lastName}`,
          notes: `הוקצה כחלק מסט "${set.name}" (${set.barcode})`,
          date: now,
        });

        updatedEquipment.push(mapEquipmentToGql(equipment));
      }

      // Mirror into event metadata
      const metadata = eventDoc.metadata || {};
      if (!metadata.departments) metadata.departments = {};
      if (!metadata.departments.warehouse) metadata.departments.warehouse = {};
      const warehouseCustom = metadata.departments.warehouse.customData || {};
      const existingItems = warehouseCustom.assignedItems || [];

      for (const setItem of set.items) {
        const eq = await Equipment.findById(setItem.equipmentId).exec();
        if (!eq) continue;
        for (let i = 0; i < setItem.quantity; i++) {
          existingItems.push({
            equipmentId: eq._id.toString(),
            barcode: eq.barcode,
            name: eq.name,
            category: eq.category,
            scannedAt: now.toISOString(),
            setId: set._id.toString(),
            setBarcode: set.barcode,
          });
        }
      }

      metadata.departments.warehouse.customData = {
        ...warehouseCustom,
        assignedItems: existingItems,
        totalAssigned: existingItems.length,
        lastScanned: now.toISOString(),
      };
      eventDoc.metadata = metadata;
      eventDoc.markModified('metadata');
      await eventDoc.save();

      return {
        success: true,
        message: `סט "${set.name}" הוקצה בהצלחה`,
        updatedEvent: null,
        updatedEquipment,
      };
    },

    returnEquipmentSet: async (
      _: any,
      { eventId, setId, scannedBarcodes, missingEquipmentIds, replacements }: {
        eventId: string;
        setId: string;
        scannedBarcodes: string[];
        missingEquipmentIds?: string[];
        replacements?: Array<{ originalEquipmentId: string; replacementEquipmentId: string }>;
      },
      context: any,
    ) => {
      await ensureMongoConnection();
      const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);

      const set = await EquipmentSet.findById(setId).exec();
      if (!set) throw new Error('Equipment set not found');

      const event = await BroadcastEvent.findById(eventId).exec();
      if (!event) throw new Error('Broadcast event not found');

      const now = new Date();
      const missingSet = new Set(missingEquipmentIds || []);
      const replacementMap = new Map(
        (replacements || []).map((r) => [r.originalEquipmentId, r.replacementEquipmentId]),
      );
      const scannedSet = new Set(scannedBarcodes.map((b) => b.toLowerCase()));

      let returnedCount = 0;
      let missingCount = 0;
      let replacedCount = 0;

      for (const setItem of set.items) {
        const eqId = setItem.equipmentId.toString();

        if (missingSet.has(eqId)) {
          // Mark as missing
          missingCount++;
          await EquipmentHistory.create({
            equipmentId: setItem.equipmentId,
            eventId: event._id,
            eventName: (event as any).title || 'Unknown',
            action: 'item_missing',
            quantity: setItem.quantity,
            performedBy: user.userId,
            performedByName: `${user.firstName} ${user.lastName}`,
            notes: `פריט חסר בסט "${set.name}" (${set.barcode})`,
            date: now,
          });
          continue;
        }

        if (replacementMap.has(eqId)) {
          // Handle replacement
          replacedCount++;
          const replacementId = replacementMap.get(eqId)!;

          // Return the original
          const origEquipment = await Equipment.findById(eqId).exec();
          if (origEquipment) {
            origEquipment.quantityAssigned = Math.max(0, origEquipment.quantityAssigned - setItem.quantity);
            origEquipment.quantityAvailable = origEquipment.quantityTotal - origEquipment.quantityAssigned;
            origEquipment.status = origEquipment.quantityAvailable > 0 ? 'available' : 'assigned';
            origEquipment.lastUsedAt = now;
            await origEquipment.save();
          }

          await EquipmentHistory.create({
            equipmentId: setItem.equipmentId,
            eventId: event._id,
            eventName: (event as any).title || 'Unknown',
            action: 'item_replaced',
            quantity: setItem.quantity,
            performedBy: user.userId,
            performedByName: `${user.firstName} ${user.lastName}`,
            notes: `הוחלף בסט "${set.name}" (${set.barcode}). פריט חלופי: ${replacementId}`,
            date: now,
          });

          // Cancel the original assignment and mark completed
          await EquipmentAssignment.updateMany(
            { equipmentId: setItem.equipmentId, eventId: event._id, status: 'active' },
            { $set: { status: 'completed', returnedAt: now, returnedBy: user.userId } },
          );
          continue;
        }

        // Normal return — verify the item was scanned
        const equipment = await Equipment.findById(eqId).exec();
        if (!equipment) continue;

        if (scannedSet.has(equipment.barcode.toLowerCase())) {
          returnedCount++;
          equipment.quantityAssigned = Math.max(0, equipment.quantityAssigned - setItem.quantity);
          equipment.quantityAvailable = equipment.quantityTotal - equipment.quantityAssigned;
          equipment.status = equipment.quantityAvailable > 0 ? 'available' : 'assigned';
          equipment.lastUsedAt = now;
          await equipment.save();

          await EquipmentHistory.create({
            equipmentId: equipment._id,
            eventId: event._id,
            eventName: (event as any).title || 'Unknown',
            action: 'set_returned',
            quantity: setItem.quantity,
            performedBy: user.userId,
            performedByName: `${user.firstName} ${user.lastName}`,
            notes: `הוחזר כחלק מסט "${set.name}" (${set.barcode})`,
            date: now,
          });

          await EquipmentAssignment.updateMany(
            { equipmentId: equipment._id, eventId: event._id, status: 'active' },
            { $set: { status: 'completed', returnedAt: now, returnedBy: user.userId } },
          );
        }
      }

      // Clean up event metadata
      const eventDoc = event as any;
      const metadata = eventDoc.metadata || {};
      const warehouseData = metadata?.departments?.warehouse;
      if (warehouseData) {
        const customData = warehouseData.customData || {};
        const assignedItems = customData.assignedItems || [];
        const remaining = assignedItems.filter(
          (item: any) => item.setId !== set._id.toString(),
        );
        if (warehouseData.customData) {
          warehouseData.customData.assignedItems = remaining;
          warehouseData.customData.totalAssigned = remaining.length;
        }
        eventDoc.markModified('metadata');
        await eventDoc.save();
      }

      return {
        success: true,
        message: `סט "${set.name}" הוחזר. ${returnedCount} הוחזרו, ${missingCount} חסרים, ${replacedCount} הוחלפו.`,
        returnedCount,
        missingCount,
        replacedCount,
      };
    },
  },

  // Field resolver: resolve equipment details within set items
  EquipmentSetItem: {
    equipment: async (parent: any) => {
      if (!parent.equipmentId) return null;
      await ensureMongoConnection();
      const eq = await Equipment.findById(parent.equipmentId).exec();
      return eq ? mapEquipmentToGql(eq) : null;
    },
  },
};
