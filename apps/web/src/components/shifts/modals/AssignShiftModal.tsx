'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Select, Form, message } from 'antd';
import { gql, useMutation } from '@apollo/client';

const ASSIGN_USER = gql`
  mutation AssignUserFromAplGrid($input: ShiftAssignmentInput!) {
    assignUserToShift(input: $input) {
      id
      assignedWorkers {
        userId
        role
      }
    }
  }
`;

interface AssignShiftModalProps {
  open: boolean;
  onClose: () => void;
  shiftId: string | null;
  apl: { id: string; name: string } | null;
  /** Eligible employees for this APL. */
  candidates: Array<{ id: string; displayName: string }>;
  onAssigned?: () => void;
}

export default function AssignShiftModal({
  open,
  onClose,
  shiftId,
  apl,
  candidates,
  onAssigned,
}: AssignShiftModalProps) {
  const [form] = Form.useForm();
  const [assignUser, { loading }] = useMutation(ASSIGN_USER);

  useEffect(() => {
    if (!open) form.resetFields();
  }, [open, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      if (!shiftId) return;
      await assignUser({
        variables: {
          input: {
            shiftId,
            userId: values.userId,
            role: apl?.name || 'assigned',
          },
        },
      });
      message.success('העובד שובץ');
      onAssigned?.();
      onClose();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || 'שגיאה בשיבוץ');
    }
  }

  return (
    <Modal
      title={`שיבוץ ל${apl?.name || 'משבצת'}`}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={loading}
      okText="שבץ"
      cancelText="ביטול"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="עובד"
          name="userId"
          rules={[{ required: true, message: 'אנא בחר עובד' }]}
        >
          <Select
            showSearch
            placeholder="בחר עובד"
            options={candidates.map((c) => ({
              value: c.id,
              label: c.displayName,
            }))}
            filterOption={(input, option) =>
              String(option?.label || '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
