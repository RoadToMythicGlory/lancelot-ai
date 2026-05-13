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
