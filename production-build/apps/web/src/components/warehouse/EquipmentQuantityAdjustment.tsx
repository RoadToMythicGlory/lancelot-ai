import React, { useState } from 'react';
import { Modal, Form, InputNumber, Input, Space, Button, App } from 'antd';
import { PlusOutlined, MinusOutlined } from '@ant-design/icons';
import { useMutation } from '@apollo/client';
import { ADJUST_EQUIPMENT_QUANTITY } from '../../graphql/mutations';

interface EquipmentQuantityAdjustmentProps {
  visible: boolean;
  equipment: {
    id: string;
    name: string;
    quantityTotal: number;
    quantityAvailable: number;
    quantityAssigned: number;
  } | null;
  onClose: () => void;
  onSuccess: () => void;
}

const EquipmentQuantityAdjustment: React.FC<EquipmentQuantityAdjustmentProps> = ({
  visible,
  equipment,
  onClose,
  onSuccess
}) => {
  const [form] = Form.useForm();
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'remove'>('add');
  const { message } = App.useApp();

  const [adjustQuantity] = useMutation(ADJUST_EQUIPMENT_QUANTITY, {
    onCompleted: () => {
      message.success('כמות הציוד עודכנה בהצלחה');
      form.resetFields();
      onSuccess();
      onClose();
    },
    onError: (error) => {
      message.error(`שגיאה בעדכון כמות: ${error.message}`);
    }
  });

  const handleSubmit = async (values: any) => {
    const adjustment = adjustmentType === 'add' ? values.quantity : -values.quantity;
    
    await adjustQuantity({
      variables: {
        id: equipment?.id,
        adjustment,
        reason: values.reason
      }
    });
  };

  const handleCancel = () => {
    form.resetFields();
    setAdjustmentType('add');
    onClose();
  };

  return (
    <Modal
      title={`התאמת כמות - ${equipment?.name}`}
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={500}
    >
      {equipment && (
        <div className="mb-4 p-3 bg-gray-100 rounded">
          <div className="flex justify-between mb-2">
            <span>כמות כוללת נוכחית:</span>
            <strong>{equipment.quantityTotal}</strong>
          </div>
          <div className="flex justify-between mb-2">
            <span>כמות זמינה:</span>
            <strong>{equipment.quantityAvailable}</strong>
          </div>
          <div className="flex justify-between">
            <span>כמות מוקצית:</span>
            <strong>{equipment.quantityAssigned}</strong>
          </div>
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ quantity: 1 }}
      >
        <Form.Item label="סוג התאמה">
          <Space>
            <Button
              type={adjustmentType === 'add' ? 'primary' : 'default'}
              icon={<PlusOutlined />}
              onClick={() => setAdjustmentType('add')}
            >
              הוספת כמות
            </Button>
            <Button
              type={adjustmentType === 'remove' ? 'primary' : 'default'}
              icon={<MinusOutlined />}
              onClick={() => setAdjustmentType('remove')}
              danger={adjustmentType === 'remove'}
            >
              הפחתת כמות
            </Button>
          </Space>
        </Form.Item>

        <Form.Item
          name="quantity"
          label="כמות"
          rules={[
            { required: true, message: 'נא להזין כמות' },
            { type: 'number', min: 1, message: 'הכמות חייבת להיות גדולה מ-0' },
            {
              validator: (_, value) => {
                if (adjustmentType === 'remove' && value > equipment!.quantityTotal) {
                  return Promise.reject('לא ניתן להפחית יותר מהכמות הכוללת');
                }
                return Promise.resolve();
              }
            }
          ]}
        >
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="reason"
          label="סיבת ההתאמה"
          rules={[{ required: true, message: 'נא להזין סיבה להתאמה' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder="לדוגמה: רכישת ציוד חדש, ציוד שנפגם, טעות בספירה..."
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              {adjustmentType === 'add' ? 'הוסף כמות' : 'הפחת כמות'}
            </Button>
            <Button onClick={handleCancel}>ביטול</Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EquipmentQuantityAdjustment;
