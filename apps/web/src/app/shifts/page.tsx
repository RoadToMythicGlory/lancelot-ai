'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { gql, useQuery } from '@apollo/client';
import { Card, Tag, Empty, Spin } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import {
  CalendarIcon,
  ClipboardDocumentListIcon,
  AdjustmentsHorizontalIcon,
  ClockIcon,
  ArrowsRightLeftIcon,
  RectangleGroupIcon,
  Squares2X2Icon,
  UserGroupIcon,
  ChevronLeftIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import UpcomingShifts from '@/components/shifts/UpcomingShifts';
import { LABELS, statusLabel, vacationTypeLabel } from '@/components/shifts/i18n';
import { useShiftsLiveRefresh } from '@/components/shifts/hooks/useShiftsLiveRefresh';

const MY_VACATION_REQUESTS = gql`
  query MyVacationRequestsForDashboard {
    myVacationRequests {
      id
      startDate
      endDate
      vacationType
      status
      createdAt
    }
  }
`;

const MY_SWAP_REQUESTS = gql`
  query MyShiftSwapRequestsForDashboard {
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
      status
      createdAt
    }
  }
`;

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default',
};

const QUICK_LINKS: Array<{ label: string; href: string; icon: React.ForwardRefExoticComponent<any> }> = [
  { label: LABELS.MY_SHIFTS, href: '/shifts/my-shifts', icon: CalendarIcon },
  { label: LABELS.MY_REQUESTS, href: '/shifts/my-requests', icon: ClipboardDocumentListIcon },
  { label: LABELS.MY_PREFERENCES, href: '/shifts/my-preferences', icon: AdjustmentsHorizontalIcon },
  { label: LABELS.WORK_LOG, href: '/shifts/work-log', icon: ClockIcon },
  { label: LABELS.DAILY_SCHEDULE, href: '/shifts/daily-schedule', icon: Squares2X2Icon },
  { label: LABELS.WEEKLY_SCHEDULE, href: '/shifts/weekly-schedule', icon: RectangleGroupIcon },
  { label: LABELS.SCHEDULE_BY_EMPLOYEE, href: '/shifts/schedule-by-employee', icon: UserGroupIcon },
  { label: LABELS.AGREEMENTS, href: '/shifts/agreements', icon: ArrowsRightLeftIcon },
];

export default function ShiftsDashboardPage() {
  const { user } = useAuth();

  const { data: vacationData, loading: vacationLoading, refetch: refetchVacations } = useQuery(
    MY_VACATION_REQUESTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const { data: swapData, loading: swapLoading, refetch: refetchSwaps } = useQuery(
    MY_SWAP_REQUESTS,
    { fetchPolicy: 'cache-and-network' },
  );

  useShiftsLiveRefresh(() => Promise.all([refetchVacations(), refetchSwaps()]));

  const recentRequests = useMemo(() => {
    type Row = {
      id: string;
      kind: 'vacation' | 'swap';
      title: string;
      subtitle: string;
      status: string;
      createdAt: string;
    };
    const vacations: Row[] = (vacationData?.myVacationRequests || []).map((r: any) => ({
      id: `v-${r.id}`,
      kind: 'vacation',
      title: vacationTypeLabel(r.vacationType),
      subtitle: `${dayjs(r.startDate).format('DD/MM')}–${dayjs(r.endDate).format('DD/MM')}`,
      status: r.status,
      createdAt: r.createdAt,
    }));
    const swaps: Row[] = (swapData?.myShiftSwapRequests || []).map((r: any) => ({
      id: `s-${r.id}`,
      kind: 'swap',
      title: 'בקשת החלפה',
      subtitle: r.targetUser
        ? `עם ${r.targetUser.firstName} ${r.targetUser.lastName}`
        : '',
      status: r.status,
      createdAt: r.createdAt,
    }));
    return [...vacations, ...swaps]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [vacationData, swapData]);

  const today = dayjs();

  return (
    <ProtectedRoute requires={Permission.SHIFTS_VIEW_OWN}>
      <div className="space-y-6">
        {/* Welcome */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {LABELS.WELCOME}, {user?.displayName || ''}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {today.format('dddd, DD/MM/YYYY')}
          </p>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
          {QUICK_LINKS.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <span className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-gray-700 text-center">
                {label}
              </span>
            </Link>
          ))}
        </div>

        {/* Upcoming shifts (reuses existing component) */}
        <div>
          <UpcomingShifts />
        </div>

        {/* Recent requests */}
        <Card
          title="בקשות אחרונות"
          extra={
            <Link
              href="/shifts/my-requests"
              className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              צפה בכל הבקשות <ChevronLeftIcon className="h-4 w-4" />
            </Link>
          }
        >
          {(vacationLoading || swapLoading) && recentRequests.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spin />
            </div>
          ) : recentRequests.length === 0 ? (
            <Empty description={LABELS.EMPTY_NO_REQUESTS} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentRequests.map((r) => (
                <div
                  key={r.id}
                  className="border border-gray-100 rounded-lg p-3 bg-gray-50/50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800">
                      {r.title}
                    </span>
                    <Tag color={STATUS_COLOR[r.status] || 'default'}>
                      {statusLabel(r.status)}
                    </Tag>
                  </div>
                  <p className="text-xs text-gray-500">{r.subtitle}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {dayjs(r.createdAt).format('DD/MM HH:mm')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </ProtectedRoute>
  );
}
