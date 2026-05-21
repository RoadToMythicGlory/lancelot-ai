'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Card, Segmented, List, Tag, Badge, Space, Empty, Alert, Spin, Input, Button, Tooltip } from 'antd';
import {
  EnvironmentOutlined,
  WifiOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  SettingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery, useSubscription } from '@apollo/client';
import { GET_TRACKER_SITES, GET_TRACKER_TAGS, GET_TRACKER_LATEST_POSITIONS, TRACKER_POSITION_UPDATED } from '../../../graphql/queries';
import dynamic from 'next/dynamic';
import FieldMap from './FieldMap';
import TrackerSiteAdmin from './TrackerSiteAdmin';
import WarehouseExportButtons from '../WarehouseExportButtons';
import type { ExportColumn, ExportReport } from '@/utils/warehouseReportExport';

// react-konva requires browser-only APIs — load FloorPlanMap with SSR disabled
const FloorPlanMap = dynamic(() => import('./FloorPlanMap'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center" style={{ height: 400 }}>טוען מפת קומה...</div>,
});
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface TrackerPosition {
  tagId: string;
  bleAddress?: string;
  equipmentId?: string;
  label?: string;
  battery?: number;
  kind: 'indoor' | 'outdoor' | 'stale';
  siteId?: string;
  gatewayId: string;
  gatewayName?: string;
  zoneName?: string;
  x?: number;
  y?: number;
  lat?: number;
  lng?: number;
  rssi: number;
  confidence: number;
  computedAt: string;
}

interface TrackerTagItem {
  id: string;
  bleAddress: string;
  equipmentId?: string;
  equipmentName?: string;
  label: string;
  status: string;
  lastBattery?: number;
  lastTemperature?: number;
  lastSeenAt?: string;
  latestPosition?: TrackerPosition;
}

const EquipmentLiveTracking: React.FC = () => {
  const [viewMode, setViewMode] = useState<'warehouse' | 'field' | 'admin'>('warehouse');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const { data: sitesData, loading: sitesLoading } = useQuery(GET_TRACKER_SITES);
  const sites = sitesData?.trackerSites || [];
  const activeSiteId = selectedSiteId || sites[0]?.id || null;

  const { data: tagsData, loading: tagsLoading, refetch: refetchTags } = useQuery(GET_TRACKER_TAGS, {
    variables: { siteId: viewMode === 'warehouse' ? activeSiteId : undefined },
    skip: viewMode === 'admin',
  });
  const tags: TrackerTagItem[] = tagsData?.trackerTags || [];

  const { data: positionsData } = useQuery(GET_TRACKER_LATEST_POSITIONS, {
    variables: { siteId: viewMode === 'warehouse' ? activeSiteId : undefined },
    skip: viewMode === 'admin',
    pollInterval: 15000,
  });
  const positions: TrackerPosition[] = positionsData?.trackerLatestPositions || [];

  // Live subscription
  const [livePositions, setLivePositions] = useState<Map<string, TrackerPosition>>(new Map());

  useSubscription(TRACKER_POSITION_UPDATED, {
    variables: { siteId: viewMode === 'warehouse' ? activeSiteId : undefined },
    skip: viewMode === 'admin',
    onData: ({ data: subData }) => {
      const pos = subData?.data?.trackerPositionUpdated;
      if (pos) {
        setLivePositions(prev => {
          const next = new Map(prev);
          next.set(pos.tagId, pos);
          return next;
        });
      }
    },
  });

  // Merge polled positions with live overrides
  const mergedPositions = useMemo(() => {
    const map = new Map<string, TrackerPosition>();
    for (const pos of positions) {
      map.set(pos.tagId, pos);
    }
    for (const [tagId, pos] of livePositions) {
      map.set(tagId, pos);
    }
    return Array.from(map.values());
  }, [positions, livePositions]);

  const indoorPositions = useMemo(
    () => mergedPositions.filter(p => p.kind === 'indoor'),
    [mergedPositions],
  );
  const outdoorPositions = useMemo(
    () => mergedPositions.filter(p => p.kind === 'outdoor'),
    [mergedPositions],
  );

  const filteredTags = useMemo(() => {
    if (!searchText) return tags;
    const q = searchText.toLowerCase();
    return tags.filter(t =>
      t.label.toLowerCase().includes(q) ||
      t.bleAddress.toLowerCase().includes(q) ||
      t.equipmentName?.toLowerCase().includes(q),
    );
  }, [tags, searchText]);

  const handleTagSelect = useCallback((tagId: string) => {
    setSelectedTagId(prev => prev === tagId ? null : tagId);
  }, []);

  const activeSite = sites.find((s: any) => s.id === activeSiteId);

  /** Build the live-tracking report. Mirrors what the user sees in the
   *  current view: the filtered tag sidebar, plus a positions table
   *  split into indoor/outdoor sections. The "פעיל/חודר/בשטח" status
   *  classification matches the badge logic in the sidebar so the export
   *  is a faithful snapshot of the screen. */
  const buildReport = (): ExportReport | null => {
    if (filteredTags.length === 0 && mergedPositions.length === 0) return null;

    const isStale = (lastSeenAt?: string) => {
      if (!lastSeenAt) return true;
      return dayjs().diff(dayjs(lastSeenAt), 'minute') > 5;
    };

    const tagCols: ExportColumn<TrackerTagItem>[] = [
      {
        key: 'name',
        label: 'תגית',
        emphasis: true,
        value: (r) => r.equipmentName || r.label,
      },
      { key: 'ble', label: 'BLE', code: true, value: (r) => r.bleAddress },
      {
        key: 'status',
        label: 'מצב',
        value: (r) => {
          const stale = isStale(r.lastSeenAt);
          if (stale) return 'לא עדכני';
          const pos = r.latestPosition || mergedPositions.find((p) => p.tagId === r.id);
          if (!pos) return 'ללא מיקום';
          return pos.kind === 'indoor' ? 'במחסן' : pos.kind === 'outdoor' ? 'בשטח' : 'לא עדכני';
        },
        status: (r) => {
          const stale = isStale(r.lastSeenAt);
          if (stale) return { label: 'לא עדכני', variant: 'neutral' };
          const pos = r.latestPosition || mergedPositions.find((p) => p.tagId === r.id);
          if (!pos) return { label: 'ללא מיקום', variant: 'neutral' };
          return pos.kind === 'indoor'
            ? { label: 'במחסן', variant: 'active' }
            : pos.kind === 'outdoor'
              ? { label: 'בשטח', variant: 'warn' }
              : { label: 'לא עדכני', variant: 'neutral' };
        },
      },
      {
        key: 'zone',
        label: 'אזור',
        value: (r) => {
          const pos = r.latestPosition || mergedPositions.find((p) => p.tagId === r.id);
          return pos?.zoneName || '';
        },
      },
      {
        key: 'battery',
        label: 'סוללה',
        numeric: true,
        value: (r) => (r.lastBattery != null ? `${r.lastBattery}%` : ''),
      },
      {
        key: 'temperature',
        label: 'טמפ׳',
        numeric: true,
        value: (r) => (r.lastTemperature != null ? `${r.lastTemperature}°C` : ''),
      },
      {
        key: 'lastSeen',
        label: 'נראה לאחרונה',
        value: (r) =>
          r.lastSeenAt && dayjs(r.lastSeenAt).isValid()
            ? dayjs(r.lastSeenAt).format('DD/MM/YYYY HH:mm')
            : '',
      },
    ];

    const positionCols: ExportColumn<TrackerPosition>[] = [
      { key: 'label', label: 'תגית', value: (r) => r.label || r.tagId },
      { key: 'tagId', label: 'מזהה תגית', code: true, value: (r) => r.tagId },
      {
        key: 'kind',
        label: 'סוג',
        value: (r) =>
          r.kind === 'indoor' ? 'פנים' : r.kind === 'outdoor' ? 'חוץ' : 'לא עדכני',
        status: (r) =>
          r.kind === 'indoor'
            ? { label: 'פנים', variant: 'active' }
            : r.kind === 'outdoor'
              ? { label: 'חוץ', variant: 'warn' }
              : { label: 'לא עדכני', variant: 'neutral' },
      },
      { key: 'zone', label: 'אזור', value: (r) => r.zoneName || '' },
      { key: 'gateway', label: 'גייטוויי', value: (r) => r.gatewayName || r.gatewayId },
      {
        key: 'coords',
        label: 'קואורדינטות',
        value: (r) =>
          r.lat != null && r.lng != null
            ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`
            : r.x != null && r.y != null
              ? `(${r.x.toFixed(2)}, ${r.y.toFixed(2)})`
              : '',
      },
      {
        key: 'rssi',
        label: 'RSSI',
        numeric: true,
        value: (r) => (r.rssi != null ? r.rssi : ''),
      },
      {
        key: 'confidence',
        label: 'ביטחון',
        numeric: true,
        value: (r) => (r.confidence != null ? `${Math.round(r.confidence * 100)}%` : ''),
      },
      {
        key: 'computedAt',
        label: 'עודכן',
        value: (r) =>
          r.computedAt && dayjs(r.computedAt).isValid()
            ? dayjs(r.computedAt).format('DD/MM/YYYY HH:mm:ss')
            : '',
      },
    ];

    const chips: string[] = [
      viewMode === 'warehouse' ? 'תצוגה: מחסן' : 'תצוגה: בשטח',
    ];
    if (viewMode === 'warehouse' && activeSite) chips.push(`אתר: ${activeSite.name}`);
    if (searchText.trim()) chips.push(`חיפוש: ${searchText.trim()}`);

    return {
      title: 'דוח מעקב חי',
      subtitle: 'מצב התגיות והמיקומים האחרונים שהוצגו במסך המעקב.',
      filenameStem: 'מחסן-מעקב-חי',
      origin: 'מחסן · מעקב חי',
      metaChips: chips,
      summary: [
        { label: 'תגיות מסוננות', value: filteredTags.length, accent: 'tracking' },
        { label: 'במחסן', value: indoorPositions.length, accent: 'warehouse' },
        { label: 'בשטח', value: outdoorPositions.length, accent: 'staff' },
      ],
      sections: [
        {
          kind: 'table',
          key: 'tags',
          title: 'תגיות',
          accent: 'tracking',
          meta: `${filteredTags.length} תגיות`,
          columns: tagCols,
          rows: filteredTags,
          emptyText: 'אין תגיות תואמות',
        },
        {
          kind: 'table',
          key: 'indoor',
          title: 'מיקומי פנים',
          accent: 'warehouse',
          meta: `${indoorPositions.length} שורות`,
          columns: positionCols,
          rows: indoorPositions,
          emptyText: 'אין מיקומי פנים',
        },
        {
          kind: 'table',
          key: 'outdoor',
          title: 'מיקומי שטח',
          accent: 'staff',
          meta: `${outdoorPositions.length} שורות`,
          columns: positionCols,
          rows: outdoorPositions,
          emptyText: 'אין מיקומי שטח',
        },
      ],
    };
  };

  if (viewMode === 'admin') {
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as any)}
            options={[
              { label: 'מחסן', value: 'warehouse', icon: <EnvironmentOutlined /> },
              { label: 'בשטח', value: 'field', icon: <WifiOutlined /> },
              { label: 'ניהול', value: 'admin', icon: <SettingOutlined /> },
            ]}
          />
        </div>
        <TrackerSiteAdmin />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Segmented
          value={viewMode}
          onChange={(val) => setViewMode(val as any)}
          options={[
            { label: 'מחסן', value: 'warehouse', icon: <EnvironmentOutlined /> },
            { label: 'בשטח', value: 'field', icon: <WifiOutlined /> },
            { label: 'ניהול', value: 'admin', icon: <SettingOutlined /> },
          ]}
        />
        <Space>
          <Tag color="blue">{mergedPositions.length} תגיות פעילות</Tag>
          <Tag color="green">{indoorPositions.length} במחסן</Tag>
          <Tag color="orange">{outdoorPositions.length} בשטח</Tag>
          <WarehouseExportButtons
            buildReport={buildReport}
            disabled={tagsLoading || (filteredTags.length === 0 && mergedPositions.length === 0)}
            size="small"
          />
          <Button icon={<ReloadOutlined />} size="small" onClick={() => refetchTags()}>
            רענן
          </Button>
        </Space>
      </div>

      {(sitesLoading || tagsLoading) && (
        <div className="text-center py-8"><Spin size="large" /></div>
      )}

      {!sitesLoading && !tagsLoading && tags.length === 0 && (
        <Alert
          message="אין תגיות BLE רשומות"
          description="כדי להתחיל, יש לרשום תגיות BLE (Minew E8) ולקשר אותן לפריטי ציוד. ניתן לעשות זאת דרך לשונית הניהול או מתוך פרטי הציוד."
          type="info"
          showIcon
          className="mb-4"
        />
      )}

      <div className="flex gap-4" style={{ minHeight: 500 }}>
        {/* Sidebar - tag list */}
        <Card
          className="flex-shrink-0"
          style={{ width: 320, maxHeight: 600, overflow: 'auto' }}
          title="תגיות ציוד"
          size="small"
          extra={<Badge count={filteredTags.length} style={{ backgroundColor: '#1890ff' }} />}
        >
          <Input
            placeholder="חיפוש תגית..."
            prefix={<SearchOutlined />}
            size="small"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            className="mb-2"
          />
          {filteredTags.length === 0 ? (
            <Empty description="לא נמצאו תגיות" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <List
              size="small"
              dataSource={filteredTags}
              renderItem={(tag) => {
                const isSelected = selectedTagId === tag.id;
                const pos = tag.latestPosition || mergedPositions.find(p => p.tagId === tag.id);
                const lastSeen = tag.lastSeenAt ? dayjs(tag.lastSeenAt) : null;
                const isStale = lastSeen ? dayjs().diff(lastSeen, 'minute') > 5 : true;

                return (
                  <List.Item
                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    style={{ padding: '6px 8px', borderRight: isSelected ? '3px solid #1890ff' : '3px solid transparent' }}
                    onClick={() => handleTagSelect(tag.id)}
                  >
                    <div className="w-full">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">{tag.equipmentName || tag.label}</span>
                        <Badge
                          status={isStale ? 'default' : pos?.kind === 'indoor' ? 'success' : 'processing'}
                          text=""
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        <Space size={4}>
                          {pos?.zoneName && <Tag color="cyan" style={{ fontSize: 10, padding: '0 4px' }}>{pos.zoneName}</Tag>}
                          {pos?.kind === 'outdoor' && <Tag color="orange" style={{ fontSize: 10, padding: '0 4px' }}>בשטח</Tag>}
                          {tag.lastBattery != null && (
                            <Tooltip title="סוללה">
                              <span>
                                <ThunderboltOutlined style={{ color: tag.lastBattery > 20 ? '#52c41a' : '#ff4d4f' }} />
                                {' '}{tag.lastBattery}%
                              </span>
                            </Tooltip>
                          )}
                        </Space>
                      </div>
                      {lastSeen && (
                        <div className="text-xs text-gray-400 mt-1">
                          נראה לאחרונה: {lastSeen.fromNow()}
                        </div>
                      )}
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </Card>

        {/* Main map view */}
        <Card className="flex-1" styles={{ body: { padding: 0, height: '100%', minHeight: 500 } }}>
          {viewMode === 'warehouse' ? (
            activeSite ? (
              <FloorPlanMap
                site={activeSite}
                positions={indoorPositions}
                selectedTagId={selectedTagId}
                onTagSelect={handleTagSelect}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Empty description="לא הוגדר אתר מחסן. הוסף אתר דרך לשונית הניהול." />
              </div>
            )
          ) : (
            <FieldMap
              positions={outdoorPositions}
              selectedTagId={selectedTagId}
              onTagSelect={handleTagSelect}
            />
          )}
        </Card>
      </div>
    </div>
  );
};

export default EquipmentLiveTracking;
