import { gql } from '@apollo/client';

// Warehouses are configurable physical locations with manually managed
// storage places (rows / shelves / cells / etc.). They are used to drive
// the equipment location pickers — see WarehouseManagement.tsx and the
// equipment registration / edit modals.
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
      storagePlaces {
        id
        name
        type
        code
        notes
        isActive
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
      storagePlaces {
        id
        name
        type
        code
        notes
        isActive
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
      storagePlaces {
        id
        name
        type
        code
        notes
        isActive
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
      storagePlaces {
        id
        name
        type
        code
        notes
        isActive
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
        id
        name
        type
        code
        notes
        isActive
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
        id
        name
        type
        code
        notes
        isActive
      }
    }
  }
`;

export const DELETE_WAREHOUSE_STORAGE_PLACE = gql`
  mutation DeleteWarehouseStoragePlace($warehouseId: ID!, $placeId: ID!) {
    deleteWarehouseStoragePlace(warehouseId: $warehouseId, placeId: $placeId) {
      id
      storagePlaces {
        id
        name
        type
        code
        notes
        isActive
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
