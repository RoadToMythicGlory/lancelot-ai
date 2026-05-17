'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Space,
  Tag,
  Card,
  Row,
  Col,
  App as AntApp,
  Popconfirm,
  Typography,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import { GET_DEPARTMENTS } from '@/graphql/queries';
import {
  CREATE_DEPARTMENT,
  UPDATE_DEPARTMENT,
  DELETE_DEPARTMENT,
} from '@/graphql/mutations';
import { Permission } from '@/rbac';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface DepartmentRoleDef {
  key: string;
  name: string;
  hebrewName?: string | null;
  description?: string | null;
  permissions: string[];
  order?: number | null;
  isActive: boolean;
}

interface DepartmentRecord {
  id: string;
  code: string;
  name: string;
  hebrewName?: string | null;
  category: string;
  description?: string | null;
  isActive: boolean;
  roles: string[];
  permissions: string[];
  includesDepartmentCodes: string[];
  departmentRoles: DepartmentRoleDef[];
}

const ALL_PERMISSION_OPTIONS = Object.values(Permission).map((p) => ({
  value: p as string,
  label: p as string,
}));

interface RoleEditorProps {
  value?: DepartmentRoleDef[];
  onChange?: (roles: DepartmentRoleDef[]) => void;
}

const RoleEditor: React.FC<RoleEditorProps> = ({ value = [], onChange }) => {
  const update = (next: DepartmentRoleDef[]) => onChange?.(next);

  // Stable per-row React keys. The user-editable `role.key` field cannot be
  // used as the React key, because every keystroke would change it and React
  // would unmount/remount the row, blowing away input focus. We track a
  // separate immutable id per role and persist it across renders via a ref.
  const uidsRef = useRef<string[]>([]);
  const items = value || [];
  if (uidsRef.current.length !== items.length) {
    const next = uidsRef.current.slice(0, items.length);
    while (next.length < items.length) {
      next.push(`__rowuid_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    }
    uidsRef.current = next;
  }

  const handleAdd = () => {
    const next: DepartmentRoleDef = {
      key: `role_${Date.now()}`,
      name: '',
      hebrewName: '',
      description: '',
      permissions: [],
      order: items.length,
      isActive: true,
    };
    uidsRef.current = [
      ...uidsRef.current,
      `__rowuid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    ];
    update([...items, next]);
  };

  const handleRemove = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    uidsRef.current = uidsRef.current.filter((_, i) => i !== idx);
    update(next);
  };

  const handleChange = (idx: number, patch: Partial<DepartmentRoleDef>) => {
    const next = items.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    update(next);
  };

  return (
    <div>
      {items.map((role, idx) => (
        <Card
          key={uidsRef.current[idx] || idx}
          size="small"
          style={{ marginBottom: 8 }}
          title={
            <Space>
              <Text strong>תפקיד #{idx + 1}</Text>
              <Switch
                checked={role.isActive}
                onChange={(checked) => handleChange(idx, { isActive: checked })}
                checkedChildren="פעיל"
                unCheckedChildren="לא פעיל"
                size="small"
              />
            </Space>
          }
          extra={
            <Popconfirm
              title="להסיר את התפקיד הזה?"
              okText="כן"
              cancelText="לא"
              onConfirm={() => handleRemove(idx)}
            >
              <Button danger size="small" icon={<DeleteOutlined />} />
            </Popconfirm>
          }
        >
          <Row gutter={8}>
            <Col span={6}>
              <Form.Item label="מזהה תפקיד" required style={{ marginBottom: 8 }}>
                <Input
                  value={role.key}
                  placeholder="role_key"
                  onChange={(e) => handleChange(idx, { key: e.target.value })}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="שם (אנגלית)" required style={{ marginBottom: 8 }}>
                <Input
                  value={role.name}
                  placeholder="Role Name"
                  onChange={(e) => handleChange(idx, { name: e.target.value })}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="שם בעברית" style={{ marginBottom: 8 }}>
                <Input
                  value={role.hebrewName || ''}
                  placeholder="שם תצוגה"
                  onChange={(e) => handleChange(idx, { hebrewName: e.target.value })}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="סדר תצוגה" style={{ marginBottom: 8 }}>
                <Input
                  type="number"
                  value={role.order ?? 0}
                  onChange={(e) => handleChange(idx, { order: Number(e.target.value) || 0 })}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="תיאור" style={{ marginBottom: 8 }}>
            <Input
              value={role.description || ''}
              onChange={(e) => handleChange(idx, { description: e.target.value })}
            />
          </Form.Item>
          <Form.Item
            label={
              <Tooltip title="הרשאות שיתווספו אוטומטית למשתמש שמוקצה לתפקיד זה במחלקה">
                <span>הרשאות תפקיד</span>
              </Tooltip>
            }
            style={{ marginBottom: 0 }}
          >
            <Select
              mode="multiple"
              placeholder="בחר הרשאות"
              value={role.permissions || []}
              options={ALL_PERMISSION_OPTIONS}
              onChange={(perms) => handleChange(idx, { permissions: perms })}
              showSearch={false}
              maxTagCount="responsive"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Card>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={handleAdd} block>
        הוסף תפקיד
      </Button>
    </div>
  );
};

const DepartmentsAdminPanel: React.FC = () => {
  const { message, modal } = AntApp.useApp();
  const { data, loading, refetch } = useQuery(GET_DEPARTMENTS, {
    fetchPolicy: 'cache-and-network',
  });
  const [createDepartment] = useMutation(CREATE_DEPARTMENT);
  const [updateDepartment] = useMutation(UPDATE_DEPARTMENT);
  const [deleteDepartment] = useMutation(DELETE_DEPARTMENT);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<DepartmentRecord | null>(null);
  const [form] = Form.useForm();

  const departments: DepartmentRecord[] = useMemo(() => {
    return (data?.departments || []) as DepartmentRecord[];
  }, [data]);

  const departmentCodeOptions = useMemo(
    () =>
      departments
        .filter((d) => d.isActive)
        .map((d) => ({
          value: d.code,
          label: d.hebrewName ? `${d.hebrewName} (${d.code})` : `${d.name} (${d.code})`,
        })),
    [departments],
  );

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      isActive: true,
      category: 'General',
      departmentRoles: [],
      includesDepartmentCodes: [],
      permissions: [],
    });
    setModalVisible(true);
  };

  const openEdit = (record: DepartmentRecord) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue({
      code: record.code,
      name: record.name,
      hebrewName: record.hebrewName || '',
      category: record.category || 'General',
      description: record.description || '',
      isActive: record.isActive,
      includesDepartmentCodes: record.includesDepartmentCodes || [],
      permissions: record.permissions || [],
      departmentRoles: record.departmentRoles || [],
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      const roles = (values.departmentRoles || []).map((r: DepartmentRoleDef) => ({
        key: r.key,
        name: r.name,
        hebrewName: r.hebrewName || null,
        description: r.description || null,
        permissions: r.permissions || [],
        order: typeof r.order === 'number' ? r.order : 0,
        isActive: r.isActive !== false,
      }));

      const baseInput = {
        name: values.name,
        hebrewName: values.hebrewName || null,
        category: values.category || 'General',
        description: values.description || null,
        isActive: values.isActive !== false,
        roles,
        includesDepartmentCodes: values.includesDepartmentCodes || [],
        permissions: values.permissions || [],
      };

      if (editing) {
        await updateDepartment({ variables: { code: editing.code, input: baseInput } });
        message.success('המחלקה עודכנה');
      } else {
        await createDepartment({ variables: { input: { ...baseInput, code: values.code } } });
        message.success('המחלקה נוצרה');
      }
      setModalVisible(false);
      await refetch();
    } catch (err: any) {
      message.error(err?.message || 'שגיאה בשמירת המחלקה');
    }
  };

  const handleDelete = (code: string) => {
    modal.confirm({
      title: 'השבתת מחלקה',
      content: 'המחלקה תוסתר מרשימות אך תישמר במאגר על מנת לא לפגוע בנתונים היסטוריים. להמשיך?',
      okText: 'כן, השבת',
      cancelText: 'ביטול',
      onOk: async () => {
        try {
          await deleteDepartment({ variables: { code } });
          message.success('המחלקה הושבתה');
          await refetch();
        } catch (err: any) {
          message.error(err?.message || 'שגיאה בהשבתת המחלקה');
        }
      },
    });
  };

  const columns = [
    {
      title: 'מזהה',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Tag>{code}</Tag>,
    },
    {
      title: 'שם בעברית',
      key: 'hebrewName',
      render: (record: DepartmentRecord) => record.hebrewName || record.name,
    },
    {
      title: 'שם באנגלית',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'קטגוריה',
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => <Tag color="blue">{cat}</Tag>,
    },
    {
      title: 'תפקידים',
      key: 'roles',
      render: (record: DepartmentRecord) => (
        <Space wrap size="small">
          {(record.departmentRoles || []).map((r) => (
            <Tag key={r.key} color={r.isActive ? 'geekblue' : 'default'}>
              {r.hebrewName || r.name}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'סטטוס',
      key: 'isActive',
      render: (record: DepartmentRecord) => (
        <Tag color={record.isActive ? 'green' : 'red'}>
          {record.isActive ? 'פעיל' : 'מושבת'}
        </Tag>
      ),
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (record: DepartmentRecord) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.code)}
          />
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <TeamOutlined />
            <Title level={4} style={{ margin: 0 }}>
              ניהול מחלקות
            </Title>
          </Space>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            מחלקה חדשה
          </Button>
        </Col>
      </Row>

      <Table
        loading={loading}
        rowKey="code"
        columns={columns as any}
        dataSource={departments}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editing ? `עריכת מחלקה: ${editing.code}` : 'יצירת מחלקה חדשה'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={900}
        okText="שמור"
        cancelText="ביטול"
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                name="code"
                label="מזהה (Code)"
                tooltip="מזהה ייחודי באנגלית, ישמש בהפניות במערכת. לא ניתן לשינוי לאחר היצירה."
                rules={[{ required: true, message: 'יש להזין מזהה' }]}
              >
                <Input disabled={!!editing} placeholder="MCR" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="name" label="שם באנגלית" rules={[{ required: true, message: 'יש להזין שם' }]}>
                <Input placeholder="Master Control Room" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="hebrewName" label="שם בעברית">
                <Input placeholder="חדר שליטה ראשי" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="category" label="קטגוריה">
                <Input placeholder="Production" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="תיאור">
            <TextArea rows={2} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="includesDepartmentCodes"
                label="מחלקות נוספות הכלולות במחלקה זו"
                tooltip="לדוגמה: מחלקת MCR יכולה לכלול גם MCR-Playout ו-MCR-Ingest כך שהמשתמשים יופיעו ברשימות המאוחדות"
              >
                <Select
                  mode="multiple"
                  options={departmentCodeOptions}
                  placeholder="בחר מחלקות"
                  allowClear
                  showSearch
                  filterOption={(input, option) =>
                    String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="permissions"
                label="הרשאות נוספות לכל אנשי המחלקה"
                tooltip="הרשאות אלו יוענקו לכל המשתמשים החברים במחלקה ללא תלות בתפקיד"
              >
                <Select
                  mode="multiple"
                  options={ALL_PERMISSION_OPTIONS}
                  placeholder="בחר הרשאות"
                  allowClear
                  showSearch={false}
                  maxTagCount="responsive"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="isActive" label="פעילה" valuePropName="checked">
            <Switch checkedChildren="פעיל" unCheckedChildren="לא פעיל" />
          </Form.Item>

          <Title level={5}>תפקידים במחלקה</Title>
          <Text type="secondary">
            לכל תפקיד תוכל להגדיר הרשאות נוספות שיוענקו אוטומטית למשתמשים שמוקצים אליו.
          </Text>
          <div style={{ marginTop: 12 }}>
            <Form.Item name="departmentRoles" valuePropName="value" trigger="onChange" noStyle>
              <RoleEditor />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </Card>
  );
};

export default DepartmentsAdminPanel;
