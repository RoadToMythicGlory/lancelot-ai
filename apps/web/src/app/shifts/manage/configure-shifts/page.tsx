'use client';

import React, { useEffect, useState } from 'react';
import { gql, useMutation, useQuery } from '@apollo/client';
import {
  Card,
  Button,
  Spin,
  Empty,
  Modal,
  Form,
  Input,
  TimePicker,
  ColorPicker,
  message,
  Popconfirm,
  Tag,
} from 'antd';
import dayjs from 'dayjs';
import {
  WrenchScrewdriverIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS } from '@/components/shifts/i18n';
import DepartmentPicker from '@/components/shifts/DepartmentPicker';

const SHIFT_TYPE_DEFS = gql`
  query ShiftTypeDefs($departmentId: String!) {
    shiftTypeDefs(departmentId: $departmentId) {
      id
      name
      startTime
      endTime
      color
      role
      order
      active
    }
  }
`;

const CREATE_SHIFT_TYPE = gql`
  mutation CreateShiftTypeDef($input: ShiftTypeDefInput!) {
    createShiftTypeDef(input: $input) {
      id
      name
    }
  }
`;

const UPDATE_SHIFT_TYPE = gql`
  mutation UpdateShiftTypeDef($id: ID!, $input: ShiftTypeDefUpdateInput!) {
    updateShiftTypeDef(id: $id, input: $input) {
      id
      name
    }
  }
`;

const DELETE_SHIFT_TYPE = gql`
  mutation DeleteShiftTypeDef($id: ID!) {
    deleteShiftTypeDef(id: $id)
  }
`;

const REORDER_SHIFT_TYPES = gql`
  mutation ReorderShiftTypeDefs($departmentId: String!, $orderedIds: [String!]!) {
    reorderShiftTypeDefs(departmentId: $departmentId, orderedIds: $orderedIds) {
      id
      order
    }
  }
`;

interface ShiftTypeDef {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color?: string | null;
  role?: string | null;
  order: number;
  active: boolean;
}

function colorToHex(c: any): string {
  if (!c) return '#1890ff';
  if (typeof c === 'string') return c;
  if (typeof c.toHexString === 'function') return c.toHexString();
  return '#1890ff';
}

function SortableRow({
  type,
  onEdit,
  onDelete,
}: {
  type: ShiftTypeDef;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: type.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-3 border border-gray-200 rounded-md bg-white"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-400 hover:text-gray-700"
        aria-label="drag handle"
      >
        <Bars3Icon className="h-5 w-5" />
      </button>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Tag color={type.color || 'default'}>{type.name}</Tag>
          <span className="text-sm text-gray-600">
            {type.startTime} – {type.endTime}
          </span>
          {!type.active && <Tag color="default">לא פעיל</Tag>}
        </div>
        {type.role && <div className="text-xs text-gray-400 mt-0.5">תפקיד: {type.role}</div>}
      </div>
      <Button
        size="small"
        type="text"
        icon={<PencilSquareIcon className="h-4 w-4" />}
        onClick={onEdit}
      />
      <Popconfirm
        title="למחוק סוג משמרת?"
        onConfirm={onDelete}
        okText={LABELS.DELETE}
        cancelText={LABELS.CANCEL}
      >
        <Button size="small" type="text" danger icon={<TrashIcon className="h-4 w-4" />} />
      </Popconfirm>
    </div>
  );
}

export default function ConfigureShiftsPage() {
  const [activeDeptId, setActiveDeptId] = useState<string>('');
  const [items, setItems] = useState<ShiftTypeDef[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftTypeDef | null>(null);
  const [form] = Form.useForm();

  const { data, loading, refetch } = useQuery(SHIFT_TYPE_DEFS, {
    variables: { departmentId: activeDeptId },
    skip: !activeDeptId,
    fetchPolicy: 'cache-and-network',
  });
  const [createShiftType] = useMutation(CREATE_SHIFT_TYPE);
  const [updateShiftType] = useMutation(UPDATE_SHIFT_TYPE);
  const [deleteShiftType] = useMutation(DELETE_SHIFT_TYPE);
  const [reorderShiftTypes] = useMutation(REORDER_SHIFT_TYPES);

  useEffect(() => {
    if (data?.shiftTypeDefs) {
      setItems([...data.shiftTypeDefs].sort((a, b) => a.order - b.order));
    }
  }, [data]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const newItems = arrayMove(items, oldIndex, newIndex);
    setItems(newItems);
    try {
      await reorderShiftTypes({
        variables: {
          departmentId: activeDeptId,
          orderedIds: newItems.map((i) => i.id),
        },
      });
    } catch (err: any) {
      message.error(err?.message || 'שגיאה בשמירת הסדר');
      refetch();
    }
  }

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      startTime: dayjs('07:00', 'HH:mm'),
      endTime: dayjs('15:00', 'HH:mm'),
      color: '#1890ff',
    });
    setModalOpen(true);
  }

  function openEdit(t: ShiftTypeDef) {
    setEditing(t);
    form.setFieldsValue({
      name: t.name,
      startTime: dayjs(t.startTime, 'HH:mm'),
      endTime: dayjs(t.endTime, 'HH:mm'),
      role: t.role || '',
      color: t.color || '#1890ff',
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      const color = colorToHex(values.color);
      const payload = {
        name: values.name,
        startTime: dayjs(values.startTime).format('HH:mm'),
        endTime: dayjs(values.endTime).format('HH:mm'),
        role: values.role || null,
        color,
      };
      if (editing) {
        await updateShiftType({ variables: { id: editing.id, input: payload } });
        message.success('סוג המשמרת עודכן');
      } else {
        await createShiftType({
          variables: {
            input: {
              departmentId: activeDeptId,
              ...payload,
              order: items.length,
              active: true,
            },
          },
        });
        message.success('סוג משמרת נוצר');
      }
      setModalOpen(false);
      refetch();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || 'שגיאה');
    }
  }

  async function handleDelete(t: ShiftTypeDef) {
    try {
      await deleteShiftType({ variables: { id: t.id } });
      message.success('סוג המשמרת נמחק');
      refetch();
    } catch (err: any) {
      message.error(err?.message || 'שגיאה');
    }
  }

  return (
    <ProtectedRoute requires={Permission.SHIFTS_MANAGE} departmentId={activeDeptId || undefined}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <WrenchScrewdriverIcon className="h-5 w-5 text-gray-500" />
            {LABELS.CONFIGURE_SHIFTS}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <DepartmentPicker value={activeDeptId} onChange={setActiveDeptId} scope="manageable" />
            <Button
              type="primary"
              icon={<PlusIcon className="h-4 w-4" />}
              onClick={openCreate}
              disabled={!activeDeptId}
            >
              סוג משמרת חדש
            </Button>
          </div>
        </div>

        <Card>
          {!activeDeptId ? (
            <Empty description="אנא בחר מחלקה" />
          ) : loading && items.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spin />
            </div>
          ) : items.length === 0 ? (
            <Empty description="לא הוגדרו סוגי משמרות" />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {items.map((t) => (
                    <SortableRow
                      key={t.id}
                      type={t}
                      onEdit={() => openEdit(t)}
                      onDelete={() => handleDelete(t)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </Card>

        <Modal
          title={editing ? 'עריכת סוג משמרת' : 'סוג משמרת חדש'}
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          onOk={handleSave}
          okText={LABELS.SAVE}
          cancelText={LABELS.CANCEL}
          destroyOnHidden
        >
          <Form form={form} layout="vertical">
            <Form.Item
              label="שם"
              name="name"
              rules={[{ required: true, message: 'אנא הזן שם' }]}
            >
              <Input placeholder="לדוגמה: בוקר, צהריים, לילה" />
            </Form.Item>
            <Form.Item
              label="שעת התחלה"
              name="startTime"
              rules={[{ required: true, message: 'אנא בחר שעה' }]}
            >
              <TimePicker format="HH:mm" minuteStep={15} className="w-full" />
            </Form.Item>
            <Form.Item
              label="שעת סיום"
              name="endTime"
              rules={[{ required: true, message: 'אנא בחר שעה' }]}
            >
              <TimePicker format="HH:mm" minuteStep={15} className="w-full" />
            </Form.Item>
            <Form.Item label="תפקיד (אופציונלי)" name="role">
              <Input placeholder="ברירת מחדל לתפקיד" />
            </Form.Item>
            <Form.Item label="צבע" name="color">
              <ColorPicker showText />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </ProtectedRoute>
  );
}
