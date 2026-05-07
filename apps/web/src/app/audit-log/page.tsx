'use client'

import React, { useState } from 'react'
import { useQuery } from '@apollo/client'
import { Card, Table, Tag, Input, Select, DatePicker, Space, Button, Spin, Drawer } from 'antd'
import { ShieldCheckIcon, FunnelIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { GET_AUDIT_LOGS } from '@/graphql/saasQueries'

const { RangePicker } = DatePicker

const actionLabels: Record<string, string> = {
  CREATE: 'יצירה',
  UPDATE: 'עדכון',
  DELETE: 'מחיקה',
  LOGIN: 'כניסה',
  LOGOUT: 'יציאה',
  INVITE: 'הזמנה',
  CHANGE_PLAN: 'שינוי תוכנית',
  REVOKE: 'ביטול',
}

const resourceLabels: Record<string, string> = {
  broadcast_event: 'אירוע שידור',
  shift: 'משמרת',
  user: 'משתמש',
  equipment: 'ציוד',
  organization: 'ארגון',
  security_settings: 'הגדרות אבטחה',
  api_key: 'מפתח API',
  broadcast_right: 'זכויות שידור',
  subscription: 'מנוי',
}

const severityColors: Record<string, string> = {
  info: 'blue',
  warning: 'orange',
  critical: 'red',
}

export default function AuditLogPage() {
  const { user } = useAuth()
  const [filters, setFilters] = useState<any>({})
  const [page, setPage] = useState(0)
  const [selectedEntry, setSelectedEntry] = useState<any>(null)
  const pageSize = 25

  const { data, loading } = useQuery(GET_AUDIT_LOGS, {
    variables: {
      filter: filters,
      limit: pageSize,
      offset: page * pageSize,
    },
  })

  const items = data?.auditLogs?.items || []
  const totalCount = data?.auditLogs?.totalCount || 0

  const columns = [
    {
      title: 'זמן',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('he-IL'),
    },
    {
      title: 'משתמש',
      dataIndex: 'userName',
      key: 'userName',
      width: 150,
      render: (name: string, record: any) => (
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-xs text-gray-500">{record.userEmail}</p>
        </div>
      ),
    },
    {
      title: 'פעולה',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (action: string) => (
        <Tag color={action === 'DELETE' ? 'red' : action === 'CREATE' ? 'green' : 'blue'}>
          {actionLabels[action] || action}
        </Tag>
      ),
    },
    {
      title: 'משאב',
      dataIndex: 'resource',
      key: 'resource',
      width: 150,
      render: (resource: string, record: any) => (
        <div>
          <p className="font-medium">{resourceLabels[resource] || resource}</p>
          {record.resourceName && (
            <p className="text-xs text-gray-500">{record.resourceName}</p>
          )}
        </div>
      ),
    },
    {
      title: 'חומרה',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (severity: string) => (
        <Tag color={severityColors[severity]}>{severity}</Tag>
      ),
    },
    {
      title: 'שינויים',
      key: 'changes',
      width: 100,
      render: (_: any, record: any) =>
        record.changes?.length > 0 ? (
          <Button type="link" size="small" onClick={() => setSelectedEntry(record)}>
            {record.changes.length} שינויים
          </Button>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
  ]

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheckIcon className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">יומן ביקורת</h1>
        </div>
        <p className="text-gray-500">מעקב אחר כל הפעולות שבוצעו במערכת</p>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder="חיפוש..."
            prefix={<MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />}
            onChange={e => setFilters({ ...filters, searchTerm: e.target.value || undefined })}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder="פעולה"
            allowClear
            style={{ width: 150 }}
            onChange={val => setFilters({ ...filters, action: val })}
          >
            {Object.entries(actionLabels).map(([key, label]) => (
              <Select.Option key={key} value={key}>{label}</Select.Option>
            ))}
          </Select>
          <Select
            placeholder="משאב"
            allowClear
            style={{ width: 150 }}
            onChange={val => setFilters({ ...filters, resource: val })}
          >
            {Object.entries(resourceLabels).map(([key, label]) => (
              <Select.Option key={key} value={key}>{label}</Select.Option>
            ))}
          </Select>
          <Select
            placeholder="חומרה"
            allowClear
            style={{ width: 120 }}
            onChange={val => setFilters({ ...filters, severity: val })}
          >
            <Select.Option value="INFO">Info</Select.Option>
            <Select.Option value="WARNING">Warning</Select.Option>
            <Select.Option value="CRITICAL">Critical</Select.Option>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table
          dataSource={items}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            total: totalCount,
            pageSize,
            current: page + 1,
            onChange: (p) => setPage(p - 1),
            showTotal: (total) => `סה"כ ${total} רשומות`,
          }}
          scroll={{ x: 900 }}
          locale={{ emptyText: 'אין רשומות ביקורת' }}
        />
      </Card>

      {/* Changes Drawer */}
      <Drawer
        title="פרטי שינויים"
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        width={500}
      >
        {selectedEntry && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">פעולה</p>
              <p className="font-medium">{actionLabels[selectedEntry.action] || selectedEntry.action}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">משאב</p>
              <p className="font-medium">{resourceLabels[selectedEntry.resource] || selectedEntry.resource}</p>
              {selectedEntry.resourceName && <p className="text-sm">{selectedEntry.resourceName}</p>}
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-2">שינויים</p>
              {selectedEntry.changes?.map((change: any, idx: number) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg mb-2">
                  <p className="font-medium text-sm">{change.field}</p>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div>
                      <p className="text-xs text-gray-500">לפני</p>
                      <p className="text-sm text-red-600">{JSON.stringify(change.oldValue) || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">אחרי</p>
                      <p className="text-sm text-green-600">{JSON.stringify(change.newValue) || '-'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
