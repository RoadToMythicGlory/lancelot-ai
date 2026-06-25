'use client';

/**
 * Per-event fault reports panel.
 *
 * Opening a fault report blocks the warehouse from assigning the equipment
 * to a new event until the fault is resolved. The block is enforced
 * server-side in `warehouse.service.ts.allocateEquipment` — the UI only
 * surfaces the open faults.
 */
import React, { useState } from 'react';
import {
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useMutation, useQuery } from '@apollo/client';
import {
  ExclamationCircleOutlined,
  PlusOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { GET_EQUIPMENT_FAULT_REPORTS } from '@/graphql/queries';
import {
  CREATE_EQUIPMENT_FAULT_REPORT,
  RESOLVE_EQUIPMENT_FAULT_REPORT,
  UPDATE_EQUIPMENT_FAULT_REPORT,
} from '@/graphql/mutations';
import {
  FAULT_SEVERITY_LABEL,
  FAULT_STATUS_LABEL,
  type FaultSeverity,
  type FaultStatus,
} from '@/utils/externalBroadcastDomain';

const { Text } = Typography;

interface EquipmentOption {
  id: string;
  name: string;
  barcode?: string | null;
}

interface FaultReportsPanelProps {
  eventId: string;
  equipmentOptions: EquipmentOption[];
  disabled?: boolean;
}

const STATUS_COLOR: Record<FaultStatus, string> = {
  open: 'red',
  in_progress: 'orange',
  resolved: 'green',
};

const SEVERITY_COLOR: Record<FaultSeverity, string> = {
  minor: 'blue',
  major: 'orange',
  critical: 'red',
};

export const FaultReportsPanel: React.FC<FaultReportsPanelProps> = ({
  eventId,
  equipmentOptions,
  disabled,
}) => {
  const { message: messageApi } = App.useApp();
  const { data, loading, refetch } = useQuery(GET_EQUIPMENT_FAULT_REPORTS, {
    variables: { eventId },
    fetchPolicy: 'cache-and-network',
  });
  const [createFault] = useMutation(CREATE_EQUIPMENT_FAULT_REPORT);
  const [updateFault] = useMutation(UPDATE_EQUIPMENT_FAULT_REPORT);
  const [resolveFault] = useMutation(RESOLVE_EQUIPMENT_FAULT_REPORT);

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [resolveModalState, setResolveModalState] = useState<{
    open: boolean;
    id?: string;
  }>({ open: false });
  const [resolveNotes, setResolveNotes] = useState('');

  const faults = data?.equipmentFaultReports || [];

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await createFault({
        variables: {
          input: {
            equipmentId: values.equipmentId,
            eventId,
            description: values.description,
            severity: values.severity || 'major',
          },
        },
      });
      messageApi.success('דיווח התקלה נשמר וחוסם הזמנת הציוד עד שיטופל');
      setModalOpen(false);
      form.resetFields();
      refetch();
    } catch (err: any) {
      if (err.errorFields) return;
      messageApi.error(`שגיאה: ${err.message}`);
    }
  };

  const handleResolve = async () => {
    if (!resolveModalState.id) return;
    try {
      await resolveFault({
        variables: { id: resolveModalState.id, resolutionNotes: resolveNotes },
      });
      messageApi.success('התקלה סומנה כטופלה — הציוד שוחרר להזמנה');
      setResolveModalState({ open: false });
      setResolveNotes('');
      refetch();
    } catch (err: any) {
      messageApi.error(`שגיאה: ${err.message}`);
    }
  };

  const handleStatusChange = async (id: string, status: FaultStatus) => {
    if (status === 'resolved') {
      setResolveModalState({ open: true, id });
      return;
    }
    try {
      await updateFault({ variables: { id, input: { status } } });
      messageApi.success('סטטוס התקלה עודכן');
      refetch();
    } catch (err: any) {
      messageApi.error(`שגיאה: ${err.message}`);
    }
  };

  return (
    <Card
      size="small"
      style={{ marginBottom: 12, direction: 'rtl' }}
      title={
        <Space>
          <ExclamationCircleOutlined />
          <Text strong>דיווחי תקלות</Text>
          {faults.filter((f: any) => f.status !== 'resolved').length > 0 && (
            <Tag color="red">
              {faults.filter((f: any) => f.status !== 'resolved').length} פתוחות
            </Tag>
          )}
        </Space>
      }
      extra={
        !disabled && (
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
          >
            דווח על תקלה
          </Button>
        )
      }
    >
      {faults.length === 0 && !loading && (
        <Empty
          description="לא דווחו תקלות בשידור זה"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}

      {faults.length > 0 && (
        <Table
          size="small"
          loading={loading}
          rowKey="id"
          dataSource={faults}
          pagination={false}
          columns={[
            {
              title: 'ציוד',
              key: 'equipment',
              render: (_: any, r: any) => (
                <div>
                  <div style={{ fontWeight: 500 }}>{r.equipmentName || '-'}</div>
                  {r.equipmentBarcode && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {r.equipmentBarcode}
                    </Text>
                  )}
                </div>
              ),
            },
            { title: 'תיאור', dataIndex: 'description', key: 'description' },
            {
              title: 'חומרה',
              dataIndex: 'severity',
              key: 'severity',
              width: 110,
              render: (s: FaultSeverity) => (
                <Tag color={SEVERITY_COLOR[s]}>{FAULT_SEVERITY_LABEL[s]}</Tag>
              ),
            },
            {
              title: 'סטטוס',
              dataIndex: 'status',
              key: 'status',
              width: 160,
              render: (s: FaultStatus, r: any) => (
                <Select
                  size="small"
                  value={s}
                  disabled={disabled}
                  onChange={(v) => handleStatusChange(r.id, v)}
                  style={{ width: 140 }}
                  options={(['open', 'in_progress', 'resolved'] as FaultStatus[]).map(
                    (st) => ({
                      value: st,
                      label: (
                        <Tag color={STATUS_COLOR[st]}>
                          {FAULT_STATUS_LABEL[st]}
                        </Tag>
                      ),
                    }),
                  )}
                />
              ),
            },
            {
              title: 'דווח ע"י',
              key: 'reportedBy',
              width: 160,
              render: (_: any, r: any) => (
                <div>
                  <div>{r.reportedByName || '-'}</div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {r.reportedAt
                      ? new Date(r.reportedAt).toLocaleString('he-IL')
                      : ''}
                  </Text>
                </div>
              ),
            },
            {
              title: '',
              key: 'actions',
              width: 90,
              render: (_: any, r: any) =>
                r.status !== 'resolved' && !disabled ? (
                  <Popconfirm
                    title="לסמן כטופלה?"
                    onConfirm={() =>
                      setResolveModalState({ open: true, id: r.id })
                    }
                  >
                    <Button
                      size="small"
                      type="link"
                      icon={<CheckCircleOutlined />}
                    >
                      טופל
                    </Button>
                  </Popconfirm>
                ) : null,
            },
          ]}
        />
      )}

      <Modal
        title="דיווח על תקלה"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={handleCreate}
        okText="שמור"
        cancelText="ביטול"
      >
        <Form form={form} layout="vertical" initialValues={{ severity: 'major' }}>
          <Form.Item
            label="ציוד"
            name="equipmentId"
            rules={[{ required: true, message: 'יש לבחור ציוד' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="בחר ציוד מהשידור"
              options={equipmentOptions.map((e) => ({
                value: e.id,
                label: `${e.name}${e.barcode ? ` · ${e.barcode}` : ''}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            label="תיאור התקלה"
            name="description"
            rules={[{ required: true, message: 'יש להזין תיאור' }]}
          >
            <Input.TextArea rows={3} placeholder="פירוט התקלה" />
          </Form.Item>
          <Form.Item label="חומרה" name="severity">
            <Select
              options={(['minor', 'major', 'critical'] as FaultSeverity[]).map(
                (s) => ({ value: s, label: FAULT_SEVERITY_LABEL[s] }),
              )}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="סימון התקלה כטופלה"
        open={resolveModalState.open}
        onCancel={() => {
          setResolveModalState({ open: false });
          setResolveNotes('');
        }}
        onOk={handleResolve}
        okText="סמן כטופל"
        cancelText="ביטול"
      >
        <Form layout="vertical">
          <Form.Item label="הערות (אופציונלי)">
            <Input.TextArea
              rows={3}
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              placeholder="פעולת תיקון, חלפים שהוחלפו וכו'"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
