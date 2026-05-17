'use client';

import React, { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { Card, Spin, Empty, Button, Tag } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  RectangleGroupIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS, HEBREW_WEEKDAYS_SHORT } from '@/components/shifts/i18n';
import DepartmentPicker from '@/components/shifts/DepartmentPicker';

dayjs.locale('he');

const SETUP_QUERY = gql`
  query DeptScheduleSetup($departmentId: String!) {
    departmentShiftSetup(departmentId: $departmentId) {
      employees {
        id
        firstName
        lastName
        displayName
      }
    }
  }
`;

const WEEK_QUERY = gql`
  query WeekShiftsForDeptSchedule(
    $startDate: String!
    $endDate: String!
    $department: String!
  ) {
    shifts(startDate: $startDate, endDate: $endDate, department: $department) {
      id
      date
      shiftType
      assignedWorkers {
        userId
        user {
          id
          displayName
          firstName
          lastName
        }
      }
    }
  }
`;

export default function DepartmentSchedulePage() {
  const [activeDeptId, setActiveDeptId] = useState<string>('');
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = dayjs().startOf('week').add(weekOffset, 'week');
  const weekEnd = weekStart.add(6, 'day');

  const { data: setup } = useQuery(SETUP_QUERY, {
    variables: { departmentId: activeDeptId },
    skip: !activeDeptId,
    fetchPolicy: 'cache-and-network',
  });
  const { data: weekData, loading } = useQuery(WEEK_QUERY, {
    variables: {
      startDate: weekStart.format('YYYY-MM-DD'),
      endDate: weekEnd.format('YYYY-MM-DD'),
      department: activeDeptId,
    },
    skip: !activeDeptId,
    fetchPolicy: 'cache-and-network',
  });

  const employees = setup?.departmentShiftSetup?.employees || [];

  const matrix = useMemo(() => {
    const map = new Map<string, any[][]>();
    for (const e of employees) map.set(e.id, Array.from({ length: 7 }, () => []));
    for (const s of (weekData?.shifts as any[]) || []) {
      const dow = dayjs(s.date).day();
      for (const w of s.assignedWorkers || []) {
        const id = String(w.userId);
        if (!map.has(id)) map.set(id, Array.from({ length: 7 }, () => []));
        map.get(id)![dow].push(s);
      }
    }
    return Array.from(map.entries());
  }, [employees, weekData]);

  return (
    <ProtectedRoute requires={Permission.SHIFTS_MANAGE} departmentId={activeDeptId || undefined}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <RectangleGroupIcon className="h-5 w-5 text-gray-500" />
            {LABELS.DEPARTMENT_SCHEDULE}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <DepartmentPicker value={activeDeptId} onChange={setActiveDeptId} scope="manageable" />
            <Button
              icon={<ChevronRightIcon className="h-4 w-4" />}
              onClick={() => setWeekOffset((w) => w - 1)}
            />
            <Button onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
              השבוע
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
          {!activeDeptId ? (
            <Empty description="אנא בחר מחלקה" />
          ) : loading && matrix.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spin />
            </div>
          ) : matrix.length === 0 ? (
            <Empty description="אין עובדים במחלקה" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right p-2 sticky right-0 bg-gray-50">עובד</th>
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = weekStart.add(i, 'day');
                      return (
                        <th key={i} className="p-2 text-center min-w-28">
                          {HEBREW_WEEKDAYS_SHORT[d.day()]}
                          <div className="text-[10px] text-gray-400 font-normal">
                            {d.format('DD/MM')}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map(([userId, days]) => {
                    const emp = employees.find((e: any) => e.id === userId);
                    const name =
                      emp?.displayName ||
                      `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim() ||
                      'עובד';
                    return (
                      <tr key={userId} className="border-t">
                        <td className="p-2 font-medium text-gray-800 sticky right-0 bg-white">
                          {name}
                        </td>
                        {days.map((dayShifts, i) => (
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </ProtectedRoute>
  );
}
