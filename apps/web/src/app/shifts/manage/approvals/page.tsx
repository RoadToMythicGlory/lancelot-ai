'use client';

import React, { useMemo, useState } from 'react';
import { gql, useMutation, useQuery } from '@apollo/client';
import {
  Card,
  Tabs,
  Tag,
  Button,
  Spin,
  Empty,
  Modal,
  Input,
  Table,
  message,
} from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import {
  CheckBadgeIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS, statusLabel, vacationTypeLabel } from '@/components/shifts/i18n';
import DepartmentPicker from '@/components/shifts/DepartmentPicker';

dayjs.locale('he');

const VACATION_REQUESTS = gql`
  query AllVacationRequestsForApprovals($status: RequestStatus) {
    vacationRequests(status: $status) {
      id
      user {
        id
        displayName
        department
        firstName
        lastName
      }
      startDate
      endDate
      vacationType
      reason
      status
      adminNotes
      approvedAt
      createdAt
    }
  }
`;

const SWAP_REQUESTS = gql`
  query AllSwapRequestsForApprovals($status: RequestStatus) {
    shiftSwapRequests(status: $status) {
      id
      shift {
        id
        date
        shiftType
        department
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
      adminNotes
      createdAt
    }
  }
`;

const APPROVE_VACATION = gql`
  mutation ApproveVacationFromHod($input: ApprovalInput!) {
    approveVacationRequest(input: $input) {
      id
      status
    }
  }
`;

const APPROVE_SWAP = gql`
  mutation ApproveSwapFromHod($input: ApprovalInput!) {
    approveShiftSwapRequest(input: $input) {
      id
      status
    }
  }
`;

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default',
};

type StatusKey = 'pending' | 'approved' | 'rejected';

export default function ApprovalsPage() {
  const [activeDeptId, setActiveDeptId] = useState<string>('');
  const [tab, setTab] = useState<StatusKey>('pending');
  const [kind, setKind] = useState<'vacation' | 'swap'>('vacation');

  const { data: vData, loading: vLoading, refetch: refetchV } = useQuery(VACATION_REQUESTS, {
    variables: { status: tab },
    fetchPolicy: 'cache-and-network',
  });
  const { data: sData, loading: sLoading, refetch: refetchS } = useQuery(SWAP_REQUESTS, {
    variables: { status: tab },
    fetchPolicy: 'cache-and-network',
  });

  const [approveVacation] = useMutation(APPROVE_VACATION);
  const [approveSwap] = useMutation(APPROVE_SWAP);

  const vacations = useMemo(() => {
    const all = (vData?.vacationRequests || []) as any[];
    if (!activeDeptId) return all;
    return all.filter((r) => !r.user?.department || r.user.department === activeDeptId);
  }, [vData, activeDeptId]);

  const swaps = useMemo(() => {
    const all = (sData?.shiftSwapRequests || []) as any[];
    if (!activeDeptId) return all;
    return all.filter((r) => !r.shift?.department || r.shift.department === activeDeptId);
  }, [sData, activeDeptId]);

  function decide(record: any, isVacation: boolean, approved: boolean) {
    let notes = '';
    Modal.confirm({
      title: approved ? 'אישור הבקשה' : 'דחיית הבקשה',
      content: (
        <div>
          <p className="mb-2 text-sm text-gray-600">הוספת הערה (אופציונלי):</p>
          <Input.TextArea rows={3} onChange={(e) => (notes = e.target.value)} />
        </div>
      ),
      okText: approved ? LABELS.CONFIRM : LABELS.REJECT,
      okButtonProps: { danger: !approved },
      cancelText: LABELS.CANCEL,
      async onOk() {
        try {
          const input = { requestId: record.id, approved, adminNotes: notes || null };
          if (isVacation) {
            await approveVacation({ variables: { input } });
          } else {
            await approveSwap({ variables: { input } });
          }
          message.success(approved ? 'הבקשה אושרה' : 'הבקשה נדחתה');
          isVacation ? refetchV() : refetchS();
        } catch (e: any) {
          message.error(e?.message || 'שגיאה');
        }
      },
    });
  }

  const vacColumns = [
    {
      title: 'עובד',
      key: 'user',
      render: (r: any) =>
        r.user
          ? r.user.displayName || `${r.user.firstName || ''} ${r.user.lastName || ''}`.trim()
          : '—',
    },
    {
      title: 'סוג',
      dataIndex: 'vacationType',
      key: 'type',
      render: vacationTypeLabel,
    },
    {
      title: 'תאריכים',
      key: 'dates',
      render: (r: any) =>
        `${dayjs(r.startDate).format('DD/MM/YYYY')} — ${dayjs(r.endDate).format('DD/MM/YYYY')}`,
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
      title: 'הוגש',
      key: 'created',
      render: (r: any) => dayjs(r.createdAt).format('DD/MM HH:mm'),
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (r: any) =>
        r.status === 'pending' ? (
          <div className="flex gap-1">
            <Button
              type="primary"
              size="small"
              icon={<CheckIcon className="h-4 w-4" />}
              onClick={() => decide(r, true, true)}
            >
              {LABELS.CONFIRM}
            </Button>
            <Button
              size="small"
              danger
              icon={<XMarkIcon className="h-4 w-4" />}
              onClick={() => decide(r, true, false)}
            >
              {LABELS.REJECT}
            </Button>
          </div>
        ) : (
          <span className="text-xs text-gray-400">{r.adminNotes || '—'}</span>
        ),
    },
  ];

  const swapColumns = [
    {
      title: 'מבקש',
      key: 'req',
      render: (r: any) =>
        r.requestingUser
          ? `${r.requestingUser.firstName} ${r.requestingUser.lastName}`
          : '—',
    },
    {
      title: 'יעד',
      key: 'target',
      render: (r: any) =>
        r.targetUser ? `${r.targetUser.firstName} ${r.targetUser.lastName}` : '—',
    },
    {
      title: 'משמרת',
      key: 'shift',
      render: (r: any) =>
        r.shift
          ? `${dayjs(r.shift.date).format('DD/MM')} • ${r.shift.shiftType}`
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
      title: 'פעולות',
      key: 'actions',
      render: (r: any) =>
        r.status === 'pending' ? (
          <div className="flex gap-1">
            <Button
              type="primary"
              size="small"
              icon={<CheckIcon className="h-4 w-4" />}
              onClick={() => decide(r, false, true)}
            >
              {LABELS.CONFIRM}
            </Button>
            <Button
              size="small"
              danger
              icon={<XMarkIcon className="h-4 w-4" />}
              onClick={() => decide(r, false, false)}
            >
              {LABELS.REJECT}
            </Button>
          </div>
        ) : (
          <span className="text-xs text-gray-400">{r.adminNotes || '—'}</span>
        ),
    },
  ];

  const list = kind === 'vacation' ? vacations : swaps;
  const loading = kind === 'vacation' ? vLoading : sLoading;

  return (
    <ProtectedRoute requires={Permission.SHIFTS_MANAGE} departmentId={activeDeptId || undefined}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <CheckBadgeIcon className="h-5 w-5 text-gray-500" />
            {LABELS.APPROVALS}
          </h1>
          <DepartmentPicker value={activeDeptId} onChange={setActiveDeptId} scope="manageable" />
        </div>

        <Card>
          <Tabs
            activeKey={kind}
            onChange={(k) => setKind(k as any)}
            items={[
              { key: 'vacation', label: 'חופשות' },
              { key: 'swap', label: 'החלפות' },
            ]}
          />
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as StatusKey)}
            items={[
              { key: 'pending', label: LABELS.STATUS_PENDING },
              { key: 'approved', label: LABELS.STATUS_APPROVED },
              { key: 'rejected', label: LABELS.STATUS_REJECTED },
            ]}
          />
          {loading && list.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spin />
            </div>
          ) : list.length === 0 ? (
            <Empty description={LABELS.EMPTY_NO_REQUESTS} />
          ) : (
            <Table
              dataSource={list}
              columns={kind === 'vacation' ? vacColumns : swapColumns}
              rowKey="id"
              pagination={{ pageSize: 10, showSizeChanger: true }}
            />
          )}
        </Card>
      </div>
    </ProtectedRoute>
  );
}
