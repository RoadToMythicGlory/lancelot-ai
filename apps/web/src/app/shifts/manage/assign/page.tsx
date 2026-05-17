'use client';

import React, { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { Card, Spin, Empty, Button, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  SparklesIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS, HEBREW_WEEKDAYS_SHORT } from '@/components/shifts/i18n';
import DepartmentPicker from '@/components/shifts/DepartmentPicker';
import AiSuggestionsModal from '@/components/shifts/modals/AiSuggestionsModal';
import AssignShiftModal from '@/components/shifts/modals/AssignShiftModal';

dayjs.locale('he');

const SETUP_QUERY = gql`
  query AssignDepartmentSetup($departmentId: String!) {
    departmentShiftSetup(departmentId: $departmentId) {
      departmentId
      employees {
        id
        firstName
        lastName
        displayName
      }
      apls {
        id
        name
        color
        order
        eligibleUserIds
      }
      shiftTypes {
        id
        name
        startTime
        endTime
        order
      }
    }
  }
`;

const WEEK_SHIFTS_QUERY = gql`
  query WeekShiftsForAssign(
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

export default function AssignShiftsPage() {
  const [activeDeptId, setActiveDeptId] = useState<string>('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [activeCell, setActiveCell] = useState<{
    shiftId: string | null;
    apl: { id: string; name: string };
    candidates: Array<{ id: string; displayName: string }>;
  } | null>(null);

  const weekStart = dayjs().startOf('week').add(weekOffset, 'week');
  const weekEnd = weekStart.add(6, 'day');

  const { data: setup, loading: setupLoading } = useQuery(SETUP_QUERY, {
    variables: { departmentId: activeDeptId },
    skip: !activeDeptId,
    fetchPolicy: 'cache-and-network',
  });

  const { data: weekData, loading: weekLoading, refetch } = useQuery(WEEK_SHIFTS_QUERY, {
    variables: {
      startDate: weekStart.format('YYYY-MM-DD'),
      endDate: weekEnd.format('YYYY-MM-DD'),
      department: activeDeptId,
    },
    skip: !activeDeptId,
    fetchPolicy: 'cache-and-network',
  });

  const employees = setup?.departmentShiftSetup?.employees || [];
  const apls = setup?.departmentShiftSetup?.apls || [];
  const shiftTypes = setup?.departmentShiftSetup?.shiftTypes || [];

  const employeeById = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  // Index existing shifts: `${date}|${shiftTypeName}` -> shift, plus assignments by aplId.
  const grid = useMemo(() => {
    const out = new Map<string, { shift: any | null; byApl: Map<string, any[]> }>();
    for (let i = 0; i < 7; i += 1) {
      const date = weekStart.add(i, 'day').format('YYYY-MM-DD');
      for (const st of shiftTypes) {
        const key = `${date}|${st.name}`;
        out.set(key, { shift: null, byApl: new Map() });
      }
    }
    for (const s of (weekData?.shifts as any[]) || []) {
      const key = `${dayjs(s.date).format('YYYY-MM-DD')}|${s.shiftType}`;
      const cell = out.get(key);
      if (!cell) continue;
      cell.shift = s;
      for (const w of s.assignedWorkers || []) {
        const aplKey = String(w.aplId || w.role || '');
        if (!cell.byApl.has(aplKey)) cell.byApl.set(aplKey, []);
        cell.byApl.get(aplKey)!.push(w);
      }
    }
    return out;
  }, [weekData, shiftTypes, weekStart]);

  function openAssign(date: string, shiftTypeName: string, apl: any) {
    const cell = grid.get(`${date}|${shiftTypeName}`);
    const eligible = (apl.eligibleUserIds || []) as string[];
    const candidates = (eligible.length > 0
      ? eligible.map((id) => employeeById.get(id)).filter(Boolean)
      : employees
    ).map((u: any) => ({
      id: u.id,
      displayName:
        u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
    }));
    setActiveCell({
      shiftId: cell?.shift?.id || null,
      apl: { id: apl.id, name: apl.name },
      candidates,
    });
    setAssignOpen(true);
  }

  return (
    <ProtectedRoute requires={Permission.SHIFTS_MANAGE} departmentId={activeDeptId || undefined}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-gray-500" />
            {LABELS.ASSIGN_SHIFTS}
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
            <Button
              type="primary"
              icon={<SparklesIcon className="h-4 w-4" />}
              onClick={() => setAiOpen(true)}
              disabled={!activeDeptId}
            >
              שיבוץ אוטומטי
            </Button>
          </div>
        </div>

        <div className="text-sm text-gray-600 px-1">
          {weekStart.format('DD/MM')} — {weekEnd.format('DD/MM/YYYY')}
        </div>

        {!activeDeptId ? (
          <Card>
            <Empty description="אנא בחר מחלקה" />
          </Card>
        ) : (setupLoading || weekLoading) && shiftTypes.length === 0 ? (
          <div className="flex justify-center py-10">
            <Spin size="large" />
          </div>
        ) : shiftTypes.length === 0 ? (
          <Card>
            <Empty
              description={
                <>
                  <p>לא הוגדרו סוגי משמרות במחלקה זו.</p>
                  <p className="text-sm mt-1">
                    עבור ל
                    <a href="/shifts/manage/configure-shifts" className="text-blue-600 mx-1">
                      הגדרת משמרות
                    </a>
                    כדי ליצור.
                  </p>
                </>
              }
            />
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="text-right p-2 sticky right-0 bg-white">משמרת / APL</th>
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = weekStart.add(i, 'day');
                      return (
                        <th key={i} className="p-2 text-center min-w-32">
                          <div className="text-sm">{HEBREW_WEEKDAYS_SHORT[d.day()]}</div>
                          <div className="text-xs text-gray-400">{d.format('DD/MM')}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {shiftTypes.map((st: any) => (
                    <React.Fragment key={st.id}>
                      <tr>
                        <td className="p-2 font-semibold text-gray-700 bg-gray-50 sticky right-0">
                          <div>{st.name}</div>
                          <div className="text-xs text-gray-400 font-normal">
                            {st.startTime}–{st.endTime}
                          </div>
                        </td>
                        <td colSpan={7} className="text-xs text-gray-400 px-2 italic" />
                      </tr>
                      {apls.map((apl: any) => (
                        <tr key={`${st.id}-${apl.id}`} className="align-top">
                          <td className="p-2 sticky right-0 bg-white">
                            <Tag color={apl.color || 'default'}>{apl.name}</Tag>
                          </td>
                          {Array.from({ length: 7 }, (_, i) => {
                            const date = weekStart.add(i, 'day').format('YYYY-MM-DD');
                            const cell = grid.get(`${date}|${st.name}`);
                            const assignments = cell?.byApl.get(apl.id) || [];
                            return (
                              <td
                                key={i}
                                className="p-1 border border-gray-100 rounded-md cursor-pointer hover:bg-blue-50 transition-colors min-w-32"
                                onClick={() => openAssign(date, st.name, apl)}
                              >
                                {assignments.length === 0 ? (
                                  <div className="text-center text-xs text-gray-300 py-2">+</div>
                                ) : (
                                  <div className="flex flex-wrap gap-1 p-1">
                                    {assignments.map((w: any) => (
                                      <Tooltip
                                        key={w.userId}
                                        title={w.role || apl.name}
                                      >
                                        <Tag color="blue">
                                          {w.user
                                            ? w.user.displayName ||
                                              `${w.user.firstName || ''} ${w.user.lastName || ''}`.trim()
                                            : 'עובד'}
                                        </Tag>
                                      </Tooltip>
                                    ))}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <AiSuggestionsModal
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          departmentId={activeDeptId}
          weekStart={weekStart.format('YYYY-MM-DD')}
          weekEnd={weekEnd.format('YYYY-MM-DD')}
          onApplied={() => refetch()}
        />

        <AssignShiftModal
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          shiftId={activeCell?.shiftId || null}
          apl={activeCell?.apl || null}
          candidates={activeCell?.candidates || []}
          onAssigned={() => refetch()}
        />
      </div>
    </ProtectedRoute>
  );
}
