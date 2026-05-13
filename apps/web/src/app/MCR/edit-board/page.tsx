'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { ActivityRow, ActivityStatus, BroadcastType, WarehouseEquipmentAssignment } from '../types';
import { GET_ACTIVITY_ROWS } from '@/graphql/mcrQueries';
import { CREATE_ACTIVITY_ROW, UPDATE_ACTIVITY_ROW, HIDE_ACTIVITY_ROW } from '@/graphql/mcrMutations';
import RichTextEditor from '../components/RichTextEditor';
import { Table, DatePicker, Button, Select, Tag, Popconfirm, App, Empty, Skeleton, Space, Tooltip } from 'antd';
import { PlusOutlined, ReloadOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const broadcastTypes: BroadcastType[] = [
  'SRT_CALLER', 'SRT_LISTENER', 'DVBS2', 'DVBS2X', 'NS4', 'NS3',
  'RTMP', 'ZIXI', 'PRT', 'LIVEU', 'KLITA_MOU', 'OTHER',
];

const broadcastTypeLabels: Record<BroadcastType, string> = {
  'SRT_CALLER': 'SRT CALLER', 'SRT_LISTENER': 'SRT LISTENER',
  'DVBS2': 'DVBS2', 'DVBS2X': 'DVBS2X', 'NS3': 'NS3', 'NS4': 'NS4',
  'RTMP': 'RTMP', 'ZIXI': 'ZIXI', 'PRT': 'PRT', 'LIVEU': 'LIVEU',
  'KLITA_MOU': 'קליטה מOU', 'OTHER': 'OTHER',
};

const broadcastTypeColors: Record<BroadcastType, string> = {
  'SRT_CALLER': '#7ca13d', 'SRT_LISTENER': '#a8cc6a', 'DVBS2': '#ed80e8',
  'DVBS2X': '#54b0c7', 'NS3': '#1b943b', 'NS4': '#1b943b', 'RTMP': '#d46eab',
  'ZIXI': '#ff6b6b', 'LIVEU': '#e8ca92', 'PRT': '#c2e8ed', 'KLITA_MOU': '#b135de',
  'OTHER': '#e31464',
};

const statusLabels: Record<ActivityStatus, string> = {
  'UNKNOWN': 'לא הוגדר', 'READY': 'מוכן לשידור',
  'NOT_READY': 'לא מוכן לשידור', 'ERROR': 'תקלה',
};

const statusColors: Record<ActivityStatus, string> = {
  'READY': 'green', 'NOT_READY': 'orange', 'ERROR': 'red', 'UNKNOWN': 'default',
};

export default function EditBoardPage() {
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs>(dayjs());
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const { message } = App.useApp();

  const dateValid = selectedDate && selectedDate.isValid();

  const { data, loading, error, refetch } = useQuery(GET_ACTIVITY_ROWS, {
    variables: {
      date: dateValid ? selectedDate.startOf('day').toISOString() : new Date().toISOString(),
      includeHidden: true,
    },
    skip: !dateValid,
    fetchPolicy: 'cache-and-network',
  });

  const activities: ActivityRow[] = data?.activityRows ?? [];
  const visibleActivities = activities.filter(a => !a.isHidden);

  useEffect(() => {
    if (error) {
      message.error('שגיאה בטעינת נתונים: ' + error.message);
    }
  }, [error, message]);

  const [createActivityRow] = useMutation(CREATE_ACTIVITY_ROW, {
    refetchQueries: ['GetActivityRows'],
    onError: (err) => message.error('שגיאה ביצירת שורה: ' + err.message),
  });

  const [updateActivityRow] = useMutation(UPDATE_ACTIVITY_ROW, {
    refetchQueries: ['GetActivityRows'],
    onError: (err) => message.error('שגיאה בעדכון: ' + err.message),
  });

  const [hideActivityRow] = useMutation(HIDE_ACTIVITY_ROW, {
    refetchQueries: ['GetActivityRows'],
    onError: (err) => message.error('שגיאה בהסתרת שורה: ' + err.message),
  });

  const handleAddRow = () => {
    if (!dateValid) return;
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    createActivityRow({
      variables: {
        input: {
          date: selectedDate.startOf('day').toISOString(),
          activityName: 'פעילות חדשה',
          time: currentTime,
          endTime: currentTime,
          status: 'UNKNOWN',
          isManual: true,
        },
      },
    });
  };

  const handleCellEdit = (rowId: string, field: string, value: string) => {
    updateActivityRow({ variables: { id: rowId, input: { [field]: value } } });
    setEditingCell(null);
  };

  const startEdit = (rowId: string, field: string, currentValue: string) => {
    setEditingCell({ rowId, field });
    setEditValue(currentValue || '');
  };

  const renderEditableCell = (activity: ActivityRow, field: keyof ActivityRow, isRichText = false) => {
    const isEditing = editingCell?.rowId === activity.id && editingCell?.field === field;
    const value = (activity[field] as string) || '';

    if (isEditing && isRichText) {
      return (
        <div>
          <RichTextEditor value={editValue} onChange={setEditValue} placeholder="" />
          <Space size={4} className="mt-1">
            <Button size="small" type="primary" onClick={() => handleCellEdit(activity.id, field, editValue)}>✓</Button>
            <Button size="small" onClick={() => setEditingCell(null)}>✕</Button>
          </Space>
        </div>
      );
    }

    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleCellEdit(activity.id, field, editValue)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCellEdit(activity.id, field, editValue);
            if (e.key === 'Escape') setEditingCell(null);
          }}
          className="w-full p-1 border rounded"
          autoFocus
        />
      );
    }

    if (isRichText) {
      return (
        <div
          onClick={() => startEdit(activity.id, field, value)}
          className="cursor-pointer p-1 hover:bg-gray-100 min-h-[30px] rounded"
          dangerouslySetInnerHTML={{ __html: value || '&nbsp;' }}
        />
      );
    }

    return (
      <div
        onClick={() => startEdit(activity.id, field, value)}
        className="cursor-pointer p-1 hover:bg-gray-100 min-h-[30px] rounded"
      >
        {value || '\u00A0'}
      </div>
    );
  };

  const columns: ColumnsType<ActivityRow> = [
    {
      title: 'מקור',
      dataIndex: 'broadcastEventId',
      key: 'origin',
      width: 90,
      render: (_: any, record: ActivityRow) => record.broadcastEventId
        ? <Tag color="blue">תכנון שידור</Tag>
        : <Tag>ידני</Tag>,
    },
    {
      title: 'פעילות',
      dataIndex: 'activityName',
      key: 'activityName',
      width: 160,
      render: (_: any, record: ActivityRow) => renderEditableCell(record, 'activityName'),
    },
    {
      title: 'שעה',
      dataIndex: 'time',
      key: 'time',
      width: 70,
      render: (_: any, record: ActivityRow) => renderEditableCell(record, 'time'),
    },
    {
      title: 'שעת סיום',
      dataIndex: 'endTime',
      key: 'endTime',
      width: 70,
      render: (_: any, record: ActivityRow) => renderEditableCell(record, 'endTime'),
    },
    {
      title: 'מקור שידור',
      dataIndex: 'source',
      key: 'source',
      width: 140,
      render: (_: any, record: ActivityRow) => renderEditableCell(record, 'source', true),
    },
    {
      title: 'מכשירים',
      dataIndex: 'equipment',
      key: 'equipment',
      width: 150,
      render: (_: any, record: ActivityRow) => renderEditableCell(record, 'equipment', true),
    },
    {
      title: 'ציוד מהמחסן',
      dataIndex: 'warehouseEquipment',
      key: 'warehouseEquipment',
      width: 140,
      render: (_: any, record: ActivityRow) => {
        const items = record.warehouseEquipment || [];
        if (items.length === 0) return <span className="text-gray-300">-</span>;
        return (
          <div className="space-y-1">
            {items.map((item: WarehouseEquipmentAssignment) => (
              <Tooltip key={item.id} title={item.assignmentNotes || ''}>
                <Tag color="blue" className="text-xs">
                  {item.eventName} (×{item.quantityAssigned})
                </Tag>
              </Tooltip>
            ))}
          </div>
        );
      },
    },
    {
      title: 'גיבוי',
      dataIndex: 'backup',
      key: 'backup',
      width: 140,
      render: (_: any, record: ActivityRow) => renderEditableCell(record, 'backup', true),
    },
    {
      title: 'ניתובים',
      dataIndex: 'routing',
      key: 'routing',
      width: 140,
      render: (_: any, record: ActivityRow) => renderEditableCell(record, 'routing', true),
    },
    {
      title: 'ערוץ',
      dataIndex: 'channel',
      key: 'channel',
      width: 80,
      render: (_: any, record: ActivityRow) => renderEditableCell(record, 'channel'),
    },
    {
      title: 'סוג שידור',
      dataIndex: 'broadcastType',
      key: 'broadcastType',
      width: 120,
      render: (_: any, record: ActivityRow) => {
        if (record.broadcastType) {
          return (
            <Tag style={{ backgroundColor: broadcastTypeColors[record.broadcastType] || '#666', color: 'white', border: 'none' }}>
              {broadcastTypeLabels[record.broadcastType] || record.broadcastType}
            </Tag>
          );
        }
        return (
          <Select
            size="small"
            placeholder="בחר סוג"
            style={{ width: '100%' }}
            onChange={(val) => handleCellEdit(record.id, 'broadcastType', val)}
            options={broadcastTypes.map(t => ({ value: t, label: broadcastTypeLabels[t] }))}
            allowClear
          />
        );
      },
    },
    {
      title: 'הערות',
      dataIndex: 'notes',
      key: 'notes',
      width: 150,
      render: (_: any, record: ActivityRow) => renderEditableCell(record, 'notes', true),
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (_: any, record: ActivityRow) => (
        <Select
          size="small"
          value={record.status}
          style={{ width: '100%' }}
          onChange={(val) => handleCellEdit(record.id, 'status', val)}
          options={Object.entries(statusLabels).map(([key, label]) => ({
            value: key,
            label: <Tag color={statusColors[key as ActivityStatus]}>{label}</Tag>,
          }))}
        />
      ),
    },
    {
      title: 'פעולות',
      key: 'actions',
      width: 90,
      align: 'center' as const,
      render: (_: any, record: ActivityRow) => (
        <Popconfirm
          title="הסתרת שורה"
          description="האם אתה בטוח שברצונך להסתיר שורה זו?"
          onConfirm={() => hideActivityRow({ variables: { id: record.id } })}
          okText="כן"
          cancelText="לא"
        >
          <Button size="small" danger icon={<EyeInvisibleOutlined />}>
            הסתר
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4" dir="rtl">
      <div className="w-full max-w-full" style={{ minWidth: 0 }}>
        <h1 className="text-2xl font-bold mb-4">לוח פעילויות עריכה</h1>

        <Space className="mb-4" size="middle" wrap>
          <Space wrap>
            <span className="font-medium">בחר תאריך:</span>
            <DatePicker
              value={selectedDate}
              onChange={(date) => { if (date) setSelectedDate(date); }}
              format="DD/MM/YYYY"
              allowClear={false}
            />
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRow}>
            הוסף שורה
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
            רענן
          </Button>
        </Space>

        {loading && visibleActivities.length === 0 ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : (
          <div className="w-full" style={{ minWidth: 0 }}>
            <Table
              columns={columns}
              dataSource={visibleActivities}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
              bordered
              sticky
              rowClassName={(record) => record.broadcastEventId ? 'bg-blue-50/50' : ''}
              locale={{
                emptyText: (
                  <Empty
                    description="אין פעילויות לתאריך זה"
                  >
                    <Button type="primary" onClick={handleAddRow}>הוסף שורה +</Button>
                  </Empty>
                ),
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
