'use client';

/**
 * NEVION auto-request panel.
 *
 * UX:
 *   - When the operator marks an event as a multi-broadcast (i.e. enables
 *     the panel), they set the required camera count.
 *   - Hitting "Auto-request" calls the `autoRequestNevion` mutation, which
 *     adds (or replaces) a single system-generated equipment line for the
 *     smallest NEVION with capacity >= required count, while excluding
 *     any NEVION already auto-selected on the same calendar day.
 *
 * The panel never edits the manual equipment request UX — it only adds an
 * additional line whose `generatedBy` flag is `nevion-auto`.
 */
import React, { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  InputNumber,
  Row,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { useMutation } from '@apollo/client';
import { ThunderboltOutlined } from '@ant-design/icons';
import { AUTO_REQUEST_NEVION } from '@/graphql/mutations';

const { Text } = Typography;

export interface NevionRequestState {
  enabled?: boolean;
  requiredCameraCount?: number;
  selectedEquipmentId?: string;
  selectedEquipmentName?: string;
  selectedCapacity?: number;
  unresolved?: boolean;
}

interface NevionAutoRequestPanelProps {
  eventId: string;
  value: NevionRequestState | undefined;
  onChange: (next: NevionRequestState) => void;
  disabled?: boolean;
  onAfterAutoRequest?: () => void | Promise<void>;
}

export const NevionAutoRequestPanel: React.FC<NevionAutoRequestPanelProps> = ({
  eventId,
  value,
  onChange,
  disabled,
  onAfterAutoRequest,
}) => {
  const { message: messageApi } = App.useApp();
  const [autoRequest, { loading }] = useMutation(AUTO_REQUEST_NEVION);
  const [requiredCameraCount, setRequiredCameraCount] = useState<number>(
    value?.requiredCameraCount && value.requiredCameraCount > 0
      ? value.requiredCameraCount
      : 4,
  );

  const handleRun = async () => {
    if (!eventId) return;
    if (!requiredCameraCount || requiredCameraCount < 1) {
      messageApi.warning('נא להגדיר מספר מצלמות חיובי');
      return;
    }
    try {
      const res = await autoRequest({
        variables: { eventId, requiredCameraCount },
      });
      const result = res.data?.autoRequestNevion;
      if (!result) return;
      onChange({
        enabled: true,
        requiredCameraCount,
        selectedEquipmentId: result.selectedEquipmentId || undefined,
        selectedEquipmentName: result.selectedEquipmentName || undefined,
        selectedCapacity: result.selectedCapacity || undefined,
        unresolved: !!result.unresolved,
      });
      if (result.unresolved) {
        messageApi.warning(result.message || 'לא נמצא NEVION פנוי מתאים');
      } else {
        messageApi.success(result.message || 'NEVION נבחר אוטומטית');
      }
      if (onAfterAutoRequest) await onAfterAutoRequest();
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
          <ThunderboltOutlined />
          <Text strong>בקשת NEVION אוטומטית (מולטי-מצלמה)</Text>
          {value?.unresolved && <Tag color="red">לא נמצא NEVION</Tag>}
          {value?.selectedEquipmentName && !value?.unresolved && (
            <Tag color="green">
              {value.selectedEquipmentName}
              {value.selectedCapacity ? ` · ${value.selectedCapacity} מצלמות` : ''}
            </Tag>
          )}
        </Space>
      }
    >
      <Row gutter={[12, 12]} align="middle">
        <Col>
          <Space>
            <Text>שידור מולטי:</Text>
            <Switch
              checked={!!value?.enabled}
              onChange={(v) =>
                onChange({
                  ...(value || {}),
                  enabled: v,
                  requiredCameraCount: v
                    ? value?.requiredCameraCount || requiredCameraCount
                    : value?.requiredCameraCount,
                })
              }
              disabled={disabled}
              checkedChildren="פעיל"
              unCheckedChildren="כבוי"
            />
          </Space>
        </Col>
        {value?.enabled && (
          <>
            <Col>
              <Space>
                <Text>מספר מצלמות נדרש:</Text>
                <InputNumber
                  min={1}
                  max={64}
                  value={requiredCameraCount}
                  onChange={(v) => setRequiredCameraCount(Number(v) || 1)}
                  disabled={disabled}
                />
              </Space>
            </Col>
            <Col>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={loading}
                onClick={handleRun}
                disabled={disabled}
              >
                בקש NEVION אוטומטית
              </Button>
            </Col>
          </>
        )}
      </Row>

      {value?.enabled && value?.selectedEquipmentName && !value?.unresolved && (
        <Alert
          style={{ marginTop: 12 }}
          type="success"
          showIcon
          message={
            <span>
              נבחר: <Text strong>{value.selectedEquipmentName}</Text> (קיבולת{' '}
              {value.selectedCapacity || '?'} מצלמות). פריט זה נוסף לרשימת
              הציוד הנדרש בשם <Text code>nevion-auto</Text>.
            </span>
          }
        />
      )}
      {value?.enabled && value?.unresolved && (
        <Alert
          style={{ marginTop: 12 }}
          type="error"
          showIcon
          message="לא נמצא NEVION פנוי שמספק את הקיבולת הנדרשת"
          description={
            <span>
              נסה להזמין NEVION ידנית מהמחסן או לעדכן את קיבולת המכשירים
              במלאי. המערכת לעולם לא תבחר NEVION עם קיבולת קטנה מהנדרש.
            </span>
          }
        />
      )}
      {!value?.enabled && (
        <Empty
          description="הפעל את שידור המולטי כדי לבקש NEVION אוטומטית"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 8 }}
        />
      )}
    </Card>
  );
};
