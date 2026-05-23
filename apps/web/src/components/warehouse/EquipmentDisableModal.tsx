import React from 'react';
import { Modal, Form, Input, Select, Space, Button, Alert, App, Timeline, Tag, Empty, Spin, Divider } from 'antd';
import { ExclamationCircleOutlined, HistoryOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client';
import { DISABLE_EQUIPMENT, ENABLE_EQUIPMENT } from '../../graphql/mutations';
import { GET_EQUIPMENT_HISTORY } from '../../graphql/queries';
import dayjs from 'dayjs';

const SUSPENSION_STATUS_OPTIONS = [
  { value: 'under_maintenance', label: 'בתחזוקה' },
  { value: 'broken', label: 'תקול' },
  { value: 'lost', label: 'אבד' },
  { value: 'reserved', label: 'משוריין' },
  { value: 'other', label: 'אחר' },
];

interface EquipmentDisableModalProps {
  visible: boolean;
  equipment: {
    id: string;
    name: string;
    isDisabled: boolean;
    disabledReason?: string;
    quantityAssigned?: number;
  } | null;
  onClose: () => void;
  onSuccess: () => void;
}

const EquipmentDisableModal: React.FC<EquipmentDisableModalProps> = ({
  visible,
  equipment,
  onClose,
  onSuccess
}) => {
  const [disableForm] = Form.useForm();
  const [enableForm] = Form.useForm();
  const { message } = App.useApp();

  // Pull the full history for this equipment so we can render a log of past
  // disable/enable actions next to the re-enable confirmation. Skipped when
  // the modal is closed or no equipment is selected.
  const { data: historyData, loading: historyLoading, refetch: refetchHistory } = useQuery(
    GET_EQUIPMENT_HISTORY,
    {
      variables: { equipmentId: equipment?.id },
      skip: !visible || !equipment?.id,
      fetchPolicy: 'cache-and-network',
    },
  );

  const disableEnableLog = React.useMemo(() => {
    const all = historyData?.equipmentHistory || [];
    return all
      .filter((h: any) => h.action === 'disabled' || h.action === 'enabled')
      .slice(0, 20); // newest first (the query already sorts desc by date)
  }, [historyData]);

  const [disableEquipment, { loading: disableLoading }] = useMutation(DISABLE_EQUIPMENT, {
    refetchQueries: ['GetWarehouseEquipment', 'GetWarehouseEquipmentStats', 'GetEquipmentHistory'],
    onCompleted: () => {
      message.success('הציוד הושבת בהצלחה');
      disableForm.resetFields();
      onSuccess();
      onClose();
    },
    onError: (error) => {
      message.error(`שגיאה בהשבתת הציוד: ${error.message}`);
    }
  });

  const [enableEquipment, { loading: enableLoading }] = useMutation(ENABLE_EQUIPMENT, {
    refetchQueries: ['GetWarehouseEquipment', 'GetWarehouseEquipmentStats', 'GetEquipmentHistory'],
    onCompleted: () => {
      message.success('הציוד הופעל מחדש בהצלחה');
      enableForm.resetFields();
      refetchHistory().catch(() => undefined);
      onSuccess();
      onClose();
    },
    onError: (error) => {
      message.error(`שגיאה בהפעלת הציוד: ${error.message}`);
    }
  });

  const handleDisable = async (values: any) => {
    await disableEquipment({
      variables: {
        id: equipment?.id,
        reason: values.reason,
        suspensionStatus: values.suspensionStatus || 'under_maintenance'
      }
    });
  };

  const handleEnable = async (values: any) => {
    const notes = (values?.notes || '').trim();
    if (!notes) {
      // Re-enable requires a note describing what changed (fix, calibration,
      // returned from vendor, …) so the audit trail explains *why* the gear
      // is back in service — not just *who* re-enabled it.
      message.error('יש להזין הערה לפני הפעלת הציוד מחדש');
      return;
    }
    await enableEquipment({
      variables: {
        id: equipment?.id,
        notes,
      }
    });
  };

  const handleCancel = () => {
    disableForm.resetFields();
    enableForm.resetFields();
    onClose();
  };

  if (!equipment) return null;

  const renderLog = () => {
    if (historyLoading) {
      return (
        <div className="text-center py-4">
          <Spin size="small" />
        </div>
      );
    }
    if (disableEnableLog.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="אין יומן השבתה/הפעלה לציוד זה"
          style={{ margin: '8px 0' }}
        />
      );
    }
    return (
      <Timeline
        mode="left"
        items={disableEnableLog.map((entry: any) => ({
          color: entry.action === 'disabled' ? 'red' : 'green',
          children: (
            <div>
              <div>
                <Tag color={entry.action === 'disabled' ? 'red' : 'green'}>
                  {entry.action === 'disabled' ? 'הושבת' : 'הופעל'}
                </Tag>
                <span className="text-xs text-gray-500 ml-2">
                  {dayjs(entry.date).format('DD/MM/YYYY HH:mm')}
                </span>
              </div>
              {entry.performedBy && (
                <div className="text-xs text-gray-700 mt-1">
                  ע״י: {entry.performedBy}
                </div>
              )}
              {entry.notes && (
                <div className="text-xs text-gray-600 mt-1" style={{ whiteSpace: 'pre-wrap' }}>
                  {entry.notes}
                </div>
              )}
            </div>
          ),
        }))}
      />
    );
  };

  return (
    <Modal
      title={equipment.isDisabled ? 'הפעלת ציוד מחדש' : 'השבתת ציוד'}
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={560}
      destroyOnHidden
    >
      <div className="mb-4">
        <Alert
          icon={<ExclamationCircleOutlined />}
          message={
            equipment.isDisabled
              ? `הציוד "${equipment.name}" מושבת כעת`
              : `השבתת ציוד "${equipment.name}"`
          }
          description={
            equipment.isDisabled
              ? equipment.disabledReason
              : 'ציוד מושבת לא יהיה זמין להקצאה לאירועים. השבתה משמשת בדרך כלל עבור ציוד בתיקון, תחזוקה או שאינו ראוי לשימוש.'
          }
          type={equipment.isDisabled ? 'info' : 'warning'}
          showIcon
        />
      </div>

      {equipment.quantityAssigned && equipment.quantityAssigned > 0 && !equipment.isDisabled && (
        <Alert
          className="mb-4"
          message="שים לב"
          description={`ישנם ${equipment.quantityAssigned} פריטים מוקצים כעת לאירועים. השבתת הציוד לא תשפיע על הקצאות קיימות.`}
          type="warning"
          showIcon
        />
      )}

      {equipment.isDisabled ? (
        <Form form={enableForm} layout="vertical" onFinish={handleEnable}>
          <Form.Item
            name="notes"
            label="הערה להפעלה מחדש"
            rules={[{ required: true, message: 'נא להזין הערה (לדוגמה: תוקן, נבדק, החזרה מספק)' }]}
            extra="ההערה תישמר ביומן ההשבתה/הפעלה של הציוד."
          >
            <Input.TextArea
              rows={3}
              placeholder="לדוגמה: תוקן ע״י טכנאי | נבדק במחסן | החזרה מהמעבדה"
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={enableLoading}>
                הפעל ציוד
              </Button>
              <Button onClick={handleCancel}>ביטול</Button>
            </Space>
          </Form.Item>
        </Form>
      ) : (
        <Form form={disableForm} layout="vertical" onFinish={handleDisable} initialValues={{ suspensionStatus: 'under_maintenance' }}>
          <Form.Item
            name="suspensionStatus"
            label="סטטוס השעיה"
            rules={[{ required: true, message: 'נא לבחור סטטוס' }]}
          >
            <Select options={SUSPENSION_STATUS_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="reason"
            label="סיבת ההשבתה"
            rules={[{ required: true, message: 'נא להזין סיבה להשבתה' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="לדוגמה: נזק לציוד, תחזוקה תקופתית, בדיקת בטיחות..."
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" danger htmlType="submit" loading={disableLoading}>
                השבת ציוד
              </Button>
              <Button onClick={handleCancel}>ביטול</Button>
            </Space>
          </Form.Item>
        </Form>
      )}

      <Divider orientation="left">
        <Space>
          <HistoryOutlined />
          יומן השבתות והפעלות
        </Space>
      </Divider>
      {renderLog()}
    </Modal>
  );
};

export default EquipmentDisableModal;
