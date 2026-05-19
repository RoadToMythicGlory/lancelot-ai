import mongoose from 'mongoose';
import { Venue } from '../models/venue.models';
import { requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';
import type { Context } from '../types';

/**
 * Resolvers for Venue documents (stadiums / arenas / outdoor locations).
 * Venues live alongside External Broadcasts and are guarded by the
 * existing BROADCAST_VIEW / BROADCAST_MANAGE permissions — keep this
 * symmetrical with the rest of the External Broadcasts surface so we
 * don't introduce a new permission class for a single entity.
 */

function shapeVenue(doc: any): any {
  if (!doc) return null;
  const obj = typeof doc?.toObject === 'function' ? doc.toObject() : doc;
  return {
    ...obj,
    id: obj._id?.toString() || obj.id,
    equipmentPresetIds: Array.isArray(obj.equipmentPresetIds)
      ? obj.equipmentPresetIds.map((x: any) => String(x))
      : [],
    crewStructures: (obj.crewStructures || []).map((s: any) => ({
      ...s,
      jobs: (s.jobs || []).map((j: any) => ({
        departmentCode: j.departmentCode,
        roleKey: j.roleKey || null,
        roleLabel: j.roleLabel || null,
        count: typeof j.count === 'number' ? j.count : 1,
        userId: j.userId || null,
        userName: j.userName || null,
      })),
    })),
    createdAt: obj.createdAt ? new Date(obj.createdAt).toISOString() : null,
    updatedAt: obj.updatedAt ? new Date(obj.updatedAt).toISOString() : null,
  };
}

function normalizeInput(input: any): any {
  if (!input) return {};
  const out: any = { ...input };
  if (Array.isArray(out.equipmentPresetIds)) {
    out.equipmentPresetIds = out.equipmentPresetIds.map((x: any) => String(x));
  }
  if (Array.isArray(out.crewStructures)) {
    out.crewStructures = out.crewStructures.map((s: any) => ({
      name: s.name,
      notes: s.notes ?? null,
      jobs: (s.jobs || []).map((j: any) => ({
        departmentCode: j.departmentCode,
        roleKey: j.roleKey ?? null,
        roleLabel: j.roleLabel ?? null,
        count: typeof j.count === 'number' ? j.count : 1,
        userId: j.userId ?? null,
        userName: j.userName ?? null,
      })),
    }));
  }
  return out;
}

export const venueResolvers = {
  Query: {
    venues: async (
      _parent: any,
      { includeInactive }: { includeInactive?: boolean },
      context: Context,
    ) => {
      requirePermission(context, Permission.VENUES_VIEW);
      const query: any = {};
      if (!includeInactive) query.isActive = true;
      const docs = await Venue.find(query).sort({ name: 1 }).lean().exec();
      return docs.map(shapeVenue);
    },

    venue: async (_parent: any, { id }: { id: string }, context: Context) => {
      requirePermission(context, Permission.VENUES_VIEW);
      if (!mongoose.Types.ObjectId.isValid(id)) return null;
      const doc = await Venue.findById(id).lean().exec();
      return shapeVenue(doc);
    },
  },

  Mutation: {
    createVenue: async (_parent: any, { input }: any, context: Context) => {
      const user = requirePermission(context, Permission.VENUES_MANAGE);
      const data = normalizeInput(input);
      const doc = await Venue.create({
        ...data,
        createdBy: user.userId || null,
      });
      return shapeVenue(doc.toObject());
    },

    updateVenue: async (_parent: any, { id, input }: any, context: Context) => {
      requirePermission(context, Permission.VENUES_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid venue id');
      }
      const data = normalizeInput(input);
      const doc = await Venue.findByIdAndUpdate(id, data, { new: true }).exec();
      if (!doc) throw new Error('Venue not found');
      return shapeVenue(doc.toObject());
    },

    deleteVenue: async (_parent: any, { id }: any, context: Context) => {
      requirePermission(context, Permission.VENUES_MANAGE);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid venue id');
      }
      const doc = await Venue.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true },
      ).exec();
      return !!doc;
    },
  },
};
