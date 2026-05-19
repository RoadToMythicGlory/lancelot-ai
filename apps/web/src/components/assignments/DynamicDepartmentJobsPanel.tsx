'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Select,
  Space,
  Tag,
  Modal,
  Input,
  Switch,
  message,
  Tooltip,
  Row,
  Col,
  Typography,
  Popconfirm,
  Divider,
  Alert,
  InputNumber,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  SaveOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import {
  GET_DEPARTMENTS,
  GET_ASSIGNMENT_FORM_CONFIG,
  GET_ASSIGNMENT_PRESETS,
  GET_EMPLOYEES_BY_DEPARTMENT,
} from '@/graphql/queries';
import {
  CREATE_ASSIGNMENT_PRESET,
  UPDATE_ASSIGNMENT_PRESET,
  DELETE_ASSIGNMENT_PRESET,
} from '@/graphql/mutations';
import { useAuth } from '@/contexts/AuthContext';

const { Title, Text } = Typography;

export interface AssignmentJob {
  /** stable id for React keys; not persisted */
  uid: string;
  departmentCode: string;
  roleKey?: string;
  roleLabel?: string;
  count: number;
  userId?: string;
  userName?: string;
}

interface DepartmentRoleDef {
  key: string;
  name: string;
  hebrewName?: string | null;
  isActive: boolean;
}

interface DepartmentRecord {
  id: string;
  code: string;
  name: string;
  hebrewName?: string | null;
  category: string;
  isActive: boolean;
  roles: string[];
  departmentRoles?: DepartmentRoleDef[];
  includesDepartmentCodes?: string[];
}

interface FormDeptCfg {
  departmentCode: string;
  allowedRoleKeys: string[];
  requireUser: boolean;
  defaultCount: number;
  order: number;
}

interface FormConfig {
  id: string;
  formKey: string;
  name: string;
  hebrewName?: string | null;
  allowUserPresets: boolean;
  isActive: boolean;
  departments: FormDeptCfg[];
}

interface AssignmentPresetJobApi {
  departmentCode: string;
  roleKey?: string | null;
  roleLabel?: string | null;
  count: number;
  userId?: string | null;
  userName?: string | null;
}

interface AssignmentPresetApi {
  id: string;
  formKey: string;
  name: string;
  description?: string | null;
  tags: string[];
  isDefault: boolean;
  isShared: boolean;
  isActive: boolean;
  createdBy?: string | null;
  createdByName?: string | null;
  jobs: AssignmentPresetJobApi[];
}

interface DynamicDepartmentJobsPanelProps {
  /** Stable form key matching server config (broadcastArray, externalBroadcasts, ...). */
  formKey: string;
  /** Current jobs (controlled). */
  value: AssignmentJob[];
  onChange: (next: AssignmentJob[]) => void;
  /** Optional title shown at the top. */
  title?: string;
  /** When true, hide the preset bar (e.g. for nested usages). */
  hidePresets?: boolean;
}

const newUid = () => `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const buildEmployeeFilter = (deptCode: string) => ({
  departmentId: deptCode,
  isActive: true,
});

const DynamicDepartmentJobsPanel: React.FC<DynamicDepartmentJobsPanelProps> = ({
  formKey,
  value,
  onChange,
  title,
  hidePresets,
}) => {
  const { user: currentUser, hasPermission } = useAuth();

  const { data: deptData } = useQuery(GET_DEPARTMENTS, { fetchPolicy: 'cache-first' });
  const { data: cfgData } = useQuery(GET_ASSIGNMENT_FORM_CONFIG, {
    variables: { formKey },
    fetchPolicy: 'cache-and-network',
  });
  const { data: presetData, refetch: refetchPresets } = useQuery(GET_ASSIGNMENT_PRESETS, {
    variables: { formKey },
    fetchPolicy: 'cache-and-network',
  });

  const [createPreset] = useMutation(CREATE_ASSIGNMENT_PRESET);
  const [updatePreset] = useMutation(UPDATE_ASSIGNMENT_PRESET);
  const [deletePreset] = useMutation(DELETE_ASSIGNMENT_PRESET);

  const departments: DepartmentRecord[] = useMemo(
    () => (deptData?.departments || []).filter((d: DepartmentRecord) => d.isActive),
    [deptData],
  );

  const departmentByCode = useMemo(() => {
    const m = new Map<string, DepartmentRecord>();
    for (const d of departments) m.set(d.code, d);
    return m;
  }, [departments]);

  const formConfig: FormConfig | null = cfgData?.assignmentFormConfig || null;
  const allowUserPresets = formConfig ? formConfig.allowUserPresets : true;

  // Departments allowed in this form. If no form config exists yet, fall back
  // to letting users pick any active department — admins should configure it.
  const allowedDepartments: FormDeptCfg[] = useMemo(() => {
    if (formConfig && Array.isArray(formConfig.departments) && formConfig.departments.length) {
      const sorted = [...formConfig.departments].sort((a, b) => a.order - b.order);
      return sorted;
    }
    return departments.map((d, i) => ({
      departmentCode: d.code,
      allowedRoleKeys: [],
      requireUser: false,
      defaultCount: 1,
      order: i,
    }));
  }, [formConfig, departments]);

  const allowedDeptOptions = useMemo(
    () =>
      allowedDepartments
        .map((cfg) => {
          const dept = departmentByCode.get(cfg.departmentCode);
          if (!dept) return null;
          return {
            value: dept.code,
            label: dept.hebrewName ? `${dept.hebrewName} (${dept.code})` : dept.name,
            roleOptions: (dept.departmentRoles || [])
              .filter((r) => r.isActive !== false)
              .filter((r) => cfg.allowedRoleKeys.length === 0 || cfg.allowedRoleKeys.includes(r.key))
              .map((r) => ({ value: r.key, label: r.hebrewName || r.name })),
            cfg,
          };
        })
        .filter(Boolean) as Array<{
        value: string;
        label: string;
        roleOptions: { value: string; label: string }[];
        cfg: FormDeptCfg;
      }>,
    [allowedDepartments, departmentByCode],
  );

  const presets: AssignmentPresetApi[] = presetData?.assignmentPresets || [];

  // ---- Apply default preset on first mount, when value is empty ----
  useEffect(() => {
    if (value.length > 0) return;
    const def = presets.find((p) => p.isDefault && p.isActive);
    if (def && def.jobs && def.jobs.length > 0) {
      onChange(
        def.jobs.map((j) => ({
          uid: newUid(),
          departmentCode: j.departmentCode,
          roleKey: j.roleKey || undefined,
          roleLabel: j.roleLabel || undefined,
          count: j.count || 1,
          userId: j.userId || undefined,
          userName: j.userName || undefined,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets.length]);

  // ---- Mutations on local jobs ----
  const updateJob = (uid: string, patch: Partial<AssignmentJob>) => {
    onChange(value.map((j) => (j.uid === uid ? { ...j, ...patch } : j)));
  };
  const removeJob = (uid: string) => {
    onChange(value.filter((j) => j.uid !== uid));
  };
  const addJobForDepartment = (departmentCode: string) => {
    const cfg = allowedDeptOptions.find((o) => o.value === departmentCode);
    onChange([
      ...value,
      {
        uid: newUid(),
        departmentCode,
        roleKey: undefined,
        roleLabel: undefined,
        count: cfg?.cfg.defaultCount ?? 1,
        userId: undefined,
        userName: undefined,
      },
    ]);
  };
  const moveJob = (uid: string, direction: -1 | 1) => {
    const idx = value.findIndex((j) => j.uid === uid);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  // ---- Preset save / apply / delete ----
  const [presetModal, setPresetModal] = useState<{
    open: boolean;
    editingId?: string | null;
    name: string;
    description: string;
    isDefault: boolean;
    isShared: boolean;
  }>({
    open: false,
    name: '',
    description: '',
    isDefault: false,
    isShared: true,
  });

  const openSavePreset = (editing?: AssignmentPresetApi) => {
    setPresetModal({
      open: true,
      editingId: editing?.id || null,
      name: editing?.name || '',
      description: editing?.description || '',
      isDefault: editing?.isDefault || false,
      isShared: editing?.isShared !== false,
    });
  };

  const handleSavePreset = async () => {
    if (!presetModal.name.trim()) {
      message.warning('יש להזין שם לפריסט');
      return;
    }
    try {
      const jobs = value.map((j) => ({
        departmentCode: j.departmentCode,
        roleKey: j.roleKey,
        roleLabel: j.roleLabel,
        count: j.count,
        userId: j.userId,
        userName: j.userName,
      }));
      if (presetModal.editingId) {
        await updatePreset({
          variables: {
            id: presetModal.editingId,
            input: {
              name: presetModal.name,
              description: presetModal.description,
              jobs,
              isDefault: presetModal.isDefault,
              isShared: presetModal.isShared,
            },
          },
        });
        message.success('הפריסט עודכן');
      } else {
        await createPreset({
          variables: {
            input: {
              formKey,
              name: presetModal.name,
              description: presetModal.description,
              jobs,
              isDefault: presetModal.isDefault,
              isShared: presetModal.isShared,
            },
          },
        });
        message.success('הפריסט נשמר');
      }
      setPresetModal({ ...presetModal, open: false });
      await refetchPresets();
    } catch (err: any) {
      message.error(err?.message || 'שגיאה בשמירת הפריסט');
    }
  };

  const handleApplyPreset = (p: AssignmentPresetApi) => {
    onChange(
      (p.jobs || []).map((j) => ({
        uid: newUid(),
        departmentCode: j.departmentCode,
        roleKey: j.roleKey || undefined,
        roleLabel: j.roleLabel || undefined,
        count: j.count || 1,
        userId: j.userId || undefined,
        userName: j.userName || undefined,
      })),
    );
    message.success(`הוחל פריסט: ${p.name}`);
  };

  const handleDeletePreset = async (id: string) => {
    try {
      await deletePreset({ variables: { id } });
      message.success('הפריסט נמחק');
      await refetchPresets();
    } catch (err: any) {
      message.error(err?.message || 'שגיאה במחיקת הפריסט');
    }
  };

  // ---- Render ----
  const renderJobRow = (job: AssignmentJob, idx: number) => {
    const deptCfg = allowedDeptOptions.find((o) => o.value === job.departmentCode);
    const dept = departmentByCode.get(job.departmentCode);
    const roleOptions = deptCfg?.roleOptions || [];
    const requireUser = deptCfg?.cfg.requireUser ?? false;

    return (
      <Card
        key={job.uid}
        size="small"
        style={{ marginBottom: 8 }}
        title={
          <Space>
            <Text strong>#{idx + 1}</Text>
            <Tag color="geekblue">{dept?.hebrewName || dept?.name || job.departmentCode}</Tag>
            {job.roleLabel ? <Tag color="blue">{job.roleLabel}</Tag> : null}
            {requireUser && !job.userId ? <Tag color="red">חובה לבחור עובד</Tag> : null}
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="הזז למעלה">
              <Button
                size="small"
                icon={<ArrowUpOutlined />}
                disabled={idx === 0}
                onClick={() => moveJob(job.uid, -1)}
              />
            </Tooltip>
            <Tooltip title="הזז למטה">
              <Button
                size="small"
                icon={<ArrowDownOutlined />}
                disabled={idx === value.length - 1}
                onClick={() => moveJob(job.uid, 1)}
              />
            </Tooltip>
            <Popconfirm
              title="להסיר משימה זו?"
              okText="כן"
              cancelText="ביטול"
              onConfirm={() => removeJob(job.uid)}
            >
              <Button danger size="small" icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        }
      >
        <Row gutter={8} align="middle">
          <Col xs={24} md={6}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary">תפקיד</Text>
            </div>
            <Select
              placeholder="בחר תפקיד (אופציונלי)"
              value={job.roleKey}
              options={roleOptions}
              onChange={(roleKey) => {
                const opt = roleOptions.find((r) => r.value === roleKey);
                updateJob(job.uid, { roleKey, roleLabel: opt?.label });
              }}
              allowClear
              showSearch
              filterOption={(input, option) =>
                String(option?.label || '').toLowerCase().includes(input.toLowerCase())
              }
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} md={4}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary">כמות</Text>
            </div>
            <InputNumber
              min={1}
              value={job.count || 1}
              onChange={(v) => updateJob(job.uid, { count: Number(v) || 1 })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} md={14}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary">עובד מומלץ (אופציונלי)</Text>
            </div>
            <UserPickerForDepartment
              departmentCode={job.departmentCode}
              value={job.userId ? { userId: job.userId, name: job.userName || '' } : null}
              onChange={(picked) =>
                updateJob(job.uid, {
                  userId: picked?.userId || undefined,
                  userName: picked?.name || undefined,
                })
              }
            />
          </Col>
        </Row>
      </Card>
    );
  };

  const canCreatePreset = allowUserPresets && (currentUser?.id ? true : false);

  return (
    <Card
      title={
        <Space>
          <span>{title || 'משימות שיוך'}</span>
          {formConfig?.hebrewName ? <Tag>{formConfig.hebrewName}</Tag> : null}
        </Space>
      }
      styles={{ body: { paddingTop: 12 } }}
    >
      {!hidePresets ? (
        <div style={{ marginBottom: 12 }}>
          <Space wrap>
            <Text strong>פריסטים:</Text>
            {presets.length === 0 ? (
              <Text type="secondary">אין פריסטים מוגדרים</Text>
            ) : (
              presets.map((p) => (
                <Space.Compact key={p.id}>
                  <Tooltip title={p.description || `${p.jobs?.length || 0} משימות`}>
                    <Button
                      icon={<CopyOutlined />}
                      size="small"
                      onClick={() => handleApplyPreset(p)}
                    >
                      {p.isDefault ? `★ ${p.name}` : p.name}
                    </Button>
                  </Tooltip>
                  {canCreatePreset ? (
                    <Tooltip title="ערוך פריסט">
                      <Button
                        icon={<EditOutlined />}
                        size="small"
                        onClick={() => openSavePreset(p)}
                      />
                    </Tooltip>
                  ) : null}
                  {canCreatePreset ? (
                    <Popconfirm
                      title="למחוק פריסט?"
                      okText="כן"
                      cancelText="ביטול"
                      onConfirm={() => handleDeletePreset(p.id)}
                    >
                      <Button danger icon={<DeleteOutlined />} size="small" />
                    </Popconfirm>
                  ) : null}
                </Space.Compact>
              ))
            )}
            {canCreatePreset ? (
              <Button
                size="small"
                icon={<SaveOutlined />}
                disabled={value.length === 0}
                onClick={() => openSavePreset()}
              >
                שמור פריסט מהמצב הנוכחי
              </Button>
            ) : null}
          </Space>
        </div>
      ) : null}

      <Divider style={{ margin: '8px 0 12px' }} />

      {value.length === 0 ? (
        <Empty description="אין משימות מוגדרות. לחץ על + כדי להוסיף." />
      ) : (
        value.map((j, i) => renderJobRow(j, i))
      )}

      <Space wrap style={{ marginTop: 12 }}>
        {allowedDeptOptions.length === 0 ? (
          <Alert
            type="warning"
            message="לא הוגדרו מחלקות זמינות לטופס זה. פנה למנהל המערכת על מנת להגדיר את הטופס בעמוד ההגדרות."
            showIcon
          />
        ) : (
          <>
            <Text>הוסף משימה ממחלקה:</Text>
            {allowedDeptOptions.map((opt) => (
              <Button
                key={opt.value}
                icon={<PlusOutlined />}
                onClick={() => addJobForDepartment(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </>
        )}
      </Space>

      <Modal
        title={presetModal.editingId ? 'עריכת פריסט' : 'שמירת פריסט חדש'}
        open={presetModal.open}
        onCancel={() => setPresetModal({ ...presetModal, open: false })}
        onOk={handleSavePreset}
        okText="שמור"
        cancelText="ביטול"
      >
        <div style={{ marginBottom: 12 }}>
          <Text>שם הפריסט</Text>
          <Input
            value={presetModal.name}
            onChange={(e) => setPresetModal({ ...presetModal, name: e.target.value })}
            placeholder="למשל: ליגה לאומית - משחק רגיל"
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <Text>תיאור</Text>
          <Input
            value={presetModal.description}
            onChange={(e) => setPresetModal({ ...presetModal, description: e.target.value })}
            placeholder="תיאור קצר"
          />
        </div>
        <Space>
          <Text>פריסט ברירת מחדל לאירועים רגילים</Text>
          <Switch
            checked={presetModal.isDefault}
            onChange={(v) => setPresetModal({ ...presetModal, isDefault: v })}
          />
          <Text>שיתוף עם הצוות</Text>
          <Switch
            checked={presetModal.isShared}
            onChange={(v) => setPresetModal({ ...presetModal, isShared: v })}
          />
        </Space>
      </Modal>
    </Card>
  );
};

// ---- Internal: per-row user picker ----

const UserPickerForDepartment: React.FC<{
  departmentCode: string;
  value: { userId: string; name: string } | null;
  onChange: (next: { userId: string; name: string } | null) => void;
}> = ({ departmentCode, value, onChange }) => {
  const { data, loading } = useQuery(GET_EMPLOYEES_BY_DEPARTMENT, {
    variables: { filter: buildEmployeeFilter(departmentCode) },
    skip: !departmentCode,
  });
  const employees: any[] = data?.users || [];
  return (
    <Select
      placeholder="בחר עובד (אופציונלי)"
      loading={loading}
      value={value?.userId}
      allowClear
      showSearch
      filterOption={(input, option) =>
        String(option?.label || '').toLowerCase().includes(input.toLowerCase())
      }
      style={{ width: '100%' }}
      options={employees.map((u) => ({
        value: u.id,
        label: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
      }))}
      onChange={(userId) => {
        if (!userId) {
          onChange(null);
          return;
        }
        const found = employees.find((u) => u.id === userId);
        onChange({
          userId,
          name:
            found?.displayName ||
            `${found?.firstName || ''} ${found?.lastName || ''}`.trim() ||
            found?.email ||
            '',
        });
      }}
    />
  );
};

export default DynamicDepartmentJobsPanel;
