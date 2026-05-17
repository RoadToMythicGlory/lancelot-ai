'use client';

import React, { useMemo, useState } from 'react';
import { gql, useMutation, useQuery } from '@apollo/client';
import {
  Card,
  Button,
  Spin,
  Empty,
  Modal,
  Form,
  Input,
  ColorPicker,
  Tag,
  Table,
  message,
  Popconfirm,
} from 'antd';
import {
  UserGroupIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS } from '@/components/shifts/i18n';
import DepartmentPicker from '@/components/shifts/DepartmentPicker';
import AplAssignModal from '@/components/shifts/modals/AplAssignModal';

const SETUP_QUERY = gql`
  query DeptUsersSetup($departmentId: String!) {
    departmentShiftSetup(departmentId: $departmentId) {
      employees {
        id
        firstName
        lastName
        displayName
        email
        systemRole
      }
      apls {
        id
        name
        color
        order
        active
        eligibleUserIds
      }
    }
  }
`;

const CREATE_APL = gql`
  mutation CreateAPL($input: APLInput!) {
    createAPL(input: $input) {
      id
      name
      color
      order
      eligibleUserIds
    }
  }
`;

const UPDATE_APL = gql`
  mutation UpdateAPL($id: ID!, $input: APLUpdateInput!) {
    updateAPL(id: $id, input: $input) {
      id
      name
      color
    }
  }
`;

const DELETE_APL = gql`
  mutation DeleteAPL($id: ID!) {
    deleteAPL(id: $id)
  }
`;

export default function DepartmentUsersPage() {
  const [activeDeptId, setActiveDeptId] = useState<string>('');
  const [aplModalOpen, setAplModalOpen] = useState(false);
  const [editingApl, setEditingApl] = useState<any | null>(null);
  const [form] = Form.useForm();

  const [aplAssignOpen, setAplAssignOpen] = useState(false);
  const [aplAssignUser, setAplAssignUser] = useState<{ id: string; name: string } | null>(null);

  const { data, loading, refetch } = useQuery(SETUP_QUERY, {
    variables: { departmentId: activeDeptId },
    skip: !activeDeptId,
    fetchPolicy: 'cache-and-network',
  });

  const [createAPL] = useMutation(CREATE_APL);
  const [updateAPL] = useMutation(UPDATE_APL);
  const [deleteAPL] = useMutation(DELETE_APL);

  const apls = data?.departmentShiftSetup?.apls || [];
  const employees = data?.departmentShiftSetup?.employees || [];

  function colorToHex(c: any): string {
    if (!c) return '#1890ff';
    if (typeof c === 'string') return c;
    if (typeof c.toHexString === 'function') return c.toHexString();
    return '#1890ff';
  }

  function openCreate() {
    setEditingApl(null);
    form.resetFields();
    form.setFieldsValue({ color: '#1890ff' });
    setAplModalOpen(true);
  }

  function openEdit(apl: any) {
    setEditingApl(apl);
    form.setFieldsValue({ name: apl.name, color: apl.color || '#1890ff', order: apl.order });
    setAplModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      const color = colorToHex(values.color);
      if (editingApl) {
        await updateAPL({
          variables: {
            id: editingApl.id,
            input: { name: values.name, color, order: values.order ?? 0 },
          },
        });
        message.success('APL עודכן');
      } else {
        await createAPL({
          variables: {
            input: {
              departmentId: activeDeptId,
              name: values.name,
              color,
              order: values.order ?? 0,
              active: true,
              eligibleUserIds: [],
            },
          },
        });
        message.success('APL נוצר');
      }
      setAplModalOpen(false);
      refetch();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || 'שגיאה');
    }
  }

  async function handleDelete(apl: any) {
    try {
      await deleteAPL({ variables: { id: apl.id } });
      message.success('APL נמחק');
      refetch();
    } catch (err: any) {
      message.error(err?.message || 'שגיאה');
    }
  }

  const employeeColumns = [
    {
      title: 'שם',
      key: 'name',
      render: (e: any) =>
        e.displayName || `${e.firstName || ''} ${e.lastName || ''}`.trim(),
    },
    { title: 'אימייל', dataIndex: 'email', key: 'email' },
    {
      title: 'APLs',
      key: 'apls',
      render: (e: any) => {
        const userApls = apls.filter((a: any) => a.eligibleUserIds.includes(e.id));
        if (userApls.length === 0) return <span className="text-gray-400 text-xs">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {userApls.map((a: any) => (
              <Tag key={a.id} color={a.color || 'default'}>
                {a.name}
              </Tag>
            ))}
          </div>
        );
      },
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (e: any) => (
        <Button
          size="small"
          onClick={() => {
            setAplAssignUser({
              id: e.id,
              name:
                e.displayName ||
                `${e.firstName || ''} ${e.lastName || ''}`.trim() ||
                e.email,
            });
            setAplAssignOpen(true);
          }}
        >
          ערוך APLs
        </Button>
      ),
    },
  ];

  return (
    <ProtectedRoute requires={Permission.SHIFTS_MANAGE} departmentId={activeDeptId || undefined}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <UserGroupIcon className="h-5 w-5 text-gray-500" />
            {LABELS.DEPARTMENT_USERS}
          </h1>
          <DepartmentPicker value={activeDeptId} onChange={setActiveDeptId} scope="manageable" />
        </div>

        {!activeDeptId ? (
          <Card>
            <Empty description="אנא בחר מחלקה" />
          </Card>
        ) : (
          <>
            <Card
              title="APLs במחלקה"
              extra={
                <Button type="primary" icon={<PlusIcon className="h-4 w-4" />} onClick={openCreate}>
                  APL חדש
                </Button>
              }
            >
              {loading && apls.length === 0 ? (
                <div className="flex justify-center py-6">
                  <Spin />
                </div>
              ) : apls.length === 0 ? (
                <Empty description="לא הוגדרו APLs" />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {apls.map((a: any) => (
                    <div
                      key={a.id}
                      className="inline-flex items-center gap-2 border border-gray-200 rounded-md px-2 py-1"
                    >
                      <Tag color={a.color || 'default'}>{a.name}</Tag>
                      <span className="text-xs text-gray-400">
                        {a.eligibleUserIds.length} עובדים
                      </span>
                      <Button
                        size="small"
                        type="text"
                        icon={<PencilSquareIcon className="h-4 w-4" />}
                        onClick={() => openEdit(a)}
                      />
                      <Popconfirm
                        title="למחוק APL?"
                        onConfirm={() => handleDelete(a)}
                        okText={LABELS.DELETE}
                        cancelText={LABELS.CANCEL}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<TrashIcon className="h-4 w-4" />}
                        />
                      </Popconfirm>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="עובדי המחלקה">
              {loading && employees.length === 0 ? (
                <div className="flex justify-center py-6">
                  <Spin />
                </div>
              ) : employees.length === 0 ? (
                <Empty description="לא נמצאו עובדים" />
              ) : (
                <Table
                  dataSource={employees}
                  columns={employeeColumns}
                  rowKey="id"
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                />
              )}
            </Card>
          </>
        )}

        <Modal
          title={editingApl ? 'עריכת APL' : 'APL חדש'}
          open={aplModalOpen}
          onCancel={() => setAplModalOpen(false)}
          onOk={handleSave}
          okText={LABELS.SAVE}
          cancelText={LABELS.CANCEL}
          destroyOnClose
        >
          <Form form={form} layout="vertical">
            <Form.Item
              label="שם APL"
              name="name"
              rules={[{ required: true, message: 'אנא הזן שם' }]}
            >
              <Input placeholder="למשל: במאי, טכנאי, צלם" />
            </Form.Item>
            <Form.Item label="צבע" name="color">
              <ColorPicker showText />
            </Form.Item>
            <Form.Item label="סדר" name="order">
              <Input type="number" />
            </Form.Item>
          </Form>
        </Modal>

        <AplAssignModal
          open={aplAssignOpen}
          onClose={() => setAplAssignOpen(false)}
          user={aplAssignUser}
          departmentId={activeDeptId}
          apls={apls}
          onSaved={() => refetch()}
        />
      </div>
    </ProtectedRoute>
  );
}
