'use client';

import React, { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  PlusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client';
import {
  CREATE_WAREHOUSE,
  CREATE_WAREHOUSE_STORAGE_PLACE,
  DELETE_WAREHOUSE,
  DELETE_WAREHOUSE_STORAGE_PLACE,
  GET_WAREHOUSES,
  UPDATE_WAREHOUSE,
  UPDATE_WAREHOUSE_STORAGE_PLACE,
  WAREHOUSE_DIMENSION_UNIT_OPTIONS,
  WAREHOUSE_STORAGE_PLACE_TYPE_OPTIONS,
  formatCubicMeters,
  formatPercent,
  getDimensionUnitLabel,
  getStoragePlaceTypeLabel,
} from '../../graphql/warehouse-queries';
import { GET_WAREHOUSE_EQUIPMENT } from '../../graphql/queries';
import WarehouseExportButtons from './WarehouseExportButtons';
import WarehouseEquipmentListModal from './WarehouseEquipmentListModal';
import type { ExportColumn, ExportReport } from '@/utils/warehouseReportExport';

interface OccupancySnapshot {
  capacityVolume?: number | null;
  occupiedVolume: number;
  availableVolume?: number | null;
  utilizationPercent?: number | null;
  alertThresholdPercent: number;
  isNearFull: boolean;
  isOverCapacity: boolean;
  storedItemCount: number;
  itemsMissingDimensions: number;
  unit: string;
}

interface WarehouseOccupancySnapshot extends OccupancySnapshot {
  placesNearFull: number;
}

interface WarehouseStoragePlace {
  id: string;
  name: string;
  type: string;
  code?: string | null;
  notes?: string | null;
  isActive: boolean;
  dimensions?: WarehouseDimensions | null;
  capacityAlertThresholdPercent?: number | null;
  occupancy?: OccupancySnapshot | null;
}

interface WarehouseDimensions {
  length?: number | null;
  width?: number | null;
  height?: number | null;
  unit: string;
}

interface Warehouse {
  id: string;
  name: string;
  description?: string | null;
  address?: string | null;
  dimensions?: WarehouseDimensions | null;
  capacityAlertThresholdPercent?: number | null;
  storagePlaces: WarehouseStoragePlace[];
  isActive: boolean;
  occupancy?: WarehouseOccupancySnapshot | null;
}

// Map a 0-100 utilization percent to an antd Progress status colour.
// Over-capacity → red, at/above threshold → orange, otherwise normal.
function progressStatusFor(occupancy: OccupancySnapshot | null | undefined) {
  if (!occupancy) return undefined;
  if (occupancy.isOverCapacity) return 'exception' as const;
  if (occupancy.isNearFull) return 'active' as const;
  return 'normal' as const;
}

function progressStrokeColor(occupancy: OccupancySnapshot | null | undefined): string | undefined {
  if (!occupancy) return undefined;
  if (occupancy.isOverCapacity) return '#ff4d4f';
  if (occupancy.isNearFull) return '#faad14';
  return undefined;
}

interface WarehouseManagementProps {
  canManage?: boolean;
}

const WarehouseManagement: React.FC<WarehouseManagementProps> = ({ canManage = false }) => {
  const { message } = App.useApp();
  const [warehouseForm] = Form.useForm();
  const [placeForm] = Form.useForm();
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [isPlaceModalOpen, setIsPlaceModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [activeWarehouseId, setActiveWarehouseId] = useState<string | null>(null);
  const [editingPlace, setEditingPlace] = useState<WarehouseStoragePlace | null>(null);
  const [equipmentModalWarehouse, setEquipmentModalWarehouse] = useState<Warehouse | null>(null);

  const { data, loading, refetch } = useQuery(GET_WAREHOUSES, {
    fetchPolicy: 'cache-and-network',
  });
  const warehouses: Warehouse[] = data?.warehouses || [];
  const activeWarehouse =
    warehouses.find((w) => w.id === activeWarehouseId) || warehouses[0] || null;

  React.useEffect(() => {
    if (!activeWarehouseId && warehouses.length > 0) {
      setActiveWarehouseId(warehouses[0].id);
    }
  }, [warehouses, activeWarehouseId]);

  const [createWarehouse, { loading: creatingWarehouse }] = useMutation(CREATE_WAREHOUSE, {
    onCompleted: () => {
      message.success('המחסן נוצר בהצלחה');
      handleCloseWarehouseModal();
      refetch();
    },
    onError: (error) => {
      message.error(`שגיאה ביצירת מחסן: ${error.message}`);
    },
  });

  const [updateWarehouse, { loading: updatingWarehouse }] = useMutation(UPDATE_WAREHOUSE, {
    onCompleted: () => {
      message.success('המחסן עודכן בהצלחה');
      handleCloseWarehouseModal();
      refetch();
    },
    onError: (error) => {
      message.error(`שגיאה בעדכון מחסן: ${error.message}`);
    },
  });

  const [deleteWarehouse] = useMutation(DELETE_WAREHOUSE, {
    onCompleted: () => {
      message.success('המחסן נמחק');
      setActiveWarehouseId(null);
      refetch();
    },
    refetchQueries: [{ query: GET_WAREHOUSE_EQUIPMENT }],
    onError: (error) => {
      message.error(`שגיאה במחיקת מחסן: ${error.message}`);
    },
  });

  const [createPlace, { loading: creatingPlace }] = useMutation(CREATE_WAREHOUSE_STORAGE_PLACE, {
    onCompleted: () => {
      message.success('המיקום נוסף בהצלחה');
      handleClosePlaceModal();
      refetch();
    },
    onError: (error) => {
      message.error(`שגיאה ביצירת מיקום: ${error.message}`);
    },
  });

  const [updatePlace, { loading: updatingPlace }] = useMutation(UPDATE_WAREHOUSE_STORAGE_PLACE, {
    onCompleted: () => {
      message.success('המיקום עודכן');
      handleClosePlaceModal();
      refetch();
    },
    onError: (error) => {
      message.error(`שגיאה בעדכון מיקום: ${error.message}`);
    },
  });

  const [deletePlace] = useMutation(DELETE_WAREHOUSE_STORAGE_PLACE, {
    onCompleted: () => {
      message.success('המיקום נמחק');
      refetch();
    },
    refetchQueries: [{ query: GET_WAREHOUSE_EQUIPMENT }],
    onError: (error) => {
      message.error(`שגיאה במחיקת מיקום: ${error.message}`);
    },
  });

  const handleOpenCreateWarehouse = () => {
    setEditingWarehouse(null);
    setIsWarehouseModalOpen(true);
  };

  const handleOpenEditWarehouse = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse);
    setIsWarehouseModalOpen(true);
  };

  const handleCloseWarehouseModal = () => {
    setIsWarehouseModalOpen(false);
    setEditingWarehouse(null);
  };

  // The warehouse modal uses `destroyOnHidden`, so the <Form> is unmounted
  // while closed. We must populate the form only after it (re)mounts,
  // otherwise rc-field-form warns that the useForm instance is not connected.
  React.useEffect(() => {
    if (!isWarehouseModalOpen) return;
    if (editingWarehouse) {
      warehouseForm.setFieldsValue({
        name: editingWarehouse.name,
        description: editingWarehouse.description ?? undefined,
        address: editingWarehouse.address ?? undefined,
        isActive: editingWarehouse.isActive,
        capacityAlertThresholdPercent:
          editingWarehouse.capacityAlertThresholdPercent &&
          editingWarehouse.capacityAlertThresholdPercent > 0
            ? editingWarehouse.capacityAlertThresholdPercent
            : 75,
        dimensions: {
          length: editingWarehouse.dimensions?.length ?? undefined,
          width: editingWarehouse.dimensions?.width ?? undefined,
          height: editingWarehouse.dimensions?.height ?? undefined,
          unit: editingWarehouse.dimensions?.unit || 'meters',
        },
      });
    } else {
      warehouseForm.setFieldsValue({
        isActive: true,
        capacityAlertThresholdPercent: 75,
        dimensions: { unit: 'meters' },
      });
    }
  }, [isWarehouseModalOpen, editingWarehouse, warehouseForm]);

  const handleSubmitWarehouse = async () => {
    try {
      const values = await warehouseForm.validateFields();
      const input = {
        name: values.name?.trim(),
        description: values.description?.trim() || null,
        address: values.address?.trim() || null,
        isActive: values.isActive ?? true,
        capacityAlertThresholdPercent:
          values.capacityAlertThresholdPercent === undefined ||
          values.capacityAlertThresholdPercent === null
            ? null
            : Number(values.capacityAlertThresholdPercent),
        dimensions: values.dimensions
          ? {
              length: values.dimensions.length ?? null,
              width: values.dimensions.width ?? null,
              height: values.dimensions.height ?? null,
              unit: values.dimensions.unit || 'meters',
            }
          : null,
      };
      if (editingWarehouse) {
        await updateWarehouse({ variables: { id: editingWarehouse.id, input } });
      } else {
        await createWarehouse({ variables: { input } });
      }
    } catch (err) {
      // antd validation errors are surfaced inline; nothing else to do
    }
  };

  const handleOpenCreatePlace = (warehouse: Warehouse) => {
    setActiveWarehouseId(warehouse.id);
    setEditingPlace(null);
    setIsPlaceModalOpen(true);
  };

  const handleOpenEditPlace = (warehouse: Warehouse, place: WarehouseStoragePlace) => {
    setActiveWarehouseId(warehouse.id);
    setEditingPlace(place);
    setIsPlaceModalOpen(true);
  };

  const handleClosePlaceModal = () => {
    setIsPlaceModalOpen(false);
    setEditingPlace(null);
  };

  // Same caveat as the warehouse modal: populate the place form only after
  // the modal (and its inner Form) has mounted.
  React.useEffect(() => {
    if (!isPlaceModalOpen) return;
    if (editingPlace) {
      placeForm.setFieldsValue({
        name: editingPlace.name,
        type: editingPlace.type || 'shelf',
        code: editingPlace.code ?? undefined,
        notes: editingPlace.notes ?? undefined,
        isActive: editingPlace.isActive,
        capacityAlertThresholdPercent:
          editingPlace.capacityAlertThresholdPercent &&
          editingPlace.capacityAlertThresholdPercent > 0
            ? editingPlace.capacityAlertThresholdPercent
            : undefined,
        dimensions: {
          length: editingPlace.dimensions?.length ?? undefined,
          width: editingPlace.dimensions?.width ?? undefined,
          height: editingPlace.dimensions?.height ?? undefined,
          unit: editingPlace.dimensions?.unit || 'centimeters',
        },
      });
    } else {
      placeForm.setFieldsValue({
        type: 'shelf',
        isActive: true,
        dimensions: { unit: 'centimeters' },
      });
    }
  }, [isPlaceModalOpen, editingPlace, placeForm]);

  const handleSubmitPlace = async () => {
    if (!activeWarehouseId) return;
    try {
      const values = await placeForm.validateFields();
      const dims = values.dimensions || {};
      const hasDimensions =
        (dims.length !== undefined && dims.length !== null) ||
        (dims.width !== undefined && dims.width !== null) ||
        (dims.height !== undefined && dims.height !== null);
      const input = {
        name: values.name?.trim(),
        type: values.type || 'other',
        code: values.code?.trim() || null,
        notes: values.notes?.trim() || null,
        isActive: values.isActive ?? true,
        dimensions: hasDimensions
          ? {
              length: dims.length ?? null,
              width: dims.width ?? null,
              height: dims.height ?? null,
              unit: dims.unit || 'centimeters',
            }
          : null,
        capacityAlertThresholdPercent:
          values.capacityAlertThresholdPercent === undefined ||
          values.capacityAlertThresholdPercent === null
            ? null
            : Number(values.capacityAlertThresholdPercent),
      };
      if (editingPlace) {
        await updatePlace({
          variables: {
            warehouseId: activeWarehouseId,
            placeId: editingPlace.id,
            input,
          },
        });
      } else {
        await createPlace({
          variables: { warehouseId: activeWarehouseId, input },
        });
      }
    } catch (err) {
      // validation handled by antd
    }
  };

  /** Build a two-section report: one row per warehouse, plus a flat
   *  storage-places table (the flat table carries `warehouseName` so the
   *  CSV is filter-friendly downstream). */
  const buildReport = (): ExportReport | null => {
    if (warehouses.length === 0) return null;

    const dimToString = (d?: WarehouseDimensions | null): string => {
      if (!d) return '';
      const unit = getDimensionUnitLabel(d.unit || 'meters');
      const parts = [
        d.length != null && `אורך ${d.length}`,
        d.width != null && `רוחב ${d.width}`,
        d.height != null && `גובה ${d.height}`,
      ].filter(Boolean) as string[];
      if (parts.length === 0) return '';
      return `${parts.join(' × ')} ${unit}`;
    };

    const warehouseCols: ExportColumn<Warehouse>[] = [
      { key: 'name', label: 'שם', emphasis: true, value: (r) => r.name },
      {
        key: 'status',
        label: 'סטטוס',
        value: (r) => (r.isActive ? 'פעיל' : 'לא פעיל'),
        status: (r) =>
          r.isActive
            ? { label: 'פעיל', variant: 'active' }
            : { label: 'לא פעיל', variant: 'danger' },
      },
      { key: 'address', label: 'כתובת', value: (r) => r.address || '' },
      { key: 'description', label: 'תיאור', value: (r) => r.description || '' },
      { key: 'dimensions', label: 'מידות', value: (r) => dimToString(r.dimensions) },
      {
        key: 'placesCount',
        label: 'מקומות אחסון',
        numeric: true,
        value: (r) => r.storagePlaces.length,
      },
      {
        key: 'occupancy',
        label: 'תפוסה',
        value: (r) => {
          const o = r.occupancy;
          if (!o || o.capacityVolume === null || o.capacityVolume === undefined) {
            return 'קיבולת לא הוגדרה';
          }
          return `${formatPercent(o.utilizationPercent)} (${formatCubicMeters(o.occupiedVolume)} / ${formatCubicMeters(o.capacityVolume)})`;
        },
      },
      {
        key: 'placesNearFull',
        label: 'מקומות כמעט מלאים',
        numeric: true,
        value: (r) => r.occupancy?.placesNearFull ?? 0,
      },
    ];

    type FlatPlace = WarehouseStoragePlace & { warehouseName: string };
    const places: FlatPlace[] = [];
    warehouses.forEach((w) => {
      w.storagePlaces.forEach((p) =>
        places.push({ ...p, warehouseName: w.name }),
      );
    });

    const placeCols: ExportColumn<FlatPlace>[] = [
      { key: 'warehouse', label: 'מחסן', emphasis: true, value: (r) => r.warehouseName },
      { key: 'name', label: 'שם המקום', value: (r) => r.name },
      { key: 'type', label: 'סוג', value: (r) => getStoragePlaceTypeLabel(r.type) },
      { key: 'code', label: 'קוד', code: true, value: (r) => r.code || '' },
      {
        key: 'status',
        label: 'סטטוס',
        value: (r) => (r.isActive ? 'פעיל' : 'לא פעיל'),
        status: (r) =>
          r.isActive
            ? { label: 'פעיל', variant: 'active' }
            : { label: 'לא פעיל', variant: 'danger' },
      },
      { key: 'dimensions', label: 'מידות', value: (r) => dimToString(r.dimensions) },
      {
        key: 'occupancy',
        label: 'תפוסה',
        value: (r) => {
          const o = r.occupancy;
          if (!o || o.capacityVolume === null || o.capacityVolume === undefined) {
            return 'קיבולת לא הוגדרה';
          }
          return `${formatPercent(o.utilizationPercent)} (${formatCubicMeters(o.occupiedVolume)} / ${formatCubicMeters(o.capacityVolume)})`;
        },
        status: (r) => {
          if (!r.occupancy) return null;
          if (r.occupancy.isOverCapacity) return { label: 'מעבר לקיבולת', variant: 'danger' };
          if (r.occupancy.isNearFull) return { label: 'כמעט מלא', variant: 'warn' };
          return null;
        },
      },
      { key: 'notes', label: 'הערות', value: (r) => r.notes || '' },
    ];

    const totalPlaces = places.length;
    const activeWarehouses = warehouses.filter((w) => w.isActive).length;

    return {
      title: 'דוח מחסנים ומקומות אחסון',
      subtitle: 'רשימת המחסנים, מידותיהם ומקומות האחסון המוגדרים בכל אחד.',
      filenameStem: 'מחסן-מבנה',
      origin: 'מחסן · מחסנים',
      summary: [
        { label: 'סה״כ מחסנים', value: warehouses.length, accent: 'warehouse' },
        { label: 'פעילים', value: activeWarehouses, accent: 'events' },
        { label: 'מקומות אחסון', value: totalPlaces, accent: 'sets' },
      ],
      sections: [
        {
          kind: 'table',
          key: 'warehouses',
          title: 'מחסנים',
          accent: 'warehouse',
          meta: `${warehouses.length} מחסנים`,
          columns: warehouseCols,
          rows: warehouses,
        },
        {
          kind: 'table',
          key: 'places',
          title: 'מקומות אחסון',
          accent: 'sets',
          meta: `${totalPlaces} מקומות`,
          columns: placeCols,
          rows: places,
          emptyText: 'אין מקומות אחסון מוגדרים',
        },
      ],
    };
  };

  const renderDimensions = (warehouse: Warehouse | null) => {
    if (!warehouse?.dimensions) {
      return <span className="text-gray-400">ללא מידות</span>;
    }
    const { length, width, height, unit } = warehouse.dimensions;
    const unitLabel = getDimensionUnitLabel(unit || 'meters');
    const parts = [
      length != null && `אורך ${length}`,
      width != null && `רוחב ${width}`,
      height != null && `גובה ${height}`,
    ].filter(Boolean);
    if (parts.length === 0) {
      return <span className="text-gray-400">ללא מידות</span>;
    }
    return (
      <span>
        {parts.join(' × ')} {unitLabel}
      </span>
    );
  };

  // Compact occupancy display reused by both the warehouse list (a
  // single warehouse row) and the storage place table.
  const renderOccupancy = (occupancy: OccupancySnapshot | null | undefined) => {
    if (!occupancy) {
      return <span className="text-gray-400 text-xs">קיבולת לא הוגדרה</span>;
    }
    if (occupancy.capacityVolume === null || occupancy.capacityVolume === undefined) {
      return (
        <Space size={4} direction="vertical" style={{ width: '100%' }}>
          <span className="text-xs text-gray-500">
            תפוס: {formatCubicMeters(occupancy.occupiedVolume)}
          </span>
          <span className="text-gray-400 text-xs">קיבולת לא הוגדרה</span>
        </Space>
      );
    }
    const pct = Math.max(0, Math.min(100, occupancy.utilizationPercent ?? 0));
    const tooltipParts = [
      `תפוס: ${formatCubicMeters(occupancy.occupiedVolume)}`,
      `קיבולת: ${formatCubicMeters(occupancy.capacityVolume)}`,
      `פנוי: ${formatCubicMeters(occupancy.availableVolume)}`,
      `סף התראה: ${formatPercent(occupancy.alertThresholdPercent)}`,
    ];
    if (occupancy.itemsMissingDimensions > 0) {
      tooltipParts.push(`${occupancy.itemsMissingDimensions} פריטים ללא מידות`);
    }
    return (
      <Tooltip title={tooltipParts.join(' · ')}>
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Progress
            percent={pct}
            size="small"
            status={progressStatusFor(occupancy)}
            strokeColor={progressStrokeColor(occupancy)}
            format={(v) => formatPercent(v ?? 0)}
          />
          <Space size={4} wrap>
            {occupancy.isOverCapacity && (
              <Tag color="red" icon={<WarningOutlined />}>
                מעבר לקיבולת
              </Tag>
            )}
            {!occupancy.isOverCapacity && occupancy.isNearFull && (
              <Tag color="orange" icon={<WarningOutlined />}>
                כמעט מלא
              </Tag>
            )}
            <span className="text-xs text-gray-500">
              פנוי {formatCubicMeters(occupancy.availableVolume)}
            </span>
          </Space>
        </Space>
      </Tooltip>
    );
  };

  return (
    <div>
      <Alert
        message="ניהול מחסנים ומקומות אחסון"
        description="צרו מחסנים פיזיים, הגדירו את גודלם, והוסיפו ידנית את מקומות האחסון (שורות, מדפים, תאים וכו') שלהם. המקומות יופיעו כאופציה בבחירת מיקום הציוד."
        type="info"
        showIcon
        className="mb-4"
      />

      <Row gutter={16}>
        <Col xs={24} md={9}>
          <Card
            title={
              <span>
                <HomeOutlined className="ml-2" /> מחסנים ({warehouses.length})
              </span>
            }
            extra={
              <Space>
                <WarehouseExportButtons
                  buildReport={buildReport}
                  disabled={loading || warehouses.length === 0}
                />
                {canManage && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleOpenCreateWarehouse}
                  >
                    מחסן חדש
                  </Button>
                )}
              </Space>
            }
          >
            {loading ? (
              <div className="text-center py-6">
                <Spin />
              </div>
            ) : warehouses.length === 0 ? (
              <Empty description="עדיין לא נוצרו מחסנים" />
            ) : (
              <List
                dataSource={warehouses}
                renderItem={(warehouse) => (
                  <List.Item
                    onClick={() => setActiveWarehouseId(warehouse.id)}
                    className={`cursor-pointer ${
                      activeWarehouse?.id === warehouse.id ? 'bg-blue-50' : ''
                    }`}
                    actions={[
                      <Tooltip key="equipment" title="הצג ציוד במחסן">
                        <Button
                          size="small"
                          type="primary"
                          ghost
                          icon={<AppstoreOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEquipmentModalWarehouse(warehouse);
                          }}
                        >
                          הצג ציוד במחסן
                        </Button>
                      </Tooltip>,
                      ...(canManage
                        ? [
                            <Button
                              key="edit"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditWarehouse(warehouse);
                              }}
                            />,
                            <Popconfirm
                              key="delete"
                              title="מחיקת מחסן"
                              description="פעולה זו תסיר את המחסן וכל מקומות האחסון שבו. הציוד שהיה משויך אליו יעבור למצב 'ללא מיקום'."
                              onConfirm={(e) => {
                                e?.stopPropagation();
                                deleteWarehouse({ variables: { id: warehouse.id } });
                              }}
                              okText="מחיקה"
                              cancelText="ביטול"
                            >
                              <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </Popconfirm>,
                          ]
                        : []),
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          <strong>{warehouse.name}</strong>
                          {!warehouse.isActive && <Tag color="default">לא פעיל</Tag>}
                          <Tag color="blue">
                            {warehouse.storagePlaces.length} מיקומים
                          </Tag>
                          {warehouse.occupancy && warehouse.occupancy.placesNearFull > 0 && (
                            <Tag color="orange" icon={<WarningOutlined />}>
                              {warehouse.occupancy.placesNearFull} מקומות
                              {warehouse.occupancy.placesNearFull === 1 ? '' : ''} כמעט מלאים
                            </Tag>
                          )}
                        </Space>
                      }
                      description={
                        <div>
                          {warehouse.description && (
                            <div className="text-sm text-gray-600">
                              {warehouse.description}
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-1">
                            {renderDimensions(warehouse)}
                          </div>
                          <div className="mt-2" style={{ maxWidth: 280 }}>
                            {renderOccupancy(warehouse.occupancy)}
                          </div>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} md={15}>
          <Card
            title={
              <span>
                <EnvironmentOutlined className="ml-2" />
                {activeWarehouse
                  ? `מקומות אחסון – ${activeWarehouse.name}`
                  : 'מקומות אחסון'}
              </span>
            }
            extra={
              activeWarehouse && canManage ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => handleOpenCreatePlace(activeWarehouse)}
                >
                  מקום אחסון חדש
                </Button>
              ) : null
            }
          >
            {!activeWarehouse ? (
              <Empty description="בחרו מחסן מימין כדי לנהל את מקומות האחסון שלו" />
            ) : activeWarehouse.storagePlaces.length === 0 ? (
              <Empty description="עדיין לא נוספו מקומות אחסון למחסן זה" />
            ) : (
              <Table<WarehouseStoragePlace>
                dataSource={activeWarehouse.storagePlaces}
                rowKey="id"
                size="small"
                pagination={false}
                columns={[
                  {
                    title: 'שם',
                    dataIndex: 'name',
                    key: 'name',
                    render: (value: string, record) => (
                      <Space>
                        <strong>{value}</strong>
                        {!record.isActive && <Tag color="default">לא פעיל</Tag>}
                      </Space>
                    ),
                  },
                  {
                    title: 'סוג',
                    dataIndex: 'type',
                    key: 'type',
                    render: (type: string) => (
                      <Tag color="geekblue">{getStoragePlaceTypeLabel(type)}</Tag>
                    ),
                  },
                  {
                    title: 'קוד',
                    dataIndex: 'code',
                    key: 'code',
                    render: (code: string | null) =>
                      code ? <code>{code}</code> : <span className="text-gray-400">-</span>,
                  },
                  {
                    title: 'תפוסה',
                    key: 'occupancy',
                    width: 280,
                    render: (_: unknown, record: WarehouseStoragePlace) =>
                      renderOccupancy(record.occupancy),
                  },
                  {
                    title: 'הערות',
                    dataIndex: 'notes',
                    key: 'notes',
                    render: (notes: string | null) =>
                      notes ? notes : <span className="text-gray-400">-</span>,
                  },
                  ...(canManage
                    ? [
                        {
                          title: 'פעולות',
                          key: 'actions',
                          width: 120,
                          render: (_: unknown, record: WarehouseStoragePlace) => (
                            <Space size="small">
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => handleOpenEditPlace(activeWarehouse, record)}
                              />
                              <Popconfirm
                                title="מחיקת מקום אחסון"
                                description="פריטי ציוד שהיו משויכים למקום זה יעברו למצב 'ללא מיקום ספציפי'."
                                onConfirm={() =>
                                  deletePlace({
                                    variables: {
                                      warehouseId: activeWarehouse.id,
                                      placeId: record.id,
                                    },
                                  })
                                }
                                okText="מחיקה"
                                cancelText="ביטול"
                              >
                                <Button size="small" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title={editingWarehouse ? 'עריכת מחסן' : 'יצירת מחסן חדש'}
        open={isWarehouseModalOpen}
        onCancel={handleCloseWarehouseModal}
        onOk={handleSubmitWarehouse}
        okText={editingWarehouse ? 'שמירה' : 'יצירה'}
        cancelText="ביטול"
        confirmLoading={creatingWarehouse || updatingWarehouse}
        destroyOnHidden
      >
        <Form form={warehouseForm} layout="vertical">
          <Form.Item
            name="name"
            label="שם המחסן"
            rules={[{ required: true, message: 'נא להזין שם מחסן' }]}
          >
            <Input placeholder="לדוגמה: מחסן ראשי" />
          </Form.Item>
          <Form.Item name="description" label="תיאור">
            <Input.TextArea rows={2} placeholder="תיאור פנימי, מטרה, וכו'" />
          </Form.Item>
          <Form.Item name="address" label="כתובת / מיקום פיזי">
            <Input placeholder="לדוגמה: רחוב הברזל 12, תל אביב" />
          </Form.Item>

          <div className="mb-2 font-medium">מידות</div>
          <Row gutter={8}>
            <Col span={6}>
              <Form.Item name={['dimensions', 'length']} label="אורך">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name={['dimensions', 'width']} label="רוחב">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name={['dimensions', 'height']} label="גובה">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name={['dimensions', 'unit']} label="יחידה" initialValue="meters">
                <Select
                  options={WAREHOUSE_DIMENSION_UNIT_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="capacityAlertThresholdPercent"
            label="סף התראת תפוסה (%)"
            tooltip="כשמקום אחסון מגיע לאחוז זה מהקיבולת — תישלח התראה. ניתן לדרוס לכל מקום אחסון בנפרד. מינימום 1%."
            initialValue={75}
          >
            <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>

          <Form.Item
            name="isActive"
            label="מחסן פעיל"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingPlace ? 'עריכת מקום אחסון' : 'מקום אחסון חדש'}
        open={isPlaceModalOpen}
        onCancel={handleClosePlaceModal}
        onOk={handleSubmitPlace}
        okText={editingPlace ? 'שמירה' : 'יצירה'}
        cancelText="ביטול"
        confirmLoading={creatingPlace || updatingPlace}
        destroyOnHidden
      >
        <Form form={placeForm} layout="vertical">
          <Form.Item
            name="name"
            label="שם המיקום"
            rules={[{ required: true, message: 'נא להזין שם מיקום' }]}
          >
            <Input placeholder="לדוגמה: מדף A1, ארון 3, חדר ציוד" />
          </Form.Item>
          <Form.Item name="type" label="סוג">
            <Select
              options={WAREHOUSE_STORAGE_PLACE_TYPE_OPTIONS.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
            />
          </Form.Item>
          <Form.Item name="code" label="קוד (אופציונלי)">
            <Input placeholder="לדוגמה: A1-03" />
          </Form.Item>
          <Form.Item name="notes" label="הערות">
            <Input.TextArea rows={2} placeholder="הערות פנימיות" />
          </Form.Item>

          <div className="mb-2 font-medium">קיבולת פיזית (אופציונלי)</div>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
            ערכי הגודל נחוצים כדי לחשב כמה מקום פנוי במדף/בארון ולשלוח התראת
            "כמעט מלא".
          </div>
          <Row gutter={8}>
            <Col span={6}>
              <Form.Item name={['dimensions', 'length']} label="אורך">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name={['dimensions', 'width']} label="רוחב">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name={['dimensions', 'height']} label="גובה">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name={['dimensions', 'unit']} label="יחידה">
                <Select options={WAREHOUSE_DIMENSION_UNIT_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="capacityAlertThresholdPercent"
            label="סף התראת תפוסה למקום זה (%)"
            tooltip="אם ריק — ישתמשו בסף ברירת המחדל של המחסן (75%). מינימום 1%."
          >
            <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="%" placeholder="ברירת המחדל של המחסן" />
          </Form.Item>

          <Form.Item
            name="isActive"
            label="מיקום פעיל"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <WarehouseEquipmentListModal
        open={!!equipmentModalWarehouse}
        warehouse={
          equipmentModalWarehouse
            ? {
                id: equipmentModalWarehouse.id,
                name: equipmentModalWarehouse.name,
                occupancy: equipmentModalWarehouse.occupancy,
              }
            : null
        }
        onClose={() => setEquipmentModalWarehouse(null)}
      />
    </div>
  );
};

export default WarehouseManagement;
