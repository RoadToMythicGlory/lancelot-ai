'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, List, DatePicker, Button, Space, Tag, Row, Col, Spin, Empty, Typography, Divider, Timeline, Segmented, Modal, Input, App } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  TeamOutlined,
  VideoCameraOutlined,
  LeftOutlined,
  RightOutlined,
  UnorderedListOutlined,
  AppstoreOutlined,
  ImportOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client';
import { GET_BROADCAST_EVENTS } from '../../graphql/queries';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA } from '../../graphql/mutations';
import WarehouseModal from '../broadcast/WarehouseModal';
import WarehouseExportButtons from './WarehouseExportButtons';
import type { ExportColumn, ExportReport } from '@/utils/warehouseReportExport';
import { useAuth } from '@/contexts/AuthContext';
import { Permission } from '@/rbac';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import 'dayjs/locale/he';

dayjs.extend(isBetween);
dayjs.extend(weekOfYear);
dayjs.locale('he');

const { Title, Text } = Typography;

interface BroadcastEvent {
  id: string;
  eventNumber: string;
  title: string;
  hebrewTitle: string;
  description: string;
  eventType: string;
  startTime: string;
  endTime: string;
  koTime: string;
  arrivalTime: string;
  location: string;
  venue: string;
  liveLocation: string;
  channel: string;
  parallelChannel: string;
  channel1_4k: boolean;
  live: boolean;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  production_crew: any;
  equipment_list: any;
}

interface UpcomingEventsProps {
  onEventClick?: (event: BroadcastEvent) => void;
}

// Decide whether an event "belongs" in the warehouse upcoming view. By
// default we only show events the warehouse is actually responsible for —
// i.e. either some equipment was requested or an admin has manually
// imported the event into the warehouse (sets a small flag in
// `metadata.departments.warehouse.manuallyTracked`).
//
// "Requested equipment" can live in three different places depending on
// how the event got to this state:
//   1. `metadata.departments.warehouse.*`        — populated when the
//      warehouse modal saves an assignment/scan (totalRequested,
//      requestedItems, assignedItems).
//   2. `metadata.departments.externalBroadcasts.customData.*` — populated
//      when an admin enters requests from the External Broadcasts page.
//      This includes both the new item-based `equipmentList` and the
//      legacy category-based `equipmentRequests`; the warehouse needs to
//      surface both so requested gear actually shows up here even if
//      nobody has opened the warehouse modal yet.
//   3. `metadata.warehouseData.*`                — legacy fallback for
//      pre-departments events.
function hasArrayWithLength(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasWarehouseInterest(event: any): boolean {
  const departments = event?.metadata?.departments;

  const wh = departments?.warehouse;
  if (wh) {
    if (wh.manuallyTracked === true) return true;
    if ((wh.totalRequested || 0) > 0) return true;
    if (hasArrayWithLength(wh.requestedItems)) return true;
    if (hasArrayWithLength(wh.assignedItems)) return true;
    if (hasArrayWithLength(wh.customData?.requestedItems)) return true;
    if (hasArrayWithLength(wh.customData?.assignedItems)) return true;
    if ((wh.customData?.totalRequested || 0) > 0) return true;
  }

  // External Broadcasts is the primary entry point for "we need equipment
  // for this event". Any non-empty equipmentList (item-based) or
  // equipmentRequests (legacy category-based) means the warehouse is on
  // the hook to fulfill it, so the event must appear in this widget.
  const eb = departments?.externalBroadcasts;
  if (eb) {
    const cd = eb.customData || {};
    if (hasArrayWithLength(cd.equipmentList)) return true;
    if (hasArrayWithLength(cd.equipmentRequests)) return true;
    if (hasArrayWithLength(eb.equipmentList)) return true;
    if (hasArrayWithLength(eb.equipmentRequests)) return true;
  }

  // Legacy fallback (older events stored data directly under metadata.warehouseData)
  const legacy = event?.metadata?.warehouseData;
  if (legacy) {
    if (legacy.manuallyTracked === true) return true;
    if ((legacy.totalRequested || 0) > 0) return true;
    if (hasArrayWithLength(legacy.requestedItems)) return true;
    if (hasArrayWithLength(legacy.assignedItems)) return true;
  }
  return false;
}

const UpcomingEvents: React.FC<UpcomingEventsProps> = ({ onEventClick }) => {
  const { message } = App.useApp();
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [selectedWeek, setSelectedWeek] = useState(dayjs());
  const [selectedEvent, setSelectedEvent] = useState<BroadcastEvent | null>(null);
  const [isWarehouseModalVisible, setIsWarehouseModalVisible] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSearch, setImportSearch] = useState('');
  const { hasPermission } = useAuth();
  const canViewBroadcasts = hasPermission(Permission.BROADCAST_VIEW);
  const canManageWarehouse = hasPermission(Permission.WAREHOUSE_MANAGE);

  // Query for broadcast events. Skipped if the user lacks BROADCAST_VIEW
  // so the resolver doesn't throw an "Missing permission" 500 when this
  // widget is rendered defensively (e.g. embedded on a page they can
  // otherwise see).
  const { data, loading, error, refetch } = useQuery(GET_BROADCAST_EVENTS, {
    variables: {
      startDate: viewMode === 'day' 
        ? selectedDate.startOf('day').toISOString()
        : selectedWeek.startOf('week').toISOString(),
      endDate: viewMode === 'day'
        ? selectedDate.endOf('day').toISOString()
        : selectedWeek.endOf('week').toISOString()
    },
    skip: !canViewBroadcasts,
  });

  const allEvents: BroadcastEvent[] = data?.broadcastEvents || [];
  // Warehouse view: only events that have requested equipment or were
  // explicitly imported by an admin (see "ייבוא אירוע מהתכנונית" button).
  const events: BroadcastEvent[] = useMemo(
    () => allEvents.filter((e) => hasWarehouseInterest(e)),
    [allEvents],
  );

  const importCandidates = useMemo(() => {
    const term = importSearch.trim().toLowerCase();
    return allEvents
      .filter((e) => !hasWarehouseInterest(e))
      .filter((e) => {
        if (!term) return true;
        const title = `${(e as any).hebrewTitle || ''} ${e.title || ''}`.toLowerCase();
        return title.includes(term);
      })
      .slice(0, 50);
  }, [allEvents, importSearch]);

  const [importEvent, { loading: importing }] = useMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, {
    onCompleted: () => {
      message.success('האירוע נוסף לרשימת המחסן');
      refetch();
    },
    onError: (err) => {
      message.error(err.message || 'הוספת האירוע נכשלה');
    },
  });

  const handleImportEvent = async (event: BroadcastEvent) => {
    const existingWh = (event as any).metadata?.departments?.warehouse || {};
    await importEvent({
      variables: {
        eventId: event.id,
        department: 'warehouse',
        data: {
          customData: {
            ...existingWh,
            manuallyTracked: true,
            manuallyTrackedAt: new Date().toISOString(),
          },
        },
      },
    });
  };

  const handleEventClick = (event: BroadcastEvent) => {
    setSelectedEvent(event);
    setIsWarehouseModalVisible(true);
    onEventClick?.(event);
  };

  const handleWarehouseModalClose = () => {
    setIsWarehouseModalVisible(false);
    setSelectedEvent(null);
  };

  const handleDataSaved = () => {
    // Refetch events to update the display
    refetch();
  };

  // Group events by day for week view
  const groupEventsByDay = (events: BroadcastEvent[]) => {
    const grouped: { [key: string]: BroadcastEvent[] } = {};
    
    events.forEach(event => {
      const eventDate = dayjs(event.startTime).format('YYYY-MM-DD');
      if (!grouped[eventDate]) {
        grouped[eventDate] = [];
      }
      grouped[eventDate].push(event);
    });

    // Sort events within each day by start time
    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a, b) => 
        dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf()
      );
    });

    return grouped;
  };

  const handlePreviousDay = () => {
    setSelectedDate(selectedDate.subtract(1, 'day'));
  };

  const handleNextDay = () => {
    setSelectedDate(selectedDate.add(1, 'day'));
  };

  const handlePreviousWeek = () => {
    setSelectedWeek(selectedWeek.subtract(1, 'week'));
  };

  const handleNextWeek = () => {
    setSelectedWeek(selectedWeek.add(1, 'week'));
  };

  const handleToday = () => {
    setSelectedDate(dayjs());
    setSelectedWeek(dayjs());
  };

  const getEventTypeColor = (eventType: string) => {
    const typeColors: { [key: string]: string } = {
      'live': '#f50',
      'recorded': '#2db7f5',
      'news': '#87d068',
      'sport': '#108ee9',
      'entertainment': '#fa8c16',
      'documentary': '#722ed1'
    };
    return typeColors[eventType?.toLowerCase()] || '#1890ff';
  };

  const getChannelColor = (channel: string) => {
    const channelColors: { [key: string]: string } = {
      'sport1': '#ff4d4f',
      'sport2': '#fa541c',
      'sport3': '#fa8c16',
      'sport4': '#faad14',
      'channel1': '#fadb14',
      'channel1+': '#a0d911',
      'channel1_4k': '#52c41a',
      'channel11': '#13c2c2',
      'channel12': '#1890ff',
      'channel13': '#2f54eb',
      'channel14': '#722ed1'
    };
    return channelColors[channel?.toLowerCase()] || '#595959';
  };

  const renderEventCard = (event: BroadcastEvent) => (
    <Card
      key={event.id}
      className="mb-4 hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => handleEventClick(event)}
      variant="borderless"
    >
      <Row gutter={16} align="middle">
        <Col span={4}>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-600">
              {dayjs(event.startTime).format('HH:mm')}
            </div>
            <div className="text-sm text-gray-500">
              {dayjs(event.endTime).format('HH:mm')}
            </div>
          </div>
        </Col>
        <Col span={16}>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag color={getChannelColor(event.channel)}>
                {event.channel}
              </Tag>
              {event.parallelChannel && (
                <Tag color={getChannelColor(event.parallelChannel)}>
                  {event.parallelChannel}
                </Tag>
              )}
              {event.channel1_4k && (
                <Tag color="gold">4K</Tag>
              )}
              {event.live && (
                <Tag color="red" icon={<VideoCameraOutlined />}>
                  שידור חי
                </Tag>
              )}
              <Tag color={getEventTypeColor(event.eventType)}>
                {event.eventType}
              </Tag>
            </div>
            <Title level={5} className="mb-1">
              {event.hebrewTitle || event.title}
            </Title>
            {event.sport && event.homeTeam && event.awayTeam && (
              <div className="text-sm text-gray-600 mb-1">
                <TeamOutlined className="mr-1" />
                {event.homeTeam} - {event.awayTeam}
              </div>
            )}
            {event.location && (
              <div className="text-sm text-gray-600">
                <EnvironmentOutlined className="mr-1" />
                {event.location}
                {event.venue && ` - ${event.venue}`}
              </div>
            )}
          </div>
        </Col>
        <Col span={4} className="text-left">
          <div className="text-lg font-bold text-blue-600">
            #{event.eventNumber}
          </div>
        </Col>
      </Row>
    </Card>
  );

  const renderDayView = () => (
    <div>
      <div className="flex justify-between items-center mb-6">
        <Button 
          icon={<LeftOutlined />} 
          onClick={handlePreviousDay}
        >
          יום קודם
        </Button>
        
        <Space size="large">
          <DatePicker
            value={selectedDate}
            onChange={(date) => date && setSelectedDate(date)}
            format="DD/MM/YYYY"
            allowClear={false}
          />
          <Title level={4} className="mb-0">
            {selectedDate.format('dddd, DD בMMMM YYYY')}
          </Title>
        </Space>

        <Button 
          onClick={handleNextDay}
          iconPosition="end"
          icon={<RightOutlined />}
        >
          יום הבא
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <Spin size="large" />
        </div>
      ) : events.length === 0 ? (
        <Empty 
          description="אין אירועים מתוכננים ליום זה"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <div>
          {events.map(event => renderEventCard(event))}
        </div>
      )}
    </div>
  );

  const renderWeekView = () => {
    const groupedEvents = groupEventsByDay(events);
    const weekStart = selectedWeek.startOf('week');
    const weekDays = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));

    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <Button 
            icon={<LeftOutlined />} 
            onClick={handlePreviousWeek}
          >
            שבוע קודם
          </Button>
          
          <Space size="large">
            <DatePicker.WeekPicker
              value={selectedWeek}
              onChange={(date) => date && setSelectedWeek(date)}
              format="שבוע WW, YYYY"
              allowClear={false}
            />
            <Title level={4} className="mb-0">
              {weekStart.format('DD/MM')} - {weekStart.add(6, 'day').format('DD/MM/YYYY')}
            </Title>
          </Space>

          <Button 
            onClick={handleNextWeek}
            iconPosition="end"
            icon={<RightOutlined />}
          >
            שבוע הבא
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <Spin size="large" />
          </div>
        ) : (
          <div className="space-y-6">
            {weekDays.map(day => {
              const dayKey = day.format('YYYY-MM-DD');
              const dayEvents = groupedEvents[dayKey] || [];
              const isToday = day.isSame(dayjs(), 'day');

              return (
                <Card 
                  key={dayKey}
                  title={
                    <div className={`text-lg ${isToday ? 'font-bold text-blue-600' : ''}`}>
                      {day.format('dddd, DD בMMMM')}
                      {isToday && <Tag color="blue" className="mr-2">היום</Tag>}
                    </div>
                  }
                  className={isToday ? 'border-blue-400' : ''}
                >
                  {dayEvents.length === 0 ? (
                    <Empty 
                      description="אין אירועים"
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      className="py-4"
                    />
                  ) : (
                    <Timeline mode="left">
                      {dayEvents.map(event => (
                        <Timeline.Item
                          key={event.id}
                          label={dayjs(event.startTime).format('HH:mm')}
                          color={event.live ? 'red' : 'blue'}
                        >
                          <Card
                            size="small"
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => handleEventClick(event)}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Tag color={getChannelColor(event.channel)} className="text-xs">
                                    {event.channel}
                                  </Tag>
                                  {event.live && (
                                    <Tag color="red" icon={<VideoCameraOutlined />} className="text-xs">
                                      חי
                                    </Tag>
                                  )}
                                </div>
                                <Text strong>{event.hebrewTitle || event.title}</Text>
                                {event.sport && event.homeTeam && event.awayTeam && (
                                  <div className="text-xs text-gray-600 mt-1">
                                    {event.homeTeam} - {event.awayTeam}
                                  </div>
                                )}
                              </div>
                              <div className="text-sm font-semibold text-gray-600">
                                #{event.eventNumber}
                              </div>
                            </div>
                          </Card>
                        </Timeline.Item>
                      ))}
                    </Timeline>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const buildReport = (): ExportReport | null => {
    if (events.length === 0) return null;

    const cols: ExportColumn<BroadcastEvent>[] = [
      { key: 'eventNumber', label: 'מס׳ אירוע', code: true, value: (r) => r.eventNumber || '' },
      {
        key: 'title',
        label: 'אירוע',
        emphasis: true,
        value: (r) => r.hebrewTitle || r.title || '',
      },
      { key: 'channel', label: 'ערוץ', value: (r) => r.channel || '' },
      { key: 'parallel', label: 'ערוץ מקביל', value: (r) => r.parallelChannel || '' },
      {
        key: 'startTime',
        label: 'התחלה',
        value: (r) =>
          r.startTime && dayjs(r.startTime).isValid()
            ? dayjs(r.startTime).format('DD/MM/YYYY HH:mm')
            : '',
      },
      {
        key: 'endTime',
        label: 'סיום',
        value: (r) =>
          r.endTime && dayjs(r.endTime).isValid() ? dayjs(r.endTime).format('HH:mm') : '',
      },
      { key: 'location', label: 'מיקום', value: (r) => r.location || '' },
      { key: 'venue', label: 'מתחם', value: (r) => r.venue || '' },
      {
        key: 'teams',
        label: 'קבוצות',
        value: (r) =>
          r.homeTeam && r.awayTeam ? `${r.homeTeam} – ${r.awayTeam}` : r.sport || '',
      },
      { key: 'eventType', label: 'סוג', value: (r) => r.eventType || '' },
      {
        key: 'flags',
        label: 'דגלים',
        value: (r) =>
          [r.live ? 'שידור חי' : '', r.channel1_4k ? '4K' : '']
            .filter(Boolean)
            .join(' · '),
      },
    ];

    const rangeChip =
      viewMode === 'day'
        ? `יום: ${selectedDate.format('DD/MM/YYYY')}`
        : `שבוע: ${selectedWeek.startOf('week').format('DD/MM/YYYY')} – ${selectedWeek.endOf('week').format('DD/MM/YYYY')}`;

    const liveCount = events.filter((e) => e.live).length;

    return {
      title: 'דוח אירועים קרובים',
      subtitle: 'אירועי שידור שלמחסן יש בהם עניין (בוקש להם ציוד או יובאו ידנית).',
      filenameStem: 'מחסן-אירועים',
      origin: 'מחסן · אירועים קרובים',
      metaChips: [rangeChip, viewMode === 'day' ? 'תצוגה יומית' : 'תצוגה שבועית'],
      summary: [
        { label: 'סה״כ אירועים', value: events.length, accent: 'events' },
        { label: 'שידורים חיים', value: liveCount, accent: 'requests' },
      ],
      sections: [
        {
          kind: 'table',
          key: 'events',
          title: 'אירועים',
          accent: 'events',
          meta: `${events.length} אירועים`,
          columns: cols,
          rows: [...events].sort(
            (a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf(),
          ),
        },
      ],
    };
  };

  return (
    <div className="p-4">
      <div className="mb-6 flex justify-between items-center">
        <Title level={3} className="mb-0">
          <CalendarOutlined className="ml-2" />
          אירועים קרובים
        </Title>
        <Space>
          <WarehouseExportButtons
            buildReport={buildReport}
            disabled={loading || events.length === 0}
          />
          {canManageWarehouse && (
            <Button
              icon={<ImportOutlined />}
              onClick={() => {
                setImportSearch('');
                setImportModalOpen(true);
              }}
            >
              ייבוא אירוע מהתכנונית
            </Button>
          )}
          <Button type="primary" onClick={handleToday}>
            היום
          </Button>
          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(value as 'day' | 'week')}
            options={[
              {
                label: 'תצוגה יומית',
                value: 'day',
                icon: <UnorderedListOutlined />
              },
              {
                label: 'תצוגה שבועית',
                value: 'week',
                icon: <AppstoreOutlined />
              }
            ]}
          />
        </Space>
      </div>

      <Divider />

      {error && (
        <div className="text-center py-8 text-red-500">
          שגיאה בטעינת האירועים
        </div>
      )}

      {viewMode === 'day' ? renderDayView() : renderWeekView()}

      {/* Warehouse Modal */}
      {selectedEvent && (
        <WarehouseModal
          visible={isWarehouseModalVisible}
          event={selectedEvent}
          onClose={handleWarehouseModalClose}
          onDataSaved={handleDataSaved}
        />
      )}

      {/* Import-from-planner modal: lets a warehouse admin pull any
          planner event into the warehouse view even if no equipment was
          requested for it yet. */}
      <Modal
        open={importModalOpen}
        title="ייבוא אירוע מהתכנונית"
        onCancel={() => setImportModalOpen(false)}
        footer={null}
        width={640}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input.Search
            placeholder="חיפוש לפי שם אירוע"
            allowClear
            value={importSearch}
            onChange={(e) => setImportSearch(e.target.value)}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            הרשימה מציגה אירועים מהתכנונית בטווח התאריכים הנוכחי שאינם מופיעים עדיין במחסן (לא בוקש להם ציוד).
          </Text>
          {importCandidates.length === 0 ? (
            <Empty description="אין אירועים נוספים זמינים לייבוא בטווח התאריכים שנבחר" />
          ) : (
            <List
              size="small"
              bordered
              dataSource={importCandidates}
              renderItem={(ev) => (
                <List.Item
                  actions={[
                    <Button
                      key="import"
                      type="link"
                      icon={<ImportOutlined />}
                      loading={importing}
                      onClick={() => handleImportEvent(ev)}
                    >
                      ייבא
                    </Button>,
                  ]}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      {(ev as any).hebrewTitle || ev.title}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(ev.startTime).format('DD/MM/YYYY HH:mm')} • {ev.channel || '—'}
                    </Text>
                  </div>
                </List.Item>
              )}
            />
          )}
        </Space>
      </Modal>
    </div>
  );
};

export default UpcomingEvents;

