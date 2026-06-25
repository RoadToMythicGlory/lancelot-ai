'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Card, Button, Space, Tag, Row, Col, Typography, Spin, Alert, Input, Badge,
  Tabs, Empty, App, Modal, List, Segmented, DatePicker,
} from 'antd';
import {
  GlobalOutlined, SearchOutlined, LeftOutlined, RightOutlined, ReloadOutlined,
  ImportOutlined, CalendarOutlined, EditOutlined, UserOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { useQuery, useMutation } from '@apollo/client';
import {
  DndContext, PointerSensor, useSensor, useSensors, DragOverlay,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import {
  GET_BROADCAST_EVENTS, GET_EMPLOYEES_BY_DEPARTMENT, GET_DEPARTMENTS,
  GET_EXTERNAL_BROADCAST_PRESETS, GET_VENUES, GET_WAREHOUSE_EQUIPMENT_FOR_PICKER,
} from '@/graphql/queries';
import {
  UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA,
  UNIMPORT_BROADCAST_EVENTS_FROM_EXTERNAL_BROADCASTS,
} from '@/graphql/mutations';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import { AllBroadcastsOperationsView } from '@/components/externalBroadcasts/AllBroadcastsOperationsView';
import { ImportEventsFromPlanningModal } from '@/components/externalBroadcasts/ImportEventsFromPlanningModal';
import { BroadcastEventRow } from '@/components/externalBroadcasts/BroadcastEventRow';
import { ExternalBroadcastDeviceConfig } from '@/components/externalBroadcasts/ExternalBroadcastDeviceConfig';
import { EditorApi, CrewAssignment } from '@/components/externalBroadcasts/EventEditorPanel';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { compareForOperationsOrder, isImportedIntoExternalBroadcasts } from '@/utils/externalBroadcastDomain';

dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Jerusalem');

const { Text } = Typography;

type TopLevelTab = 'list' | 'all-broadcasts' | 'devices';

// Default broadcast duration (hours) used when an event has no endTime,
// so the cross-event double-booking check has a window to compare.
const DEFAULT_EVENT_HOURS = 3;

function eventWindow(ev: any): [number, number] {
  const start = new Date(ev.startTime).getTime();
  const end = ev.endTime
    ? new Date(ev.endTime).getTime()
    : start + DEFAULT_EVENT_HOURS * 3600 * 1000;
  return [start, end];
}

function eventsOverlap(a: any, b: any): boolean {
  const [aS, aE] = eventWindow(a);
  const [bS, bE] = eventWindow(b);
  return aS < bE && bS < aE;
}

interface RoleOption { roleKey: string; roleLabel: string; isCustom: boolean; }

interface PendingDrop {
  srcId: string;
  index: number;
  member: CrewAssignment;
  dstId: string;
  roles: RoleOption[];
  conflicts: any[];
}

const ExternalBroadcastsPage: React.FC = () => {
  const { message: messageApi } = App.useApp();
  const { hasPermission } = useAuth();
  const canManageBroadcasts = hasPermission(Permission.BROADCAST_MANAGE);

  const { activeCategories: equipmentCategoryOptions, labelOf: categoryLabelOf } =
    useEquipmentCategories({ includeInactive: true });

  const searchParams = useSearchParams();
  const [topLevelTab, setTopLevelTab] = useState<TopLevelTab>(
    searchParams?.get('tab') === 'all-broadcasts' ? 'all-broadcasts' : 'list',
  );

  const [currentDate, setCurrentDate] = useState(dayjs());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [searchText, setSearchText] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Registry of mounted (expanded) per-event editor APIs, for cross-event DnD.
  const editorsRef = useRef<Map<string, EditorApi>>(new Map());
  const registerEditor = useCallback((eventId: string, api: EditorApi | null) => {
    if (api) editorsRef.current.set(eventId, api);
    else editorsRef.current.delete(eventId);
  }, []);

  // DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeDrag, setActiveDrag] = useState<CrewAssignment | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  const dateRange = useMemo(() => {
    if (viewMode === 'day') {
      return {
        start: currentDate.startOf('day').toISOString(),
        end: currentDate.endOf('day').toISOString(),
        label: currentDate.format('dddd, DD/MM/YYYY'),
      };
    }
    if (viewMode === 'month') {
      return {
        start: currentDate.startOf('month').toISOString(),
        end: currentDate.endOf('month').toISOString(),
        label: currentDate.format('MMMM YYYY'),
      };
    }
    return {
      start: currentDate.startOf('week').toISOString(),
      end: currentDate.endOf('week').toISOString(),
      label: `שבוע ${currentDate.isoWeek()}, ${currentDate.format('MMMM YYYY')}`,
    };
  }, [currentDate, viewMode]);

  const stepDate = useCallback((dir: 1 | -1) => {
    setCurrentDate((d) =>
      viewMode === 'day' ? d.add(dir, 'day')
      : viewMode === 'month' ? d.add(dir, 'month')
      : d.add(dir, 'week'),
    );
  }, [viewMode]);

  const { data: eventsData, loading: eventsLoading, error: eventsError, refetch: refetchEvents } =
    useQuery(GET_BROADCAST_EVENTS, {
      variables: { startDate: dateRange.start, endDate: dateRange.end },
      fetchPolicy: 'network-only',
      pollInterval: 10000,
    });

  const { data: departmentsData } = useQuery(GET_DEPARTMENTS);
  const { data: presetsData, refetch: refetchPresets } = useQuery(GET_EXTERNAL_BROADCAST_PRESETS, { fetchPolicy: 'cache-and-network' });
  const presets: any[] = presetsData?.externalBroadcastPresets || [];

  const { data: pickerData, loading: pickerLoading, refetch: refetchPicker } =
    useQuery(GET_WAREHOUSE_EQUIPMENT_FOR_PICKER, { fetchPolicy: 'cache-first' });
  const pickerEquipment: any[] = useMemo(() => pickerData?.warehouseEquipmentForPicker || [], [pickerData]);
  const pickerEquipmentById = useMemo(() => {
    const m = new Map<string, any>();
    pickerEquipment.forEach((eq) => m.set(eq.id, eq));
    return m;
  }, [pickerEquipment]);

  const groupedPickerOptions = useMemo(() => {
    const groups = new Map<string, { categorySlug: string; categoryLabel: string; sortOrder: number; items: any[] }>();
    pickerEquipment.forEach((eq) => {
      if (eq.isDisabled) return;
      const slug = eq.category || 'uncategorized';
      const existing = groups.get(slug);
      if (existing) existing.items.push(eq);
      else {
        const cat = equipmentCategoryOptions.find((c) => c.slug === slug);
        groups.set(slug, { categorySlug: slug, categoryLabel: cat?.labelHe || categoryLabelOf(slug) || slug, sortOrder: cat?.sortOrder ?? 999, items: [eq] });
      }
    });
    return Array.from(groups.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.categoryLabel.localeCompare(b.categoryLabel))
      .map((g) => ({
        label: g.categoryLabel, title: g.categoryLabel,
        options: g.items.sort((a, b) => a.name.localeCompare(b.name)).map((eq) => {
          const meta = [eq.brand, eq.barcode].filter(Boolean).join(' · ');
          const availLabel = typeof eq.quantityAvailable === 'number' ? `${eq.quantityAvailable} זמין`
            : typeof eq.quantityTotal === 'number' ? `${eq.quantityTotal} סה"כ` : '';
          return { value: eq.id, label: `${eq.name}${meta ? ' · ' + meta : ''}${availLabel ? ' · ' + availLabel : ''}`, searchKey: `${eq.name} ${eq.brand || ''} ${eq.barcode || ''}`.toLowerCase() };
        }),
      }));
  }, [pickerEquipment, equipmentCategoryOptions, categoryLabelOf]);

  const { data: venuesData } = useQuery(GET_VENUES, { variables: { includeInactive: false }, fetchPolicy: 'cache-and-network' });
  const venues: any[] = venuesData?.venues || [];

  const [departmentIds, setDepartmentIds] = useState<Record<string, string>>({});
  useEffect(() => {
    if (departmentsData?.departments) {
      const map: Record<string, string> = {};
      departmentsData.departments.forEach((d: any) => { map[d.code] = d.id; });
      setDepartmentIds(map);
    }
  }, [departmentsData]);

  const { data: cameramenData } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, { variables: { filter: { departmentId: departmentIds['CAM'], isActive: true } }, skip: !departmentIds['CAM'] });
  const { data: soundmenData } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, { variables: { filter: { departmentId: departmentIds['SOUND'], isActive: true } }, skip: !departmentIds['SOUND'] });
  const { data: producersData } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, { variables: { filter: { departmentId: departmentIds['PROD'], isActive: true } }, skip: !departmentIds['PROD'] });
  const { data: directorsData } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, { variables: { filter: { departmentId: departmentIds['DIR'], isActive: true } }, skip: !departmentIds['DIR'] });

  const employeesByRole: Record<string, any[]> = useMemo(() => ({
    cameraman: cameramenData?.users || [],
    soundman: soundmenData?.users || [],
    producer: producersData?.users || [],
    director: directorsData?.users || [],
  }), [cameramenData, soundmenData, producersData, directorsData]);

  const allEmployees = useMemo(() => {
    const seen = new Set<string>();
    const result: any[] = [];
    Object.values(employeesByRole).forEach((list) => list.forEach((emp: any) => { if (!seen.has(emp.id)) { seen.add(emp.id); result.push(emp); } }));
    return result;
  }, [employeesByRole]);

  const getEmployeesForRole = useCallback((roleKey: string): any[] => employeesByRole[roleKey] || allEmployees, [employeesByRole, allEmployees]);

  const [updateDepartmentData] = useMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA);
  const [unimportEvents] = useMutation(UNIMPORT_BROADCAST_EVENTS_FROM_EXTERNAL_BROADCASTS);

  const allEvents: any[] = useMemo(() => (eventsData?.broadcastEvents || []).map((e: any) => ({ ...e })), [eventsData]);
  const importedEvents = useMemo(() => allEvents.filter(isImportedIntoExternalBroadcasts), [allEvents]);

  const filteredEvents = useMemo(() => {
    let list = importedEvents;
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter((e) =>
        e.title?.toLowerCase().includes(q) || e.homeTeam?.toLowerCase().includes(q) ||
        e.awayTeam?.toLowerCase().includes(q) || e.league?.toLowerCase().includes(q) ||
        e.channel?.toLowerCase().includes(q));
    }
    return [...list].sort(compareForOperationsOrder);
  }, [importedEvents, searchText]);

  // Group sorted events by date for day headers.
  const groupedByDate = useMemo(() => {
    const groups: Array<{ key: string; label: string; events: any[] }> = [];
    const map = new Map<string, any[]>();
    for (const ev of filteredEvents) {
      const key = dayjs(ev.startTime).format('YYYY-MM-DD');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    Array.from(map.keys()).sort().forEach((key) => {
      groups.push({ key, label: dayjs(key).format('dddd, DD/MM/YYYY'), events: map.get(key)! });
    });
    return groups;
  }, [filteredEvents]);

  const toggleExpanded = useCallback((eventId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId); else next.add(eventId);
      return next;
    });
  }, []);

  const handleUnimportEvent = async (eventId: string) => {
    try {
      await unimportEvents({ variables: { eventIds: [eventId] } });
      messageApi.success('האירוע הוסר מרשימת שידורי חוץ');
      setExpandedIds((prev) => { const n = new Set(prev); n.delete(eventId); return n; });
      await refetchEvents();
    } catch (err: any) {
      messageApi.error(`שגיאה בהסרת הייבוא: ${err.message}`);
    }
  };

  // ─── Cross-event crew drag-and-drop ────────────────────
  const persistCrewToCollapsedEvent = useCallback(async (eventId: string, crew: CrewAssignment[]) => {
    await updateDepartmentData({
      variables: {
        eventId, department: 'externalBroadcasts',
        data: { customData: { productionCrew: crew.map((c) => ({ role: c.roleKey, roleLabel: c.roleLabel, userId: c.userId, name: c.name, phone: c.phone, isCustom: c.isCustom })) } },
      },
    });
  }, [updateDepartmentData]);

  const readCrewFromEvent = useCallback((ev: any): CrewAssignment[] => {
    const dept = ev?.metadata?.departments?.externalBroadcasts || {};
    const cd = dept.customData || {};
    const crew: any[] = cd.productionCrew || dept.productionCrew || [];
    return crew.map((m: any) => ({ roleKey: m.role || m.roleKey || '', roleLabel: m.roleLabel || m.role || '', userId: m.userId || '', name: m.name || '', phone: m.phone, isCustom: !!m.isCustom }));
  }, []);

  const performMove = useCallback(async (drop: PendingDrop, role: RoleOption) => {
    const { srcId, index, member, dstId } = drop;
    try {
      // Source removal — source row is always expanded (drag originates there).
      const srcApi = editorsRef.current.get(srcId);
      if (srcApi) {
        const srcCrew = srcApi.getCrew();
        await srcApi.setCrewAndPersist(srcCrew.filter((_, i) => i !== index));
      }
      const newMember: CrewAssignment = { roleKey: role.roleKey, roleLabel: role.roleLabel, userId: member.userId, name: member.name, phone: member.phone, isCustom: role.isCustom };
      const dstApi = editorsRef.current.get(dstId);
      if (dstApi) {
        await dstApi.setCrewAndPersist([...dstApi.getCrew(), newMember]);
      } else {
        const dstEvent = allEvents.find((e) => e.id === dstId);
        const dstCrew = dstEvent ? readCrewFromEvent(dstEvent) : [];
        await persistCrewToCollapsedEvent(dstId, [...dstCrew, newMember]);
      }
      messageApi.success(`${member.name} הועבר/ה לאירוע`);
      await refetchEvents();
    } catch (err: any) {
      messageApi.error(`שגיאה בהעברת איש הצוות: ${err.message}`);
    }
  }, [allEvents, persistCrewToCollapsedEvent, readCrewFromEvent, messageApi, refetchEvents]);

  const proceedAfterConflict = useCallback((drop: PendingDrop) => {
    if (drop.roles.length > 1) { setPendingDrop(drop); setRolePickerOpen(true); }
    else performMove(drop, drop.roles[0]);
  }, [performMove]);

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as any;
    if (data?.type === 'crew') setActiveDrag(data.member);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const a = e.active.data.current as any;
    const o = e.over?.data.current as any;
    if (!a || a.type !== 'crew' || !o || o.type !== 'event-row') return;
    const srcId: string = a.eventId;
    const dstId: string = o.eventId;
    if (srcId === dstId) return;
    const member: CrewAssignment = a.member;
    if (!member.userId) return;

    // Roles this person holds on the source event.
    const srcApi = editorsRef.current.get(srcId);
    const srcCrew = srcApi ? srcApi.getCrew() : [];
    const roleMap = new Map<string, RoleOption>();
    srcCrew.filter((c) => c.userId === member.userId).forEach((c) => {
      if (!roleMap.has(c.roleKey)) roleMap.set(c.roleKey, { roleKey: c.roleKey, roleLabel: c.roleLabel, isCustom: c.isCustom });
    });
    const roles = roleMap.size > 0 ? Array.from(roleMap.values()) : [{ roleKey: member.roleKey, roleLabel: member.roleLabel, isCustom: member.isCustom }];

    // Double-booking check: other events (excluding source) that already
    // have this person AND overlap the target event's time window.
    const dstEvent = allEvents.find((ev) => ev.id === dstId);
    const conflicts = dstEvent
      ? allEvents.filter((ev) => ev.id !== dstId && ev.id !== srcId && eventsOverlap(ev, dstEvent) && readCrewFromEvent(ev).some((c) => c.userId === member.userId))
      : [];

    const drop: PendingDrop = { srcId, index: a.index, member, dstId, roles, conflicts };
    if (conflicts.length > 0) { setPendingDrop(drop); setConflictOpen(true); }
    else proceedAfterConflict(drop);
  };

  const openEventFromCalendar = (eventId: string) => {
    setExpandedIds((prev) => new Set(prev).add(eventId));
    setTopLevelTab('list');
  };

  // ─── Render ────────────────────────────────────────────
  const dstEventForModal = pendingDrop ? allEvents.find((e) => e.id === pendingDrop.dstId) : null;

  return (
    <div style={{ padding: '12px 24px 24px', direction: 'rtl' }}>
      <Tabs
        activeKey={topLevelTab}
        onChange={(k) => setTopLevelTab(k as TopLevelTab)}
        items={[
          { key: 'list', label: <span><EditOutlined /> רשימת אירועים</span> },
          { key: 'all-broadcasts', label: <span><CalendarOutlined /> לוח שידורים וכלים</span> },
          { key: 'devices', label: <span><ThunderboltOutlined /> מכשירי NEVION / LiveU</span> },
        ]}
        style={{ marginBottom: 12 }}
        tabBarExtraContent={
          topLevelTab === 'list' ? (
            <Space wrap>
              {canManageBroadcasts && (
                <Button type="primary" icon={<ImportOutlined />} onClick={() => setImportModalOpen(true)}>
                  ייבא אירועים מתכנונית
                </Button>
              )}
              <Button icon={<RightOutlined />} onClick={() => stepDate(-1)} />
              <Text strong style={{ minWidth: 160, display: 'inline-block', textAlign: 'center' }}>{dateRange.label}</Text>
              <Button icon={<LeftOutlined />} onClick={() => stepDate(1)} />
              <Button onClick={() => setCurrentDate(dayjs())}>היום</Button>
              <Button icon={<ReloadOutlined />} onClick={() => refetchEvents()}>רענן</Button>
            </Space>
          ) : null
        }
      />

      {topLevelTab === 'all-broadcasts' && (
        <AllBroadcastsOperationsView onOpenEvent={openEventFromCalendar} />
      )}

      {topLevelTab === 'devices' && <ExternalBroadcastDeviceConfig />}

      {topLevelTab === 'list' && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Row gutter={[12, 12]} align="middle">
              <Col>
                <Segmented
                  value={viewMode}
                  onChange={(v) => setViewMode(v as 'day' | 'week' | 'month')}
                  options={[
                    { label: 'יומי', value: 'day' },
                    { label: 'שבועי', value: 'week' },
                    { label: 'חודשי', value: 'month' },
                  ]}
                />
              </Col>
              <Col flex="auto">
                <Input
                  placeholder="חיפוש שידור (שם, ערוץ, ליגה)" prefix={<SearchOutlined />}
                  value={searchText} onChange={(e) => setSearchText(e.target.value)} allowClear
                />
              </Col>
              <Col>
                <DatePicker
                  value={currentDate} onChange={(v) => v && setCurrentDate(v)} format="DD/MM/YYYY"
                  allowClear={false}
                />
              </Col>
              <Col>
                <Badge count={filteredEvents.length} showZero style={{ backgroundColor: '#1890ff' }} />
              </Col>
            </Row>
          </Card>

          {eventsLoading && <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: 40 }} />}
          {eventsError && <Alert message="שגיאה בטעינת אירועים" type="error" showIcon />}

          {!eventsLoading && !eventsError && filteredEvents.length === 0 && (
            <Card>
              <Empty
                image={<GlobalOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
                description={<Text type="secondary">אין אירועים. השתמש ב"ייבא אירועים מתכנונית" כדי להוסיף שידורים.</Text>}
              />
            </Card>
          )}

          {!eventsLoading && !eventsError && filteredEvents.length > 0 && (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              {groupedByDate.map((group) => (
                <Card
                  key={group.key}
                  title={<Space><CalendarOutlined /><Text strong>{group.label}</Text><Badge count={group.events.length} style={{ backgroundColor: '#1890ff' }} /></Space>}
                  style={{ marginBottom: 16 }}
                  styles={{ body: { padding: 0 } }}
                >
                  {group.events.map((ev, idx) => (
                    <BroadcastEventRow
                      key={ev.id}
                      event={ev}
                      index={idx}
                      expanded={expandedIds.has(ev.id)}
                      onToggle={() => toggleExpanded(ev.id)}
                      onUnimport={handleUnimportEvent}
                      canManage={canManageBroadcasts}
                      presets={presets}
                      venues={venues}
                      pickerEquipment={pickerEquipment}
                      pickerEquipmentById={pickerEquipmentById}
                      groupedPickerOptions={groupedPickerOptions}
                      pickerLoading={pickerLoading}
                      refetchPicker={refetchPicker}
                      employeesByRole={employeesByRole}
                      allEmployees={allEmployees}
                      getEmployeesForRole={getEmployeesForRole}
                      categoryLabelOf={categoryLabelOf}
                      equipmentCategoryOptions={equipmentCategoryOptions}
                      onSaved={() => refetchEvents()}
                      onPresetsChanged={() => refetchPresets()}
                      registerEditor={registerEditor}
                    />
                  ))}
                </Card>
              ))}
              <DragOverlay>
                {activeDrag ? (
                  <Tag color="blue" style={{ padding: '4px 10px', fontSize: 14 }}>
                    <UserOutlined /> {activeDrag.name}
                  </Tag>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </>
      )}

      {/* Double-booking conflict warning */}
      <Modal
        title="העובד כבר משובץ לשידור חופף"
        open={conflictOpen}
        okText="המשך בכל זאת" cancelText="ביטול"
        okButtonProps={{ danger: true }}
        onCancel={() => { setConflictOpen(false); setPendingDrop(null); }}
        onOk={() => {
          setConflictOpen(false);
          if (pendingDrop) {
            const drop = pendingDrop;
            setPendingDrop(null);
            proceedAfterConflict(drop);
          }
        }}
      >
        {pendingDrop && (
          <div>
            <Text>
              {pendingDrop.member.name} כבר משובץ/ת לשידורים הבאים שחופפים בזמן לאירוע היעד
              {dstEventForModal ? ` (${dayjs(dstEventForModal.startTime).format('DD/MM HH:mm')})` : ''}:
            </Text>
            <List
              size="small"
              style={{ marginTop: 8 }}
              dataSource={pendingDrop.conflicts}
              renderItem={(c: any) => (
                <List.Item>
                  <Text>
                    {dayjs(c.startTime).format('DD/MM HH:mm')} — {c.homeTeam && c.awayTeam ? `${c.homeTeam} נגד ${c.awayTeam}` : c.title}
                  </Text>
                </List.Item>
              )}
            />
            <Alert style={{ marginTop: 12 }} type="warning" showIcon message="האם להמשיך ולשבץ בכל זאת?" />
          </div>
        )}
      </Modal>

      {/* Role picker (only roles the person holds on the source event) */}
      <Modal
        title="בחר תפקיד באירוע היעד"
        open={rolePickerOpen}
        footer={null}
        onCancel={() => { setRolePickerOpen(false); setPendingDrop(null); }}
      >
        {pendingDrop && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">{pendingDrop.member.name} משובץ/ת במספר תפקידים. באיזה תפקיד לשבץ באירוע היעד?</Text>
            {pendingDrop.roles.map((r) => (
              <Button
                key={r.roleKey}
                block
                onClick={() => {
                  const drop = pendingDrop;
                  setRolePickerOpen(false);
                  setPendingDrop(null);
                  performMove(drop, r);
                }}
              >
                {r.roleLabel}
              </Button>
            ))}
          </Space>
        )}
      </Modal>

      <ImportEventsFromPlanningModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={() => { refetchEvents(); }}
      />
    </div>
  );
};

const ExternalBroadcastsPageWithApp: React.FC = () => (
  <ProtectedRoute requires={Permission.BROADCAST_VIEW}>
    <App>
      <ExternalBroadcastsPage />
    </App>
  </ProtectedRoute>
);

export default ExternalBroadcastsPageWithApp;
