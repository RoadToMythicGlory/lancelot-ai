'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Empty,
  Input,
  Modal,
  Progress,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import { EnvironmentOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons';
import { useApolloClient, useQuery } from '@apollo/client';
import { GET_WAREHOUSE_EQUIPMENT } from '../../graphql/queries';
import {
  formatCubicMeters,
  formatPercent,
  getDimensionUnitLabel,
} from '../../graphql/warehouse-queries';
import WarehouseExportButtons from './WarehouseExportButtons';
import type {
  ExportColumn,
  ExportReport,
  ExportSummaryCard,
} from '@/utils/warehouseReportExport';

interface WarehouseOccupancySnapshot {
  capacityVolume?: number | null;
  occupiedVolume: number;
  availableVolume?: number | null;
  utilizationPercent?: number | null;
  alertThresholdPercent: number;
  isNearFull: boolean;
  isOverCapacity: boolean;
  placesNearFull?: number;
}

interface WarehouseSummary {
  id: string;
  name: string;
  occupancy?: WarehouseOccupancySnapshot | null;
}

interface EquipmentRow {
  id: string;
  name: string;
  category?: string | null;
  brand?: string | null;
  barcode: string;
  status: string;
  condition?: string | null;
  quantityTotal: number;
  quantityAvailable: number;
  quantityAssigned: number;
  currentLocation?: string | null;
  isDisabled?: boolean;
  warehouseId?: string | null;
  storagePlaceId?: string | null;
  warehouse?: { id: string; name: string } | null;
  storagePlace?: {
    id: string;
    name: string;
    type?: string | null;
    code?: string | null;
  } | null;
  dimensions?: {
    length?: number | null;
    width?: number | null;
    height?: number | null;
    unit?: string | null;
  } | null;
}

interface Props {
  open: boolean;
  warehouse: WarehouseSummary | null;
  onClose: () => void;
}

// Same unit table the backend uses to normalize lengths into meters.
// Duplicated here (intentionally small) so we don't need a separate
// network roundtrip just to compute per-item volume for the visible
// rows.
const METERS_PER_UNIT: Record<string, number> = {
  meters: 1,
  centimeters: 0.01,
  millimeters: 0.001,
  feet: 0.3048,
  yards: 0.9144,
  inches: 0.0254,
};

function itemVolumeCubicMeters(row: EquipmentRow): number | null {
  const d = row.dimensions;
  if (!d) return null;
  const l = Number(d.length);
  const w = Number(d.width);
  const h = Number(d.height);
  if (!Number.isFinite(l) || l <= 0) return null;
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isFinite(h) || h <= 0) return null;
  const factor = METERS_PER_UNIT[(d.unit || 'meters') as string] ?? 1;
  return l * w * h * factor ** 3;
}

// Stored quantity = total − assigned (clamped). Items checked out to
// events don't take up shelf space, mirroring the backend math.
function storedQty(row: EquipmentRow): number {
  const stored = (row.quantityTotal ?? 0) - (row.quantityAssigned ?? 0);
  return stored > 0 ? stored : 0;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'available':
      return 'זמין';
    case 'assigned':
      return 'מוקצה';
    case 'maintenance':
      return 'בתחזוקה';
    case 'broken':
      return 'תקול';
    default:
      return status;
  }
}

function statusColor(row: EquipmentRow): string {
  if (row.isDisabled) return 'red';
  switch (row.status) {
    case 'available':
      return 'green';
    case 'assigned':
      return 'blue';
    case 'maintenance':
      return 'orange';
    default:
      return 'default';
  }
}

function locationLabel(row: EquipmentRow): string {
  if (row.warehouse?.name) {
    if (row.storagePlace?.name) {
      const code = row.storagePlace.code ? ` (${row.storagePlace.code})` : '';
      return `${row.storagePlace.name}${code}`;
    }
    return '— ללא מקום ספציפי —';
  }
  return row.currentLocation || '— ללא מיקום —';
}

function dimensionsLabel(row: EquipmentRow): string {
  const d = row.dimensions;
  if (!d) return '';
  const parts = [
    d.length != null && `אורך ${d.length}`,
    d.width != null && `רוחב ${d.width}`,
    d.height != null && `גובה ${d.height}`,
  ].filter(Boolean) as string[];
  if (parts.length === 0) return '';
  return `${parts.join(' × ')} ${getDimensionUnitLabel(d.unit || 'meters')}`;
}

const WarehouseEquipmentListModal: React.FC<Props> = ({ open, warehouse, onClose }) => {
  const [searchText, setSearchText] = useState('');
  const [placeFilter, setPlaceFilter] = useState<string>('all');
  const apolloClient = useApolloClient();

  // Reset filters whenever the modal is opened against a different warehouse
  useEffect(() => {
    if (open) {
      setSearchText('');
      setPlaceFilter('all');
    }
  }, [open, warehouse?.id]);

  // Pull a generous page of the warehouse's equipment for the visible
  // table. We use the same MAX_LIMIT cap (500) the backend enforces;
  // when a warehouse has more rows than that, the export still iterates
  // the full set via apolloClient below.
  const { data, loading } = useQuery<{ warehouseEquipment: EquipmentRow[] }>(
    GET_WAREHOUSE_EQUIPMENT,
    {
      variables: {
        filter: { warehouseId: warehouse?.id, excludeDisabled: false },
        limit: 500,
        offset: 0,
      },
      skip: !open || !warehouse?.id,
      fetchPolicy: 'cache-and-network',
    },
  );

  const rows: EquipmentRow[] = data?.warehouseEquipment || [];

  // Aggregate the visible rows so the header shows live numbers without
  // a second roundtrip (occupancy on the warehouse itself comes from
  // the warehouse query and stays the source of truth — these stats
  // are just a per-row breakdown of the visible set).
  const visibleStats = useMemo(() => {
    let occupiedFromVisible = 0;
    let missingDims = 0;
    let storedRows = 0;
    for (const row of rows) {
      const v = itemVolumeCubicMeters(row);
      const qty = storedQty(row);
      if (qty > 0) storedRows++;
      if (v === null) {
        if (qty > 0) missingDims++;
        continue;
      }
      occupiedFromVisible += v * qty;
    }
    return { occupiedFromVisible, missingDims, storedRows };
  }, [rows]);

  // Group equipment by storage place for both the filter dropdown and
  // the empty/"loose items" buckets in the table.
  const placeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = row.storagePlaceId || '';
      const name = row.storagePlace?.name || 'ללא מקום ספציפי';
      if (!map.has(id)) map.set(id, name);
    }
    return [
      { value: 'all', label: 'כל המיקומים' },
      ...Array.from(map.entries()).map(([id, label]) => ({
        value: id || '__loose__',
        label,
      })),
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      if (placeFilter !== 'all') {
        const placeKey = row.storagePlaceId || '__loose__';
        if (placeFilter !== placeKey) return false;
      }
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        (row.barcode || '').toLowerCase().includes(q) ||
        (row.brand || '').toLowerCase().includes(q) ||
        (row.category || '').toLowerCase().includes(q) ||
        (row.storagePlace?.name || '').toLowerCase().includes(q) ||
        (row.storagePlace?.code || '').toLowerCase().includes(q)
      );
    });
  }, [rows, searchText, placeFilter]);

  // Lazily build the export report — fetches the full warehouse
  // catalog (paginated) so the CSV/PDF aren't capped by the 500-row
  // visible list.
  const buildReport = useCallback(async (): Promise<ExportReport | null> => {
    if (!warehouse?.id) return null;
    const PAGE = 500;
    const all: EquipmentRow[] = [];
    let pageOffset = 0;
    let safety = 0;
    while (safety < 20) {
      safety += 1;
      const { data: pageData } = await apolloClient.query<{
        warehouseEquipment: EquipmentRow[];
      }>({
        query: GET_WAREHOUSE_EQUIPMENT,
        variables: {
          filter: { warehouseId: warehouse.id, excludeDisabled: false },
          limit: PAGE,
          offset: pageOffset,
        },
        fetchPolicy: 'network-only',
      });
      const chunk = pageData?.warehouseEquipment ?? [];
      if (chunk.length === 0) break;
      all.push(...chunk);
      pageOffset += chunk.length;
      if (chunk.length < PAGE) break;
    }
    if (all.length === 0) return null;

    const occupancy = warehouse.occupancy;
    const warehouseCapacity = occupancy?.capacityVolume ?? null;

    const cols: ExportColumn<EquipmentRow>[] = [
      { key: 'name', label: 'שם הציוד', emphasis: true, value: (r) => r.name },
      { key: 'category', label: 'קטגוריה', value: (r) => r.category || '' },
      { key: 'brand', label: 'מותג', value: (r) => r.brand || '' },
      { key: 'barcode', label: 'ברקוד', code: true, value: (r) => r.barcode || '' },
      {
        key: 'status',
        label: 'סטטוס',
        value: (r) => statusLabel(r.status),
        status: (r) => {
          const label = statusLabel(r.status);
          if (r.isDisabled) return { label: 'מושבת', variant: 'danger' };
          if (r.status === 'available') return { label, variant: 'active' };
          if (r.status === 'assigned') return { label, variant: 'info' };
          if (r.status === 'maintenance') return { label, variant: 'warn' };
          return { label, variant: 'neutral' };
        },
      },
      { key: 'qtyTotal', label: 'סה״כ', numeric: true, value: (r) => r.quantityTotal },
      { key: 'qtyAvail', label: 'זמין', numeric: true, value: (r) => r.quantityAvailable },
      { key: 'qtyAssigned', label: 'מוקצה', numeric: true, value: (r) => r.quantityAssigned },
      {
        key: 'stored',
        label: 'במלאי פיזי',
        numeric: true,
        value: (r) => storedQty(r),
      },
      {
        key: 'location',
        label: 'מיקום',
        value: (r) => locationLabel(r),
      },
      {
        key: 'placeType',
        label: 'סוג מיקום',
        value: (r) => r.storagePlace?.type || '',
      },
      { key: 'dims', label: 'מידות', value: (r) => dimensionsLabel(r) },
      {
        key: 'unitVolume',
        label: 'נפח ליחידה',
        value: (r) => {
          const v = itemVolumeCubicMeters(r);
          return v === null ? '—' : formatCubicMeters(v);
        },
      },
      {
        key: 'totalVolume',
        label: 'נפח במלאי',
        value: (r) => {
          const v = itemVolumeCubicMeters(r);
          if (v === null) return '—';
          return formatCubicMeters(v * storedQty(r));
        },
      },
      {
        key: 'whShare',
        label: '% מהמחסן',
        value: (r) => {
          const v = itemVolumeCubicMeters(r);
          if (v === null || !warehouseCapacity) return '—';
          return formatPercent((v * storedQty(r)) / warehouseCapacity * 100, 1);
        },
      },
    ];

    const summary: ExportSummaryCard[] = [
      { label: 'סה״כ פריטים', value: all.length, accent: 'warehouse' },
      {
        label: 'תפוסה',
        value:
          occupancy && occupancy.capacityVolume !== null && occupancy.capacityVolume !== undefined
            ? formatPercent(occupancy.utilizationPercent)
            : 'קיבולת לא הוגדרה',
        accent: 'sets',
      },
      {
        label: 'נפח תפוס',
        value: occupancy ? formatCubicMeters(occupancy.occupiedVolume) : '—',
        accent: 'events',
      },
      {
        label: 'נפח פנוי',
        value:
          occupancy && occupancy.capacityVolume !== null && occupancy.capacityVolume !== undefined
            ? formatCubicMeters(occupancy.availableVolume)
            : '—',
        accent: 'maintenance',
      },
    ];

    if (occupancy?.isNearFull || occupancy?.isOverCapacity) {
      summary.push({
        label: 'התראה',
        value: occupancy.isOverCapacity ? 'מעבר לקיבולת' : 'כמעט מלא',
        accent: 'history',
      });
    }

    return {
      title: `דוח ציוד מחסן – ${warehouse.name}`,
      subtitle:
        'רשימת כל פריטי הציוד המוקצים למחסן זה, כולל מיקום, מידות ונפח שכל פריט תופס.',
      filenameStem: `מחסן-${warehouse.name}-ציוד`,
      origin: `מחסן · ${warehouse.name}`,
      summary,
      sections: [
        {
          kind: 'table',
          key: 'equipment',
          title: 'ציוד במחסן',
          accent: 'warehouse',
          meta: `${all.length} פריטים`,
          columns: cols,
          rows: all,
          emptyText: 'אין ציוד במחסן זה',
        },
      ],
    };
  }, [warehouse?.id, warehouse?.name, warehouse?.occupancy, apolloClient]);

  // Render the modal header occupancy strip.
  const renderHeaderOccupancy = () => {
    const occ = warehouse?.occupancy;
    if (!occ) return null;
    if (occ.capacityVolume === null || occ.capacityVolume === undefined) {
      return (
        <Alert
          showIcon
          type="info"
          message="לא הוגדרה קיבולת למחסן זה — לא ניתן לחשב אחוזי תפוסה."
        />
      );
    }
    const pct = Math.max(0, Math.min(100, occ.utilizationPercent ?? 0));
    return (
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <Space size="large" wrap>
          <Statistic
            title="תפוסה"
            value={formatPercent(occ.utilizationPercent)}
            valueStyle={{
              color: occ.isOverCapacity
                ? '#ff4d4f'
                : occ.isNearFull
                  ? '#faad14'
                  : '#52c41a',
            }}
          />
          <Statistic title="נפח תפוס" value={formatCubicMeters(occ.occupiedVolume)} />
          <Statistic title="נפח פנוי" value={formatCubicMeters(occ.availableVolume)} />
          <Statistic title="קיבולת" value={formatCubicMeters(occ.capacityVolume)} />
          <Statistic
            title="סף התראה"
            value={formatPercent(occ.alertThresholdPercent)}
          />
        </Space>
        <Progress
          percent={pct}
          status={
            occ.isOverCapacity ? 'exception' : occ.isNearFull ? 'active' : 'normal'
          }
          strokeColor={
            occ.isOverCapacity ? '#ff4d4f' : occ.isNearFull ? '#faad14' : undefined
          }
          format={(v) => formatPercent(v ?? 0)}
        />
        {occ.isOverCapacity && (
          <Alert
            showIcon
            type="error"
            icon={<WarningOutlined />}
            message="המחסן מעבר לקיבולת המוגדרת"
          />
        )}
        {!occ.isOverCapacity && occ.isNearFull && (
          <Alert
            showIcon
            type="warning"
            icon={<WarningOutlined />}
            message={`המחסן כמעט מלא — נשארו ${formatCubicMeters(occ.availableVolume)} פנויים`}
          />
        )}
      </Space>
    );
  };

  return (
    <Modal
      title={
        warehouse ? (
          <span>
            <EnvironmentOutlined className="ml-2" /> ציוד במחסן – {warehouse.name}
          </span>
        ) : (
          'ציוד במחסן'
        )
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={1100}
      destroyOnHidden
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {renderHeaderOccupancy()}

        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="חיפוש לפי שם, ברקוד, מותג, מיקום..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 320 }}
            />
            <Select
              value={placeFilter}
              onChange={setPlaceFilter}
              options={placeOptions}
              style={{ minWidth: 200 }}
            />
          </Space>
          <WarehouseExportButtons
            buildReport={buildReport}
            disabled={loading || rows.length === 0}
          />
        </Space>

        {loading && rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : rows.length === 0 ? (
          <Empty description="אין ציוד המוקצה למחסן זה" />
        ) : (
          <Table<EquipmentRow>
            dataSource={filteredRows}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ x: 1000 }}
            footer={() => (
              <Space size="large" wrap>
                <span>
                  סה״כ פריטים מוצגים: <strong>{filteredRows.length}</strong>
                </span>
                <span>
                  נפח מצטבר במלאי:{' '}
                  <strong>{formatCubicMeters(visibleStats.occupiedFromVisible)}</strong>
                </span>
                {visibleStats.missingDims > 0 && (
                  <Tag color="orange" icon={<WarningOutlined />}>
                    {visibleStats.missingDims} פריטים ללא מידות
                  </Tag>
                )}
              </Space>
            )}
            columns={[
              {
                title: 'שם',
                dataIndex: 'name',
                key: 'name',
                render: (value: string, row) => (
                  <Space direction="vertical" size={0}>
                    <strong>{value}</strong>
                    {row.brand && (
                      <span className="text-xs text-gray-500">{row.brand}</span>
                    )}
                  </Space>
                ),
              },
              {
                title: 'קטגוריה',
                dataIndex: 'category',
                key: 'category',
                render: (value: string | null) =>
                  value ? <Tag color="blue">{value}</Tag> : '-',
              },
              {
                title: 'ברקוד',
                dataIndex: 'barcode',
                key: 'barcode',
                render: (value: string) => <code>{value}</code>,
              },
              {
                title: 'סטטוס',
                dataIndex: 'status',
                key: 'status',
                render: (_value: string, row) => (
                  <Space size={4} direction="vertical">
                    <Tag color={statusColor(row)}>
                      {row.isDisabled ? 'מושבת' : statusLabel(row.status)}
                    </Tag>
                    {row.quantityAssigned > 0 && (
                      <span className="text-xs text-gray-500">
                        {row.quantityAssigned} בשימוש
                      </span>
                    )}
                  </Space>
                ),
              },
              {
                title: 'כמות במלאי',
                key: 'stored',
                width: 110,
                render: (_v: unknown, row) => (
                  <span>
                    {storedQty(row)}{' '}
                    <span className="text-xs text-gray-400">/ {row.quantityTotal}</span>
                  </span>
                ),
              },
              {
                title: 'מיקום',
                key: 'location',
                render: (_v: unknown, row) => (
                  <Space direction="vertical" size={0}>
                    <span>{locationLabel(row)}</span>
                    {row.storagePlace?.type && (
                      <span className="text-xs text-gray-500">{row.storagePlace.type}</span>
                    )}
                  </Space>
                ),
              },
              {
                title: 'מידות',
                key: 'dims',
                render: (_v: unknown, row) => {
                  const text = dimensionsLabel(row);
                  if (!text) {
                    return <span className="text-gray-400 text-xs">לא הוגדרו</span>;
                  }
                  return <span className="text-xs">{text}</span>;
                },
              },
              {
                title: 'נפח במלאי',
                key: 'volume',
                width: 160,
                render: (_v: unknown, row) => {
                  const unit = itemVolumeCubicMeters(row);
                  if (unit === null) {
                    return <span className="text-gray-400 text-xs">—</span>;
                  }
                  const total = unit * storedQty(row);
                  const capacity = warehouse?.occupancy?.capacityVolume;
                  const sharePct =
                    capacity && capacity > 0 ? (total / capacity) * 100 : null;
                  return (
                    <Tooltip
                      title={`נפח ליחידה: ${formatCubicMeters(unit)} · ${storedQty(row)} יחידות`}
                    >
                      <Space direction="vertical" size={0}>
                        <strong>{formatCubicMeters(total)}</strong>
                        {sharePct !== null && (
                          <span className="text-xs text-gray-500">
                            {formatPercent(sharePct, 1)} מהמחסן
                          </span>
                        )}
                      </Space>
                    </Tooltip>
                  );
                },
              },
            ]}
          />
        )}
      </Space>
    </Modal>
  );
};

export default WarehouseEquipmentListModal;
