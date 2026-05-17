'use client';

import React, { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { Card, Empty, Spin, Alert, Button, Tag } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS, HEBREW_WEEKDAYS } from '@/components/shifts/i18n';

dayjs.locale('he');

const MY_SHIFTS_FOR_WEEK = gql`
  query MyShiftsForWeek($limit: Int) {
    myUpcomingShifts(limit: $limit) {
      id
      date
      shiftType
      startTime
      endTime
      department
      notes
      assignedWorkers {
        userId
        user {
          id
          firstName
          lastName
        }
      }
    }
  }
`;

export default function MyShiftsPage() {
  const [weekOffset, setWeekOffset] = useState(0);

  const { data, loading, error, refetch } = useQuery(MY_SHIFTS_FOR_WEEK, {
    variables: { limit: 200 },
    fetchPolicy: 'cache-and-network',
  });

  const today = dayjs();
  const weekStart = today.startOf('week').add(weekOffset, 'week');
  const weekEnd = weekStart.add(6, 'day');

  const shiftsByDay = useMemo(() => {
    const map: Record<number, any[]> = {};
    for (let i = 0; i < 7; i += 1) map[i] = [];
    const list = (data?.myUpcomingShifts || []) as any[];
    for (const s of list) {
      const d = dayjs(s.date);
      if (d.isBefore(weekStart, 'day') || d.isAfter(weekEnd, 'day')) continue;
      const dow = d.day();
      map[dow] = map[dow] || [];
      map[dow].push(s);
    }
    return map;
  }, [data, weekStart, weekEnd]);

  return (
    <ProtectedRoute requires={Permission.SHIFTS_VIEW_OWN}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">{LABELS.MY_SHIFTS}</h1>
          <div className="flex items-center gap-2">
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
          שבוע {weekStart.format('DD/MM')} — {weekEnd.format('DD/MM/YYYY')}
        </div>

        {error && (
          <Alert
            message={LABELS.ERROR_LOADING}
            description={error.message}
            type="error"
            showIcon
          />
        )}

        {loading && !data ? (
          <div className="flex justify-center py-10">
            <Spin size="large" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
            {HEBREW_WEEKDAYS.map((label, dow) => {
              const date = weekStart.add(dow, 'day');
              const dayShifts = shiftsByDay[dow] || [];
              const isToday = date.isSame(today, 'day');
              return (
                <Card
                  key={dow}
                  size="small"
                  className={isToday ? 'ring-2 ring-blue-200' : ''}
                  title={
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-xs text-gray-400">
                        {date.format('DD/MM')}
                      </span>
                    </div>
                  }
                >
                  {dayShifts.length === 0 ? (
                    <div className="text-xs text-gray-400 py-3 text-center">—</div>
                  ) : (
                    <div className="space-y-2">
                      {dayShifts.map((s: any) => (
                        <div
                          key={s.id}
                          className="border border-gray-100 rounded-md p-2 bg-blue-50/40"
                        >
                          <div className="flex items-center gap-1 text-xs font-medium text-blue-700">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            <span>{s.shiftType}</span>
                          </div>
                          {s.startTime && s.endTime && (
                            <div className="text-xs text-gray-600 mt-1">
                              {s.startTime} – {s.endTime}
                            </div>
                          )}
                          {s.department && (
                            <Tag className="mt-1" color="default">
                              {s.department}
                            </Tag>
                          )}
                          {s.notes && (
                            <div className="text-xs text-gray-500 mt-1 truncate">
                              {s.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {!loading && (data?.myUpcomingShifts?.length ?? 0) === 0 && (
          <Card>
            <Empty description={LABELS.EMPTY_NO_SHIFTS} />
          </Card>
        )}

        <div className="text-left">
          <a
            className="text-sm text-blue-600 hover:underline"
            onClick={() => refetch()}
          >
            {LABELS.REFRESH_NOW}
          </a>
        </div>
      </div>
    </ProtectedRoute>
  );
}
