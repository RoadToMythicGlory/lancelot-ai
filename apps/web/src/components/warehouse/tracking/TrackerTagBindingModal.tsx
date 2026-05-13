'use client';

import React, { useState } from 'react';
import { Modal, Form, Input, Select, Button, Alert, Space, Tag, App } from 'antd';
import { WifiOutlined, LinkOutlined, DisconnectOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client';
import {
  REGISTER_TRACKER_TAG,
  BIND_TRACKER_TAG,
  UNBIND_TRACKER_TAG,
} from '../../../graphql/mutations';
import { GET_TRACKER_TAGS } from '../../../graphql/queries';

interface TrackerTagBindingModalProps {
  visible: boolean;
  equipmentId: string;
  equipmentName: string;
  currentTagId?: string;
  currentBleAddress?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const TrackerTagBindingModal: React.FC<TrackerTagBindingModalProps> = ({
  visible,
  equipmentId,
  equipmentName,
  currentTagId,
  currentBleAddress,
  onClose,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [mode, setMode] = useState<'new' | 'existing'>(currentTagId ? 'existing' : 'new');

  const { data: tagsData } = useQuery(GET_TRACKER_TAGS, {
    variables: {},
    skip: mode !== 'existing',
  });
  const unboundTags = (tagsData?.trackerTags || []).filter(
    (t: any) => !t.equipmentId && t.status === 'active',
  );

  const [registerTag, { loading: registerLoading }] = useMutation(REGISTER_TRACKER_TAG);
  const [bindTag, { loading: bindLoading }] = useMutation(BIND_TRACKER_TAG);
  const [unbindTag, { loading: unbindLoading }] = useMutation(UNBIND_TRACKER_TAG);

  const handleRegisterAndBind = async () => {
    try {
      const values = await form.validateFields();
      const bleAddress = values.bleAddress.toUpperCase().trim();

      await registerTag({
        variables: {
          equipmentId,
          bleAddress,
          label: equipmentName,
        },
      });

      message.success(`תגית ${bleAddress} נרשמה וקושרה ל-${equipmentName}`);
      form.resetFields();
      onSuccess();
      onClose();
    } catch (err: any) {
      message.error(err.message || 'שגיאה ברישום התגית');
    }
  };

  const handleBindExisting = async () => {
    try {
      const values = await form.validateFields();
      await bindTag({
        variables: {
          tagId: values.existingTagId,
          equipmentId,
        },
      });
      message.success('התגית קושרה בהצלחה');
      form.resetFields();
      onSuccess();
      onClose();
    } catch (err: any) {
      message.error(err.message || 'שגיאה בקישור התגית');
    }
  };

  const handleUnbind = async () => {
    if (!currentTagId) return;
    try {
      await unbindTag({ variables: { tagId: currentTagId } });
      message.success('התגית נותקה מהציוד');
      onSuccess();
      onClose();
    } catch (err: any) {
      message.error(err.message || 'שגיאה בניתוק התגית');
    }
  };

  return (
    <Modal
      title={
        <Space>
          <WifiOutlined />
          קישור תגית BLE — {equipmentName}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={500}
    >
      {currentTagId && (
        <Alert
          message={`תגית נוכחית: ${currentBleAddress || currentTagId}`}
          type="info"
          showIcon
          className="mb-4"
          action={
            <Button
              size="small"
              danger
              icon={<DisconnectOutlined />}
              onClick={handleUnbind}
              loading={unbindLoading}
            >
              נתק
            </Button>
          }
        />
      )}

      {!currentTagId && (
        <>
          <div className="mb-4">
            <Select
              value={mode}
              onChange={setMode}
              style={{ width: '100%' }}
              options={[
                { label: 'רשום תגית חדשה', value: 'new' },
                { label: 'קשר תגית קיימת', value: 'existing' },
              ]}
            />
          </div>

          <Form form={form} layout="vertical">
            {mode === 'new' ? (
              <>
                <Form.Item
                  name="bleAddress"
                  label="כתובת BLE (MAC)"
                  rules={[
                    { required: true, message: 'יש להזין כתובת BLE' },
                    {
                      pattern: /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$/,
                      message: 'פורמט לא תקין. דוגמה: AC:23:3F:AA:BB:01',
                    },
                  ]}
                  extra="ניתן למצוא את הכתובת על התווית של תגית Minew E8 או באפליקציית הסריקה"
                >
                  <Input
                    placeholder="AC:23:3F:AA:BB:01"
                    style={{ fontFamily: 'monospace' }}
                  />
                </Form.Item>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  onClick={handleRegisterAndBind}
                  loading={registerLoading}
                  block
                >
                  רשום וקשר
                </Button>
              </>
            ) : (
              <>
                <Form.Item
                  name="existingTagId"
                  label="בחר תגית לא מקושרת"
                  rules={[{ required: true, message: 'יש לבחור תגית' }]}
                >
                  <Select
                    placeholder="בחר תגית..."
                    showSearch
                    optionFilterProp="label"
                    options={unboundTags.map((t: any) => ({
                      label: `${t.label} — ${t.bleAddress}`,
                      value: t.id,
                    }))}
                    notFoundContent={
                      unboundTags.length === 0
                        ? 'אין תגיות פנויות. רשום תגית חדשה.'
                        : undefined
                    }
                  />
                </Form.Item>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  onClick={handleBindExisting}
                  loading={bindLoading}
                  block
                >
                  קשר תגית
                </Button>
              </>
            )}
          </Form>
        </>
      )}
    </Modal>
  );
};

export default TrackerTagBindingModal;
