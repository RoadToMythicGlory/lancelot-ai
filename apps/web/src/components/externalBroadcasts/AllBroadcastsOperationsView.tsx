'use client';

/**
 * Embedded "All Broadcasts" operations view.
 *
 * Was previously a standalone `/external-broadcasts/operations` page;
 * folded into the main External Broadcasts page as a tab so the app
 * isn't split between two routes. The component is self-contained and
 * uses the shared GraphQL queries / mutations + the External Broadcasts
 * domain helpers — no planning fields are touched.
 *
 * Sub-tabs:
 *   - "לוח שידורים"        — daily / weekly / monthly calendar with
 *                            drag-reorder for the day view.
 *   - "חיפוש שיבוצי עובדים" — read-only worker search.
 *   - "דוחות"               — reports (CSV-exportable).
 *   - "נתוני עזר"           — reference data (control rooms, vehicles,
 *                            trailers, broadcast types). Admin-only.
 */
import React, { useMemo, useState } from 'react';
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Input,
  Radio,
  Row,
  Segmented,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  BarChartOutlined,
  CalendarOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import { GET_BROADCAST_EVENTS } from '@/graphql/queries';
import { REORDER_EXTERNAL_BROADCAST_EVENTS } from '@/graphql/mutations';
import { WorkerAssignmentSearch } from './WorkerAssignmentSearch';
import { ExternalBroadcastReports } from './ExternalBroadcastReports';
import { ReferenceDataSettings } from './ReferenceDataSettings';
import { ExternalBroadcastDeviceConfig } from './ExternalBroadcastDeviceConfig';
import {
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_STATUS_TAG_COLOR,
  compareForOperationsOrder,
  getAssignmentStatus,
  getAssignmentStatusRowBackground,
  getExternalBroadcastCompletionStatus,
  isImportedIntoExternalBroadcasts,
  readExternalBroadcastData,
  COMPLETION_STATUS_COLORS,
  COMPLETION_STATUS_LABEL,
} from '@/utils/externalBroadcastDomain';

dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Jerusalem');

const { Text } = Typography;

type ViewMode = 'day' | 'week' | 'month';

interface EventRow {
  id: string;
  startTime: string;
  endTime?: string;
  title?: string;
  homeTeam?: string;
  awayTeam?: string;
  channel?: string;
  league?: string;
  stage?: string;
  metadata?: any;
}

function getEventDateKey(ev: EventRow): string {
  return dayjs(ev.startTime).format('YYYY-MM-DD');
}

function groupEventsByDate(events: EventRow[]): Record<string, EventRow[]> {
  const grouped: Record<string, EventRow[]> = {};
  for (const ev of events) {
    const key = getEventDateKey(ev);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ev);
  }
  for (const key of Object.keys(grouped)) {
    grouped[key].sort(compareForOperationsOrder);
  }
  return grouped;
}

// ─── Day View ───────────────────────────────────────────────────────────────

const DayView: React.FC<{
  date: Dayjs;
  events: EventRow[];
  search: string;
  onOpenEvent: (eventId: string) => void;
  onReorder: (date: Dayjs, eventIds: string[]) => Promise<void>;
  canManage: boolean;
}> = ({ date, events, search, onOpenEvent, onReorder, canManage }) => {
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      [e.title, e.homeTeam, e.awayTeam, e.channel, e.league]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [events, search]);

  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const list = orderedIds
    ? orderedIds
        .map((id) => filtered.find((e) => e.id === id))
        .filter((e): e is EventRow => !!e)
    : filtered;

  return (
    <Card
      title={
        <Space>
          <CalendarOutlined />
          <Text strong>{date.format('dddd, DD/MM/YYYY')}</Text>
          <Badge count={list.length} style={{ backgroundColor: '#1890ff' }} />
        </Space>
      }
      style={{ direction: 'rtl' }}
      styles={{ body: { padding: 0 } }}
    >
      {list.length === 0 && (
        <Empty
          description="אין שידורים ליום זה"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: 40 }}
        />
      )}
      {list.map((ev, idx) => {
        const status = getAssignmentStatus(ev);
        const bg = getAssignmentStatusRowBackground(status);
        const completion = getExternalBroadcastCompletionStatus(ev);
        const cd = readExternalBroadcastData(ev);
        return (
          <div
            key={ev.id}
            draggable={canManage}
            onDragStart={(e) => e.dataTransfer.setData('text/plain', ev.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              if (!canManage) return;
              e.preventDefault();
              const draggedId = e.dataTransfer.getData('text/plain');
              if (!draggedId || draggedId === ev.id) return;
              const ids = list.map((x) => x.id);
              const from = ids.indexOf(draggedId);
              const to = ids.indexOf(ev.id);
              if (from < 0 || to < 0) return;
              const next = [...ids];
              next.splice(from, 1);
              next.splice(to, 0, draggedId);
              setOrderedIds(next);
              await onReorder(date, next);
            }}
            style={{
              padding: '14px 16px',
              borderBottom: idx < list.length - 1 ? '1px solid #f0f0f0' : undefined,
              backgroundColor: bg || (idx % 2 === 0 ? '#fafafa' : '#ffffff'),
              cursor: canManage ? 'grab' : 'pointer',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
            onClick={() => onOpenEvent(ev.id)}
          >
            <div style={{ minWidth: 70 }}>
              <Text strong style={{ fontSize: 18 }}>
                {dayjs(ev.startTime).format('HH:mm')}
              </Text>
            </div>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {ev.homeTeam && ev.awayTeam
                  ? `${ev.homeTeam} נגד ${ev.awayTeam}`
                  : ev.title || 'ללא כותרת'}
              </div>
              {ev.league && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {ev.league}
                  {ev.stage ? ` • ${ev.stage}` : ''}
                </Text>
              )}
            </div>
            {ev.channel && (
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                {ev.channel}
              </Tag>
            )}
            <Tag color={ASSIGNMENT_STATUS_TAG_COLOR[status]}>
              {ASSIGNMENT_STATUS_LABEL[status]}
            </Tag>
            <Tooltip title={COMPLETION_STATUS_LABEL[completion]}>
              <Tag
                style={{
                  backgroundColor: COMPLETION_STATUS_COLORS[completion].bg,
                  color: COMPLETION_STATUS_COLORS[completion].text,
                  borderColor: COMPLETION_STATUS_COLORS[completion].border,
                }}
              >
                {COMPLETION_STATUS_LABEL[completion]}
              </Tag>
            </Tooltip>
            {cd.isDoubleBroadcast && <Tag color="purple">שידור כפול</Tag>}
            {cd.nevionRequest?.unresolved && <Tag color="red">NEVION חסר</Tag>}
            {(cd.controlCheck?.required || cd.offtube?.required) && (
              <Tag color="cyan">בקרה</Tag>
            )}
          </div>
        );
      })}
    </Card>
  );
};

// ─── Week View ──────────────────────────────────────────────────────────────

const WeekView: React.FC<{
  weekStart: Dayjs;
  eventsByDate: Record<string, EventRow[]>;
  onOpenEvent: (eventId: string) => void;
}> = ({ weekStart, eventsByDate, onOpenEvent }) => {
  const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));
  return (
    <Row gutter={[12, 12]} style={{ direction: 'rtl' }}>
      {days.map((d) => {
        const key = d.format('YYYY-MM-DD');
        const events = eventsByDate[key] || [];
        const isToday = d.isSame(dayjs(), 'day');
        return (
          <Col key={key} xs={24} sm={12} md={8} lg={6} xl={3}>
            <Card
              size="small"
              title={
                <Space>
                  <Text strong style={{ color: isToday ? '#1890ff' : undefined }}>
                    {d.format('dddd')}
                  </Text>
                  <Text type="secondary">{d.format('DD/MM')}</Text>
                </Space>
              }
              style={{
                direction: 'rtl',
                height: '100%',
                borderTop: isToday ? '2px solid #1890ff' : undefined,
              }}
              styles={{ body: { padding: 8 } }}
            >
              {events.length === 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  אין שידורים
                </Text>
              )}
              {events.map((ev) => {
                const status = getAssignmentStatus(ev);
                const bg = getAssignmentStatusRowBackground(status);
                return (
                  <div
                    key={ev.id}
                    onClick={() => onOpenEvent(ev.id)}
                    style={{
                      padding: '6px 8px',
                      marginBottom: 6,
                      cursor: 'pointer',
                      borderRadius: 6,
                      backgroundColor: bg || '#f5f5f5',
                      borderRight: `3px solid ${
                        status === 'cancelled'
                          ? '#ef4444'
                          : status === 'postponed'
                          ? '#22c55e'
                          : status === 'paused'
                          ? '#eab308'
                          : '#1890ff'
                      }`,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {dayjs(ev.startTime).format('HH:mm')}{' '}
                      {ev.homeTeam && ev.awayTeam
                        ? `${ev.homeTeam} נגד ${ev.awayTeam}`
                        : ev.title}
                    </div>
                    {ev.channel && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {ev.channel}
                      </Text>
                    )}
                  </div>
                );
              })}
            </Card>
          </Col>
        );
      })}
    </Row>
  );
};

// ─── Month View ─────────────────────────────────────────────────────────────

const MonthView: React.FC<{
  month: Dayjs;
  eventsByDate: Record<string, EventRow[]>;
  onOpenEvent: (eventId: string) => void;
}> = ({ month, eventsByDate, onOpenEvent }) => {
  const start = month.startOf('month').startOf('isoWeek');
  const end = month.endOf('month').endOf('isoWeek');
  const days: Dayjs[] = [];
  let cursor = start;
  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    days.push(cursor);
    cursor = cursor.add(1, 'day');
  }

  return (
    <div style={{ direction: 'rtl' }}>
      <Row gutter={[6, 6]}>
        {['ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳', 'א׳'].map((wd) => (
          <Col key={wd} style={{ flex: '1 1 14.2%', minWidth: 0 }}>
            <Text strong>{wd}</Text>
          </Col>
        ))}
      </Row>
      <Row gutter={[6, 6]} style={{ marginTop: 6 }}>
        {days.map((d) => {
          const key = d.format('YYYY-MM-DD');
          const events = eventsByDate[key] || [];
          const isCurrentMonth = d.month() === month.month();
          const isToday = d.isSame(dayjs(), 'day');
          return (
            <Col key={key} style={{ flex: '1 1 14.2%', minWidth: 0 }}>
              <Card
                size="small"
                style={{
                  minHeight: 96,
                  opacity: isCurrentMonth ? 1 : 0.5,
                  borderTop: isToday ? '2px solid #1890ff' : undefined,
                  direction: 'rtl',
                }}
                styles={{ body: { padding: 6 } }}
                title={
                  <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 500 }}>
                    {d.format('D')}
                  </div>
                }
              >
                {events.slice(0, 3).map((ev) => {
                  const status = getAssignmentStatus(ev);
                  const bg = getAssignmentStatusRowBackground(status) || '#f5f5f5';
                  return (
                    <div
                      key={ev.id}
                      onClick={() => onOpenEvent(ev.id)}
                      style={{
                        fontSize: 10,
                        padding: '2px 4px',
                        marginBottom: 2,
                        backgroundColor: bg,
                        borderRadius: 3,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        cursor: 'pointer',
                      }}
                      title={ev.title || `${ev.homeTeam} נגד ${ev.awayTeam}`}
                    >
                      {dayjs(ev.startTime).format('HH:mm')}{' '}
                      {ev.homeTeam || ev.title?.substring(0, 14) || ''}
                    </div>
                  );
                })}
                {events.length > 3 && (
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    +{events.length - 3} שידורים נוספים
                  </Text>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
};

// ─── View component ─────────────────────────────────────────────────────────

interface AllBroadcastsOperationsViewProps {
  /** When provided, clicking an event will call this instead of the
   * default behaviour of selecting it in the main editor. */
  onOpenEvent?: (eventId: string) => void;
}

export const AllBroadcastsOperationsView: React.FC<AllBroadcastsOperationsViewProps> = ({
  onOpenEvent,
}) => {
  const { message: messageApi } = App.useApp();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(Permission.BROADCAST_MANAGE);

  const [view, setView] = useState<ViewMode>('week');
  const [anchorDate, setAnchorDate] = useState<Dayjs>(dayjs());
  const [search, setSearch] = useState('');
  const [pastFilter, setPastFilter] = useState<'all' | 'past' | 'upcoming'>('all');

  const dateRange = useMemo(() => {
    if (view === 'day') {
      return {
        start: anchorDate.startOf('day').toISOString(),
        end: anchorDate.endOf('day').toISOString(),
        label: anchorDate.format('DD/MM/YYYY'),
      };
    }
    if (view === 'week') {
      return {
        start: anchorDate.startOf('isoWeek').toISOString(),
        end: anchorDate.endOf('isoWeek').toISOString(),
        label: `שבוע ${anchorDate.isoWeek()}, ${anchorDate.format('MMMM YYYY')}`,
      };
    }
    return {
      start: anchorDate.startOf('month').startOf('isoWeek').toISOString(),
      end: anchorDate.endOf('month').endOf('isoWeek').toISOString(),
      label: anchorDate.format('MMMM YYYY'),
    };
  }, [view, anchorDate]);

  const { data, loading, refetch } = useQuery(GET_BROADCAST_EVENTS, {
    variables: { startDate: dateRange.start, endDate: dateRange.end },
    fetchPolicy: 'cache-and-network',
    pollInterval: 30000,
  });

  const [reorder] = useMutation(REORDER_EXTERNAL_BROADCAST_EVENTS);

  const events: EventRow[] = useMemo(() => {
    const list: EventRow[] = data?.broadcastEvents || [];
    const now = dayjs();
    return list
      // External Broadcasts list — only events explicitly imported from
      // planning (or legacy events with saved EB data) are visible.
      .filter(isImportedIntoExternalBroadcasts)
      .filter((e) => {
        if (pastFilter === 'past') return dayjs(e.startTime).isBefore(now);
        if (pastFilter === 'upcoming') return dayjs(e.startTime).isAfter(now);
        return true;
      })
      .filter((e) => {
        const cd = readExternalBroadcastData(e);
        return !cd.excludedFromOperations;
      });
  }, [data, pastFilter]);

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);

  const handlePrev = () => {
    setAnchorDate((d) =>
      view === 'day'
        ? d.subtract(1, 'day')
        : view === 'week'
        ? d.subtract(1, 'week')
        : d.subtract(1, 'month'),
    );
  };
  const handleNext = () => {
    setAnchorDate((d) =>
      view === 'day' ? d.add(1, 'day') : view === 'week' ? d.add(1, 'week') : d.add(1, 'month'),
    );
  };

  const openEvent = (eventId: string) => {
    if (onOpenEvent) {
      onOpenEvent(eventId);
    } else if (typeof window !== 'undefined') {
      window.location.assign(`/external-broadcasts?eventId=${eventId}`);
    }
  };

  const handleReorder = async (date: Dayjs, eventIds: string[]) => {
    if (!canManage) return;
    try {
      await reorder({ variables: { date: date.toISOString(), eventIds } });
      messageApi.success('סדר השידורים נשמר');
      await refetch();
    } catch (err: any) {
      messageApi.error(`שגיאה בשמירת הסדר: ${err.message}`);
    }
  };

  const handleResetOrder = async () => {
    if (!canManage || view !== 'day') return;
    const key = anchorDate.format('YYYY-MM-DD');
    try {
      const sorted = [...(eventsByDate[key] || [])].sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
      await reorder({
        variables: { date: anchorDate.toISOString(), eventIds: sorted.map((e) => e.id) },
      });
      messageApi.success('הסדר אופס לפי שעת שידור');
      await refetch();
    } catch (err: any) {
      messageApi.error(`שגיאה: ${err.message}`);
    }
  };

  const calendarPane = (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col flex="auto">
            <Segmented
              value={view}
              onChange={(v) => setView(v as ViewMode)}
              options={[
                { label: 'יומי', value: 'day' },
                { label: 'שבועי', value: 'week' },
                { label: 'חודשי', value: 'month' },
              ]}
            />
          </Col>
          <Col>
            <Space>
              <Button icon={<RightOutlined />} onClick={handlePrev} />
              <Text strong style={{ minWidth: 220, display: 'inline-block', textAlign: 'center' }}>
                {dateRange.label}
              </Text>
              <Button icon={<LeftOutlined />} onClick={handleNext} />
              <Button onClick={() => setAnchorDate(dayjs())}>היום</Button>
            </Space>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              רענן
            </Button>
          </Col>
        </Row>
        <Row gutter={[12, 12]} style={{ marginTop: 12 }} align="middle">
          <Col flex="auto">
            <Input
              placeholder="חיפוש שידור (שם, ערוץ, ליגה)"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col>
            <Radio.Group
              value={pastFilter}
              onChange={(e) => setPastFilter(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value="all">הכל</Radio.Button>
              <Radio.Button value="upcoming">קרובים</Radio.Button>
              <Radio.Button value="past">עבר</Radio.Button>
            </Radio.Group>
          </Col>
          <Col>
            <DatePicker
              value={anchorDate}
              onChange={(v) => v && setAnchorDate(v)}
              format="DD/MM/YYYY"
            />
          </Col>
          {view === 'day' && canManage && (
            <Col>
              <Button onClick={handleResetOrder}>אפס סדר</Button>
            </Col>
          )}
        </Row>
      </Card>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      )}

      {!loading && view === 'day' && (
        <DayView
          date={anchorDate}
          events={eventsByDate[anchorDate.format('YYYY-MM-DD')] || []}
          search={search}
          onOpenEvent={openEvent}
          onReorder={handleReorder}
          canManage={canManage}
        />
      )}

      {!loading && view === 'week' && (
        <WeekView
          weekStart={anchorDate.startOf('isoWeek')}
          eventsByDate={eventsByDate}
          onOpenEvent={openEvent}
        />
      )}

      {!loading && view === 'month' && (
        <MonthView
          month={anchorDate}
          eventsByDate={eventsByDate}
          onOpenEvent={openEvent}
        />
      )}
    </>
  );

  return (
    <div style={{ direction: 'rtl', maxWidth: '100%', overflowX: 'hidden' }}>
      <Tabs
        defaultActiveKey="calendar"
        items={[
          {
            key: 'calendar',
            label: (
              <span>
                <CalendarOutlined /> לוח שידורים
              </span>
            ),
            children: calendarPane,
          },
          {
            key: 'workers',
            label: (
              <span>
                <UserOutlined /> חיפוש שיבוצי עובדים
              </span>
            ),
            children: <WorkerAssignmentSearch />,
          },
          {
            key: 'reports',
            label: (
              <span>
                <BarChartOutlined /> דוחות
              </span>
            ),
            children: <ExternalBroadcastReports />,
          },
          {
            key: 'devices',
            label: (
              <span>
                <ThunderboltOutlined /> מכשירי NEVION / LiveU
              </span>
            ),
            children: <ExternalBroadcastDeviceConfig />,
          },
          ...(canManage
            ? [
                {
                  key: 'reference',
                  label: (
                    <span>
                      <SettingOutlined /> נתוני עזר
                    </span>
                  ),
                  children: <ReferenceDataSettings />,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
};
