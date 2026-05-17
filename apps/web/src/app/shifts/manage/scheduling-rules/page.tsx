'use client';

import React, { useState } from 'react';
import { gql, useMutation, useQuery } from '@apollo/client';
import {
  Card,
  Button,
  Spin,
  Empty,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  message,
  Popconfirm,
  Table,
  Tag,
} from 'antd';
import {
  Cog6ToothIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS } from '@/components/shifts/i18n';
import DepartmentPicker from '@/components/shifts/DepartmentPicker';

const RULES = gql`
  query SchedulingRules($departmentId: String!) {
    schedulingRules(departmentId: $departmentId) {
      id
      name
      active
      maxDaysPerWeek
      maxConsecutiveDays
      maxShiftsOfTypePerWeek
      shiftTypeId
      maxConsecutiveShiftsOfType
      categoryId
      maxCategorySlotsPerWeek
    }
  }
`;

const SHIFT_TYPE_DEFS = gql`
  query ShiftTypeDefsForRules($departmentId: String!) {
    shiftTypeDefs(departmentId: $departmentId) {
      id
      name
    }
  }
`;

const CATEGORIES = gql`
  query CategoriesForRules($departmentId: String!) {
    shiftCategories(departmentId: $departmentId) {
      id
      name
    }
  }
`;

const CREATE = gql`
  mutation CreateSchedulingRule($input: SchedulingRuleInput!) {
    createSchedulingRule(input: $input) {
      id
    }
  }
`;
const UPDATE = gql`
  mutation UpdateSchedulingRule($id: ID!, $input: SchedulingRuleUpdateInput!) {
    updateSchedulingRule(id: $id, input: $input) {
      id
    }
  }
`;
const DELETE = gql`
  mutation DeleteSchedulingRule($id: ID!) {
    deleteSchedulingRule(id: $id)
  }
`;

export default function SchedulingRulesPage() {
  const [activeDeptId, setActiveDeptId] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();

  const { data, refetch, loading } = useQuery(RULES, {
    variables: { departmentId: activeDeptId },
    skip: !activeDeptId,
    fetchPolicy: 'cache-and-network',
  });
  const { data: typesData } = useQuery(SHIFT_TYPE_DEFS, {
    variables: { departmentId: activeDeptId },
    skip: !activeDeptId,
  });
  const { data: catsData } = useQuery(CATEGORIES, {
    variables: { departmentId: activeDeptId },
    skip: !activeDeptId,
  });
  const [createRule] = useMutation(CREATE);
  const [updateRule] = useMutation(UPDATE);
  const [deleteRule] = useMutation(DELETE);

  const rules = data?.schedulingRules || [];
  const shiftTypes = typesData?.shiftTypeDefs || [];
  const categories = catsData?.shiftCategories || [];

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ active: true });
    setModalOpen(true);
  }
  function openEdit(r: any) {
    setEditing(r);
    form.setFieldsValue(r);
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const v = await form.validateFields();
      const payload: any = {
        name: v.name,
        active: v.active !== false,
        maxDaysPerWeek: v.maxDaysPerWeek ?? null,
        maxConsecutiveDays: v.maxConsecutiveDays ?? null,
        maxShiftsOfTypePerWeek: v.maxShiftsOfTypePerWeek ?? null,
        shiftTypeId: v.shiftTypeId || null,
        maxConsecutiveShiftsOfType: v.maxConsecutiveShiftsOfType ?? null,
        categoryId: v.categoryId || null,
        maxCategorySlotsPerWeek: v.maxCategorySlotsPerWeek ?? null,
      };
      if (editing) {
        await updateRule({ variables: { id: editing.id, input: payload } });
        message.success('החוק עודכן');
      } else {
        await createRule({
          variables: { input: { departmentId: activeDeptId, ...payload } },
        });
        message.success('החוק נוצר');
      }
      setModalOpen(false);
      refetch();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || 'שגיאה');
    }
  }

  const columns = [
    { title: 'שם', dataIndex: 'name', key: 'name' },
    {
      title: 'מקס׳ ימים בשבוע',
      dataIndex: 'maxDaysPerWeek',
      key: 'maxDays',
      render: (v: any) => v ?? '—',
    },
    {
      title: 'מקס׳ ימים רצופים',
      dataIndex: 'maxConsecutiveDays',
      key: 'maxConsec',
      render: (v: any) => v ?? '—',
    },
    {
      title: 'מקס׳ סוג בשבוע',
      key: 'maxType',
      render: (r: any) => {
        if (r.maxShiftsOfTypePerWeek == null) return '—';
        const st = shiftTypes.find((t: any) => t.id === r.shiftTypeId);
        return `${r.maxShiftsOfTypePerWeek} • ${st?.name || ''}`;
      },
    },
    {
      title: 'סטטוס',
      key: 'active',
      render: (r: any) => <Tag color={r.active ? 'green' : 'default'}>{r.active ? 'פעיל' : 'לא פעיל'}</Tag>,
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (r: any) => (
        <div className="flex gap-1">
          <Button
            size="small"
            type="text"
            icon={<PencilSquareIcon className="h-4 w-4" />}
            onClick={() => openEdit(r)}
          />
          <Popconfirm
            title="למחוק חוק?"
            onConfirm={async () => {
              await deleteRule({ variables: { id: r.id } });
              refetch();
            }}
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
    <ProtectedRoute requires={Permission.SHIFTS_MANAGE} departmentId={activeDeptId || undefined}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <Cog6ToothIcon className="h-5 w-5 text-gray-500" />
            {LABELS.SCHEDULING_RULES}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <DepartmentPicker value={activeDeptId} onChange={setActiveDeptId} scope="manageable" />
            <Button
              type="primary"
              icon={<PlusIcon className="h-4 w-4" />}
              onClick={openCreate}
              disabled={!activeDeptId}
            >
              חוק חדש
            </Button>
          </div>
        </div>

        <Card>
          {!activeDeptId ? (
            <Empty description="אנא בחר מחלקה" />
          ) : loading && rules.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spin />
            </div>
          ) : rules.length === 0 ? (
            <Empty description="לא הוגדרו חוקי שיבוץ" />
          ) : (
            <Table dataSource={rules} columns={columns} rowKey="id" pagination={false} />
          )}
        </Card>

        <Modal
          title={editing ? 'עריכת חוק' : 'חוק חדש'}
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          onOk={handleSave}
          okText={LABELS.SAVE}
          cancelText={LABELS.CANCEL}
          destroyOnClose
          width={640}
        >
          <Form form={form} layout="vertical">
            <Form.Item label="שם" name="name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item label="פעיל" name="active" valuePropName="checked">
              <Switch />
            </Form.Item>
            <div className="grid grid-cols-2 gap-3">
              <Form.Item label="מקס׳ ימי עבודה בשבוע" name="maxDaysPerWeek">
                <InputNumber min={0} max={7} className="w-full" />
              </Form.Item>
              <Form.Item label="מקס׳ ימים רצופים" name="maxConsecutiveDays">
                <InputNumber min={0} max={7} className="w-full" />
              </Form.Item>
              <Form.Item label="סוג משמרת" name="shiftTypeId">
                <Select
                  allowClear
                  options={shiftTypes.map((t: any) => ({ value: t.id, label: t.name }))}
                />
              </Form.Item>
              <Form.Item label="מקס׳ מהסוג בשבוע" name="maxShiftsOfTypePerWeek">
                <InputNumber min={0} max={20} className="w-full" />
              </Form.Item>
              <Form.Item label="מקס׳ רצופים מהסוג" name="maxConsecutiveShiftsOfType">
                <InputNumber min={0} max={10} className="w-full" />
              </Form.Item>
              <Form.Item label="קטגוריה" name="categoryId">
                <Select
                  allowClear
                  options={categories.map((c: any) => ({ value: c.id, label: c.name }))}
                />
              </Form.Item>
              <Form.Item label="מקס׳ משבצות מהקטגוריה בשבוע" name="maxCategorySlotsPerWeek">
                <InputNumber min={0} max={20} className="w-full" />
              </Form.Item>
            </div>
          </Form>
        </Modal>
      </div>
    </ProtectedRoute>
  );
}
