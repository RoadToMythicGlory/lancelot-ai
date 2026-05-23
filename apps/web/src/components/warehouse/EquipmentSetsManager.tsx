'use client';

import React, { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Space, Tag,
  Empty, App, Switch, Popconfirm
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BarcodeOutlined } from '@ant-design/icons';
import { useQuery, useMutation } from '@apollo/client';
import { GET_EQUIPMENT_SETS, GET_WAREHOUSE_EQUIPMENT_FOR_PICKER } from '../../graphql/queries';
import { CREATE_EQUIPMENT_SET, UPDATE_EQUIPMENT_SET, DELETE_EQUIPMENT_SET } from '../../graphql/mutations';
import WarehouseExportButtons from './WarehouseExportButtons';
import type { ExportColumn, ExportReport } from '@/utils/warehouseReportExport';
import { useEquipmentCategories } from '../../hooks/useEquipmentCategories';

interface SetItem {
  equipmentId: string;
  quantity: number;
  required: boolean;
}

interface EquipmentSetsManagerProps {
  canManage?: boolean;
}

const EquipmentSetsManager: React.FC<EquipmentSetsManagerProps> = ({ canManage = false }) => {
  const { message } = App.useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<any | null>(null);
  const [form] = Form.useForm();
  const [setItems, setSetItems] = useState<SetItem[]>([]);
  const [searchText, setSearchText] = useState('');

  // Canonical category catalog — used to turn the raw `category` slug on
  // each equipment item into its Hebrew label for picker options + exports.
  // Inactive categories are included so historically-tagged items still
  // display correctly inside saved sets.
  const { labelOf: categoryLabelOf } = useEquipmentCategories({ includeInactive: true });

  const { data: setsData, loading: setsLoading, refetch } = useQuery(GET_EQUIPMENT_SETS);
  // Use the dedicated picker query (up to 5000 rows). The default
  // GET_WAREHOUSE_EQUIPMENT caps at 500 and was silently truncating this
  // list so most of the catalog was unreachable when building a preset.
  const { data: equipmentData } = useQuery(GET_WAREHOUSE_EQUIPMENT_FOR_PICKER);

  const sets = setsData?.equipmentSets || [];
  const allEquipment = equipmentData?.warehouseEquipmentForPicker || [];

  const [createSet, { loading: creating }] = useMutation(CREATE_EQUIPMENT_SET, {
    onCompleted: () => {
      message.success('הסט נוצר בהצלחה');
      handleCloseModal();
      refetch();
    },
    onError: (error) => message.error(error.message),
  });

  const [updateSet, { loading: updating }] = useMutation(UPDATE_EQUIPMENT_SET, {
    onCompleted: () => {
      message.success('הסט עודכן בהצלחה');
      handleCloseModal();
      refetch();
    },
    onError: (error) => message.error(error.message),
  });

  const [deleteSet] = useMutation(DELETE_EQUIPMENT_SET, {
    onCompleted: () => {
      message.success('הסט נמחק בהצלחה');
      refetch();
    },
    onError: (error) => message.error(error.message),
  });

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSet(null);
    setSetItems([]);
    form.resetFields();
  };

  const handleOpenCreate = () => {
    setEditingSet(null);
    setSetItems([]);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (record: any) => {
    setEditingSet(record);
    setSetItems(
      (record.items || []).map((i: any) => ({
        equipmentId: i.equipmentId,
        quantity: i.quantity,
        required: i.required,
      })),
    );
    form.setFieldsValue({
      name: record.name,
      barcode: record.barcode,
      description: record.description,
      notes: record.notes,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (setItems.length === 0) {
      message.warning('יש להוסיף לפחות פריט אחד לסט');
      return;
    }

    // The dropdown defaults each new row to equipmentId='' until the user
    // picks something. Submitting an unselected row would crash the resolver
    // with a cryptic BSON error ("input must be a 24 character hex string"),
    // so block it here with a clear message instead.
    const missingIdx = setItems.findIndex(
      (i) => !i.equipmentId || typeof i.equipmentId !== 'string',
    );
    if (missingIdx !== -1) {
      message.warning(`יש לבחור ציוד בפריט מספר ${missingIdx + 1}`);
      return;
    }
    const badQtyIdx = setItems.findIndex(
      (i) => !Number.isFinite(i.quantity) || i.quantity < 1,
    );
    if (badQtyIdx !== -1) {
      message.warning(`כמות לא תקינה בפריט מספר ${badQtyIdx + 1}`);
      return;
    }

    const input = {
      name: values.name,
      barcode: values.barcode,
      description: values.description || null,
      notes: values.notes || null,
      items: setItems.map((i) => ({
        equipmentId: i.equipmentId,
        quantity: i.quantity,
        required: i.required,
      })),
    };

    if (editingSet) {
      await updateSet({ variables: { id: editingSet.id, input } });
    } else {
      await createSet({ variables: { input } });
    }
  };

  const handleAddItem = () => {
    setSetItems((prev) => [...prev, { equipmentId: '', quantity: 1, required: true }]);
  };

  const handleRemoveItem = (index: number) => {
    setSetItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof SetItem, value: any) => {
    setSetItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const filteredSets = sets.filter((s: any) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.barcode.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
    );
  });

  const columns = [
    {
      title: 'שם הסט',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: any) => (
        <Space>
          <strong>{name}</strong>
          {!record.isActive && <Tag color="red">לא פעיל</Tag>}
        </Space>
      ),
    },
    {
      title: 'ברקוד',
      dataIndex: 'barcode',
      key: 'barcode',
      render: (barcode: string) => (
        <Space>
          <BarcodeOutlined />
          <code>{barcode}</code>
        </Space>
      ),
    },
    {
      title: 'פריטים',
      key: 'itemCount',
      render: (_: any, record: any) => (
        <Tag color="blue">{record.items?.length || 0} פריטים</Tag>
      ),
    },
    {
      title: 'תיאור',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_: any, record: any) => canManage ? (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
          >
            ערוך
          </Button>
          <Popconfirm
            title="האם למחוק את הסט?"
            onConfirm={() => deleteSet({ variables: { id: record.id } })}
            okText="כן"
            cancelText="לא"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              מחק
            </Button>
          </Popconfirm>
        </Space>
      ) : null,
    },
  ];

  const equipmentOptions = allEquipment.map((eq: any) => ({
    value: eq.id,
    label: `${eq.name} (${categoryLabelOf(eq.category)}) — ${eq.barcode}`,
  }));

  /** Build a report with two views of the same data: a "Sets" summary
   *  (one row per set) and a flat "Items" table (one row per item × set)
   *  so the export is useful both for a high-level audit and a detailed
   *  pick list. */
  const buildReport = (): ExportReport | null => {
    if (filteredSets.length === 0) return null;

    type SetRow = {
      id: string;
      name: string;
      barcode: string;
      description?: string;
      isActive: boolean;
      itemCount: number;
    };
    type ItemRow = {
      setName: string;
      setBarcode: string;
      equipmentName: string;
      equipmentBarcode: string;
      category: string;
      quantity: number;
      required: boolean;
    };

    const setRows: SetRow[] = filteredSets.map((s: any) => ({
      id: s.id,
      name: s.name,
      barcode: s.barcode,
      description: s.description,
      isActive: s.isActive !== false,
      itemCount: s.items?.length || 0,
    }));

    const itemRows: ItemRow[] = [];
    filteredSets.forEach((s: any) => {
      (s.items || []).forEach((it: any) => {
        itemRows.push({
          setName: s.name,
          setBarcode: s.barcode,
          equipmentName: it.equipment?.name || it.equipmentId,
          equipmentBarcode: it.equipment?.barcode || '',
          category: categoryLabelOf(it.equipment?.category),
          quantity: it.quantity || 0,
          required: !!it.required,
        });
      });
    });

    const setCols: ExportColumn<SetRow>[] = [
      { key: 'name', label: 'שם הסט', emphasis: true, value: (r) => r.name },
      { key: 'barcode', label: 'ברקוד', code: true, value: (r) => r.barcode },
      { key: 'itemCount', label: 'מס׳ פריטים', numeric: true, value: (r) => r.itemCount },
      { key: 'description', label: 'תיאור', value: (r) => r.description || '' },
      {
        key: 'status',
        label: 'סטטוס',
        value: (r) => (r.isActive ? 'פעיל' : 'לא פעיל'),
        status: (r) =>
          r.isActive
            ? { label: 'פעיל', variant: 'active' }
            : { label: 'לא פעיל', variant: 'danger' },
      },
    ];

    const itemCols: ExportColumn<ItemRow>[] = [
      { key: 'setName', label: 'סט', emphasis: true, value: (r) => r.setName },
      { key: 'setBarcode', label: 'ברקוד סט', code: true, value: (r) => r.setBarcode },
      { key: 'equipmentName', label: 'שם ציוד', value: (r) => r.equipmentName },
      { key: 'equipmentBarcode', label: 'ברקוד ציוד', code: true, value: (r) => r.equipmentBarcode },
      { key: 'category', label: 'קטגוריה', value: (r) => r.category },
      { key: 'quantity', label: 'כמות', numeric: true, value: (r) => r.quantity },
      {
        key: 'required',
        label: 'חובה',
        value: (r) => (r.required ? 'חובה' : 'אופציונלי'),
        status: (r) =>
          r.required
            ? { label: 'חובה', variant: 'danger' }
            : { label: 'אופציונלי', variant: 'neutral' },
      },
    ];

    return {
      title: 'דוח סטים של ציוד',
      subtitle: 'רשימת הסטים המוגדרים במערכת והפריטים הכלולים בכל אחד.',
      filenameStem: 'מחסן-סטים',
      origin: 'מחסן · סטים',
      metaChips: searchText.trim() ? [`חיפוש: ${searchText.trim()}`] : undefined,
      summary: [
        { label: 'סה״כ סטים', value: filteredSets.length, accent: 'sets' },
        { label: 'סה״כ פריטים', value: itemRows.length, accent: 'warehouse' },
      ],
      sections: [
        {
          kind: 'table',
          key: 'sets',
          title: 'סטים',
          accent: 'sets',
          meta: `${setRows.length} סטים`,
          columns: setCols,
          rows: setRows,
        },
        {
          kind: 'table',
          key: 'items',
          title: 'פירוט פריטים',
          accent: 'warehouse',
          meta: `${itemRows.length} שורות`,
          columns: itemCols,
          rows: itemRows,
          emptyText: 'אין פריטים בסטים שנבחרו',
        },
      ],
    };
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Input
          placeholder="חיפוש סטים..."
          style={{ width: 300 }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
        />
        <Space>
          <WarehouseExportButtons
            buildReport={buildReport}
            disabled={setsLoading || filteredSets.length === 0}
          />
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
              צור סט חדש
            </Button>
          )}
        </Space>
      </div>

      <Table
        dataSource={filteredSets}
        columns={columns}
        rowKey="id"
        loading={setsLoading}
        locale={{ emptyText: <Empty description="אין סטים עדיין" /> }}
        expandable={{
          expandedRowRender: (record: any) => (
            <Table
              dataSource={record.items || []}
              rowKey="equipmentId"
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'שם ציוד',
                  key: 'name',
                  render: (_: any, item: any) =>
                    item.equipment?.name || item.equipmentId,
                },
                {
                  title: 'ברקוד',
                  key: 'barcode',
                  render: (_: any, item: any) =>
                    item.equipment?.barcode || '-',
                },
                {
                  title: 'כמות',
                  dataIndex: 'quantity',
                  key: 'quantity',
                },
                {
                  title: 'חובה',
                  dataIndex: 'required',
                  key: 'required',
                  render: (val: boolean) =>
                    val ? <Tag color="red">חובה</Tag> : <Tag>אופציונלי</Tag>,
                },
              ]}
            />
          ),
        }}
      />

      <Modal
        title={editingSet ? 'ערוך סט' : 'צור סט חדש'}
        open={isModalOpen}
        onCancel={handleCloseModal}
        width={700}
        footer={[
          <Button key="cancel" onClick={handleCloseModal}>
            ביטול
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={creating || updating}
            onClick={handleSubmit}
          >
            {editingSet ? 'עדכן' : 'צור'}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="שם הסט"
            rules={[{ required: true, message: 'נא להזין שם' }]}
          >
            <Input placeholder='לדוגמה: סט צילום חוץ בסיסי' />
          </Form.Item>

          <Form.Item
            name="barcode"
            label="ברקוד הסט"
            rules={[{ required: true, message: 'נא להזין ברקוד' }]}
            tooltip="הזן ברקוד ידני — יכול להיות ברקוד מודפס מראש על תיק/ארגז הסט"
          >
            <Input prefix={<BarcodeOutlined />} placeholder="SET-001" />
          </Form.Item>

          <Form.Item name="description" label="תיאור">
            <Input.TextArea rows={2} placeholder="תיאור קצר של הסט" />
          </Form.Item>

          <Form.Item name="notes" label="הערות">
            <Input.TextArea rows={2} placeholder="הערות נוספות" />
          </Form.Item>

          <div className="mb-2 font-medium">פריטים בסט</div>
          {setItems.map((item, index) => (
            <div key={index} className="flex gap-2 items-center mb-2">
              <Select
                style={{ flex: 1 }}
                showSearch
                optionFilterProp="label"
                placeholder="בחר ציוד"
                value={item.equipmentId || undefined}
                onChange={(val) => handleItemChange(index, 'equipmentId', val)}
                options={equipmentOptions}
              />
              <InputNumber
                min={1}
                value={item.quantity}
                onChange={(val) => handleItemChange(index, 'quantity', val || 1)}
                style={{ width: 80 }}
                placeholder="כמות"
              />
              <Switch
                checked={item.required}
                onChange={(val) => handleItemChange(index, 'required', val)}
                checkedChildren="חובה"
                unCheckedChildren="אופציונלי"
              />
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => handleRemoveItem(index)}
              />
            </div>
          ))}
          <Button type="dashed" block icon={<PlusOutlined />} onClick={handleAddItem}>
            הוסף פריט
          </Button>
        </Form>
      </Modal>
    </div>
  );
};

export default EquipmentSetsManager;
