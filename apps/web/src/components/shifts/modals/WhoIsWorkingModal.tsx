'use client';

import React from 'react';
import { Modal, List, Tag, Spin } from 'antd';
import { gql, useQuery } from '@apollo/client';
import dayjs from 'dayjs';

const COWORKERS_QUERY = gql`
  query GetCoworkersForShiftModal(
    $department: String!
    $startDate: String!
    $endDate: String!
    $userId: String
  ) {
    shifts(
      startDate: $startDate
      endDate: $endDate
      department: $department
      userId: $userId
    ) {
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

interface WhoIsWorkingModalProps {
  open: boolean;
  onClose: () => void;
  /** The shift the current user is on. We display all coworkers overlapping it. */
  shift: {
    id?: string;
    date: string;
    department: string;
    startTime?: string | null;
    endTime?: string | null;
    shiftType?: string | null;
  } | null;
  /** Optional own user id to dim the current viewer in the list. */
  selfUserId?: string;
}

function timeOverlap(
  aStart: string | null | undefined,
  aEnd: string | null | undefined,
  bStart: string | null | undefined,
  bEnd: string | null | undefined,
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  const s1 = dayjs(`2000-01-01 ${aStart}`);
  const e1 = dayjs(`2000-01-01 ${aEnd}`);
  const s2 = dayjs(`2000-01-01 ${bStart}`);
  const e2 = dayjs(`2000-01-01 ${bEnd}`);
  return s1.isBefore(e2) && e1.isAfter(s2);
}

export default function WhoIsWorkingModal({
  open,
  onClose,
  shift,
  selfUserId,
}: WhoIsWorkingModalProps) {
  const dateStr = shift ? dayjs(shift.date).format('YYYY-MM-DD') : '';
  const { data, loading } = useQuery(COWORKERS_QUERY, {
    variables: {
      department: shift?.department || '',
      startDate: dateStr,
      endDate: dateStr,
    },
    skip: !open || !shift,
    fetchPolicy: 'network-only',
  });

  const overlappingWorkers = React.useMemo(() => {
    if (!shift || !data?.shifts) return [] as any[];
    const out: any[] = [];
    for (const s of data.shifts) {
      if (!timeOverlap(s.startTime, s.endTime, shift.startTime, shift.endTime)) continue;
      for (const w of s.assignedWorkers || []) {
        if (selfUserId && String(w.userId) === String(selfUserId)) continue;
        out.push({ ...w, shiftType: s.shiftType, time: `${s.startTime || ''}-${s.endTime || ''}` });
      }
    }
    return out;
  }, [data, shift, selfUserId]);

  return (
    <Modal title="מי עובד איתי" open={open} onCancel={onClose} footer={null} width={600}>
      {loading ? (
        <div className="flex justify-center py-6">
          <Spin />
        </div>
      ) : (
        <List
          dataSource={overlappingWorkers}
          renderItem={(w: any) => (
            <List.Item>
              <List.Item.Meta
                title={
                  w.user
                    ? w.user.displayName ||
                      `${w.user.firstName || ''} ${w.user.lastName || ''}`.trim()
                    : 'עובד'
                }
                description={
                  <div className="flex items-center gap-2">
                    {w.role && <Tag>{w.role}</Tag>}
                    <span className="text-gray-500 text-xs">
                      {w.shiftType} • {w.time}
                    </span>
                  </div>
                }
              />
            </List.Item>
          )}
          locale={{ emptyText: 'אין עובדים נוספים באותו הזמן' }}
        />
      )}
    </Modal>
  );
}
