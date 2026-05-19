'use client';

import React, { useMemo } from 'react';
import { Checkbox, Collapse, Space, Button, Tag, Tooltip } from 'antd';
import { Permission } from '@/rbac';

interface PermissionPickerProps {
  value?: string[];
  onChange?: (permissions: string[]) => void;
  disabled?: boolean;
  /**
   * Permissions that are already granted by selected presets (department,
   * role within department, role template, etc.). They are rendered as
   * pre-checked + disabled so the admin can see what is already in effect,
   * but they are NOT included in the `value` payload sent back via onChange.
   */
  presetValue?: string[];
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
    label: 'מערך השידורים',
    permissions: [
      { key: Permission.BROADCAST_ARRAY_VIEW, label: 'צפייה' },
      { key: Permission.BROADCAST_ARRAY_MANAGE, label: 'ניהול' },
    ],
  },
  {
    label: 'אולמות / שידורי חוץ',
    permissions: [
      { key: Permission.VENUES_VIEW, label: 'צפייה' },
      { key: Permission.VENUES_MANAGE, label: 'ניהול' },
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
    label: 'יומן ביקורת',
    permissions: [
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
    label: 'תמיכת IT',
    permissions: [
      { key: Permission.IT_SUPPORT_VIEW, label: 'צפייה בפניות' },
      { key: Permission.IT_SUPPORT_MANAGE, label: 'ניהול פניות תמיכה' },
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
    label: 'לוח מודעות',
    permissions: [
      { key: Permission.BULLETIN_VIEW, label: 'צפייה' },
      { key: Permission.BULLETIN_MANAGE, label: 'פרסום וניהול' },
    ],
  },
  {
    label: 'לוח טיסות',
    permissions: [
      { key: Permission.FLIGHT_BOARD_VIEW, label: 'צפייה' },
      { key: Permission.FLIGHT_BOARD_MANAGE, label: 'ניהול' },
      { key: Permission.MCR_FLIGHT_BOARD_VIEW, label: 'צפייה — לוח MCR' },
      { key: Permission.MCR_FLIGHT_BOARD_MANAGE, label: 'ניהול — לוח MCR' },
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

export default function PermissionPicker({
  value = [],
  onChange,
  disabled,
  presetValue = [],
}: PermissionPickerProps) {
  const selected = useMemo(() => new Set(value), [value]);
  const preset = useMemo(() => new Set(presetValue), [presetValue]);

  // Combined effective set (preset ∪ custom). Used for counts and "all selected" indicators.
  const effective = useMemo(() => {
    const s = new Set(selected);
    for (const p of preset) s.add(p);
    return s;
  }, [selected, preset]);

  const toggle = (perm: string) => {
    if (disabled) return;
    if (preset.has(perm)) return; // preset perms are locked
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
      if (preset.has(p.key)) continue; // can't toggle preset perms
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
    const all = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)).filter(
      (k) => !preset.has(k),
    );
    onChange?.(all);
  };

  const selectNone = () => {
    if (disabled) return;
    onChange?.([]);
  };

  const items = PERMISSION_GROUPS.map((group, idx) => {
    const groupPerms = group.permissions.map((p) => p.key);
    const togglablePerms = groupPerms.filter((k) => !preset.has(k));
    const allTogglableChecked =
      togglablePerms.length > 0 && togglablePerms.every((k) => selected.has(k));
    const someTogglableChecked = togglablePerms.some((k) => selected.has(k));
    const presetCount = groupPerms.filter((k) => preset.has(k)).length;
    const effectiveCount = groupPerms.filter((k) => effective.has(k)).length;

    return {
      key: String(idx),
      label: (
        <Space>
          <Checkbox
            checked={allTogglableChecked && togglablePerms.length > 0}
            indeterminate={!allTogglableChecked && someTogglableChecked}
            onChange={(e) => toggleGroup(group, e.target.checked)}
            disabled={disabled || togglablePerms.length === 0}
            onClick={(e) => e.stopPropagation()}
          />
          <span>{group.label}</span>
          <Tag>
            {effectiveCount}/{groupPerms.length}
          </Tag>
          {presetCount > 0 && (
            <Tooltip title="הרשאות שמסופקות אוטומטית מהמחלקה / התפקיד / התבנית">
              <Tag color="purple">{presetCount} מתבנית</Tag>
            </Tooltip>
          )}
        </Space>
      ),
      children: (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {group.permissions.map((p) => {
            const isPreset = preset.has(p.key);
            const isChecked = isPreset || selected.has(p.key);
            const checkbox = (
              <Checkbox
                key={p.key}
                checked={isChecked}
                onChange={() => toggle(p.key)}
                disabled={disabled || isPreset}
              >
                {p.label}
                {isPreset && (
                  <Tag color="purple" style={{ marginInlineStart: 6 }}>
                    תבנית
                  </Tag>
                )}
              </Checkbox>
            );
            return isPreset ? (
              <Tooltip
                key={p.key}
                title="הרשאה זו מסופקת אוטומטית מהמחלקה / התפקיד / התבנית. בטל את הבחירה ברמת התבנית כדי להסירה."
              >
                {checkbox}
              </Tooltip>
            ) : (
              checkbox
            );
          })}
        </div>
      ),
    };
  });

  const customSelectedCount = selected.size;
  const presetTotalCount = preset.size;

  return (
    <div>
      <Space style={{ marginBottom: 8 }} wrap>
        <Button size="small" onClick={selectAll} disabled={disabled}>
          בחר הכל
        </Button>
        <Button size="small" onClick={selectNone} disabled={disabled}>
          נקה הכל
        </Button>
        <Tag color="blue">{customSelectedCount} מותאמות אישית</Tag>
        {presetTotalCount > 0 && (
          <Tag color="purple">{presetTotalCount} מתבנית (קבועות)</Tag>
        )}
        <Tag>סה״כ אפקטיביות: {effective.size}</Tag>
      </Space>
      <Collapse items={items} size="small" />
    </div>
  );
}

export { PERMISSION_GROUPS };
