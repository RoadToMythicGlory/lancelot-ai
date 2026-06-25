'use client';

/**
 * External Broadcasts reference data settings.
 *
 * Single tabbed editor for the operational reference catalogs:
 *   - Vehicles
 *   - Trailers
 *   - Control rooms (the single source of truth used by the Broadcast
 *     Array form, External Broadcasts, MCR, and reports)
 *   - Broadcast types (fibers / setup time / calc)
 *
 * Crew is NOT here — crew members are managed in the Users page.
 * Venues/stadiums stay in `VenuesManager` because they have a much
 * richer schema (crew structures, equipment preset links, etc.).
 */
import React, { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useMutation, useQuery } from '@apollo/client';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { GET_EXTERNAL_BROADCAST_REFERENCE } from '@/graphql/queries';
import {
  DELETE_EXTERNAL_BROADCAST_REFERENCE,
  UPSERT_EXTERNAL_BROADCAST_REFERENCE,
} from '@/graphql/mutations';

const { Title, Text } = Typography;

type ReferenceKind =
  | 'vehicle'
  | 'trailer'
  | 'controlRoom'
  | 'broadcastType';

const KIND_LABEL: Record<ReferenceKind, string> = {
  vehicle: 'רכבים',
  trailer: 'נגררים',
  controlRoom: 'חדרי בקרה',
  broadcastType: 'סוגי שידור',
};

const KIND_ORDER: ReferenceKind[] = [
  'controlRoom',
  'vehicle',
  'trailer',
  'broadcastType',
];

export const ReferenceDataSettings: React.FC = () => {
  const [activeKind, setActiveKind] = useState<ReferenceKind>('vehicle');
  return (
    <Card style={{ direction: 'rtl' }}>
      <Title level={4}>נתוני עזר</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        ניהול חדרי בקרה, רכבים, נגררים וסוגי שידור. חדרי הבקרה הם מקור אחד
        משותף בכל האפליקציה (טופס מערך השידורים, שידורי חוץ, MCR, דו"חות
        וכו') — הוספה/מחיקה כאן משפיעה בכל המקומות. אנשי צוות מנוהלים בדף
        המשתמשים; אולמות מנוהלים בלוח האולמות.
      </Text>
      <Tabs
        activeKey={activeKind}
        onChange={(k) => setActiveKind(k as ReferenceKind)}
        items={KIND_ORDER.map((k) => ({
          key: k,
          label: KIND_LABEL[k],
          children: <ReferenceList kind={k} />,
        }))}
      />
    </Card>
  );
};

const ReferenceList: React.FC<{ kind: ReferenceKind }> = ({ kind }) => {
  const { message: messageApi } = App.useApp();
  const { data, loading, refetch } = useQuery(GET_EXTERNAL_BROADCAST_REFERENCE, {
    variables: { kind, includeInactive: true },
    fetchPolicy: 'cache-and-network',
  });
  const [upsert] = useMutation(UPSERT_EXTERNAL_BROADCAST_REFERENCE);
  const [remove] = useMutation(DELETE_EXTERNAL_BROADCAST_REFERENCE);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();

  const items = data?.externalBroadcastReference || [];

  const openModal = (item?: any) => {
    setEditing(item || null);
    if (item) {
      form.setFieldsValue(item);
    } else {
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await upsert({
        variables: {
          input: {
            id: editing?.id || null,
            kind,
            ...values,
            isActive: values.isActive !== false,
          },
        },
      });
      messageApi.success('נשמר בהצלחה');
      setModalOpen(false);
      await refetch();
    } catch (err: any) {
      if (err.errorFields) return;
      messageApi.error(`שגיאה: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove({ variables: { id } });
      messageApi.success('נמחק');
      await refetch();
    } catch (err: any) {
      messageApi.error(`שגיאה: ${err.message}`);
    }
  };

  const baseColumns: any[] = [
    {
      title: 'שם',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, r: any) => (
        <Space>
          {v}
          {r.isActive === false && <Tag color="default">לא פעיל</Tag>}
        </Space>
      ),
    },
    { title: 'תיאור', dataIndex: 'description', key: 'description' },
  ];

  // Broadcast types get the legacy extra columns.
  const broadcastTypeColumns: any[] = [
    { title: 'קבוצה', dataIndex: 'broadcastTypeGroup', key: 'broadcastTypeGroup' },
    { title: 'כמות סיבים', dataIndex: 'fiberCount', key: 'fiberCount' },
    { title: 'מחיר סיב', dataIndex: 'fiberPrice', key: 'fiberPrice' },
    { title: 'סיב חזרה', dataIndex: 'returnFiber', key: 'returnFiber' },
    { title: 'זמן הקמה (דק׳)', dataIndex: 'setupTimeMinutes', key: 'setupTimeMinutes' },
    { title: 'סוג חישוב', dataIndex: 'calculationType', key: 'calculationType' },
  ];

  const columns = [
    ...baseColumns,
    ...(kind === 'broadcastType' ? broadcastTypeColumns : []),
    {
      title: '',
      key: 'actions',
      width: 110,
      render: (_: any, r: any) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openModal(r)}
          />
          <Popconfirm title="למחוק?" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          הוסף {KIND_LABEL[kind]}
        </Button>
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={items}
        columns={columns}
        pagination={{ pageSize: 15 }}
      />
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        title={editing ? `עריכת ${KIND_LABEL[kind]}` : `הוספת ${KIND_LABEL[kind]}`}
        okText="שמור"
        cancelText="ביטול"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="שם"
            rules={[{ required: true, message: 'נא להזין שם' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="תיאור">
            <Input.TextArea rows={2} />
          </Form.Item>
          {kind === 'broadcastType' && (
            <>
              <Form.Item name="broadcastTypeGroup" label="קבוצה">
                <Input placeholder="לדוגמה: כדורגל / אולפן" />
              </Form.Item>
              <Form.Item name="fiberCount" label="כמות סיבים">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="fiberPort" label="פורט סיב">
                <Input />
              </Form.Item>
              <Form.Item name="fiberPrice" label="מחיר סיב">
                <InputNumber min={0} style={{ width: '100%' }} addonBefore="₪" />
              </Form.Item>
              <Form.Item name="returnFiber" label="סיב חזרה">
                <Input />
              </Form.Item>
              <Form.Item name="setupTimeMinutes" label="זמן הקמה (דקות)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="calculationType" label="סוג חישוב">
                <Input />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
};
