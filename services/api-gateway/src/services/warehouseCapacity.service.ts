/**
 * Volume-based capacity & occupancy math for warehouses and storage places.
 *
 * Equipment items optionally carry physical `dimensions`. Storage places
 * optionally carry physical `dimensions` and an optional
 * `capacityAlertThresholdPercent`. Warehouses carry a warehouse-level
 * default threshold that places fall back to.
 *
 * Occupancy = sum(itemVolume * storedQuantity) for every equipment
 * document assigned to the location. `storedQuantity` is
 * `quantityTotal - quantityAssigned` so items checked out to events do
 * NOT take up shelf space.
 *
 * All volumes are normalized to cubic meters so different warehouses /
 * shelves / items can mix metric and imperial units without breaking
 * the math. The reported unit on every snapshot is `"meters"` (i.e.
 * cubic meters) so the UI can render a stable label.
 */

import type { IEquipment, IEquipmentDimensions } from '../models/equipment.models';
import type {
  IWarehouse,
  IWarehouseDimensions,
  IWarehouseStoragePlace,
  WarehouseDimensionUnit,
} from '../models/warehouse.models';
import { DEFAULT_CAPACITY_ALERT_THRESHOLD_PERCENT } from '../models/warehouse.models';

// Multipliers that turn a single length value in the given unit into
// meters. Keep this list in sync with WAREHOUSE_DIMENSION_UNITS.
const METERS_PER_UNIT: Record<WarehouseDimensionUnit, number> = {
  meters: 1,
  centimeters: 0.01,
  millimeters: 0.001,
  feet: 0.3048,
  yards: 0.9144,
  inches: 0.0254,
};

const REPORT_UNIT: WarehouseDimensionUnit = 'meters';

function toMetersFactor(unit: WarehouseDimensionUnit | string | undefined | null): number {
  const key = (unit || 'meters') as WarehouseDimensionUnit;
  return METERS_PER_UNIT[key] ?? METERS_PER_UNIT.meters;
}

/**
 * Convert a (length, width, height, unit) tuple to cubic meters. Returns
 * `null` whenever any dimension is missing / non-positive so callers can
 * distinguish "capacity not configured" from "capacity is zero".
 */
export function dimensionsToCubicMeters(
  dims: IWarehouseDimensions | IEquipmentDimensions | null | undefined,
): number | null {
  if (!dims) return null;
  const length = Number(dims.length);
  const width = Number(dims.width);
  const height = Number(dims.height);
  if (!Number.isFinite(length) || length <= 0) return null;
  if (!Number.isFinite(width) || width <= 0) return null;
  if (!Number.isFinite(height) || height <= 0) return null;
  const factor = toMetersFactor(dims.unit);
  return length * width * height * factor ** 3;
}

/**
 * `quantityTotal - quantityAssigned` clamped to >= 0. Items currently
 * dispatched to events are assumed to be physically out of the warehouse.
 */
export function getStoredQuantity(item: Pick<IEquipment, 'quantityTotal' | 'quantityAssigned'> | any): number {
  const total = Number(item?.quantityTotal);
  const assigned = Number(item?.quantityAssigned) || 0;
  if (!Number.isFinite(total) || total <= 0) return 0;
  const stored = total - assigned;
  return stored > 0 ? stored : 0;
}

/**
 * Per-item contribution to a storage place / warehouse occupancy.
 * Returns 0 when dimensions are missing — those items still show up in
 * `itemsMissingDimensions` so the UI can nudge the user to fill them in.
 */
export function getItemOccupiedVolume(item: any): number {
  const perUnit = dimensionsToCubicMeters(item?.dimensions);
  if (perUnit === null) return 0;
  return perUnit * getStoredQuantity(item);
}

export interface StoragePlaceOccupancy {
  capacityVolume: number | null;
  occupiedVolume: number;
  availableVolume: number | null;
  utilizationPercent: number | null;
  alertThresholdPercent: number;
  isNearFull: boolean;
  isOverCapacity: boolean;
  storedItemCount: number;
  itemsMissingDimensions: number;
  unit: WarehouseDimensionUnit;
}

export interface WarehouseOccupancy {
  capacityVolume: number | null;
  occupiedVolume: number;
  availableVolume: number | null;
  utilizationPercent: number | null;
  alertThresholdPercent: number;
  isNearFull: boolean;
  isOverCapacity: boolean;
  storedItemCount: number;
  itemsMissingDimensions: number;
  placesNearFull: number;
  unit: WarehouseDimensionUnit;
}

function effectiveThreshold(
  placeThreshold: number | undefined | null,
  warehouseThreshold: number | undefined | null,
): number {
  const place = Number(placeThreshold);
  if (Number.isFinite(place) && place >= 0 && place <= 100) return place;
  const wh = Number(warehouseThreshold);
  if (Number.isFinite(wh) && wh >= 0 && wh <= 100) return wh;
  return DEFAULT_CAPACITY_ALERT_THRESHOLD_PERCENT;
}

/**
 * Compute the occupancy snapshot for a single storage place.
 * `placeItems` should only contain equipment whose `storagePlaceId`
 * matches this place.
 */
export function computeStoragePlaceOccupancy(
  place: IWarehouseStoragePlace | any,
  placeItems: any[],
  warehouseThreshold?: number | null,
): StoragePlaceOccupancy {
  const capacityVolume = dimensionsToCubicMeters(place?.dimensions);
  const thresholdPercent = effectiveThreshold(
    place?.capacityAlertThresholdPercent,
    warehouseThreshold,
  );

  let occupiedVolume = 0;
  let itemsMissingDimensions = 0;
  for (const item of placeItems) {
    const perUnit = dimensionsToCubicMeters(item?.dimensions);
    if (perUnit === null) {
      // Only count toward "missing dimensions" when the row actually
      // contributes to occupancy (i.e. is currently stored, not out on
      // an event).
      if (getStoredQuantity(item) > 0) itemsMissingDimensions++;
      continue;
    }
    occupiedVolume += perUnit * getStoredQuantity(item);
  }

  let availableVolume: number | null = null;
  let utilizationPercent: number | null = null;
  let isNearFull = false;
  let isOverCapacity = false;
  if (capacityVolume !== null && capacityVolume > 0) {
    availableVolume = Math.max(0, capacityVolume - occupiedVolume);
    utilizationPercent = (occupiedVolume / capacityVolume) * 100;
    isOverCapacity = occupiedVolume > capacityVolume;
    isNearFull = utilizationPercent >= thresholdPercent;
  }

  return {
    capacityVolume,
    occupiedVolume,
    availableVolume,
    utilizationPercent,
    alertThresholdPercent: thresholdPercent,
    isNearFull,
    isOverCapacity,
    storedItemCount: placeItems.length,
    itemsMissingDimensions,
    unit: REPORT_UNIT,
  };
}

/**
 * Aggregate occupancy across every storage place inside a warehouse.
 *
 * `warehouseItems` should be every equipment row whose `warehouseId`
 * matches this warehouse (regardless of whether `storagePlaceId` is
 * set). Items without a `storagePlaceId` are counted at warehouse level
 * only.
 *
 * Capacity is the sum of all *configured* place capacities — places
 * without dimensions are skipped from capacity but their items still
 * contribute to occupied volume so the UI doesn't under-report load.
 */
export function computeWarehouseOccupancy(
  warehouse: IWarehouse | any,
  warehouseItems: any[],
): { warehouse: WarehouseOccupancy; places: Map<string, StoragePlaceOccupancy> } {
  const warehouseThreshold =
    typeof warehouse?.capacityAlertThresholdPercent === 'number'
      ? warehouse.capacityAlertThresholdPercent
      : null;

  // Bucket items by storagePlaceId
  const itemsByPlace = new Map<string, any[]>();
  const looseItems: any[] = [];
  for (const item of warehouseItems) {
    const placeId = item?.storagePlaceId ? String(item.storagePlaceId) : null;
    if (placeId) {
      if (!itemsByPlace.has(placeId)) itemsByPlace.set(placeId, []);
      itemsByPlace.get(placeId)!.push(item);
    } else {
      looseItems.push(item);
    }
  }

  const places = new Map<string, StoragePlaceOccupancy>();
  let capacitySum: number | null = null;
  let occupiedSum = 0;
  let storedItemCount = 0;
  let itemsMissingDimensions = 0;
  let placesNearFull = 0;

  const storagePlaces = Array.isArray(warehouse?.storagePlaces) ? warehouse.storagePlaces : [];
  for (const place of storagePlaces) {
    const placeId = String(place?._id ?? place?.id);
    const placeItems = itemsByPlace.get(placeId) || [];
    const snapshot = computeStoragePlaceOccupancy(place, placeItems, warehouseThreshold);
    places.set(placeId, snapshot);

    if (snapshot.capacityVolume !== null) {
      capacitySum = (capacitySum ?? 0) + snapshot.capacityVolume;
    }
    occupiedSum += snapshot.occupiedVolume;
    storedItemCount += snapshot.storedItemCount;
    itemsMissingDimensions += snapshot.itemsMissingDimensions;
    if (snapshot.isNearFull) placesNearFull++;
  }

  // Loose items (warehouseId set but no storagePlaceId). They still
  // consume volume at the warehouse level even though we have no
  // shelf to attribute it to.
  for (const item of looseItems) {
    const perUnit = dimensionsToCubicMeters(item?.dimensions);
    if (perUnit === null) {
      if (getStoredQuantity(item) > 0) itemsMissingDimensions++;
    } else {
      occupiedSum += perUnit * getStoredQuantity(item);
    }
    storedItemCount++;
  }

  const thresholdPercent = effectiveThreshold(null, warehouseThreshold);
  let availableVolume: number | null = null;
  let utilizationPercent: number | null = null;
  let isNearFull = false;
  let isOverCapacity = false;
  if (capacitySum !== null && capacitySum > 0) {
    availableVolume = Math.max(0, capacitySum - occupiedSum);
    utilizationPercent = (occupiedSum / capacitySum) * 100;
    isOverCapacity = occupiedSum > capacitySum;
    isNearFull = utilizationPercent >= thresholdPercent;
  }

  return {
    warehouse: {
      capacityVolume: capacitySum,
      occupiedVolume: occupiedSum,
      availableVolume,
      utilizationPercent,
      alertThresholdPercent: thresholdPercent,
      isNearFull,
      isOverCapacity,
      storedItemCount,
      itemsMissingDimensions,
      placesNearFull,
      unit: REPORT_UNIT,
    },
    places,
  };
}

/**
 * Map an `IEquipmentDimensions`-shaped object (Mongoose subdoc, lean
 * doc, or GraphQL input) to the GraphQL `EquipmentDimensions` /
 * `WarehouseDimensions` payload. Returns `null` if none of the
 * length/width/height/unit fields are populated.
 */
export function mapDimensionsToGraphQL(dims: any): {
  length: number | null;
  width: number | null;
  height: number | null;
  unit: string;
} | null {
  if (!dims) return null;
  const hasValue =
    dims.length !== undefined && dims.length !== null
      ? true
      : dims.width !== undefined && dims.width !== null
        ? true
        : dims.height !== undefined && dims.height !== null
          ? true
          : false;
  if (!hasValue) return null;
  return {
    length: dims.length ?? null,
    width: dims.width ?? null,
    height: dims.height ?? null,
    unit: dims.unit || 'meters',
  };
}

/**
 * Normalize a GraphQL `*DimensionsInput` payload into the embedded
 * sub-document shape Mongoose expects. Returns `undefined` when none
 * of the fields are populated so callers can store `dimensions:
 * undefined` to clear the embedded doc.
 */
export function normalizeDimensionsInput(
  input: any,
): { length?: number; width?: number; height?: number; unit: WarehouseDimensionUnit } | undefined {
  if (!input) return undefined;
  const length = input.length === null || input.length === undefined ? undefined : Number(input.length);
  const width = input.width === null || input.width === undefined ? undefined : Number(input.width);
  const height = input.height === null || input.height === undefined ? undefined : Number(input.height);
  const hasAny = length !== undefined || width !== undefined || height !== undefined;
  if (!hasAny) return undefined;
  const unit: WarehouseDimensionUnit = (input.unit && (METERS_PER_UNIT as any)[input.unit] !== undefined
    ? input.unit
    : 'meters') as WarehouseDimensionUnit;
  return {
    length: Number.isFinite(length) ? (length as number) : undefined,
    width: Number.isFinite(width) ? (width as number) : undefined,
    height: Number.isFinite(height) ? (height as number) : undefined,
    unit,
  };
}
