'use client';

import React, { useEffect } from 'react';
import { Modal, Form, TimePicker, Input, message } from 'antd';
import { useMutation } from '@apollo/client';
import dayjs from 'dayjs';
import { UPDATE_SHIFT } from '@/graphql/mutations';

interface EditHoursModalProps {
  open: boolean;
  onClose: () => void;
  shift: any | null;
  onSaved?: () => void;
}

/**
 * Lets a manager (or the assigned employee with manage rights) tweak the
 * effective start/end times of a single shift without touching its
 * type / department. Used by the Assign Shifts page and the Department
 * Schedule's right-click menu.
 */
export default function EditHoursModal({
  open,
  onClose,
  shift,
  onSaved,
}: EditHoursModalProps) {
  const [form] = Form.useForm();
  const [updateShift, { loading }] = useMutation(UPDATE_SHIFT);

  useEffect(() => {
    if (open && shift) {
      form.setFieldsValue({
        startTime: shift.startTime ? dayjs(shift.startTime, 'HH:mm') : null,
        endTime: shift.endTime ? dayjs(shift.endTime, 'HH:mm') : null,
        notes: shift.notes || '',
      });
    } else {
      form.resetFields();
    }
  }, [open, shift, form]);

  const handleOk = async () => {
    if (!shift) return;
    try {
      const values = await form.validateFields();
      await updateShift({
        variables: {
          id: shift.id,
          input: {
            date: dayjs(shift.date).format('YYYY-MM-DD'),
            shiftType: shift.shiftType,
            department: shift.department,
            requiredWorkers: shift.requiredWorkers ?? 1,
            notes: values.notes || null,
            startTime: values.startTime ? dayjs(values.startTime).format('HH:mm') : null,
            endTime: values.endTime ? dayjs(values.endTime).format('HH:mm') : null,
          },
        },
      });
      message.success('שעות המשמרת עודכנו');
      onSaved?.();
      onClose();
    } catch (err: any) {
      if (err?.errorFields) return; // validation
      message.error('שגיאה בעדכון: ' + (err?.message || ''));
    }
  };

  return (
    <Modal
      title="עריכת שעות משמרת"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={loading}
      okText="שמור"
      cancelText="ביטול"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="שעת התחלה"
          name="startTime"
          rules={[{ required: true, message: 'אנא בחר שעת התחלה' }]}
        >
          <TimePicker format="HH:mm" minuteStep={15} className="w-full" />
        </Form.Item>
        <Form.Item
          label="שעת סיום"
          name="endTime"
          rules={[{ required: true, message: 'אנא בחר שעת סיום' }]}
        >
          <TimePicker format="HH:mm" minuteStep={15} className="w-full" />
        </Form.Item>
        <Form.Item label="הערות" name="notes">
          <Input.TextArea rows={3} placeholder="הערות נוספות (אופציונלי)" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
