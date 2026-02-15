'use client';

import React, { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Tag, message, Empty, Spin } from 'antd';
import { CheckOutlined, CloseOutlined, CalendarOutlined } from '@ant-design/icons';
import { gql, useQuery, useMutation } from '@apollo/client';
import dayjs from 'dayjs';
import 'dayjs/locale/he';

dayjs.locale('he');

const { TextArea } = Input;

const INCOMING_SWAP_REQUESTS = gql`
  query IncomingSwapRequests {
    incomingShiftSwapRequests(status: pending) {
      id
      requestingUser {
        id
        firstName
        lastName
        department
      }
      shift {
        id
        date
        shiftType
        department
        startTime
        endTime
      }
      reason
      status
      targetUserResponse
      createdAt
    }
  }
`;

const RESPOND_TO_SWAP_REQUEST = gql`
  mutation RespondToShiftSwapRequest($id: ID!, $accepted: Boolean!, $reason: String) {
    respondToShiftSwapRequest(id: $id, accepted: $accepted, reason: $reason) {
      id
      status
      targetUserResponse
    }
  }
`;

const shiftTypeLabels = {
  morning: 'בוקר',
  afternoon: 'צהריים',
  night: 'לילה'
};

export default function IncomingSwapRequests() {
  const [responseModal, setResponseModal] = useState<{ visible: boolean; request: any | null }>({
    visible: false,
    request: null
  });
  const [form] = Form.useForm();

  const { data, loading, refetch } = useQuery(INCOMING_SWAP_REQUESTS, {
    fetchPolicy: 'cache-and-network'
  });

  const [respondToRequest] = useMutation(RESPOND_TO_SWAP_REQUEST, {
    onCompleted: () => {
      message.success('תגובתך נשלחה בהצלחה');
      setResponseModal({ visible: false, request: null });
      form.resetFields();
      refetch();
    },
    onError: (error) => {
      message.error(`שגיאה: ${error.message}`);
    }
  });

  const handleResponse = (request: any, accepted: boolean) => {
    if (accepted) {
      // For acceptance, open modal for optional reason
      setResponseModal({ visible: true, request });
    } else {
      // For rejection, require reason
      Modal.confirm({
        title: 'דחיית בקשת החלפה',
        content: (
          <Form layout="vertical" id="rejectForm">
            <Form.Item 
              name="reason" 
              label="סיבת הדחייה"
              rules={[{ required: true, message: 'נא להזין סיבה' }]}
            >
              <TextArea rows={3} placeholder="הסבר מדוע אינך יכול להחליף..." />
            </Form.Item>
          </Form>
        ),
        onOk: async () => {
          const formElement = document.getElementById('rejectForm') as HTMLFormElement;
          if (formElement) {
            const reasonInput = formElement.querySelector('textarea');
            const reason = reasonInput?.value;
            
            if (!reason) {
              message.error('נא להזין סיבה לדחייה');
              return Promise.reject();
            }
            
            await respondToRequest({
              variables: {
                id: request.id,
                accepted: false,
                reason
              }
            });
          }
        }
      });
    }
  };

  const handleAccept = async (values: any) => {
    await respondToRequest({
      variables: {
        id: responseModal.request.id,
        accepted: true,
        reason: values.reason
      }
    });
  };

  if (loading) {
    return (
      <Card>
        <div className="flex justify-center items-center h-32">
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  // Filter requests where current user is the target and hasn't responded yet
  const myIncomingRequests = data?.incomingShiftSwapRequests?.filter(
    (req: any) => !req.targetUserResponse
  ) || [];

  const columns = [
    {
      title: 'מבקש',
      key: 'requestingUser',
      render: (record: any) => (
        <div>
          <strong>{record.requestingUser.firstName} {record.requestingUser.lastName}</strong>
          <br />
          <span className="text-gray-500">{record.requestingUser.department}</span>
        </div>
      )
    },
    {
      title: 'משמרת',
      key: 'shift',
      render: (record: any) => (
        <div>
          <CalendarOutlined className="ml-1" />
          {dayjs(record.shift.date).format('DD/MM/YYYY')}
          <br />
          {shiftTypeLabels[record.shift.shiftType as keyof typeof shiftTypeLabels]}
          {record.shift.startTime && ` (${record.shift.startTime}-${record.shift.endTime})`}
        </div>
      )
    },
    {
      title: 'סיבה',
      dataIndex: 'reason',
      key: 'reason',
      width: '30%'
    },
    {
      title: 'תאריך בקשה',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_: any, record: any) => (
        <div className="flex gap-2">
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => handleResponse(record, true)}
          >
            אשר
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={() => handleResponse(record, false)}
          >
            דחה
          </Button>
        </div>
      )
    }
  ];

  return (
    <Card title="בקשות החלפה נכנסות">
      {myIncomingRequests.length === 0 ? (
        <Empty description="אין בקשות החלפה ממתינות" />
      ) : (
        <Table
          dataSource={myIncomingRequests}
          columns={columns}
          rowKey="id"
          pagination={false}
        />
      )}

      <Modal
        title="אישור החלפת משמרת"
        open={responseModal.visible}
        onCancel={() => {
          setResponseModal({ visible: false, request: null });
          form.resetFields();
        }}
        footer={null}
      >
        {responseModal.request && (
          <div className="mb-4 p-4 bg-green-50 rounded">
            <p className="text-green-800 mb-2">אתה עומד לאשר החלפת משמרת עם:</p>
            <p><strong>{responseModal.request.requestingUser.firstName} {responseModal.request.requestingUser.lastName}</strong></p>
            <p>תאריך: {dayjs(responseModal.request.shift.date).format('DD/MM/YYYY')}</p>
            <p>משמרת: {shiftTypeLabels[responseModal.request.shift.shiftType as keyof typeof shiftTypeLabels]}</p>
          </div>
        )}

        <Form form={form} layout="vertical" onFinish={handleAccept}>
          <Form.Item 
            name="reason" 
            label="הערות (אופציונלי)"
          >
            <TextArea 
              rows={3} 
              placeholder="הוסף הערה אם רצונך..."
            />
          </Form.Item>

          <Form.Item className="mb-0">
            <div className="flex gap-2 justify-end">
              <Button onClick={() => {
                setResponseModal({ visible: false, request: null });
                form.resetFields();
              }}>
                ביטול
              </Button>
              <Button type="primary" htmlType="submit" icon={<CheckOutlined />}>
                אשר החלפה
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      <div className="mt-4 p-4 bg-blue-50 rounded">
        <h4 className="font-semibold mb-2">הסבר על תהליך החלפת משמרות:</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>עובד שולח בקשת החלפה</li>
          <li>אתה מאשר או דוחה את הבקשה</li>
          <li>אם אישרת - הבקשה עוברת לאישור המנהל</li>
          <li>לאחר אישור המנהל, ההחלפה מתבצעת</li>
        </ol>
      </div>
    </Card>
  );
}
