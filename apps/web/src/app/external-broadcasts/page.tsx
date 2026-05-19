'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Table, Card, Button, Space, Modal, Tag, Row, Col, Typography, Spin, Alert,
  Input, Select, Form, Divider, InputNumber, App, Badge, Tabs, List,
  Popconfirm, Empty, Tooltip, Collapse
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, GlobalOutlined, SearchOutlined,
  LeftOutlined, RightOutlined, ReloadOutlined, ToolOutlined, TeamOutlined,
  VideoCameraOutlined, AudioOutlined, UserOutlined, SaveOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined,
  AppstoreOutlined, CopyOutlined, SettingOutlined, MinusCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { useQuery, useMutation } from '@apollo/client';
import { GET_BROADCAST_EVENTS, GET_EMPLOYEES_BY_DEPARTMENT, GET_DEPARTMENTS, GET_EXTERNAL_BROADCAST_PRESETS, GET_VENUES } from '@/graphql/queries';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, CREATE_EXTERNAL_BROADCAST_PRESET, UPDATE_EXTERNAL_BROADCAST_PRESET, DELETE_EXTERNAL_BROADCAST_PRESET } from '@/graphql/mutations';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import DynamicDepartmentJobsPanel, { AssignmentJob } from '@/components/assignments/DynamicDepartmentJobsPanel';
import VenuesManager from '@/components/externalBroadcasts/VenuesManager';

dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Jerusalem');

const { Title, Text } = Typography;
const { Option } = Select;

// ─── Constants ────────────────────────────────────────────

const EQUIPMENT_CATEGORIES: Record<string, string> = {
  cameras: 'מצלמות',
  batteries: 'סוללות',
  liveu_kits: 'ערכות LIVEU',
  unity_kits: 'ערכות UNITY',
  monitors: 'מוניטורים',
  headphones: 'אוזניות',
  stabilizers: 'מייצבים',
  cards: 'כרטיסים',
  adapters: 'מתאמים',
  matrix_components: 'רכיבי מטריצה',
  other: 'אחר',
};

const FIXED_ROLES: Array<{ key: string; label: string; icon: React.ReactNode; deptCode: string }> = [
  { key: 'cameraman', label: 'צלם', icon: <VideoCameraOutlined />, deptCode: 'CAM' },
  { key: 'soundman', label: 'סאונדמן', icon: <AudioOutlined />, deptCode: 'SOUND' },
  { key: 'producer', label: 'מפיק', icon: <UserOutlined />, deptCode: 'PROD' },
  { key: 'director', label: 'במאי', icon: <UserOutlined />, deptCode: 'DIR' },
];

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

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone?: string;
  systemRole?: string;
  departments?: Array<{ departmentId: string; departmentName: string; roles: string[] }>;
}

interface CrewAssignment {
  roleKey: string;
  roleLabel: string;
  userId: string;
  name: string;
  phone?: string;
  isCustom: boolean;
}

interface UnitSetting {
  unitIndex: number;
  purpose: string;
  audioConfig?: string;
  assignedEquipmentId?: string;
  assignedEquipmentName?: string;
}

interface EquipmentRequest {
  category: string;
  categoryLabel: string;
  count: number;
  unitSettings: UnitSetting[];
}

interface PresetRole {
  roleKey: string;
  roleLabel: string;
  count: number;
  isCustom: boolean;
}

interface PresetEquipment {
  category: string;
  categoryLabel: string;
  count: number;
  unitSettings?: UnitSetting[];
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
  const crew: any[] = customData.productionCrew || deptData.productionCrew || [];
  const equipReqs: any[] = customData.equipmentRequests || deptData.equipmentRequests || [];
  const equipList: any[] = customData.equipmentList || deptData.equipmentList || [];
  const hasEquip = equipReqs.length > 0 || equipList.length > 0;
  if (crew.length >= 2 && hasEquip) return 'complete';
  if (crew.length > 0 || hasEquip) return 'partial';
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

// ─── Main Component ───────────────────────────────────────

const ExternalBroadcastsPage: React.FC = () => {
  const { message: messageApi } = App.useApp();
  const { hasPermission } = useAuth();
  const canManageBroadcasts = hasPermission(Permission.BROADCAST_MANAGE);

  // Navigation
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [searchText, setSearchText] = useState('');

  // Selection
  const [selectedEvent, setSelectedEvent] = useState<BroadcastEvent | null>(null);

  // Crew assignments (dynamic)
  const [crewAssignments, setCrewAssignments] = useState<CrewAssignment[]>([]);
  const [addCrewModalOpen, setAddCrewModalOpen] = useState(false);
  const [newCrewRole, setNewCrewRole] = useState<string>('');
  const [newCrewCustomLabel, setNewCrewCustomLabel] = useState('');
  const [newCrewUserId, setNewCrewUserId] = useState<string>('');
  const [newCrewCount, setNewCrewCount] = useState<number>(1);

  // Equipment requests (category-based)
  const [equipmentRequests, setEquipmentRequests] = useState<EquipmentRequest[]>([]);
  const [newEquipCategory, setNewEquipCategory] = useState<string>('');

  // Admin-configurable dynamic jobs (departments configured in Settings → טפסים).
  const [dynamicJobs, setDynamicJobs] = useState<AssignmentJob[]>([]);

  // Saving
  const [saving, setSaving] = useState(false);

  // Preset management
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [presetForm] = Form.useForm();

  // Department IDs
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

  const { data: departmentsData } = useQuery(GET_DEPARTMENTS);

  const { data: presetsData, refetch: refetchPresets } = useQuery(GET_EXTERNAL_BROADCAST_PRESETS, {
    fetchPolicy: 'cache-and-network',
  });
  const presets: Preset[] = presetsData?.externalBroadcastPresets || [];

  const { data: venuesData } = useQuery(GET_VENUES, {
    variables: { includeInactive: false },
    fetchPolicy: 'cache-and-network',
  });
  const venues: any[] = venuesData?.venues || [];
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === selectedVenueId) || null,
    [venues, selectedVenueId],
  );
  const venuePresets = useMemo(() => {
    if (!selectedVenue) return [] as Preset[];
    const allowed = new Set<string>(selectedVenue.equipmentPresetIds || []);
    return presets.filter((p) => allowed.has(p.id));
  }, [selectedVenue, presets]);

  // Hydrate crew from a venue's saved structure. Each `job` becomes
  // `count` empty slots in the existing crewAssignments shape so the
  // operator only needs to assign the actual people.
  const applyVenueCrewStructure = (structure: any) => {
    if (!structure) return;
    const newCrew: CrewAssignment[] = [];
    for (const job of structure.jobs || []) {
      for (let i = 0; i < (job.count || 1); i++) {
        newCrew.push({
          roleKey: job.roleKey || job.departmentCode || 'role',
          roleLabel: job.roleLabel || job.departmentCode || 'תפקיד',
          userId: '',
          name: job.userName || '',
          isCustom: !job.roleKey,
        });
      }
    }
    setCrewAssignments(newCrew);
    messageApi.success(`מבנה צוות "${structure.name}" הוחל`);
  };

  useEffect(() => {
    if (departmentsData?.departments) {
      const map: Record<string, string> = {};
      departmentsData.departments.forEach((d: any) => { map[d.code] = d.id; });
      setDepartmentIds(map);
    }
  }, [departmentsData]);

  // Employee queries per role department
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

  const employeesByRole: Record<string, Employee[]> = useMemo(() => ({
    cameraman: cameramenData?.users || [],
    soundman: soundmenData?.users || [],
    producer: producersData?.users || [],
    director: directorsData?.users || [],
  }), [cameramenData, soundmenData, producersData, directorsData]);

  const allEmployees = useMemo(() => {
    const seen = new Set<string>();
    const result: Employee[] = [];
    Object.values(employeesByRole).forEach(list => {
      list.forEach(emp => {
        if (!seen.has(emp.id)) {
          seen.add(emp.id);
          result.push(emp);
        }
      });
    });
    return result;
  }, [employeesByRole]);

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
    const dept = selectedEvent.metadata?.departments?.externalBroadcasts || {};
    const cd = dept.customData || {};

    // Load crew
    const crew: any[] = cd.productionCrew || dept.productionCrew || [];
    setCrewAssignments(crew.map((m: any) => ({
      roleKey: m.role || m.roleKey || '',
      roleLabel: m.roleLabel || FIXED_ROLES.find(r => r.key === m.role)?.label || m.role || '',
      userId: m.userId || '',
      name: m.name || '',
      phone: m.phone,
      isCustom: !FIXED_ROLES.find(r => r.key === (m.role || m.roleKey)),
    })));

    // Load equipment requests
    const reqs: any[] = cd.equipmentRequests || dept.equipmentRequests || [];
    if (reqs.length > 0) {
      setEquipmentRequests(reqs.map((r: any) => ({
        category: r.category || '',
        categoryLabel: r.categoryLabel || EQUIPMENT_CATEGORIES[r.category] || r.category || '',
        count: r.count || 0,
        unitSettings: (r.unitSettings || []).map((u: any) => ({
          unitIndex: u.unitIndex ?? 0,
          purpose: u.purpose || '',
          audioConfig: u.audioConfig || '',
        })),
      })));
    } else {
      setEquipmentRequests([]);
    }

    // Load dynamic jobs (admin-configured department list)
    const savedJobs: any[] = cd.dynamicJobs || dept.dynamicJobs || [];
    setDynamicJobs(
      Array.isArray(savedJobs)
        ? savedJobs.map((j: any, i: number) => ({
            uid: `loaded_${i}_${Date.now()}`,
            departmentCode: j.departmentCode,
            roleKey: j.roleKey,
            roleLabel: j.roleLabel,
            count: typeof j.count === 'number' ? j.count : 1,
            userId: j.userId,
            userName: j.userName,
          }))
        : [],
    );
  }, [selectedEvent]);

  // Keep selectedEvent in sync with live data
  useEffect(() => {
    if (selectedEvent && allEvents.length > 0) {
      const updated = allEvents.find(e => e.id === selectedEvent.id);
      if (updated && JSON.stringify(updated.metadata) !== JSON.stringify(selectedEvent.metadata)) {
        setSelectedEvent(updated);
      }
    }
  }, [allEvents]);

  // ─── Crew handlers ─────────────────────────────────────

  const getEmployeesForRole = useCallback((roleKey: string): Employee[] => {
    return employeesByRole[roleKey] || allEmployees;
  }, [employeesByRole, allEmployees]);

  const handleAddCrew = () => {
    const isFixed = FIXED_ROLES.find(r => r.key === newCrewRole);
    const roleKey = isFixed ? newCrewRole : newCrewCustomLabel.trim().replace(/\s+/g, '_').toLowerCase();
    const roleLabel = isFixed ? isFixed.label : newCrewCustomLabel.trim();

    if (!roleKey || !roleLabel) {
      messageApi.warning('יש להזין שם תפקיד');
      return;
    }

    let emp: Employee | undefined;
    if (newCrewUserId) {
      const employees = getEmployeesForRole(newCrewRole);
      emp = employees.find(e => e.id === newCrewUserId) || allEmployees.find(e => e.id === newCrewUserId);
    }

    const count = newCrewUserId ? 1 : Math.max(1, newCrewCount);
    const newEntries: CrewAssignment[] = Array.from({ length: count }, () => ({
      roleKey,
      roleLabel,
      userId: newCrewUserId || '',
      name: emp ? (emp.displayName || `${emp.firstName} ${emp.lastName}`) : '',
      phone: emp?.phone,
      isCustom: !isFixed,
    }));
    setCrewAssignments(prev => [...prev, ...newEntries]);

    setNewCrewRole('');
    setNewCrewCustomLabel('');
    setNewCrewUserId('');
    setNewCrewCount(1);
    setAddCrewModalOpen(false);
  };

  const removeCrew = (index: number) => {
    setCrewAssignments(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Equipment request handlers ────────────────────────

  const addEquipmentRequest = () => {
    if (!newEquipCategory) {
      messageApi.warning('יש לבחור קטגוריה');
      return;
    }
    if (equipmentRequests.find(r => r.category === newEquipCategory)) {
      messageApi.warning('קטגוריה זו כבר קיימת');
      return;
    }
    setEquipmentRequests(prev => [...prev, {
      category: newEquipCategory,
      categoryLabel: EQUIPMENT_CATEGORIES[newEquipCategory] || newEquipCategory,
      count: 1,
      unitSettings: [{ unitIndex: 0, purpose: '', audioConfig: '' }],
    }]);
    setNewEquipCategory('');
  };

  const updateEquipmentCount = (category: string, count: number) => {
    setEquipmentRequests(prev => prev.map(req => {
      if (req.category !== category) return req;
      const newSettings = [...req.unitSettings];
      if (count > newSettings.length) {
        for (let i = newSettings.length; i < count; i++) {
          newSettings.push({ unitIndex: i, purpose: '', audioConfig: '' });
        }
      } else {
        newSettings.length = count;
      }
      return { ...req, count, unitSettings: newSettings };
    }));
  };

  const updateUnitSetting = (category: string, unitIndex: number, field: 'purpose' | 'audioConfig', value: string) => {
    setEquipmentRequests(prev => prev.map(req => {
      if (req.category !== category) return req;
      const newSettings = req.unitSettings.map(u =>
        u.unitIndex === unitIndex ? { ...u, [field]: value } : u
      );
      return { ...req, unitSettings: newSettings };
    }));
  };

  const removeEquipmentRequest = (category: string) => {
    setEquipmentRequests(prev => prev.filter(r => r.category !== category));
  };

  // ─── Save handler ───────────────────────────────────────

  const handleSave = async () => {
    if (!selectedEvent) return;
    if (!canManageBroadcasts) {
      messageApi.error('אין לך הרשאה לשנות שידורים');
      return;
    }

    setSaving(true);
    try {
      const productionCrew = crewAssignments.map(c => ({
        role: c.roleKey,
        roleLabel: c.roleLabel,
        userId: c.userId,
        name: c.name,
        phone: c.phone,
        isCustom: c.isCustom,
      }));

      const eqRequests = equipmentRequests.map(r => ({
        category: r.category,
        categoryLabel: r.categoryLabel,
        count: r.count,
        unitSettings: r.unitSettings.map(u => ({
          unitIndex: u.unitIndex,
          purpose: u.purpose,
          audioConfig: u.audioConfig || undefined,
        })),
      }));

      await updateDepartmentData({
        variables: {
          eventId: selectedEvent.id,
          department: 'externalBroadcasts',
          data: {
            customData: {
              productionCrew,
              equipmentRequests: eqRequests,
              dynamicJobs: dynamicJobs.map((j) => ({
                departmentCode: j.departmentCode,
                roleKey: j.roleKey,
                roleLabel: j.roleLabel,
                count: j.count || 1,
                userId: j.userId,
                userName: j.userName,
              })),
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
    if (!canManageBroadcasts) {
      messageApi.error('אין לך הרשאה לשנות שידורים');
      return;
    }

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

  // ─── Apply preset ───────────────────────────────────────

  const applyPreset = (preset: Preset) => {
    // Apply crew roles as empty slots (no specific people)
    const newCrew: CrewAssignment[] = [];
    preset.roles.forEach(r => {
      for (let i = 0; i < r.count; i++) {
        newCrew.push({
          roleKey: r.roleKey,
          roleLabel: r.roleLabel,
          userId: '',
          name: '',
          isCustom: r.isCustom,
        });
      }
    });
    setCrewAssignments(newCrew);

    // Apply equipment requests with settings
    const newEquip: EquipmentRequest[] = preset.equipment.map(pe => ({
      category: pe.category,
      categoryLabel: pe.categoryLabel,
      count: pe.count,
      unitSettings: pe.unitSettings?.length
        ? pe.unitSettings.map(u => ({ unitIndex: u.unitIndex, purpose: u.purpose || '', audioConfig: u.audioConfig || '' }))
        : Array.from({ length: pe.count }, (_, i) => ({ unitIndex: i, purpose: '', audioConfig: '' })),
    }));
    setEquipmentRequests(newEquip);

    messageApi.success(`פריסט "${preset.name}" הוחל בהצלחה`);
  };

  // ─── Preset CRUD ────────────────────────────────────────

  const openPresetModal = (preset?: Preset) => {
    if (!canManageBroadcasts) {
      messageApi.error('אין לך הרשאה לנהל פריסטים');
      return;
    }

    setEditingPreset(preset || null);
    if (preset) {
      presetForm.setFieldsValue({ name: preset.name, description: preset.description, tags: preset.tags });
    } else {
      presetForm.resetFields();
    }
    setPresetModalOpen(true);
  };

  const handleSavePreset = async () => {
    if (!canManageBroadcasts) {
      messageApi.error('אין לך הרשאה לנהל פריסטים');
      return;
    }

    try {
      const values = await presetForm.validateFields();

      // Build roles from current crew assignments
      const roleCounts: Record<string, { label: string; count: number; isCustom: boolean }> = {};
      crewAssignments.forEach(c => {
        if (!roleCounts[c.roleKey]) {
          roleCounts[c.roleKey] = { label: c.roleLabel, count: 0, isCustom: c.isCustom };
        }
        roleCounts[c.roleKey].count++;
      });
      const roles: PresetRole[] = Object.entries(roleCounts).map(([key, v]) => ({
        roleKey: key,
        roleLabel: v.label,
        count: v.count,
        isCustom: v.isCustom,
      }));

      const presetEquipment: PresetEquipment[] = equipmentRequests.map(r => ({
        category: r.category,
        categoryLabel: r.categoryLabel,
        count: r.count,
        unitSettings: r.unitSettings.map(u => ({
          unitIndex: u.unitIndex,
          purpose: u.purpose,
          audioConfig: u.audioConfig || undefined,
        })),
      }));

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
    if (!canManageBroadcasts) {
      messageApi.error('אין לך הרשאה למחוק פריסטים');
      return;
    }

    try {
      await deletePreset({ variables: { id: presetId } });
      messageApi.success('הפריסט נמחק');
      await refetchPresets();
    } catch (err: any) {
      messageApi.error(`שגיאה במחיקת פריסט: ${err.message}`);
    }
  };

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

  // ─── Crew list grouped by role ──────────────────────────

  const crewByRole = useMemo(() => {
    const grouped: Record<string, CrewAssignment[]> = {};
    crewAssignments.forEach(c => {
      if (!grouped[c.roleKey]) grouped[c.roleKey] = [];
      grouped[c.roleKey].push(c);
    });
    return grouped;
  }, [crewAssignments]);

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

      {/* Venues / stadiums manager — collapsible so it doesn't push the
          event list below the fold by default. */}
      <Collapse
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'venues',
            label: (
              <Space>
                <GlobalOutlined />
                <span>אולמות / מקומות שידור</span>
              </Space>
            ),
            children: <VenuesManager />,
          },
        ]}
      />

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
                  {canManageBroadcasts && (
                    <Space>
                      <Button onClick={handleNotApplicable} loading={saving}>לא עבורנו</Button>
                      <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>שמור</Button>
                    </Space>
                  )}
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

              {/* Venue picker — selecting a venue narrows the presets bar
                  below to its linked equipment presets and exposes its
                  pre-defined crew structures for one-click hydration. */}
              <Card size="small" style={{ marginBottom: 8 }}>
                <Row gutter={8} align="middle">
                  <Col><Text strong>אולם:</Text></Col>
                  <Col flex="200px">
                    <Select
                      placeholder="בחר אולם"
                      value={selectedVenueId || undefined}
                      onChange={(v) => setSelectedVenueId(v || null)}
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      style={{ width: '100%' }}
                      options={venues.map((v) => ({
                        value: v.id,
                        label: v.hebrewName || v.name,
                      }))}
                    />
                  </Col>
                  {selectedVenue && (
                    <>
                      <Col>
                        <Text type="secondary">
                          {selectedVenue.city || ''} {selectedVenue.address || ''}
                        </Text>
                      </Col>
                      {(selectedVenue.crewStructures || []).map((s: any, i: number) => (
                        <Col key={i}>
                          <Button
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => applyVenueCrewStructure(s)}
                          >
                            {s.name}
                          </Button>
                        </Col>
                      ))}
                    </>
                  )}
                </Row>
              </Card>

              {/* Presets bar — if a venue is selected we show only its
                  linked presets; otherwise we show every preset. */}
              <Card size="small" style={{ marginBottom: 16 }}>
                <Row gutter={8} align="middle">
                  <Col><Text strong>פריסטים{selectedVenue ? ' (לפי אולם)' : ''}:</Text></Col>
                  {(selectedVenue ? venuePresets : presets).length === 0 && selectedVenue && (
                    <Col>
                      <Text type="secondary">לאולם זה לא מקושרות תבניות ציוד</Text>
                    </Col>
                  )}
                  {(selectedVenue ? venuePresets : presets).map(p => (
                    <Col key={p.id}>
                      <Tooltip title={p.description || `${p.roles.length} תפקידים, ${p.equipment.length} קטגוריות ציוד`}>
                        <Button size="small" icon={<CopyOutlined />} onClick={() => applyPreset(p)}>
                          {p.name}
                        </Button>
                      </Tooltip>
                    </Col>
                  ))}
                  {canManageBroadcasts && (
                    <Col>
                      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => openPresetModal()}>
                        שמור כפריסט
                      </Button>
                    </Col>
                  )}
                  {canManageBroadcasts && presets.length > 0 && (
                    <Col>
                      <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openPresetModal(presets[0])}>
                        ניהול
                      </Button>
                    </Col>
                  )}
                </Row>
              </Card>

              <Tabs
                defaultActiveKey="crew"
                items={[
                  {
                    key: 'crew',
                    label: <span><TeamOutlined /> צוות הפקה ({crewAssignments.length})</span>,
                    children: (
                      <div>
                        {/* Crew list grouped by role */}
                        {Object.entries(crewByRole).length === 0 && (
                          <Empty description="לא הוקצו אנשי צוות" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}

                        {Object.entries(crewByRole).map(([roleKey, members]) => {
                          const fixedRole = FIXED_ROLES.find(r => r.key === roleKey);
                          return (
                            <Card key={roleKey} size="small" style={{ marginBottom: 8 }}
                              title={
                                <Space>
                                  {fixedRole?.icon || <UserOutlined />}
                                  <Text strong>{members[0]?.roleLabel || roleKey}</Text>
                                  <Badge count={members.length} style={{ backgroundColor: '#1890ff' }} />
                                </Space>
                              }
                            >
                              {members.map((member, idx) => {
                                const globalIdx = crewAssignments.indexOf(member);
                                return (
                                  <div key={globalIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: idx < members.length - 1 ? '1px solid #f0f0f0' : undefined }}>
                                    <Space>
                                      <UserOutlined />
                                      {member.userId ? (
                                        <Text>{member.name}</Text>
                                      ) : (
                                        <Text type="secondary" italic>לא הוקצה</Text>
                                      )}
                                      {member.phone && <Text type="secondary" style={{ fontSize: 12 }}>{member.phone}</Text>}
                                    </Space>
                                    {canManageBroadcasts && (
                                      <Button type="text" danger size="small" icon={<MinusCircleOutlined />} onClick={() => removeCrew(globalIdx)} />
                                    )}
                                  </div>
                                );
                              })}
                            </Card>
                          );
                        })}

                        {canManageBroadcasts && (
                          <Button
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={() => setAddCrewModalOpen(true)}
                            style={{ width: '100%', marginTop: 12 }}
                          >
                            הוסף איש צוות
                          </Button>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'dynamic-jobs',
                    label: <span><AppstoreOutlined /> משימות לפי מחלקות ({dynamicJobs.length})</span>,
                    children: (
                      <DynamicDepartmentJobsPanel
                        formKey="externalBroadcasts"
                        value={dynamicJobs}
                        onChange={canManageBroadcasts ? setDynamicJobs : () => {}}
                        title="משימות שיוך לפי הגדרת מחלקות"
                      />
                    ),
                  },
                  {
                    key: 'equipment',
                    label: <span><ToolOutlined /> ציוד נדרש ({equipmentRequests.reduce((s, r) => s + r.count, 0)})</span>,
                    children: (
                      <div>
                        {/* Add equipment request */}
                        <Row gutter={8} style={{ marginBottom: 16 }}>
                          <Col flex="auto">
                            <Select
                              placeholder="בחר קטגוריית ציוד"
                              value={newEquipCategory || undefined}
                              onChange={setNewEquipCategory}
                              disabled={!canManageBroadcasts}
                              style={{ width: '100%' }}
                              showSearch
                              filterOption={(input, option) =>
                                (option?.children as unknown as string)?.includes(input) ?? false
                              }
                            >
                              {Object.entries(EQUIPMENT_CATEGORIES)
                                .filter(([cat]) => !equipmentRequests.find(r => r.category === cat))
                                .map(([cat, label]) => (
                                  <Option key={cat} value={cat}>{label}</Option>
                                ))}
                            </Select>
                          </Col>
                          {canManageBroadcasts && (
                            <Col>
                              <Button icon={<PlusOutlined />} onClick={addEquipmentRequest}>הוסף</Button>
                            </Col>
                          )}
                        </Row>

                        {equipmentRequests.length === 0 && (
                          <Empty description="לא הוגדרו דרישות ציוד" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}

                        {/* Equipment request cards with settings map */}
                        {equipmentRequests.map(req => (
                          <Card
                            key={req.category}
                            size="small"
                            style={{ marginBottom: 12 }}
                            title={
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Space>
                                  <ToolOutlined />
                                  <Text strong>{req.categoryLabel}</Text>
                                </Space>
                                <Space>
                                  <Text type="secondary">כמות:</Text>
                                  <InputNumber
                                    min={1}
                                    max={50}
                                    value={req.count}
                                    onChange={v => updateEquipmentCount(req.category, v || 1)}
                                    disabled={!canManageBroadcasts}
                                    size="small"
                                  />
                                  {canManageBroadcasts && (
                                    <Button
                                      type="text"
                                      danger
                                      size="small"
                                      icon={<DeleteOutlined />}
                                      onClick={() => removeEquipmentRequest(req.category)}
                                    />
                                  )}
                                </Space>
                              </div>
                            }
                          >
                            <Collapse
                              ghost
                              items={[{
                                key: 'settings',
                                label: (
                                  <Space>
                                    <SettingOutlined />
                                    <Text type="secondary">מפת הגדרות ({req.unitSettings.filter(u => u.purpose).length}/{req.count})</Text>
                                  </Space>
                                ),
                                children: (
                                  <div>
                                    {req.unitSettings.map((unit, idx) => (
                                      <Row key={idx} gutter={8} style={{ marginBottom: 8, alignItems: 'center' }}>
                                        <Col style={{ width: 40 }}>
                                          <Tag>{idx + 1}</Tag>
                                        </Col>
                                        <Col flex="auto">
                                          <Input
                                            placeholder="תפקיד / ייעוד"
                                            value={unit.purpose}
                                            onChange={e => updateUnitSetting(req.category, unit.unitIndex, 'purpose', e.target.value)}
                                            disabled={!canManageBroadcasts}
                                            size="small"
                                          />
                                        </Col>
                                        {req.category === 'cameras' && (
                                          <Col flex="auto">
                                            <Input
                                              placeholder="הגדרת אודיו"
                                              prefix={<AudioOutlined />}
                                              value={unit.audioConfig || ''}
                                              onChange={e => updateUnitSetting(req.category, unit.unitIndex, 'audioConfig', e.target.value)}
                                              disabled={!canManageBroadcasts}
                                              size="small"
                                            />
                                          </Col>
                                        )}
                                      </Row>
                                    ))}
                                  </div>
                                ),
                              }]}
                            />
                          </Card>
                        ))}

                        {/* Summary */}
                        {equipmentRequests.length > 0 && (
                          <Card title="סיכום דרישות ציוד" size="small" style={{ marginTop: 16 }}>
                            <Space wrap>
                              {equipmentRequests.map(r => (
                                <Tag key={r.category} color="orange">{r.categoryLabel} x{r.count}</Tag>
                              ))}
                            </Space>
                          </Card>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </Col>
      </Row>

      {/* ─── Add Crew Member Modal ─── */}
      <Modal
        title="הוסף איש צוות"
        open={addCrewModalOpen}
        onCancel={() => { setAddCrewModalOpen(false); setNewCrewRole(''); setNewCrewCustomLabel(''); setNewCrewUserId(''); setNewCrewCount(1); }}
        onOk={handleAddCrew}
        okText="הוסף"
        cancelText="ביטול"
      >
        <Form layout="vertical">
          <Form.Item label="תפקיד">
            <Select
              placeholder="בחר תפקיד"
              value={newCrewRole || undefined}
              onChange={v => { setNewCrewRole(v); setNewCrewCustomLabel(''); setNewCrewUserId(''); }}
            >
              {FIXED_ROLES.map(r => (
                <Option key={r.key} value={r.key}>
                  <Space>{r.icon}{r.label}</Space>
                </Option>
              ))}
              <Option value="__custom__">
                <Space><EditOutlined />תפקיד מותאם אישית</Space>
              </Option>
            </Select>
          </Form.Item>

          {newCrewRole === '__custom__' && (
            <Form.Item label="שם התפקיד">
              <Input
                placeholder="למשל: רחפן, גריפ, עוזר במאי"
                value={newCrewCustomLabel}
                onChange={e => setNewCrewCustomLabel(e.target.value)}
              />
            </Form.Item>
          )}

          <Form.Item label="איש צוות (אופציונלי - השאר ריק ליצירת משבצת פנויה)">
            <Select
              placeholder="בחר איש צוות או השאר ריק"
              value={newCrewUserId || undefined}
              onChange={setNewCrewUserId}
              allowClear
              showSearch
              filterOption={(input, option) => {
                const label = option?.children as unknown as string;
                return typeof label === 'string' && label.toLowerCase().includes(input.toLowerCase());
              }}
            >
              {(newCrewRole && newCrewRole !== '__custom__'
                ? getEmployeesForRole(newCrewRole)
                : allEmployees
              ).map(emp => (
                <Option key={emp.id} value={emp.id}>
                  {emp.displayName || `${emp.firstName} ${emp.lastName}`}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {!newCrewUserId && (
            <Form.Item label="כמות משבצות">
              <InputNumber
                min={1}
                max={20}
                value={newCrewCount}
                onChange={v => setNewCrewCount(v || 1)}
                style={{ width: '100%' }}
              />
              <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                ניתן להוסיף מספר משבצות ריקות בבת אחת (למשל 5 צלמים)
              </Text>
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* ─── Preset Management Modal ─── */}
      <Modal
        title={editingPreset ? 'עריכת פריסט' : 'שמירת פריסט חדש'}
        open={presetModalOpen}
        onCancel={() => { setPresetModalOpen(false); presetForm.resetFields(); }}
        width={700}
        footer={null}
        forceRender
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
              {Object.entries(crewByRole).map(([roleKey, members]) => (
                <Tag key={roleKey} color={members[0]?.isCustom ? 'purple' : 'blue'}>
                  {members[0]?.roleLabel}: {members.length}
                </Tag>
              ))}
              {crewAssignments.length === 0 && <Text type="secondary">אין צוות</Text>}
            </div>
          </Card>

          <Card size="small" style={{ marginBottom: 16 }}>
            <Text type="secondary">ציוד:</Text>
            <div style={{ marginTop: 8 }}>
              {equipmentRequests.length > 0 ? (
                <Space wrap>
                  {equipmentRequests.map(r => (
                    <Tooltip key={r.category} title={r.unitSettings.filter(u => u.purpose).length > 0 ? `${r.unitSettings.filter(u => u.purpose).length} יחידות עם הגדרות` : undefined}>
                      <Tag color="orange">{r.categoryLabel} x{r.count}</Tag>
                    </Tooltip>
                  ))}
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
            <Button onClick={() => { setPresetModalOpen(false); presetForm.resetFields(); }}>ביטול</Button>
          </Space>
        </Form>

        {/* Existing presets list */}
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
                        presetForm.setFieldsValue({ name: p.name, description: p.description, tags: p.tags });
                      }}
                    />,
                    <Popconfirm key="delete" title="למחוק את הפריסט?" onConfirm={() => handleDeletePreset(p.id)}>
                      <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    title={p.name}
                    description={
                      <Space size={4} wrap>
                        {p.roles.map(r => (
                          <Tag key={r.roleKey}>{r.roleLabel}: {r.count}</Tag>
                        ))}
                        {p.equipment.map((e, i) => (
                          <Tag key={i} color="orange">{e.categoryLabel} x{e.count}</Tag>
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
  <ProtectedRoute requires={Permission.BROADCAST_VIEW}>
    <App>
      <ExternalBroadcastsPage />
    </App>
  </ProtectedRoute>
);

export default ExternalBroadcastsPageWithApp;
