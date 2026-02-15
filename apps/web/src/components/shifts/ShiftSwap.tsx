'use client';

import React, { useState } from 'react';
import { Card, Table, Button, Modal, Form, Select, Input, Alert, Tag, message, Spin } from 'antd';
import { SwapOutlined, CalendarOutlined, UserOutlined } from '@ant-design/icons';
import { gql, useQuery, useMutation } from '@apollo/client';
import dayjs from 'dayjs';
import 'dayjs/locale/he';

dayjs.locale('he');

const { Option } = Select;
const { TextArea } = Input;

const MY_SHIFTS_QUERY = gql`
  query MyUpcomingShifts {
    myUpcomingShifts {
      id
      date
      shiftType
      department
      assignedWorkers {
        userId
        user {
          id
          firstName
          lastName
        }
        role
      }
    }
  }
`;

const USERS_QUERY = gql`
  query Users($departmentId: String) {
    users(filter: { departmentId: $departmentId }) {
      id
      firstName
      lastName
      department
    }
  }
`;

const CREATE_SWAP_REQUEST = gql`
  mutation CreateShiftSwapRequest($input: ShiftSwapRequestInput!) {
    createShiftSwapRequest(input: $input) {
      id
      status
    }
  }
`;

const MY_SWAP_REQUESTS_QUERY = gql`
  query MyShiftSwapRequests {
    myShiftSwapRequests {
      id
      shiftId
      shift {
        date
        shiftType
      }
      targetUser {
        firstName
        lastName
      }
      status
      reason
      createdAt
    }
  }
`;

const shiftTypeLabels = {
  morning: 'בוקר',
  afternoon: 'צהריים',
  night: 'לילה'
};

const statusColors = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default'
};

const statusLabels = {
  pending: 'ממתין לאישור',
  approved: 'אושר',
  rejected: 'נדחה',
  cancelled: 'בוטל'
};

export default function ShiftSwap() {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedShift, setSelectedShift] = useState<any>(null);
  const [form] = Form.useForm();
  // derive user department from selectedShift or leave undefined

  const { data: shiftsData, loading: shiftsLoading } = useQuery(MY_SHIFTS_QUERY);
  const userDept = selectedShift?.department;
  const { data: usersData } = useQuery(USERS_QUERY, { variables: { departmentId: userDept } });
  const { data: swapRequestsData, loading: requestsLoading, refetch } = useQuery(MY_SWAP_REQUESTS_QUERY);
  
  const [createSwapRequest] = useMutation(CREATE_SWAP_REQUEST, {
    onCompleted: () => {
      message.success('בקשת החלפה נשלחה בהצלחה');
      setIsModalVisible(false);
      form.resetFields();
      refetch();
    },
    onError: (error) => {
      message.error('שגיאה בשליחת הבקשה: ' + error.message);
    }
  });

  const handleSwapRequest = (shift: any) => {
    setSelectedShift(shift);
    setIsModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    // Prevent selecting self
    const meAssigned = selectedShift?.assignedWorkers?.some((w: any) => w.userId === values.targetUserId);
    if (meAssigned) {
      message.warning('לא ניתן לבחור את עצמך להחלפה');
      return;
    }
    await createSwapRequest({
      variables: {
        input: {
          shiftId: selectedShift.id,
          targetUserId: values.targetUserId,
          reason: values.reason
        }
      }
    });
  };

  const shiftsColumns = [
    {
      title: 'תאריך',
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => (
        <div className="flex items-center gap-2">
          <CalendarOutlined />
          {dayjs(date).format('DD/MM/YYYY')}
        </div>
      )
    },
    {
      title: 'משמרת',
      dataIndex: 'shiftType',
      key: 'shiftType',
      render: (type: string) => shiftTypeLabels[type as keyof typeof shiftTypeLabels]
    },
    {
      title: 'מחלקה',
      dataIndex: 'department',
      key: 'department'
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_: any, record: any) => (
        <Button 
          type="primary" 
          icon={<SwapOutlined />}
          onClick={() => handleSwapRequest(record)}
        >
          בקש החלפה
        </Button>
      )
    }
  ];

  const requestsColumns = [
    {
      title: 'תאריך משמרת',
      dataIndex: ['shift', 'date'],
      key: 'shiftDate',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'סוג משמרת',
      dataIndex: ['shift', 'shiftType'],
      key: 'shiftType',
      render: (type: string) => shiftTypeLabels[type as keyof typeof shiftTypeLabels]
    },
    {
      title: 'מבוקש מ',
      dataIndex: 'targetUser',
      key: 'targetUser',
      render: (user: any) => user ? `${user.firstName} ${user.lastName}` : '-'
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={statusColors[status as keyof typeof statusColors]}>
          {statusLabels[status as keyof typeof statusLabels]}
        </Tag>
      )
    },
    {
      title: 'תאריך בקשה',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY HH:mm')
    }
  ];

  if (shiftsLoading || requestsLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin size="large" />
      </div>
    );
  }

  const upcomingShifts = shiftsData?.myUpcomingShifts || [];
  const swapRequests = swapRequestsData?.myShiftSwapRequests || [];

  return (
    <div className="space-y-6">
      {/* Shifts Available for Swap */}
      <Card title="המשמרות שלי להחלפה" className="shifts-swap-card">
        <Table
          dataSource={upcomingShifts}
          columns={shiftsColumns}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: 'אין משמרות זמינות להחלפה' }}
        />
      </Card>

      {/* Swap Requests History */}
      <Card title="בקשות החלפה" className="swap-requests-card">
        <Table
          dataSource={swapRequests}
          columns={requestsColumns}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true
          }}
          locale={{ emptyText: 'אין בקשות החלפה' }}
        />
      </Card>

      {/* Swap Request Modal */}
      <Modal
        title="בקשת החלפת משמרת"
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={500}
      >
        {selectedShift && (
          <div className="mb-4 p-4 bg-gray-50 rounded">
            <p><strong>תאריך:</strong> {dayjs(selectedShift.date).format('DD/MM/YYYY')}</p>
            <p><strong>משמרת:</strong> {shiftTypeLabels[selectedShift.shiftType as keyof typeof shiftTypeLabels]}</p>
            <p><strong>מחלקה:</strong> {selectedShift.department}</p>
          </div>
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="targetUserId"
            label="בחר עובד להחלפה"
            rules={[{ required: true, message: 'אנא בחר עובד' }]}
          >
            <Select
              placeholder="בחר עובד"
              showSearch
              filterOption={(input, option) =>
                option?.children?.toString().toLowerCase().includes(input.toLowerCase()) || false
              }
            >
              {usersData?.users.map((user: any) => (
                <Option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName} - {user.department}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="reason"
            label="סיבת ההחלפה"
            rules={[{ required: true, message: 'אנא הזן סיבה' }]}
          >
            <TextArea
              rows={4}
              placeholder="הסבר מדוע אתה מבקש את ההחלפה..."
            />
          </Form.Item>

          <Form.Item className="mb-0">
            <div className="flex gap-2 justify-end">
              <Button onClick={() => {
                setIsModalVisible(false);
                form.resetFields();
              }}>
                ביטול
              </Button>
              <Button type="primary" htmlType="submit" icon={<SwapOutlined />}>
                שלח בקשה
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
} 