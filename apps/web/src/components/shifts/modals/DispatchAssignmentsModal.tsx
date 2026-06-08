'use client';

import React, { useState } from 'react';
import { Modal, Alert, Table, Tag, App } from 'antd';
import { gql, useMutation } from '@apollo/client';

const DISPATCH_ASSIGNMENTS = gql`
  mutation DispatchDepartmentShiftAssignments(
    $input: DispatchDepartmentShiftAssignmentsInput!
  ) {
    dispatchDepartmentShiftAssignments(input: $input) {
      success
      message
      totalEmployees
      sentCount
      skippedCount
      failedCount
      results {
        userId
        displayName
        phone
        status
        messageId
        error
        shiftCount
      }
    }
  }
`;

type DispatchResult = {
  userId: string;
  displayName: string;
  phone: string | null;
  status: 'sent' | 'skipped' | 'failed';
  messageId?: string | null;
  error?: string | null;
  shiftCount: number;
};

type DispatchPayload = {
  success: boolean;
  message: string;
  totalEmployees: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  results: DispatchResult[];
};

interface DispatchAssignmentsModalProps {
  open: boolean;
  onClose: () => void;
  departmentId: string;
  startDate: string;
  endDate: string;
}

export default function DispatchAssignmentsModal({
  open,
  onClose,
  departmentId,
  startDate,
  endDate,
}: DispatchAssignmentsModalProps) {
  const { message } = App.useApp();
  const [result, setResult] = useState<DispatchPayload | null>(null);
  const [dispatch, { loading }] = useMutation(DISPATCH_ASSIGNMENTS);

  async function handleOk() {
    if (result) {
      onClose();
      setResult(null);
      return;
    }
    try {
      const { data } = await dispatch({
        variables: { input: { departmentId, startDate, endDate } },
      });
      const payload = data?.dispatchDepartmentShiftAssignments as DispatchPayload | undefined;
      if (!payload) {
        message.error('לא התקבלה תשובה מהשרת');
        return;
      }
      setResult(payload);
      if (payload.success) {
        message.success(payload.message);
      } else {
        message.warning(payload.message);
      }
    } catch (err: any) {
      message.error(err?.message || 'שגיאה בשליחת השיבוצים');
    }
  }

  function handleCancel() {
    onClose();
    setResult(null);
  }

  return (
    <Modal
      title="שגר שיבוצים בוואטסאפ"
      open={open}
      onCancel={handleCancel}
      onOk={handleOk}
      okText={result ? 'סגור' : 'שגר עכשיו'}
      cancelText={result ? 'סגור' : 'ביטול'}
      cancelButtonProps={{ style: result ? { display: 'none' } : undefined }}
      confirmLoading={loading}
      width={640}
      destroyOnHidden
    >
      {!result ? (
        <div className="space-y-3">
          <p>
            יישלחו השיבוצים לעובדים הפעילים של המחלקה הנבחרת בלבד.
            כל עובד יקבל אך ורק את השיבוצים שלו.
          </p>
          <Alert
            type="info"
            showIcon
            message={`טווח: ${startDate} - ${endDate}`}
          />
          <Alert
            type="warning"
            showIcon
            message="עובדים ללא מספר נייד או ללא שיבוצים בטווח ידלגו."
          />
        </div>
      ) : (
        <div className="space-y-3">
          <Alert
            type={result.success ? 'success' : 'warning'}
            showIcon
            message={result.message}
            description={`סה״כ ${result.totalEmployees} עובדים: נשלחו ${result.sentCount}, דולגו ${result.skippedCount}, נכשלו ${result.failedCount}.`}
          />
          <Table
            size="small"
            rowKey="userId"
            dataSource={result.results}
            pagination={{ pageSize: 8 }}
            columns={[
              { title: 'עובד', dataIndex: 'displayName' },
              {
                title: 'טלפון',
                dataIndex: 'phone',
                render: (v: string | null) => v || '—',
              },
              {
                title: 'שיבוצים',
                dataIndex: 'shiftCount',
                width: 80,
              },
              {
                title: 'סטטוס',
                dataIndex: 'status',
                width: 100,
                render: (status: DispatchResult['status']) => {
                  const color =
                    status === 'sent'
                      ? 'green'
                      : status === 'failed'
                        ? 'red'
                        : 'default';
                  const label =
                    status === 'sent'
                      ? 'נשלח'
                      : status === 'failed'
                        ? 'נכשל'
                        : 'דולג';
                  return <Tag color={color}>{label}</Tag>;
                },
              },
              {
                title: 'הערה',
                dataIndex: 'error',
                render: (err: string | null) => err || '—',
              },
            ]}
          />
        </div>
      )}
    </Modal>
  );
}
