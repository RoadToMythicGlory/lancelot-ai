'use client';

import React from 'react';
import { Card, Table, Tag, Empty, Spin } from 'antd';
import { useQuery, gql } from '@apollo/client';
import dayjs from 'dayjs';
import 'dayjs/locale/he';

dayjs.locale('he');

const MY_VACATION_REQUESTS = gql`
  query MyVacationRequests {
    myVacationRequests {
      id
      startDate
      endDate
      vacationType
      reason
      status
      adminNotes
      createdAt
      approvedAt
    }
  }
`;

const VACATION_TYPE_LABELS: Record<string, string> = {
  annual: 'חופשה שנתית',
  sick: 'מחלה',
  personal: 'חופשה אישית',
  maternity: 'חופשת לידה',
  other: 'אחר'
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default'
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לאישור',
  approved: 'אושר',
  rejected: 'נדחה',
  cancelled: 'בוטל'
};

export default function VacationHistory() {
  const { data, loading, error } = useQuery(MY_VACATION_REQUESTS, {
    fetchPolicy: 'cache-and-network'
  });

  const columns = [
    {
      title: 'תאריכים',
      key: 'dates',
      render: (record: any) => (
        <span>
          {dayjs(record.startDate).format('DD/MM/YYYY')} - {dayjs(record.endDate).format('DD/MM/YYYY')}
        </span>
      )
    },
    {
      title: 'סוג חופשה',
      dataIndex: 'vacationType',
      key: 'vacationType',
      render: (type: string) => VACATION_TYPE_LABELS[type] || type
    },
    {
      title: 'סיבה',
      dataIndex: 'reason',
      key: 'reason',
      render: (reason: string) => reason || '-'
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status]}>
          {STATUS_LABELS[status]}
        </Tag>
      )
    },
    {
      title: 'הערות מנהל',
      dataIndex: 'adminNotes',
      key: 'adminNotes',
      render: (notes: string) => notes || '-'
    },
    {
      title: 'תאריך הגשה',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'תאריך טיפול',
      dataIndex: 'approvedAt',
      key: 'approvedAt',
      render: (date: string) => date ? dayjs(date).format('DD/MM/YYYY HH:mm') : '-'
    }
  ];

  if (loading) return <Card><Spin size="large" /></Card>;
  if (error) return <Card><p>שגיאה בטעינת היסטוריית חופשות</p></Card>;

  const requests = data?.myVacationRequests || [];
  const sortedRequests = [...requests].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <Card title="היסטוריית בקשות חופשה">
      {sortedRequests.length === 0 ? (
        <Empty description="אין בקשות חופשה" />
      ) : (
        <Table
          dataSource={sortedRequests}
          columns={columns}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `סה"כ ${total} בקשות`
          }}
        />
      )}
      
      <div className="mt-4 text-sm text-gray-600">
        <p className="font-semibold mb-2">מקרא סטטוסים:</p>
        <div className="flex flex-wrap gap-2">
          <Tag color="orange">ממתין לאישור - הבקשה נשלחה וממתינה לאישור המנהל</Tag>
          <Tag color="green">אושר - הבקשה אושרה על ידי המנהל</Tag>
          <Tag color="red">נדחה - הבקשה נדחתה על ידי המנהל</Tag>
          <Tag color="default">בוטל - הבקשה בוטלה על ידי העובד</Tag>
        </div>
      </div>
    </Card>
  );
}
