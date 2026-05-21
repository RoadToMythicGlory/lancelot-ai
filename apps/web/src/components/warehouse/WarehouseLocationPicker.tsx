'use client';

import React, { useMemo } from 'react';
import { Alert, Select, Space, Spin } from 'antd';
import { useQuery } from '@apollo/client';
import {
  GET_WAREHOUSES,
  getStoragePlaceTypeLabel,
} from '../../graphql/warehouse-queries';

interface WarehouseStoragePlace {
  id: string;
  name: string;
  type: string;
  code?: string | null;
  isActive: boolean;
}

interface Warehouse {
  id: string;
  name: string;
  isActive: boolean;
  storagePlaces: WarehouseStoragePlace[];
}

interface WarehouseLocationPickerProps {
  /** Controlled warehouse id ('' / null for unset). */
  warehouseId?: string | null;
  /** Controlled storage place id ('' / null for unset). */
  storagePlaceId?: string | null;
  onChange?: (next: { warehouseId: string | null; storagePlaceId: string | null }) => void;
  disabled?: boolean;
}

const NONE_VALUE = '__none__';

const WarehouseLocationPicker: React.FC<WarehouseLocationPickerProps> = ({
  warehouseId,
  storagePlaceId,
  onChange,
  disabled,
}) => {
  const { data, loading } = useQuery(GET_WAREHOUSES, {
    variables: { filter: { isActive: true } },
    fetchPolicy: 'cache-first',
  });

  const warehouses: Warehouse[] = data?.warehouses || [];
  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === warehouseId) || null,
    [warehouses, warehouseId],
  );

  const handleWarehouseChange = (value: string) => {
    const nextId = value === NONE_VALUE ? null : value;
    onChange?.({ warehouseId: nextId, storagePlaceId: null });
  };

  const handlePlaceChange = (value: string) => {
    const nextId = value === NONE_VALUE ? null : value;
    onChange?.({ warehouseId: warehouseId ?? null, storagePlaceId: nextId });
  };

  if (loading && warehouses.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 12 }}>
        <Spin size="small" />
      </div>
    );
  }

  if (warehouses.length === 0) {
    return (
      <Alert
        type="info"
        showIcon
        message="עדיין לא הוגדרו מחסנים"
        description="ניתן ליצור מחסנים ולהוסיף מקומות אחסון בלשונית 'מחסנים ומיקומים'."
      />
    );
  }

  const placeOptions = (selectedWarehouse?.storagePlaces || [])
    .filter((p) => p.isActive)
    .map((place) => ({
      value: place.id,
      label: (
        <span>
          <strong>{place.name}</strong>{' '}
          <span style={{ color: '#999' }}>
            ({getStoragePlaceTypeLabel(place.type)}
            {place.code ? ` · ${place.code}` : ''})
          </span>
        </span>
      ),
    }));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      <Select
        value={warehouseId || NONE_VALUE}
        onChange={handleWarehouseChange}
        disabled={disabled}
        placeholder="בחר מחסן"
        options={[
          { value: NONE_VALUE, label: 'ללא מחסן' },
          ...warehouses.map((w) => ({
            value: w.id,
            label: w.isActive ? w.name : `${w.name} (לא פעיל)`,
          })),
        ]}
        style={{ width: '100%' }}
      />
      {selectedWarehouse && (
        <Select
          value={storagePlaceId || NONE_VALUE}
          onChange={handlePlaceChange}
          disabled={disabled}
          placeholder={
            placeOptions.length === 0
              ? 'אין מקומות אחסון פעילים במחסן זה'
              : 'בחר מקום אחסון (לא חובה)'
          }
          options={[
            { value: NONE_VALUE, label: 'ללא מקום ספציפי' },
            ...placeOptions,
          ]}
          style={{ width: '100%' }}
          notFoundContent="אין מקומות תואמים"
        />
      )}
    </Space>
  );
};

export default WarehouseLocationPicker;
