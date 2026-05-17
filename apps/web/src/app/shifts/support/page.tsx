'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Button } from 'antd';
import { LifebuoyIcon } from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { LABELS } from '@/components/shifts/i18n';

export default function ShiftsSupportPage() {
  return (
    <ProtectedRoute requires={Permission.SHIFTS_VIEW_OWN}>
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
            <LifebuoyIcon className="h-5 w-5 text-gray-500" />
            {LABELS.SUPPORT}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            צריך עזרה? פנה לצוות התמיכה דרך מערכת העזרה הראשית.
          </p>
        </div>

        <Card>
          <div className="space-y-4">
            <p className="text-gray-700">
              למענה על שאלות, בקשות עזרה או דיווח על בעיה — עבור למערכת התמיכה.
            </p>
            <Link href="/help">
              <Button type="primary">פתח את מערכת העזרה</Button>
            </Link>
          </div>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
