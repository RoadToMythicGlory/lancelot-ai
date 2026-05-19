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

const EQUIPMENT_CATEGORIES: Record<string, string> = {
  cameras: 'מצלמות',
  batteries: 'סוללות',
  liveu_kits: 'ערכות LIVEU',
  unity_kits: 'ערכות UNITY',
  monitors: 'מוניטורים',
  headphones: 'אוזניות',
  stabilizers: 'מייצבים',
  cards: 'כרטיסים',
  adapters: 'מתאמים',
  matrix_components: 'רכיבי מטריצה',
  other: 'אחר',
};

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
    label: `${eq.name} (${EQUIPMENT_CATEGORIES[eq.category] || eq.category}) — ${eq.barcode}`,
  }));

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
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            צור סט חדש
          </Button>
        )}
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
