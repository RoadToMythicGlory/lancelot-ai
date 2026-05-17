'use client';

import React, { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { Card, Spin, Empty, Button, Tag, Select } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS, HEBREW_WEEKDAYS_SHORT } from '@/components/shifts/i18n';
import DepartmentPicker from '@/components/shifts/DepartmentPicker';

dayjs.locale('he');

const PREFERENCES = gql`
  query EmployeePreferences($departmentId: String!, $weekStartDate: String!) {
    preferences(departmentId: $departmentId, weekStartDate: $weekStartDate) {
      id
      userId
      weekStartDate
      submittedAt
      user {
        id
        displayName
        firstName
        lastName
      }
      entries {
        dayOfWeek
        shiftTypeId
        aplId
        rank
        status
      }
    }
  }
`;

const SHIFT_TYPES = gql`
  query ShiftTypeDefsForPrefs($departmentId: String!) {
    shiftTypeDefs(departmentId: $departmentId) {
      id
      name
    }
  }
`;

const STATUS_COLORS: Record<string, string> = {
  available: 'green',
  unavailable: 'red',
  prefer: 'blue',
  prefer_not: 'orange',
};
const STATUS_LABELS: Record<string, string> = {
  available: 'זמין',
  unavailable: 'לא זמין',
  prefer: 'מעדיף',
  prefer_not: 'מעדיף שלא',
};

export default function EmployeePreferencesPage() {
  const [activeDeptId, setActiveDeptId] = useState<string>('');
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = dayjs().startOf('week').add(weekOffset, 'week');
  const weekStartStr = weekStart.format('YYYY-MM-DD');

  const { data, loading } = useQuery(PREFERENCES, {
    variables: { departmentId: activeDeptId, weekStartDate: weekStartStr },
    skip: !activeDeptId,
    fetchPolicy: 'cache-and-network',
  });
  const { data: typesData } = useQuery(SHIFT_TYPES, {
    variables: { departmentId: activeDeptId },
    skip: !activeDeptId,
  });

  const prefs = data?.preferences || [];
  const shiftTypes = typesData?.shiftTypeDefs || [];
  const [selectedTypeId, setSelectedTypeId] = useState<string>('all');

  const filtered = useMemo(() => {
    if (selectedTypeId === 'all') return prefs;
    return prefs
      .map((p: any) => ({
        ...p,
        entries: (p.entries || []).filter((e: any) => e.shiftTypeId === selectedTypeId),
      }))
      .filter((p: any) => p.entries.length > 0);
  }, [prefs, selectedTypeId]);

  return (
    <ProtectedRoute requires={Permission.SHIFTS_MANAGE} departmentId={activeDeptId || undefined}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <ClipboardDocumentListIcon className="h-5 w-5 text-gray-500" />
            {LABELS.EMPLOYEE_PREFERENCES}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <DepartmentPicker value={activeDeptId} onChange={setActiveDeptId} scope="manageable" />
            <Select
              value={selectedTypeId}
              onChange={setSelectedTypeId}
              options={[{ value: 'all', label: 'כל סוגי המשמרות' }].concat(
                shiftTypes.map((t: any) => ({ value: t.id, label: t.name })),
              )}
              style={{ minWidth: 180 }}
            />
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
          שבוע מתחיל ב־{weekStart.format('DD/MM/YYYY')}
        </div>

        <Card>
          {!activeDeptId ? (
            <Empty description="אנא בחר מחלקה" />
          ) : loading && prefs.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spin />
            </div>
          ) : filtered.length === 0 ? (
            <Empty description="לא הוגשו העדפות עבור שבוע זה" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right p-2 sticky right-0 bg-gray-50">עובד</th>
                    {HEBREW_WEEKDAYS_SHORT.map((d, i) => (
                      <th key={i} className="p-2 text-center">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p: any) => {
                    const name =
                      p.user?.displayName ||
                      `${p.user?.firstName || ''} ${p.user?.lastName || ''}`.trim() ||
                      'עובד';
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="p-2 font-medium text-gray-800 sticky right-0 bg-white">
                          {name}
                        </td>
                        {Array.from({ length: 7 }, (_, day) => {
                          const dayEntries = (p.entries || []).filter(
                            (e: any) => e.dayOfWeek === day,
                          );
                          if (dayEntries.length === 0) {
                            return (
                              <td key={day} className="p-2 text-gray-300 text-xs text-center">
                                —
                              </td>
                            );
                          }
                          return (
                            <td key={day} className="p-1 align-top">
                              <div className="flex flex-col gap-1">
                                {dayEntries.map((e: any, i: number) => (
                                  <Tag key={i} color={STATUS_COLORS[e.status] || 'default'}>
                                    {STATUS_LABELS[e.status] || e.status}
                                  </Tag>
                                ))}
                              </div>
                            </td>
                          );
                        })}
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
