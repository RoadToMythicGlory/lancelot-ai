'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  App, Card, Button, Space, Modal, Tag, Row, Col, Typography, Input, Select, Form,
  Divider, InputNumber, Badge, Collapse, Empty, Tooltip, Alert, List, Popconfirm,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ToolOutlined,
  TeamOutlined, VideoCameraOutlined, AudioOutlined, UserOutlined, SaveOutlined,
  AppstoreOutlined, CopyOutlined, SettingOutlined, MinusCircleOutlined, HolderOutlined,
} from '@ant-design/icons';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { useDraggable } from '@dnd-kit/core';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, CREATE_EXTERNAL_BROADCAST_PRESET, UPDATE_EXTERNAL_BROADCAST_PRESET, DELETE_EXTERNAL_BROADCAST_PRESET } from '@/graphql/mutations';
import { GET_ASSIGNMENT_FORM_CONFIG } from '@/graphql/queries';

const slugifyRole = (label: string) => label.trim().replace(/\s+/g, '_').toLowerCase();
import DynamicDepartmentJobsPanel, { AssignmentJob } from '@/components/assignments/DynamicDepartmentJobsPanel';
import { AssignmentStatusControl } from '@/components/externalBroadcasts/AssignmentStatusControl';
import { OperationsTab } from '@/components/externalBroadcasts/OperationsTab';
import { resolveEquipmentLines, SubstitutionInput } from '@/utils/equipmentSubstitution';
import { ensureAvailabilityOk } from '@/components/shifts/availabilityWarning';
import {
  type ExternalBroadcastAssignmentStatus,
  type ExternalBroadcastCustomData,
} from '@/utils/externalBroadcastDomain';

const { Text } = Typography;
const { Option } = Select;

export const FIXED_ROLES: Array<{ key: string; label: string; icon: React.ReactNode; deptCode: string }> = [
  { key: 'cameraman', label: 'צלם', icon: <VideoCameraOutlined />, deptCode: 'CAM' },
  { key: 'soundman', label: 'סאונדמן', icon: <AudioOutlined />, deptCode: 'SOUND' },
  { key: 'producer', label: 'מפיק', icon: <UserOutlined />, deptCode: 'PROD' },
  { key: 'director', label: 'במאי', icon: <UserOutlined />, deptCode: 'DIR' },
];

export interface CrewAssignment {
  roleKey: string;
  roleLabel: string;
  userId: string;
  name: string;
  phone?: string;
  isCustom: boolean;
}

interface EquipmentLineItem {
  equipmentId: string;
  equipmentName: string;
  category: string;
  categoryLabel: string;
  quantity: number;
  purpose?: string;
  audioConfig?: string;
}

interface LegacyEquipmentRequest {
  category: string;
  categoryLabel: string;
  count: number;
  unitSettings?: any[];
}

export interface PresetRole { roleKey: string; roleLabel: string; count: number; isCustom: boolean; }
export interface PresetEquipment {
  equipmentId?: string; equipmentName?: string; category: string; categoryLabel: string;
  quantity?: number; purpose?: string; audioConfig?: string; count?: number; unitSettings?: any[];
}
export interface Preset {
  id: string; name: string; description?: string; tags?: string[];
  roles: PresetRole[]; equipment: PresetEquipment[]; createdAt?: string; updatedAt?: string;
}

export const isLegacyPresetEquipment = (e: PresetEquipment): boolean => !e.equipmentId;
export const isLegacyPreset = (p: Preset): boolean => p.equipment.some(isLegacyPresetEquipment);

const AUDIO_CONFIG_CATEGORIES = new Set(['cameras', 'camera']);

// ─── Draggable crew chip ──────────────────────────────────
// Each assigned crew member is draggable onto another event row to move
// them across events. Empty/unassigned slots are not draggable.

const DraggableCrewChip: React.FC<{
  eventId: string;
  index: number;
  member: CrewAssignment;
  canManage: boolean;
  employees: any[];
  onRemove: () => void;
  onAssign: (userId: string) => void;
}> = ({ eventId, index, member, canManage, employees, onRemove, onAssign }) => {
  const draggable = canManage && !!member.userId;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `crew:${eventId}:${index}`,
    data: { type: 'crew', eventId, index, member },
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '6px 8px',
        marginBottom: 6,
        borderRadius: 6,
        border: '1px solid #f0f0f0',
        background: isDragging ? '#e6f7ff' : member.userId ? '#fff' : '#fffbe6',
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <Space size={6} style={{ flex: '0 0 auto' }}>
        {draggable ? (
          <span {...listeners} {...attributes} style={{ cursor: 'grab', color: '#bbb' }}>
            <HolderOutlined />
          </span>
        ) : (
          <UserOutlined style={{ color: '#bbb' }} />
        )}
      </Space>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        {canManage ? (
          <Select
            showSearch
            allowClear
            size="small"
            style={{ width: '100%' }}
            placeholder="בחר איש צוות..."
            value={member.userId || undefined}
            onChange={(v) => onAssign(v || '')}
            optionFilterProp="label"
            filterOption={(input, option: any) =>
              String(option?.label || '').toLowerCase().includes(input.toLowerCase())
            }
            options={employees.map((emp: any) => ({
              value: emp.id,
              label: emp.displayName || `${emp.firstName} ${emp.lastName}`,
            }))}
          />
        ) : member.userId ? (
          <Text>{member.name}</Text>
        ) : (
          <Text type="secondary" italic>לא הוקצה</Text>
        )}
      </div>
      {member.phone && <Text type="secondary" style={{ fontSize: 12, flex: '0 0 auto' }}>{member.phone}</Text>}
      {canManage && (
        <Button type="text" danger size="small" icon={<MinusCircleOutlined />} onClick={onRemove} style={{ flex: '0 0 auto' }} />
      )}
    </div>
  );
};

// ─── Imperative API exposed to the parent for cross-event DnD ──────────

export interface EditorApi {
  getCrew: () => CrewAssignment[];
  setCrewAndPersist: (next: CrewAssignment[]) => Promise<void>;
}

export interface EventEditorPanelProps {
  event: any;
  canManage: boolean;
  presets: Preset[];
  venues: any[];
  pickerEquipment: any[];
  pickerEquipmentById: Map<string, any>;
  groupedPickerOptions: any[];
  pickerLoading: boolean;
  refetchPicker: () => Promise<any>;
  employeesByRole: Record<string, any[]>;
  allEmployees: any[];
  getEmployeesForRole: (roleKey: string) => any[];
  categoryLabelOf: (slug: string) => string;
  equipmentCategoryOptions: any[];
  onSaved: () => void;
  onPresetsChanged: () => void;
  registerEditor: (eventId: string, api: EditorApi | null) => void;
}

export const EventEditorPanel = forwardRef<EditorApi, EventEditorPanelProps>(function EventEditorPanel(props, ref) {
  const {
    event, canManage, presets, venues, pickerEquipment, pickerEquipmentById,
    groupedPickerOptions, pickerLoading, refetchPicker, employeesByRole, allEmployees,
    getEmployeesForRole, categoryLabelOf, onSaved, onPresetsChanged, registerEditor,
  } = props;

  const { message: messageApi, modal } = App.useApp();
  const apolloClient = useApolloClient();

  const [crewAssignments, setCrewAssignments] = useState<CrewAssignment[]>([]);
  const [addCrewModalOpen, setAddCrewModalOpen] = useState(false);
  const [newCrewRole, setNewCrewRole] = useState<string>('');
  const [newCrewCustomLabel, setNewCrewCustomLabel] = useState('');
  const [newCrewUserId, setNewCrewUserId] = useState<string>('');
  const [newCrewCount, setNewCrewCount] = useState<number>(1);

  const [equipmentItems, setEquipmentItems] = useState<EquipmentLineItem[]>([]);
  const [legacyEquipmentRequests, setLegacyEquipmentRequests] = useState<LegacyEquipmentRequest[]>([]);
  const [newEquipmentId, setNewEquipmentId] = useState<string>('');

  const [dynamicJobs, setDynamicJobs] = useState<AssignmentJob[]>([]);
  const [opsCustomData, setOpsCustomData] = useState<ExternalBroadcastCustomData>({});
  const [saving, setSaving] = useState(false);

  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [presetForm] = Form.useForm();

  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const [updateDepartmentData] = useMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA);
  const [createPreset] = useMutation(CREATE_EXTERNAL_BROADCAST_PRESET);
  const [updatePreset] = useMutation(UPDATE_EXTERNAL_BROADCAST_PRESET);
  const [deletePreset] = useMutation(DELETE_EXTERNAL_BROADCAST_PRESET);

  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === selectedVenueId) || null,
    [venues, selectedVenueId],
  );
  const venuePresets = useMemo(() => {
    if (!selectedVenue) return [] as Preset[];
    const allowed = new Set<string>(selectedVenue.equipmentPresetIds || []);
    return presets.filter((p) => allowed.has(p.id));
  }, [selectedVenue, presets]);

  // ─── Load existing data from the event ──────────────────
  // The parent polls every 10s and rebuilds event objects, so `event`
  // changes identity even when nothing changed on the server. Guard the
  // (re)load on a content snapshot of the External Broadcasts metadata so
  // background polls don't wipe unsaved edits in an open editor; we only
  // reload when the event id changes or the EB data actually differs.
  const lastLoadedRef = useRef<string>('');
  useEffect(() => {
    const dept = event.metadata?.departments?.externalBroadcasts || {};
    const snapshot = `${event.id}::${JSON.stringify(dept)}`;
    if (snapshot === lastLoadedRef.current) return;
    lastLoadedRef.current = snapshot;
    const cd = dept.customData || {};

    const crew: any[] = cd.productionCrew || dept.productionCrew || [];
    setCrewAssignments(crew.map((m: any) => ({
      roleKey: m.role || m.roleKey || '',
      roleLabel: m.roleLabel || FIXED_ROLES.find(r => r.key === m.role)?.label || m.role || '',
      userId: m.userId || '',
      name: m.name || '',
      phone: m.phone,
      isCustom: !FIXED_ROLES.find(r => r.key === (m.role || m.roleKey)),
    })));

    const itemsRaw: any[] = cd.equipmentList || dept.equipmentList || [];
    const legacyRaw: any[] = cd.equipmentRequests || dept.equipmentRequests || [];
    if (itemsRaw.length > 0) {
      setEquipmentItems(itemsRaw.map((it: any) => ({
        equipmentId: it.equipmentId || '',
        equipmentName: it.equipmentName || it.name || '',
        category: it.category || '',
        categoryLabel: it.categoryLabel || categoryLabelOf(it.category) || it.category || '',
        quantity: typeof it.quantity === 'number' ? it.quantity : 1,
        purpose: it.purpose || '',
        audioConfig: it.audioConfig || '',
      })));
      setLegacyEquipmentRequests([]);
    } else {
      setEquipmentItems([]);
      setLegacyEquipmentRequests(legacyRaw.map((r: any) => ({
        category: r.category || '',
        categoryLabel: r.categoryLabel || categoryLabelOf(r.category) || r.category || '',
        count: typeof r.count === 'number' ? r.count : 0,
        unitSettings: Array.isArray(r.unitSettings) ? r.unitSettings : undefined,
      })));
    }

    const savedJobs: any[] = cd.dynamicJobs || dept.dynamicJobs || [];
    setDynamicJobs(Array.isArray(savedJobs) ? savedJobs.map((j: any, i: number) => ({
      uid: `loaded_${i}_${Date.now()}`,
      departmentCode: j.departmentCode,
      roleKey: j.roleKey,
      roleLabel: j.roleLabel,
      count: typeof j.count === 'number' ? j.count : 1,
      userId: j.userId,
      userName: j.userName,
    })) : []);

    setOpsCustomData({
      assignmentStatus: cd.assignmentStatus || 'live',
      isDoubleBroadcast: !!cd.isDoubleBroadcast,
      secondaryControlRoomId: cd.secondaryControlRoomId,
      secondaryControlRoomName: cd.secondaryControlRoomName,
      manualDisplayOrder: cd.manualDisplayOrder,
      controlCheck: cd.controlCheck || cd.offtube || {},
      documents: cd.documents || {},
      finance: cd.finance || {},
      nevionRequest: cd.nevionRequest,
      liveuActivation: cd.liveuActivation,
      excludedFromOperations: cd.excludedFromOperations,
      excludedAt: cd.excludedAt,
      excludedByName: cd.excludedByName,
      excludeReason: cd.excludeReason,
    });
  }, [event, categoryLabelOf]);

  // Persist only the productionCrew field (used by cross-event DnD).
  const persistCrewOnly = useCallback(async (crew: CrewAssignment[]) => {
    await updateDepartmentData({
      variables: {
        eventId: event.id,
        department: 'externalBroadcasts',
        data: {
          customData: {
            productionCrew: crew.map(c => ({
              role: c.roleKey, roleLabel: c.roleLabel, userId: c.userId,
              name: c.name, phone: c.phone, isCustom: c.isCustom,
            })),
          },
        },
      },
    });
  }, [event.id, updateDepartmentData]);

  // Expose imperative API to the parent for drag-and-drop.
  const crewRef = useRef<CrewAssignment[]>(crewAssignments);
  crewRef.current = crewAssignments;
  useImperativeHandle(ref, () => ({
    getCrew: () => crewRef.current,
    setCrewAndPersist: async (next: CrewAssignment[]) => {
      setCrewAssignments(next);
      await persistCrewOnly(next);
    },
  }), [persistCrewOnly]);

  useEffect(() => {
    const api: EditorApi = {
      getCrew: () => crewRef.current,
      setCrewAndPersist: async (next: CrewAssignment[]) => {
        setCrewAssignments(next);
        await persistCrewOnly(next);
      },
    };
    registerEditor(event.id, api);
    return () => registerEditor(event.id, null);
  }, [event.id, persistCrewOnly, registerEditor]);

  // ─── Crew handlers ─────────────────────────────────────
  const handleAddCrew = () => {
    const isFixed = FIXED_ROLES.find(r => r.key === newCrewRole);
    const roleKey = isFixed ? newCrewRole : newCrewCustomLabel.trim().replace(/\s+/g, '_').toLowerCase();
    const roleLabel = isFixed ? isFixed.label : newCrewCustomLabel.trim();
    if (!roleKey || !roleLabel) { messageApi.warning('יש להזין שם תפקיד'); return; }
    let emp: any;
    if (newCrewUserId) {
      const employees = getEmployeesForRole(newCrewRole);
      emp = employees.find((e: any) => e.id === newCrewUserId) || allEmployees.find((e: any) => e.id === newCrewUserId);
    }
    const count = newCrewUserId ? 1 : Math.max(1, newCrewCount);
    const newEntries: CrewAssignment[] = Array.from({ length: count }, () => ({
      roleKey, roleLabel,
      userId: newCrewUserId || '',
      name: emp ? (emp.displayName || `${emp.firstName} ${emp.lastName}`) : '',
      phone: emp?.phone,
      isCustom: !isFixed,
    }));
    setCrewAssignments(prev => [...prev, ...newEntries]);
    setNewCrewRole(''); setNewCrewCustomLabel(''); setNewCrewUserId(''); setNewCrewCount(1);
    setAddCrewModalOpen(false);
  };

  const removeCrew = (index: number) => {
    setCrewAssignments(prev => prev.filter((_, i) => i !== index));
  };

  // Add one more empty slot for an existing role (the per-role "+").
  const addEmptyCrewSlot = (roleKey: string, roleLabel: string, isCustom: boolean) => {
    setCrewAssignments(prev => [...prev, { roleKey, roleLabel, userId: '', name: '', isCustom }]);
  };

  // Inline assign / change / clear the person on a specific crew slot.
  const assignCrewUser = (index: number, userId: string) => {
    setCrewAssignments(prev => prev.map((c, i) => {
      if (i !== index) return c;
      if (!userId) return { ...c, userId: '', name: '', phone: undefined };
      const emp = getEmployeesForRole(c.roleKey).find((e: any) => e.id === userId)
        || allEmployees.find((e: any) => e.id === userId);
      return {
        ...c,
        userId,
        name: emp ? (emp.displayName || `${emp.firstName} ${emp.lastName}`) : '',
        phone: emp?.phone,
      };
    }));
  };

  // ─── Equipment handlers ────────────────────────────────
  const addEquipmentLineItem = () => {
    if (!newEquipmentId) { messageApi.warning('יש לבחור פריט ציוד'); return; }
    if (equipmentItems.find(it => it.equipmentId === newEquipmentId)) { messageApi.warning('פריט ציוד זה כבר קיים'); return; }
    const eq = pickerEquipmentById.get(newEquipmentId);
    if (!eq) { messageApi.error('הציוד שנבחר לא נמצא'); return; }
    setEquipmentItems(prev => [...prev, {
      equipmentId: eq.id, equipmentName: eq.name, category: eq.category || '',
      categoryLabel: categoryLabelOf(eq.category || '') || eq.category || '',
      quantity: 1, purpose: '', audioConfig: '',
    }]);
    setNewEquipmentId('');
  };
  const updateEquipmentItemQuantity = (equipmentId: string, quantity: number) => {
    setEquipmentItems(prev => prev.map(it => it.equipmentId === equipmentId ? { ...it, quantity: Math.max(1, Math.floor(quantity || 1)) } : it));
  };
  const updateEquipmentItemField = (equipmentId: string, field: 'purpose' | 'audioConfig', value: string) => {
    setEquipmentItems(prev => prev.map(it => it.equipmentId === equipmentId ? { ...it, [field]: value } : it));
  };
  const removeEquipmentLineItem = (equipmentId: string) => {
    setEquipmentItems(prev => prev.filter(it => it.equipmentId !== equipmentId));
  };

  // ─── Save (full) ───────────────────────────────────────
  const handleSave = async () => {
    if (!canManage) { messageApi.error('אין לך הרשאה לשנות שידורים'); return; }
    setSaving(true);
    try {
      const productionCrew = crewAssignments.map(c => ({
        role: c.roleKey, roleLabel: c.roleLabel, userId: c.userId, name: c.name, phone: c.phone, isCustom: c.isCustom,
      }));
      const equipmentList = equipmentItems.map(it => ({
        equipmentId: it.equipmentId, equipmentName: it.equipmentName, name: it.equipmentName,
        category: it.category, categoryLabel: it.categoryLabel, quantity: it.quantity,
        purpose: it.purpose || undefined, audioConfig: it.audioConfig || undefined,
      }));
      const internalUserIds: string[] = [
        ...productionCrew.map((c) => c.userId).filter((id): id is string => typeof id === 'string' && id.length > 0),
        ...dynamicJobs.map((j) => j.userId).filter((id): id is string => typeof id === 'string' && id.length > 0),
      ];
      if (internalUserIds.length > 0) {
        const ok = await ensureAvailabilityOk(apolloClient, modal, {
          userIds: internalUserIds, startTime: event.startTime || null, endTime: event.endTime || null,
        });
        if (!ok) { setSaving(false); return; }
      }
      await updateDepartmentData({
        variables: {
          eventId: event.id, department: 'externalBroadcasts',
          data: { customData: {
            productionCrew, equipmentList,
            dynamicJobs: dynamicJobs.map((j) => ({
              departmentCode: j.departmentCode, roleKey: j.roleKey, roleLabel: j.roleLabel,
              count: j.count || 1, userId: j.userId, userName: j.userName,
            })),
            notApplicable: false,
            assignmentStatus: opsCustomData.assignmentStatus || 'live',
            isDoubleBroadcast: !!opsCustomData.isDoubleBroadcast,
            secondaryControlRoomId: opsCustomData.secondaryControlRoomId,
            secondaryControlRoomName: opsCustomData.secondaryControlRoomName,
            controlCheck: opsCustomData.controlCheck, offtube: null,
            documents: opsCustomData.documents, finance: opsCustomData.finance,
            nevionRequest: opsCustomData.nevionRequest, liveuActivation: opsCustomData.liveuActivation,
            excludedFromOperations: opsCustomData.excludedFromOperations,
            excludedAt: opsCustomData.excludedAt, excludeReason: opsCustomData.excludeReason,
          } },
        },
      });
      messageApi.success('הנתונים נשמרו בהצלחה');
      onSaved();
    } catch (err: any) {
      messageApi.error(`שגיאה בשמירה: ${err.message}`);
    } finally { setSaving(false); }
  };

  // ─── Venue crew structure ──────────────────────────────
  const applyVenueCrewStructure = (structure: any) => {
    if (!structure) return;
    const newCrew: CrewAssignment[] = [];
    for (const job of structure.jobs || []) {
      for (let i = 0; i < (job.count || 1); i++) {
        newCrew.push({
          roleKey: job.roleKey || job.departmentCode || 'role',
          roleLabel: job.roleLabel || job.departmentCode || 'תפקיד',
          userId: '', name: job.userName || '', isCustom: !job.roleKey,
        });
      }
    }
    setCrewAssignments(newCrew);
    messageApi.success(`מבנה צוות "${structure.name}" הוחל`);
  };

  // ─── Apply preset ──────────────────────────────────────
  const applyPreset = async (preset: Preset) => {
    if (isLegacyPreset(preset)) {
      messageApi.warning(`הפריסט "${preset.name}" שמור לפי הסכמה הישנה ויש לעדכן אותו לפני שימוש`);
      return;
    }
    const newCrew: CrewAssignment[] = [];
    preset.roles.forEach(r => {
      for (let i = 0; i < r.count; i++) {
        newCrew.push({ roleKey: r.roleKey, roleLabel: r.roleLabel, userId: '', name: '', isCustom: r.isCustom });
      }
    });
    setCrewAssignments(newCrew);
    let freshCatalog = pickerEquipment;
    try {
      const refetched = await refetchPicker();
      freshCatalog = refetched?.data?.warehouseEquipmentForPicker || pickerEquipment;
    } catch (err) { /* use cache */ }
    const rawLines: SubstitutionInput[] = preset.equipment.filter(pe => pe.equipmentId).map(pe => ({
      equipmentId: pe.equipmentId!, equipmentName: pe.equipmentName || pickerEquipmentById.get(pe.equipmentId!)?.name || '',
      category: pe.category, categoryLabel: pe.categoryLabel || categoryLabelOf(pe.category) || pe.category,
      quantity: pe.quantity || 1, purpose: pe.purpose || '', audioConfig: pe.audioConfig || '',
    }));
    const { resolved, substitutions, unfulfilled } = resolveEquipmentLines(rawLines, freshCatalog);
    setEquipmentItems(resolved);
    setLegacyEquipmentRequests([]);
    messageApi.success(`פריסט "${preset.name}" הוחל בהצלחה`);
    substitutions.forEach((sub) => {
      const requestedBarcode = pickerEquipmentById.get(sub.requestedId)?.barcode;
      const fulfilledBarcode = freshCatalog.find((eq: any) => eq.id === sub.fulfilledId)?.barcode;
      messageApi.info(`${sub.requestedName}: הפריט המקורי${requestedBarcode ? ` (ברקוד ${requestedBarcode})` : ''} כבר הוקצה — הוחלף לפריט זמין${fulfilledBarcode ? ` (ברקוד ${fulfilledBarcode})` : ''}`, 6);
    });
    unfulfilled.forEach((u) => messageApi.warning(`${u.requestedName}: חסרים ${u.shortBy} יחידות זמינות במלאי`, 6));
  };

  // ─── Preset CRUD ───────────────────────────────────────
  const openPresetModal = (preset?: Preset) => {
    if (!canManage) { messageApi.error('אין לך הרשאה לנהל פריסטים'); return; }
    setEditingPreset(preset || null);
    if (preset) presetForm.setFieldsValue({ name: preset.name, description: preset.description, tags: preset.tags });
    else presetForm.resetFields();
    setPresetModalOpen(true);
  };

  const handleSavePreset = async () => {
    if (!canManage) { messageApi.error('אין לך הרשאה לנהל פריסטים'); return; }
    try {
      const values = await presetForm.validateFields();
      const roleCounts: Record<string, { label: string; count: number; isCustom: boolean }> = {};
      crewAssignments.forEach(c => {
        if (!roleCounts[c.roleKey]) roleCounts[c.roleKey] = { label: c.roleLabel, count: 0, isCustom: c.isCustom };
        roleCounts[c.roleKey].count++;
      });
      const roles: PresetRole[] = Object.entries(roleCounts).map(([key, v]) => ({ roleKey: key, roleLabel: v.label, count: v.count, isCustom: v.isCustom }));
      const presetEquipment = equipmentItems.map(it => ({
        equipmentId: it.equipmentId, equipmentName: it.equipmentName, category: it.category,
        categoryLabel: it.categoryLabel, quantity: it.quantity, purpose: it.purpose || undefined, audioConfig: it.audioConfig || undefined,
      }));
      const input = { name: values.name, description: values.description, tags: values.tags || [], roles, equipment: presetEquipment };
      if (editingPreset) { await updatePreset({ variables: { id: editingPreset.id, input } }); messageApi.success('הפריסט עודכן'); }
      else { await createPreset({ variables: { input } }); messageApi.success('הפריסט נוצר'); }
      setPresetModalOpen(false); presetForm.resetFields(); onPresetsChanged();
    } catch (err: any) {
      if (err.errorFields) return;
      messageApi.error(`שגיאה בשמירת פריסט: ${err.message}`);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    if (!canManage) { messageApi.error('אין לך הרשאה למחוק פריסטים'); return; }
    try { await deletePreset({ variables: { id: presetId } }); messageApi.success('הפריסט נמחק'); onPresetsChanged(); }
    catch (err: any) { messageApi.error(`שגיאה במחיקת פריסט: ${err.message}`); }
  };

  const crewByRole = useMemo(() => {
    const grouped: Record<string, CrewAssignment[]> = {};
    crewAssignments.forEach(c => { if (!grouped[c.roleKey]) grouped[c.roleKey] = []; grouped[c.roleKey].push(c); });
    return grouped;
  }, [crewAssignments]);

  // Roles configured for External Broadcasts in the Broadcast Array form
  // (scope = externalBroadcasts | both) plus the form's free-text special
  // roles. These are always shown as columns, even with zero slots.
  const { data: baConfigData } = useQuery(GET_ASSIGNMENT_FORM_CONFIG, {
    variables: { formKey: 'broadcastArray' },
    fetchPolicy: 'cache-first',
  });

  const configuredCrewRoles = useMemo(() => {
    const cfg = baConfigData?.assignmentFormConfig;
    const roles: Array<{ roleKey: string; roleLabel: string; isCustom: boolean }> = [];
    const seen = new Set<string>();
    for (const rs of cfg?.roleScopes || []) {
      if ((rs.scope === 'externalBroadcasts' || rs.scope === 'both') && !seen.has(rs.roleKey)) {
        roles.push({ roleKey: rs.roleKey, roleLabel: rs.roleLabel || rs.roleKey, isCustom: false });
        seen.add(rs.roleKey);
      }
    }
    for (const sr of cfg?.specialRoles || []) {
      const key = slugifyRole(String(sr));
      if (key && !seen.has(key)) {
        roles.push({ roleKey: key, roleLabel: String(sr), isCustom: true });
        seen.add(key);
      }
    }
    return roles;
  }, [baConfigData]);

  // Columns to render = configured EB roles (always shown) merged with any
  // roles already present on the event.
  const roleColumns = useMemo(() => {
    const cols: Array<{ roleKey: string; roleLabel: string; isCustom: boolean; members: CrewAssignment[] }> = [];
    const seen = new Set<string>();
    for (const r of configuredCrewRoles) {
      cols.push({ ...r, members: crewByRole[r.roleKey] || [] });
      seen.add(r.roleKey);
    }
    for (const [roleKey, members] of Object.entries(crewByRole)) {
      if (seen.has(roleKey)) continue;
      cols.push({ roleKey, roleLabel: members[0]?.roleLabel || roleKey, isCustom: !!members[0]?.isCustom, members });
    }
    return cols;
  }, [configuredCrewRoles, crewByRole]);

  // ─── Render ────────────────────────────────────────────
  return (
    <div style={{ direction: 'rtl', padding: '8px 4px' }}>
      {canManage && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>שמור</Button>
        </div>
      )}

      {/* ─── Combined compact toolbar: venue · presets · status ─── */}
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '6px 10px' } }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {/* Venue */}
          <Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>אולם:</Text>
          <Select
            placeholder="בחר אולם" value={selectedVenueId || undefined}
            onChange={(v) => setSelectedVenueId(v || null)} allowClear showSearch optionFilterProp="label"
            size="small" style={{ width: 150 }}
            options={venues.map((v) => ({ value: v.id, label: v.hebrewName || v.name }))}
          />
          {selectedVenue && (selectedVenue.crewStructures || []).map((s: any, i: number) => (
            <Button key={i} size="small" icon={<CopyOutlined />} onClick={() => applyVenueCrewStructure(s)}>{s.name}</Button>
          ))}

          <Divider type="vertical" style={{ height: 18, margin: '0 2px' }} />

          {/* Presets */}
          <Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>פריסטים:</Text>
          {(selectedVenue ? venuePresets : presets).length === 0 && selectedVenue && (
            <Text type="secondary" style={{ fontSize: 11 }}>אין תבניות לאולם</Text>
          )}
          {(selectedVenue ? venuePresets : presets).map(p => {
            const legacy = isLegacyPreset(p);
            const tooltipBody = p.description || `${p.roles.length} תפקידים, ${p.equipment.length} פריטי ציוד`;
            return (
              <Tooltip key={p.id} title={legacy ? `${tooltipBody}\nפריסט ישן — נא לעדכן לפני שימוש` : tooltipBody}>
                <Button size="small" icon={<CopyOutlined />} onClick={() => applyPreset(p)} disabled={legacy}>
                  {p.name}{legacy && <Tag color="default" style={{ marginInlineStart: 6 }}>ישן</Tag>}
                </Button>
              </Tooltip>
            );
          })}
          {canManage && (
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => openPresetModal()}>שמור כפריסט</Button>
          )}
          {canManage && presets.length > 0 && (
            <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openPresetModal(presets[0])}>ניהול</Button>
          )}

          <Divider type="vertical" style={{ height: 18, margin: '0 2px' }} />

          {/* Assignment status */}
          <AssignmentStatusControl
            inline
            status={(opsCustomData.assignmentStatus as ExternalBroadcastAssignmentStatus) || 'live'}
            isDoubleBroadcast={!!opsCustomData.isDoubleBroadcast}
            secondaryControlRoomName={opsCustomData.secondaryControlRoomName}
            primaryControlRoomName={(event?.metadata?.departments?.broadcastArray as any)?.location || null}
            disabled={!canManage}
            onStatusChange={(next) => setOpsCustomData((prev) => ({ ...prev, assignmentStatus: next }))}
            onDoubleBroadcastChange={(next) => setOpsCustomData((prev) => ({
              ...prev, isDoubleBroadcast: next,
              secondaryControlRoomId: next ? prev.secondaryControlRoomId : undefined,
              secondaryControlRoomName: next ? prev.secondaryControlRoomName : undefined,
            }))}
            onSecondaryControlRoomChange={(room) => setOpsCustomData((prev) => ({
              ...prev, secondaryControlRoomId: room?.id || undefined, secondaryControlRoomName: room?.name || undefined,
            }))}
          />
        </div>
      </Card>

      {/* ─── Crew: dense responsive role grid ─── */}
      <Card
        size="small"
        style={{ marginTop: 12, marginBottom: 12 }}
        title={<Space><TeamOutlined /><Text strong>צוות הפקה</Text><Badge count={crewAssignments.length} style={{ backgroundColor: '#1890ff' }} /></Space>}
      >
        {roleColumns.length === 0 && (
          <Empty description="לא הוגדרו תפקידים לשידורי חוץ — הגדר אותם בטופס מערך השידורים בהגדרות" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        <Row gutter={[12, 12]} align="stretch">
          {roleColumns.map(({ roleKey, roleLabel, isCustom, members }) => {
            const fixedRole = FIXED_ROLES.find(r => r.key === roleKey);
            const roleEmployees = getEmployeesForRole(roleKey);
            const employeesForChip = roleEmployees.length ? roleEmployees : allEmployees;
            return (
              <Col key={roleKey} xs={24} sm={12} md={8} xl={6}>
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 8, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    {fixedRole?.icon || <UserOutlined />}
                    <Text strong style={{ flex: 1, minWidth: 0 }} ellipsis>{roleLabel}</Text>
                    <Badge count={members.length} showZero style={{ backgroundColor: members.length ? '#1890ff' : '#bfbfbf' }} />
                  </div>
                  {members.map((member) => {
                    const globalIdx = crewAssignments.indexOf(member);
                    return (
                      <DraggableCrewChip
                        key={globalIdx}
                        eventId={event.id}
                        index={globalIdx}
                        member={member}
                        canManage={canManage}
                        employees={employeesForChip}
                        onRemove={() => removeCrew(globalIdx)}
                        onAssign={(userId) => assignCrewUser(globalIdx, userId)}
                      />
                    );
                  })}
                  {canManage && (
                    <Button
                      type="dashed"
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => addEmptyCrewSlot(roleKey, roleLabel, isCustom)}
                      style={{ width: '100%', marginTop: 'auto' }}
                    >
                      הוסף {roleLabel}
                    </Button>
                  )}
                </div>
              </Col>
            );
          })}
          {canManage && (
            <Col xs={24} sm={12} md={8} xl={6}>
              <Button
                type="dashed"
                onClick={() => setAddCrewModalOpen(true)}
                style={{ width: '100%', height: '100%', minHeight: 72 }}
                icon={<PlusOutlined />}
              >
                הוסף תפקיד
              </Button>
            </Col>
          )}
        </Row>
      </Card>

      {/* ─── Compact collapsible sections (jobs / equipment / operations) ─── */}
      <Collapse
        defaultActiveKey={[]}
        items={[
          {
            key: 'dynamic-jobs',
            label: <span><AppstoreOutlined /> משימות לפי מחלקות ({dynamicJobs.length})</span>,
            children: (
              <DynamicDepartmentJobsPanel
                formKey="externalBroadcasts" value={dynamicJobs}
                onChange={canManage ? setDynamicJobs : () => {}}
                title="משימות שיוך לפי הגדרת מחלקות"
              />
            ),
          },
          {
            key: 'equipment',
            label: <span><ToolOutlined /> ציוד נדרש ({equipmentItems.reduce((s, it) => s + it.quantity, 0)})</span>,
            children: (
              <div>
                {legacyEquipmentRequests.length > 0 && (
                  <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="דרישות ישנות לפי קטגוריה"
                    description={<div><div style={{ marginBottom: 8 }}>נא להוסיף ציוד ספציפי ולשמור — שמירה תחליף את הדרישות הישנות.</div><Space wrap>{legacyEquipmentRequests.map((r, idx) => (<Tag key={`${r.category}-${idx}`} color="orange">{r.categoryLabel} x{r.count}</Tag>))}</Space></div>}
                  />
                )}
                <Row gutter={8} style={{ marginBottom: 16 }}>
                  <Col flex="auto">
                    <Select
                      placeholder="בחר פריט ציוד (חפש לפי שם / מותג / ברקוד)"
                      value={newEquipmentId || undefined} onChange={(v) => setNewEquipmentId(v || '')}
                      disabled={!canManage} loading={pickerLoading} style={{ width: '100%' }} showSearch virtual optionFilterProp="label"
                      filterOption={(input, option: any) => {
                        const search = input.toLowerCase(); const key: string = option?.searchKey || '';
                        return key.includes(search) || String(option?.label || '').toLowerCase().includes(search);
                      }}
                      options={groupedPickerOptions.map(g => ({ ...g, options: g.options.filter((o: any) => !equipmentItems.find(it => it.equipmentId === o.value)) }))}
                    />
                  </Col>
                  {canManage && (<Col><Button icon={<PlusOutlined />} onClick={addEquipmentLineItem}>הוסף</Button></Col>)}
                </Row>
                {equipmentItems.length === 0 && legacyEquipmentRequests.length === 0 && (
                  <Empty description="לא הוגדרו דרישות ציוד" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
                {equipmentItems.map(it => {
                  const eq = pickerEquipmentById.get(it.equipmentId);
                  const maxQty = typeof eq?.quantityAvailable === 'number' ? Math.max(eq.quantityAvailable, 1)
                    : typeof eq?.quantityTotal === 'number' ? Math.max(eq.quantityTotal, 1) : 999;
                  const showAudio = AUDIO_CONFIG_CATEGORIES.has(it.category);
                  return (
                    <Card key={it.equipmentId} size="small" style={{ marginBottom: 12 }}
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Space wrap><ToolOutlined /><Text strong>{it.equipmentName}</Text><Tag color="orange">{it.categoryLabel}</Tag>
                            {eq?.brand && <Tag color="blue">{eq.brand}</Tag>}
                            {eq?.barcode && <Text type="secondary" style={{ fontSize: 12 }}>{eq.barcode}</Text>}
                          </Space>
                          <Space><Text type="secondary">כמות:</Text>
                            <InputNumber min={1} max={maxQty} value={it.quantity} onChange={(v) => updateEquipmentItemQuantity(it.equipmentId, Number(v) || 1)} disabled={!canManage} size="small" />
                            {canManage && (<Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeEquipmentLineItem(it.equipmentId)} />)}
                          </Space>
                        </div>
                      }
                    >
                      <Row gutter={8}>
                        <Col flex="auto"><Input placeholder="ייעוד / תפקיד (אופציונלי)" prefix={<SettingOutlined />} value={it.purpose || ''} onChange={(e) => updateEquipmentItemField(it.equipmentId, 'purpose', e.target.value)} disabled={!canManage} size="small" /></Col>
                        {showAudio && (<Col flex="auto"><Input placeholder="הגדרת אודיו" prefix={<AudioOutlined />} value={it.audioConfig || ''} onChange={(e) => updateEquipmentItemField(it.equipmentId, 'audioConfig', e.target.value)} disabled={!canManage} size="small" /></Col>)}
                      </Row>
                    </Card>
                  );
                })}
              </div>
            ),
          },
          {
            key: 'operations',
            label: <span><SettingOutlined /> פעולות</span>,
            children: (
              <OperationsTab
                eventId={event.id} customData={opsCustomData}
                onCustomDataChange={(patch) => setOpsCustomData((prev) => ({ ...prev, ...patch }))}
                equipmentOnEvent={equipmentItems.map((it) => ({ id: it.equipmentId, name: it.equipmentName, barcode: pickerEquipmentById.get(it.equipmentId)?.barcode || null, category: it.category }))}
                liveuKits={pickerEquipment.filter((eq) => !!(eq as any).liveuInternalId || /liveu/i.test(eq.name) || /liveu/i.test(eq.category || '')).map((eq) => ({ id: eq.id, name: eq.name, barcode: eq.barcode, liveuInternalId: (eq as any).liveuInternalId, category: eq.category }))}
                disabled={!canManage}
                onAfterNevionAutoRequest={async () => { onSaved(); }}
              />
            ),
          },
        ]}
      />

      {/* Add Crew Role Modal */}
      <Modal
        title="הוסף תפקיד / איש צוות" open={addCrewModalOpen}
        onCancel={() => { setAddCrewModalOpen(false); setNewCrewRole(''); setNewCrewCustomLabel(''); setNewCrewUserId(''); setNewCrewCount(1); }}
        onOk={handleAddCrew} okText="הוסף" cancelText="ביטול"
      >
        <Form layout="vertical">
          <Form.Item label="תפקיד">
            <Select placeholder="בחר תפקיד" value={newCrewRole || undefined}
              onChange={v => { setNewCrewRole(v); setNewCrewCustomLabel(''); setNewCrewUserId(''); }}>
              {FIXED_ROLES.map(r => (<Option key={r.key} value={r.key}><Space>{r.icon}{r.label}</Space></Option>))}
              <Option value="__custom__"><Space><EditOutlined />תפקיד מותאם אישית</Space></Option>
            </Select>
          </Form.Item>
          {newCrewRole === '__custom__' && (
            <Form.Item label="שם התפקיד">
              <Input placeholder="למשל: רחפן, גריפ, עוזר במאי" value={newCrewCustomLabel} onChange={e => setNewCrewCustomLabel(e.target.value)} />
            </Form.Item>
          )}
          <Form.Item label="איש צוות (אופציונלי - השאר ריק ליצירת משבצת פנויה)">
            <Select placeholder="בחר איש צוות או השאר ריק" value={newCrewUserId || undefined} onChange={setNewCrewUserId} allowClear showSearch
              filterOption={(input, option) => { const label = option?.children as unknown as string; return typeof label === 'string' && label.toLowerCase().includes(input.toLowerCase()); }}>
              {(newCrewRole && newCrewRole !== '__custom__' ? getEmployeesForRole(newCrewRole) : allEmployees).map((emp: any) => (
                <Option key={emp.id} value={emp.id}>{emp.displayName || `${emp.firstName} ${emp.lastName}`}</Option>
              ))}
            </Select>
          </Form.Item>
          {!newCrewUserId && (
            <Form.Item label="כמות משבצות">
              <InputNumber min={1} max={20} value={newCrewCount} onChange={v => setNewCrewCount(v || 1)} style={{ width: '100%' }} />
              <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>ניתן להוסיף מספר משבצות ריקות בבת אחת (למשל 5 צלמים)</Text>
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* Preset Management Modal */}
      <Modal title={editingPreset ? 'עריכת פריסט' : 'שמירת פריסט חדש'} open={presetModalOpen}
        onCancel={() => { setPresetModalOpen(false); presetForm.resetFields(); }} width={700} footer={null} forceRender>
        <Form form={presetForm} layout="vertical" onFinish={handleSavePreset}>
          <Form.Item name="name" label="שם הפריסט" rules={[{ required: true, message: 'חובה' }]}>
            <Input placeholder="למשל: ליגה לאומית - משחק מרכזי" />
          </Form.Item>
          <Form.Item name="description" label="תיאור"><Input.TextArea rows={2} placeholder="תיאור אופציונלי..." /></Form.Item>
          <Form.Item name="tags" label="תגיות סיווג">
            <Select mode="tags" placeholder="הקלד תגית ולחץ Enter">
              <Option value="כדורגל">כדורגל</Option><Option value="כדורסל">כדורסל</Option>
              <Option value="ליגת העל">ליגת העל</Option><Option value="ליגה לאומית">ליגה לאומית</Option>
            </Select>
          </Form.Item>
          <Divider>הגדרות נוכחיות שיישמרו</Divider>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Text type="secondary">צוות:</Text>
            <div style={{ marginTop: 8 }}>
              {Object.entries(crewByRole).map(([roleKey, members]) => (<Tag key={roleKey} color={members[0]?.isCustom ? 'purple' : 'blue'}>{members[0]?.roleLabel}: {members.length}</Tag>))}
              {crewAssignments.length === 0 && <Text type="secondary">אין צוות</Text>}
            </div>
          </Card>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Text type="secondary">ציוד:</Text>
            <div style={{ marginTop: 8 }}>
              {equipmentItems.length > 0 ? (<Space wrap>{equipmentItems.map(it => (<Tooltip key={it.equipmentId} title={[it.purpose, it.audioConfig].filter(Boolean).join(' · ') || undefined}><Tag color="orange">{it.equipmentName} x{it.quantity}</Tag></Tooltip>))}</Space>) : (<Text type="secondary">אין ציוד</Text>)}
            </div>
          </Card>
          <Space>
            <Button type="primary" htmlType="submit">{editingPreset ? 'עדכן פריסט' : 'שמור פריסט'}</Button>
            <Button onClick={() => { setPresetModalOpen(false); presetForm.resetFields(); }}>ביטול</Button>
          </Space>
        </Form>
        {presets.length > 0 && (
          <>
            <Divider>פריסטים קיימים</Divider>
            <List size="small" dataSource={presets} renderItem={p => (
              <List.Item actions={[
                <Button key="edit" type="link" size="small" icon={<EditOutlined />} onClick={() => { setEditingPreset(p); presetForm.setFieldsValue({ name: p.name, description: p.description, tags: p.tags }); }} />,
                <Popconfirm key="delete" title="למחוק את הפריסט?" onConfirm={() => handleDeletePreset(p.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>,
              ]}>
                <List.Item.Meta
                  title={<Space><span>{p.name}</span>{isLegacyPreset(p) && (<Tag color="default">ישן — נא לעדכן</Tag>)}</Space>}
                  description={<Space size={4} wrap>{p.roles.map(r => (<Tag key={r.roleKey}>{r.roleLabel}: {r.count}</Tag>))}{p.equipment.map((e, i) => (<Tag key={i} color="orange">{e.equipmentId ? `${e.equipmentName || e.categoryLabel} x${e.quantity ?? 1}` : `${e.categoryLabel} x${e.count ?? 0}`}</Tag>))}</Space>}
                />
              </List.Item>
            )} />
          </>
        )}
      </Modal>
    </div>
  );
});
