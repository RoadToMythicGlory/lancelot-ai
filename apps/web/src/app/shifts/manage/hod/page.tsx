'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { gql, useQuery } from '@apollo/client';
import { Card, Statistic, Tag, Spin, Empty, Button } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import {
  PresentationChartLineIcon,
  CheckBadgeIcon,
  CalendarIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS, statusLabel, vacationTypeLabel } from '@/components/shifts/i18n';
import DepartmentPicker from '@/components/shifts/DepartmentPicker';

dayjs.locale('he');

// NOTE: VacationRequest exposes the requester as `user` (the swap-request
// type uses `requestingUser`, which is what confused this query before and
// caused a hard GraphQL validation failure for the entire HoD dashboard).
const PENDING_VACATIONS = gql`
  query HodPendingVacations {
    vacationRequests(status: pending) {
      id
      startDate
      endDate
      vacationType
      status
      user {
        id
        firstName
        lastName
        department
      }
      createdAt
    }
  }
`;

const PENDING_SWAPS = gql`
  query HodPendingSwaps {
    shiftSwapRequests(status: pending) {
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
      status
      createdAt
    }
  }
`;

export default function HodDashboardPage() {
  const [activeDeptId, setActiveDeptId] = useState<string>('');

  const { data: vData, loading: vLoading } = useQuery(PENDING_VACATIONS, {
    fetchPolicy: 'cache-and-network',
  });
  const { data: sData, loading: sLoading } = useQuery(PENDING_SWAPS, {
    fetchPolicy: 'cache-and-network',
  });

  // Filter to active department on the client (the gateway returns dept-scoped
  // anyway when the caller has only DEPARTMENT_ADMIN; system admins see all).
  const vacations = useMemo(() => {
    const all = (vData?.vacationRequests || []) as any[];
    if (!activeDeptId) return all;
    return all.filter(
      (r) => !r.user?.department || r.user.department === activeDeptId,
    );
  }, [vData, activeDeptId]);

  const swaps = useMemo(() => {
    const all = (sData?.shiftSwapRequests || []) as any[];
    if (!activeDeptId) return all;
    return all.filter((r) => !r.shift?.department || r.shift.department === activeDeptId);
  }, [sData, activeDeptId]);

  return (
    <ProtectedRoute requires={Permission.SHIFTS_MANAGE} departmentId={activeDeptId || undefined}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
              <PresentationChartLineIcon className="h-5 w-5 text-gray-500" />
              {LABELS.HOD_DASHBOARD}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              סקירה של בקשות פתוחות ומשמרות שלא משובצות במחלקה.
            </p>
          </div>
          <DepartmentPicker value={activeDeptId} onChange={setActiveDeptId} scope="manageable" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <Statistic
              title="בקשות חופשה ממתינות"
              value={vacations.length}
              prefix={<CheckBadgeIcon className="h-4 w-4 inline text-orange-500" />}
            />
          </Card>
          <Card>
            <Statistic
              title="בקשות החלפה ממתינות"
              value={swaps.length}
              prefix={<CalendarIcon className="h-4 w-4 inline text-blue-500" />}
            />
          </Card>
          <Card>
            <Link href="/shifts/manage/department-schedule">
              <Statistic
                title="צפייה בסידור מחלקה"
                value="פתח"
                prefix={<UserGroupIcon className="h-4 w-4 inline text-emerald-600" />}
              />
            </Link>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card
            title="חופשות ממתינות"
            extra={
              <Link href="/shifts/manage/approvals">
                <Button size="small">לכל הבקשות</Button>
              </Link>
            }
          >
            {vLoading && vacations.length === 0 ? (
              <div className="flex justify-center py-6">
                <Spin />
              </div>
            ) : vacations.length === 0 ? (
              <Empty description={LABELS.EMPTY_NO_REQUESTS} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <ul className="space-y-2">
                {vacations.slice(0, 6).map((r: any) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0"
                  >
                    <div className="text-sm">
                      <span className="font-medium text-gray-800">
                        {r.user
                          ? `${r.user.firstName} ${r.user.lastName}`
                          : '—'}
                      </span>
                      <span className="text-gray-500 mr-2">
                        {vacationTypeLabel(r.vacationType)} • {dayjs(r.startDate).format('DD/MM')}–
                        {dayjs(r.endDate).format('DD/MM')}
                      </span>
                    </div>
                    <Tag color="orange">{statusLabel(r.status)}</Tag>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="החלפות ממתינות"
            extra={
              <Link href="/shifts/manage/approvals">
                <Button size="small">לכל הבקשות</Button>
              </Link>
            }
          >
            {sLoading && swaps.length === 0 ? (
              <div className="flex justify-center py-6">
                <Spin />
              </div>
            ) : swaps.length === 0 ? (
              <Empty description={LABELS.EMPTY_NO_REQUESTS} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <ul className="space-y-2">
                {swaps.slice(0, 6).map((r: any) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0"
                  >
                    <div className="text-sm">
                      <span className="font-medium text-gray-800">
                        {r.requestingUser
                          ? `${r.requestingUser.firstName} ${r.requestingUser.lastName}`
                          : '—'}
                      </span>
                      <span className="text-gray-500 mr-2">
                        {r.shift ? dayjs(r.shift.date).format('DD/MM') : ''} • {r.shift?.shiftType}
                      </span>
                      {r.targetUser && (
                        <span className="text-gray-400 mr-1">
                          → {r.targetUser.firstName} {r.targetUser.lastName}
                        </span>
                      )}
                    </div>
                    <Tag color="orange">{statusLabel(r.status)}</Tag>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
