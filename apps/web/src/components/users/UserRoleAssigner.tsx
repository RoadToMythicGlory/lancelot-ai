'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, Select, Alert, Space, Tag } from 'antd';
import { useQuery, gql } from '@apollo/client';
import PermissionPicker from './PermissionPicker';

const { Option } = Select;

const GET_ASSIGNABLE_TEMPLATES = gql`
  query GetAssignableRoleTemplates {
    assignableRoleTemplates {
      id
      name
      description
      baseSystemRole
      permissions
    }
  }
`;

interface RoleTemplate {
  id: string;
  name: string;
  description?: string;
  baseSystemRole: string;
  permissions: string[];
}

interface UserRoleAssignerProps {
  /** Current actor's system role */
  actorSystemRole: string;
  /** Selected template id (controlled) */
  roleTemplateId?: string | null;
  /** Custom permissions (controlled) */
  customPermissions?: string[];
  /** Callbacks */
  onRoleTemplateChange?: (templateId: string | null) => void;
  onCustomPermissionsChange?: (perms: string[]) => void;
}

const SYSTEM_ROLE_LABELS: Record<string, string> = {
  SYSTEM_ADMIN: 'מנהל מערכת',
  IT_ADMIN: 'מנהל IT',
  IT_USER: 'משתמש IT',
  DEPARTMENT_ADMIN: 'מנהל מחלקה',
  DEPARTMENT_USER: 'משתמש מחלקה',
};

export default function UserRoleAssigner({
  actorSystemRole,
  roleTemplateId,
  customPermissions = [],
  onRoleTemplateChange,
  onCustomPermissionsChange,
}: UserRoleAssignerProps) {
  const isSystemAdmin = actorSystemRole === 'SYSTEM_ADMIN';
  const isDeptAdmin = actorSystemRole === 'DEPARTMENT_ADMIN';

  const { data, loading } = useQuery(GET_ASSIGNABLE_TEMPLATES);

  const templates: RoleTemplate[] = data?.assignableRoleTemplates ?? [];
  const selectedTemplate = templates.find((t) => t.id === roleTemplateId);

  const handleTemplateChange = (value: string | undefined) => {
    onRoleTemplateChange?.(value ?? null);
    if (value) {
      const tmpl = templates.find((t) => t.id === value);
      if (tmpl && !isSystemAdmin) {
        onCustomPermissionsChange?.([]);
      }
    }
  };

  // For dept admins, only show the template tab
  const tabItems = [
    {
      key: 'template',
      label: 'תבנית תפקיד',
      children: (
        <div style={{ padding: '8px 0' }}>
          <Select
            style={{ width: '100%' }}
            placeholder="בחר תבנית תפקיד"
            value={roleTemplateId || undefined}
            onChange={handleTemplateChange}
            allowClear
            loading={loading}
          >
            {templates.map((t) => (
              <Option key={t.id} value={t.id}>
                <Space>
                  {t.name}
                  <Tag color="blue">{SYSTEM_ROLE_LABELS[t.baseSystemRole] || t.baseSystemRole}</Tag>
                </Space>
              </Option>
            ))}
          </Select>

          {selectedTemplate && (
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message={selectedTemplate.name}
              description={
                <div>
                  {selectedTemplate.description && (
                    <p style={{ margin: '4px 0' }}>{selectedTemplate.description}</p>
                  )}
                  <p style={{ margin: '4px 0' }}>
                    תפקיד בסיס: <Tag>{SYSTEM_ROLE_LABELS[selectedTemplate.baseSystemRole]}</Tag>
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    {selectedTemplate.permissions.length} הרשאות נוספות
                  </p>
                </div>
              }
            />
          )}
        </div>
      ),
    },
  ];

  if (isSystemAdmin) {
    tabItems.push({
      key: 'custom',
      label: 'הרשאות מותאמות אישית',
      children: (
        <div style={{ padding: '8px 0' }}>
          <Alert
            style={{ marginBottom: 12 }}
            type="warning"
            showIcon
            message="הרשאות מותאמות אישית"
            description="הרשאות אלו יתווספו מעל הרשאות התבנית (אם נבחרה). זמין רק למנהלי מערכת."
          />
          <PermissionPicker
            value={customPermissions}
            onChange={onCustomPermissionsChange}
          />
        </div>
      ),
    });
  }

  if (isDeptAdmin) {
    return (
      <div>
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message="בחר תבנית תפקיד"
          description="כמנהל מחלקה, עליך לבחור מתבניות התפקיד שהוגדרו מראש."
        />
        {tabItems[0].children}
      </div>
    );
  }

  return (
    <Tabs
      items={tabItems}
      defaultActiveKey="template"
      size="small"
    />
  );
}
