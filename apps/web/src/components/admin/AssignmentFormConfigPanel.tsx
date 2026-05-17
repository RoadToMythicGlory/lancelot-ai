'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Button,
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

interface FormConfigRecord {
  id: string;
  formKey: string;
  name: string;
  hebrewName?: string | null;
  description?: string | null;
  allowUserPresets: boolean;
  isActive: boolean;
  departments: FormDepartmentEntry[];
}

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

  const [editingFormKey, setEditingFormKey] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [entries, setEntries] = useState<FormDepartmentEntry[]>([]);

  const openEdit = (record?: FormConfigRecord, defaults?: { key: string; hebrewName: string; defaultName: string }) => {
    if (record) {
      setEditingFormKey(record.formKey);
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
    } else {
      setEditingFormKey(null);
      form.resetFields();
      form.setFieldsValue({
        formKey: defaults?.key || '',
        name: defaults?.defaultName || '',
        hebrewName: defaults?.hebrewName || '',
        allowUserPresets: true,
        isActive: true,
      });
      setEntries([]);
    }
    setModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    try {
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
      title: 'מחלקות זמינות',
      key: 'departments',
      render: (record: FormConfigRecord) => (
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
      ),
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
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
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

          <Title level={5}>מחלקות מותרות בטופס</Title>
          {renderEntries()}
        </Form>
      </Modal>
    </Card>
  );
};

export default AssignmentFormConfigPanel;
