'use client';

import React, { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Switch, Space, Tag, Card,
  message, Popconfirm, Row, Col,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, gql } from '@apollo/client';
import PermissionPicker from './PermissionPicker';

const { Option } = Select;

// ---- GraphQL ----

const GET_ROLE_TEMPLATES = gql`
  query GetRoleTemplates {
    roleTemplates {
      id
      name
      description
      baseSystemRole
      departmentScope
      permissions
      allowedForDeptAdmins
      isActive
      createdAt
      updatedAt
    }
  }
`;

const CREATE_ROLE_TEMPLATE = gql`
  mutation CreateRoleTemplate($input: CreateRoleTemplateInput!) {
    createRoleTemplate(input: $input) {
      id
      name
    }
  }
`;

const UPDATE_ROLE_TEMPLATE = gql`
  mutation UpdateRoleTemplate($id: ID!, $input: UpdateRoleTemplateInput!) {
    updateRoleTemplate(id: $id, input: $input) {
      id
      name
    }
  }
`;

const DELETE_ROLE_TEMPLATE = gql`
  mutation DeleteRoleTemplate($id: ID!) {
    deleteRoleTemplate(id: $id)
  }
`;

// ---- Types ----

interface RoleTemplate {
  id: string;
  name: string;
  description?: string;
  baseSystemRole: string;
  departmentScope?: string;
  permissions: string[];
  allowedForDeptAdmins: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const SYSTEM_ROLE_LABELS: Record<string, string> = {
  SYSTEM_ADMIN: 'מנהל מערכת',
  IT_ADMIN: 'מנהל IT',
  IT_USER: 'משתמש IT',
  DEPARTMENT_ADMIN: 'מנהל מחלקה',
  DEPARTMENT_USER: 'משתמש מחלקה',
};

// ---- Component ----

export default function RoleTemplatesPanel() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleTemplate | null>(null);
  const [form] = Form.useForm();
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const { data, loading, refetch } = useQuery(GET_ROLE_TEMPLATES);
  const [createTemplate] = useMutation(CREATE_ROLE_TEMPLATE);
  const [updateTemplate] = useMutation(UPDATE_ROLE_TEMPLATE);
  const [deleteTemplate] = useMutation(DELETE_ROLE_TEMPLATE);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      baseSystemRole: 'DEPARTMENT_USER',
      allowedForDeptAdmins: true,
    });
    setSelectedPermissions([]);
    setModalOpen(true);
  };

  const openEdit = (record: RoleTemplate) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      baseSystemRole: record.baseSystemRole,
      departmentScope: record.departmentScope || undefined,
      allowedForDeptAdmins: record.allowedForDeptAdmins,
    });
    setSelectedPermissions(record.permissions ?? []);
    setModalOpen(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      const input = {
        name: values.name,
        description: values.description || undefined,
        baseSystemRole: values.baseSystemRole,
        departmentScope: values.departmentScope || null,
        permissions: selectedPermissions,
        allowedForDeptAdmins: values.allowedForDeptAdmins ?? false,
      };

      if (editing) {
        await updateTemplate({ variables: { id: editing.id, input } });
        message.success('תבנית עודכנה בהצלחה');
      } else {
        await createTemplate({ variables: { input } });
        message.success('תבנית נוצרה בהצלחה');
      }

      setModalOpen(false);
      refetch();
    } catch (err: any) {
      message.error(err.message || 'שגיאה בשמירת התבנית');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate({ variables: { id } });
      message.success('תבנית נמחקה בהצלחה');
      refetch();
    } catch (err: any) {
      message.error(err.message || 'שגיאה במחיקת התבנית');
    }
  };

  const columns = [
    {
      title: 'שם',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: RoleTemplate) => (
        <Space>
          <span style={{ fontWeight: 500 }}>{name}</span>
          {!record.isActive && <Tag color="red">לא פעיל</Tag>}
        </Space>
      ),
    },
    {
      title: 'תיאור',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'תפקיד בסיס',
      dataIndex: 'baseSystemRole',
      key: 'baseSystemRole',
      render: (role: string) => (
        <Tag color={role === 'DEPARTMENT_ADMIN' ? 'green' : 'blue'}>
          {SYSTEM_ROLE_LABELS[role] || role}
        </Tag>
      ),
    },
    {
      title: 'הרשאות',
      key: 'permissions',
      render: (_: any, record: RoleTemplate) => (
        <Tag color="blue">{record.permissions?.length ?? 0} הרשאות</Tag>
      ),
    },
    {
      title: 'זמין למנהלי מחלקה',
      dataIndex: 'allowedForDeptAdmins',
      key: 'allowedForDeptAdmins',
      render: (val: boolean) => (
        <Tag color={val ? 'green' : 'orange'}>{val ? 'כן' : 'לא'}</Tag>
      ),
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_: any, record: RoleTemplate) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => openEdit(record)} />
          <Popconfirm
            title="האם למחוק את התבנית?"
            onConfirm={() => handleDelete(record.id)}
            okText="כן"
            cancelText="לא"
          >
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <h2 style={{ margin: 0 }}>תבניות תפקידים</h2>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            תבנית חדשה
          </Button>
        </Col>
      </Row>

      <Table
        loading={loading}
        dataSource={data?.roleTemplates ?? []}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editing ? 'עריכת תבנית' : 'תבנית חדשה'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={720}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="שם התבנית"
                rules={[{ required: true, message: 'נא להזין שם' }]}
              >
                <Input placeholder='לדוגמה: "MCR Operator"' />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="baseSystemRole" label="תפקיד בסיס" rules={[{ required: true }]}>
                <Select>
                  <Option value="DEPARTMENT_USER">משתמש מחלקה</Option>
                  <Option value="DEPARTMENT_ADMIN">מנהל מחלקה</Option>
                  <Option value="IT_USER">משתמש IT</Option>
                  <Option value="IT_ADMIN">מנהל IT</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="תיאור">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item name="departmentScope" label="הגבלה למחלקה (אופציונלי)">
            <Input placeholder="השאר ריק לכל המחלקות" />
          </Form.Item>

          <Form.Item
            name="allowedForDeptAdmins"
            label="זמין למנהלי מחלקה"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item label="הרשאות נוספות (מעל תפקיד הבסיס)">
            <PermissionPicker
              value={selectedPermissions}
              onChange={setSelectedPermissions}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editing ? 'עדכן' : 'צור'}
              </Button>
              <Button onClick={() => setModalOpen(false)}>ביטול</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
