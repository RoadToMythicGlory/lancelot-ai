import React from 'react';
import { Modal, Form, Input, Space, Button, Alert, App } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useMutation } from '@apollo/client';
import { DISABLE_EQUIPMENT, ENABLE_EQUIPMENT } from '../../graphql/mutations';

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
  const [form] = Form.useForm();
  const { message } = App.useApp();

  const [disableEquipment] = useMutation(DISABLE_EQUIPMENT, {
    onCompleted: () => {
      message.success('הציוד הושבת בהצלחה');
      form.resetFields();
      onSuccess();
      onClose();
    },
    onError: (error) => {
      message.error(`שגיאה בהשבתת הציוד: ${error.message}`);
    }
  });

  const [enableEquipment] = useMutation(ENABLE_EQUIPMENT, {
    onCompleted: () => {
      message.success('הציוד הופעל מחדש בהצלחה');
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
        reason: values.reason
      }
    });
  };

  const handleEnable = async () => {
    await enableEquipment({
      variables: {
        id: equipment?.id
      }
    });
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  if (!equipment) return null;

  return (
    <Modal
      title={equipment.isDisabled ? 'הפעלת ציוד מחדש' : 'השבתת ציוד'}
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={500}
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
        <div className="text-center py-4">
          <p className="mb-4">האם ברצונך להפעיל מחדש את הציוד?</p>
          <Space>
            <Button type="primary" onClick={handleEnable}>
              הפעל ציוד
            </Button>
            <Button onClick={handleCancel}>ביטול</Button>
          </Space>
        </div>
      ) : (
        <Form form={form} layout="vertical" onFinish={handleDisable}>
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
              <Button type="primary" danger htmlType="submit">
                השבת ציוד
              </Button>
              <Button onClick={handleCancel}>ביטול</Button>
            </Space>
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
};

export default EquipmentDisableModal;
