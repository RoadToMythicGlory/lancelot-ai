import { gql } from '@apollo/client';

// Warehouses are configurable physical locations with manually managed
// storage places (rows / shelves / cells / etc.). They are used to drive
// the equipment location pickers — see WarehouseManagement.tsx and the
// equipment registration / edit modals.
// Shared GraphQL fragment for the volume-based occupancy snapshot
// returned for every warehouse / storage place. Kept as a tagged literal
// constant so query strings stay deduplicated.
const WAREHOUSE_OCCUPANCY_FIELDS = `
  capacityVolume
  occupiedVolume
  availableVolume
  utilizationPercent
  alertThresholdPercent
  isNearFull
  isOverCapacity
  storedItemCount
  itemsMissingDimensions
  unit
`;

const STORAGE_PLACE_FIELDS = `
  id
  name
  type
  code
  notes
  isActive
  dimensions {
    length
    width
    height
    unit
  }
  capacityAlertThresholdPercent
  occupancy {
    ${WAREHOUSE_OCCUPANCY_FIELDS}
  }
`;

export const GET_WAREHOUSES = gql`
  query GetWarehouses($filter: WarehouseFilter) {
    warehouses(filter: $filter) {
      id
      name
      description
      address
      dimensions {
        length
        width
        height
        unit
      }
      capacityAlertThresholdPercent
      storagePlaces {
        ${STORAGE_PLACE_FIELDS}
      }
      occupancy {
        ${WAREHOUSE_OCCUPANCY_FIELDS}
        placesNearFull
      }
      isActive
      createdAt
      updatedAt
    }
  }
`;

export const GET_WAREHOUSE = gql`
  query GetWarehouse($id: ID!) {
    warehouse(id: $id) {
      id
      name
      description
      address
      dimensions {
        length
        width
        height
        unit
      }
      capacityAlertThresholdPercent
      storagePlaces {
        ${STORAGE_PLACE_FIELDS}
      }
      occupancy {
        ${WAREHOUSE_OCCUPANCY_FIELDS}
        placesNearFull
      }
      isActive
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_WAREHOUSE = gql`
  mutation CreateWarehouse($input: CreateWarehouseInput!) {
    createWarehouse(input: $input) {
      id
      name
      description
      address
      dimensions {
        length
        width
        height
        unit
      }
      capacityAlertThresholdPercent
      storagePlaces {
        ${STORAGE_PLACE_FIELDS}
      }
      occupancy {
        ${WAREHOUSE_OCCUPANCY_FIELDS}
        placesNearFull
      }
      isActive
    }
  }
`;

export const UPDATE_WAREHOUSE = gql`
  mutation UpdateWarehouse($id: ID!, $input: UpdateWarehouseInput!) {
    updateWarehouse(id: $id, input: $input) {
      id
      name
      description
      address
      dimensions {
        length
        width
        height
        unit
      }
      capacityAlertThresholdPercent
      storagePlaces {
        ${STORAGE_PLACE_FIELDS}
      }
      occupancy {
        ${WAREHOUSE_OCCUPANCY_FIELDS}
        placesNearFull
      }
      isActive
    }
  }
`;

export const DELETE_WAREHOUSE = gql`
  mutation DeleteWarehouse($id: ID!) {
    deleteWarehouse(id: $id)
  }
`;

export const CREATE_WAREHOUSE_STORAGE_PLACE = gql`
  mutation CreateWarehouseStoragePlace(
    $warehouseId: ID!
    $input: CreateWarehouseStoragePlaceInput!
  ) {
    createWarehouseStoragePlace(warehouseId: $warehouseId, input: $input) {
      id
      storagePlaces {
        ${STORAGE_PLACE_FIELDS}
      }
      occupancy {
        ${WAREHOUSE_OCCUPANCY_FIELDS}
        placesNearFull
      }
    }
  }
`;

export const UPDATE_WAREHOUSE_STORAGE_PLACE = gql`
  mutation UpdateWarehouseStoragePlace(
    $warehouseId: ID!
    $placeId: ID!
    $input: UpdateWarehouseStoragePlaceInput!
  ) {
    updateWarehouseStoragePlace(
      warehouseId: $warehouseId
      placeId: $placeId
      input: $input
    ) {
      id
      storagePlaces {
        ${STORAGE_PLACE_FIELDS}
      }
      occupancy {
        ${WAREHOUSE_OCCUPANCY_FIELDS}
        placesNearFull
      }
    }
  }
`;

export const DELETE_WAREHOUSE_STORAGE_PLACE = gql`
  mutation DeleteWarehouseStoragePlace($warehouseId: ID!, $placeId: ID!) {
    deleteWarehouseStoragePlace(warehouseId: $warehouseId, placeId: $placeId) {
      id
      storagePlaces {
        ${STORAGE_PLACE_FIELDS}
      }
      occupancy {
        ${WAREHOUSE_OCCUPANCY_FIELDS}
        placesNearFull
      }
    }
  }
`;

// Shared client-side options for warehouse dimension units and storage
// place types. Keep in sync with the backend (`warehouse.models.ts`).
export const WAREHOUSE_DIMENSION_UNIT_OPTIONS: Array<{
  value: string;
  label: string;
}> = [
  { value: 'meters', label: 'מטרים (m)' },
  { value: 'centimeters', label: 'סנטימטרים (cm)' },
  { value: 'millimeters', label: 'מילימטרים (mm)' },
  { value: 'feet', label: 'רגליים (ft)' },
  { value: 'yards', label: 'יארדים (yd)' },
  { value: 'inches', label: 'אינצ׳ים (in)' },
];

export const WAREHOUSE_STORAGE_PLACE_TYPE_OPTIONS: Array<{
  value: string;
  label: string;
}> = [
  { value: 'row', label: 'שורה' },
  { value: 'shelf', label: 'מדף' },
  { value: 'cell', label: 'תא' },
  { value: 'rack', label: 'מתקן' },
  { value: 'room', label: 'חדר' },
  { value: 'cabinet', label: 'ארון' },
  { value: 'bin', label: 'סל' },
  { value: 'other', label: 'אחר' },
];

export function getStoragePlaceTypeLabel(type: string): string {
  const found = WAREHOUSE_STORAGE_PLACE_TYPE_OPTIONS.find((opt) => opt.value === type);
  return found ? found.label : type;
}

export function getDimensionUnitLabel(unit: string): string {
  const found = WAREHOUSE_DIMENSION_UNIT_OPTIONS.find((opt) => opt.value === unit);
  return found ? found.label : unit;
}

// All backend occupancy snapshots are reported in cubic meters (the
// `unit` field on the response is `"meters"`). Format the magnitude
// with a nicer unit so a 0.0035 m³ shelf doesn't render as "0.00 m³".
export function formatCubicMeters(volume: number | null | undefined): string {
  if (volume === null || volume === undefined || !Number.isFinite(volume)) {
    return '—';
  }
  if (volume >= 1) {
    return `${volume.toFixed(volume >= 10 ? 1 : 2)} m³`;
  }
  // < 1 m³ → show in liters (1 m³ = 1000 L)
  const liters = volume * 1000;
  if (liters >= 1) {
    return `${liters.toFixed(liters >= 10 ? 0 : 1)} L`;
  }
  // < 1 L → show in cm³
  return `${(volume * 1_000_000).toFixed(0)} cm³`;
}

// 75% → "75%". Handles null/undefined gracefully.
export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}
