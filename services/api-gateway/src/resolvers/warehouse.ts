import mongoose from 'mongoose';
import { connectMongoose } from '../config/mongodb';
import { requirePermission } from '../middleware/auth';
import { Permission } from '../rbac';
import {
  Warehouse,
  IWarehouse,
  WAREHOUSE_DIMENSION_UNITS,
  WAREHOUSE_STORAGE_PLACE_TYPES,
  WarehouseDimensionUnit,
  WarehouseStoragePlaceType,
} from '../models/warehouse.models';

// Hard cap on the warehouse list query — the UI never paginates this
// because it's expected to be tiny (a handful of physical buildings).
const MAX_WAREHOUSE_LIST = 200;

let mongooseConnected = false;

async function ensureMongoConnection() {
  if (!mongooseConnected) {
    await connectMongoose();
    mongooseConnected = true;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeUnit(unit?: string | null): WarehouseDimensionUnit {
  if (unit && (WAREHOUSE_DIMENSION_UNITS as string[]).includes(unit)) {
    return unit as WarehouseDimensionUnit;
  }
  return 'meters';
}

function normalizePlaceType(type?: string | null): WarehouseStoragePlaceType {
  if (type && (WAREHOUSE_STORAGE_PLACE_TYPES as string[]).includes(type)) {
    return type as WarehouseStoragePlaceType;
  }
  return 'other';
}

function mapStoragePlace(place: any) {
  return {
    id: place._id?.toString(),
    name: place.name,
    type: place.type || 'other',
    code: place.code || null,
    notes: place.notes || null,
    isActive: place.isActive !== false,
    createdAt: place.createdAt ? new Date(place.createdAt).toISOString() : null,
    updatedAt: place.updatedAt ? new Date(place.updatedAt).toISOString() : null,
  };
}

export function mapWarehouseToGraphQL(warehouse: IWarehouse | any) {
  if (!warehouse) return null;
  return {
    id: warehouse._id.toString(),
    name: warehouse.name,
    description: warehouse.description || null,
    address: warehouse.address || null,
    dimensions: warehouse.dimensions
      ? {
          length: warehouse.dimensions.length ?? null,
          width: warehouse.dimensions.width ?? null,
          height: warehouse.dimensions.height ?? null,
          unit: warehouse.dimensions.unit || 'meters',
        }
      : null,
    storagePlaces: Array.isArray(warehouse.storagePlaces)
      ? warehouse.storagePlaces.map(mapStoragePlace)
      : [],
    isActive: warehouse.isActive !== false,
    createdBy: warehouse.createdBy || null,
    createdAt: warehouse.createdAt
      ? new Date(warehouse.createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: warehouse.updatedAt
      ? new Date(warehouse.updatedAt).toISOString()
      : new Date().toISOString(),
  };
}

export const warehouseResolvers = {
  Query: {
    warehouses: async (
      _: any,
      { filter }: { filter?: { searchText?: string; isActive?: boolean } },
      context: any,
    ) => {
      await ensureMongoConnection();
      requirePermission(context, Permission.WAREHOUSE_VIEW);

      const query: any = {};
      if (filter?.isActive !== undefined && filter.isActive !== null) {
        query.isActive = !!filter.isActive;
      }
      if (filter?.searchText && filter.searchText.trim()) {
        const re = { $regex: escapeRegex(filter.searchText.trim()), $options: 'i' };
        query.$or = [{ name: re }, { description: re }, { address: re }];
      }

      const docs = await Warehouse.find(query)
        .sort({ name: 1 })
        .limit(MAX_WAREHOUSE_LIST)
        .exec();

      return docs.map(mapWarehouseToGraphQL);
    },

    warehouse: async (_: any, { id }: { id: string }, context: any) => {
      await ensureMongoConnection();
      requirePermission(context, Permission.WAREHOUSE_VIEW);

      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid warehouse ID');
      }
      const doc = await Warehouse.findById(id).exec();
      return mapWarehouseToGraphQL(doc);
    },
  },

  Mutation: {
    createWarehouse: async (_: any, { input }: { input: any }, context: any) => {
      await ensureMongoConnection();
      const user = requirePermission(context, Permission.WAREHOUSE_MANAGE);

      const warehouse = new Warehouse({
        name: input.name,
        description: input.description ?? undefined,
        address: input.address ?? undefined,
        dimensions: input.dimensions
          ? {
              length: input.dimensions.length ?? undefined,
              width: input.dimensions.width ?? undefined,
              height: input.dimensions.height ?? undefined,
              unit: normalizeUnit(input.dimensions.unit),
            }
          : undefined,
        isActive: input.isActive !== false,
        storagePlaces: [],
        createdBy: user?.userId,
      });

      const saved = await warehouse.save();
      return mapWarehouseToGraphQL(saved);
    },

    updateWarehouse: async (
      _: any,
      { id, input }: { id: string; input: any },
      context: any,
    ) => {
      await ensureMongoConnection();
      requirePermission(context, Permission.WAREHOUSE_MANAGE);

      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid warehouse ID');
      }

      const warehouse = await Warehouse.findById(id).exec();
      if (!warehouse) {
        throw new Error('Warehouse not found');
      }

      if (input.name !== undefined) warehouse.name = input.name;
      if (input.description !== undefined) warehouse.description = input.description;
      if (input.address !== undefined) warehouse.address = input.address;
      if (input.isActive !== undefined) warehouse.isActive = !!input.isActive;
      if (input.dimensions !== undefined) {
        if (input.dimensions === null) {
          warehouse.dimensions = undefined;
        } else {
          warehouse.dimensions = {
            length: input.dimensions.length ?? undefined,
            width: input.dimensions.width ?? undefined,
            height: input.dimensions.height ?? undefined,
            unit: normalizeUnit(input.dimensions.unit),
          };
        }
      }

      const saved = await warehouse.save();
      return mapWarehouseToGraphQL(saved);
    },

    deleteWarehouse: async (_: any, { id }: { id: string }, context: any) => {
      await ensureMongoConnection();
      requirePermission(context, Permission.WAREHOUSE_MANAGE);

      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid warehouse ID');
      }

      // Detach equipment that points to this warehouse so we don't end up
      // with dangling references. We don't hard-delete the equipment —
      // just clear the location fields so it shows up as "unassigned".
      const { Equipment } = await import('../models/equipment.models');
      await Equipment.updateMany(
        { warehouseId: new mongoose.Types.ObjectId(id) },
        { $set: { warehouseId: null, storagePlaceId: null, currentLocation: null } },
      ).exec();

      const result = await Warehouse.findByIdAndDelete(id).exec();
      return !!result;
    },

    createWarehouseStoragePlace: async (
      _: any,
      { warehouseId, input }: { warehouseId: string; input: any },
      context: any,
    ) => {
      await ensureMongoConnection();
      requirePermission(context, Permission.WAREHOUSE_MANAGE);

      if (!mongoose.Types.ObjectId.isValid(warehouseId)) {
        throw new Error('Invalid warehouse ID');
      }

      const warehouse = await Warehouse.findById(warehouseId).exec();
      if (!warehouse) {
        throw new Error('Warehouse not found');
      }

      warehouse.storagePlaces.push({
        name: input.name,
        type: normalizePlaceType(input.type),
        code: input.code ?? undefined,
        notes: input.notes ?? undefined,
        isActive: input.isActive !== false,
      } as any);

      const saved = await warehouse.save();
      return mapWarehouseToGraphQL(saved);
    },

    updateWarehouseStoragePlace: async (
      _: any,
      {
        warehouseId,
        placeId,
        input,
      }: { warehouseId: string; placeId: string; input: any },
      context: any,
    ) => {
      await ensureMongoConnection();
      requirePermission(context, Permission.WAREHOUSE_MANAGE);

      if (
        !mongoose.Types.ObjectId.isValid(warehouseId) ||
        !mongoose.Types.ObjectId.isValid(placeId)
      ) {
        throw new Error('Invalid warehouse or storage place ID');
      }

      const warehouse = await Warehouse.findById(warehouseId).exec();
      if (!warehouse) {
        throw new Error('Warehouse not found');
      }

      const place = warehouse.storagePlaces.id(placeId);
      if (!place) {
        throw new Error('Storage place not found');
      }

      if (input.name !== undefined) place.name = input.name;
      if (input.type !== undefined) place.type = normalizePlaceType(input.type);
      if (input.code !== undefined) place.code = input.code;
      if (input.notes !== undefined) place.notes = input.notes;
      if (input.isActive !== undefined) place.isActive = !!input.isActive;

      const saved = await warehouse.save();
      return mapWarehouseToGraphQL(saved);
    },

    deleteWarehouseStoragePlace: async (
      _: any,
      { warehouseId, placeId }: { warehouseId: string; placeId: string },
      context: any,
    ) => {
      await ensureMongoConnection();
      requirePermission(context, Permission.WAREHOUSE_MANAGE);

      if (
        !mongoose.Types.ObjectId.isValid(warehouseId) ||
        !mongoose.Types.ObjectId.isValid(placeId)
      ) {
        throw new Error('Invalid warehouse or storage place ID');
      }

      const warehouse = await Warehouse.findById(warehouseId).exec();
      if (!warehouse) {
        throw new Error('Warehouse not found');
      }

      const place = warehouse.storagePlaces.id(placeId);
      if (!place) {
        throw new Error('Storage place not found');
      }

      // Detach any equipment that referenced this specific place.
      const { Equipment } = await import('../models/equipment.models');
      await Equipment.updateMany(
        { storagePlaceId: new mongoose.Types.ObjectId(placeId) },
        { $set: { storagePlaceId: null } },
      ).exec();

      place.deleteOne();
      const saved = await warehouse.save();
      return mapWarehouseToGraphQL(saved);
    },
  },
};
