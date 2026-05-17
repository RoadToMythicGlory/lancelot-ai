'use client';

import React, { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { Card, Spin, Empty, Tag, Tabs, Table } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS, statusLabel } from '@/components/shifts/i18n';

dayjs.locale('he');

const MY_SWAPS = gql`
  query MyAgreements {
    myShiftSwapRequests {
      id
      shift {
        id
        date
        shiftType
      }
      requestingUser {
        id
        firstName
        lastName
      }
      targetUser {
        id
        firstName
        lastName
      }
      reason
      status
      createdAt
      approvedAt
      adminNotes
    }
  }
`;

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default',
};

export default function AgreementsPage() {
  const [tab, setTab] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const { data, loading } = useQuery(MY_SWAPS, { fetchPolicy: 'cache-and-network' });

  const filtered = useMemo(() => {
    const all = (data?.myShiftSwapRequests || []) as any[];
    if (tab === 'all') return all;
    return all.filter((r) => r.status === tab);
  }, [data, tab]);

  const columns = [
    {
      title: 'תאריך משמרת',
      key: 'date',
      render: (r: any) =>
        r.shift ? dayjs(r.shift.date).format('DD/MM/YYYY') : '—',
    },
    {
      title: 'משמרת',
      key: 'type',
      render: (r: any) => r.shift?.shiftType || '—',
    },
    {
      title: 'מבקש',
      key: 'requesting',
      render: (r: any) =>
        r.requestingUser
          ? `${r.requestingUser.firstName} ${r.requestingUser.lastName}`
          : '—',
    },
    {
      title: 'יעד',
      key: 'target',
      render: (r: any) =>
        r.targetUser
          ? `${r.targetUser.firstName} ${r.targetUser.lastName}`
          : '—',
    },
    { title: 'סיבה', dataIndex: 'reason', key: 'reason', render: (s: string) => s || '—' },
    {
      title: 'סטטוס',
      key: 'status',
      render: (r: any) => (
        <Tag color={STATUS_COLOR[r.status] || 'default'}>{statusLabel(r.status)}</Tag>
      ),
    },
    {
      title: 'תאריך עדכון',
      key: 'when',
      render: (r: any) =>
        dayjs(r.approvedAt || r.createdAt).format('DD/MM/YYYY HH:mm'),
    },
  ];

  return (
    <ProtectedRoute requires={Permission.SHIFTS_VIEW_OWN}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <ArrowsRightLeftIcon className="h-5 w-5 text-gray-500" />
            {LABELS.AGREEMENTS}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            כל בקשות ההחלפה הקשורות אליך — מהוגשו, אושרו או נדחו.
          </p>
        </div>

        <Card>
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as any)}
            items={[
              { key: 'all', label: LABELS.ALL },
              { key: 'pending', label: LABELS.STATUS_PENDING },
              { key: 'approved', label: LABELS.STATUS_APPROVED },
              { key: 'rejected', label: LABELS.STATUS_REJECTED },
            ]}
          />
          {loading && filtered.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spin />
            </div>
          ) : filtered.length === 0 ? (
            <Empty description={LABELS.EMPTY_NO_REQUESTS} />
          ) : (
            <Table
              dataSource={filtered}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 10, showSizeChanger: true }}
            />
          )}
        </Card>
      </div>
    </ProtectedRoute>
  );
}
