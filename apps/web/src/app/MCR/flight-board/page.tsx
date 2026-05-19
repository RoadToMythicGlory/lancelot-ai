'use client';

import React from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { FlightBoardPageInner } from '@/app/flight-board/page';

// Stable title used to identify (and auto-create) the dedicated MCR
// Flight Board on first visit. Editing the board's title from the UI
// will break the auto-resolve — admins who rename should also rename
// this constant.
const MCR_FLIGHT_BOARD_TITLE = 'לוח טיסות - MCR';

// All ActivityRow columns that the MCR Schedule grid shows today.
// Keep this in sync with the activity column group in
// `apps/web/src/app/flight-board/constants.ts`.
const MCR_BOARD_COLUMNS: string[] = [
  'date',
  'raw.activity.activityName',
  'raw.activity.time',
  'raw.activity.endTime',
  'raw.activity.source',
  'raw.activity.channel',
  'raw.activity.equipment',
  'raw.activity.backup',
  'raw.activity.routing',
  'raw.activity.broadcastType',
  'raw.activity.status',
  'raw.activity.notes',
  'raw.activity.isManual',
];

export default function McrFlightBoardPage() {
  return (
    <ProtectedRoute requires={Permission.MCR_FLIGHT_BOARD_VIEW}>
      <FlightBoardPageInner
        pinnedBoard={{
          matchTitle: MCR_FLIGHT_BOARD_TITLE,
          pageTitle: 'לוח טיסות MCR',
          pageSubtitle: 'תצוגת לוח טיסות עם עמודות לוח ה-MCR',
          initialBoardInput: {
            title: MCR_FLIGHT_BOARD_TITLE,
            description:
              'לוח טיסות ייעודי עם כל העמודות מטבלת לוח ה-MCR. נוצר אוטומטית בכניסה ראשונה.',
            refreshIntervalSec: 30,
            visibility: 'ALL',
            isDefault: false,
            panels: [
              {
                title: 'לוח MCR',
                type: 'TABLE',
                width: 'FULL',
                itemTypes: ['ACTIVITY'],
                visibleColumns: MCR_BOARD_COLUMNS,
                chartGroupBy: null,
                chartMetric: 'COUNT',
                sortField: 'startTime',
                sortDirection: 'ASC',
                rowLimit: null,
                order: 0,
              },
            ],
          },
        }}
      />
    </ProtectedRoute>
  );
}
