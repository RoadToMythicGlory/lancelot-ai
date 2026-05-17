'use client';

import React, { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { Card, Spin, Empty, Button, Table, Tag, Statistic } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import { LABELS } from '@/components/shifts/i18n';

dayjs.locale('he');

const SHIFTS_FOR_WEEK = gql`
  query MyShiftsRange($startDate: String!, $endDate: String!, $userId: String!) {
    shifts(startDate: $startDate, endDate: $endDate, userId: $userId) {
      id
      date
      shiftType
      department
      startTime
      endTime
      assignedWorkers {
        userId
        role
      }
    }
  }
`;

function parseTime(t?: string | null): { h: number; m: number } | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

function shiftHours(shift: any): number {
  const start = parseTime(shift.startTime);
  const end = parseTime(shift.endTime);
  if (!start || !end) return 0;
  let mins = (end.h * 60 + end.m) - (start.h * 60 + start.m);
  if (mins < 0) mins += 24 * 60; // overnight
  return Math.round((mins / 60) * 100) / 100;
}

export default function WorkLogPage() {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = dayjs().startOf('week').add(weekOffset, 'week');
  const weekEnd = weekStart.add(6, 'day');

  const { data, loading } = useQuery(SHIFTS_FOR_WEEK, {
    variables: {
      startDate: weekStart.format('YYYY-MM-DD'),
      endDate: weekEnd.format('YYYY-MM-DD'),
      userId: user?.id || '',
    },
    skip: !user?.id,
    fetchPolicy: 'cache-and-network',
  });

  const rows = (data?.shifts || []) as any[];
  const stats = useMemo(() => {
    let totalHours = 0;
    let nightCount = 0;
    for (const s of rows) {
      totalHours += shiftHours(s);
      const start = parseTime(s.startTime);
      if (start && (start.h >= 22 || start.h < 6)) nightCount += 1;
    }
    return {
      totalShifts: rows.length,
      totalHours: Math.round(totalHours * 100) / 100,
      nightCount,
    };
  }, [rows]);

  const columns = [
    {
      title: 'תאריך',
      dataIndex: 'date',
      key: 'date',
      render: (d: string) => `${dayjs(d).format('DD/MM/YYYY')} (${dayjs(d).format('dddd')})`,
    },
    { title: 'משמרת', dataIndex: 'shiftType', key: 'shiftType' },
    {
      title: 'שעות',
      key: 'time',
      render: (r: any) =>
        r.startTime && r.endTime ? `${r.startTime} – ${r.endTime}` : '—',
    },
    {
      title: 'סה"כ שעות',
      key: 'hours',
      render: (r: any) => <Tag color="blue">{shiftHours(r) || '—'}</Tag>,
    },
    { title: 'מחלקה', dataIndex: 'department', key: 'department' },
  ];

  return (
    <ProtectedRoute requires={Permission.SHIFTS_VIEW_OWN}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <ClockIcon className="h-5 w-5 text-gray-500" />
            {LABELS.WORK_LOG}
          </h1>
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
          {weekStart.format('DD/MM')} — {weekEnd.format('DD/MM/YYYY')}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <Statistic title="סה״כ משמרות" value={stats.totalShifts} />
          </Card>
          <Card>
            <Statistic title="סה״כ שעות עבודה" value={stats.totalHours} suffix="שעות" />
          </Card>
          <Card>
            <Statistic title="משמרות לילה" value={stats.nightCount} />
          </Card>
        </div>

        <Card title="פירוט משמרות">
          {loading && rows.length === 0 ? (
            <div className="flex justify-center py-6">
              <Spin />
            </div>
          ) : rows.length === 0 ? (
            <Empty description="לא נמצאו משמרות בשבוע זה" />
          ) : (
            <Table
              dataSource={rows}
              columns={columns}
              rowKey="id"
              pagination={false}
            />
          )}
        </Card>
      </div>
    </ProtectedRoute>
  );
}
