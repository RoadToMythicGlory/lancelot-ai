import React from 'react';
import { Modal, Form, Input, Button, Space, App, Alert, Tag, Card } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import { useMutation } from '@apollo/client';
import dayjs from 'dayjs';
import { GET_INTERNAL_EQUIPMENT_ASSIGNMENTS } from '../../../graphql/queries';
import { TRANSFER_INTERNAL_EQUIPMENT_ASSIGNMENT } from '../../../graphql/mutations';
import WorkerPicker, { WorkerPickerType } from './WorkerPicker';

interface AssignmentSummary {
  id: string;
  assignedToName: string;
  assignedAt: string;
  quantityAssigned: number;
  equipment?: {
    id: string;
    name: string;
    barcode: string;
    category: string;
  } | null;
}

interface Props {
  visible: boolean;
  assignment: AssignmentSummary | null;
  onClose: () => void;
  onSuccess: () => void;
}

const InternalAssignmentTransferModal: React.FC<Props> = ({
  visible,
  assignment,
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const workerType = (Form.useWatch('workerType', form) as WorkerPickerType) || 'internal';

  const [transferMutation, { loading: submitting }] = useMutation(
    TRANSFER_INTERNAL_EQUIPMENT_ASSIGNMENT,
    {
      refetchQueries: [
        { query: GET_INTERNAL_EQUIPMENT_ASSIGNMENTS, variables: { status: 'active' } },
        'GetEquipmentHistory',
      ],
      awaitRefetchQueries: true,
    },
  );

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  const handleSubmit = async (values: any) => {
    if (!assignment) return;
    try {
      await transferMutation({
        variables: {
          input: {
            assignmentId: assignment.id,
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
      message.success('הציוד הועבר בהצלחה');
      onSuccess();
      handleClose();
    } catch (err: any) {
      message.error(err?.message || 'שגיאה בהעברת הציוד');
    }
  };

  return (
    <Modal
      title={
        <Space>
          <SwapOutlined />
          העברת ציוד לעובד אחר
        </Space>
      }
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={600}
      destroyOnHidden
      style={{ direction: 'rtl' }}
    >
      {assignment && (
        <>
          <Alert
            type="info"
            showIcon
            className="mb-4"
            message="העברת הקצאה פעילה"
            description="הציוד יישאר רשום כמוקצה — רק העובד שאליו הוא שייך ישתנה. ההעברה תתועד ביומן ההיסטוריה."
          />

          <Card size="small" className="mb-4">
            <div className="flex justify-between items-start">
              <div>
                <strong>{assignment.equipment?.name || 'ציוד'}</strong>
                <div className="mt-1">
                  {assignment.equipment?.category && (
                    <Tag color="blue">{assignment.equipment.category}</Tag>
                  )}
                  {assignment.equipment?.barcode && (
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded ml-2">
                      {assignment.equipment.barcode}
                    </code>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  מוקצה כעת ל-<strong>{assignment.assignedToName}</strong>
                </div>
                <div className="text-xs text-gray-500">
                  מאז: {dayjs(assignment.assignedAt).format('DD/MM/YYYY HH:mm')} • כמות:{' '}
                  {assignment.quantityAssigned}
                </div>
              </div>
            </div>
          </Card>

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            initialValues={{ workerType: 'internal' }}
          >
            <WorkerPicker type={workerType} />

            <Form.Item name="notes" label="הערות להעברה (אופציונלי)">
              <Input.TextArea rows={2} placeholder="לדוגמה: החלפת משמרת | העברה לעובד נוסף" />
            </Form.Item>

            <Form.Item className="text-left">
              <Space>
                <Button onClick={handleClose}>ביטול</Button>
                <Button type="primary" htmlType="submit" loading={submitting} icon={<SwapOutlined />}>
                  העבר ציוד
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
};

export default InternalAssignmentTransferModal;
