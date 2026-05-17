'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Button, Alert, Statistic } from 'antd';
import { Cog6ToothIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import { LABELS } from '@/components/shifts/i18n';

export default function SystemSettingsPage() {
  const { user } = useAuth();
  const isSystemAdmin =
    user?.systemRole === 'SYSTEM_ADMIN' || user?.systemRole === 'IT_ADMIN';

  return (
    <ProtectedRoute requires={Permission.SHIFTS_VIEW_ALL}>
      {!isSystemAdmin ? (
        <Alert
          message={LABELS.NO_PERMISSION}
          description="עמוד זה מיועד למנהלי מערכת בלבד."
          type="error"
          showIcon
        />
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
              <Cog6ToothIcon className="h-5 w-5 text-gray-500" />
              {LABELS.SYSTEM_SETTINGS}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              הגדרות גלובליות של המערכת. לכל מחלקה הגדרות נוספות במסך
              {' '}
              <Link href="/shifts/manage/configure-shifts" className="text-blue-600">
                הגדרת משמרות
              </Link>
              .
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <Statistic title="גרסת מערכת המשמרות" value="2.0" />
              <p className="text-xs text-gray-500 mt-1">פורט מלא של חוויית Crystal Shift.</p>
            </Card>
            <Card>
              <Statistic title="שפת ממשק" value="עברית" />
              <p className="text-xs text-gray-500 mt-1">RTL מלא, dayjs ב־he.</p>
            </Card>
            <Card>
              <Statistic title="הצעות אוטומטיות" value="פעיל" />
              <p className="text-xs text-gray-500 mt-1">aiScheduleSuggest פועל בכל מחלקה.</p>
            </Card>
          </div>

          <Card title="הגדרות מתקדמות">
            <div className="space-y-3 text-gray-700">
              <p>
                ניהול הרשאות ותבניות תפקידים מתבצע בלשונית
                {' '}
                <Link href="/settings" className="text-blue-600">
                  הגדרות הראשית
                </Link>
                .
              </p>
              <p>
                לתצוגת לוג ביקורת על שינויים במערכת, פתח את
                {' '}
                <Link href="/audit-log" className="text-blue-600">
                  יומן הביקורת
                </Link>
                .
              </p>
              <Link href="/settings">
                <Button icon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}>
                  פתיחת הגדרות הראשיות
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      )}
    </ProtectedRoute>
  );
}
