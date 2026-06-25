'use client';

/**
 * LiveU activation panel.
 *
 * The operator can:
 *   - Select one or more LiveU kits by `liveuInternalId` (not by barcode).
 *   - Type a recipient email and trigger an activation request. The
 *     backend resolves each selected kit's `liveuInternalId` and emails
 *     the request to the recipient. The warehouse allocation is unaffected.
 *
 * Surfaces a clear warning when no kits have an internal ID configured so
 * the operator knows to update the equipment record first.
 */
import React, { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useMutation } from '@apollo/client';
import { MailOutlined } from '@ant-design/icons';
import { SEND_LIVEU_ACTIVATION_REQUEST } from '@/graphql/mutations';

const { Text } = Typography;

export interface LiveUKit {
  id: string;
  name: string;
  barcode?: string | null;
  liveuInternalId?: string | null;
  category?: string | null;
}

export interface LiveUActivationState {
  selectedKitIds?: string[];
  selectedInternalIds?: string[];
  lastEmailSentAt?: string;
  lastEmailSentByName?: string;
}

interface LiveUActivationPanelProps {
  eventId: string;
  kits: LiveUKit[];
  value: LiveUActivationState | undefined;
  onChange: (next: LiveUActivationState) => void;
  disabled?: boolean;
}

export const LiveUActivationPanel: React.FC<LiveUActivationPanelProps> = ({
  eventId,
  kits,
  value,
  onChange,
  disabled,
}) => {
  const { message: messageApi } = App.useApp();
  const [sendActivation, { loading }] = useMutation(SEND_LIVEU_ACTIVATION_REQUEST);
  const [recipient, setRecipient] = useState<string>('');
  const [extraNotes, setExtraNotes] = useState<string>('');

  const liveuOptions = useMemo(
    () =>
      kits.map((k) => ({
        value: k.id,
        label: `${k.name}${
          k.liveuInternalId ? ` · ת.ז. ${k.liveuInternalId}` : ' · (אין ת.ז.)'
        }${k.barcode ? ` · ${k.barcode}` : ''}`,
        disabled: !k.liveuInternalId,
      })),
    [kits],
  );

  const selectedKits = useMemo(
    () =>
      kits.filter((k) =>
        (value?.selectedKitIds || []).includes(k.id),
      ),
    [kits, value?.selectedKitIds],
  );
  const missingInternalIds = selectedKits.filter((k) => !k.liveuInternalId);

  const handleSend = async () => {
    if (!eventId) return;
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      messageApi.warning('נא להזין כתובת אימייל תקינה');
      return;
    }
    const ids = value?.selectedKitIds || [];
    if (ids.length === 0) {
      messageApi.warning('יש לבחור לפחות ערכת LiveU אחת');
      return;
    }
    try {
      const res = await sendActivation({
        variables: {
          eventId,
          recipient,
          kitEquipmentIds: ids,
          extraNotes: extraNotes || null,
        },
      });
      const r = res.data?.sendLiveUActivationRequest;
      if (!r) return;
      if (r.success) {
        messageApi.success(r.message || 'המייל נשלח בהצלחה');
        onChange({
          ...(value || {}),
          selectedKitIds: ids,
          selectedInternalIds: r.internalIds || [],
          lastEmailSentAt: new Date().toISOString(),
        });
      } else {
        messageApi.warning(r.message || 'שליחת המייל נכשלה');
      }
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
          <MailOutlined />
          <Text strong>בקשת הפעלת LiveU</Text>
          {value?.lastEmailSentAt && (
            <Tag color="green">
              נשלח לאחרונה: {new Date(value.lastEmailSentAt).toLocaleString('he-IL')}
            </Tag>
          )}
        </Space>
      }
    >
      <Form layout="vertical">
        <Row gutter={12}>
          <Col span={24}>
            <Form.Item label="ערכות LiveU מבוקשות">
              <Select
                mode="multiple"
                placeholder="בחר ערכות לפי תעודת זהות פנימית"
                value={value?.selectedKitIds || []}
                onChange={(ids) =>
                  onChange({
                    ...(value || {}),
                    selectedKitIds: ids,
                  })
                }
                options={liveuOptions}
                disabled={disabled}
                style={{ width: '100%' }}
                optionFilterProp="label"
                showSearch
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="נמען (אימייל ספק LiveU)">
              <Input
                type="email"
                placeholder="liveu-contact@example.com"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={disabled}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="הערות נוספות (אופציונלי)">
              <Input
                placeholder="הערות שתופיע במייל"
                value={extraNotes}
                onChange={(e) => setExtraNotes(e.target.value)}
                disabled={disabled}
              />
            </Form.Item>
          </Col>
        </Row>

        {missingInternalIds.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="חלק מהערכות הנבחרות חסרות תעודת זהות פנימית של LiveU"
            description={
              <Space wrap>
                {missingInternalIds.map((k) => (
                  <Tag key={k.id} color="orange">
                    {k.name}
                  </Tag>
                ))}
              </Space>
            }
          />
        )}

        <Button
          type="primary"
          icon={<MailOutlined />}
          loading={loading}
          onClick={handleSend}
          disabled={disabled}
        >
          שלח בקשת הפעלה
        </Button>
      </Form>
    </Card>
  );
};
