'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Button, Alert } from 'antd';
import { UsersIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import { LABELS } from '@/components/shifts/i18n';

export default function ManageUsersPage() {
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
              <UsersIcon className="h-5 w-5 text-gray-500" />
              {LABELS.MANAGE_USERS}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              ניהול משתמשי המערכת — תפקידי מערכת, שיוך למחלקות והרשאות.
            </p>
          </div>

          <Card>
            <p className="text-gray-700 mb-3">
              ניהול משתמשים גלובלי מתבצע במסך הראשי של המערכת.
              מסך זה כולל בחירת תפקיד מערכת, שיוך למחלקות, וניהול הרשאות.
              לניהול עובדים בתוך מחלקה מסוימת (כולל שיוך ל־APL), השתמש במסך
              <Link href="/shifts/manage/department-users" className="text-blue-600 mx-1">
                {LABELS.DEPARTMENT_USERS}
              </Link>
              .
            </p>
            <Link href="/users">
              <Button type="primary" icon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}>
                פתיחת ניהול המשתמשים
              </Button>
            </Link>
          </Card>
        </div>
      )}
    </ProtectedRoute>
  );
}
