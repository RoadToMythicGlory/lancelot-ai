'use client';

import React, { useState } from 'react';
import { Card, Form, DatePicker, Select, Input, Button, App, Modal } from 'antd';
import { useMutation, useApolloClient, gql } from '@apollo/client';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

const CREATE_VACATION_REQUEST = gql`
  mutation CreateVacationRequest($input: VacationRequestInput!) {
    createVacationRequest(input: $input) {
      id
      startDate
      endDate
      vacationType
      reason
      status
    }
  }
`;

const MY_UPCOMING_SHIFTS = gql`
  query MyUpcomingShiftsForVacationCheck($start: String!, $end: String!) {
    myUpcomingShifts(startDate: $start, endDate: $end) {
      id
      date
    }
  }
`;

const VACATION_TYPES = [
  { value: 'annual', label: 'חופשה שנתית' },
  { value: 'sick', label: 'מחלה' },
  { value: 'personal', label: 'חופשה אישית' },
  { value: 'maternity', label: 'חופשת לידה' },
  { value: 'other', label: 'אחר' }
];

export default function VacationRequest() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message, modal } = App.useApp();
  const client = useApolloClient();

  const [createVacationRequest] = useMutation(CREATE_VACATION_REQUEST, {
    onCompleted: () => {
      message.success('בקשת החופשה נשלחה בהצלחה');
      form.resetFields();
      setLoading(false);
    },
    onError: (error) => {
      message.error('שגיאה בשליחת בקשת החופשה');
      console.error('Vacation request error:', error);
      setLoading(false);
    }
  });

  async function submitRequest(start: string, end: string, vacationType: string, reason: string) {
    await createVacationRequest({
      variables: {
        input: { startDate: start, endDate: end, vacationType, reason: reason || '' },
      },
    });
  }

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const start = values.dateRange[0].format('YYYY-MM-DD');
      const end = values.dateRange[1].format('YYYY-MM-DD');

      // Live overlap check: warn if user already has shifts inside the selected range.
      let overlappingShifts: Array<{ id: string; date: string }> = [];
      try {
        const { data: overlapData } = await client.query({
          query: MY_UPCOMING_SHIFTS,
          variables: { start, end },
          fetchPolicy: 'network-only',
        });
        overlappingShifts = overlapData?.myUpcomingShifts ?? [];
      } catch (err) {
        console.warn('Overlap check failed, proceeding without it.', err);
      }

      if (overlappingShifts.length > 0) {
        const dates = overlappingShifts
          .map((s) => dayjs(s.date).format('DD/MM/YYYY'))
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .join(', ');
        const proceed = await new Promise<boolean>((resolve) => {
          modal.confirm({
            title: 'התנגשות עם משמרות קיימות',
            content: `יש לך ${overlappingShifts.length} משמרות בטווח הבקשה (${dates}). האם להמשיך בכל זאת?`,
            okText: 'המשך בכל זאת',
            cancelText: 'בטל',
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (!proceed) {
          setLoading(false);
          return;
        }
      }

      await submitRequest(start, end, values.vacationType, values.reason);
    } catch (error) {
      // Error handled in mutation
    }
  };

  return (
    <Card title="בקשת חופשה" className="vacation-request-card">
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ maxWidth: 600 }}
      >
        <Form.Item
          name="dateRange"
          label="תאריכי החופשה"
          rules={[{ required: true, message: 'נא לבחור תאריכים' }]}
        >
          <DatePicker.RangePicker 
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            disabledDate={(current) => current && current < dayjs().startOf('day')}
          />
        </Form.Item>

        <Form.Item
          name="vacationType"
          label="סוג החופשה"
          rules={[{ required: true, message: 'נא לבחור סוג חופשה' }]}
        >
          <Select placeholder="בחר סוג חופשה">
            {VACATION_TYPES.map(type => (
              <Option key={type.value} value={type.value}>
                {type.label}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="reason"
          label="הערות"
        >
          <TextArea 
            rows={4} 
            placeholder="הערות נוספות (אופציונלי)"
          />
        </Form.Item>

        <Form.Item>
          <Button 
            type="primary" 
            htmlType="submit" 
            loading={loading}
            style={{ width: '100%' }}
          >
            שלח בקשה
          </Button>
        </Form.Item>
      </Form>

      <div className="mt-4 text-sm text-gray-600">
        <p>• בקשות חופשה יש להגיש לפחות שבוע מראש</p>
        <p>• הבקשה תיבדק על ידי המנהל ותקבל תשובה תוך 48 שעות</p>
        <p>• במקרים דחופים ניתן לפנות ישירות למנהל המשמרת</p>
      </div>
    </Card>
  );
} 