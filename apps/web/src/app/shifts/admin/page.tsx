'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from 'antd';
import {
  PresentationChartLineIcon,
  BuildingOffice2Icon,
  UsersIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';
import { Alert } from 'antd';
import { LABELS } from '@/components/shifts/i18n';

const ADMIN_LINKS = [
  { label: LABELS.MANAGE_DEPARTMENTS, href: '/shifts/admin/departments', icon: BuildingOffice2Icon },
  { label: LABELS.MANAGE_USERS, href: '/shifts/admin/users', icon: UsersIcon },
  { label: LABELS.SYSTEM_SETTINGS, href: '/shifts/admin/system-settings', icon: Cog6ToothIcon },
];

export default function AdminDashboardPage() {
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
              <PresentationChartLineIcon className="h-5 w-5 text-gray-500" />
              {LABELS.ADMIN_DASHBOARD}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              ניהול נתונים ארגוניים — מחלקות, משתמשים והגדרות מערכת.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ADMIN_LINKS.map(({ label, href, icon: Icon }) => (
              <Link key={href} href={href}>
                <Card hoverable>
                  <div className="flex items-center gap-3">
                    <Icon className="h-8 w-8 text-blue-600" />
                    <span className="text-base font-semibold text-gray-800">{label}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
