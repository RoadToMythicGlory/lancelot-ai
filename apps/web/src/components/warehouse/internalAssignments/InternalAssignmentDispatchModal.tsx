import React, { useState } from 'react';
import { Modal, Form, Input, InputNumber, Button, Space, App, Alert, Tag, Card } from 'antd';
import { ScanOutlined, InboxOutlined } from '@ant-design/icons';
import { useLazyQuery, useMutation } from '@apollo/client';
import { GET_WAREHOUSE_EQUIPMENT, GET_INTERNAL_EQUIPMENT_ASSIGNMENTS } from '../../../graphql/queries';
import { ASSIGN_EQUIPMENT_TO_WORKER } from '../../../graphql/mutations';
import WorkerPicker, { WorkerPickerType } from './WorkerPicker';

interface Equipment {
  id: string;
  name: string;
  category: string;
  barcode: string;
  quantityAvailable: number;
  quantityTotal: number;
  quantityAssigned: number;
  isDisabled: boolean;
  isQuantityBased: boolean;
}

const createScannedEquipmentFallback = (barcode: string): Equipment => ({
  id: '',
  name: barcode,
  category: '',
  barcode,
  quantityAvailable: 999,
  quantityTotal: 999,
  quantityAssigned: 0,
  isDisabled: false,
  isQuantityBased: false,
});

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const InternalAssignmentDispatchModal: React.FC<Props> = ({ visible, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [scanInput, setScanInput] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);

  const workerType = (Form.useWatch('workerType', form) as WorkerPickerType) || 'internal';

  const [lookupEquipment, { loading: lookingUpEquipment }] = useLazyQuery(GET_WAREHOUSE_EQUIPMENT, {
    fetchPolicy: 'network-only',
  });

  const [dispatchMutation, { loading: submitting }] = useMutation(ASSIGN_EQUIPMENT_TO_WORKER, {
    refetchQueries: [
      { query: GET_INTERNAL_EQUIPMENT_ASSIGNMENTS, variables: { status: 'active' } },
      'GetWarehouseEquipment',
      'GetEquipmentHistory',
    ],
    awaitRefetchQueries: true,
  });

  const handleScan = async () => {
    const barcode = scanInput.trim();
    if (!barcode) return;

    let eq: Equipment | undefined;
    try {
      const result = await lookupEquipment({
        variables: {
          filter: { searchText: barcode },
          limit: 20,
          offset: 0,
        },
      });
      eq = (result.data?.warehouseEquipment || []).find(
        (item: Equipment) => item.barcode?.toLowerCase() === barcode.toLowerCase(),
      );
    } catch {
      // The mutation can resolve by barcode directly, so a lookup failure should
      // not block dispatching valid equipment that exists outside this page cache.
    }

    if (!eq) {
      eq = createScannedEquipmentFallback(barcode);
    }
    if (eq.isDisabled) {
      message.error(`הציוד "${eq.name}" מושבת ואינו זמין להקצאה`);
      return;
    }
    if (eq.quantityAvailable <= 0) {
      message.warning(`לא נותרו יחידות זמינות עבור "${eq.name}"`);
      return;
    }
    setSelectedEquipment(eq);
    setScanInput('');
    // Reset the quantity field to a sensible default whenever a new piece
    // of equipment is locked in.
    form.setFieldsValue({ quantityAssigned: 1 });
  };

  const handleClose = () => {
    form.resetFields();
    setSelectedEquipment(null);
    setScanInput('');
    onClose();
  };

  const handleSubmit = async (values: any) => {
    if (!selectedEquipment) {
      message.error('יש לסרוק או להזין ברקוד ציוד תחילה');
      return;
    }

    const quantity = Number(values.quantityAssigned) || 1;
    if (quantity > selectedEquipment.quantityAvailable) {
      message.error(
        `נדרשו ${quantity} יחידות, אך זמינות רק ${selectedEquipment.quantityAvailable}`,
      );
      return;
    }

    try {
      await dispatchMutation({
        variables: {
          input: {
            equipmentId: selectedEquipment.id || null,
            barcode: selectedEquipment.barcode,
            quantityAssigned: quantity,
            assignedToUserId: values.workerType === 'internal' ? values.assignedToUserId : null,
            assignedToExternalName:
              values.workerType === 'external'
                ? String(values.assignedToExternalName || '').trim()
                : null,
            assignedToPhone: values.assignedToPhone || null,
            notes: values.notes || null,
          },
        },
      });
      message.success('הציוד הוקצה בהצלחה');
      onSuccess();
      handleClose();
    } catch (err: any) {
      message.error(err?.message || 'שגיאה בהקצאת הציוד');
    }
  };

  return (
    <Modal
      title={
        <Space>
          <InboxOutlined />
          הקצאת ציוד פנימית
        </Space>
      }
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={640}
      destroyOnHidden
      style={{ direction: 'rtl' }}
    >
      <Alert
        type="info"
        showIcon
        className="mb-4"
        message="הקצאה פנימית"
        description="הקצאת ציוד לעובד (פנימי או חיצוני). הציוד יישאר רשום כמוקצה עד שיוחזר במסך זה."
      />

      <div className="mb-4 flex gap-2">
        <Input
          placeholder="סרוק ברקוד ציוד"
          prefix={<ScanOutlined />}
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onPressEnter={handleScan}
          allowClear
          autoFocus
        />
        <Button type="primary" onClick={handleScan} loading={lookingUpEquipment}>
          סרוק
        </Button>
      </div>

      {selectedEquipment ? (
        <Card size="small" className="mb-4">
          <div className="flex justify-between items-start">
            <div>
              <strong className="text-base">{selectedEquipment.name}</strong>
              <div className="mt-1">
                {selectedEquipment.category && <Tag color="blue">{selectedEquipment.category}</Tag>}
                <code className="text-xs bg-gray-100 px-2 py-1 rounded ml-2">
                  {selectedEquipment.barcode}
                </code>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {selectedEquipment.id
                  ? `זמין: ${selectedEquipment.quantityAvailable}/${selectedEquipment.quantityTotal}`
                  : 'האימות הסופי יתבצע מול מסד הנתונים בעת ההקצאה'}
              </div>
            </div>
            <Button size="small" onClick={() => setSelectedEquipment(null)}>
              החלף ציוד
            </Button>
          </div>
        </Card>
      ) : (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message="לא נבחר ציוד"
          description="סרוק ברקוד ציוד כדי להתחיל בהקצאה."
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ workerType: 'internal', quantityAssigned: 1 }}
        disabled={!selectedEquipment}
      >
        <Form.Item
          name="quantityAssigned"
          label="כמות"
          rules={[{ required: true, message: 'נא להזין כמות' }]}
        >
          <InputNumber
            min={1}
            max={selectedEquipment?.quantityAvailable || 999}
            style={{ width: 160 }}
          />
        </Form.Item>

        <WorkerPicker type={workerType} />

        <Form.Item name="notes" label="הערות (אופציונלי)">
          <Input.TextArea
            rows={2}
            placeholder="לדוגמה: לצורך אירוע X | להחזיר עד יום ה׳"
          />
        </Form.Item>

        <Form.Item className="text-left">
          <Space>
            <Button onClick={handleClose}>ביטול</Button>
            <Button type="primary" htmlType="submit" loading={submitting} disabled={!selectedEquipment || lookingUpEquipment}>
              הקצה ציוד
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default InternalAssignmentDispatchModal;
