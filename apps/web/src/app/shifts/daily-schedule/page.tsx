'use client';

import React, { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { Card, Spin, Empty, Button, DatePicker, Tag, Select } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/he';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission, manageableShiftDepartments } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import { LABELS } from '@/components/shifts/i18n';

dayjs.locale('he');

const DAILY_SCHEDULE = gql`
  query GetDailyScheduleForPage(
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

export default function DailySchedulePage() {
  const { user } = useAuth();
  const [date, setDate] = useState<Dayjs>(dayjs());
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

  const { data, loading } = useQuery(DAILY_SCHEDULE, {
    variables: {
      startDate: date.format('YYYY-MM-DD'),
      endDate: date.format('YYYY-MM-DD'),
      department,
    },
    skip: !department,
    fetchPolicy: 'cache-and-network',
  });

  const grouped = useMemo(() => {
    const out: Record<string, any[]> = {};
    for (const s of (data?.shifts as any[]) || []) {
      const key = s.shiftType || '—';
      if (!out[key]) out[key] = [];
      out[key].push(s);
    }
    return out;
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
            <Squares2X2Icon className="h-5 w-5 text-gray-500" />
            {LABELS.DAILY_SCHEDULE}
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
              onClick={() => setDate(date.subtract(1, 'day'))}
            />
            <DatePicker
              value={date}
              onChange={(d) => d && setDate(d)}
              allowClear={false}
              format="DD/MM/YYYY"
            />
            <Button
              icon={<ChevronLeftIcon className="h-4 w-4" />}
              onClick={() => setDate(date.add(1, 'day'))}
            />
          </div>
        </div>

        {!department ? (
          <Card>
            <Empty description="אנא בחר מחלקה" />
          </Card>
        ) : loading && Object.keys(grouped).length === 0 ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <Card>
            <Empty description="אין משמרות ביום זה" />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(grouped).map(([type, list]) => (
              <Card key={type} title={type} size="small">
                <div className="space-y-2">
                  {list.map((s: any) => (
                    <div
                      key={s.id}
                      className="border border-gray-100 rounded-md p-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 font-medium">
                          {s.startTime && s.endTime
                            ? `${s.startTime} – ${s.endTime}`
                            : '—'}
                        </span>
                        <Tag color="blue">{(s.assignedWorkers || []).length} עובדים</Tag>
                      </div>
                      <ul className="mt-1 text-xs text-gray-700 space-y-0.5">
                        {(s.assignedWorkers || []).length === 0 ? (
                          <li className="text-gray-400">אין עובדים משובצים</li>
                        ) : (
                          (s.assignedWorkers || []).map((w: any) => (
                            <li key={w.userId} className="flex items-center justify-between">
                              <span>
                                {w.user
                                  ? w.user.displayName ||
                                    `${w.user.firstName || ''} ${w.user.lastName || ''}`.trim()
                                  : 'עובד'}
                              </span>
                              {w.role && <Tag>{w.role}</Tag>}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
