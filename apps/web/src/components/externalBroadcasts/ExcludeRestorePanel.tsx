'use client';

/**
 * Operational exclude / restore panel.
 *
 * Adapts the legacy delete/restore workflow into an operations-level
 * inclusion toggle. The underlying broadcast event is NEVER deleted — we
 * only set `customData.excludedFromOperations` so it disappears from the
 * External Broadcasts operations page. Restoring is just unsetting the
 * flag. Both transitions are recorded in the change log.
 */
import React, { useState } from 'react';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, UndoOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface ExcludeRestorePanelProps {
  excluded: boolean;
  excludedAt?: string;
  excludedByName?: string;
  excludeReason?: string;
  disabled?: boolean;
  onChange: (next: {
    excludedFromOperations: boolean;
    excludeReason?: string;
    excludedAt?: string;
  }) => void;
}

export const ExcludeRestorePanel: React.FC<ExcludeRestorePanelProps> = ({
  excluded,
  excludedAt,
  excludedByName,
  excludeReason,
  disabled,
  onChange,
}) => {
  const { modal } = App.useApp();
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [form] = Form.useForm();

  const handleExclude = async () => {
    try {
      const values = await form.validateFields();
      onChange({
        excludedFromOperations: true,
        excludeReason: values.reason,
        excludedAt: new Date().toISOString(),
      });
      setExcludeOpen(false);
      form.resetFields();
    } catch {
      // validation error — keep the modal open
    }
  };

  const handleRestore = () => {
    modal.confirm({
      title: 'להחזיר את השידור לשידורי חוץ?',
      content: 'השידור יופיע שוב בדף הפעולות.',
      okText: 'החזר',
      cancelText: 'ביטול',
      onOk: () => {
        onChange({
          excludedFromOperations: false,
          excludeReason: undefined,
          excludedAt: undefined,
        });
      },
    });
  };

  return (
    <Card size="small" style={{ direction: 'rtl' }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space>
          <Text strong>סטטוס תפעולי בשידורי חוץ:</Text>
          {excluded ? (
            <Tag color="orange">מוצא משידורי חוץ</Tag>
          ) : (
            <Tag color="green">כלול בשידורי חוץ</Tag>
          )}
        </Space>
        {excluded && excludedByName && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            הוצא ע"י {excludedByName}{' '}
            {excludedAt
              ? `בתאריך ${new Date(excludedAt).toLocaleString('he-IL')}`
              : ''}
            {excludeReason ? ` · סיבה: ${excludeReason}` : ''}
          </Text>
        )}
        <Text type="secondary" style={{ fontSize: 12 }}>
          הערה: אופציה זו אינה מוחקת את אירוע השידור — היא רק מסתירה אותו
          מדף הפעולות של שידורי חוץ. אירוע השידור ממשיך להתקיים בתכנונית.
        </Text>
        <Space>
          {!excluded ? (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => setExcludeOpen(true)}
              disabled={disabled}
            >
              הוצא משידורי חוץ
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<UndoOutlined />}
              onClick={handleRestore}
              disabled={disabled}
            >
              החזר לשידורי חוץ
            </Button>
          )}
        </Space>
      </Space>

      <Modal
        title="הוצאת שידור משידורי חוץ"
        open={excludeOpen}
        onCancel={() => {
          setExcludeOpen(false);
          form.resetFields();
        }}
        onOk={handleExclude}
        okText="הוצא"
        cancelText="ביטול"
        okButtonProps={{ danger: true }}
      >
        <Text type="secondary">
          השידור יוסר מדף הפעולות של שידורי חוץ. אירוע השידור עצמו לא יימחק
          מהתכנונית.
        </Text>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            label="סיבת הוצאה"
            name="reason"
            rules={[{ required: true, message: 'נא להזין סיבה' }]}
          >
            <Input.TextArea rows={3} placeholder="פרט את הסיבה" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
