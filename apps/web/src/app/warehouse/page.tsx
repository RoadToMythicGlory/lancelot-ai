'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Alert, List, Card, Input, Button, Space, Tag, Row, Col, Empty, App, Breadcrumb, Select, Statistic, DatePicker, Modal } from 'antd';
import {
  InboxOutlined,
  CheckCircleOutlined,
  HomeOutlined,
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  PlusOutlined,
  ExportOutlined,
  ToolOutlined,
  HistoryOutlined,
  CalendarOutlined,
  ExclamationCircleOutlined,
  PhoneOutlined,
  TagsOutlined,
  FilePdfOutlined,
  EnvironmentOutlined,
  UserSwitchOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { useApolloClient, useQuery } from '@apollo/client';
import { GET_WAREHOUSE_EQUIPMENT, GET_WAREHOUSE_EQUIPMENT_STATS, GET_BROADCAST_EVENTS, GET_STALE_EQUIPMENT } from '../../graphql/queries';
import { useEquipmentCategories } from '../../hooks/useEquipmentCategories';
import { GET_WAREHOUSES } from '../../graphql/warehouse-queries';
import WarehouseExportButtons from '../../components/warehouse/WarehouseExportButtons';
import type {
  ExportColumn,
  ExportReport,
} from '../../utils/warehouseReportExport';
import { formatDateTime as fmtExportDateTime } from '../../utils/warehouseReportExport';
import Link from 'next/link';
import EquipmentRegistrationModal from '../../components/warehouse/EquipmentRegistrationModal';
import EquipmentEditModal from '../../components/warehouse/EquipmentEditModal';
import EquipmentReturnModal from '../../components/warehouse/EquipmentReturnModal';
import EquipmentDetailsModal from '../../components/warehouse/EquipmentDetailsModal';
import EquipmentQuantityAdjustment from '../../components/warehouse/EquipmentQuantityAdjustment';
import EquipmentDisableModal from '../../components/warehouse/EquipmentDisableModal';
import VendorManagement from '../../components/warehouse/VendorManagement';
import WarehouseManagement from '../../components/warehouse/WarehouseManagement';
import EquipmentCategoriesManagement from '../../components/warehouse/EquipmentCategoriesManagement';
import UpcomingEvents from '../../components/warehouse/UpcomingEvents';
import ExternalBroadcastRequests from '../../components/warehouse/ExternalBroadcastRequests';
import WarehousePdfImportModal from '../../components/warehouse/WarehousePdfImportModal';
import EquipmentSetsManager from '../../components/warehouse/EquipmentSetsManager';
import EquipmentLiveTracking from '../../components/warehouse/tracking/EquipmentLiveTracking';
import InternalAssignmentsTab from '../../components/warehouse/internalAssignments/InternalAssignmentsTab';
import SharedEngineeringEquipmentArea from '../MCR/components/SharedEngineeringEquipmentArea';
import dayjs from 'dayjs';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useDebouncedValue } from '@/hooks/useDebounce';
import { useAuth } from '@/contexts/AuthContext';

const { RangePicker } = DatePicker;

interface Equipment {
  id: string;
  name: string;
  category: string;
  brand: string;
  barcode: string;
  status: 'available' | 'assigned' | 'maintenance';
  condition: string;
  quantityAvailable: number;
  quantityTotal: number;
  quantityAssigned: number;
  currentLocation: string;
  price: number;
  purchaseDate: string;
  warrantyExpiryDate: string;
  company: string;
  equipmentModel: string;
  contactPerson: string;
  manualLink: string;
  imageUrl: string;
  storage: {
    row: string;
    shelf: string;
    cell: string;
  };
  warehouseId?: string | null;
  storagePlaceId?: string | null;
  warehouse?: { id: string; name: string } | null;
  storagePlace?: { id: string; name: string; type?: string; code?: string | null } | null;
  isQuantityBased: boolean;
  isSharedEngineeringEquipment?: boolean;
  isDisabled: boolean;
  disabledAt?: string;
  disabledReason?: string;
  suspensionStatus?: string;
  lastUsedAt?: string;
}

/** Avoid crashes when metadata lists are missing or not arrays */
function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function legacyEquipmentStrings(equipmentList: unknown): string[] {
  if (Array.isArray(equipmentList)) {
    return equipmentList.filter((x): x is string => typeof x === 'string');
  }
  if (typeof equipmentList === 'string' && equipmentList.trim()) {
    return [equipmentList];
  }
  return [];
}

const WarehousePage: React.FC = () => {
  const { message } = App.useApp();
  const apolloClient = useApolloClient();
  const { hasPermission } = useAuth();
  const canManageWarehouse = hasPermission(Permission.WAREHOUSE_MANAGE);
  const canDisableEquipment = hasPermission(Permission.WAREHOUSE_DISABLE_EQUIPMENT);
  const canForceReleaseEquipment = hasPermission(Permission.WAREHOUSE_FORCE_RELEASE);
  // Broadcast cross-cutting features (history tab, upcoming events widget,
  // PDF import wizard, etc.) are gated by BROADCAST_VIEW. A warehouse user
  // without broadcast access (e.g. a plain MCR operator) should never see
  // them — and we definitely shouldn't fire the GET_BROADCAST_EVENTS
  // resolver from this page for them.
  const canViewBroadcasts = hasPermission(Permission.BROADCAST_VIEW);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isRegistrationModalVisible, setIsRegistrationModalVisible] = useState(false);
  const [isReturnModalVisible, setIsReturnModalVisible] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isQuantityAdjustmentVisible, setIsQuantityAdjustmentVisible] = useState(false);
  const [isDisableModalVisible, setIsDisableModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('equipment');
  const [isPdfImportVisible, setIsPdfImportVisible] = useState(false);
  const [isStaleModalVisible, setIsStaleModalVisible] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([
    dayjs().subtract(30, 'days'),
    dayjs().add(30, 'days')
  ]);

  const dateRangeValid = Boolean(dateRange[0] && dateRange[1]);
  const debouncedSearchText = useDebouncedValue(searchText.trim(), 300);
  // The server-side `warehouseEquipment` list is hard-capped at 500 rows
  // per request, so the warehouse tab paginates server-side. The filter
  // mirrors what the user sees: when no specific status is selected we
  // ask the server to hide disabled rows (matching the "active" total in
  // `warehouseEquipmentStats`); when the user explicitly picks
  // `disabled` / `under_maintenance`, the server's own status handling
  // pins `isDisabled = true` for us.
  const equipmentFilter = useMemo(() => {
    const filter: Record<string, string | boolean> = {};
    if (debouncedSearchText) filter.searchText = debouncedSearchText;
    if (selectedCategory !== 'all') filter.category = selectedCategory;
    if (selectedStatus !== 'all') filter.status = selectedStatus;
    if (selectedWarehouse !== 'all') filter.warehouseId = selectedWarehouse;
    if (selectedStatus !== 'disabled' && selectedStatus !== 'under_maintenance') {
      filter.excludeDisabled = true;
    }
    return Object.keys(filter).length > 0 ? filter : undefined;
  }, [debouncedSearchText, selectedCategory, selectedStatus, selectedWarehouse]);

  // The summary cards must reflect every dispatch/return/disable/edit —
  // including ones triggered from other modals or other tabs. Every
  // mutation that mutates inventory now lists `GetWarehouseEquipmentStats`
  // in its `refetchQueries`, and we add a gentle 15s poll as a safety
  // net for cross-tab/cross-user activity.
  const { data: equipmentStatsData } = useQuery(GET_WAREHOUSE_EQUIPMENT_STATS, {
    variables: { filter: equipmentFilter },
    fetchPolicy: 'cache-and-network',
    pollInterval: 15000,
  });

  // Pagination total mirrors what the user is currently viewing. The
  // stats resolver already excludes disabled rows from
  // `totalEquipment`/`totalAvailable`/`totalAssigned`/`totalMaintenance`,
  // and disabled / under-maintenance views collapse onto `totalDisabled`.
  const stats = equipmentStatsData?.warehouseEquipmentStats;
  const equipmentTotal: number = (() => {
    if (!stats) return 0;
    switch (selectedStatus) {
      case 'available': return stats.totalAvailable ?? 0;
      case 'assigned': return stats.totalAssigned ?? 0;
      case 'maintenance': return stats.totalMaintenance ?? 0;
      case 'disabled':
      case 'under_maintenance':
        return stats.totalDisabled ?? 0;
      default:
        return stats.totalEquipment ?? 0;
    }
  })();

  // Cap page size at 100 — the server enforces a 500-row hard cap on the
  // `warehouseEquipment` resolver, so any value at or below that works.
  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const offset = (currentPage - 1) * safePageSize;

  const { data: equipmentData, loading: equipmentLoading, error: equipmentError, refetch } = useQuery(GET_WAREHOUSE_EQUIPMENT, {
    variables: {
      filter: equipmentFilter,
      limit: safePageSize,
      offset,
    },
    fetchPolicy: 'cache-and-network',
  });
  const equipment: Equipment[] = equipmentData?.warehouseEquipment || [];

  // Canonical category catalog (single source of truth). Filter shows the
  // full active list including categories that have zero equipment, with
  // their Hebrew labels instead of raw slugs. Inactive categories are
  // included so a selected disabled category continues to render correctly.
  const { categories: equipmentCategoryCatalog, labelOf: categoryLabelOf } =
    useEquipmentCategories({ includeInactive: true });

  // Warehouses (populates the location filter dropdown)
  const { data: warehousesData } = useQuery(GET_WAREHOUSES, {
    fetchPolicy: 'cache-first',
  });
  const warehouses: { id: string; name: string }[] = warehousesData?.warehouses || [];

  // Stale equipment (unused 14+ days)
  const { data: staleData } = useQuery(GET_STALE_EQUIPMENT, { variables: { daysUnused: 14 } });
  const staleEquipment: Equipment[] = staleData?.staleEquipment || [];
  const staleCount = staleEquipment.length;

  // Query for broadcast events with equipment (skip if tab inactive or range cleared — avoids huge unbounded fetches and stale-cache confusion)
  const { data: eventsData, loading: eventsLoading, error: eventsError } = useQuery(GET_BROADCAST_EVENTS, {
    variables: {
      startDate: dateRangeValid ? dateRange[0]!.toISOString() : undefined,
      endDate: dateRangeValid ? dateRange[1]!.toISOString() : undefined
    },
    skip: activeTab !== 'history' || !dateRangeValid || !canViewBroadcasts
  });

  // Active subset shown by default in the filter dropdown (admins can still
  // see disabled categories applied to existing equipment via labelOf).
  const filterCategories = equipmentCategoryCatalog.filter((c) => c.isActive);

  // Reset to first page whenever filters/search change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchText, selectedCategory, selectedStatus, selectedWarehouse]);

  // The server already applies search/category/status/warehouse filters
  // and the disabled-row exclusion (via `excludeDisabled`), so the page
  // renders the resolver output directly.
  const visibleEquipment = equipment;

  const statistics = {
    totalEquipment: equipmentStatsData?.warehouseEquipmentStats?.totalEquipment ?? 0,
    totalAvailable: equipmentStatsData?.warehouseEquipmentStats?.totalAvailable ?? 0,
    totalAssigned: equipmentStatsData?.warehouseEquipmentStats?.totalAssigned ?? 0,
    totalMaintenance: equipmentStatsData?.warehouseEquipmentStats?.totalMaintenance ?? 0,
    totalDisabled: equipmentStatsData?.warehouseEquipmentStats?.totalDisabled ?? 0,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'green';
      case 'assigned': return 'blue';
      case 'maintenance': return 'orange';
      default: return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'available': return 'זמין';
      case 'assigned': return 'מוקצה';
      case 'maintenance': return 'בתחזוקה';
      default: return status;
    }
  };

  const handleEquipmentClick = (equipment: Equipment) => {
    setSelectedEquipment(equipment);
    setIsDetailsModalVisible(true);
  };

  /**
   * Build the report for the "ציוד" tab. The list itself is paginated
   * server-side (and capped at 500 rows per request), so we page through
   * the same filter the user has applied until we either hit the
   * `equipmentTotal` from the stats query or run out of rows. The result
   * is a single flat table covering every matching row, including ones
   * the user hasn't scrolled to.
   */
  const buildEquipmentReport = useCallback(async (): Promise<ExportReport | null> => {
    const PAGE = 500;
    const all: Equipment[] = [];
    const safeCap = Math.max(equipmentTotal, equipment.length);
    let pageOffset = 0;
    let safety = 0;
    while (safety < 20) {
      safety += 1;
      const { data: pageData } = await apolloClient.query<{
        warehouseEquipment: Equipment[];
      }>({
        query: GET_WAREHOUSE_EQUIPMENT,
        variables: { filter: equipmentFilter, limit: PAGE, offset: pageOffset },
        fetchPolicy: 'network-only',
      });
      const chunk: Equipment[] = pageData?.warehouseEquipment ?? [];
      if (chunk.length === 0) break;
      all.push(...chunk);
      pageOffset += chunk.length;
      if (chunk.length < PAGE) break;
      if (safeCap > 0 && all.length >= safeCap) break;
    }

    if (all.length === 0) return null;

    const cols: ExportColumn<Equipment>[] = [
      { key: 'name', label: 'שם הציוד', emphasis: true, value: (r) => r.name },
      { key: 'category', label: 'קטגוריה', value: (r) => r.category || '' },
      { key: 'brand', label: 'מותג', value: (r) => r.brand || '' },
      { key: 'model', label: 'דגם', value: (r) => r.equipmentModel || '' },
      { key: 'barcode', label: 'ברקוד', code: true, value: (r) => r.barcode || '' },
      {
        key: 'status',
        label: 'סטטוס',
        value: (r) => getStatusText(r.status) || r.status,
        status: (r) => {
          const label = getStatusText(r.status) || r.status;
          if (r.isDisabled) return { label: 'מושבת', variant: 'danger' };
          if (r.status === 'available') return { label, variant: 'active' };
          if (r.status === 'assigned') return { label, variant: 'info' };
          if (r.status === 'maintenance') return { label, variant: 'warn' };
          return { label, variant: 'neutral' };
        },
      },
      { key: 'qtyAvail', label: 'זמין', numeric: true, value: (r) => r.quantityAvailable },
      { key: 'qtyTotal', label: 'סה״כ', numeric: true, value: (r) => r.quantityTotal },
      { key: 'qtyAssigned', label: 'מוקצה', numeric: true, value: (r) => r.quantityAssigned },
      {
        key: 'location',
        label: 'מיקום',
        value: (r) => {
          if (r.warehouse?.name) {
            const parts: string[] = [r.warehouse.name];
            if (r.storagePlace?.name) {
              parts.push(
                r.storagePlace.code
                  ? `${r.storagePlace.name} (${r.storagePlace.code})`
                  : r.storagePlace.name,
              );
            }
            return parts.join(' – ');
          }
          return r.currentLocation || '';
        },
      },
      { key: 'condition', label: 'מצב', value: (r) => r.condition || '' },
      {
        key: 'flags',
        label: 'הערות',
        value: (r) => {
          const flags: string[] = [];
          if (r.isSharedEngineeringEquipment) flags.push('ציוד הנדסה שיתופי');
          if (r.suspensionStatus) flags.push(`השעיה: ${r.suspensionStatus}`);
          if (r.disabledReason) flags.push(`סיבת השבתה: ${r.disabledReason}`);
          return flags.join(' · ');
        },
      },
    ];

    const filterChips: string[] = [];
    if (debouncedSearchText) filterChips.push(`חיפוש: ${debouncedSearchText}`);
    if (selectedCategory !== 'all') filterChips.push(`קטגוריה: ${selectedCategory}`);
    if (selectedStatus !== 'all') filterChips.push(`סטטוס: ${getStatusText(selectedStatus)}`);
    if (selectedWarehouse !== 'all') {
      const w = warehouses.find((x) => x.id === selectedWarehouse);
      if (w) filterChips.push(`מחסן: ${w.name}`);
    }

    return {
      title: 'דוח ציוד מחסן',
      subtitle: 'רשימת ציוד פעיל המסונן לפי המאפיינים הנוכחיים בלשונית "ציוד".',
      filenameStem: 'מחסן-ציוד',
      origin: 'מחסן · ציוד',
      metaChips: filterChips,
      summary: [
        { label: 'סה״כ פריטים', value: all.length, accent: 'warehouse' },
        { label: 'זמין', value: statistics.totalAvailable, hint: 'יחידות פנויות', accent: 'sets' },
        { label: 'מוקצה', value: statistics.totalAssigned, hint: 'יחידות בשימוש', accent: 'events' },
        { label: 'בתחזוקה', value: statistics.totalMaintenance, accent: 'maintenance' },
        { label: 'מושבת', value: statistics.totalDisabled, accent: 'history' },
      ],
      sections: [
        {
          kind: 'table',
          key: 'equipment',
          title: 'רשימת ציוד',
          accent: 'warehouse',
          meta: `${all.length} פריטים`,
          columns: cols,
          rows: all,
          emptyText: 'לא נמצאו פריטים תואמים',
        },
      ],
    };
  }, [apolloClient, equipmentFilter, equipmentTotal, equipment.length, debouncedSearchText, selectedCategory, selectedStatus, selectedWarehouse, warehouses, statistics]);

  /**
   * Build the report for the history tab. We reuse the same item flattening
   * logic the screen uses so the export mirrors exactly what the user sees
   * (one row per equipment line item, grouped by event in the PDF).
   */
  const buildHistoryReport = useCallback((eventsWithEquipment: any[]): ExportReport | null => {
    if (eventsWithEquipment.length === 0) return null;

    type HistoryRow = {
      name: string;
      barcode: string;
      category: string;
      quantity: number;
      statusKey: 'returned' | 'requested' | 'transferred' | 'scanned' | 'legacy';
      statusLabel: string;
      assignedAt: string;
      returnedAt: string;
      transferredTo: string;
    };

    const flatten = (event: any): HistoryRow[] => {
      const items: HistoryRow[] = [];

      const warehouseData = event.metadata?.departments?.warehouse;
      const warehouseCustomData = warehouseData?.customData || {};
      const equipmentHistory = asArray(
        warehouseCustomData.equipmentHistory ?? warehouseData?.equipmentHistory,
      );
      const assignedItems = equipmentHistory.length > 0
        ? equipmentHistory
        : asArray(warehouseCustomData.assignedItems ?? warehouseData?.assignedItems);

      assignedItems.forEach((item: any) => {
        const statusKey: HistoryRow['statusKey'] =
          item.action === 'returned'
            ? 'returned'
            : item.action === 'transferred'
              ? 'transferred'
              : 'scanned';
        items.push({
          name: item.name || 'ציוד',
          barcode: item.barcode || '',
          category: item.category || '',
          quantity: item.quantity || 1,
          statusKey,
          statusLabel:
            statusKey === 'returned'
              ? 'הוחזר'
              : statusKey === 'transferred'
                ? `הועבר${item.transferredTo ? ` ל${item.transferredTo}` : ''}`
                : 'מוקצה',
          assignedAt: fmtExportDateTime(item.assignedAt || item.scannedAt),
          returnedAt: fmtExportDateTime(item.returnedAt),
          transferredTo: item.transferredTo || '',
        });
      });

      const externalBroadcastsData = event.metadata?.departments?.externalBroadcasts;
      const externalCustomData = externalBroadcastsData?.customData || {};
      const requestedEquipment = asArray(
        externalCustomData.equipmentList ?? externalBroadcastsData?.equipmentList,
      );
      requestedEquipment.forEach((item: any) => {
        items.push({
          name: item.name || 'ציוד מבוקש',
          barcode: '',
          category: item.category || '',
          quantity: item.quantity || 1,
          statusKey: 'requested',
          statusLabel: 'מבוקש',
          assignedAt: '',
          returnedAt: '',
          transferredTo: '',
        });
      });

      legacyEquipmentStrings(event.equipment_list).forEach((item: string) => {
        items.push({
          name: item,
          barcode: '',
          category: '',
          quantity: 1,
          statusKey: 'legacy',
          statusLabel: 'ישן',
          assignedAt: '',
          returnedAt: '',
          transferredTo: '',
        });
      });

      const rootWarehouseData = event.metadata?.warehouseData;
      if (rootWarehouseData) {
        const rootHistory = asArray(rootWarehouseData.equipmentHistory);
        if (rootHistory.length > 0) {
          rootHistory.forEach((item: any) => {
            const statusKey: HistoryRow['statusKey'] =
              item.action === 'returned'
                ? 'returned'
                : item.action === 'transferred'
                  ? 'transferred'
                  : 'scanned';
            items.push({
              name: item.name || 'ציוד',
              barcode: item.barcode || '',
              category: item.category || '',
              quantity: item.quantity || 1,
              statusKey,
              statusLabel:
                statusKey === 'returned'
                  ? 'הוחזר'
                  : statusKey === 'transferred'
                    ? `הועבר${item.transferredTo ? ` ל${item.transferredTo}` : ''}`
                    : 'מוקצה',
              assignedAt: fmtExportDateTime(item.assignedAt || item.scannedAt),
              returnedAt: '',
              transferredTo: item.transferredTo || '',
            });
          });
        } else if (rootWarehouseData.assignedItems) {
          asArray(rootWarehouseData.assignedItems).forEach((item: any) => {
            items.push({
              name: item.name || 'ציוד',
              barcode: item.barcode || '',
              category: item.category || '',
              quantity: item.quantity || 1,
              statusKey: 'scanned',
              statusLabel: 'מוקצה',
              assignedAt: '',
              returnedAt: '',
              transferredTo: '',
            });
          });
        }
      }
      return items;
    };

    const cols: ExportColumn<HistoryRow>[] = [
      { key: 'name', label: 'שם הציוד', emphasis: true, value: (r) => r.name },
      { key: 'category', label: 'קטגוריה', value: (r) => r.category },
      { key: 'barcode', label: 'ברקוד', code: true, value: (r) => r.barcode },
      { key: 'quantity', label: 'כמות', numeric: true, value: (r) => r.quantity },
      {
        key: 'status',
        label: 'סטטוס',
        value: (r) => r.statusLabel,
        status: (r) => {
          if (r.statusKey === 'returned') return { label: r.statusLabel, variant: 'returned' };
          if (r.statusKey === 'requested') return { label: r.statusLabel, variant: 'info' };
          if (r.statusKey === 'transferred') return { label: r.statusLabel, variant: 'warn' };
          if (r.statusKey === 'legacy') return { label: r.statusLabel, variant: 'neutral' };
          return { label: r.statusLabel, variant: 'active' };
        },
      },
      { key: 'assignedAt', label: 'תאריך הקצאה', value: (r) => r.assignedAt },
      { key: 'returnedAt', label: 'תאריך החזרה', value: (r) => r.returnedAt },
    ];

    const groups = eventsWithEquipment
      .map((event: any) => {
        const rows = flatten(event);
        if (rows.length === 0) return null;
        const startD = event.startTime && dayjs(event.startTime).isValid() ? dayjs(event.startTime) : null;
        const endD = event.endTime && dayjs(event.endTime).isValid() ? dayjs(event.endTime) : null;
        const subtitleParts: string[] = [];
        if (startD) {
          subtitleParts.push(startD.format('DD/MM/YYYY HH:mm'));
          if (endD && !endD.isSame(startD)) subtitleParts.push(`עד ${endD.format('HH:mm')}`);
        }
        const secondaryParts: string[] = [];
        if (event.channel) secondaryParts.push(event.channel);
        if (event.location || event.venue) secondaryParts.push(`📍 ${event.location || event.venue}`);
        return {
          key: event.id || event.eventNumber || event.title,
          title: `${event.title || event.hebrewTitle || 'אירוע'}${event.eventNumber ? ` · #${event.eventNumber}` : ''}`,
          subtitle: subtitleParts.join(' '),
          secondary: secondaryParts.join(' · '),
          badge: `${rows.length} פריטים`,
          rows,
        };
      })
      .filter(Boolean) as Array<{ key: string; title: string; subtitle?: string; secondary?: string; badge?: string; rows: HistoryRow[] }>;

    if (groups.length === 0) return null;

    const totalItems = groups.reduce((n, g) => n + g.rows.length, 0);
    const startStr = (dateRange[0] ?? dayjs().subtract(30, 'days')).format('DD/MM/YYYY');
    const endStr = (dateRange[1] ?? dayjs().add(30, 'days')).format('DD/MM/YYYY');

    return {
      title: 'דוח היסטוריית ציוד לאירועים',
      subtitle: 'פירוט ציוד שהוקצה לאירועים בטווח התאריכים שנבחר.',
      filenameStem: `מחסן-היסטוריה-${startStr}-${endStr}`,
      origin: 'מחסן · היסטוריה',
      metaChips: [`טווח: ${startStr} – ${endStr}`],
      summary: [
        { label: 'אירועים', value: groups.length, accent: 'events' },
        { label: 'פריטי ציוד', value: totalItems, accent: 'warehouse' },
      ],
      sections: [
        {
          kind: 'grouped',
          key: 'history',
          title: 'אירועים עם ציוד מוקצה',
          accent: 'history',
          meta: `${groups.length} אירועים · ${totalItems} פריטים`,
          columns: cols,
          emptyText: 'לא נמצאו אירועים עם ציוד',
          groups,
        },
      ],
    };
  }, [dateRange]);

  const renderEquipmentTab = () => (
    <>
      {/* Statistics Cards */}
      <Row gutter={16} className="mb-6">
        <Col span={4}>
          <Card>
            <Statistic
              title="סה״כ ציוד פעיל"
              value={statistics.totalEquipment}
              prefix={<InboxOutlined />}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="ציוד זמין"
              value={statistics.totalAvailable}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="ציוד מוקצה"
              value={statistics.totalAssigned}
              prefix={<InboxOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="בתחזוקה"
              value={statistics.totalMaintenance}
              prefix={<ToolOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="ציוד מושבת"
              value={statistics.totalDisabled}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      <Alert
        message="ניהול ציוד מחסן"
        description="לחץ על כל פריט ציוד כדי לראות פרטים מלאים, אירועים פעילים והיסטוריית הקצאות."
        type="info"
        showIcon
        className="mb-6"
      />

      {staleCount > 0 && (
        <Alert
          message={`${staleCount} פריטי ציוד לא בשימוש מעל שבועיים`}
          description="ציוד שלא היה בשימוש במשך 14 יום ומעלה. לחץ כאן לצפייה ברשימה."
          type="warning"
          showIcon
          className="mb-6 cursor-pointer"
          onClick={() => setIsStaleModalVisible(true)}
        />
      )}

      {/* Filters and Search */}
      <Card className="mb-6">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={8}>
            <Input
              placeholder="חיפוש לפי שם, ברקוד או מותג"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} md={5}>
            <Select
              placeholder="סנן לפי קטגוריה"
              style={{ width: '100%' }}
              value={selectedCategory}
              onChange={setSelectedCategory}
              suffixIcon={<FilterOutlined />}
            >
              <Select.Option value="all">כל הקטגוריות</Select.Option>
              {filterCategories.map((cat) => (
                <Select.Option key={cat.slug} value={cat.slug}>{cat.labelHe}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} md={4}>
            <Select
              placeholder="סנן לפי מחסן"
              style={{ width: '100%' }}
              value={selectedWarehouse}
              onChange={setSelectedWarehouse}
              suffixIcon={<EnvironmentOutlined />}
            >
              <Select.Option value="all">כל המחסנים</Select.Option>
              {warehouses.map((w) => (
                <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} md={4}>
            <Select
              placeholder="סנן לפי סטטוס"
              style={{ width: '100%' }}
              value={selectedStatus}
              onChange={setSelectedStatus}
              suffixIcon={<FilterOutlined />}
            >
              <Select.Option value="all">כל הסטטוסים</Select.Option>
              <Select.Option value="available">זמין</Select.Option>
              <Select.Option value="assigned">מוקצה</Select.Option>
              <Select.Option value="maintenance">בתחזוקה</Select.Option>
              <Select.Option value="under_maintenance">בתחזוקה (השעיה)</Select.Option>
              <Select.Option value="disabled">מושבת</Select.Option>
            </Select>
          </Col>
          <Col xs={12} md={3}>
            <Button
              icon={<ClearOutlined />}
              onClick={() => {
                setSearchText('');
                setSelectedCategory('all');
                setSelectedStatus('all');
                setSelectedWarehouse('all');
              }}
            >
              נקה סינון
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Equipment List */}
      <Card 
        title={
          <span>
            <InboxOutlined className="ml-2" style={{ color: '#1890ff' }} />
            רשימת ציוד ({equipmentTotal} פריטים)
          </span>
        }
        extra={
          <WarehouseExportButtons
            buildReport={buildEquipmentReport}
            disabled={equipmentLoading || equipmentTotal === 0}
          />
        }
      >
        {equipmentLoading && visibleEquipment.length === 0 ? (
          <div className="text-center py-8">טוען נתוני ציוד...</div>
        ) : equipmentError ? (
          <Alert message="שגיאה בטעינת נתוני ציוד" type="error" showIcon />
        ) : visibleEquipment.length === 0 ? (
          <Empty description="לא נמצא ציוד תואם לחיפוש" />
        ) : (
          <List
            dataSource={visibleEquipment}
            pagination={{
              current: currentPage,
              pageSize: safePageSize,
              total: equipmentTotal,
              showSizeChanger: true,
              pageSizeOptions: ['20', '50', '100'],
              showTotal: (total, range) => `${range[0]}-${range[1]} מתוך ${total} פריטים`,
              onChange: (page, size) => {
                if (size !== safePageSize) {
                  setPageSize(size);
                  setCurrentPage(1);
                } else {
                  setCurrentPage(page);
                }
              },
              position: 'both',
            }}
            renderItem={(item) => (
              <List.Item
                className="hover:bg-gray-50 transition-colors"
                actions={[
                  ...(canManageWarehouse && item.isQuantityBased ? [<Button
                    key="adjust"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEquipment(item);
                      setIsQuantityAdjustmentVisible(true);
                    }}
                  >
                    התאם כמות
                  </Button>] : []),
                  ...(canManageWarehouse ? [<Button
                    key="edit"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEquipment(item);
                      setIsEditModalVisible(true);
                    }}
                  >
                    עריכה
                  </Button>] : []),
                  ...(canDisableEquipment ? [<Button
                    key="disable"
                    size="small"
                    danger={item.isDisabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEquipment(item);
                      setIsDisableModalVisible(true);
                    }}
                  >
                    {item.isDisabled ? 'הפעל' : 'השבת'}
                  </Button>] : []),
                  <Button
                    key="details"
                    size="small"
                    type="link"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEquipmentClick(item);
                    }}
                  >
                    פרטים
                  </Button>
                ]}
              >
                <div className="w-full cursor-pointer" onClick={() => handleEquipmentClick(item)}>
                  <div className="flex justify-between items-center mb-2">
                    <Space>
                      <strong className="text-lg">{item.name}</strong>
                      <Tag color="blue">{categoryLabelOf(item.category)}</Tag>
                      <Tag color={getStatusColor(item.status)}>
                        {getStatusText(item.status)}
                      </Tag>
                      {item.isDisabled && (
                        <Tag color="red">מושבת</Tag>
                      )}
                      {item.isSharedEngineeringEquipment && (
                        <Tag color="purple">ציוד הנדסה שיתופי</Tag>
                      )}
                      {item.suspensionStatus && (
                        <Tag color="volcano">
                          {item.suspensionStatus === 'under_maintenance' ? 'בתחזוקה' :
                           item.suspensionStatus === 'broken' ? 'תקול' :
                           item.suspensionStatus === 'lost' ? 'אבד' :
                           item.suspensionStatus === 'reserved' ? 'משוריין' : 'אחר'}
                        </Tag>
                      )}
                      {item.condition && item.condition !== 'תקין' && (
                        <Tag color="warning">{item.condition}</Tag>
                      )}
                    </Space>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">{item.barcode}</code>
                  </div>
                  <div className="text-sm text-gray-500 flex justify-between">
                    <Space>
                      {item.brand && <span>מותג: {item.brand}</span>}
                      {item.equipmentModel && <span>| דגם: {item.equipmentModel}</span>}
                      <span>| זמין: {item.quantityAvailable}/{item.quantityTotal}</span>
                      {item.quantityAssigned > 0 && (
                        <span className="text-blue-600">| מוקצה: {item.quantityAssigned}</span>
                      )}
                    </Space>
                    {item.warehouse?.name ? (
                      <span>
                        <EnvironmentOutlined />{' '}
                        {item.warehouse.name}
                        {item.storagePlace?.name && (
                          <>
                            {' – '}
                            {item.storagePlace.name}
                            {item.storagePlace.code && ` (${item.storagePlace.code})`}
                          </>
                        )}
                      </span>
                    ) : item.currentLocation ? (
                      <span>מיקום: {item.currentLocation}</span>
                    ) : null}
                  </div>
                  {item.isDisabled && item.disabledReason && (
                    <div className="text-sm text-red-600 mt-1">
                      סיבת השבתה: {item.disabledReason}
                    </div>
                  )}
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>
    </>
  );

  const renderHistoryTab = () => {
    const events = !dateRangeValid ? [] : (eventsData?.broadcastEvents || []);

    // Filter events that have equipment - check multiple sources
    const eventsWithEquipment = events.filter((event: any) => {
      // Check warehouse department data in metadata (this is where WarehouseModal saves data)
      const warehouseData = event.metadata?.departments?.warehouse;
      const warehouseCustomData = warehouseData?.customData || {};

      // Check for equipment history (permanent record)
      const equipmentHistory = asArray(
        warehouseCustomData.equipmentHistory ?? warehouseData?.equipmentHistory
      );

      if (equipmentHistory.length > 0) {
        return true;
      }

      // Also check current assigned items
      const assignedItems = asArray(
        warehouseCustomData.assignedItems ?? warehouseData?.assignedItems
      );

      if (assignedItems.length > 0) {
        return true;
      }

      // Check external broadcasts equipment list
      const externalBroadcastsData = event.metadata?.departments?.externalBroadcasts;
      const externalCustomData = externalBroadcastsData?.customData || {};
      const equipmentList = asArray(
        externalCustomData.equipmentList ?? externalBroadcastsData?.equipmentList
      );

      if (equipmentList.length > 0) {
        return true;
      }

      // Check legacy equipment_list field
      if (legacyEquipmentStrings(event.equipment_list).length > 0) {
        return true;
      }

      // Check if metadata has warehouseData at root level (backward compatibility)
      const rootWarehouseData = event.metadata?.warehouseData;
      if (rootWarehouseData) {
        const rootHistory = asArray(rootWarehouseData.equipmentHistory);
        const rootAssigned = asArray(rootWarehouseData.assignedItems);
        if (rootHistory.length > 0 || rootAssigned.length > 0) {
          return true;
        }
      }

      return false;
    });

    return (
      <>
        <Alert
          message="היסטוריית ציוד לאירועים"
          description="רשימת כל האירועים עם ציוד מוקצה. בחר טווח תאריכים כדי לסנן את התוצאות."
          type="info"
          showIcon
          className="mb-6"
        />

        {/* Date Range Picker */}
        <Card className="mb-6">
          <Row gutter={16} align="middle">
            <Col span={12}>
              <Space>
                <CalendarOutlined />
                <span>בחר טווח תאריכים:</span>
                <RangePicker
                  value={dateRange}
                  onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
                  format="DD/MM/YYYY"
                  placeholder={['תאריך התחלה', 'תאריך סיום']}
                />
              </Space>
            </Col>
            <Col span={12} className="text-left">
              <Space>
                <Tag color="blue">
                  {dateRangeValid ? `${eventsWithEquipment.length} אירועים עם ציוד` : 'בחר טווח תאריכים'}
                </Tag>
                <WarehouseExportButtons
                  buildReport={() => buildHistoryReport(eventsWithEquipment)}
                  disabled={!dateRangeValid || eventsWithEquipment.length === 0}
                />
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Events List */}
        <Card 
          title={
            <span>
              <HistoryOutlined className="ml-2" style={{ color: '#1890ff' }} />
              אירועים עם ציוד מוקצה
            </span>
          }
        >
          {!dateRangeValid ? (
            <Empty description="בחר תאריך התחלה ותאריך סיום כדי לטעון את רשימת האירועים" />
          ) : eventsLoading ? (
            <div className="text-center py-8">טוען נתוני אירועים...</div>
          ) : eventsError ? (
            <Alert message="שגיאה בטעינת נתוני אירועים" type="error" showIcon />
          ) : eventsWithEquipment.length === 0 ? (
            <Empty description="לא נמצאו אירועים עם ציוד בטווח התאריכים שנבחר" />
          ) : (
            <List
              dataSource={eventsWithEquipment}
              renderItem={(event: any) => {
                // Extract equipment data from various sources
                const equipmentItems: any[] = [];

                // From warehouse metadata (permanent history)
                const warehouseData = event.metadata?.departments?.warehouse;
                const warehouseCustomData = warehouseData?.customData || {};

                // First check equipmentHistory (permanent record)
                const equipmentHistory = asArray(
                  warehouseCustomData.equipmentHistory ?? warehouseData?.equipmentHistory
                );

                // If no history, fall back to current assignedItems
                const assignedItems = equipmentHistory.length > 0
                  ? equipmentHistory
                  : asArray(warehouseCustomData.assignedItems ?? warehouseData?.assignedItems);
                
                // Add items from history or current assignments
                assignedItems.forEach((item: any) => {
                  equipmentItems.push({
                    name: item.name || 'ציוד',
                    type: item.action === 'returned' ? 'returned' : 
                          item.action === 'transferred' ? 'transferred' : 'scanned',
                    barcode: item.barcode,
                    category: item.category,
                    assignedAt: item.assignedAt || item.scannedAt,
                    returnedAt: item.returnedAt,
                    transferredTo: item.transferredTo,
                    transferredAt: item.transferredAt
                  });
                });
                
                // From external broadcasts (requested equipment)
                const externalBroadcastsData = event.metadata?.departments?.externalBroadcasts;
                const externalCustomData = externalBroadcastsData?.customData || {};
                const requestedEquipment = asArray(
                  externalCustomData.equipmentList ?? externalBroadcastsData?.equipmentList
                );
                
                // Add requested equipment
                requestedEquipment.forEach((item: any) => {
                  equipmentItems.push({
                    name: item.name || 'ציוד מבוקש',
                    type: 'requested',
                    quantity: item.quantity,
                    category: item.category
                  });
                });
                
                // From legacy equipment_list field
                legacyEquipmentStrings(event.equipment_list).forEach((item: string) => {
                  equipmentItems.push({
                    name: item,
                    type: 'legacy'
                  });
                });
                
                // Check backward compatibility location
                const rootWarehouseData = event.metadata?.warehouseData;
                if (rootWarehouseData) {
                  // Check history first
                  const rootHistory = asArray(rootWarehouseData.equipmentHistory);
                  if (rootHistory.length > 0) {
                    rootHistory.forEach((item: any) => {
                      equipmentItems.push({
                        name: item.name || 'ציוד',
                        type: item.action === 'returned' ? 'returned' : 
                              item.action === 'transferred' ? 'transferred' : 'scanned',
                        barcode: item.barcode,
                        category: item.category,
                        assignedAt: item.assignedAt || item.scannedAt,
                        transferredTo: item.transferredTo,
                        transferredAt: item.transferredAt
                      });
                    });
                  } else if (rootWarehouseData.assignedItems) {
                    // Fall back to assigned items if no history
                    asArray(rootWarehouseData.assignedItems).forEach((item: any) => {
                      equipmentItems.push({
                        name: item.name || 'ציוד',
                        type: 'scanned',
                        barcode: item.barcode,
                        category: item.category
                      });
                    });
                  }
                }
                
                const startD = event.startTime ? dayjs(event.startTime) : null;
                const isUpcoming = startD?.isValid() ? startD.isAfter(dayjs()) : false;

                return (
                  <List.Item>
                    <div className="w-full">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <strong className="text-lg">{event.title || event.hebrewTitle}</strong>
                          {event.eventNumber && (
                            <span className="ml-2 text-sm text-gray-500">#{event.eventNumber}</span>
                          )}
                        </div>
                        <Space>
                          <Tag color={isUpcoming ? 'blue' : 'default'}>
                            {isUpcoming ? 'עתידי' : 'עבר'}
                          </Tag>
                          <Tag>{event.channel}</Tag>
                        </Space>
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        <Space>
                          <CalendarOutlined />
                          {startD?.isValid()
                            ? startD.format('DD/MM/YYYY HH:mm')
                            : '—'}
                          {event.endTime && dayjs(event.endTime).isValid() &&
                            ` - ${dayjs(event.endTime).format('HH:mm')}`}
                          {event.location && <span>| {event.location}</span>}
                        </Space>
                      </div>
                      <div className="mt-2">
                        <strong className="text-sm">ציוד:</strong>
                        <div className="mt-1">
                          {equipmentItems.length > 0 ? (
                            equipmentItems.map((item: any, index: number) => (
                              <Tag 
                                key={index} 
                                className="mb-1"
                                color={
                                  item.type === 'returned' ? 'orange' : 
                                  item.type === 'transferred' ? 'purple' :
                                  item.type === 'scanned' ? 'green' : 
                                  item.type === 'requested' ? 'blue' : 
                                  'default'
                                }
                              >
                                {item.name}
                                {item.quantity && item.quantity > 1 && ` (${item.quantity})`}
                                {item.barcode && ` - ${item.barcode}`}
                                {item.type === 'returned' && ' (הוחזר)'}
                                {item.type === 'transferred' && item.transferredTo && ` (הועבר ל: ${item.transferredTo})`}
                              </Tag>
                            ))
                          ) : (
                            <span className="text-gray-500 text-sm">אין מידע על ציוד</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </Card>
      </>
    );
  };

  return (
    <ProtectedRoute requires={Permission.WAREHOUSE_VIEW}>
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="w-full mx-auto">
        {/* Breadcrumb */}
        <Breadcrumb 
          className="mb-4"
          items={[
            {
              title: (
                <Link href="/">
                  <HomeOutlined /> בית
                </Link>
              ),
            },
            {
              title: 'מחסן',
            },
          ]}
        />

        {/* Page Header */}
        <div className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <InboxOutlined />
                מחסן - ניהול ציוד
              </h1>
              <p className="text-gray-600 mt-2">ניהול ציוד וצפייה בהיסטוריית הקצאות</p>
            </div>
            {activeTab === 'equipment' && canManageWarehouse && (
              <Space>
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  size="large"
                  onClick={() => setIsRegistrationModalVisible(true)}
                >
                  רשום ציוד חדש
                </Button>
                <Button 
                  type="default" 
                  icon={<ExportOutlined />}
                  size="large"
                  onClick={() => setIsReturnModalVisible(true)}
                  style={{ marginLeft: 8 }}
                >
                  החזרת ציוד
                </Button>
                {canViewBroadcasts && (
                  <Button
                    icon={<FilePdfOutlined />}
                    size="large"
                    onClick={() => setIsPdfImportVisible(true)}
                    style={{ marginLeft: 8 }}
                  >
                    ייבוא PDF ציוד
                  </Button>
                )}
              </Space>
            )}
          </div>
        </div>

        {/* Section pill bar. Broadcast-dependent items are filtered out for
            users who don't have BROADCAST_VIEW so they don't accidentally
            trip a "Missing permission: BROADCAST_VIEW" 500 from the resolver.
            Pills wrap onto a second row on narrow screens instead of
            scrolling or hiding behind an overflow menu. */}
        {(() => {
          const navItems = ([
            { key: 'equipment', icon: <InboxOutlined />, label: 'ציוד' },
            canViewBroadcasts && { key: 'history', icon: <HistoryOutlined />, label: 'היסטוריה' },
            { key: 'internal-assignments', icon: <UserSwitchOutlined />, label: 'הקצאות פנימיות' },
            { key: 'vendors', icon: <PhoneOutlined />, label: 'ספקים' },
            { key: 'warehouses', icon: <HomeOutlined />, label: 'מחסנים' },
            { key: 'equipment-categories', icon: <TagsOutlined />, label: 'קטגוריות ציוד' },
            canViewBroadcasts && { key: 'upcoming-events', icon: <CalendarOutlined />, label: 'אירועים קרובים' },
            { key: 'equipment-sets', icon: <InboxOutlined />, label: 'סטים' },
            { key: 'shared-engineering', icon: <ShareAltOutlined />, label: 'ציוד הנדסה שיתופי' },
            canViewBroadcasts && { key: 'external-requests', icon: <ToolOutlined />, label: 'שידורי חוץ' },
            { key: 'tracking', icon: <EnvironmentOutlined />, label: 'מעקב חי' },
          ].filter(Boolean) as { key: string; icon: React.ReactNode; label: string }[]);

          const renderActiveTab = () => {
            switch (activeTab) {
              case 'equipment':
                return renderEquipmentTab();
              case 'history':
                return canViewBroadcasts ? renderHistoryTab() : null;
              case 'internal-assignments':
                return <InternalAssignmentsTab canManage={canManageWarehouse} />;
              case 'vendors':
                return <VendorManagement canManage={canManageWarehouse} />;
              case 'warehouses':
                return <WarehouseManagement canManage={canManageWarehouse} />;
              case 'equipment-categories':
                return <EquipmentCategoriesManagement canManage={canManageWarehouse} />;
              case 'upcoming-events':
                return canViewBroadcasts ? <UpcomingEvents /> : null;
              case 'equipment-sets':
                return <EquipmentSetsManager canManage={canManageWarehouse} />;
              case 'shared-engineering':
                return <SharedEngineeringEquipmentArea canManage={canManageWarehouse} verbose />;
              case 'external-requests':
                return canViewBroadcasts ? <ExternalBroadcastRequests message={message} canManage={canManageWarehouse} /> : null;
              case 'tracking':
                return <EquipmentLiveTracking />;
              default:
                return renderEquipmentTab();
            }
          };

          return (
            <>
              <div
                className="flex flex-nowrap items-center justify-center gap-2 mb-6 px-6 py-1.5 bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto"
                role="tablist"
                aria-label="ניווט מחסן"
              >
                {navItems.map((item) => {
                  const isActive = activeTab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(item.key)}
                      className={[
                        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium shrink-0',
                        'transition-all duration-150 whitespace-nowrap select-none',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1',
                        isActive
                          ? 'bg-blue-500 text-white shadow-sm hover:bg-blue-600'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                      ].join(' ')}
                    >
                      <span className="text-base leading-none">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
              {renderActiveTab()}
            </>
          );
        })()}

        {/* Equipment Registration Modal */}
        <EquipmentRegistrationModal
          visible={isRegistrationModalVisible}
          onClose={() => setIsRegistrationModalVisible(false)}
          onSuccess={() => {
            refetch();
          }}
        />

        {/* Equipment Return Modal */}
        <EquipmentReturnModal
          visible={isReturnModalVisible}
          onClose={() => setIsReturnModalVisible(false)}
          onSuccess={() => {
            refetch();
            message.success('הציוד הוחזר בהצלחה');
          }}
        />

        {/* Equipment Details Modal */}
        <EquipmentDetailsModal
          visible={isDetailsModalVisible}
          equipment={selectedEquipment}
          onClose={() => {
            setIsDetailsModalVisible(false);
            setSelectedEquipment(null);
          }}
          onEdit={() => {
            if (!canManageWarehouse) return;
            setIsDetailsModalVisible(false);
            setIsEditModalVisible(true);
          }}
          canManage={canManageWarehouse}
          canForceRelease={canForceReleaseEquipment}
        />

        {/* Equipment Edit Modal */}
        <EquipmentEditModal
          visible={isEditModalVisible}
          equipment={selectedEquipment}
          onClose={() => {
            setIsEditModalVisible(false);
            setSelectedEquipment(null);
          }}
          onSuccess={() => {
            refetch();
          }}
        />

        {/* Equipment Quantity Adjustment Modal */}
        <EquipmentQuantityAdjustment
          visible={isQuantityAdjustmentVisible}
          equipment={selectedEquipment}
          onClose={() => {
            setIsQuantityAdjustmentVisible(false);
            setSelectedEquipment(null);
          }}
          onSuccess={() => {
            refetch();
          }}
        />

        {/* Equipment Disable/Enable Modal */}
        <EquipmentDisableModal
          visible={isDisableModalVisible}
          equipment={selectedEquipment}
          onClose={() => {
            setIsDisableModalVisible(false);
            setSelectedEquipment(null);
          }}
          onSuccess={() => {
            refetch();
          }}
        />

        {/* PDF Equipment Import Modal */}
        <WarehousePdfImportModal
          visible={isPdfImportVisible}
          onClose={() => setIsPdfImportVisible(false)}
          onSuccess={() => {
            message.success('רשימת הציוד לאירוע נשמרה בהצלחה');
          }}
        />

        {/* Stale Equipment Modal (unused 14+ days) */}
        <Modal
          title={
            <span>
              <ExclamationCircleOutlined style={{ color: '#faad14', marginInlineEnd: 8 }} />
              ציוד לא בשימוש מעל שבועיים ({staleCount})
            </span>
          }
          open={isStaleModalVisible}
          onCancel={() => setIsStaleModalVisible(false)}
          footer={[
            <Button key="close" onClick={() => setIsStaleModalVisible(false)}>
              סגור
            </Button>,
          ]}
          width={800}
        >
          {staleEquipment.length === 0 ? (
            <Empty description="אין פריטי ציוד שאינם בשימוש" />
          ) : (
            <List
              dataSource={staleEquipment}
              renderItem={(item) => {
                const lastUsed = item.lastUsedAt && dayjs(item.lastUsedAt).isValid()
                  ? dayjs(item.lastUsedAt)
                  : null;
                const daysUnused = lastUsed ? dayjs().diff(lastUsed, 'day') : null;
                return (
                  <List.Item
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      setIsStaleModalVisible(false);
                      handleEquipmentClick(item);
                    }}
                    actions={[
                      <Button
                        key="details"
                        size="small"
                        type="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsStaleModalVisible(false);
                          handleEquipmentClick(item);
                        }}
                      >
                        פרטים
                      </Button>,
                    ]}
                  >
                    <div className="w-full">
                      <div className="flex justify-between items-center mb-1">
                        <Space>
                          <strong>{item.name}</strong>
                          {item.category && <Tag color="blue">{categoryLabelOf(item.category)}</Tag>}
                          <Tag color={getStatusColor(item.status)}>
                            {getStatusText(item.status)}
                          </Tag>
                          {item.isDisabled && <Tag color="red">מושבת</Tag>}
                        </Space>
                        {item.barcode && (
                          <code className="text-sm bg-gray-100 px-2 py-1 rounded">{item.barcode}</code>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {lastUsed
                          ? `שימוש אחרון: ${lastUsed.format('DD/MM/YYYY')}${daysUnused !== null ? ` (לפני ${daysUnused} ימים)` : ''}`
                          : 'לא נרשם שימוש'}
                      </div>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </Modal>
      </div>
    </div>
    </ProtectedRoute>
  );
};

export default WarehousePage; 