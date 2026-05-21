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
  message,
  Popconfirm,
  Table,
  Tabs,
  Tag,
} from 'antd';
import {
  AdjustmentsHorizontalIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS, HEBREW_WEEKDAYS_SHORT } from '@/components/shifts/i18n';
import DepartmentPicker from '@/components/shifts/DepartmentPicker';

const CATEGORIES = gql`
  query ShiftCategories($departmentId: String!) {
    shiftCategories(departmentId: $departmentId) {
      id
      name
      color
      maxPerWeek
      slots {
        dayOfWeek
        shiftTypeId
      }
      active
    }
  }
`;

const CONSTRAINT_RULES = gql`
  query ConstraintRules($departmentId: String!) {
    constraintRules(departmentId: $departmentId) {
      id
      name
      type
      value
      active
    }
  }
`;

const SHIFT_TYPE_DEFS = gql`
  query ShiftTypeDefsForCategory($departmentId: String!) {
    shiftTypeDefs(departmentId: $departmentId) {
      id
      name
    }
  }
`;

const CREATE_CATEGORY = gql`
  mutation CreateShiftCategory($input: ShiftCategoryInput!) {
    createShiftCategory(input: $input) {
      id
    }
  }
`;
const UPDATE_CATEGORY = gql`
  mutation UpdateShiftCategory($id: ID!, $input: ShiftCategoryUpdateInput!) {
    updateShiftCategory(id: $id, input: $input) {
      id
    }
  }
`;
const DELETE_CATEGORY = gql`
  mutation DeleteShiftCategory($id: ID!) {
    deleteShiftCategory(id: $id)
  }
`;

const CREATE_RULE = gql`
  mutation CreateConstraintRule($input: ConstraintRuleInput!) {
    createConstraintRule(input: $input) {
      id
    }
  }
`;
const UPDATE_RULE = gql`
  mutation UpdateConstraintRule($id: ID!, $input: ConstraintRuleUpdateInput!) {
    updateConstraintRule(id: $id, input: $input) {
      id
    }
  }
`;
const DELETE_RULE = gql`
  mutation DeleteConstraintRule($id: ID!) {
    deleteConstraintRule(id: $id)
  }
`;

const CONSTRAINT_TYPES = [
  { value: 'max_prefer_not_per_week', label: 'מקסימום "לא מעדיף" בשבוע' },
  { value: 'min_available_per_week', label: 'מינימום "זמין" בשבוע' },
  { value: 'max_unavailable_per_week', label: 'מקסימום "לא זמין" בשבוע' },
];

export default function ConfigureConstraintsPage() {
  const [activeDeptId, setActiveDeptId] = useState<string>('');
  const [tab, setTab] = useState<'categories' | 'rules'>('categories');
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any | null>(null);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [catForm] = Form.useForm();
  const [ruleForm] = Form.useForm();

  const { data: catsData, refetch: refetchCats, loading: catsLoading } = useQuery(CATEGORIES, {
    variables: { departmentId: activeDeptId },
    skip: !activeDeptId,
    fetchPolicy: 'cache-and-network',
  });
  const { data: rulesData, refetch: refetchRules, loading: rulesLoading } = useQuery(
    CONSTRAINT_RULES,
    {
      variables: { departmentId: activeDeptId },
      skip: !activeDeptId,
      fetchPolicy: 'cache-and-network',
    },
  );
  const { data: typesData } = useQuery(SHIFT_TYPE_DEFS, {
    variables: { departmentId: activeDeptId },
    skip: !activeDeptId,
  });

  const [createCategory] = useMutation(CREATE_CATEGORY);
  const [updateCategory] = useMutation(UPDATE_CATEGORY);
  const [deleteCategory] = useMutation(DELETE_CATEGORY);
  const [createRule] = useMutation(CREATE_RULE);
  const [updateRule] = useMutation(UPDATE_RULE);
  const [deleteRule] = useMutation(DELETE_RULE);

  const categories = catsData?.shiftCategories || [];
  const rules = rulesData?.constraintRules || [];
  const shiftTypes = typesData?.shiftTypeDefs || [];

  function openCatCreate() {
    setEditingCat(null);
    catForm.resetFields();
    catForm.setFieldsValue({ slots: [] });
    setCatModalOpen(true);
  }
  function openCatEdit(c: any) {
    setEditingCat(c);
    catForm.setFieldsValue({
      name: c.name,
      maxPerWeek: c.maxPerWeek,
      slots: c.slots || [],
    });
    setCatModalOpen(true);
  }
  async function handleSaveCategory() {
    try {
      const v = await catForm.validateFields();
      const payload = {
        name: v.name,
        maxPerWeek: v.maxPerWeek ?? null,
        slots: (v.slots || []).map((s: any) => ({
          dayOfWeek: Number(s.dayOfWeek),
          shiftTypeId: String(s.shiftTypeId),
        })),
        active: true,
      };
      if (editingCat) {
        await updateCategory({ variables: { id: editingCat.id, input: payload } });
        message.success('הקטגוריה עודכנה');
      } else {
        await createCategory({
          variables: { input: { departmentId: activeDeptId, ...payload } },
        });
        message.success('הקטגוריה נוצרה');
      }
      setCatModalOpen(false);
      refetchCats();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || 'שגיאה');
    }
  }

  function openRuleCreate() {
    setEditingRule(null);
    ruleForm.resetFields();
    setRuleModalOpen(true);
  }
  function openRuleEdit(r: any) {
    setEditingRule(r);
    ruleForm.setFieldsValue({ name: r.name, type: r.type, value: r.value });
    setRuleModalOpen(true);
  }
  async function handleSaveRule() {
    try {
      const v = await ruleForm.validateFields();
      const payload = { name: v.name, type: v.type, value: v.value, active: true };
      if (editingRule) {
        await updateRule({ variables: { id: editingRule.id, input: payload } });
        message.success('החוק עודכן');
      } else {
        await createRule({
          variables: { input: { departmentId: activeDeptId, ...payload } },
        });
        message.success('החוק נוצר');
      }
      setRuleModalOpen(false);
      refetchRules();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || 'שגיאה');
    }
  }

  const catColumns = [
    { title: 'שם', dataIndex: 'name', key: 'name' },
    {
      title: 'מקסימום בשבוע',
      dataIndex: 'maxPerWeek',
      key: 'maxPerWeek',
      render: (v: number | null) => v ?? '—',
    },
    {
      title: 'משבצות (יום • סוג משמרת)',
      key: 'slots',
      render: (c: any) => {
        const slots = c.slots || [];
        if (slots.length === 0) return <span className="text-gray-400 text-xs">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {slots.map((s: any, idx: number) => {
              const st = shiftTypes.find((t: any) => t.id === s.shiftTypeId);
              return (
                <Tag key={idx} color="purple">
                  {HEBREW_WEEKDAYS_SHORT[s.dayOfWeek]} • {st?.name || s.shiftTypeId}
                </Tag>
              );
            })}
          </div>
        );
      },
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (c: any) => (
        <div className="flex gap-1">
          <Button
            size="small"
            type="text"
            icon={<PencilSquareIcon className="h-4 w-4" />}
            onClick={() => openCatEdit(c)}
          />
          <Popconfirm
            title="למחוק קטגוריה?"
            onConfirm={async () => {
              await deleteCategory({ variables: { id: c.id } });
              refetchCats();
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

  const ruleColumns = [
    { title: 'שם', dataIndex: 'name', key: 'name' },
    {
      title: 'סוג',
      dataIndex: 'type',
      key: 'type',
      render: (t: string) =>
        CONSTRAINT_TYPES.find((c) => c.value === t)?.label || t,
    },
    { title: 'ערך', dataIndex: 'value', key: 'value', render: (v: number) => v ?? '—' },
    {
      title: 'פעולות',
      key: 'actions',
      render: (r: any) => (
        <div className="flex gap-1">
          <Button
            size="small"
            type="text"
            icon={<PencilSquareIcon className="h-4 w-4" />}
            onClick={() => openRuleEdit(r)}
          />
          <Popconfirm
            title="למחוק חוק?"
            onConfirm={async () => {
              await deleteRule({ variables: { id: r.id } });
              refetchRules();
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
            <AdjustmentsHorizontalIcon className="h-5 w-5 text-gray-500" />
            {LABELS.CONFIGURE_CONSTRAINTS}
          </h1>
          <DepartmentPicker value={activeDeptId} onChange={setActiveDeptId} scope="manageable" />
        </div>

        <Card>
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as any)}
            items={[
              { key: 'categories', label: 'קטגוריות' },
              { key: 'rules', label: 'חוקי העדפה' },
            ]}
          />

          {!activeDeptId ? (
            <Empty description="אנא בחר מחלקה" />
          ) : tab === 'categories' ? (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button
                  type="primary"
                  icon={<PlusIcon className="h-4 w-4" />}
                  onClick={openCatCreate}
                >
                  קטגוריה חדשה
                </Button>
              </div>
              {catsLoading && categories.length === 0 ? (
                <div className="flex justify-center py-6">
                  <Spin />
                </div>
              ) : categories.length === 0 ? (
                <Empty description="אין קטגוריות" />
              ) : (
                <Table
                  dataSource={categories}
                  columns={catColumns}
                  rowKey="id"
                  pagination={false}
                />
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button
                  type="primary"
                  icon={<PlusIcon className="h-4 w-4" />}
                  onClick={openRuleCreate}
                >
                  חוק חדש
                </Button>
              </div>
              {rulesLoading && rules.length === 0 ? (
                <div className="flex justify-center py-6">
                  <Spin />
                </div>
              ) : rules.length === 0 ? (
                <Empty description="אין חוקים" />
              ) : (
                <Table dataSource={rules} columns={ruleColumns} rowKey="id" pagination={false} />
              )}
            </div>
          )}
        </Card>

        {/* Category modal */}
        <Modal
          title={editingCat ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}
          open={catModalOpen}
          onCancel={() => setCatModalOpen(false)}
          onOk={handleSaveCategory}
          okText={LABELS.SAVE}
          cancelText={LABELS.CANCEL}
          destroyOnHidden
          width={640}
        >
          <Form form={catForm} layout="vertical">
            <Form.Item label="שם" name="name" rules={[{ required: true, message: 'אנא הזן שם' }]}>
              <Input />
            </Form.Item>
            <Form.Item label="מקסימום מופעים בשבוע" name="maxPerWeek">
              <InputNumber min={0} max={20} className="w-full" />
            </Form.Item>
            <Form.List name="slots">
              {(fields, { add, remove }) => (
                <>
                  <div className="text-sm text-gray-600 mb-2">משבצות (יום • סוג משמרת):</div>
                  {fields.map(({ key, name, ...rest }) => (
                    <div key={key} className="flex gap-2 mb-2">
                      <Form.Item
                        {...rest}
                        name={[name, 'dayOfWeek']}
                        rules={[{ required: true, message: 'יום' }]}
                        className="mb-0 flex-1"
                      >
                        <Select
                          placeholder="יום"
                          options={HEBREW_WEEKDAYS_SHORT.map((l, i) => ({ value: i, label: l }))}
                        />
                      </Form.Item>
                      <Form.Item
                        {...rest}
                        name={[name, 'shiftTypeId']}
                        rules={[{ required: true, message: 'סוג' }]}
                        className="mb-0 flex-[2]"
                      >
                        <Select
                          placeholder="סוג משמרת"
                          options={shiftTypes.map((t: any) => ({ value: t.id, label: t.name }))}
                        />
                      </Form.Item>
                      <Button danger onClick={() => remove(name)}>
                        הסר
                      </Button>
                    </div>
                  ))}
                  <Button onClick={() => add()} icon={<PlusIcon className="h-4 w-4" />}>
                    הוסף משבצת
                  </Button>
                </>
              )}
            </Form.List>
          </Form>
        </Modal>

        {/* Rule modal */}
        <Modal
          title={editingRule ? 'עריכת חוק' : 'חוק חדש'}
          open={ruleModalOpen}
          onCancel={() => setRuleModalOpen(false)}
          onOk={handleSaveRule}
          okText={LABELS.SAVE}
          cancelText={LABELS.CANCEL}
          destroyOnHidden
        >
          <Form form={ruleForm} layout="vertical">
            <Form.Item label="שם" name="name" rules={[{ required: true, message: 'אנא הזן שם' }]}>
              <Input />
            </Form.Item>
            <Form.Item
              label="סוג"
              name="type"
              rules={[{ required: true, message: 'אנא בחר סוג' }]}
            >
              <Select options={CONSTRAINT_TYPES} />
            </Form.Item>
            <Form.Item label="ערך" name="value">
              <InputNumber min={0} max={20} className="w-full" />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </ProtectedRoute>
  );
}
