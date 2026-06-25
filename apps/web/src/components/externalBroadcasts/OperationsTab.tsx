'use client';

/**
 * External Broadcasts operations tab.
 *
 * One-stop container for the operational (non-planning, non-people,
 * non-warehouse-request) controls:
 *   - Control-room check status + notes
 *   - Documents (technical / production / line-up / manpower)
 *   - Finance: petty cash, confirmation, invoice
 *   - NEVION auto-request
 *   - LiveU activation
 *   - Fault reports
 *   - Exclude / restore + history
 *
 * All state is persisted into
 * `metadata.departments.externalBroadcasts.customData` via the existing
 * `updateBroadcastEventDepartmentData` mutation. Nothing here mutates
 * planning data, crew assignments, or the warehouse manual request UX.
 */
import React, { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import {
  Card,
  Col,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { GET_EXTERNAL_BROADCAST_REFERENCE } from '@/graphql/queries';
import {
  ApiOutlined,
  DollarOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
  MailOutlined,
  HistoryOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import {
  NevionAutoRequestPanel,
  type NevionRequestState,
} from './NevionAutoRequestPanel';
import {
  LiveUActivationPanel,
  type LiveUActivationState,
  type LiveUKit,
} from './LiveUActivationPanel';
import { FaultReportsPanel } from './FaultReportsPanel';
import { ChangeLogPanel } from './ChangeLogPanel';
import { ExcludeRestorePanel } from './ExcludeRestorePanel';
import {
  CONTROL_CHECK_STATUS_LABEL,
  readControlCheck,
  type ConfirmationStatus,
  type ControlCheckStatus,
  type ExternalBroadcastCustomData,
  type InvoiceStatus,
} from '@/utils/externalBroadcastDomain';

const { Text } = Typography;

interface EquipmentOption {
  id: string;
  name: string;
  barcode?: string | null;
  category?: string | null;
}

interface OperationsTabProps {
  eventId: string;
  customData: ExternalBroadcastCustomData;
  onCustomDataChange: (patch: Partial<ExternalBroadcastCustomData>) => void;
  /** Equipment currently requested on this event — used for the fault picker. */
  equipmentOnEvent: EquipmentOption[];
  /** All LiveU kits in the catalog (filtered by category in the picker). */
  liveuKits: LiveUKit[];
  disabled?: boolean;
  /** Called after the NEVION auto-request mutation finishes so the page can
   *  refresh its equipment list (the auto-generated line is added server-side). */
  onAfterNevionAutoRequest?: () => Promise<void> | void;
}

export const OperationsTab: React.FC<OperationsTabProps> = ({
  eventId,
  customData,
  onCustomDataChange,
  equipmentOnEvent,
  liveuKits,
  disabled,
  onAfterNevionAutoRequest,
}) => {
  // Read either the new `controlCheck` field or the legacy `offtube`
  // field — code that writes always uses `controlCheck`, so any save
  // migrates the row forward without explicit data migration.
  const controlCheck = readControlCheck(customData) || {};
  const documents = customData.documents || {};
  const finance = customData.finance || {};

  // Shared control-rooms list — same source as the Broadcast Array form
  // and the double-broadcast secondary selector.
  const { data: controlRoomsData } = useQuery(GET_EXTERNAL_BROADCAST_REFERENCE, {
    variables: { kind: 'controlRoom', includeInactive: false },
    fetchPolicy: 'cache-first',
  });
  const controlRoomOptions = useMemo(
    () =>
      ((controlRoomsData?.externalBroadcastReference || []) as any[]).map(
        (r) => ({ value: r.name, label: r.name, id: r.id }),
      ),
    [controlRoomsData],
  );

  const docSlots: Array<{ key: keyof typeof documents; label: string }> = [
    { key: 'technical', label: 'מסמך טכני' },
    { key: 'production', label: 'מסמך הפקה' },
    { key: 'lineUp', label: 'Line-up' },
    { key: 'manpower', label: 'כוח אדם' },
  ];

  const liveuOptions = useMemo(
    () => liveuKits.filter((k) => /liveu/i.test(k.name) || /liveu/i.test(k.category || '')),
    [liveuKits],
  );

  const items = [
    {
      key: 'nevion',
      label: (
        <Space>
          <ThunderboltOutlined />
          NEVION
          {customData.nevionRequest?.unresolved && <Tag color="red">לא נמצא</Tag>}
        </Space>
      ),
      children: (
        <NevionAutoRequestPanel
          eventId={eventId}
          value={customData.nevionRequest as NevionRequestState | undefined}
          onChange={(next) => onCustomDataChange({ nevionRequest: next })}
          disabled={disabled}
          onAfterAutoRequest={onAfterNevionAutoRequest}
        />
      ),
    },
    {
      key: 'liveu',
      label: (
        <Space>
          <MailOutlined />
          LiveU
        </Space>
      ),
      children: (
        <LiveUActivationPanel
          eventId={eventId}
          kits={liveuOptions.length > 0 ? liveuOptions : liveuKits}
          value={customData.liveuActivation as LiveUActivationState | undefined}
          onChange={(next) =>
            onCustomDataChange({ liveuActivation: { selectedKitIds: [], selectedInternalIds: [], ...next } })
          }
          disabled={disabled}
        />
      ),
    },
    {
      key: 'controlCheck',
      label: (
        <Space>
          <ApiOutlined />
          בקרה
        </Space>
      ),
      children: (
        <Card size="small" style={{ direction: 'rtl' }}>
          <Row gutter={[16, 12]} align="middle">
            <Col xs={24} md={8}>
              <Text strong>נדרשת בדיקת בקרה</Text>
              <Select
                value={controlCheck.required ? 'yes' : 'no'}
                onChange={(v) =>
                  onCustomDataChange({
                    controlCheck: { ...controlCheck, required: v === 'yes' },
                    // Drop the legacy key on first write so the change log
                    // doesn't keep emitting duplicate "offtube" entries.
                    offtube: undefined,
                  })
                }
                style={{ width: '100%' }}
                options={[
                  { value: 'no', label: 'לא נדרשת' },
                  { value: 'yes', label: 'נדרשת' },
                ]}
                disabled={disabled}
              />
            </Col>
            <Col xs={24} md={8}>
              <Text strong>חדר בקרה</Text>
              <Select
                placeholder="בחר חדר בקרה"
                value={controlCheck.roomName || undefined}
                onChange={(name) => {
                  const match = controlRoomOptions.find((o) => o.value === name);
                  onCustomDataChange({
                    controlCheck: {
                      ...controlCheck,
                      roomName: match?.value,
                      roomId: match?.id,
                    },
                    offtube: undefined,
                  });
                }}
                options={controlRoomOptions}
                showSearch
                optionFilterProp="label"
                allowClear
                style={{ width: '100%' }}
                disabled={disabled || !controlCheck.required}
              />
            </Col>
            <Col xs={24} md={8}>
              <Text strong>סטטוס בדיקה</Text>
              <Select
                value={controlCheck.checkStatus || 'not_checked'}
                onChange={(v) =>
                  onCustomDataChange({
                    controlCheck: {
                      ...controlCheck,
                      checkStatus: v as ControlCheckStatus,
                    },
                    offtube: undefined,
                  })
                }
                style={{ width: '100%' }}
                disabled={disabled || !controlCheck.required}
                options={(Object.keys(CONTROL_CHECK_STATUS_LABEL) as ControlCheckStatus[]).map(
                  (s) => ({ value: s, label: CONTROL_CHECK_STATUS_LABEL[s] }),
                )}
              />
            </Col>
            <Col span={24}>
              <Text strong>הערות</Text>
              <Input.TextArea
                rows={2}
                value={controlCheck.notes || ''}
                onChange={(e) =>
                  onCustomDataChange({
                    controlCheck: { ...controlCheck, notes: e.target.value },
                    offtube: undefined,
                  })
                }
                disabled={disabled || !controlCheck.required}
              />
            </Col>
          </Row>
        </Card>
      ),
    },
    {
      key: 'documents',
      label: (
        <Space>
          <FileTextOutlined />
          מסמכים
        </Space>
      ),
      children: (
        <Card size="small" style={{ direction: 'rtl' }}>
          <Row gutter={[16, 12]}>
            {docSlots.map((slot) => {
              const docs = (documents[slot.key] as any[]) || [];
              return (
                <Col span={12} key={slot.key}>
                  <Text strong>{slot.label}</Text>
                  <Input
                    placeholder={`קישור ל${slot.label} (Drive, OneDrive וכו')`}
                    value={docs[0]?.url || ''}
                    onChange={(e) => {
                      const next = e.target.value
                        ? [
                            {
                              id: docs[0]?.id || `${slot.key}-${Date.now()}`,
                              fileName: docs[0]?.fileName || slot.label,
                              url: e.target.value,
                              uploadedAt:
                                docs[0]?.uploadedAt || new Date().toISOString(),
                            },
                          ]
                        : [];
                      onCustomDataChange({
                        documents: { ...documents, [slot.key]: next },
                      });
                    }}
                    disabled={disabled}
                  />
                  {docs[0]?.uploadedAt && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      עודכן: {new Date(docs[0].uploadedAt).toLocaleString('he-IL')}
                    </Text>
                  )}
                </Col>
              );
            })}
          </Row>
        </Card>
      ),
    },
    {
      key: 'finance',
      label: (
        <Space>
          <DollarOutlined />
          כספים
        </Space>
      ),
      children: (
        <Card size="small" style={{ direction: 'rtl' }}>
          <Row gutter={[16, 12]} align="middle">
            <Col xs={24} md={6}>
              <Text strong>קופה קטנה - דרוש</Text>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                value={finance.pettyCashRequired ?? 0}
                onChange={(v) =>
                  onCustomDataChange({
                    finance: { ...finance, pettyCashRequired: Number(v) || 0 },
                  })
                }
                disabled={disabled}
              />
            </Col>
            <Col xs={24} md={6}>
              <Text strong>קופה קטנה - הוחזר</Text>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                value={finance.pettyCashReturned ?? 0}
                onChange={(v) =>
                  onCustomDataChange({
                    finance: { ...finance, pettyCashReturned: Number(v) || 0 },
                  })
                }
                disabled={disabled}
              />
            </Col>
            <Col xs={24} md={6}>
              <Text strong>סטטוס אישור</Text>
              <Select
                style={{ width: '100%' }}
                value={finance.confirmationStatus || 'pending'}
                onChange={(v) =>
                  onCustomDataChange({
                    finance: {
                      ...finance,
                      confirmationStatus: v as ConfirmationStatus,
                    },
                  })
                }
                options={[
                  { value: 'pending', label: 'ממתין' },
                  { value: 'confirmed', label: 'מאושר' },
                  { value: 'rejected', label: 'נדחה' },
                ]}
                disabled={disabled}
              />
            </Col>
            <Col xs={24} md={6}>
              <Text strong>סטטוס חשבונית</Text>
              <Select
                style={{ width: '100%' }}
                value={finance.invoiceStatus || 'not_required'}
                onChange={(v) =>
                  onCustomDataChange({
                    finance: { ...finance, invoiceStatus: v as InvoiceStatus },
                  })
                }
                options={[
                  { value: 'not_required', label: 'לא נדרשת' },
                  { value: 'pending', label: 'ממתינה' },
                  { value: 'approved', label: 'מאושרת' },
                  { value: 'paid', label: 'שולמה' },
                ]}
                disabled={disabled}
              />
            </Col>
            <Col span={24}>
              <Text strong>הערות</Text>
              <Input.TextArea
                rows={2}
                value={finance.notes || ''}
                onChange={(e) =>
                  onCustomDataChange({
                    finance: { ...finance, notes: e.target.value },
                  })
                }
                disabled={disabled}
              />
            </Col>
          </Row>
        </Card>
      ),
    },
    {
      key: 'faults',
      label: (
        <Space>
          <ExclamationCircleOutlined />
          תקלות
        </Space>
      ),
      children: (
        <FaultReportsPanel
          eventId={eventId}
          equipmentOptions={equipmentOnEvent}
          disabled={disabled}
        />
      ),
    },
    {
      key: 'exclude',
      label: (
        <Space>
          <DeleteOutlined />
          הוצא / החזר
        </Space>
      ),
      children: (
        <ExcludeRestorePanel
          excluded={!!customData.excludedFromOperations}
          excludedAt={customData.excludedAt}
          excludedByName={customData.excludedByName}
          excludeReason={customData.excludeReason}
          disabled={disabled}
          onChange={(next) => onCustomDataChange(next as any)}
        />
      ),
    },
    {
      key: 'history',
      label: (
        <Space>
          <HistoryOutlined />
          היסטוריה
        </Space>
      ),
      children: <ChangeLogPanel eventId={eventId} />,
    },
  ];

  return <Tabs items={items} />;
};
