'use client';

import React, { useMemo } from 'react';
import { Alert, Select, Space, Spin, Tag } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@apollo/client';
import {
  GET_WAREHOUSES,
  formatCubicMeters,
  formatPercent,
  getStoragePlaceTypeLabel,
} from '../../graphql/warehouse-queries';

interface OccupancySnapshot {
  capacityVolume?: number | null;
  occupiedVolume: number;
  availableVolume?: number | null;
  utilizationPercent?: number | null;
  alertThresholdPercent: number;
  isNearFull: boolean;
  isOverCapacity: boolean;
}

interface WarehouseStoragePlace {
  id: string;
  name: string;
  type: string;
  code?: string | null;
  isActive: boolean;
  occupancy?: OccupancySnapshot | null;
}

interface Warehouse {
  id: string;
  name: string;
  isActive: boolean;
  storagePlaces: WarehouseStoragePlace[];
  occupancy?:
    | (OccupancySnapshot & { placesNearFull?: number })
    | null;
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
    .map((place) => {
      const occ = place.occupancy;
      const occupancyHint = occ
        ? occ.capacityVolume === null || occ.capacityVolume === undefined
          ? null
          : occ.isOverCapacity
            ? `מעבר לקיבולת (${formatPercent(occ.utilizationPercent)})`
            : occ.isNearFull
              ? `כמעט מלא · פנוי ${formatCubicMeters(occ.availableVolume)}`
              : `פנוי ${formatCubicMeters(occ.availableVolume)}`
        : null;
      return {
        value: place.id,
        // Render warning colour inline so an over-capacity shelf is
        // visually obvious in the dropdown without an extra column.
        label: (
          <span>
            <strong>{place.name}</strong>{' '}
            <span style={{ color: '#999' }}>
              ({getStoragePlaceTypeLabel(place.type)}
              {place.code ? ` · ${place.code}` : ''})
            </span>
            {occupancyHint && (
              <span
                style={{
                  marginInlineStart: 8,
                  fontSize: 12,
                  color: occ?.isOverCapacity
                    ? '#ff4d4f'
                    : occ?.isNearFull
                      ? '#faad14'
                      : '#52c41a',
                }}
              >
                {(occ?.isNearFull || occ?.isOverCapacity) && (
                  <WarningOutlined style={{ marginInlineEnd: 4 }} />
                )}
                {occupancyHint}
              </span>
            )}
          </span>
        ),
      };
    });

  const selectedPlace = selectedWarehouse?.storagePlaces.find(
    (p) => p.id === storagePlaceId,
  );

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      <Select
        value={warehouseId || NONE_VALUE}
        onChange={handleWarehouseChange}
        disabled={disabled}
        placeholder="בחר מחסן"
        options={[
          { value: NONE_VALUE, label: 'ללא מחסן' },
          ...warehouses.map((w) => {
            const occ = w.occupancy;
            return {
              value: w.id,
              label: (
                <Space>
                  <span>{w.isActive ? w.name : `${w.name} (לא פעיל)`}</span>
                  {occ && occ.isOverCapacity && (
                    <Tag color="red" icon={<WarningOutlined />}>
                      מעבר לקיבולת
                    </Tag>
                  )}
                  {occ && !occ.isOverCapacity && occ.isNearFull && (
                    <Tag color="orange" icon={<WarningOutlined />}>
                      כמעט מלא
                    </Tag>
                  )}
                </Space>
              ),
            };
          }),
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
      {selectedPlace?.occupancy?.isNearFull && (
        <Alert
          type={selectedPlace.occupancy.isOverCapacity ? 'error' : 'warning'}
          showIcon
          message={
            selectedPlace.occupancy.isOverCapacity
              ? `מקום אחסון זה כבר מעבר לקיבולת (${formatPercent(selectedPlace.occupancy.utilizationPercent)})`
              : `מקום אחסון זה כמעט מלא — נשאר ${formatCubicMeters(selectedPlace.occupancy.availableVolume)} פנויים`
          }
        />
      )}
    </Space>
  );
};

export default WarehouseLocationPicker;
