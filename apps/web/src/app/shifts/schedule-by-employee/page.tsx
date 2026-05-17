'use client';

import React, { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { Card, Spin, Empty, Button, Tag, Select } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission, manageableShiftDepartments } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import { LABELS, HEBREW_WEEKDAYS_SHORT } from '@/components/shifts/i18n';

dayjs.locale('he');

const SHIFTS_FOR_DEPT_WEEK = gql`
  query ShiftsForDeptWeek(
    $startDate: String!
    $endDate: String!
    $department: String!
  ) {
    shifts(startDate: $startDate, endDate: $endDate, department: $department) {
      id
      date
      shiftType
      startTime
      endTime
      assignedWorkers {
        userId
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

export default function ScheduleByEmployeePage() {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const myDepts = useMemo(
    () => (user ? user.departments.map((d) => d.departmentId) : []),
    [user],
  );
  const adminDepts = useMemo(() => manageableShiftDepartments(user as any), [user]);
  const isSystemAdmin =
    user?.systemRole === 'SYSTEM_ADMIN' || user?.systemRole === 'IT_ADMIN';
  const [department, setDepartment] = useState<string>(myDepts[0] || '');

  React.useEffect(() => {
    if (!department && myDepts[0]) setDepartment(myDepts[0]);
  }, [myDepts, department]);

  const weekStart = dayjs().startOf('week').add(weekOffset, 'week');
  const weekEnd = weekStart.add(6, 'day');

  const { data, loading } = useQuery(SHIFTS_FOR_DEPT_WEEK, {
    variables: {
      startDate: weekStart.format('YYYY-MM-DD'),
      endDate: weekEnd.format('YYYY-MM-DD'),
      department,
    },
    skip: !department,
    fetchPolicy: 'cache-and-network',
  });

  // Build matrix: employeeId -> day(0..6) -> shift list
  const matrix = useMemo(() => {
    const result = new Map<string, { name: string; days: any[][] }>();
    for (const s of (data?.shifts as any[]) || []) {
      const dow = dayjs(s.date).day();
      for (const w of s.assignedWorkers || []) {
        const id = String(w.userId);
        const name =
          w.user?.displayName ||
          `${w.user?.firstName || ''} ${w.user?.lastName || ''}`.trim() ||
          'עובד';
        if (!result.has(id)) {
          result.set(id, { name, days: Array.from({ length: 7 }, () => [] as any[]) });
        }
        result.get(id)!.days[dow].push(s);
      }
    }
    return Array.from(result.entries()).sort(([, a], [, b]) =>
      a.name.localeCompare(b.name, 'he'),
    );
  }, [data]);

  const departmentOptions = (isSystemAdmin && adminDepts.length > 0
    ? adminDepts
    : (user?.departments || []).map((d: any) => ({
        departmentId: d.departmentId,
        departmentName: d.departmentName,
      }))
  ).map((d) => ({ value: d.departmentId, label: d.departmentName || d.departmentId }));

  return (
    <ProtectedRoute requires={Permission.SHIFTS_VIEW_OWN}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <UserGroupIcon className="h-5 w-5 text-gray-500" />
            {LABELS.SCHEDULE_BY_EMPLOYEE}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={department}
              onChange={setDepartment}
              options={departmentOptions}
              placeholder={LABELS.SELECT_DEPARTMENT}
              style={{ minWidth: 180 }}
            />
            <Button
              icon={<ChevronRightIcon className="h-4 w-4" />}
              onClick={() => setWeekOffset((w) => w - 1)}
            />
            <Button onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
              השבוע הנוכחי
            </Button>
            <Button
              icon={<ChevronLeftIcon className="h-4 w-4" />}
              onClick={() => setWeekOffset((w) => w + 1)}
            />
          </div>
        </div>

        <div className="text-sm text-gray-600 px-1">
          {weekStart.format('DD/MM')} — {weekEnd.format('DD/MM/YYYY')}
        </div>

        <Card>
          {!department ? (
            <Empty description="אנא בחר מחלקה" />
          ) : loading && matrix.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spin />
            </div>
          ) : matrix.length === 0 ? (
            <Empty description="אין שיבוצים בשבוע זה" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right p-2 sticky right-0 bg-gray-50">עובד</th>
                    {HEBREW_WEEKDAYS_SHORT.map((d, i) => (
                      <th key={i} className="p-2 text-center">
                        {d}
                        <div className="text-[10px] text-gray-400 font-normal">
                          {weekStart.add(i, 'day').format('DD/MM')}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map(([id, row]) => (
                    <tr key={id} className="border-t">
                      <td className="p-2 font-medium text-gray-800 sticky right-0 bg-white">
                        {row.name}
                      </td>
                      {row.days.map((dayShifts, i) => (
                        <td key={i} className="p-1 align-top">
                          {dayShifts.length === 0 ? (
                            <span className="text-gray-300 text-xs">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {dayShifts.map((s: any) => (
                                <Tag key={s.id} color="blue">
                                  {s.shiftType}
                                </Tag>
                              ))}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </ProtectedRoute>
  );
}
