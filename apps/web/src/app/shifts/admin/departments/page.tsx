'use client';

import React, { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import {
  Card,
  Button,
  Spin,
  Empty,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Table,
  Tag,
} from 'antd';
import {
  BuildingOffice2Icon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import { Alert } from 'antd';
import { LABELS } from '@/components/shifts/i18n';
import { GET_DEPARTMENTS } from '@/graphql/queries';
import {
  CREATE_DEPARTMENT,
  UPDATE_DEPARTMENT,
  DELETE_DEPARTMENT,
} from '@/graphql/mutations';

export default function ManageDepartmentsPage() {
  const { user } = useAuth();
  const isSystemAdmin =
    user?.systemRole === 'SYSTEM_ADMIN' || user?.systemRole === 'IT_ADMIN';

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();

  const { data, loading, refetch } = useQuery(GET_DEPARTMENTS, {
    skip: !isSystemAdmin,
    fetchPolicy: 'cache-and-network',
  });
  const [createDepartment] = useMutation(CREATE_DEPARTMENT);
  const [updateDepartment] = useMutation(UPDATE_DEPARTMENT);
  const [deleteDepartment] = useMutation(DELETE_DEPARTMENT);

  const departments = (data?.departments || []) as any[];

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }
  function openEdit(d: any) {
    setEditing(d);
    form.setFieldsValue({
      code: d.code,
      name: d.name,
      hebrewName: d.hebrewName,
      category: d.category,
      description: d.description,
    });
    setModalOpen(true);
  }
  async function handleSave() {
    try {
      const v = await form.validateFields();
      if (editing) {
        await updateDepartment({
          variables: {
            code: editing.code,
            input: {
              name: v.name,
              hebrewName: v.hebrewName,
              category: v.category,
              description: v.description,
            },
          },
        });
        message.success('המחלקה עודכנה');
      } else {
        await createDepartment({
          variables: {
            input: {
              code: v.code,
              name: v.name,
              hebrewName: v.hebrewName,
              category: v.category || 'general',
              description: v.description || null,
            },
          },
        });
        message.success('המחלקה נוצרה');
      }
      setModalOpen(false);
      refetch();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || 'שגיאה');
    }
  }
  async function handleDelete(d: any) {
    try {
      await deleteDepartment({ variables: { code: d.code } });
      message.success('המחלקה נמחקה');
      refetch();
    } catch (err: any) {
      message.error(err?.message || 'שגיאה');
    }
  }

  const columns = [
    { title: 'קוד', dataIndex: 'code', key: 'code' },
    {
      title: 'שם',
      key: 'name',
      render: (d: any) => d.hebrewName || d.name,
    },
    { title: 'קטגוריה', dataIndex: 'category', key: 'category' },
    {
      title: 'פעיל',
      key: 'active',
      render: (d: any) => (
        <Tag color={d.isActive ? 'green' : 'default'}>
          {d.isActive ? 'פעיל' : 'לא פעיל'}
        </Tag>
      ),
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (d: any) => (
        <div className="flex gap-1">
          <Button
            size="small"
            type="text"
            icon={<PencilSquareIcon className="h-4 w-4" />}
            onClick={() => openEdit(d)}
          />
          <Popconfirm
            title={`למחוק את המחלקה ${d.hebrewName || d.name}?`}
            onConfirm={() => handleDelete(d)}
            okText={LABELS.DELETE}
            cancelText={LABELS.CANCEL}
          >
            <Button size="small" type="text" danger icon={<TrashIcon className="h-4 w-4" />} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <ProtectedRoute requires={Permission.SHIFTS_VIEW_ALL}>
      {!isSystemAdmin ? (
        <Alert
          message={LABELS.NO_PERMISSION}
          description="עמוד זה מיועד למנהלי מערכת בלבד."
          type="error"
          showIcon
        />
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
              <BuildingOffice2Icon className="h-5 w-5 text-gray-500" />
              {LABELS.MANAGE_DEPARTMENTS}
            </h1>
            <Button type="primary" icon={<PlusIcon className="h-4 w-4" />} onClick={openCreate}>
              מחלקה חדשה
            </Button>
          </div>

          <Card>
            {loading && departments.length === 0 ? (
              <div className="flex justify-center py-6">
                <Spin />
              </div>
            ) : departments.length === 0 ? (
              <Empty description="אין מחלקות" />
            ) : (
              <Table dataSource={departments} columns={columns} rowKey="id" pagination={false} />
            )}
          </Card>

          <Modal
            title={editing ? 'עריכת מחלקה' : 'מחלקה חדשה'}
            open={modalOpen}
            onCancel={() => setModalOpen(false)}
            onOk={handleSave}
            okText={LABELS.SAVE}
            cancelText={LABELS.CANCEL}
            destroyOnClose
          >
            <Form form={form} layout="vertical">
              <Form.Item
                label="קוד"
                name="code"
                rules={[{ required: !editing, message: 'אנא הזן קוד' }]}
              >
                <Input disabled={!!editing} placeholder="MCR / NEWS / IT" />
              </Form.Item>
              <Form.Item label="שם בעברית" name="hebrewName">
                <Input />
              </Form.Item>
              <Form.Item label="שם באנגלית" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="קטגוריה" name="category">
                <Input placeholder="general / production / news" />
              </Form.Item>
              <Form.Item label="תיאור" name="description">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Form>
          </Modal>
        </div>
      )}
    </ProtectedRoute>
  );
}
