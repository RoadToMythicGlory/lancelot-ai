'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Checkbox, Spin, message } from 'antd';
import { gql, useMutation } from '@apollo/client';

const SET_USER_APL_MEMBERSHIP = gql`
  mutation SetUserAplMembership(
    $userId: String!
    $departmentId: String!
    $aplIds: [String!]!
  ) {
    setUserAplMembership(
      userId: $userId
      departmentId: $departmentId
      aplIds: $aplIds
    ) {
      id
      eligibleUserIds
    }
  }
`;

interface AplAssignModalProps {
  open: boolean;
  onClose: () => void;
  user: { id: string; name: string } | null;
  departmentId: string;
  apls: Array<{ id: string; name: string; color?: string; eligibleUserIds: string[] }>;
  onSaved?: () => void;
}

export default function AplAssignModal({
  open,
  onClose,
  user,
  departmentId,
  apls,
  onSaved,
}: AplAssignModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [setMembership, { loading }] = useMutation(SET_USER_APL_MEMBERSHIP);

  const initial = useMemo(() => {
    if (!user) return [] as string[];
    return apls.filter((a) => a.eligibleUserIds.includes(user.id)).map((a) => a.id);
  }, [user, apls]);

  useEffect(() => {
    if (open) setSelected(initial);
  }, [open, initial]);

  async function handleOk() {
    if (!user) return;
    try {
      await setMembership({
        variables: { userId: user.id, departmentId, aplIds: selected },
      });
      message.success('שיוך ה־APL עודכן');
      onSaved?.();
      onClose();
    } catch (err: any) {
      message.error(err?.message || 'שגיאה');
    }
  }

  return (
    <Modal
      title={`שיוך APL — ${user?.name || ''}`}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={loading}
      okText="שמור"
      cancelText="ביטול"
      destroyOnHidden
    >
      {loading && !apls.length ? (
        <Spin />
      ) : apls.length === 0 ? (
        <p className="text-gray-500">אין APL מוגדרים במחלקה.</p>
      ) : (
        <Checkbox.Group
          value={selected}
          onChange={(vals) => setSelected(vals as string[])}
          className="flex flex-col gap-1"
        >
          {apls.map((a) => (
            <Checkbox key={a.id} value={a.id}>
              {a.name}
            </Checkbox>
          ))}
        </Checkbox.Group>
      )}
    </Modal>
  );
}
