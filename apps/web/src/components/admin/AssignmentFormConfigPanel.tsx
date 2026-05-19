'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Dropdown,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Tag,
  Row,
  Col,
  App as AntApp,
  InputNumber,
  Typography,
  Popconfirm,
  Tooltip,
  Alert,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FormOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import {
  GET_ASSIGNMENT_FORM_CONFIGS,
  GET_DEPARTMENTS,
  GET_USERS,
} from '@/graphql/queries';
import {
  UPSERT_ASSIGNMENT_FORM_CONFIG,
  DELETE_ASSIGNMENT_FORM_CONFIG,
} from '@/graphql/mutations';

const { Title, Text } = Typography;

interface DepartmentRoleDef {
  key: string;
  name: string;
  hebrewName?: string | null;
  isActive: boolean;
}

interface DepartmentRecord {
  code: string;
  name: string;
  hebrewName?: string | null;
  isActive: boolean;
  departmentRoles?: DepartmentRoleDef[];
  roles: string[];
}

interface FormDepartmentEntry {
  departmentCode: string;
  allowedRoleKeys: string[];
  requireUser: boolean;
  defaultCount: number;
  order: number;
}

interface FormColumnEntry {
  key: string;
  hebrewLabel: string;
  englishLabel?: string;
  allowedDepartmentCodes: string[];
  allowedUserIds: string[];
  requireUser: boolean;
  defaultCount: number;
  order: number;
}

interface FormConfigRecord {
  id: string;
  formKey: string;
  name: string;
  hebrewName?: string | null;
  description?: string | null;
  allowUserPresets: boolean;
  isActive: boolean;
  departments: FormDepartmentEntry[];
  columns?: FormColumnEntry[];
}

/** Forms that render with the column-based admin editor. Today only the
 * Broadcast Array uses this layout; other forms keep the department-keyed
 * editor unchanged. */
const COLUMN_BASED_FORM_KEYS = new Set<string>(['broadcastArray']);

/** Built-in Broadcast Array column presets — same seven columns the
 * broadcast-array page uses as its FALLBACK_ROLE_COLUMNS and that the
 * seed script writes by default. Admins can pick from this list when
 * adding a column to avoid retyping the well-known role names; the
 * preset's `allowedDepartmentCodes` mirror the historical hard-coded
 * department mapping, and `allowedUserIds` start empty for the admin
 * to populate. */
interface BroadcastArrayColumnPreset {
  key: string;
  hebrewLabel: string;
  englishLabel: string;
  allowedDepartmentCodes: string[];
}

const BROADCAST_ARRAY_COLUMN_PRESETS: BroadcastArrayColumnPreset[] = [
  {
    key: 'editor',
    hebrewLabel: 'עורך',
    englishLabel: 'Editor',
    allowedDepartmentCodes: [
      'CONTENT_EDIT',
      'Visuals-VideoEditors',
      'NewMedia-Editors',
      'News-Editors',
    ],
  },
  {
    key: 'producer',
    hebrewLabel: 'מפיק',
    englishLabel: 'Producer',
    allowedDepartmentCodes: ['PROD', 'NewMedia-Producers', 'News-Producers'],
  },
  {
    key: 'vtr',
    hebrewLabel: 'איש VTR',
    englishLabel: 'VTR',
    allowedDepartmentCodes: ['VTR', 'Production-VTR'],
  },
  {
    key: 'broadcastTech',
    hebrewLabel: 'טכנאי שידור',
    englishLabel: 'Broadcast Technician / Director',
    allowedDepartmentCodes: ['DIR', 'Production-Directors'],
  },
  {
    key: 'anchor',
    hebrewLabel: 'שדר',
    englishLabel: 'Anchor',
    allowedDepartmentCodes: ['COMMENT', 'Production-Commentators'],
  },
  {
    key: 'analyst',
    hebrewLabel: 'אנליסט',
    englishLabel: 'Analyst',
    allowedDepartmentCodes: ['COMMENT', 'Production-Commentators'],
  },
  {
    key: 'sidelineAnchor',
    hebrewLabel: 'שדר קוים',
    englishLabel: 'Sideline Anchor',
    allowedDepartmentCodes: ['SOUND', 'Production-Soundmen'],
  },
];

const slugifyKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || `col_${Date.now().toString(36)}`;

const KNOWN_FORMS: { key: string; hebrewName: string; defaultName: string }[] = [
  { key: 'broadcastArray', hebrewName: 'מערך שידורים', defaultName: 'Broadcast Array' },
  { key: 'externalBroadcasts', hebrewName: 'שידורים חיצוניים', defaultName: 'External Broadcasts' },
  { key: 'mcr', hebrewName: 'MCR', defaultName: 'MCR' },
  { key: 'closedCaptions', hebrewName: 'כתוביות', defaultName: 'Closed Captions' },
  { key: 'rundown', hebrewName: 'ראנדאון', defaultName: 'Rundown' },
  { key: 'warehouse', hebrewName: 'מחסן', defaultName: 'Warehouse' },
  { key: 'playout', hebrewName: 'Playout', defaultName: 'Playout' },
];

const AssignmentFormConfigPanel: React.FC = () => {
  const { message } = AntApp.useApp();
  const { data: deptData } = useQuery(GET_DEPARTMENTS, { fetchPolicy: 'cache-and-network' });
  const { data: usersData } = useQuery(GET_USERS, {
    variables: { isActive: true },
    fetchPolicy: 'cache-and-network',
  });
  const { data, loading, refetch } = useQuery(GET_ASSIGNMENT_FORM_CONFIGS, {
    fetchPolicy: 'cache-and-network',
  });
  const [upsert] = useMutation(UPSERT_ASSIGNMENT_FORM_CONFIG);
  const [removeConfig] = useMutation(DELETE_ASSIGNMENT_FORM_CONFIG);

  const departments: DepartmentRecord[] = useMemo(
    () => (deptData?.departments || []).filter((d: DepartmentRecord) => d.isActive),
    [deptData],
  );

  const departmentByCode = useMemo(() => {
    const m = new Map<string, DepartmentRecord>();
    for (const d of departments) m.set(d.code, d);
    return m;
  }, [departments]);

  const departmentOptions = useMemo(
    () =>
      departments.map((d) => ({
        value: d.code,
        label: d.hebrewName ? `${d.hebrewName} (${d.code})` : `${d.name} (${d.code})`,
      })),
    [departments],
  );

  const configs: FormConfigRecord[] = useMemo(() => data?.assignmentFormConfigs || [], [data]);

  // Flat list of all active users, used by the column-based editor's
  // "individual users" picker. Each user can be pinned to a column
  // regardless of their department membership.
  const allUsers = useMemo<Array<{ id: string; label: string; secondary?: string }>>(() => {
    const raw: any[] = usersData?.users || [];
    return raw.map((u) => {
      const label =
        u.displayName ||
        `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
        u.email ||
        u.id;
      const deptNames: string[] = Array.isArray(u.departments)
        ? u.departments
            .map((d: any) => d?.departmentName)
            .filter((n: any): n is string => !!n)
        : [];
      const secondary = deptNames.length ? deptNames.join(' · ') : u.department || '';
      return { id: u.id, label, secondary };
    });
  }, [usersData]);

  const userById = useMemo(() => {
    const m = new Map<string, { id: string; label: string; secondary?: string }>();
    for (const u of allUsers) m.set(u.id, u);
    return m;
  }, [allUsers]);

  const userOptions = useMemo(
    () =>
      allUsers.map((u) => ({
        value: u.id,
        label: u.secondary ? `${u.label} — ${u.secondary}` : u.label,
      })),
    [allUsers],
  );

  const [editingFormKey, setEditingFormKey] = useState<string | null>(null);
  const [currentFormKey, setCurrentFormKey] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [entries, setEntries] = useState<FormDepartmentEntry[]>([]);
  const [columns_, setColumns] = useState<FormColumnEntry[]>([]);

  const isColumnBased = COLUMN_BASED_FORM_KEYS.has(currentFormKey);

  const openEdit = (record?: FormConfigRecord, defaults?: { key: string; hebrewName: string; defaultName: string }) => {
    if (record) {
      setEditingFormKey(record.formKey);
      setCurrentFormKey(record.formKey);
      form.setFieldsValue({
        formKey: record.formKey,
        name: record.name,
        hebrewName: record.hebrewName || '',
        description: record.description || '',
        allowUserPresets: record.allowUserPresets,
        isActive: record.isActive,
      });
      setEntries(
        (record.departments || []).map((d, i) => ({
          departmentCode: d.departmentCode,
          allowedRoleKeys: d.allowedRoleKeys || [],
          requireUser: d.requireUser,
          defaultCount: d.defaultCount,
          order: typeof d.order === 'number' ? d.order : i,
        })),
      );
      setColumns(
        (record.columns || []).map((c, i) => ({
          key: c.key,
          hebrewLabel: c.hebrewLabel,
          englishLabel: c.englishLabel || '',
          allowedDepartmentCodes: c.allowedDepartmentCodes || [],
          allowedUserIds: c.allowedUserIds || [],
          requireUser: !!c.requireUser,
          defaultCount: typeof c.defaultCount === 'number' ? c.defaultCount : 1,
          order: typeof c.order === 'number' ? c.order : i,
        })),
      );
    } else {
      setEditingFormKey(null);
      setCurrentFormKey(defaults?.key || '');
      form.resetFields();
      form.setFieldsValue({
        formKey: defaults?.key || '',
        name: defaults?.defaultName || '',
        hebrewName: defaults?.hebrewName || '',
        allowUserPresets: true,
        isActive: true,
      });
      setEntries([]);
      setColumns([]);
    }
    setModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      const columnBased = COLUMN_BASED_FORM_KEYS.has(values.formKey);
      const payload = {
        formKey: values.formKey,
        name: values.name,
        hebrewName: values.hebrewName || null,
        description: values.description || null,
        allowUserPresets: values.allowUserPresets !== false,
        isActive: values.isActive !== false,
        departments: entries.map((e, i) => ({
          departmentCode: e.departmentCode,
          allowedRoleKeys: e.allowedRoleKeys || [],
          requireUser: !!e.requireUser,
          defaultCount: e.defaultCount ?? 1,
          order: typeof e.order === 'number' ? e.order : i,
        })),
        columns: columnBased
          ? columns_.map((c, i) => ({
              key: c.key || slugifyKey(c.englishLabel || c.hebrewLabel || `col_${i + 1}`),
              hebrewLabel: c.hebrewLabel,
              englishLabel: c.englishLabel || null,
              allowedDepartmentCodes: c.allowedDepartmentCodes || [],
              allowedUserIds: c.allowedUserIds || [],
              requireUser: !!c.requireUser,
              defaultCount: c.defaultCount ?? 1,
              order: typeof c.order === 'number' ? c.order : i,
            }))
          : [],
      };
      await upsert({ variables: { input: payload } });
      message.success('הגדרות הטופס נשמרו');
      setModalVisible(false);
      await refetch();
    } catch (err: any) {
      message.error(err?.message || 'שגיאה בשמירת ההגדרות');
    }
  };

  const handleDelete = async (formKey: string) => {
    try {
      await removeConfig({ variables: { formKey } });
      message.success('ההגדרות הוסרו');
      await refetch();
    } catch (err: any) {
      message.error(err?.message || 'שגיאה במחיקת ההגדרות');
    }
  };

  const moveEntry = (idx: number, direction: -1 | 1) => {
    const next = [...entries];
    const target = idx + direction;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    next.forEach((e, i) => (e.order = i));
    setEntries(next);
  };

  const moveColumn = (idx: number, direction: -1 | 1) => {
    const next = [...columns_];
    const target = idx + direction;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    next.forEach((c, i) => (c.order = i));
    setColumns(next);
  };

  const patchColumn = (idx: number, patch: Partial<FormColumnEntry>) => {
    setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const removeColumn = (idx: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, order: i })));
  };

  const addColumn = (preset?: BroadcastArrayColumnPreset) => {
    const idx = columns_.length;
    // If a preset is supplied but its key is already used, suffix it
    // so two distinct rows can coexist (admin can rename later).
    const takenKeys = new Set(columns_.map((c) => c.key));
    const baseKey = preset?.key || `col_${Date.now().toString(36)}`;
    let resolvedKey = baseKey;
    let n = 2;
    while (takenKeys.has(resolvedKey)) {
      resolvedKey = `${baseKey}_${n++}`;
    }
    setColumns([
      ...columns_,
      {
        key: resolvedKey,
        hebrewLabel: preset?.hebrewLabel || '',
        englishLabel: preset?.englishLabel || '',
        allowedDepartmentCodes: preset ? [...preset.allowedDepartmentCodes] : [],
        allowedUserIds: [],
        requireUser: false,
        defaultCount: 1,
        order: idx,
      },
    ]);
  };

  const columns = [
    {
      title: 'מזהה טופס',
      dataIndex: 'formKey',
      key: 'formKey',
      render: (k: string) => <Tag color="purple">{k}</Tag>,
    },
    {
      title: 'שם בעברית',
      key: 'hebrewName',
      render: (record: FormConfigRecord) => record.hebrewName || record.name,
    },
    {
      title: 'מחלקות / עמודות',
      key: 'sources',
      render: (record: FormConfigRecord) => {
        if (COLUMN_BASED_FORM_KEYS.has(record.formKey)) {
          const cols = record.columns || [];
          if (cols.length === 0) {
            return <Text type="secondary">לא הוגדרו עמודות</Text>;
          }
          return (
            <Space wrap size={4}>
              {cols.map((c) => (
                <Tag key={c.key} color="blue">
                  {c.hebrewLabel || c.key}
                </Tag>
              ))}
            </Space>
          );
        }
        return (
          <Space wrap size={4}>
            {(record.departments || []).map((d) => {
              const dept = departmentByCode.get(d.departmentCode);
              return (
                <Tag key={d.departmentCode} color="geekblue">
                  {dept?.hebrewName || dept?.name || d.departmentCode}
                </Tag>
              );
            })}
          </Space>
        );
      },
    },
    {
      title: 'פריסטים למשתמשים',
      key: 'allowUserPresets',
      render: (record: FormConfigRecord) => (
        <Tag color={record.allowUserPresets ? 'green' : 'default'}>
          {record.allowUserPresets ? 'פתוח' : 'סגור'}
        </Tag>
      ),
    },
    {
      title: 'סטטוס',
      key: 'isActive',
      render: (record: FormConfigRecord) => (
        <Tag color={record.isActive ? 'green' : 'red'}>{record.isActive ? 'פעיל' : 'כבוי'}</Tag>
      ),
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (record: FormConfigRecord) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="למחוק את הגדרות הטופס?"
            okText="כן"
            cancelText="ביטול"
            onConfirm={() => handleDelete(record.formKey)}
          >
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const knownNotConfigured = useMemo(() => {
    const taken = new Set(configs.map((c) => c.formKey));
    return KNOWN_FORMS.filter((f) => !taken.has(f.key));
  }, [configs]);

  const renderEntries = () => (
    <div>
      {entries.length === 0 ? (
        <Alert
          type="info"
          showIcon
          message="לא הוגדרו מחלקות לטופס זה. לחץ על + כדי להוסיף מחלקה."
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {entries.map((entry, idx) => {
        const dept = departmentByCode.get(entry.departmentCode);
        const roleOptions = (dept?.departmentRoles || [])
          .filter((r) => r.isActive !== false)
          .map((r) => ({ value: r.key, label: r.hebrewName || r.name }));

        return (
          <Card
            key={`${entry.departmentCode}_${idx}`}
            size="small"
            style={{ marginBottom: 8 }}
            title={
              <Space>
                <Text strong>#{idx + 1}</Text>
                <Tag>{dept?.hebrewName || dept?.name || entry.departmentCode}</Tag>
              </Space>
            }
            extra={
              <Space>
                <Tooltip title="הזז למעלה">
                  <Button
                    size="small"
                    icon={<ArrowUpOutlined />}
                    disabled={idx === 0}
                    onClick={() => moveEntry(idx, -1)}
                  />
                </Tooltip>
                <Tooltip title="הזז למטה">
                  <Button
                    size="small"
                    icon={<ArrowDownOutlined />}
                    disabled={idx === entries.length - 1}
                    onClick={() => moveEntry(idx, 1)}
                  />
                </Tooltip>
                <Popconfirm
                  title="להסיר את המחלקה מהטופס?"
                  okText="כן"
                  cancelText="ביטול"
                  onConfirm={() => setEntries((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Button danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            }
          >
            <Row gutter={8}>
              <Col span={8}>
                <Form.Item label="מחלקה" required style={{ marginBottom: 8 }}>
                  <Select
                    options={departmentOptions}
                    value={entry.departmentCode}
                    showSearch
                    filterOption={(input, option) =>
                      String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                    }
                    onChange={(code) => {
                      setEntries((prev) =>
                        prev.map((e, i) => (i === idx ? { ...e, departmentCode: code } : e)),
                      );
                    }}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col span={10}>
                <Form.Item
                  label="תפקידים מותרים"
                  tooltip="ריק = כל התפקידים של המחלקה זמינים"
                  style={{ marginBottom: 8 }}
                >
                  <Select
                    mode="multiple"
                    options={roleOptions}
                    value={entry.allowedRoleKeys}
                    placeholder="כל התפקידים"
                    onChange={(keys) =>
                      setEntries((prev) =>
                        prev.map((e, i) => (i === idx ? { ...e, allowedRoleKeys: keys } : e)),
                      )
                    }
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col span={3}>
                <Form.Item label="כמות ברירת מחדל" style={{ marginBottom: 8 }}>
                  <InputNumber
                    min={0}
                    value={entry.defaultCount}
                    onChange={(value) =>
                      setEntries((prev) =>
                        prev.map((e, i) =>
                          i === idx ? { ...e, defaultCount: Number(value) || 0 } : e,
                        ),
                      )
                    }
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col span={3}>
                <Form.Item label="חובה לבחור עובד" style={{ marginBottom: 8 }}>
                  <Switch
                    checked={!!entry.requireUser}
                    onChange={(v) =>
                      setEntries((prev) =>
                        prev.map((e, i) => (i === idx ? { ...e, requireUser: v } : e)),
                      )
                    }
                  />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        );
      })}
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        block
        onClick={() => {
          const firstAvailable =
            departmentOptions.find(
              (opt) => !entries.some((e) => e.departmentCode === opt.value),
            ) || departmentOptions[0];
          if (!firstAvailable) {
            message.warning('אין מחלקות זמינות. נא ליצור מחלקה תחילה.');
            return;
          }
          setEntries([
            ...entries,
            {
              departmentCode: firstAvailable.value,
              allowedRoleKeys: [],
              requireUser: false,
              defaultCount: 1,
              order: entries.length,
            },
          ]);
        }}
      >
        הוסף מחלקה
      </Button>
    </div>
  );

  // ---- Column-based editor (broadcastArray etc.) ----
  // Each row = one column rendered in the Broadcast Array grid. Admins
  // populate it with allowed departments and/or pinned individual users.
  const renderColumnsEditor = () => (
    <div>
      {columns_.length === 0 ? (
        <Alert
          type="info"
          showIcon
          message='לא הוגדרו עמודות לטופס זה. לחץ על "הוסף עמודה ידועה מראש" כדי להוסיף תבנית, או על "הוסף עמודה מותאמת אישית" ליצור חדשה.'
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {columns_.map((col, idx) => {
        const deptChips = (col.allowedDepartmentCodes || []).map((code) => {
          const dept = departmentByCode.get(code);
          return { code, label: dept?.hebrewName || dept?.name || code };
        });
        const userChips = (col.allowedUserIds || []).map((id) => {
          const u = userById.get(id);
          return { id, label: u?.label || id, secondary: u?.secondary };
        });

        return (
          <Card
            key={`col_${idx}_${col.key || col.hebrewLabel}`}
            size="small"
            style={{ marginBottom: 8 }}
            title={
              <Space>
                <Text strong>#{idx + 1}</Text>
                <Tag color="blue">{col.hebrewLabel || '—'}</Tag>
                {col.englishLabel ? <Tag>{col.englishLabel}</Tag> : null}
              </Space>
            }
            extra={
              <Space>
                <Tooltip title="הזז למעלה">
                  <Button
                    size="small"
                    icon={<ArrowUpOutlined />}
                    disabled={idx === 0}
                    onClick={() => moveColumn(idx, -1)}
                  />
                </Tooltip>
                <Tooltip title="הזז למטה">
                  <Button
                    size="small"
                    icon={<ArrowDownOutlined />}
                    disabled={idx === columns_.length - 1}
                    onClick={() => moveColumn(idx, 1)}
                  />
                </Tooltip>
                <Popconfirm
                  title="להסיר את העמודה?"
                  okText="כן"
                  cancelText="ביטול"
                  onConfirm={() => removeColumn(idx)}
                >
                  <Button danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            }
          >
            <Row gutter={[8, 8]}>
              <Col xs={24} md={8}>
                <Form.Item label="שם בעברית" required style={{ marginBottom: 8 }}>
                  <Input
                    value={col.hebrewLabel}
                    onChange={(e) => patchColumn(idx, { hebrewLabel: e.target.value })}
                    placeholder="למשל: עורך"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="שם באנגלית (אופציונלי)" style={{ marginBottom: 8 }}>
                  <Input
                    value={col.englishLabel || ''}
                    onChange={(e) => patchColumn(idx, { englishLabel: e.target.value })}
                    placeholder="Editor"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item label="כמות ברירת מחדל" style={{ marginBottom: 8 }}>
                  <InputNumber
                    min={0}
                    value={col.defaultCount}
                    onChange={(v) => patchColumn(idx, { defaultCount: Number(v) || 0 })}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item label="חובה לבחור עובד" style={{ marginBottom: 8 }}>
                  <Switch
                    checked={!!col.requireUser}
                    onChange={(v) => patchColumn(idx, { requireUser: v })}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[8, 8]}>
              <Col xs={24} md={12}>
                <div style={{ marginBottom: 4 }}>
                  <Space>
                    <Text strong>מחלקות זמינות</Text>
                    <Text type="secondary">(כל פעיל במחלקה יוצג בעמודה)</Text>
                  </Space>
                </div>
                <Space wrap size={[4, 4]} style={{ marginBottom: 6 }}>
                  {deptChips.length === 0 ? (
                    <Text type="secondary">לא נבחרו מחלקות</Text>
                  ) : (
                    deptChips.map((chip) => (
                      <Tag
                        key={chip.code}
                        color="geekblue"
                        closable
                        onClose={(e) => {
                          e.preventDefault();
                          patchColumn(idx, {
                            allowedDepartmentCodes: (col.allowedDepartmentCodes || []).filter(
                              (c) => c !== chip.code,
                            ),
                          });
                        }}
                      >
                        {chip.label}
                      </Tag>
                    ))
                  )}
                </Space>
                <Select
                  mode="multiple"
                  placeholder="+ הוסף מחלקה"
                  value={col.allowedDepartmentCodes}
                  options={departmentOptions}
                  showSearch
                  filterOption={(input, option) =>
                    String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  onChange={(vals) =>
                    patchColumn(idx, { allowedDepartmentCodes: vals as string[] })
                  }
                  style={{ width: '100%' }}
                  maxTagCount="responsive"
                  suffixIcon={<PlusOutlined />}
                />
              </Col>
              <Col xs={24} md={12}>
                <div style={{ marginBottom: 4 }}>
                  <Space>
                    <Text strong>משתמשים בודדים</Text>
                    <Text type="secondary">(בנוסף למחלקות שנבחרו)</Text>
                  </Space>
                </div>
                <Space wrap size={[4, 4]} style={{ marginBottom: 6 }}>
                  {userChips.length === 0 ? (
                    <Text type="secondary">לא נבחרו משתמשים</Text>
                  ) : (
                    userChips.map((chip) => (
                      <Tooltip key={chip.id} title={chip.secondary || ''}>
                        <Tag
                          color="green"
                          closable
                          onClose={(e) => {
                            e.preventDefault();
                            patchColumn(idx, {
                              allowedUserIds: (col.allowedUserIds || []).filter(
                                (u) => u !== chip.id,
                              ),
                            });
                          }}
                        >
                          {chip.label}
                        </Tag>
                      </Tooltip>
                    ))
                  )}
                </Space>
                <Select
                  mode="multiple"
                  placeholder="+ הוסף משתמש"
                  value={col.allowedUserIds}
                  options={userOptions}
                  showSearch
                  filterOption={(input, option) =>
                    String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  onChange={(vals) => patchColumn(idx, { allowedUserIds: vals as string[] })}
                  style={{ width: '100%' }}
                  maxTagCount="responsive"
                  suffixIcon={<PlusOutlined />}
                />
              </Col>
            </Row>
          </Card>
        );
      })}
      {(() => {
        // Mark presets whose key is already used so the admin sees at a
        // glance which built-in columns are already on the form.
        const usedKeys = new Set(columns_.map((c) => c.key));
        const presetMenu: MenuProps = {
          items: BROADCAST_ARRAY_COLUMN_PRESETS.map((p) => ({
            key: p.key,
            label: (
              <Space size={6}>
                <Text>{p.hebrewLabel}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {p.englishLabel}
                </Text>
                {usedKeys.has(p.key) ? (
                  <Tag color="default" style={{ marginInlineStart: 4 }}>
                    כבר נוסף
                  </Tag>
                ) : null}
              </Space>
            ),
            disabled: usedKeys.has(p.key),
          })),
          onClick: ({ key }) => {
            const preset = BROADCAST_ARRAY_COLUMN_PRESETS.find((p) => p.key === key);
            if (preset) addColumn(preset);
          },
        };

        return (
          <Space style={{ width: '100%' }} direction="vertical" size={8}>
            <Dropdown menu={presetMenu} trigger={['click']}>
              <Button block icon={<PlusOutlined />}>
                הוסף עמודה ידועה מראש (תבנית) ▾
              </Button>
            </Dropdown>
            <Button type="dashed" icon={<PlusOutlined />} block onClick={() => addColumn()}>
              הוסף עמודה מותאמת אישית
            </Button>
          </Space>
        );
      })()}
    </div>
  );

  return (
    <Card>
      <Row gutter={[12, 12]} justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col xs={24} lg={8}>
          <Space>
            <FormOutlined />
            <Title level={4} style={{ margin: 0 }}>
              הגדרת טפסים לשיוך אנשים
            </Title>
          </Space>
        </Col>
        <Col xs={24} lg={16}>
          <Space wrap size={[8, 8]} style={{ width: '100%', justifyContent: 'flex-end' }}>
            {knownNotConfigured.map((f) => (
              <Button key={f.key} icon={<PlusOutlined />} onClick={() => openEdit(undefined, f)}>
                {`הוסף הגדרה ל-${f.hebrewName}`}
              </Button>
            ))}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>
              טופס חדש
            </Button>
          </Space>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="לכל טופס בו ניתן לשייך אנשי צוות (כגון מערך שידורים, שידורים חיצוניים) הגדר אילו מחלקות מותר למשתמש לבחור מהן ואילו תפקידים פתוחים. הסדר משפיע על סדר ההצגה."
      />

      <Table
        loading={loading}
        rowKey="formKey"
        columns={columns as any}
        dataSource={configs}
        pagination={false}
        scroll={{ x: 760 }}
      />

      <Modal
        title={editingFormKey ? `עריכת הגדרות: ${editingFormKey}` : 'הגדרת טופס חדש'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={1000}
        okText="שמור"
        cancelText="ביטול"
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={(changed) => {
            // Track the formKey live so the modal body can switch
            // between the department- and column-based editors as the
            // user types it in for a brand-new form.
            if (typeof changed.formKey === 'string') {
              setCurrentFormKey(changed.formKey);
            }
          }}
        >
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                name="formKey"
                label="מזהה טופס"
                rules={[{ required: true, message: 'יש להזין מזהה' }]}
                tooltip="מזהה ייחודי באנגלית (למשל broadcastArray)"
              >
                <Input disabled={!!editingFormKey} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="name" label="שם באנגלית" rules={[{ required: true, message: 'נא להזין שם' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="hebrewName" label="שם בעברית">
                <Input />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="isActive" label="פעיל" valuePropName="checked">
                <Switch checkedChildren="פעיל" unCheckedChildren="לא פעיל" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="תיאור">
            <Input />
          </Form.Item>
          <Form.Item
            name="allowUserPresets"
            label="לאפשר למשתמשים לשמור פריסטים משותפים"
            valuePropName="checked"
            tooltip="כאשר פתוח, משתמשים בעלי הרשאת BROADCAST_VIEW יכולים ליצור פריסטים שמיועדים לכל הצוות. מנהלים תמיד יכולים לערוך את כל הפריסטים."
          >
            <Switch checkedChildren="פתוח" unCheckedChildren="סגור" />
          </Form.Item>

          {isColumnBased ? (
            <>
              <Title level={5}>עמודות הטופס</Title>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="לכל עמודה בטופס מערך השידור, הוסף את המחלקות שניתן לבחור מהן ו/או משתמשים בודדים שיהיו זמינים גם הם בעמודה זו."
              />
              {renderColumnsEditor()}
            </>
          ) : (
            <>
              <Title level={5}>מחלקות מותרות בטופס</Title>
              {renderEntries()}
            </>
          )}
        </Form>
      </Modal>
    </Card>
  );
};

export default AssignmentFormConfigPanel;
