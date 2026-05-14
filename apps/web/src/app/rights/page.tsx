'use client'

import React, { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { Card, Table, Tag, Input, Select, Button, Modal, Form, DatePicker, InputNumber, Space, Spin, Alert, Statistic } from 'antd'
import {
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import { Permission } from '@/rbac'
import { GET_BROADCAST_RIGHTS, GET_EXPIRING_RIGHTS } from '@/graphql/saasQueries'
import { CREATE_BROADCAST_RIGHT, UPDATE_BROADCAST_RIGHT, DELETE_BROADCAST_RIGHT } from '@/graphql/saasMutations'

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'טיוטה', color: 'default' },
  active: { label: 'פעיל', color: 'green' },
  expiring_soon: { label: 'פג בקרוב', color: 'orange' },
  expired: { label: 'פג תוקף', color: 'red' },
  terminated: { label: 'בוטל', color: 'red' },
}

const contentTypeLabels: Record<string, string> = {
  sports: 'ספורט',
  entertainment: 'בידור',
  news: 'חדשות',
  documentary: 'דוקומנטרי',
  movie: 'סרט',
  series: 'סדרה',
  other: 'אחר',
}

export default function RightsPage() {
  const { user } = useAuth()
  const [filter, setFilter] = useState<any>({})
  const [createModal, setCreateModal] = useState(false)
  const [createForm] = Form.useForm()

  const { data, loading, refetch } = useQuery(GET_BROADCAST_RIGHTS, {
    variables: { filter, limit: 50 },
  })
  const { data: expiringData } = useQuery(GET_EXPIRING_RIGHTS, {
    variables: { days: 30 },
  })

  const [createRight] = useMutation(CREATE_BROADCAST_RIGHT)
  const [deleteRight] = useMutation(DELETE_BROADCAST_RIGHT)

  const rights = data?.broadcastRights || []
  const expiringRights = expiringData?.expiringRights || []

  const handleCreate = async (values: any) => {
    try {
      const input = {
        ...values,
        startDate: values.startDate?.toISOString(),
        endDate: values.endDate?.toISOString(),
      }
      await createRight({ variables: { input } })
      setCreateModal(false)
      createForm.resetFields()
      refetch()
    } catch (err: any) {
      console.error(err)
    }
  }

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: 'מחיקת זכות שידור',
      content: 'האם אתה בטוח?',
      okText: 'מחק',
      cancelText: 'ביטול',
      okType: 'danger',
      onOk: async () => {
        await deleteRight({ variables: { id } })
        refetch()
      },
    })
  }

  const columns = [
    {
      title: 'כותרת',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: any) => (
        <div>
          <p className="font-medium">{title}</p>
          {record.sport && <p className="text-xs text-gray-500">{record.sport} - {record.league}</p>}
        </div>
      ),
    },
    {
      title: 'סוג',
      dataIndex: 'contentType',
      key: 'contentType',
      render: (type: string) => <Tag>{contentTypeLabels[type] || type}</Tag>,
    },
    {
      title: 'בעל הזכויות',
      dataIndex: 'rightsHolder',
      key: 'rightsHolder',
    },
    {
      title: 'תחילה',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (d: string) => new Date(d).toLocaleDateString('he-IL'),
    },
    {
      title: 'סיום',
      dataIndex: 'endDate',
      key: 'endDate',
      render: (d: string) => {
        const date = new Date(d)
        const isExpiringSoon = date.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
        return (
          <span className={isExpiringSoon ? 'text-orange-600 font-medium' : ''}>
            {date.toLocaleDateString('he-IL')}
          </span>
        )
      },
    },
    {
      title: 'בלעדיות',
      dataIndex: 'exclusivity',
      key: 'exclusivity',
      render: (ex: string) => {
        const labels: Record<string, { label: string; color: string }> = {
          exclusive: { label: 'בלעדי', color: 'gold' },
          non_exclusive: { label: 'לא בלעדי', color: 'default' },
          co_exclusive: { label: 'שיתופי', color: 'blue' },
        }
        const info = labels[ex] || { label: ex, color: 'default' }
        return <Tag color={info.color}>{info.label}</Tag>
      },
    },
    {
      title: 'עלות',
      dataIndex: 'cost',
      key: 'cost',
      render: (cost: number, record: any) => cost ? `${cost.toLocaleString()} ${record.currency}` : '-',
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const info = statusLabels[status] || { label: status, color: 'default' }
        return <Tag color={info.color}>{info.label}</Tag>
      },
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_: any, record: any) => (
        <Button type="link" danger size="small" onClick={() => handleDelete(record.id)}>
          מחק
        </Button>
      ),
    },
  ]

  return (
    <ProtectedRoute requires={Permission.RIGHTS_VIEW}>
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <DocumentCheckIcon className="h-7 w-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">ניהול זכויות שידור</h1>
          </div>
          <p className="text-gray-500">ניהול חוזים, זכויות שידור, שטחים ותפוגות</p>
        </div>
        <Button type="primary" icon={<PlusIcon className="h-4 w-4" />} onClick={() => setCreateModal(true)}>
          זכות חדשה
        </Button>
      </div>

      {/* Expiring Soon Alert */}
      {expiringRights.length > 0 && (
        <Alert
          message={`${expiringRights.length} זכויות פגות תוקף ב-30 הימים הקרובים`}
          type="warning"
          showIcon
          icon={<ExclamationTriangleIcon className="h-5 w-5" />}
          className="mb-4"
          action={
            <Button size="small" type="link">
              הצג
            </Button>
          }
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <Statistic title="סך הכל" value={rights.length} />
        </Card>
        <Card>
          <Statistic title="פעילות" value={rights.filter((r: any) => r.status === 'active').length} valueStyle={{ color: '#52c41a' }} />
        </Card>
        <Card>
          <Statistic title="פגות בקרוב" value={expiringRights.length} valueStyle={{ color: '#faad14' }} />
        </Card>
        <Card>
          <Statistic
            title="עלות כוללת"
            value={rights.reduce((sum: number, r: any) => sum + (r.cost || 0), 0)}
            prefix="$"
            precision={0}
          />
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder="חיפוש..."
            prefix={<MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />}
            onChange={e => setFilter({ ...filter, searchTerm: e.target.value || undefined })}
            style={{ width: 250 }}
            allowClear
          />
          <Select placeholder="סוג תוכן" allowClear style={{ width: 150 }}
            onChange={val => setFilter({ ...filter, contentType: val })}>
            {Object.entries(contentTypeLabels).map(([key, label]) => (
              <Select.Option key={key} value={key}>{label}</Select.Option>
            ))}
          </Select>
          <Select placeholder="סטטוס" allowClear style={{ width: 130 }}
            onChange={val => setFilter({ ...filter, status: val })}>
            {Object.entries(statusLabels).map(([key, info]) => (
              <Select.Option key={key} value={key.toUpperCase()}>{info.label}</Select.Option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table
          dataSource={rights}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 1100 }}
          locale={{ emptyText: 'אין זכויות שידור' }}
        />
      </Card>

      {/* Create Modal */}
      <Modal
        title="הוספת זכות שידור"
        open={createModal}
        onCancel={() => setCreateModal(false)}
        footer={null}
        width={700}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item name="title" label="כותרת" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="contentType" label="סוג תוכן" rules={[{ required: true }]}>
              <Select>
                {Object.entries(contentTypeLabels).map(([key, label]) => (
                  <Select.Option key={key} value={key}>{label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="rightsHolder" label="בעל הזכויות" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="contractNumber" label="מספר חוזה">
              <Input />
            </Form.Item>
            <Form.Item name="sport" label="ענף ספורט">
              <Input />
            </Form.Item>
            <Form.Item name="league" label="ליגה">
              <Input />
            </Form.Item>
            <Form.Item name="startDate" label="תאריך התחלה" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="endDate" label="תאריך סיום" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="exclusivity" label="בלעדיות">
              <Select defaultValue="non_exclusive">
                <Select.Option value="exclusive">בלעדי</Select.Option>
                <Select.Option value="non_exclusive">לא בלעדי</Select.Option>
                <Select.Option value="co_exclusive">שיתופי</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="cost" label="עלות">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="notes" label="הערות">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit">צור זכות שידור</Button>
        </Form>
      </Modal>
    </div>
    </ProtectedRoute>
  )
}
