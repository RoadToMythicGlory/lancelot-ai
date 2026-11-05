'use client';

import React, { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client';
import { GET_EQUIPMENT_CATEGORIES_CATALOG } from '../../graphql/queries';
import {
  CREATE_EQUIPMENT_CATEGORY,
  DELETE_EQUIPMENT_CATEGORY,
  UPDATE_EQUIPMENT_CATEGORY,
} from '../../graphql/mutations';

interface EquipmentCategoryRow {
  id: string;
  slug: string;
  labelHe: string;
  sortOrder: number;
  isActive: boolean;
}

interface EquipmentCategoriesManagementProps {
  canManage?: boolean;
}

interface FormValues {
  slug: string;
  labelHe: string;
  sortOrder: number;
  isActive: boolean;
}

// Loose check that mirrors the backend slug regex so we surface the issue
// before the network round-trip.
const SLUG_PATTERN = /^[a-z][a-z0-9_]*$/;

const EquipmentCategoriesManagement: React.FC<EquipmentCategoriesManagementProps> = ({
  canManage = false,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentCategoryRow | null>(null);

  // Always include inactive rows in the admin view — soft-disabled categories
  // still need to be visible here so admins can re-enable or rename them.
  const { data, loading, refetch } = useQuery(GET_EQUIPMENT_CATEGORIES_CATALOG, {
    variables: { includeInactive: true },
    fetchPolicy: 'cache-and-network',
  });
  const categories: EquipmentCategoryRow[] = data?.equipmentCategories ?? [];

  // Refetch every shared cache that the picker hook also subscribes to. Using
  // refetchQueries on the active query name makes both the management table
  // and every page-level dropdown re-render with the latest catalog in one go.
  const refetchActiveCatalog = {
    refetchQueries: ['GetEquipmentCategoriesCatalog'] as string[],
    awaitRefetchQueries: true,
  } as const;

  const [createCategory, { loading: creating }] = useMutation(
    CREATE_EQUIPMENT_CATEGORY,
    {
      ...refetchActiveCatalog,
      onCompleted: () => {
        message.success('הקטגוריה נוצרה בהצלחה');
        closeModal();
        refetch();
      },
      onError: (err) => message.error(`שגיאה ביצירת קטגוריה: ${err.message}`),
    },
  );

  const [updateCategory, { loading: updating }] = useMutation(
    UPDATE_EQUIPMENT_CATEGORY,
    {
      ...refetchActiveCatalog,
      onCompleted: () => {
        message.success('הקטגוריה עודכנה');
        closeModal();
        refetch();
      },
      onError: (err) => message.error(`שגיאה בעדכון קטגוריה: ${err.message}`),
    },
  );

  const [deleteCategory] = useMutation(DELETE_EQUIPMENT_CATEGORY, {
    ...refetchActiveCatalog,
    onCompleted: () => {
      message.success('הקטגוריה נמחקה');
      refetch();
    },
    onError: (err) => message.error(`שגיאה במחיקה: ${err.message}`),
  });

  const openCreate = () => {
    setEditing(null);
    setIsModalOpen(true);
  };

  const openEdit = (row: EquipmentCategoryRow) => {
    setEditing(row);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
  };

  // Populate the form whenever the modal mounts. Because we use
  // `destroyOnHidden`, the form instance is fresh each time the modal opens.
  React.useEffect(() => {
    if (!isModalOpen) return;
    if (editing) {
      form.setFieldsValue({
        slug: editing.slug,
        labelHe: editing.labelHe,
        sortOrder: editing.sortOrder,
        isActive: editing.isActive,
      });
    } else {
      form.setFieldsValue({
        slug: '',
        labelHe: '',
        // Default new categories to the end of the list so admin-curated
        // ordering of existing categories isn't disturbed.
        sortOrder: nextSortOrder(categories),
        isActive: true,
      });
    }
  }, [isModalOpen, editing, form, categories]);

  const submit = async () => {
    try {
      const values = await form.validateFields();
      const input = {
        slug: values.slug.trim(),
        labelHe: values.labelHe.trim(),
        sortOrder: values.sortOrder ?? 1000,
        isActive: values.isActive ?? true,
      };
      if (editing) {
        await updateCategory({ variables: { id: editing.id, input } });
      } else {
        await createCategory({ variables: { input } });
      }
    } catch {
      // antd surfaces validation inline
    }
  };

  const sorted = useMemo(
    () =>
      [...categories].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.labelHe.localeCompare(b.labelHe, 'he');
      }),
    [categories],
  );

  return (
    <div>
      <Alert
        message="ניהול קטגוריות ציוד"
        description="הקטגוריות שמוגדרות כאן הן מקור האמת היחיד עבור כל בחירת קטגוריה במערכת – ברישום ציוד, סינון מחסן, סטים ושידורי חוץ. ניתן להוסיף, לשנות שם או להשבית קטגוריות. קטגוריה שבשימוש על ידי ציוד קיים לא ניתנת למחיקה — יש להשבית אותה במקום זאת."
        type="info"
        showIcon
        className="mb-4"
      />

      <Card
        title={
          <span>
            <TagsOutlined className="ml-2" /> קטגוריות ציוד ({sorted.length})
          </span>
        }
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              קטגוריה חדשה
            </Button>
          ) : null
        }
      >
        {loading && sorted.length === 0 ? (
          <div className="text-center py-6">
            <Spin />
          </div>
        ) : sorted.length === 0 ? (
          <Empty description="לא הוגדרו קטגוריות" />
        ) : (
          <Table<EquipmentCategoryRow>
            dataSource={sorted}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              {
                title: 'סדר',
                dataIndex: 'sortOrder',
                key: 'sortOrder',
                width: 80,
              },
              {
                title: 'שם בעברית',
                dataIndex: 'labelHe',
                key: 'labelHe',
                render: (value: string, record) => (
                  <Space>
                    <strong>{value}</strong>
                    {!record.isActive && <Tag color="default">לא פעיל</Tag>}
                  </Space>
                ),
              },
              {
                title: 'מזהה (slug)',
                dataIndex: 'slug',
                key: 'slug',
                render: (slug: string) => <code>{slug}</code>,
              },
              {
                title: 'סטטוס',
                dataIndex: 'isActive',
                key: 'isActive',
                width: 100,
                render: (isActive: boolean) =>
                  isActive ? (
                    <Tag color="green">פעיל</Tag>
                  ) : (
                    <Tag color="default">לא פעיל</Tag>
                  ),
              },
              ...(canManage
                ? [
                    {
                      title: 'פעולות',
                      key: 'actions',
                      width: 140,
                      render: (_: unknown, record: EquipmentCategoryRow) => (
                        <Space size="small">
                          <Tooltip title="עריכה">
                            <Button
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => openEdit(record)}
                            />
                          </Tooltip>
                          <Popconfirm
                            title="מחיקת קטגוריה"
                            description="קטגוריה שבשימוש על ידי ציוד לא ניתנת למחיקה. אם פעולת המחיקה תיכשל, ניתן להשבית את הקטגוריה במקום זאת."
                            onConfirm={() =>
                              deleteCategory({ variables: { id: record.id } })
                            }
                            okText="מחיקה"
                            cancelText="ביטול"
                          >
                            <Tooltip title="מחיקה">
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Tooltip>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Card>

      <Modal
        title={editing ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={submit}
        okText={editing ? 'שמירה' : 'יצירה'}
        cancelText="ביטול"
        confirmLoading={creating || updating}
        destroyOnHidden
      >
        <Form<FormValues> form={form} layout="vertical">
          <Form.Item
            name="labelHe"
            label="שם בעברית"
            rules={[{ required: true, message: 'נא להזין שם' }]}
          >
            <Input placeholder="לדוגמה: מצלמות" />
          </Form.Item>

          <Form.Item
            name="slug"
            label="מזהה (slug)"
            tooltip="מזהה אנגלי קצר, אותיות קטנות + קווים תחתונים. לא ניתן לשנות לאחר שיש ציוד שמשתמש בקטגוריה."
            rules={[
              { required: true, message: 'נא להזין מזהה' },
              {
                pattern: SLUG_PATTERN,
                message: 'מזהה חייב להתחיל באות לועזית קטנה ולכלול רק a-z, 0-9 ו-_',
              },
            ]}
          >
            <Input
              placeholder="cameras"
              autoComplete="off"
              disabled={!!editing && editing.isActive /* slug is editable when nothing uses it; backend still enforces */}
            />
          </Form.Item>

          <Form.Item
            name="sortOrder"
            label="סדר הצגה"
            tooltip="מספרים נמוכים מופיעים ראשונים בכל בחירת קטגוריה"
          >
            <InputNumber min={0} step={10} style={{ width: '100%' }} placeholder="100" />
          </Form.Item>

          <Form.Item
            name="isActive"
            label="פעיל"
            valuePropName="checked"
            tooltip="קטגוריה לא פעילה לא מופיעה ברישום ציוד חדש, אבל נשארת קריאה לציוד קיים שמשתמש בה."
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

// Pick a sortOrder that lands the new row after every existing one (rounded
// up to the nearest 10). Keeps admin-curated ordering stable.
function nextSortOrder(rows: EquipmentCategoryRow[]): number {
  if (rows.length === 0) return 100;
  const maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  return Math.ceil((maxOrder + 10) / 10) * 10;
}

export default EquipmentCategoriesManagement;
