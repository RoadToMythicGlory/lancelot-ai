'use client';

import React from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import WeekShiftsView from '@/components/shifts/WeekShiftsView';
import { LABELS } from '@/components/shifts/i18n';
import { RectangleGroupIcon } from '@heroicons/react/24/outline';

export default function WeeklySchedulePage() {
  return (
    <ProtectedRoute requires={Permission.SHIFTS_VIEW_OWN}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <RectangleGroupIcon className="h-5 w-5 text-gray-500" />
            {LABELS.WEEKLY_SCHEDULE}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            צפייה בכל המשמרות של השבוע במחלקה.
          </p>
        </div>
        <WeekShiftsView />
      </div>
    </ProtectedRoute>
  );
}
