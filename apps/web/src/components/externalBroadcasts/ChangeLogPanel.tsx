'use client';

/**
 * Per-event External Broadcasts change log.
 *
 * Read-only view onto the `external_broadcast_change_logs` collection.
 * Records only operational field changes (status, control-check, NEVION,
 * LiveU, documents, finance, exclude/restore). Crew and equipment-list
 * edits are intentionally not logged to keep this feed signal-rich.
 */
import React from 'react';
import { Card, Empty, Spin, Table, Tag, Typography } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { useQuery } from '@apollo/client';
import dayjs from 'dayjs';
import { GET_EXTERNAL_BROADCAST_CHANGE_LOG } from '@/graphql/queries';

const { Text } = Typography;

const FIELD_LABEL: Record<string, string> = {
  assignmentStatus: 'סטטוס שיבוץ',
  isDoubleBroadcast: 'שידור כפול',
  secondaryControlRoomId: 'חדר בקרה משני',
  secondaryControlRoomName: 'חדר בקרה משני (שם)',
  manualDisplayOrder: 'סדר תצוגה ידני',
  'manualDisplayOrder.batch': 'סידור מחדש (גריעה)',
  controlCheck: 'בדיקת בקרה',
  // Old key — still surfaced in history for events saved before the rename.
  offtube: 'בדיקת בקרה (ישן)',
  documents: 'מסמכים',
  finance: 'כספים',
  nevionRequest: 'בקשת NEVION',
  liveuActivation: 'הפעלת LiveU',
  excludedFromOperations: 'הוצא משידורי חוץ',
  excludedAt: 'תאריך הוצאה',
  excludeReason: 'סיבת הוצאה',
};

function formatValue(v: any): React.ReactNode {
  if (v == null || v === '') return <Text type="secondary">-</Text>;
  if (typeof v === 'boolean') return v ? 'כן' : 'לא';
  if (typeof v === 'object') {
    return (
      <code style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(v, null, 1)}
      </code>
    );
  }
  return String(v);
}

interface ChangeLogPanelProps {
  eventId: string;
}

export const ChangeLogPanel: React.FC<ChangeLogPanelProps> = ({ eventId }) => {
  const { data, loading } = useQuery(GET_EXTERNAL_BROADCAST_CHANGE_LOG, {
    variables: { eventId, limit: 200 },
    fetchPolicy: 'cache-and-network',
  });
  const entries = data?.externalBroadcastChangeLog || [];

  return (
    <Card
      size="small"
      style={{ direction: 'rtl' }}
      title={
        <span>
          <HistoryOutlined /> היסטוריית שינויים תפעוליים
        </span>
      }
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin />
        </div>
      )}
      {!loading && entries.length === 0 && (
        <Empty
          description="לא נרשמו שינויים תפעוליים בשידור זה"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
      {entries.length > 0 && (
        <Table
          rowKey="id"
          dataSource={entries}
          size="small"
          pagination={{ pageSize: 15, simple: true }}
          columns={[
            {
              title: 'תאריך',
              dataIndex: 'changedAt',
              key: 'changedAt',
              width: 160,
              render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm'),
            },
            {
              title: 'שדה',
              dataIndex: 'field',
              key: 'field',
              width: 180,
              render: (f: string) => (
                <Tag color="geekblue">{FIELD_LABEL[f] || f}</Tag>
              ),
            },
            {
              title: 'ערך קודם',
              dataIndex: 'previousValue',
              key: 'previousValue',
              render: formatValue,
            },
            {
              title: 'ערך חדש',
              dataIndex: 'newValue',
              key: 'newValue',
              render: formatValue,
            },
            {
              title: 'בוצע ע"י',
              dataIndex: 'changedByName',
              key: 'changedByName',
              width: 160,
              render: (v: string) => v || <Text type="secondary">-</Text>,
            },
          ]}
        />
      )}
    </Card>
  );
};
