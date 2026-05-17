'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { gql, useQuery } from '@apollo/client';
import { Card, Tag, Empty, Spin, Tabs, Button, Table } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import {
  ArrowsRightLeftIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS, statusLabel, vacationTypeLabel } from '@/components/shifts/i18n';
import NewRequestModal from '@/components/shifts/modals/NewRequestModal';

dayjs.locale('he');

const MY_VACATIONS = gql`
  query MyVacationRequestsForList {
    myVacationRequests {
      id
      startDate
      endDate
      vacationType
      reason
      status
      adminNotes
      createdAt
      approvedAt
    }
  }
`;

const MY_SWAPS = gql`
  query MyShiftSwapRequestsForList {
    myShiftSwapRequests {
      id
      shift {
        id
        date
        shiftType
      }
      targetUser {
        id
        firstName
        lastName
      }
      reason
      adminNotes
      status
      createdAt
      approvedAt
    }
  }
`;

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default',
};

type RequestRow = {
  id: string;
  kind: 'vacation' | 'swap';
  type: string;
  detail: string;
  status: string;
  createdAt: string;
  notes: string;
};

export default function MyRequestsPage() {
  const [tab, setTab] = useState<'all' | 'vacation' | 'swap'>('all');
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [newRequestTab, setNewRequestTab] = useState<'vacation' | 'swap'>('vacation');

  const { data: vData, loading: vLoading } = useQuery(MY_VACATIONS, {
    fetchPolicy: 'cache-and-network',
  });
  const { data: sData, loading: sLoading } = useQuery(MY_SWAPS, {
    fetchPolicy: 'cache-and-network',
  });

  const allRows = useMemo<RequestRow[]>(() => {
    const v: RequestRow[] = (vData?.myVacationRequests || []).map((r: any) => ({
      id: `v-${r.id}`,
      kind: 'vacation',
      type: vacationTypeLabel(r.vacationType),
      detail: `${dayjs(r.startDate).format('DD/MM/YYYY')} — ${dayjs(r.endDate).format('DD/MM/YYYY')}`,
      status: r.status,
      createdAt: r.createdAt,
      notes: r.adminNotes || r.reason || '',
    }));
    const s: RequestRow[] = (sData?.myShiftSwapRequests || []).map((r: any) => ({
      id: `s-${r.id}`,
      kind: 'swap',
      type: 'החלפת משמרת',
      detail: r.shift
        ? `${dayjs(r.shift.date).format('DD/MM/YYYY')} • ${r.shift.shiftType}` +
          (r.targetUser ? ` ↔ ${r.targetUser.firstName} ${r.targetUser.lastName}` : '')
        : '—',
      status: r.status,
      createdAt: r.createdAt,
      notes: r.adminNotes || r.reason || '',
    }));
    return [...v, ...s].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [vData, sData]);

  const filtered = useMemo(() => {
    if (tab === 'all') return allRows;
    return allRows.filter((r) => r.kind === tab);
  }, [tab, allRows]);

  const loading = vLoading || sLoading;

  const columns = [
    {
      title: 'סוג',
      key: 'kind',
      render: (r: RequestRow) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          {r.kind === 'vacation' ? (
            <CalendarDaysIcon className="h-4 w-4 text-emerald-600" />
          ) : (
            <ArrowsRightLeftIcon className="h-4 w-4 text-blue-600" />
          )}
          {r.type}
        </span>
      ),
    },
    {
      title: 'פרטים',
      dataIndex: 'detail',
      key: 'detail',
    },
    {
      title: 'סטטוס',
      key: 'status',
      render: (r: RequestRow) => (
        <Tag color={STATUS_COLOR[r.status] || 'default'}>{statusLabel(r.status)}</Tag>
      ),
    },
    {
      title: 'הערות',
      dataIndex: 'notes',
      key: 'notes',
      render: (n: string) => n || '—',
    },
    {
      title: 'תאריך הגשה',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => dayjs(d).format('DD/MM/YYYY HH:mm'),
    },
  ];

  return (
    <ProtectedRoute requires={Permission.SHIFTS_VIEW_OWN}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
              <ClipboardDocumentListIcon className="h-5 w-5 text-gray-500" />
              {LABELS.MY_REQUESTS}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              צפייה בכל בקשות החופשה וההחלפה שלך במקום אחד
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="primary"
              onClick={() => {
                setNewRequestTab('vacation');
                setNewRequestOpen(true);
              }}
            >
              בקשה חדשה
            </Button>
            <Link href="/shifts/my-shifts">
              <Button>למסך המשמרות שלי</Button>
            </Link>
          </div>
        </div>

        <NewRequestModal
          open={newRequestOpen}
          onClose={() => setNewRequestOpen(false)}
          defaultTab={newRequestTab}
        />

        <Card>
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as any)}
            items={[
              { key: 'all', label: LABELS.ALL },
              { key: 'vacation', label: 'חופשות' },
              { key: 'swap', label: 'החלפות' },
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
