'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Table, Card, Button, Space, Modal, Tag, Row, Col, Typography, Spin, Alert,
  Input, DatePicker, Select, Form, Divider, InputNumber, App, Badge, Tabs, List,
  Popconfirm, Empty, Tooltip
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, GlobalOutlined, SearchOutlined,
  LeftOutlined, RightOutlined, ReloadOutlined, ToolOutlined, TeamOutlined,
  VideoCameraOutlined, AudioOutlined, UserOutlined, SaveOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined,
  AppstoreOutlined, CopyOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { useQuery, useMutation } from '@apollo/client';
import { GET_BROADCAST_EVENTS, GET_WAREHOUSE_EQUIPMENT, GET_EMPLOYEES_BY_DEPARTMENT, GET_DEPARTMENTS, GET_EXTERNAL_BROADCAST_PRESETS } from '@/graphql/queries';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, CREATE_EXTERNAL_BROADCAST_PRESET, UPDATE_EXTERNAL_BROADCAST_PRESET, DELETE_EXTERNAL_BROADCAST_PRESET } from '@/graphql/mutations';

dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Jerusalem');

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

// ─── Interfaces ───────────────────────────────────────────

interface BroadcastEvent {
  id: string;
  title: string;
  hebrewTitle?: string;
  startTime: string;
  endTime: string;
  channel?: string;
  sport?: string;
  league?: string;
  stage?: string;
  homeTeam?: string;
  awayTeam?: string;
  live?: boolean;
  metadata?: any;
  [key: string]: any;
}

interface Equipment {
  id: string;
  name: string;
  category: string;
  brand: string;
  quantityAvailable: number;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone?: string;
  systemRole?: string;
  departments?: Array<{ departmentId: string; departmentName: string; roles: string[] }>;
}

interface PresetRole {
  roleKey: string;
  roleLabel: string;
  count: number;
  isCustom: boolean;
}

interface PresetEquipment {
  equipmentId?: string;
  name: string;
  category?: string;
  count: number;
}

interface Preset {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  roles: PresetRole[];
  equipment: PresetEquipment[];
  createdAt?: string;
  updatedAt?: string;
}

type DataStatus = 'complete' | 'partial' | 'empty';

// ─── Status helpers ───────────────────────────────────────

function getExternalBroadcastStatus(event: BroadcastEvent): DataStatus {
  const deptData = event.metadata?.departments?.externalBroadcasts || {};
  const customData = deptData.customData || {};
  if (customData.notApplicable || deptData.notApplicable) return 'complete';
  const crew = customData.productionCrew || deptData.productionCrew || [];
  const equip = customData.equipmentList || deptData.equipmentList || [];
  if (crew.length >= 2 && equip.length >= 1) return 'complete';
  if (crew.length > 0 || equip.length > 0) return 'partial';
  return 'empty';
}

const statusColors: Record<DataStatus, { bg: string; border: string; text: string }> = {
  complete: { bg: '#f0fdf4', border: '#22c55e', text: '#15803d' },
  partial: { bg: '#fefce8', border: '#eab308', text: '#a16207' },
  empty: { bg: '#fef2f2', border: '#ef4444', text: '#b91c1c' },
};

const statusLabels: Record<DataStatus, string> = {
  complete: 'הושלם',
  partial: 'חלקי',
  empty: 'ריק',
};

// Fixed production roles matching the existing modal
const FIXED_ROLES: Array<{ key: string; label: string; icon: React.ReactNode; deptCode: string }> = [
  { key: 'cameraman', label: 'צלם', icon: <VideoCameraOutlined />, deptCode: 'CAM' },
  { key: 'soundman', label: 'סאונדמן', icon: <AudioOutlined />, deptCode: 'SOUND' },
  { key: 'producer', label: 'מפיק', icon: <UserOutlined />, deptCode: 'PROD' },
  { key: 'director', label: 'במאי', icon: <UserOutlined />, deptCode: 'DIR' },
];

// ─── Main Component ───────────────────────────────────────

const ExternalBroadcastsPage: React.FC = () => {
  const { message: messageApi, modal } = App.useApp();

  // Navigation state
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [searchText, setSearchText] = useState('');

  // Selection state
  const [selectedEvent, setSelectedEvent] = useState<BroadcastEvent | null>(null);

  // Assignment form
  const [form] = Form.useForm();
  const [selectedEquipment, setSelectedEquipment] = useState<Array<{ id: string; quantity: number }>>([]);
  const [customRoles, setCustomRoles] = useState<Array<{ key: string; label: string; assignedIds: string[] }>>([]);
  const [saving, setSaving] = useState(false);

  // Preset management
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [presetForm] = Form.useForm();

  // Custom role addition
  const [newRoleName, setNewRoleName] = useState('');

  // Department IDs for fetching employees
  const [departmentIds, setDepartmentIds] = useState<Record<string, string>>({});

  // ─── Date range ─────────────────────────────────────────

  const dateRange = useMemo(() => ({
    start: currentDate.startOf('week').toISOString(),
    end: currentDate.endOf('week').toISOString(),
  }), [currentDate]);

  // ─── Queries ────────────────────────────────────────────

  const { data: eventsData, loading: eventsLoading, error: eventsError, refetch: refetchEvents } = useQuery(GET_BROADCAST_EVENTS, {
    variables: { startDate: dateRange.start, endDate: dateRange.end },
    fetchPolicy: 'network-only',
    pollInterval: 10000,
  });

  const { data: equipmentData } = useQuery(GET_WAREHOUSE_EQUIPMENT);
  const equipment: Equipment[] = equipmentData?.warehouseEquipment || [];

  const { data: departmentsData } = useQuery(GET_DEPARTMENTS);

  const { data: presetsData, refetch: refetchPresets } = useQuery(GET_EXTERNAL_BROADCAST_PRESETS, {
    fetchPolicy: 'cache-and-network',
  });
  const presets: Preset[] = presetsData?.externalBroadcastPresets || [];

  // Department IDs mapping
  useEffect(() => {
    if (departmentsData?.departments) {
      const map: Record<string, string> = {};
      departmentsData.departments.forEach((d: any) => { map[d.code] = d.id; });
      setDepartmentIds(map);
    }
  }, [departmentsData]);

  // Employee queries per role
  const { data: cameramenData } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { filter: { departmentId: departmentIds['CAM'], isActive: true } },
    skip: !departmentIds['CAM'],
  });
  const { data: soundmenData } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { filter: { departmentId: departmentIds['SOUND'], isActive: true } },
    skip: !departmentIds['SOUND'],
  });
  const { data: producersData } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { filter: { departmentId: departmentIds['PROD'], isActive: true } },
    skip: !departmentIds['PROD'],
  });
  const { data: directorsData } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { filter: { departmentId: departmentIds['DIR'], isActive: true } },
    skip: !departmentIds['DIR'],
  });

  const employeesByRole: Record<string, Employee[]> = {
    cameraman: cameramenData?.users || [],
    soundman: soundmenData?.users || [],
    producer: producersData?.users || [],
    director: directorsData?.users || [],
  };

  // ─── Mutations ──────────────────────────────────────────

  const [updateDepartmentData] = useMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, {
    refetchQueries: ['GetBroadcastEvents'],
    awaitRefetchQueries: true,
  });

  const [createPreset] = useMutation(CREATE_EXTERNAL_BROADCAST_PRESET, {
    refetchQueries: ['GetExternalBroadcastPresets'],
  });
  const [updatePreset] = useMutation(UPDATE_EXTERNAL_BROADCAST_PRESET, {
    refetchQueries: ['GetExternalBroadcastPresets'],
  });
  const [deletePreset] = useMutation(DELETE_EXTERNAL_BROADCAST_PRESET, {
    refetchQueries: ['GetExternalBroadcastPresets'],
  });

  // ─── Events list ────────────────────────────────────────

  const allEvents: BroadcastEvent[] = useMemo(() => {
    if (!eventsData?.broadcastEvents) return [];
    return eventsData.broadcastEvents.map((e: any) => ({ ...e }));
  }, [eventsData]);

  const filteredEvents = useMemo(() => {
    if (!searchText) return allEvents;
    const q = searchText.toLowerCase();
    return allEvents.filter(e =>
      e.title?.toLowerCase().includes(q) ||
      e.homeTeam?.toLowerCase().includes(q) ||
      e.awayTeam?.toLowerCase().includes(q) ||
      e.league?.toLowerCase().includes(q) ||
      e.channel?.toLowerCase().includes(q)
    );
  }, [allEvents, searchText]);

  // ─── Load existing data when event selected ─────────────

  useEffect(() => {
    if (!selectedEvent) return;
    const metadata = selectedEvent.metadata || {};
    const dept = metadata.departments?.externalBroadcasts || {};
    const cd = dept.customData || {};

    const equipList = cd.equipmentList || dept.equipmentList || [];
    const crew = cd.productionCrew || dept.productionCrew || [];

    // Load equipment
    if (equipList.length > 0) {
      setSelectedEquipment(equipList.map((item: any) => ({ id: item.equipmentId, quantity: item.quantity })));
    } else {
      setSelectedEquipment([]);
    }

    // Load crew into form
    const formValues: any = {};
    const customRolesFromData: typeof customRoles = [];
    const crewByRole = crew.reduce((acc: any, m: any) => {
      if (!acc[m.role]) acc[m.role] = [];
      acc[m.role].push(m.userId);
      return acc;
    }, {});

    FIXED_ROLES.forEach(r => {
      if (crewByRole[r.key]) formValues[r.key] = crewByRole[r.key];
    });

    // Load custom roles
    Object.keys(crewByRole).forEach(roleKey => {
      if (!FIXED_ROLES.find(r => r.key === roleKey)) {
        customRolesFromData.push({
          key: roleKey,
          label: roleKey,
          assignedIds: crewByRole[roleKey],
        });
      }
    });

    form.setFieldsValue(formValues);
    setCustomRoles(customRolesFromData);
  }, [selectedEvent, form]);

  // Keep selectedEvent in sync with live data
  useEffect(() => {
    if (selectedEvent && allEvents.length > 0) {
      const updated = allEvents.find(e => e.id === selectedEvent.id);
      if (updated && JSON.stringify(updated.metadata) !== JSON.stringify(selectedEvent.metadata)) {
        setSelectedEvent(updated);
      }
    }
  }, [allEvents]);

  // ─── Equipment handlers ─────────────────────────────────

  const handleEquipmentChange = (equipmentId: string, quantity: number) => {
    setSelectedEquipment(prev => {
      const existing = prev.find(e => e.id === equipmentId);
      if (existing) {
        if (quantity === 0) return prev.filter(e => e.id !== equipmentId);
        return prev.map(e => e.id === equipmentId ? { ...e, quantity } : e);
      }
      return [...prev, { id: equipmentId, quantity }];
    });
  };

  // ─── Save handler ───────────────────────────────────────

  const handleSave = async () => {
    if (!selectedEvent) return;
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      const productionCrew: any[] = [];

      // Fixed roles
      FIXED_ROLES.forEach(role => {
        const ids = values[role.key];
        if (ids?.length) {
          ids.forEach((id: string) => {
            const emp = employeesByRole[role.key]?.find(e => e.id === id);
            if (emp) {
              productionCrew.push({
                role: role.key,
                userId: id,
                name: emp.displayName || `${emp.firstName} ${emp.lastName}`,
                phone: emp.phone,
              });
            }
          });
        }
      });

      // Custom roles
      customRoles.forEach(cr => {
        cr.assignedIds.forEach(id => {
          productionCrew.push({ role: cr.key, userId: id, name: id });
        });
      });

      const equipmentList = selectedEquipment.map(item => {
        const eq = equipment.find(e => e.id === item.id);
        return {
          equipmentId: item.id,
          quantity: item.quantity,
          name: eq?.name || '',
          category: eq?.category || '',
        };
      });

      await updateDepartmentData({
        variables: {
          eventId: selectedEvent.id,
          department: 'externalBroadcasts',
          data: {
            customData: {
              productionCrew,
              equipmentList,
              notApplicable: false,
            },
          },
        },
      });

      messageApi.success('הנתונים נשמרו בהצלחה');
      await refetchEvents();
    } catch (err: any) {
      messageApi.error(`שגיאה בשמירה: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Mark not applicable ────────────────────────────────

  const handleNotApplicable = async () => {
    if (!selectedEvent) return;
    setSaving(true);
    try {
      await updateDepartmentData({
        variables: {
          eventId: selectedEvent.id,
          department: 'externalBroadcasts',
          data: { customData: { notApplicable: true } },
        },
      });
      messageApi.success('סומן כ"לא עבורנו"');
      await refetchEvents();
    } catch (err: any) {
      messageApi.error(`שגיאה: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Apply preset to current event form ─────────────────

  const applyPreset = (preset: Preset) => {
    // Apply equipment
    const newEquip = preset.equipment.map(pe => ({
      id: pe.equipmentId || '',
      quantity: pe.count,
    })).filter(e => e.id);
    setSelectedEquipment(newEquip);

    // Apply custom roles
    const newCustom = preset.roles
      .filter(r => r.isCustom)
      .map(r => ({ key: r.roleKey, label: r.roleLabel, assignedIds: [] as string[] }));
    setCustomRoles(newCustom);

    messageApi.success(`פריסט "${preset.name}" הוחל בהצלחה`);
  };

  // ─── Preset CRUD ────────────────────────────────────────

  const openPresetModal = (preset?: Preset) => {
    setEditingPreset(preset || null);
    if (preset) {
      presetForm.setFieldsValue({
        name: preset.name,
        description: preset.description,
        tags: preset.tags,
      });
    } else {
      presetForm.resetFields();
    }
    setPresetModalOpen(true);
  };

  const handleSavePreset = async () => {
    try {
      const values = await presetForm.validateFields();
      const formValues = form.getFieldsValue();

      const roles: PresetRole[] = FIXED_ROLES.map(r => ({
        roleKey: r.key,
        roleLabel: r.label,
        count: formValues[r.key]?.length || 0,
        isCustom: false,
      })).filter(r => r.count > 0);

      customRoles.forEach(cr => {
        roles.push({
          roleKey: cr.key,
          roleLabel: cr.label,
          count: cr.assignedIds.length || 1,
          isCustom: true,
        });
      });

      const presetEquipment: PresetEquipment[] = selectedEquipment.map(item => {
        const eq = equipment.find(e => e.id === item.id);
        return {
          equipmentId: item.id,
          name: eq?.name || '',
          category: eq?.category || '',
          count: item.quantity,
        };
      });

      const input = {
        name: values.name,
        description: values.description,
        tags: values.tags || [],
        roles,
        equipment: presetEquipment,
      };

      if (editingPreset) {
        await updatePreset({ variables: { id: editingPreset.id, input } });
        messageApi.success('הפריסט עודכן');
      } else {
        await createPreset({ variables: { input } });
        messageApi.success('הפריסט נוצר');
      }

      setPresetModalOpen(false);
      presetForm.resetFields();
      await refetchPresets();
    } catch (err: any) {
      if (err.errorFields) return;
      messageApi.error(`שגיאה בשמירת פריסט: ${err.message}`);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      await deletePreset({ variables: { id: presetId } });
      messageApi.success('הפריסט נמחק');
      await refetchPresets();
    } catch (err: any) {
      messageApi.error(`שגיאה במחיקת פריסט: ${err.message}`);
    }
  };

  // ─── Custom role handlers ───────────────────────────────

  const addCustomRole = () => {
    if (!newRoleName.trim()) return;
    const key = newRoleName.trim().replace(/\s+/g, '_').toLowerCase();
    if (customRoles.find(r => r.key === key) || FIXED_ROLES.find(r => r.key === key)) {
      messageApi.warning('תפקיד זה כבר קיים');
      return;
    }
    setCustomRoles(prev => [...prev, { key, label: newRoleName.trim(), assignedIds: [] }]);
    setNewRoleName('');
  };

  const removeCustomRole = (key: string) => {
    setCustomRoles(prev => prev.filter(r => r.key !== key));
  };

  // ─── Render helpers ─────────────────────────────────────

  const renderEmployeeOption = (emp: Employee) => (
    <Option key={emp.id} value={emp.id}>
      {emp.displayName || `${emp.firstName} ${emp.lastName}`}
      {emp.systemRole && <span className="text-gray-500 text-sm mr-2"> - {emp.systemRole}</span>}
    </Option>
  );

  // ─── Event list columns ─────────────────────────────────

  const eventColumns = [
    {
      title: 'זמן',
      key: 'time',
      width: 100,
      render: (_: any, record: BroadcastEvent) => (
        <div>
          <div style={{ fontWeight: 600 }}>{dayjs(record.startTime).format('DD/MM')}</div>
          <div style={{ fontSize: 16, fontWeight: 'bold' }}>{dayjs(record.startTime).format('HH:mm')}</div>
        </div>
      ),
    },
    {
      title: 'אירוע',
      key: 'event',
      render: (_: any, record: BroadcastEvent) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {record.homeTeam && record.awayTeam
              ? `${record.homeTeam} נגד ${record.awayTeam}`
              : record.title}
          </div>
          {record.league && (
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>
              {record.league} {record.stage ? `• ${record.stage}` : ''}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'ערוץ',
      dataIndex: 'channel',
      key: 'channel',
      width: 100,
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    {
      title: 'סטטוס שידורי חוץ',
      key: 'status',
      width: 130,
      render: (_: any, record: BroadcastEvent) => {
        const st = getExternalBroadcastStatus(record);
        const c = statusColors[st];
        return (
          <Tag style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}>
            {st === 'complete' && <CheckCircleOutlined />}
            {st === 'partial' && <ExclamationCircleOutlined />}
            {st === 'empty' && <CloseCircleOutlined />}
            {' '}{statusLabels[st]}
          </Tag>
        );
      },
    },
  ];

  // ─── Equipment columns for assignment editor ────────────

  const equipmentColumns = [
    {
      title: 'ציוד',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Equipment) => (
        <Space>
          <ToolOutlined />
          <span>{name}</span>
          <Tag color="blue">{record.brand}</Tag>
        </Space>
      ),
    },
    {
      title: 'קטגוריה',
      dataIndex: 'category',
      key: 'category',
      filters: [
        { text: 'מצלמות', value: 'camera' },
        { text: 'אודיו', value: 'audio' },
        { text: 'תאורה', value: 'lighting' },
        { text: 'אחר', value: 'other' },
      ],
      onFilter: (value: any, record: Equipment) => record.category === value,
    },
    {
      title: 'זמין',
      dataIndex: 'quantityAvailable',
      key: 'quantityAvailable',
      render: (avail: number) => (
        <Tag color={avail > 0 ? 'green' : 'red'}>{avail} יחידות</Tag>
      ),
    },
    {
      title: 'כמות',
      key: 'quantity',
      render: (_: any, record: Equipment) => {
        const sel = selectedEquipment.find(e => e.id === record.id);
        return (
          <InputNumber
            min={0}
            max={record.quantityAvailable}
            value={sel?.quantity || 0}
            onChange={v => handleEquipmentChange(record.id, v || 0)}
            disabled={record.quantityAvailable === 0}
          />
        );
      },
    },
  ];

  // ─── Render ─────────────────────────────────────────────

  return (
    <div style={{ padding: 24, direction: 'rtl' }}>
      {/* Page header */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space>
              <GlobalOutlined style={{ fontSize: 24 }} />
              <Title level={3} style={{ margin: 0 }}>שידורי חוץ</Title>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<LeftOutlined />} onClick={() => setCurrentDate(d => d.subtract(1, 'week'))} />
              <Text strong>שבוע {currentDate.isoWeek()}, {currentDate.format('MMMM YYYY')}</Text>
              <Button icon={<RightOutlined />} onClick={() => setCurrentDate(d => d.add(1, 'week'))} />
              <Button onClick={() => setCurrentDate(dayjs())}>היום</Button>
              <Button icon={<ReloadOutlined />} onClick={() => refetchEvents()}>רענן</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        {/* ─── Left panel: Event list ─── */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <AppstoreOutlined />
                <span>אירועי שידור</span>
                <Badge count={filteredEvents.length} style={{ backgroundColor: '#1890ff' }} />
              </Space>
            }
            style={{ height: 'calc(100vh - 180px)', overflow: 'auto' }}
          >
            <Input
              placeholder="חיפוש אירוע..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
              style={{ marginBottom: 12 }}
            />

            {eventsLoading && <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: 40 }} />}
            {eventsError && <Alert message="שגיאה בטעינת אירועים" type="error" showIcon />}

            {!eventsLoading && !eventsError && (
              <Table
                columns={eventColumns}
                dataSource={filteredEvents}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 15, simple: true }}
                onRow={record => ({
                  onClick: () => setSelectedEvent(record),
                  style: {
                    cursor: 'pointer',
                    backgroundColor: selectedEvent?.id === record.id ? '#e6f7ff' : undefined,
                  },
                })}
              />
            )}
          </Card>
        </Col>

        {/* ─── Right panel: Assignment editor ─── */}
        <Col xs={24} lg={16}>
          {!selectedEvent ? (
            <Card style={{ height: 'calc(100vh - 180px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty
                image={<GlobalOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
                description={<Text type="secondary">בחר אירוע מהרשימה כדי לנהל שידורי חוץ</Text>}
              />
            </Card>
          ) : (
            <Card
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <GlobalOutlined />
                    <span>
                      {selectedEvent.homeTeam && selectedEvent.awayTeam
                        ? `${selectedEvent.homeTeam} נגד ${selectedEvent.awayTeam}`
                        : selectedEvent.title}
                    </span>
                    {(() => {
                      const st = getExternalBroadcastStatus(selectedEvent);
                      const c = statusColors[st];
                      return (
                        <Tag style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}>
                          {statusLabels[st]}
                        </Tag>
                      );
                    })()}
                  </Space>
                  <Space>
                    <Button onClick={handleNotApplicable} loading={saving}>
                      לא עבורנו
                    </Button>
                    <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
                      שמור
                    </Button>
                  </Space>
                </div>
              }
              style={{ height: 'calc(100vh - 180px)', overflow: 'auto' }}
            >
              {/* Event info strip */}
              <Card size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
                <Row gutter={16}>
                  <Col span={6}><Text type="secondary">תאריך:</Text> {dayjs(selectedEvent.startTime).format('DD/MM/YYYY')}</Col>
                  <Col span={6}><Text type="secondary">שעה:</Text> {dayjs(selectedEvent.startTime).format('HH:mm')}</Col>
                  <Col span={6}><Text type="secondary">ערוץ:</Text> {selectedEvent.channel || '-'}</Col>
                  <Col span={6}>
                    <Text type="secondary">ליגה:</Text> {selectedEvent.league || '-'}
                    {selectedEvent.stage && ` • ${selectedEvent.stage}`}
                  </Col>
                </Row>
              </Card>

              {/* Presets bar */}
              <Card size="small" style={{ marginBottom: 16 }}>
                <Row gutter={8} align="middle">
                  <Col>
                    <Text strong>פריסטים:</Text>
                  </Col>
                  {presets.map(p => (
                    <Col key={p.id}>
                      <Tooltip title={p.description || `${p.roles.length} תפקידים, ${p.equipment.length} ציוד`}>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => applyPreset(p)}
                        >
                          {p.name}
                        </Button>
                      </Tooltip>
                    </Col>
                  ))}
                  <Col>
                    <Button
                      size="small"
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() => openPresetModal()}
                    >
                      שמור כפריסט
                    </Button>
                  </Col>
                  {presets.length > 0 && (
                    <Col>
                      <Button
                        size="small"
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => openPresetModal(presets[0])}
                      >
                        ניהול
                      </Button>
                    </Col>
                  )}
                </Row>
              </Card>

              <Tabs defaultActiveKey="crew">
                <TabPane tab={<span><TeamOutlined /> צוות הפקה</span>} key="crew">
                  <Form form={form} layout="vertical">
                    <Row gutter={[16, 16]}>
                      {FIXED_ROLES.map(role => (
                        <Col key={role.key} xs={24} sm={12}>
                          <Form.Item
                            name={role.key}
                            label={<Space>{role.icon}{role.label}</Space>}
                          >
                            <Select
                              mode="multiple"
                              placeholder={`בחר ${role.label}`}
                              loading={!employeesByRole[role.key]?.length}
                              notFoundContent={`אין ${role.label}ים זמינים`}
                              filterOption={(input, option) => {
                                const emp = employeesByRole[role.key]?.find(e => e.id === option?.value);
                                if (!emp) return false;
                                const name = emp.displayName || `${emp.firstName} ${emp.lastName}`;
                                return name.toLowerCase().includes(input.toLowerCase());
                              }}
                            >
                              {employeesByRole[role.key]?.map(renderEmployeeOption)}
                            </Select>
                          </Form.Item>
                        </Col>
                      ))}
                    </Row>

                    {/* Custom roles */}
                    <Divider orientation="right">תפקידים מותאמים אישית</Divider>

                    <Row gutter={[16, 16]}>
                      {customRoles.map(cr => (
                        <Col key={cr.key} xs={24} sm={12}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Text strong>{cr.label}</Text>
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              onClick={() => removeCustomRole(cr.key)}
                            />
                          </div>
                          <Input
                            placeholder="שמות / מזהים מופרדים בפסיקים"
                            value={cr.assignedIds.join(', ')}
                            onChange={e => {
                              const ids = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                              setCustomRoles(prev =>
                                prev.map(r => r.key === cr.key ? { ...r, assignedIds: ids } : r)
                              );
                            }}
                          />
                        </Col>
                      ))}
                    </Row>

                    <Row gutter={8} style={{ marginTop: 12 }}>
                      <Col flex="auto">
                        <Input
                          placeholder="שם התפקיד החדש (למשל: רחפן, גריפ)"
                          value={newRoleName}
                          onChange={e => setNewRoleName(e.target.value)}
                          onPressEnter={addCustomRole}
                        />
                      </Col>
                      <Col>
                        <Button icon={<PlusOutlined />} onClick={addCustomRole}>
                          הוסף תפקיד
                        </Button>
                      </Col>
                    </Row>
                  </Form>
                </TabPane>

                <TabPane tab={<span><ToolOutlined /> ציוד נדרש</span>} key="equipment">
                  <Table
                    columns={equipmentColumns}
                    dataSource={equipment}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 10 }}
                  />

                  {selectedEquipment.length > 0 && (
                    <Card title="סיכום ציוד נבחר" size="small" style={{ marginTop: 16 }}>
                      <Space wrap>
                        {selectedEquipment.map(item => {
                          const eq = equipment.find(e => e.id === item.id);
                          return eq ? (
                            <Tag key={item.id} color="orange">{eq.name} x{item.quantity}</Tag>
                          ) : null;
                        })}
                      </Space>
                    </Card>
                  )}
                </TabPane>
              </Tabs>
            </Card>
          )}
        </Col>
      </Row>

      {/* ─── Preset Management Modal ─── */}
      <Modal
        title={editingPreset ? 'עריכת פריסט' : 'שמירת פריסט חדש'}
        open={presetModalOpen}
        onCancel={() => { setPresetModalOpen(false); presetForm.resetFields(); }}
        width={700}
        footer={null}
      >
        <Form form={presetForm} layout="vertical" onFinish={handleSavePreset}>
          <Form.Item name="name" label="שם הפריסט" rules={[{ required: true, message: 'חובה' }]}>
            <Input placeholder="למשל: ליגה לאומית - משחק מרכזי" />
          </Form.Item>
          <Form.Item name="description" label="תיאור">
            <Input.TextArea rows={2} placeholder="תיאור אופציונלי..." />
          </Form.Item>
          <Form.Item name="tags" label="תגיות סיווג">
            <Select mode="tags" placeholder="הקלד תגית ולחץ Enter">
              <Option value="כדורגל">כדורגל</Option>
              <Option value="כדורסל">כדורסל</Option>
              <Option value="ליגת העל">ליגת העל</Option>
              <Option value="ליגה לאומית">ליגה לאומית</Option>
            </Select>
          </Form.Item>

          <Divider>הגדרות נוכחיות שיישמרו</Divider>

          <Card size="small" style={{ marginBottom: 16 }}>
            <Text type="secondary">צוות:</Text>
            <div style={{ marginTop: 8 }}>
              {FIXED_ROLES.map(r => {
                const count = form.getFieldValue(r.key)?.length || 0;
                return count > 0 ? (
                  <Tag key={r.key} color="blue">{r.label}: {count}</Tag>
                ) : null;
              })}
              {customRoles.map(cr => (
                <Tag key={cr.key} color="purple">{cr.label}: {cr.assignedIds.length || 1}</Tag>
              ))}
              {!FIXED_ROLES.some(r => (form.getFieldValue(r.key)?.length || 0) > 0) && customRoles.length === 0 && (
                <Text type="secondary">אין תפקידים</Text>
              )}
            </div>
          </Card>

          <Card size="small" style={{ marginBottom: 16 }}>
            <Text type="secondary">ציוד:</Text>
            <div style={{ marginTop: 8 }}>
              {selectedEquipment.length > 0 ? (
                <Space wrap>
                  {selectedEquipment.map(item => {
                    const eq = equipment.find(e => e.id === item.id);
                    return eq ? (
                      <Tag key={item.id} color="orange">{eq.name} x{item.quantity}</Tag>
                    ) : null;
                  })}
                </Space>
              ) : (
                <Text type="secondary">אין ציוד</Text>
              )}
            </div>
          </Card>

          <Space>
            <Button type="primary" htmlType="submit">
              {editingPreset ? 'עדכן פריסט' : 'שמור פריסט'}
            </Button>
            <Button onClick={() => { setPresetModalOpen(false); presetForm.resetFields(); }}>
              ביטול
            </Button>
          </Space>
        </Form>

        {/* Existing presets list for management */}
        {presets.length > 0 && (
          <>
            <Divider>פריסטים קיימים</Divider>
            <List
              size="small"
              dataSource={presets}
              renderItem={p => (
                <List.Item
                  actions={[
                    <Button
                      key="edit"
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditingPreset(p);
                        presetForm.setFieldsValue({
                          name: p.name,
                          description: p.description,
                          tags: p.tags,
                        });
                      }}
                    />,
                    <Popconfirm
                      key="delete"
                      title="למחוק את הפריסט?"
                      onConfirm={() => handleDeletePreset(p.id)}
                    >
                      <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    title={p.name}
                    description={
                      <Space size={4}>
                        {p.roles.map(r => (
                          <Tag key={r.roleKey} size="small">{r.roleLabel}: {r.count}</Tag>
                        ))}
                        {p.equipment.map((e, i) => (
                          <Tag key={i} color="orange" size="small">{e.name}: {e.count}</Tag>
                        ))}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>
    </div>
  );
};

const ExternalBroadcastsPageWithApp: React.FC = () => (
  <App>
    <ExternalBroadcastsPage />
  </App>
);

export default ExternalBroadcastsPageWithApp;
