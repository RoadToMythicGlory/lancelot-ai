import { connectMongoose, connectMongoDB } from '../config/mongodb';
import { Equipment, EquipmentHistory } from '../models/equipment.models';
import { InternalEquipmentAssignment, IInternalEquipmentAssignment } from '../models/internalEquipmentAssignment.models';
import { requireAuth, requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';
import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';

let mongooseConnected = false;

async function ensureMongoConnection() {
  if (!mongooseConnected) {
    await connectMongoose();
    mongooseConnected = true;
  }
}

// The GraphQL context user object exposes `userId` (the canonical field from
// JWTPayload) but several legacy resolvers read `user.id`. Accept either so
// new code stays robust regardless of which entry point sets up the context.
function getUserId(user: any): string {
  return user?.userId || user?.id || '';
}

// Resolve a normalized "display name" + phone for an internal user record
// pulled from the `users` collection. Used when dispatching equipment to
// an internal worker — we denormalize the name onto the assignment so the
// list view doesn't require N user lookups.
async function resolveInternalUser(userId: string): Promise<{ name: string; phone?: string } | null> {
  if (!userId) return null;
  if (!ObjectId.isValid(userId)) return null;
  const db = await connectMongoDB();
  const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    || user.displayName
    || user.email
    || 'משתמש';
  return { name, phone: user.phone || user.mobile };
}

function mapAssignmentToGql(doc: IInternalEquipmentAssignment | any) {
  return {
    id: doc._id.toString(),
    equipmentId: doc.equipmentId?.toString() || '',
    equipment: null, // populated lazily by field resolver
    assignedToType: doc.assignedToType,
    assignedToUserId: doc.assignedToUserId ? doc.assignedToUserId.toString() : null,
    assignedToUser: null, // populated lazily by field resolver
    assignedToName: doc.assignedToName || '',
    assignedToPhone: doc.assignedToPhone || null,
    quantityAssigned: doc.quantityAssigned,
    status: doc.status,
    assignedAt: doc.assignedAt?.toISOString() || null,
    assignedBy: doc.assignedBy || null,
    assignedByName: doc.assignedByName || null,
    notes: doc.notes || null,
    returnedAt: doc.returnedAt?.toISOString() || null,
    returnedByName: doc.returnedByName || null,
    returnNotes: doc.returnNotes || null,
    transferredAt: doc.transferredAt?.toISOString() || null,
    transferredByName: doc.transferredByName || null,
    transferredToAssignmentId: doc.transferredToAssignmentId ? doc.transferredToAssignmentId.toString() : null,
    transferredFromAssignmentId: doc.transferredFromAssignmentId ? doc.transferredFromAssignmentId.toString() : null,
    transferNotes: doc.transferNotes || null,
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

// Resolve an equipment record by either an explicit `equipmentId` or a
// scanned/typed `barcode` (case-insensitive). Throws if neither resolves.
async function resolveEquipment(equipmentId?: string, barcode?: string) {
  if (equipmentId) {
    if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
      throw new Error('Invalid equipment id');
    }
    const eq = await Equipment.findById(equipmentId).exec();
    if (eq) return eq;
  }
  if (barcode && barcode.trim()) {
    const code = barcode.trim();
    const eq = await Equipment.findOne({
      barcode: { $regex: `^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    }).exec();
    if (eq) return eq;
  }
  throw new Error('Equipment not found');
}

export const internalAssignmentsResolvers = {
  Query: {
    internalEquipmentAssignments: async (
      _: any,
      { status }: { status?: string },
      context: any,
    ) => {
      requirePermission(context, Permission.WAREHOUSE_VIEW);
      await ensureMongoConnection();

      const query: any = {};
      if (status && status !== 'all') {
        query.status = status;
      }

      const docs = await InternalEquipmentAssignment.find(query)
        .sort({ assignedAt: -1 })
        .exec();

      return docs.map(mapAssignmentToGql);
    },
  },

  Mutation: {
    assignEquipmentToWorker: async (
      _: any,
      { input }: { input: any },
      context: any,
    ) => {
      const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);
      await ensureMongoConnection();

      const quantity = Math.max(1, Number(input.quantityAssigned) || 1);

      const equipment = await resolveEquipment(input.equipmentId, input.barcode);

      if (equipment.isDisabled) {
        throw new Error(`הציוד "${equipment.name}" מושבת ואינו זמין להקצאה`);
      }
      if (equipment.quantityAvailable < quantity) {
        throw new Error(
          `אין מספיק יחידות זמינות עבור "${equipment.name}" ` +
            `(נדרש: ${quantity}, זמין: ${equipment.quantityAvailable})`,
        );
      }

      // Determine recipient — exactly one of userId / externalName.
      const hasInternal = !!input.assignedToUserId;
      const hasExternal = !!(input.assignedToExternalName && String(input.assignedToExternalName).trim());
      if (hasInternal === hasExternal) {
        throw new Error('יש לבחור עובד פנימי או להזין שם עובד חיצוני (אחד מהשניים)');
      }

      let assignedToType: 'internal' | 'external';
      let assignedToUserId: mongoose.Types.ObjectId | null = null;
      let assignedToName = '';
      let assignedToPhone = input.assignedToPhone || undefined;

      if (hasInternal) {
        const resolved = await resolveInternalUser(input.assignedToUserId);
        if (!resolved) {
          throw new Error('המשתמש הפנימי שנבחר לא נמצא במערכת');
        }
        assignedToType = 'internal';
        assignedToUserId = new mongoose.Types.ObjectId(input.assignedToUserId);
        assignedToName = resolved.name;
        if (!assignedToPhone) assignedToPhone = resolved.phone;
      } else {
        assignedToType = 'external';
        assignedToName = String(input.assignedToExternalName).trim();
      }

      const now = new Date();
      const assignedByName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'מחסן';
      const performerId = getUserId(user);

      const assignment = await InternalEquipmentAssignment.create({
        equipmentId: equipment._id,
        assignedToType,
        assignedToUserId,
        assignedToExternalName: assignedToType === 'external' ? assignedToName : undefined,
        assignedToName,
        assignedToPhone,
        quantityAssigned: quantity,
        status: 'active',
        assignedAt: now,
        assignedBy: performerId,
        assignedByName,
        notes: input.notes || undefined,
      });

      // Update equipment quantities
      equipment.quantityAssigned += quantity;
      equipment.quantityAvailable = equipment.quantityTotal - equipment.quantityAssigned;
      equipment.status = equipment.quantityAvailable <= 0 ? 'assigned' : 'available';
      equipment.lastUsedAt = now;
      await equipment.save();

      // Equipment history — surfaces in EquipmentDetailsModal "history" tab.
      await EquipmentHistory.create({
        equipmentId: equipment._id,
        action: 'assigned',
        quantity,
        performedBy: performerId,
        performedByName: assignedByName,
        notes: `הקצאה פנימית ל-${assignedToName}` + (input.notes ? ` — ${input.notes}` : ''),
        date: now,
      });

      return mapAssignmentToGql(assignment);
    },

    returnInternalEquipmentAssignment: async (
      _: any,
      { assignmentId, notes }: { assignmentId: string; notes?: string },
      context: any,
    ) => {
      const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);
      await ensureMongoConnection();

      const assignment = await InternalEquipmentAssignment.findById(assignmentId).exec();
      if (!assignment) {
        throw new Error('הקצאה פנימית לא נמצאה');
      }
      if (assignment.status !== 'active') {
        throw new Error('ניתן להחזיר רק הקצאות פעילות');
      }

      const equipment = await Equipment.findById(assignment.equipmentId).exec();
      if (!equipment) {
        throw new Error('הציוד המקושר להקצאה לא נמצא');
      }

      const now = new Date();
      const performedByName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'מחסן';
      const performerId = getUserId(user);

      assignment.status = 'returned';
      assignment.returnedAt = now;
      assignment.returnedBy = performerId;
      assignment.returnedByName = performedByName;
      if (notes) assignment.returnNotes = notes;
      await assignment.save();

      // Restore equipment quantities
      equipment.quantityAssigned = Math.max(0, equipment.quantityAssigned - assignment.quantityAssigned);
      equipment.quantityAvailable = equipment.quantityTotal - equipment.quantityAssigned;
      equipment.status = equipment.quantityAvailable <= 0 ? 'assigned' : 'available';
      equipment.lastUsedAt = now;
      await equipment.save();

      await EquipmentHistory.create({
        equipmentId: equipment._id,
        action: 'returned',
        quantity: assignment.quantityAssigned,
        performedBy: performerId,
        performedByName,
        notes: `הוחזר מ-${assignment.assignedToName}` + (notes ? ` — ${notes}` : ''),
        date: now,
      });

      return mapAssignmentToGql(assignment);
    },

    transferInternalEquipmentAssignment: async (
      _: any,
      { input }: { input: any },
      context: any,
    ) => {
      const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);
      await ensureMongoConnection();

      const source = await InternalEquipmentAssignment.findById(input.assignmentId).exec();
      if (!source) {
        throw new Error('הקצאה פנימית לא נמצאה');
      }
      if (source.status !== 'active') {
        throw new Error('ניתן להעביר רק הקצאות פעילות');
      }

      const hasInternal = !!input.assignedToUserId;
      const hasExternal = !!(input.assignedToExternalName && String(input.assignedToExternalName).trim());
      if (hasInternal === hasExternal) {
        throw new Error('יש לבחור עובד פנימי או להזין שם עובד חיצוני (אחד מהשניים)');
      }

      let assignedToType: 'internal' | 'external';
      let assignedToUserId: mongoose.Types.ObjectId | null = null;
      let assignedToName = '';
      let assignedToPhone = input.assignedToPhone || undefined;

      if (hasInternal) {
        const resolved = await resolveInternalUser(input.assignedToUserId);
        if (!resolved) {
          throw new Error('המשתמש הפנימי שנבחר לא נמצא במערכת');
        }
        assignedToType = 'internal';
        assignedToUserId = new mongoose.Types.ObjectId(input.assignedToUserId);
        assignedToName = resolved.name;
        if (!assignedToPhone) assignedToPhone = resolved.phone;
      } else {
        assignedToType = 'external';
        assignedToName = String(input.assignedToExternalName).trim();
      }

      // Refuse a no-op transfer (same internal user or same external name).
      const sameInternal = assignedToType === 'internal'
        && source.assignedToType === 'internal'
        && source.assignedToUserId
        && assignedToUserId
        && source.assignedToUserId.toString() === assignedToUserId.toString();
      const sameExternal = assignedToType === 'external'
        && source.assignedToType === 'external'
        && source.assignedToName === assignedToName;
      if (sameInternal || sameExternal) {
        throw new Error('הציוד כבר מוקצה לעובד זה — לא נדרשת העברה');
      }

      const now = new Date();
      const performedByName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'מחסן';
      const performerId = getUserId(user);

      // Create the new active assignment.
      const newAssignment = await InternalEquipmentAssignment.create({
        equipmentId: source.equipmentId,
        assignedToType,
        assignedToUserId,
        assignedToExternalName: assignedToType === 'external' ? assignedToName : undefined,
        assignedToName,
        assignedToPhone,
        quantityAssigned: source.quantityAssigned,
        status: 'active',
        assignedAt: now,
        assignedBy: performerId,
        assignedByName: performedByName,
        notes: input.notes || `הועבר מ-${source.assignedToName}`,
        transferredFromAssignmentId: source._id,
      });

      // Close out the source assignment.
      source.status = 'transferred';
      source.transferredAt = now;
      source.transferredBy = performerId;
      source.transferredByName = performedByName;
      source.transferredToAssignmentId = newAssignment._id;
      if (input.notes) source.transferNotes = input.notes;
      await source.save();

      // Equipment quantities don't change on transfer — same gear, new owner.
      // Stamp lastUsedAt and write a history row.
      await Equipment.findByIdAndUpdate(source.equipmentId, {
        $set: { lastUsedAt: now },
      }).exec();

      await EquipmentHistory.create({
        equipmentId: source.equipmentId,
        action: 'transferred',
        quantity: source.quantityAssigned,
        performedBy: performerId,
        performedByName,
        notes: `הועבר מ-${source.assignedToName} ל-${assignedToName}` + (input.notes ? ` — ${input.notes}` : ''),
        date: now,
      });

      return mapAssignmentToGql(newAssignment);
    },
  },

  // Field resolvers — populate `equipment` and `assignedToUser` lazily so
  // the list query stays a single mongo round-trip in the common case.
  InternalEquipmentAssignment: {
    equipment: async (parent: any) => {
      if (!parent.equipmentId) return null;
      try {
        const eq = await Equipment.findById(parent.equipmentId).exec();
        if (!eq) return null;
        return {
          id: eq._id.toString(),
          name: eq.name,
          category: eq.category,
          brand: eq.company || null,
          barcode: eq.barcode,
          status: eq.status,
          condition: eq.condition || null,
          quantityTotal: eq.quantityTotal,
          quantityAvailable: eq.quantityAvailable,
          quantityAssigned: eq.quantityAssigned,
          currentLocation: eq.currentLocation || null,
          price: eq.price || null,
          purchaseDate: eq.purchaseDate?.toISOString() || null,
          warrantyExpiryDate: eq.warrantyExpiryDate?.toISOString() || null,
          company: eq.company || null,
          equipmentModel: eq.equipmentModel || null,
          contactPerson: eq.contactPerson || null,
          manualLink: eq.manualLink || null,
          imageUrl: eq.imageUrl || null,
          storage: eq.storage || null,
          isQuantityBased: eq.isQuantityBased || false,
          isDisabled: eq.isDisabled || false,
          disabledAt: eq.disabledAt?.toISOString() || null,
          disabledReason: eq.disabledReason || null,
          suspensionStatus: eq.suspensionStatus || null,
          lastUsedAt: eq.lastUsedAt?.toISOString() || null,
          createdAt: eq.createdAt.toISOString(),
          updatedAt: eq.updatedAt.toISOString(),
        };
      } catch {
        return null;
      }
    },
    assignedToUser: async (parent: any) => {
      if (!parent.assignedToUserId) return null;
      try {
        const db = await connectMongoDB();
        const user = await db.collection('users').findOne({
          _id: new ObjectId(parent.assignedToUserId),
        });
        if (!user) return null;
        return {
          ...user,
          id: user._id.toString(),
          displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || '—',
        };
      } catch {
        return null;
      }
    },
  },
};
