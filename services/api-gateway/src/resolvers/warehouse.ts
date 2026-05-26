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
import { Equipment } from '../models/equipment.models';
import {
  computeWarehouseOccupancy,
  mapDimensionsToGraphQL,
  normalizeDimensionsInput,
  type StoragePlaceOccupancy,
  type WarehouseOccupancy,
} from '../services/warehouseCapacity.service';

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

// Clamp a 1-100 threshold input. Treat anything out of range,
// non-finite, or <= 0 as "no override" so the warehouse default kicks
// in. 0 (or negatives) would mean "alert at any occupancy" which only
// produces noise, so we never persist them.
function normalizeThresholdPercent(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  if (num <= 0 || num > 100) return undefined;
  return num;
}

export function mapStoragePlace(place: any, occupancy?: StoragePlaceOccupancy | null) {
  return {
    id: place._id?.toString(),
    name: place.name,
    type: place.type || 'other',
    code: place.code || null,
    notes: place.notes || null,
    isActive: place.isActive !== false,
    dimensions: mapDimensionsToGraphQL(place.dimensions),
    capacityAlertThresholdPercent:
      typeof place.capacityAlertThresholdPercent === 'number'
        ? place.capacityAlertThresholdPercent
        : null,
    occupancy: occupancy ?? null,
    createdAt: place.createdAt ? new Date(place.createdAt).toISOString() : null,
    updatedAt: place.updatedAt ? new Date(place.updatedAt).toISOString() : null,
  };
}

/**
 * Map a warehouse Mongoose doc (or plain object) into the GraphQL
 * payload. When `occupancy` is provided, the warehouse-level and
 * per-place occupancy snapshots are injected; otherwise those fields
 * are `null` (mutations return null occupancy — clients should re-query
 * when they need fresh numbers).
 */
export function mapWarehouseToGraphQL(
  warehouse: IWarehouse | any,
  occupancy?: { warehouse: WarehouseOccupancy; places: Map<string, StoragePlaceOccupancy> } | null,
) {
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
    capacityAlertThresholdPercent:
      typeof warehouse.capacityAlertThresholdPercent === 'number'
        ? warehouse.capacityAlertThresholdPercent
        : null,
    storagePlaces: Array.isArray(warehouse.storagePlaces)
      ? warehouse.storagePlaces.map((p: any) =>
          mapStoragePlace(p, occupancy?.places.get(p._id?.toString())),
        )
      : [],
    isActive: warehouse.isActive !== false,
    occupancy: occupancy?.warehouse ?? null,
    createdBy: warehouse.createdBy || null,
    createdAt: warehouse.createdAt
      ? new Date(warehouse.createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: warehouse.updatedAt
      ? new Date(warehouse.updatedAt).toISOString()
      : new Date().toISOString(),
  };
}

/**
 * Load every equipment row currently assigned to the given warehouses
 * and compute occupancy snapshots for each. Returns a map keyed by
 * `warehouse._id.toString()` for cheap lookups when mapping.
 */
export async function loadOccupancyForWarehouses(
  warehouses: any[],
): Promise<Map<string, { warehouse: WarehouseOccupancy; places: Map<string, StoragePlaceOccupancy> }>> {
  const result = new Map<
    string,
    { warehouse: WarehouseOccupancy; places: Map<string, StoragePlaceOccupancy> }
  >();
  if (!Array.isArray(warehouses) || warehouses.length === 0) return result;

  const warehouseIds = warehouses
    .map((w) => w?._id)
    .filter((id): id is mongoose.Types.ObjectId => !!id);
  if (warehouseIds.length === 0) return result;

  // We only need the fields that matter for occupancy math. Keep the
  // projection lean so this stays cheap on org-sized catalogs (~5k items).
  const items = await Equipment.find({ warehouseId: { $in: warehouseIds } })
    .select({
      warehouseId: 1,
      storagePlaceId: 1,
      dimensions: 1,
      quantityTotal: 1,
      quantityAssigned: 1,
    })
    .lean()
    .exec();

  const itemsByWarehouse = new Map<string, any[]>();
  for (const item of items) {
    const key = item.warehouseId?.toString();
    if (!key) continue;
    if (!itemsByWarehouse.has(key)) itemsByWarehouse.set(key, []);
    itemsByWarehouse.get(key)!.push(item);
  }

  for (const warehouse of warehouses) {
    const key = warehouse?._id?.toString();
    if (!key) continue;
    const whItems = itemsByWarehouse.get(key) || [];
    result.set(key, computeWarehouseOccupancy(warehouse, whItems));
  }

  return result;
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

      const occupancyByWarehouse = await loadOccupancyForWarehouses(docs);
      return docs.map((doc) =>
        mapWarehouseToGraphQL(doc, occupancyByWarehouse.get(doc._id.toString())),
      );
    },

    warehouse: async (_: any, { id }: { id: string }, context: any) => {
      await ensureMongoConnection();
      requirePermission(context, Permission.WAREHOUSE_VIEW);

      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid warehouse ID');
      }
      const doc = await Warehouse.findById(id).exec();
      if (!doc) return null;
      const occupancyByWarehouse = await loadOccupancyForWarehouses([doc]);
      return mapWarehouseToGraphQL(doc, occupancyByWarehouse.get(doc._id.toString()));
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
        capacityAlertThresholdPercent: normalizeThresholdPercent(
          input.capacityAlertThresholdPercent,
        ),
        isActive: input.isActive !== false,
        storagePlaces: [],
        createdBy: user?.userId,
      });

      const saved = await warehouse.save();
      const occupancy = await loadOccupancyForWarehouses([saved]);
      return mapWarehouseToGraphQL(saved, occupancy.get(saved._id.toString()));
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
      if (input.capacityAlertThresholdPercent !== undefined) {
        warehouse.capacityAlertThresholdPercent = normalizeThresholdPercent(
          input.capacityAlertThresholdPercent,
        );
      }

      const saved = await warehouse.save();
      const occupancy = await loadOccupancyForWarehouses([saved]);
      return mapWarehouseToGraphQL(saved, occupancy.get(saved._id.toString()));
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
        dimensions: input.dimensions
          ? {
              length: input.dimensions.length ?? undefined,
              width: input.dimensions.width ?? undefined,
              height: input.dimensions.height ?? undefined,
              unit: normalizeUnit(input.dimensions.unit),
            }
          : undefined,
        capacityAlertThresholdPercent: normalizeThresholdPercent(
          input.capacityAlertThresholdPercent,
        ),
      } as any);

      const saved = await warehouse.save();
      const occupancy = await loadOccupancyForWarehouses([saved]);
      return mapWarehouseToGraphQL(saved, occupancy.get(saved._id.toString()));
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
      if (input.dimensions !== undefined) {
        if (input.dimensions === null) {
          place.dimensions = undefined;
        } else {
          place.dimensions = {
            length: input.dimensions.length ?? undefined,
            width: input.dimensions.width ?? undefined,
            height: input.dimensions.height ?? undefined,
            unit: normalizeUnit(input.dimensions.unit),
          };
        }
      }
      if (input.capacityAlertThresholdPercent !== undefined) {
        place.capacityAlertThresholdPercent = normalizeThresholdPercent(
          input.capacityAlertThresholdPercent,
        );
      }

      const saved = await warehouse.save();
      const occupancy = await loadOccupancyForWarehouses([saved]);
      return mapWarehouseToGraphQL(saved, occupancy.get(saved._id.toString()));
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
      await Equipment.updateMany(
        { storagePlaceId: new mongoose.Types.ObjectId(placeId) },
        { $set: { storagePlaceId: null } },
      ).exec();

      place.deleteOne();
      const saved = await warehouse.save();
      const occupancy = await loadOccupancyForWarehouses([saved]);
      return mapWarehouseToGraphQL(saved, occupancy.get(saved._id.toString()));
    },
  },
};
