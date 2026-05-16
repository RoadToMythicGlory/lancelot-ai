'use client';

import React, { useEffect } from 'react';
import { Modal, Form, Input, DatePicker, TimePicker, Select } from 'antd';
import dayjs from 'dayjs';
import {
  BROADCAST_TYPES,
  BROADCAST_TYPE_LABELS_HE,
} from '../constants';
import type { BroadcastType } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: {
    title: string;
    start: string;
    end: string;
    controlStudio?: string;
    broadcastChannel?: string;
    broadcastType?: BroadcastType;
  }) => Promise<void>;
  defaultDate?: dayjs.Dayjs;
  saving?: boolean;
}

const CreateEventModal: React.FC<Props> = ({ open, onClose, onSubmit, defaultDate, saving }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      const base = defaultDate || dayjs();
      form.setFieldsValue({
        date: base,
        startTime: base.hour(8).minute(0),
        endTime: base.hour(9).minute(0),
      });
    }
  }, [open, defaultDate, form]);

  return (
    <Modal
      open={open}
      title="אירוע MCR חדש"
      onCancel={onClose}
      okText="צור"
      cancelText="ביטול"
      okButtonProps={{ loading: saving }}
      destroyOnHidden
      onOk={() => {
        form.validateFields().then(async (values) => {
          const date: dayjs.Dayjs = values.date;
          const startTime: dayjs.Dayjs = values.startTime;
          const endTime: dayjs.Dayjs = values.endTime;
          const start = date
            .hour(startTime.hour())
            .minute(startTime.minute())
            .second(0)
            .millisecond(0)
            .toISOString();
          const end = date
            .hour(endTime.hour())
            .minute(endTime.minute())
            .second(0)
            .millisecond(0)
            .toISOString();
          await onSubmit({
            title: values.title,
            start,
            end,
            controlStudio: values.controlStudio,
            broadcastChannel: values.broadcastChannel,
            broadcastType: values.broadcastType,
          });
          form.resetFields();
        });
      }}
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="title"
          label="שם האירוע"
          rules={[{ required: true, message: 'נא להזין שם' }]}
        >
          <Input placeholder="לדוגמה: מבזק חדשות" />
        </Form.Item>
        <div className="grid grid-cols-3 gap-2">
          <Form.Item name="date" label="תאריך" rules={[{ required: true, message: 'נא לבחור תאריך' }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} allowClear={false} />
          </Form.Item>
          <Form.Item name="startTime" label="שעת התחלה" rules={[{ required: true }]}>
            <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} allowClear={false} />
          </Form.Item>
          <Form.Item name="endTime" label="שעת סיום" rules={[{ required: true }]}>
            <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} allowClear={false} />
          </Form.Item>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Form.Item name="controlStudio" label="אולפן בקרה">
            <Input />
          </Form.Item>
          <Form.Item name="broadcastChannel" label="ערוץ שידור">
            <Input />
          </Form.Item>
        </div>
        <Form.Item name="broadcastType" label="סוג שידור">
          <Select
            allowClear
            placeholder="בחר"
            options={BROADCAST_TYPES.map((t) => ({
              value: t,
              label: BROADCAST_TYPE_LABELS_HE[t],
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateEventModal;
