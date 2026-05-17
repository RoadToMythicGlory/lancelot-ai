'use client';

import React from 'react';
import { Modal, Card, List, Tag, Spin, Empty } from 'antd';
import { gql, useQuery } from '@apollo/client';
import dayjs from 'dayjs';

const DAILY_SCHEDULE_QUERY = gql`
  query GetDailyScheduleForModal(
    $startDate: String!
    $endDate: String!
    $department: String!
  ) {
    shifts(startDate: $startDate, endDate: $endDate, department: $department) {
      id
      shiftType
      startTime
      endTime
      assignedWorkers {
        userId
        role
        user {
          id
          firstName
          lastName
          displayName
        }
      }
    }
  }
`;

interface DailyScheduleModalProps {
  open: boolean;
  onClose: () => void;
  date: string | null;
  department: string;
}

export default function DailyScheduleModal({
  open,
  onClose,
  date,
  department,
}: DailyScheduleModalProps) {
  const dateStr = date ? dayjs(date).format('YYYY-MM-DD') : '';
  const { data, loading } = useQuery(DAILY_SCHEDULE_QUERY, {
    variables: { startDate: dateStr, endDate: dateStr, department },
    skip: !open || !date || !department,
    fetchPolicy: 'network-only',
  });

  const grouped = React.useMemo(() => {
    const out: Record<string, any[]> = {};
    for (const s of (data?.shifts as any[]) || []) {
      const key = s.shiftType || '—';
      if (!out[key]) out[key] = [];
      out[key].push(s);
    }
    return out;
  }, [data]);

  return (
    <Modal
      title={`סידור יומי — ${date ? dayjs(date).format('DD/MM/YYYY') : ''}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
    >
      {loading ? (
        <div className="flex justify-center py-6">
          <Spin />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <Empty description="אין שיבוצים ביום זה" />
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([type, list]) => (
            <Card key={type} size="small" title={type}>
              <List
                size="small"
                dataSource={list.flatMap((s: any) =>
                  (s.assignedWorkers || []).map((w: any) => ({
                    ...w,
                    time: `${s.startTime}-${s.endTime}`,
                  })),
                )}
                renderItem={(w: any) => (
                  <List.Item>
                    <span className="flex-1">
                      {w.user
                        ? w.user.displayName ||
                          `${w.user.firstName || ''} ${w.user.lastName || ''}`.trim()
                        : 'עובד'}
                    </span>
                    {w.role && <Tag>{w.role}</Tag>}
                    <span className="text-xs text-gray-500 mx-2">{w.time}</span>
                  </List.Item>
                )}
                locale={{ emptyText: 'אין עובדים' }}
              />
            </Card>
          ))}
        </div>
      )}
    </Modal>
  );
}
