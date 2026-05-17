'use client';

import React, { useEffect, useMemo } from 'react';
import { Select } from 'antd';
import { gql, useQuery } from '@apollo/client';
import { useAuth } from '@/contexts/AuthContext';
import { manageableShiftDepartments } from '@/rbac';
import { LABELS } from './i18n';

const ALL_DEPARTMENTS = gql`
  query AllDepartmentsForShifts {
    departments {
      id
      code
      name
      hebrewName
      isActive
    }
  }
`;

interface DepartmentPickerProps {
  value: string | null;
  onChange: (deptId: string) => void;
  /** Show all departments (admin only) instead of just user's manageable list. */
  scope?: 'manageable' | 'all';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Picker that auto-locks for `DEPARTMENT_ADMIN` (their own dept(s)) and
 * lets `SYSTEM_ADMIN` / `IT_ADMIN` choose from all departments. The active
 * department flows out as `value` so each manager page can pass it through
 * to its `activeDeptId`-driven queries.
 */
export default function DepartmentPicker({
  value,
  onChange,
  scope = 'manageable',
  className,
  style,
}: DepartmentPickerProps) {
  const { user } = useAuth();
  const isSystemAdmin =
    user?.systemRole === 'SYSTEM_ADMIN' || user?.systemRole === 'IT_ADMIN';

  // Hit the all-departments query only when needed (admin and full scope).
  const { data: deptsData } = useQuery(ALL_DEPARTMENTS, {
    skip: !isSystemAdmin || scope !== 'all',
  });

  const options = useMemo(() => {
    if (isSystemAdmin && scope === 'all' && deptsData?.departments) {
      return (deptsData.departments as any[])
        .filter((d) => d.isActive !== false)
        .map((d) => ({
          value: d.code || d.id,
          label: d.hebrewName || d.name || d.code,
        }));
    }
    const list = manageableShiftDepartments(user as any);
    return list.map((d) => ({
      value: d.departmentId,
      label: d.departmentName || d.departmentId,
    }));
  }, [isSystemAdmin, deptsData, user, scope]);

  // Auto-pick the first option when nothing is selected.
  useEffect(() => {
    if (!value && options.length > 0) {
      onChange(options[0].value);
    }
  }, [value, options, onChange]);

  if (options.length === 0) return null;

  // DEPARTMENT_ADMIN with a single dept: render a passive label.
  if (!isSystemAdmin && options.length === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-sm text-gray-700">
        <span className="text-gray-500">מחלקה:</span>
        <span className="font-medium">{options[0].label}</span>
      </span>
    );
  }

  return (
    <Select
      value={value || undefined}
      onChange={onChange}
      options={options}
      placeholder={LABELS.SELECT_DEPARTMENT}
      className={className}
      style={{ minWidth: 200, ...style }}
    />
  );
}
