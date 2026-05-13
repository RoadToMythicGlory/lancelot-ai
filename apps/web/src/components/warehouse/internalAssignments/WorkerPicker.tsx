import React, { useMemo } from 'react';
import { Form, Input, Radio, Select, Spin } from 'antd';
import { useQuery } from '@apollo/client';
import { GET_USERS } from '../../../graphql/queries';

export type WorkerPickerType = 'internal' | 'external';

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
}

const WorkerPicker: React.FC<WorkerPickerProps> = ({
  typeFieldName = 'workerType',
  userIdFieldName = 'assignedToUserId',
  externalNameFieldName = 'assignedToExternalName',
  phoneFieldName = 'assignedToPhone',
  type,
}) => {
  // Active users only — keeps the picker focused on people who can actually
  // pick up equipment today.
  const { data, loading } = useQuery(GET_USERS, {
    variables: { isActive: true },
    fetchPolicy: 'cache-first',
  });

  const userOptions = useMemo(() => {
    const users: UserOption[] = data?.users || [];
    return users
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
  }, [data]);

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
