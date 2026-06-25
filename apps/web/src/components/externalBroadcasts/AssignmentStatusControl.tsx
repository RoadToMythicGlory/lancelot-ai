'use client';

/**
 * Assignment status + double-broadcast controls.
 *
 * Renders inside the External Broadcasts event editor below the event-info
 * strip. The values write into
 * `metadata.departments.externalBroadcasts.customData` via the existing
 * `updateBroadcastEventDepartmentData` mutation — no planning fields are
 * touched.
 *
 * Visual rules (per product):
 *   - `live`     → no row tint (default day-of-week shade applies).
 *   - `paused`   → yellow (#fef9c3).
 *   - `postponed`→ light green (#dcfce7).
 *   - `cancelled`→ red (#fee2e2).
 */
import React, { useMemo } from 'react';
import { Card, Col, Radio, Row, Select, Space, Switch, Tag, Typography } from 'antd';
import { useQuery } from '@apollo/client';
import { GET_EXTERNAL_BROADCAST_REFERENCE } from '@/graphql/queries';
import {
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_STATUS_TAG_COLOR,
  type ExternalBroadcastAssignmentStatus,
} from '@/utils/externalBroadcastDomain';

const { Text } = Typography;

interface AssignmentStatusControlProps {
  status: ExternalBroadcastAssignmentStatus;
  isDoubleBroadcast: boolean;
  /** Secondary control room *name* — we persist the name so reports/views
   * keep showing the correct value even if the row is later renamed. */
  secondaryControlRoomName?: string;
  /** Primary control room name — filtered out of the secondary picker
   * so the operator can't pick the same room twice. */
  primaryControlRoomName?: string | null;
  disabled?: boolean;
  /** Render compact, borderless content (no Card wrapper) so it can be
   * embedded inside a shared single-row toolbar. */
  inline?: boolean;
  onStatusChange: (next: ExternalBroadcastAssignmentStatus) => void;
  onDoubleBroadcastChange: (next: boolean) => void;
  onSecondaryControlRoomChange: (next: { id: string; name: string } | null) => void;
}

const STATUS_OPTIONS: ExternalBroadcastAssignmentStatus[] = [
  'live',
  'paused',
  'postponed',
  'cancelled',
];

export const AssignmentStatusControl: React.FC<AssignmentStatusControlProps> = ({
  status,
  isDoubleBroadcast,
  secondaryControlRoomName,
  primaryControlRoomName,
  disabled,
  inline,
  onStatusChange,
  onDoubleBroadcastChange,
  onSecondaryControlRoomChange,
}) => {
  // Pull the shared control-rooms list. Same source used by the
  // Broadcast Array form, MCR and reports.
  const { data } = useQuery(GET_EXTERNAL_BROADCAST_REFERENCE, {
    variables: { kind: 'controlRoom', includeInactive: false },
    fetchPolicy: 'cache-first',
  });
  const controlRooms = (data?.externalBroadcastReference || []) as Array<{
    id: string;
    name: string;
  }>;

  // Don't show the primary room as a possible secondary — operator
  // can't pick the same room twice.
  const secondaryOptions = useMemo(
    () =>
      controlRooms
        .filter((r) => !primaryControlRoomName || r.name !== primaryControlRoomName)
        .map((r) => ({ value: r.name, label: r.name, id: r.id })),
    [controlRooms, primaryControlRoomName],
  );

  if (inline) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
          direction: 'rtl',
        }}
      >
        <Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          סטטוס:
        </Text>
        <Radio.Group
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          disabled={disabled}
          buttonStyle="solid"
          size="small"
        >
          {STATUS_OPTIONS.map((s) => (
            <Radio.Button key={s} value={s}>
              {ASSIGNMENT_STATUS_LABEL[s]}
            </Radio.Button>
          ))}
        </Radio.Group>
        <Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>כפול:</Text>
        <Switch
          size="small"
          checked={isDoubleBroadcast}
          onChange={(v) => {
            onDoubleBroadcastChange(v);
            if (!v) onSecondaryControlRoomChange(null);
          }}
          disabled={disabled}
          checkedChildren="פעיל"
          unCheckedChildren="כבוי"
        />
        {isDoubleBroadcast && (
          <Select
            placeholder="חדר בקרה משני"
            value={secondaryControlRoomName || undefined}
            onChange={(name) => {
              if (!name) {
                onSecondaryControlRoomChange(null);
                return;
              }
              const match = secondaryOptions.find((o) => o.value === name);
              onSecondaryControlRoomChange(
                match ? { id: match.id, name: match.value } : { id: '', name },
              );
            }}
            options={secondaryOptions}
            showSearch
            optionFilterProp="label"
            allowClear
            disabled={disabled}
            size="small"
            style={{ width: 160 }}
          />
        )}
      </div>
    );
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 12, direction: 'rtl' }}
      title={
        <Space>
          <Text strong>סטטוס שיבוץ</Text>
          <Tag color={ASSIGNMENT_STATUS_TAG_COLOR[status]}>
            {ASSIGNMENT_STATUS_LABEL[status]}
          </Tag>
        </Space>
      }
    >
      <Row gutter={[16, 12]} align="middle">
        <Col flex="auto">
          <Radio.Group
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            disabled={disabled}
            buttonStyle="solid"
          >
            {STATUS_OPTIONS.map((s) => (
              <Radio.Button key={s} value={s}>
                {ASSIGNMENT_STATUS_LABEL[s]}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Col>

        <Col>
          <Space>
            <Text>שידור כפול:</Text>
            <Switch
              checked={isDoubleBroadcast}
              onChange={(v) => {
                onDoubleBroadcastChange(v);
                // Clearing the toggle also clears the secondary room so we
                // never persist an orphaned reference.
                if (!v) onSecondaryControlRoomChange(null);
              }}
              disabled={disabled}
              checkedChildren="פעיל"
              unCheckedChildren="כבוי"
            />
          </Space>
        </Col>

        {isDoubleBroadcast && (
          <Col flex="280px">
            <Select
              placeholder="בחר חדר בקרה משני"
              value={secondaryControlRoomName || undefined}
              onChange={(name) => {
                if (!name) {
                  onSecondaryControlRoomChange(null);
                  return;
                }
                const match = secondaryOptions.find((o) => o.value === name);
                onSecondaryControlRoomChange(
                  match ? { id: match.id, name: match.value } : { id: '', name },
                );
              }}
              options={secondaryOptions}
              showSearch
              optionFilterProp="label"
              allowClear
              disabled={disabled}
              style={{ width: '100%' }}
            />
          </Col>
        )}
      </Row>
    </Card>
  );
};
