'use client';

import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  Card,
  Empty,
  Input,
  Segmented,
  Skeleton,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useState } from 'react';
import { useQuery } from '@apollo/client';
import {
  ReloadOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { GET_MCR_SHARED_ENGINEERING_EQUIPMENT } from '@/graphql/mcrQueries';
import type {
  MCRSharedEngineeringEventAssignment,
  MCRSharedEngineeringStaffAssignment,
  MCRSharedEngineeringTracking,
  MCRSharedEngineeringWarehouseEquipment,
} from '../types';
import WarehouseExportButtons from '@/components/warehouse/WarehouseExportButtons';
import type {
  ExportColumn,
  ExportReport,
} from '@/utils/warehouseReportExport';
import { formatDateTime as fmtDT } from '@/utils/warehouseReportExport';

interface Props {
  canManage: boolean;
  /**
   * When true (warehouse-side tab), render the extra context the warehouse
   * crew cares about: which warehouse / storage place an idle item is in,
   * and the venue of any external-broadcast event an item is assigned to.
   * Defaults to false to preserve the original, more compact MCR view.
   */
  verbose?: boolean;
}

type StatusFilter = 'active' | 'all';
type CurrentStateFilter = 'all' | 'warehouse' | 'event' | 'staff';

type SharedEquipmentCurrentRow = {
  key: string;
  equipmentId: string;
  equipmentName: string;
  barcode?: string | null;
  category?: string | null;
  quantity: number;
  locationType: CurrentStateFilter;
  locationLabel: string;
  locationDetail?: string | null;
  status: string;
  assignedAt?: string | null;
  returnedAt?: string | null;
  assignedByName?: string | null;
};

/** Render "מחסן ראשי – מדף 4 (BP-U30)" from the structured warehouse fields,
 *  falling back to the free-text legacy `currentLocation` when nothing
 *  structured is set. Returns null when nothing useful is known. */
function formatWarehouseLocation(eq: {
  warehouseName?: string | null;
  storagePlaceName?: string | null;
  storagePlaceCode?: string | null;
  currentLocation?: string | null;
}): string | null {
  if (eq.warehouseName) {
    const placeParts: string[] = [];
    if (eq.storagePlaceName) placeParts.push(eq.storagePlaceName);
    if (eq.storagePlaceCode) placeParts.push(`(${eq.storagePlaceCode})`);
    return placeParts.length > 0
      ? `${eq.warehouseName} – ${placeParts.join(' ')}`
      : eq.warehouseName;
  }
  if (eq.currentLocation) return eq.currentLocation;
  return null;
}

/** Render the broadcast event's physical location: prefer the explicit
 *  `venue` (external-broadcasts use this for stadiums, halls, etc.), then
 *  fall back to the free-text `location`. */
function formatEventVenue(a: {
  broadcastEventVenue?: string | null;
  broadcastEventLocation?: string | null;
}): string | null {
  return a.broadcastEventVenue || a.broadcastEventLocation || null;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'פעיל',
  completed: 'הוחזר',
  returned: 'הוחזר',
  cancelled: 'בוטל',
  transferred: 'הועבר',
  warehouse: 'במחסן',
};

const STATUS_COLOR: Record<string, string> = {
  active: 'green',
  completed: 'default',
  returned: 'default',
  cancelled: 'red',
  transferred: 'orange',
  warehouse: 'blue',
};

const formatDateTime = (value?: string | null) =>
  value && dayjs(value).isValid() ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-';

const SharedEngineeringEquipmentArea: React.FC<Props> = ({ verbose = false }) => {
  const [status, setStatus] = useState<StatusFilter>('active');
  const [currentStateFilter, setCurrentStateFilter] = useState<CurrentStateFilter>('all');
  const [searchText, setSearchText] = useState('');

  const { data, loading, error, refetch } = useQuery<{
    mcrSharedEngineeringEquipment: MCRSharedEngineeringTracking;
  }>(GET_MCR_SHARED_ENGINEERING_EQUIPMENT, {
    variables: { status },
    fetchPolicy: 'cache-and-network',
  });

  // Group event assignments by the shadow MCR event (falls back to the
  // broadcast event when no shadow exists). Each group renders as its own
  // card with a small table inside so the operator can scan the entire
  // event's flagged equipment in one glance.
  const eventGroups = useMemo(() => {
    const tracking = data?.mcrSharedEngineeringEquipment;
    if (!tracking) return [] as Array<{
      key: string;
      title: string;
      subtitle: string;
      items: MCRSharedEngineeringEventAssignment[];
    }>;

    const groups = new Map<
      string,
      {
        key: string;
        title: string;
        subtitle: string;
        items: MCRSharedEngineeringEventAssignment[];
      }
    >();

    for (const a of tracking.eventAssignments) {
      const key = a.mcrEventId || a.broadcastEventId;
      const title = a.mcrEventTitle || a.broadcastEventTitle || 'אירוע ללא שם';
      const start = a.mcrEventStart || a.broadcastEventStart;
      const end = a.mcrEventEnd || a.broadcastEventEnd;
      const subtitleParts: string[] = [];
      if (start) subtitleParts.push(formatDateTime(start));
      if (end && end !== start) subtitleParts.push(`עד ${formatDateTime(end)}`);
      // In the warehouse-side verbose view, surface the venue right next to
      // the date in the event-group header so operators can immediately see
      // "where the equipment physically is" without opening the event.
      if (verbose) {
        const venue = formatEventVenue(a);
        if (venue) subtitleParts.push(`· 📍 ${venue}`);
      }
      const subtitle = subtitleParts.join(' ');

      if (!groups.has(key)) {
        groups.set(key, { key, title, subtitle, items: [] });
      }
      groups.get(key)!.items.push(a);
    }

    return Array.from(groups.values()).sort((a, b) => {
      const aStart = a.items[0]?.mcrEventStart || a.items[0]?.broadcastEventStart;
      const bStart = b.items[0]?.mcrEventStart || b.items[0]?.broadcastEventStart;
      if (!aStart && !bStart) return a.title.localeCompare(b.title);
      if (!aStart) return 1;
      if (!bStart) return -1;
      return dayjs(bStart).valueOf() - dayjs(aStart).valueOf();
    });
  }, [data, verbose]);

  const currentRows = useMemo(() => {
    const tracking = data?.mcrSharedEngineeringEquipment;
    if (!tracking) return [] as SharedEquipmentCurrentRow[];

    const eventRows: SharedEquipmentCurrentRow[] = tracking.eventAssignments
      .filter((a) => a.status === 'active')
      .map((a) => ({
        key: `event-${a.assignmentId}`,
        equipmentId: a.equipmentId,
        equipmentName: a.equipmentName,
        barcode: a.barcode,
        category: a.category,
        quantity: a.quantity,
        locationType: 'event',
        locationLabel: a.mcrEventTitle || a.broadcastEventTitle || 'אירוע ללא שם',
        // Verbose: show the event's venue (or fallback location) as the
        // secondary line so a warehouse operator can answer "ok, but
        // physically where is it?" without opening the event card.
        locationDetail: verbose ? formatEventVenue(a) : null,
        status: a.status,
        assignedAt: a.assignedAt,
        returnedAt: a.returnedAt,
        assignedByName: a.assignedByName,
      }));

    const staffRows: SharedEquipmentCurrentRow[] = tracking.staffAssignments
      .filter((a) => a.status === 'active')
      .map((a) => ({
        key: `staff-${a.assignmentId}`,
        equipmentId: a.equipmentId,
        equipmentName: a.equipmentName,
        barcode: a.barcode,
        category: a.category,
        quantity: a.quantity,
        locationType: 'staff',
        locationLabel: a.assignedToName || 'איש צוות לא ידוע',
        locationDetail: null,
        status: a.status,
        assignedAt: a.assignedAt,
        returnedAt: a.returnedAt,
        assignedByName: a.assignedByName,
      }));

    const warehouseRows: SharedEquipmentCurrentRow[] = (tracking.availableEquipment || []).map(
      (item: MCRSharedEngineeringWarehouseEquipment) => {
        // Verbose: replace the generic "במחסן" label with the actual
        // warehouse + storage place so the warehouse crew can locate items
        // at a glance.
        const verboseLabel = verbose ? formatWarehouseLocation(item) : null;
        return {
          key: `warehouse-${item.equipmentId}`,
          equipmentId: item.equipmentId,
          equipmentName: item.equipmentName,
          barcode: item.barcode,
          category: item.category,
          quantity: item.quantity,
          locationType: 'warehouse',
          locationLabel: verboseLabel || 'במחסן',
          locationDetail: null,
          status: 'warehouse',
          assignedAt: null,
          returnedAt: null,
          assignedByName: null,
        };
      },
    );

    const q = searchText.trim().toLowerCase();
    return [...eventRows, ...staffRows, ...warehouseRows]
      .filter((row) => currentStateFilter === 'all' || row.locationType === currentStateFilter)
      .filter((row) => {
        if (!q) return true;
        return [
          row.equipmentName,
          row.barcode,
          row.category,
          row.locationLabel,
          STATUS_LABEL[row.status] || row.status,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const order: Record<CurrentStateFilter, number> = {
          event: 0,
          staff: 1,
          warehouse: 2,
          all: 3,
        };
        return order[a.locationType] - order[b.locationType] ||
          a.equipmentName.localeCompare(b.equipmentName);
      });
  }, [data, currentStateFilter, searchText, verbose]);

  const staffGroups = useMemo(() => {
    const tracking = data?.mcrSharedEngineeringEquipment;
    if (!tracking) return [] as Array<{
      key: string;
      title: string;
      subtitle: string;
      items: MCRSharedEngineeringStaffAssignment[];
    }>;

    const groups = new Map<
      string,
      {
        key: string;
        title: string;
        subtitle: string;
        items: MCRSharedEngineeringStaffAssignment[];
      }
    >();
    for (const a of tracking.staffAssignments) {
      const key = a.assignedToUserId || a.assignedToName || 'unknown';
      const title = a.assignedToName || 'איש צוות לא ידוע';
      const subtitleParts: string[] = [];
      subtitleParts.push(a.assignedToType === 'external' ? 'חיצוני' : 'פנימי');
      if (a.assignedToPhone) subtitleParts.push(a.assignedToPhone);
      const subtitle = subtitleParts.join(' · ');
      if (!groups.has(key)) {
        groups.set(key, { key, title, subtitle, items: [] });
      }
      groups.get(key)!.items.push(a);
    }
    return Array.from(groups.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [data]);

  /** Build the export-ready report for both CSV + PDF. We always include
   *  the three sections the user can see (events / staff / warehouse) so
   *  the exported document tells the full story regardless of which
   *  segmented filter is currently active. */
  const buildReport = useCallback((): ExportReport | null => {
    const tracking = data?.mcrSharedEngineeringEquipment;
    if (!tracking) return null;

    const evtCols: ExportColumn<MCRSharedEngineeringEventAssignment>[] = [
      { key: 'name', label: 'שם הציוד', emphasis: true, value: (r) => r.equipmentName },
      { key: 'category', label: 'קטגוריה', value: (r) => r.category || '' },
      { key: 'barcode', label: 'ברקוד', code: true, value: (r) => r.barcode || '' },
      { key: 'quantity', label: 'כמות', numeric: true, value: (r) => r.quantity },
      {
        key: 'status',
        label: 'סטטוס',
        value: (r) => STATUS_LABEL[r.status] || r.status,
        status: (r) => {
          const label = STATUS_LABEL[r.status] || r.status;
          if (r.status === 'active') return { label, variant: 'active' };
          if (r.status === 'returned' || r.status === 'completed') return { label, variant: 'returned' };
          if (r.status === 'cancelled') return { label, variant: 'danger' };
          if (r.status === 'transferred') return { label, variant: 'warn' };
          return { label, variant: 'neutral' };
        },
      },
      { key: 'assignedAt', label: 'הוקצה', value: (r) => fmtDT(r.assignedAt) },
      { key: 'returnedAt', label: 'הוחזר', value: (r) => fmtDT(r.returnedAt) },
      { key: 'assignedBy', label: 'הוקצה ע"י', value: (r) => r.assignedByName || '' },
    ];

    const staffCols: ExportColumn<MCRSharedEngineeringStaffAssignment>[] = [
      { key: 'name', label: 'שם הציוד', emphasis: true, value: (r) => r.equipmentName },
      { key: 'category', label: 'קטגוריה', value: (r) => r.category || '' },
      { key: 'barcode', label: 'ברקוד', code: true, value: (r) => r.barcode || '' },
      { key: 'quantity', label: 'כמות', numeric: true, value: (r) => r.quantity },
      {
        key: 'status',
        label: 'סטטוס',
        value: (r) => STATUS_LABEL[r.status] || r.status,
        status: (r) => {
          const label = STATUS_LABEL[r.status] || r.status;
          if (r.status === 'active') return { label, variant: 'active' };
          if (r.status === 'returned' || r.status === 'completed') return { label, variant: 'returned' };
          if (r.status === 'cancelled') return { label, variant: 'danger' };
          if (r.status === 'transferred') return { label, variant: 'warn' };
          return { label, variant: 'neutral' };
        },
      },
      { key: 'assignedAt', label: 'הוקצה', value: (r) => fmtDT(r.assignedAt) },
      { key: 'returnedAt', label: 'הוחזר', value: (r) => fmtDT(r.returnedAt) },
      { key: 'assignedBy', label: 'הוקצה ע"י', value: (r) => r.assignedByName || '' },
    ];

    const whCols: ExportColumn<MCRSharedEngineeringWarehouseEquipment>[] = [
      { key: 'name', label: 'שם הציוד', emphasis: true, value: (r) => r.equipmentName },
      { key: 'category', label: 'קטגוריה', value: (r) => r.category || '' },
      { key: 'barcode', label: 'ברקוד', code: true, value: (r) => r.barcode || '' },
      { key: 'quantity', label: 'כמות', numeric: true, value: (r) => r.quantity },
      { key: 'location', label: 'מיקום במחסן', value: (r) => formatWarehouseLocation(r) || 'במחסן' },
    ];

    const totalEvents = tracking.eventAssignments.length;
    const totalStaff = tracking.staffAssignments.length;
    const totalWh = tracking.availableEquipment?.length ?? 0;

    const statusLabel = status === 'active' ? 'פעיל בלבד' : 'כל הסטטוסים';

    return {
      title: 'דוח ציוד הנדסה שיתופי',
      subtitle: 'סקירה של ציוד ההנדסה השיתופי – הקצאות לאירועים, הקצאות לאנשי צוות וזמינות במחסן.',
      filenameStem: 'ציוד-הנדסה-שיתופי',
      origin: 'מחסן · ציוד הנדסה שיתופי',
      metaChips: [`סטטוס: ${statusLabel}`],
      summary: [
        { label: 'ציוד באירועים', value: totalEvents, hint: `${eventGroups.length} אירועים`, accent: 'events' },
        { label: 'בידי אנשי צוות', value: totalStaff, hint: `${staffGroups.length} אנשי צוות`, accent: 'staff' },
        { label: 'זמין במחסן', value: totalWh, hint: 'פריטים שאינם מוקצים', accent: 'warehouse' },
      ],
      sections: [
        {
          kind: 'grouped',
          key: 'events',
          title: 'ציוד שמוקצה לאירועים',
          accent: 'events',
          meta: `${totalEvents} פריטים · ${eventGroups.length} אירועים`,
          columns: evtCols,
          emptyText: 'אין ציוד הנדסה שיתופי שמוקצה לאירועים',
          groups: eventGroups.map((g) => ({
            key: g.key,
            title: g.title,
            subtitle: g.subtitle,
            badge: `${g.items.length} פריטים`,
            rows: g.items,
          })),
        },
        {
          kind: 'grouped',
          key: 'staff',
          title: 'ציוד שמוקצה לאנשי צוות',
          accent: 'staff',
          meta: `${totalStaff} פריטים · ${staffGroups.length} אנשי צוות`,
          columns: staffCols,
          emptyText: 'אין ציוד הנדסה שיתופי שמוקצה לאנשי צוות',
          groups: staffGroups.map((g) => ({
            key: g.key,
            title: g.title,
            subtitle: g.subtitle,
            badge: `${g.items.length} פריטים`,
            rows: g.items,
          })),
        },
        {
          kind: 'table',
          key: 'warehouse',
          title: 'ציוד זמין במחסן',
          accent: 'warehouse',
          meta: `${totalWh} פריטים`,
          columns: whCols,
          emptyText: 'אין ציוד זמין במחסן',
          rows: tracking.availableEquipment || [],
        },
      ],
    };
  }, [data, eventGroups, staffGroups, status]);

  const eventColumns = [
    {
      title: 'שם הציוד',
      dataIndex: 'equipmentName',
      key: 'equipmentName',
      render: (name: string, row: MCRSharedEngineeringEventAssignment) => (
        <div className="flex flex-col">
          <strong>{name}</strong>
          {row.category && <span className="text-xs text-slate-500">{row.category}</span>}
        </div>
      ),
    },
    {
      title: 'ברקוד',
      dataIndex: 'barcode',
      key: 'barcode',
      render: (b: string | null) => (b ? <code>{b}</code> : '-'),
    },
    {
      title: 'כמות',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 72,
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => (
        <Tag color={STATUS_COLOR[s] || 'default'}>{STATUS_LABEL[s] || s}</Tag>
      ),
    },
    {
      title: 'הוקצה',
      dataIndex: 'assignedAt',
      key: 'assignedAt',
      render: (v: string | null) => formatDateTime(v),
    },
    {
      title: 'הוחזר',
      dataIndex: 'returnedAt',
      key: 'returnedAt',
      render: (v: string | null) => formatDateTime(v),
    },
    {
      title: 'הוקצה ע"י',
      dataIndex: 'assignedByName',
      key: 'assignedByName',
      render: (v: string | null) => v || '-',
    },
  ];

  const staffColumns = [
    {
      title: 'שם הציוד',
      dataIndex: 'equipmentName',
      key: 'equipmentName',
      render: (name: string, row: MCRSharedEngineeringStaffAssignment) => (
        <div className="flex flex-col">
          <strong>{name}</strong>
          {row.category && <span className="text-xs text-slate-500">{row.category}</span>}
        </div>
      ),
    },
    {
      title: 'ברקוד',
      dataIndex: 'barcode',
      key: 'barcode',
      render: (b: string | null) => (b ? <code>{b}</code> : '-'),
    },
    {
      title: 'כמות',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 72,
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => (
        <Tag color={STATUS_COLOR[s] || 'default'}>{STATUS_LABEL[s] || s}</Tag>
      ),
    },
    {
      title: 'הוקצה',
      dataIndex: 'assignedAt',
      key: 'assignedAt',
      render: (v: string | null) => formatDateTime(v),
    },
    {
      title: 'הוחזר',
      dataIndex: 'returnedAt',
      key: 'returnedAt',
      render: (v: string | null) => formatDateTime(v),
    },
    {
      title: 'הוקצה ע"י',
      dataIndex: 'assignedByName',
      key: 'assignedByName',
      render: (v: string | null) => v || '-',
    },
  ];

  const currentColumns = [
    {
      title: 'שם הציוד',
      dataIndex: 'equipmentName',
      key: 'equipmentName',
      render: (name: string, row: SharedEquipmentCurrentRow) => (
        <div className="flex flex-col">
          <strong>{name}</strong>
          {row.category && <span className="text-xs text-slate-500">{row.category}</span>}
        </div>
      ),
    },
    {
      title: 'ברקוד',
      dataIndex: 'barcode',
      key: 'barcode',
      render: (b: string | null) => (b ? <code>{b}</code> : '-'),
    },
    {
      title: 'מיקום נוכחי',
      dataIndex: 'locationLabel',
      key: 'locationLabel',
      render: (value: string, row: SharedEquipmentCurrentRow) => (
        <div className="flex flex-col">
          <Tag color={row.locationType === 'warehouse' ? 'blue' : row.locationType === 'staff' ? 'orange' : 'purple'}>
            {row.locationType === 'warehouse' ? 'במחסן' : row.locationType === 'staff' ? 'איש צוות' : 'אירוע'}
          </Tag>
          <span className="text-xs text-slate-500">{value}</span>
          {row.locationDetail && (
            <span className="text-xs text-slate-500">📍 {row.locationDetail}</span>
          )}
        </div>
      ),
    },
    {
      title: 'כמות',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 72,
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => (
        <Tag color={STATUS_COLOR[s] || 'default'}>{STATUS_LABEL[s] || s}</Tag>
      ),
    },
    {
      title: 'הוקצה',
      dataIndex: 'assignedAt',
      key: 'assignedAt',
      render: (v: string | null) => formatDateTime(v),
    },
    {
      title: 'הוקצה ע"י',
      dataIndex: 'assignedByName',
      key: 'assignedByName',
      render: (v: string | null) => v || '-',
    },
  ];

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <div className="flex flex-wrap items-center gap-2 justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-col">
          <span className="text-sm text-slate-500">מעקב</span>
          <span className="font-semibold text-slate-800">ציוד הנדסה שיתופי</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Segmented
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
            options={[
              { label: 'פעיל בלבד', value: 'active' },
              { label: 'הכל', value: 'all' },
            ]}
          />
          <WarehouseExportButtons
            buildReport={buildReport}
            disabled={loading || !data?.mcrSharedEngineeringEquipment}
          />
          <Tooltip title="רענון">
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50"
            >
              <ReloadOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="טעינת רשימת הציוד נכשלה"
          description={error.message}
        />
      )}

      {loading && !data ? (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : (
        <>
          {status === 'all' && (
            <Card
              title={
                <span className="flex items-center gap-2">
                  ציוד הנדסה שיתופי - הכל
                  <Typography.Text type="secondary" className="!text-sm">
                    ({currentRows.length})
                  </Typography.Text>
                </span>
              }
              size="small"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2 justify-between">
                <Segmented
                  value={currentStateFilter}
                  onChange={(v) => setCurrentStateFilter(v as CurrentStateFilter)}
                  options={[
                    { label: 'הכל', value: 'all' },
                    { label: 'במחסן', value: 'warehouse' },
                    { label: 'באירועים', value: 'event' },
                    { label: 'אנשי צוות', value: 'staff' },
                  ]}
                />
                <Input.Search
                  allowClear
                  placeholder="חיפוש לפי שם, ברקוד, קטגוריה או מיקום"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{ maxWidth: 360 }}
                />
              </div>
              <Table<SharedEquipmentCurrentRow>
                dataSource={currentRows}
                columns={currentColumns}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                rowKey={(r) => r.key}
                size="small"
              />
            </Card>
          )}

          {status !== 'all' && (
            <>
          <Card
            title={
              <span className="flex items-center gap-2">
                <VideoCameraOutlined />
                ציוד שמוקצה לאירועים
                <Typography.Text type="secondary" className="!text-sm">
                  ({eventGroups.reduce((n, g) => n + g.items.length, 0)})
                </Typography.Text>
              </span>
            }
            size="small"
          >
            {eventGroups.length === 0 ? (
              <Empty description="אין ציוד הנדסה שיתופי שמוקצה לאירועים" />
            ) : (
              <div className="flex flex-col gap-3">
                {eventGroups.map((group) => (
                  <div
                    key={group.key}
                    className="rounded-md border border-slate-200 bg-slate-50/40 p-2"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                      <div className="flex flex-col">
                        <strong className="text-slate-800">{group.title}</strong>
                        {group.subtitle && (
                          <span className="text-xs text-slate-500">{group.subtitle}</span>
                        )}
                      </div>
                      <Tag color="purple">{group.items.length} פריטים</Tag>
                    </div>
                    <Table<MCRSharedEngineeringEventAssignment>
                      dataSource={group.items}
                      columns={eventColumns}
                      pagination={false}
                      rowKey={(r) => r.assignmentId}
                      size="small"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                <UserOutlined />
                ציוד שמוקצה לאנשי צוות
                <Typography.Text type="secondary" className="!text-sm">
                  ({staffGroups.reduce((n, g) => n + g.items.length, 0)})
                </Typography.Text>
              </span>
            }
            size="small"
          >
            {staffGroups.length === 0 ? (
              <Empty description="אין ציוד הנדסה שיתופי שמוקצה לאנשי צוות" />
            ) : (
              <div className="flex flex-col gap-3">
                {staffGroups.map((group) => (
                  <div
                    key={group.key}
                    className="rounded-md border border-slate-200 bg-slate-50/40 p-2"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                      <div className="flex flex-col">
                        <strong className="text-slate-800">{group.title}</strong>
                        {group.subtitle && (
                          <span className="text-xs text-slate-500">{group.subtitle}</span>
                        )}
                      </div>
                      <Tag color="purple">{group.items.length} פריטים</Tag>
                    </div>
                    <Table<MCRSharedEngineeringStaffAssignment>
                      dataSource={group.items}
                      columns={staffColumns}
                      pagination={false}
                      rowKey={(r) => r.assignmentId}
                      size="small"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default SharedEngineeringEquipmentArea;
