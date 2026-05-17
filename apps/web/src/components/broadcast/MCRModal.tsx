import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Card, Row, Col, Divider, Typography, Select, Tag, App } from 'antd';
import { 
  ControlOutlined,
  VideoCameraOutlined,
  UserOutlined,
  ToolOutlined
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client';
import { UPDATE_ACTIVITY_ROW } from '../../graphql/mcrMutations';
import { GET_ACTIVITY_ROW_BY_BROADCAST_EVENT, GET_ACTIVITY_ROWS } from '../../graphql/mcrQueries';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA } from '../../graphql/mutations';
import dayjs from 'dayjs';
import 'dayjs/locale/he';

const { TextArea } = Input;
const { Title, Text } = Typography;

interface BroadcastEvent {
  id: string;
  title: string;
  metadata?: any;
  startTime?: string;
  [key: string]: any;
}

interface MCRModalProps {
  visible: boolean;
  event: BroadcastEvent;
  onClose: () => void;
  onDataSaved?: () => void;
  /** When false, hides save / not-applicable buttons and disables form fields. */
  canEdit?: boolean;
}

interface WarehouseEquipmentItem {
  id: string;
  equipmentId: string;
  eventName: string;
  status: string;
  quantityAssigned: number;
  assignmentStatus: string;
  assignedToName?: string;
  assignmentNotes?: string;
}

const statusOptions = [
  { value: 'UNKNOWN', label: 'לא הוגדר' },
  { value: 'READY', label: 'מוכן לשידור' },
  { value: 'NOT_READY', label: 'לא מוכן לשידור' },
  { value: 'ERROR', label: 'תקלה' },
];

const MCRModal: React.FC<MCRModalProps> = ({ visible, event, onClose, onDataSaved, canEdit = true }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [activityRowId, setActivityRowId] = useState<string | null>(null);
  const { message } = App.useApp();

  const eventDate = event?.startTime
    ? new Date(event.startTime).toISOString()
    : new Date().toISOString();

  const { data: activityData, loading: activityLoading } = useQuery(GET_ACTIVITY_ROW_BY_BROADCAST_EVENT, {
    variables: {
      broadcastEventId: event?.id,
      date: eventDate,
    },
    skip: !event?.id || !visible,
    fetchPolicy: 'network-only',
  });

  const [updateActivityRow] = useMutation(UPDATE_ACTIVITY_ROW, {
    refetchQueries: ['GetActivityRows', 'GetActivityRowByBroadcastEvent'],
    onCompleted: () => {
      if (onDataSaved) {
        onDataSaved();
      }
    },
    onError: (error) => {
      message.error('שגיאה בשמירת נתוני MCR: ' + error.message);
    }
  });

  const [updateDepartmentData] = useMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA);

  useEffect(() => {
    if (visible && activityData?.activityRowByBroadcastEvent) {
      const row = activityData.activityRowByBroadcastEvent;
      setActivityRowId(row.id);

      const formattedDate = event.startTime ? dayjs(event.startTime).format('DD/MM/YYYY') : '';
      const formattedTime = event.startTime ? dayjs(event.startTime).format('HH:mm') : '';

      form.setFieldsValue({
        אירוע: event.title || '',
        תאריך: formattedDate,
        שעה: formattedTime,
        מקור: row.source || '',
        גיבוי: row.backup || '',
        מכשירים: row.equipment || '',
        ניתובים: row.routing || '',
        הערות: row.notes || '',
        סטטוס: row.status || 'UNKNOWN',
      });

      // Backfill from legacy department data if the ActivityRow is empty
      const mcrData = event.metadata?.departments?.mcr;
      if (mcrData && !row.source && !row.backup && !row.equipment && !row.routing) {
        const legacySource = mcrData.מקור || mcrData.source || '';
        const legacyBackup = mcrData.גיבוי || mcrData.backup || '';
        const legacyEquipment = mcrData.מכשירים || mcrData.equipment || '';
        const legacyRouting = mcrData.ניתובים || mcrData.routing || '';

        if (legacySource || legacyBackup || legacyEquipment || legacyRouting) {
          form.setFieldsValue({
            מקור: legacySource,
            גיבוי: legacyBackup,
            מכשירים: legacyEquipment,
            ניתובים: legacyRouting,
          });
        }
      }
    }
  }, [visible, activityData, event, form]);

  const handleSubmit = async (values: any) => {
    if (!canEdit) {
      message.error('אין לך הרשאת עריכה');
      return;
    }
    if (!activityRowId) {
      message.error('שגיאה: לא נמצאה שורת פעילות');
      return;
    }

    setLoading(true);
    try {
      await updateActivityRow({
        variables: {
          id: activityRowId,
          input: {
            source: values.מקור || '',
            backup: values.גיבוי || '',
            equipment: values.מכשירים || '',
            routing: values.ניתובים || '',
            notes: values.הערות || '',
            status: values.סטטוס || 'UNKNOWN',
          }
        }
      });

      message.success('נתוני MCR נשמרו בהצלחה');
      onClose();
    } catch (error) {
      message.error('שגיאה בשמירת נתוני MCR: ' + (error as any).message);
    } finally {
      setLoading(false);
    }
  };

  const warehouseEquipment: WarehouseEquipmentItem[] =
    activityData?.activityRowByBroadcastEvent?.warehouseEquipment || [];

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <ControlOutlined />
          <span>MCR - מכשירים וניתוב</span>
          {!canEdit && (
            <span style={{
              padding: '2px 8px',
              borderRadius: 4,
              backgroundColor: '#fff7e6',
              color: '#ad6800',
              border: '1px solid #ffd591',
              fontSize: 12,
              fontWeight: 500,
            }}>
              לקריאה בלבד
            </span>
          )}
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={800}
      footer={canEdit ? [
        <Button key="cancel" onClick={onClose}>
          ביטול
        </Button>,
        <Button 
          key="not-for-us" 
          type="default"
          loading={loading}
          onClick={async () => {
            if (!activityRowId) return;
            setLoading(true);
            try {
              await updateActivityRow({
                variables: {
                  id: activityRowId,
                  input: {
                    status: 'UNKNOWN',
                    source: '',
                    equipment: '',
                    backup: '',
                    routing: '',
                    notes: 'לא עבורנו',
                  }
                }
              });

              await updateDepartmentData({
                variables: {
                  eventId: event.id,
                  department: 'mcr',
                  data: { customData: { notApplicable: true } }
                }
              });

              if (onDataSaved) onDataSaved();
              onClose();
            } catch (error) {
              message.error('שגיאה בסימון כלא רלוונטי: ' + (error as any).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          לא עבורנו
        </Button>,
        <Button 
          key="save" 
          type="primary" 
          loading={loading || activityLoading}
          onClick={() => form.submit()}
        >
          שמור
        </Button>
      ] : [
        <Button key="close" onClick={onClose}>
          סגור
        </Button>
      ]}
    >
      {activityLoading ? (
        <div className="text-center py-8 text-gray-400">טוען נתונים...</div>
      ) : (
        <>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            dir="rtl"
            disabled={!canEdit}
          >
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="אירוע" label="אירוע">
                  <Input disabled className="bg-gray-50" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="תאריך" label="תאריך">
                  <Input disabled className="bg-gray-50" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="שעה" label="שעה">
                  <Input disabled className="bg-gray-50" />
                </Form.Item>
              </Col>
            </Row>

            <Divider />

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="סטטוס" label="סטטוס">
                  <Select options={statusOptions} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="מקור" label="מקור">
                  <TextArea rows={3} placeholder="הזן פרטי מקור..." className="font-mono" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="גיבוי" label="גיבוי">
                  <TextArea rows={3} placeholder="הזן פרטי גיבוי..." className="font-mono" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="מכשירים" label="מכשירים">
                  <TextArea rows={3} placeholder="הזן רשימת מכשירים..." className="font-mono" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="ניתובים" label="ניתובים">
                  <TextArea rows={3} placeholder="הזן פרטי ניתובים..." className="font-mono" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={24}>
                <Form.Item name="הערות" label="הערות">
                  <TextArea rows={2} placeholder="הזן הערות..." />
                </Form.Item>
              </Col>
            </Row>
          </Form>

          <Divider />

          <div className="mt-4">
            <Title level={5} className="mb-3">
              <ToolOutlined className="ml-2" />
              ציוד מהמחסן (שוייך לאירוע)
            </Title>
            
            {warehouseEquipment.length > 0 ? (
              <div className="space-y-2">
                {warehouseEquipment.map((item) => (
                  <Card key={item.id} size="small" className="bg-blue-50">
                    <Row>
                      <Col span={12}>
                        <Text strong>ציוד:</Text>{' '}
                        {item.eventName}
                        <Tag color={item.status === 'active' ? 'green' : 'default'} className="mr-2">
                          {item.status === 'active' ? 'פעיל' : item.status}
                        </Tag>
                      </Col>
                      <Col span={12}>
                        <Text strong>כמות:</Text> {item.quantityAssigned}
                        {item.assignedToName && (
                          <span className="mr-4">
                            <Text strong>שוייך ע"י:</Text> {item.assignedToName}
                          </span>
                        )}
                      </Col>
                    </Row>
                  </Card>
                ))}
              </div>
            ) : (
              <Card size="small" className="bg-gray-100 text-center">
                <Text className="text-gray-500">אין ציוד משוייך מהמחסן</Text>
              </Card>
            )}
          </div>
        </>
      )}
    </Modal>
  );
};

export default MCRModal;
