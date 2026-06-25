'use client';

/**
 * External Broadcasts device configuration.
 *
 * Lets External Broadcasts managers (or warehouse staff) configure the
 * capability metadata the EB flows depend on, without opening the full
 * warehouse equipment editor:
 *   - NEVION units: set the camera capacity used by the auto-request rule.
 *   - LiveU kits: set the internal/console ID used by the activation email.
 *
 * It also lets EB register a brand-new LiveU kit. That kit is created
 * WITHOUT a warehouse barcode, so it stays unavailable (and hidden from the
 * equipment picker) until the warehouse assigns a barcode.
 */
import React, { useMemo, useState } from 'react';
import {
  App, Button, Card, Empty, Form, Input, InputNumber, Space, Table, Tag,
  Typography, Divider,
} from 'antd';
import {
  ThunderboltOutlined, WifiOutlined, PlusOutlined, SaveOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import { GET_EXTERNAL_BROADCAST_DEVICES } from '@/graphql/queries';
import {
  SET_NEVION_CAMERA_CAPACITY, SET_LIVEU_INTERNAL_ID, REGISTER_LIVEU_DEVICE,
} from '@/graphql/mutations';

const { Text } = Typography;

interface DeviceRow {
  id: string;
  name: string;
  category?: string | null;
  barcode?: string | null;
  quantityAvailable?: number | null;
  available: boolean;
  awaitingBarcode: boolean;
  isNevion: boolean;
  isLiveu: boolean;
  nevionCameraCapacity?: number | null;
  liveuInternalId?: string | null;
}

const AvailabilityTag: React.FC<{ row: DeviceRow }> = ({ row }) => {
  if (row.awaitingBarcode) return <Tag color="orange">ממתין לברקוד מהמחסן</Tag>;
  if (row.available) return <Tag color="green">זמין</Tag>;
  return <Tag color="red">לא זמין</Tag>;
};

export const ExternalBroadcastDeviceConfig: React.FC = () => {
  const { message: messageApi } = App.useApp();
  const { hasPermission } = useAuth();
  const canManage =
    hasPermission(Permission.BROADCAST_MANAGE) || hasPermission(Permission.WAREHOUSE_MANAGE);

  const { data, loading, refetch } = useQuery(GET_EXTERNAL_BROADCAST_DEVICES, {
    fetchPolicy: 'cache-and-network',
  });
  const devices: DeviceRow[] = useMemo(
    () => data?.externalBroadcastDevices || [],
    [data],
  );
  const nevionDevices = useMemo(() => devices.filter((d) => d.isNevion), [devices]);
  const liveuDevices = useMemo(() => devices.filter((d) => d.isLiveu), [devices]);

  const [setCapacity] = useMutation(SET_NEVION_CAMERA_CAPACITY);
  const [setLiveuId] = useMutation(SET_LIVEU_INTERNAL_ID);
  const [registerLiveu, { loading: registering }] = useMutation(REGISTER_LIVEU_DEVICE);

  const [capacityDraft, setCapacityDraft] = useState<Record<string, number | null>>({});
  const [liveuDraft, setLiveuDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string>('');
  const [registerForm] = Form.useForm();

  const saveCapacity = async (row: DeviceRow) => {
    const value = capacityDraft[row.id] ?? row.nevionCameraCapacity ?? null;
    setSavingId(row.id);
    try {
      await setCapacity({ variables: { equipmentId: row.id, capacity: value } });
      messageApi.success(`קיבולת המצלמות של ${row.name} נשמרה`);
      await refetch();
    } catch (err: any) {
      messageApi.error(`שגיאה: ${err.message}`);
    } finally { setSavingId(''); }
  };

  const saveLiveuId = async (row: DeviceRow) => {
    const value = liveuDraft[row.id] ?? row.liveuInternalId ?? '';
    setSavingId(row.id);
    try {
      await setLiveuId({ variables: { equipmentId: row.id, liveuInternalId: value } });
      messageApi.success(`תעודת הזהות של ${row.name} נשמרה`);
      await refetch();
    } catch (err: any) {
      messageApi.error(`שגיאה: ${err.message}`);
    } finally { setSavingId(''); }
  };

  const handleRegister = async () => {
    try {
      const values = await registerForm.validateFields();
      await registerLiveu({
        variables: {
          input: {
            name: values.name,
            liveuInternalId: values.liveuInternalId || null,
            company: values.company || null,
            equipmentModel: values.equipmentModel || null,
          },
        },
      });
      messageApi.success('ערכת LiveU נרשמה. תסומן כזמינה לאחר שהמחסן יקצה לה ברקוד.');
      registerForm.resetFields();
      await refetch();
    } catch (err: any) {
      if (err?.errorFields) return;
      messageApi.error(`שגיאה ברישום: ${err.message}`);
    }
  };

  const nevionColumns = [
    { title: 'שם המכשיר', dataIndex: 'name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },
    { title: 'ברקוד', dataIndex: 'barcode', key: 'barcode', render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'זמינות', key: 'avail', render: (_: any, row: DeviceRow) => <AvailabilityTag row={row} /> },
    {
      title: 'קיבולת מצלמות',
      key: 'capacity',
      render: (_: any, row: DeviceRow) => (
        <Space>
          <InputNumber
            min={0} max={64} style={{ width: 90 }}
            value={capacityDraft[row.id] ?? row.nevionCameraCapacity ?? undefined}
            onChange={(v) => setCapacityDraft((p) => ({ ...p, [row.id]: typeof v === 'number' ? v : null }))}
            disabled={!canManage}
            placeholder="—"
          />
          {canManage && (
            <Button size="small" type="primary" icon={<SaveOutlined />} loading={savingId === row.id} onClick={() => saveCapacity(row)}>
              שמור
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const liveuColumns = [
    { title: 'שם הערכה', dataIndex: 'name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },
    { title: 'ברקוד', dataIndex: 'barcode', key: 'barcode', render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'זמינות', key: 'avail', render: (_: any, row: DeviceRow) => <AvailabilityTag row={row} /> },
    {
      title: 'תעודת זהות LiveU',
      key: 'liveuId',
      render: (_: any, row: DeviceRow) => (
        <Space>
          <Input
            style={{ width: 160 }}
            value={liveuDraft[row.id] ?? row.liveuInternalId ?? ''}
            onChange={(e) => setLiveuDraft((p) => ({ ...p, [row.id]: e.target.value }))}
            disabled={!canManage}
            placeholder="ת.ז. פנימית"
          />
          {canManage && (
            <Button size="small" type="primary" icon={<SaveOutlined />} loading={savingId === row.id} onClick={() => saveLiveuId(row)}>
              שמור
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ direction: 'rtl' }}>
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title={<Space><ThunderboltOutlined /><Text strong>מכשירי NEVION — קיבולת מצלמות</Text></Space>}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          קיבולת המצלמות נקבעת כאן עבור כל מכשיר NEVION במחסן. בקשת ה-NEVION האוטומטית בוחרת את המכשיר הקטן ביותר עם קיבולת מספקת.
        </Text>
        {nevionDevices.length === 0 ? (
          <Empty description="לא נמצאו מכשירי NEVION (זוהה לפי שם או קיבולת קיימת)" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table rowKey="id" size="small" loading={loading} pagination={false} columns={nevionColumns} dataSource={nevionDevices} />
        )}
      </Card>

      <Card
        size="small"
        title={<Space><WifiOutlined /><Text strong>ערכות LiveU — תעודות זהות</Text></Space>}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          לכל ערכת LiveU יש תעודת זהות פנימית (לא ברקוד) שנשלחת בבקשת ההפעלה לספק.
        </Text>
        {liveuDevices.length === 0 ? (
          <Empty description="לא נמצאו ערכות LiveU" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table rowKey="id" size="small" loading={loading} pagination={false} columns={liveuColumns} dataSource={liveuDevices} />
        )}

        {canManage && (
          <>
            <Divider><PlusOutlined /> רישום ערכת LiveU חדשה</Divider>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              ניתן לרשום ערכת LiveU חדשה כאן. הברקוד נקבע על ידי המחסן — עד שהמחסן יקצה ברקוד, הערכה לא תסומן כזמינה ולא תופיע בבחירת הציוד לאירוע.
            </Text>
            <Form form={registerForm} layout="inline" onFinish={handleRegister} style={{ rowGap: 8, flexWrap: 'wrap' }}>
              <Form.Item name="name" rules={[{ required: true, message: 'שם חובה' }]}>
                <Input placeholder="שם הערכה (למשל LiveU LU800 #3)" style={{ width: 240 }} />
              </Form.Item>
              <Form.Item name="liveuInternalId">
                <Input placeholder="תעודת זהות פנימית (אופציונלי)" style={{ width: 200 }} />
              </Form.Item>
              <Form.Item name="company">
                <Input placeholder="יצרן (אופציונלי)" style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="equipmentModel">
                <Input placeholder="דגם (אופציונלי)" style={{ width: 140 }} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={registering}>
                  רשום ערכה
                </Button>
              </Form.Item>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
};
