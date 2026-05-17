'use client';

import React from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import AvailabilityConstraints from '@/components/shifts/AvailabilityConstraints';
import { LABELS } from '@/components/shifts/i18n';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';

export default function MyPreferencesPage() {
  return (
    <ProtectedRoute requires={Permission.SHIFTS_VIEW_OWN}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <AdjustmentsHorizontalIcon className="h-5 w-5 text-gray-500" />
            {LABELS.MY_PREFERENCES}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            עדכן את העדפות הזמינות שלך לכל סוג משמרת. השינויים נלקחים בחשבון בעת השיבוץ האוטומטי.
          </p>
        </div>

        <AvailabilityConstraints />
      </div>
    </ProtectedRoute>
  );
}
