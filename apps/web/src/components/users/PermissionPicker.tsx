'use client';

import React, { useMemo } from 'react';
import { Checkbox, Collapse, Space, Button, Tag, Divider } from 'antd';
import { Permission } from '@/rbac';

interface PermissionPickerProps {
  value?: string[];
  onChange?: (permissions: string[]) => void;
  disabled?: boolean;
}

interface PermissionGroup {
  label: string;
  permissions: { key: string; label: string }[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: 'משתמשים',
    permissions: [
      { key: Permission.USERS_VIEW, label: 'צפייה' },
      { key: Permission.USERS_MANAGE_DEPT, label: 'ניהול מחלקתי' },
      { key: Permission.USERS_MANAGE_ALL, label: 'ניהול כללי' },
      { key: Permission.USERS_DELETE, label: 'מחיקה' },
    ],
  },
  {
    label: 'שידורים',
    permissions: [
      { key: Permission.BROADCAST_VIEW, label: 'צפייה' },
      { key: Permission.BROADCAST_MANAGE, label: 'ניהול' },
      { key: Permission.BROADCAST_DELETE, label: 'מחיקה' },
    ],
  },
  {
    label: 'מחסן / ציוד',
    permissions: [
      { key: Permission.WAREHOUSE_VIEW, label: 'צפייה' },
      { key: Permission.WAREHOUSE_MANAGE, label: 'ניהול' },
      { key: Permission.WAREHOUSE_FORCE_RELEASE, label: 'שחרור כפוי' },
      { key: Permission.WAREHOUSE_DISABLE_EQUIPMENT, label: 'השבתת ציוד' },
    ],
  },
  {
    label: 'משמרות',
    permissions: [
      { key: Permission.SHIFTS_VIEW_OWN, label: 'צפייה אישית' },
      { key: Permission.SHIFTS_VIEW_ALL, label: 'צפייה כללית' },
      { key: Permission.SHIFTS_MANAGE, label: 'ניהול' },
    ],
  },
  {
    label: 'MCR',
    permissions: [
      { key: Permission.MCR_VIEW, label: 'צפייה' },
      { key: Permission.MCR_MANAGE, label: 'ניהול' },
      { key: Permission.MCR_ADMIN, label: 'מנהל MCR' },
    ],
  },
  {
    label: 'Vizrt',
    permissions: [
      { key: Permission.VIZRT_VIEW, label: 'צפייה' },
      { key: Permission.VIZRT_OPERATE, label: 'הפעלה' },
      { key: Permission.VIZRT_ADMIN, label: 'מנהל' },
    ],
  },
  {
    label: 'ארגון / חיוב',
    permissions: [
      { key: Permission.ORG_VIEW, label: 'צפייה בארגון' },
      { key: Permission.ORG_MANAGE, label: 'ניהול ארגון' },
      { key: Permission.BILLING_VIEW, label: 'צפייה בחיוב' },
      { key: Permission.BILLING_MANAGE, label: 'ניהול חיוב' },
      { key: Permission.AUDIT_VIEW, label: 'צפייה ביומן' },
      { key: Permission.AUDIT_EXPORT, label: 'ייצוא יומן' },
    ],
  },
  {
    label: 'הגדרות / אינטגרציות',
    permissions: [
      { key: Permission.SETTINGS_VIEW, label: 'צפייה בהגדרות' },
      { key: Permission.SETTINGS_MANAGE, label: 'ניהול הגדרות' },
      { key: Permission.INTEGRATIONS_VIEW, label: 'צפייה באינטגרציות' },
      { key: Permission.INTEGRATIONS_MANAGE, label: 'ניהול אינטגרציות' },
    ],
  },
  {
    label: 'תבניות תפקידים',
    permissions: [
      { key: Permission.ROLE_TEMPLATES_MANAGE, label: 'ניהול תבניות' },
    ],
  },
  {
    label: 'לוח מחוונים',
    permissions: [
      { key: Permission.DASHBOARD_VIEW, label: 'צפייה' },
      { key: Permission.DASHBOARD_MANAGE, label: 'ניהול' },
    ],
  },
  {
    label: 'מדיה / זכויות / תהליכים',
    permissions: [
      { key: Permission.MEDIA_VIEW, label: 'צפייה במדיה' },
      { key: Permission.MEDIA_MANAGE, label: 'ניהול מדיה' },
      { key: Permission.RIGHTS_VIEW, label: 'צפייה בזכויות' },
      { key: Permission.RIGHTS_MANAGE, label: 'ניהול זכויות' },
      { key: Permission.WORKFLOWS_VIEW, label: 'צפייה בתהליכים' },
      { key: Permission.WORKFLOWS_MANAGE, label: 'ניהול תהליכים' },
    ],
  },
  {
    label: 'כללי',
    permissions: [
      { key: Permission.CHAT_USE, label: "צ'אט" },
    ],
  },
];

export default function PermissionPicker({ value = [], onChange, disabled }: PermissionPickerProps) {
  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (perm: string) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(perm)) {
      next.delete(perm);
    } else {
      next.add(perm);
    }
    onChange?.(Array.from(next));
  };

  const toggleGroup = (group: PermissionGroup, checked: boolean) => {
    if (disabled) return;
    const next = new Set(selected);
    for (const p of group.permissions) {
      if (checked) {
        next.add(p.key);
      } else {
        next.delete(p.key);
      }
    }
    onChange?.(Array.from(next));
  };

  const selectAll = () => {
    if (disabled) return;
    const all = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    onChange?.(all);
  };

  const selectNone = () => {
    if (disabled) return;
    onChange?.([]);
  };

  const items = PERMISSION_GROUPS.map((group, idx) => {
    const groupPerms = group.permissions.map((p) => p.key);
    const allChecked = groupPerms.every((k) => selected.has(k));
    const someChecked = groupPerms.some((k) => selected.has(k));

    return {
      key: String(idx),
      label: (
        <Space>
          <Checkbox
            checked={allChecked}
            indeterminate={!allChecked && someChecked}
            onChange={(e) => toggleGroup(group, e.target.checked)}
            disabled={disabled}
            onClick={(e) => e.stopPropagation()}
          />
          <span>{group.label}</span>
          <Tag>{groupPerms.filter((k) => selected.has(k)).length}/{groupPerms.length}</Tag>
        </Space>
      ),
      children: (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {group.permissions.map((p) => (
            <Checkbox
              key={p.key}
              checked={selected.has(p.key)}
              onChange={() => toggle(p.key)}
              disabled={disabled}
            >
              {p.label}
            </Checkbox>
          ))}
        </div>
      ),
    };
  });

  return (
    <div>
      <Space style={{ marginBottom: 8 }}>
        <Button size="small" onClick={selectAll} disabled={disabled}>בחר הכל</Button>
        <Button size="small" onClick={selectNone} disabled={disabled}>נקה הכל</Button>
        <Tag color="blue">{selected.size} הרשאות נבחרו</Tag>
      </Space>
      <Collapse items={items} size="small" />
    </div>
  );
}

export { PERMISSION_GROUPS };
