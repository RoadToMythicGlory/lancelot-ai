'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Permission, shiftsRoleView } from '@/rbac';
import { LABELS } from '@/components/shifts/i18n';
import {
  HomeIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  AdjustmentsHorizontalIcon,
  ClockIcon,
  ArrowsRightLeftIcon,
  UserGroupIcon,
  PresentationChartLineIcon,
  RectangleGroupIcon,
  Cog6ToothIcon,
  CheckBadgeIcon,
  Squares2X2Icon,
  BuildingOffice2Icon,
  UsersIcon,
  WrenchScrewdriverIcon,
  LifebuoyIcon,
  ChevronLeftIcon,
} from '@heroicons/react/24/outline';

interface ShiftsNavItem {
  name: string;
  href: string;
  icon: React.ForwardRefExoticComponent<any>;
}

interface ShiftsNavSection {
  title: string;
  items: ShiftsNavItem[];
}

export default function ShiftsLayout({ children }: { children: React.ReactNode }) {
  const { user, hasPermission } = useAuth();
  const pathname = usePathname();

  const role = useMemo(() => shiftsRoleView(user), [user]);
  const canViewOwn = hasPermission(Permission.SHIFTS_VIEW_OWN);

  // Group A — every employee
  const employeeSection: ShiftsNavSection = {
    title: LABELS.EMPLOYEE,
    items: [
      { name: LABELS.DASHBOARD, href: '/shifts', icon: HomeIcon },
      { name: LABELS.MY_SHIFTS, href: '/shifts/my-shifts', icon: CalendarIcon },
      { name: LABELS.MY_REQUESTS, href: '/shifts/my-requests', icon: ClipboardDocumentListIcon },
      { name: LABELS.MY_PREFERENCES, href: '/shifts/my-preferences', icon: AdjustmentsHorizontalIcon },
      { name: LABELS.WORK_LOG, href: '/shifts/work-log', icon: ClockIcon },
      { name: LABELS.AGREEMENTS, href: '/shifts/agreements', icon: ArrowsRightLeftIcon },
      { name: LABELS.DAILY_SCHEDULE, href: '/shifts/daily-schedule', icon: Squares2X2Icon },
      { name: LABELS.WEEKLY_SCHEDULE, href: '/shifts/weekly-schedule', icon: RectangleGroupIcon },
      { name: LABELS.SCHEDULE_BY_EMPLOYEE, href: '/shifts/schedule-by-employee', icon: UserGroupIcon },
      { name: LABELS.SUPPORT, href: '/shifts/support', icon: LifebuoyIcon },
    ],
  };

  // Group B — מנהל מחלקה (department-scoped). Visible to 'hod' and 'admin'.
  const managerSection: ShiftsNavSection = {
    title: LABELS.HOD,
    items: [
      { name: LABELS.HOD_DASHBOARD, href: '/shifts/manage/hod', icon: PresentationChartLineIcon },
      { name: LABELS.ASSIGN_SHIFTS, href: '/shifts/manage/assign', icon: CalendarIcon },
      { name: LABELS.DEPARTMENT_SCHEDULE, href: '/shifts/manage/department-schedule', icon: RectangleGroupIcon },
      { name: LABELS.DEPARTMENT_USERS, href: '/shifts/manage/department-users', icon: UserGroupIcon },
      { name: LABELS.CONFIGURE_SHIFTS, href: '/shifts/manage/configure-shifts', icon: WrenchScrewdriverIcon },
      { name: LABELS.CONFIGURE_CONSTRAINTS, href: '/shifts/manage/configure-constraints', icon: AdjustmentsHorizontalIcon },
      { name: LABELS.SCHEDULING_RULES, href: '/shifts/manage/scheduling-rules', icon: Cog6ToothIcon },
      { name: LABELS.APPROVALS, href: '/shifts/manage/approvals', icon: CheckBadgeIcon },
      { name: LABELS.EMPLOYEE_PREFERENCES, href: '/shifts/manage/employee-preferences', icon: ClipboardDocumentListIcon },
    ],
  };

  // Group C — מנהל מערכת (cross-org). Visible only to 'admin'.
  const adminSection: ShiftsNavSection = {
    title: LABELS.SYSTEM_ADMIN,
    items: [
      { name: LABELS.ADMIN_DASHBOARD, href: '/shifts/admin', icon: PresentationChartLineIcon },
      { name: LABELS.MANAGE_DEPARTMENTS, href: '/shifts/admin/departments', icon: BuildingOffice2Icon },
      { name: LABELS.MANAGE_USERS, href: '/shifts/admin/users', icon: UsersIcon },
      { name: LABELS.SYSTEM_SETTINGS, href: '/shifts/admin/system-settings', icon: Cog6ToothIcon },
    ],
  };

  const sections: ShiftsNavSection[] = [];
  if (canViewOwn) sections.push(employeeSection);
  if (role === 'hod' || role === 'admin') sections.push(managerSection);
  if (role === 'admin') sections.push(adminSection);

  const isActive = (href: string) => {
    if (href === '/shifts') return pathname === '/shifts';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className="flex gap-4 lg:gap-6">
      {/* Secondary RTL sidebar — sits inside the main content area, on the right
          (rtl) of its sibling content. Visible from md+; collapses to a top bar on mobile. */}
      <aside className="hidden md:flex md:flex-col md:w-60 lg:w-64 shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            {LABELS.BACK_HOME}
          </Link>
          <h2 className="mt-2 text-lg font-bold text-gray-900">{LABELS.SHIFTS_HUB_TITLE}</h2>
          {user?.displayName && (
            <p className="mt-0.5 text-xs text-gray-500 truncate">
              {LABELS.WELCOME}, {user.displayName}
            </p>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-4">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                          active
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Mobile chip strip — single row at the top showing the active group. */}
      <div className="md:hidden w-full">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2 mb-3 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {sections.flatMap((section) =>
              section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              }),
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
