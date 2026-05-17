import React, { useMemo } from 'react';
import { Form, Input, Radio, Select, Spin } from 'antd';
import { useQuery } from '@apollo/client';
import { GET_USERS, GET_ASSIGNMENT_FORM_CONFIG } from '../../../graphql/queries';
import { useAuth } from '@/contexts/AuthContext';
import { Permission } from '@/rbac';

export type WorkerPickerType = 'internal' | 'external';

/** Stable form key admins can configure under Settings → טפסים. */
const FORM_KEY = 'warehouseInternalAssignment';

interface WorkerPickerProps {
  /** Form names so the picker integrates with parent <Form />. */
  typeFieldName?: string;            // default 'workerType'
  userIdFieldName?: string;          // default 'assignedToUserId'
  externalNameFieldName?: string;    // default 'assignedToExternalName'
  phoneFieldName?: string;           // default 'assignedToPhone'
  /** Current value of the type field (radio), provided by Form.useWatch. */
  type: WorkerPickerType;
}

interface UserOption {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  departments?: Array<{ departmentId: string; departmentName?: string }>;
  department?: string;
}

const WorkerPicker: React.FC<WorkerPickerProps> = ({
  typeFieldName = 'workerType',
  userIdFieldName = 'assignedToUserId',
  externalNameFieldName = 'assignedToExternalName',
  phoneFieldName = 'assignedToPhone',
  type,
}) => {
  const { hasPermission } = useAuth();
  // Only fetch the user list when the caller can actually read it. Roles like
  // MCR Operator don't have USERS_VIEW and the server would reject the query
  // with "Missing permission" — turn that into a quiet no-op instead.
  const canListUsers = hasPermission(Permission.USERS_VIEW);

  // Active users only — keeps the picker focused on people who can actually
  // pick up equipment today.
  const { data, loading } = useQuery(GET_USERS, {
    variables: { isActive: true },
    fetchPolicy: 'cache-first',
    skip: !canListUsers,
    errorPolicy: 'all',
  });

  // Optional admin-configured department whitelist. When no form config exists,
  // the picker falls back to its previous org-wide behavior.
  const { data: formCfgData } = useQuery(GET_ASSIGNMENT_FORM_CONFIG, {
    variables: { formKey: FORM_KEY },
    fetchPolicy: 'cache-first',
  });

  const allowedDepartmentCodes = useMemo<Set<string> | null>(() => {
    const cfg = formCfgData?.assignmentFormConfig;
    if (!cfg || !cfg.isActive) return null;
    const list: any[] = Array.isArray(cfg.departments) ? cfg.departments : [];
    if (list.length === 0) return null;
    return new Set(list.map((d: any) => d.departmentCode).filter(Boolean));
  }, [formCfgData]);

  const userOptions = useMemo(() => {
    const users: UserOption[] = data?.users || [];
    const filteredUsers = !allowedDepartmentCodes
      ? users
      : users.filter((u) => {
          if (Array.isArray(u.departments) && u.departments.length > 0) {
            return u.departments.some((d) =>
              d.departmentId && allowedDepartmentCodes.has(d.departmentId),
            );
          }
          return !!(u.department && allowedDepartmentCodes.has(u.department));
        });
    return filteredUsers
      .map((u) => {
        const name =
          u.displayName ||
          [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
          u.email ||
          'משתמש';
        return {
          value: u.id,
          label: u.email ? `${name} (${u.email})` : name,
          searchText: `${name} ${u.email || ''}`.toLowerCase(),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'he'));
  }, [data, allowedDepartmentCodes]);

  return (
    <>
      <Form.Item
        name={typeFieldName}
        label="סוג העובד"
        rules={[{ required: true }]}
        initialValue="internal"
      >
        <Radio.Group buttonStyle="solid">
          <Radio.Button value="internal">עובד פנימי (משתמש במערכת)</Radio.Button>
          <Radio.Button value="external">עובד חיצוני (שם חופשי)</Radio.Button>
        </Radio.Group>
      </Form.Item>

      {type === 'internal' ? (
        <Form.Item
          name={userIdFieldName}
          label="עובד"
          rules={[{ required: true, message: 'נא לבחור עובד' }]}
        >
          <Select
            showSearch
            placeholder="חפש לפי שם או דוא״ל"
            options={userOptions}
            optionFilterProp="label"
            filterOption={(input, option) => {
              const search = input.toLowerCase();
              const opt = option as any;
              return (opt?.searchText || opt?.label?.toLowerCase() || '').includes(search);
            }}
            notFoundContent={loading ? <Spin size="small" /> : 'לא נמצאו משתמשים'}
            allowClear
          />
        </Form.Item>
      ) : (
        <Form.Item
          name={externalNameFieldName}
          label="שם העובד החיצוני"
          rules={[{ required: true, message: 'נא להזין שם' }]}
        >
          <Input placeholder="למשל: יוסי כהן (קבלן חיצוני)" />
        </Form.Item>
      )}

      <Form.Item
        name={phoneFieldName}
        label="טלפון (אופציונלי)"
      >
        <Input placeholder="0501234567" inputMode="tel" />
      </Form.Item>
    </>
  );
};

export default WorkerPicker;
