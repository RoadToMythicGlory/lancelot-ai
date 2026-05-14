'use client'

import React, { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { Card, Table, Tag, Button, Modal, Form, Input, Select, Tabs, Space, message, Spin, Empty, Alert, Checkbox } from 'antd'
import {
  KeyIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import { Permission } from '@/rbac'
import { GET_API_KEYS, GET_WEBHOOKS } from '@/graphql/saasQueries'
import {
  CREATE_API_KEY,
  REVOKE_API_KEY,
  CREATE_WEBHOOK,
  UPDATE_WEBHOOK,
  DELETE_WEBHOOK,
  TEST_WEBHOOK,
} from '@/graphql/saasMutations'

const availableScopes = [
  { value: 'broadcasts:read', label: 'שידורים - קריאה' },
  { value: 'broadcasts:write', label: 'שידורים - כתיבה' },
  { value: 'shifts:read', label: 'משמרות - קריאה' },
  { value: 'shifts:write', label: 'משמרות - כתיבה' },
  { value: 'users:read', label: 'משתמשים - קריאה' },
  { value: 'equipment:read', label: 'ציוד - קריאה' },
  { value: 'equipment:write', label: 'ציוד - כתיבה' },
  { value: 'media:read', label: 'מדיה - קריאה' },
  { value: 'media:write', label: 'מדיה - כתיבה' },
  { value: 'rights:read', label: 'זכויות - קריאה' },
]

const availableEvents = [
  { value: 'broadcast.created', label: 'שידור נוצר' },
  { value: 'broadcast.updated', label: 'שידור עודכן' },
  { value: 'broadcast.deleted', label: 'שידור נמחק' },
  { value: 'broadcast.status_changed', label: 'שידור - שינוי סטטוס' },
  { value: 'shift.assigned', label: 'משמרת שובצה' },
  { value: 'shift.swap_requested', label: 'בקשת החלפת משמרת' },
  { value: 'equipment.assigned', label: 'ציוד שובץ' },
  { value: 'equipment.returned', label: 'ציוד הוחזר' },
  { value: 'workflow.completed', label: 'תהליך הושלם' },
  { value: 'user.created', label: 'משתמש נוצר' },
]

export default function IntegrationsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('api-keys')
  const [createKeyModal, setCreateKeyModal] = useState(false)
  const [createWebhookModal, setCreateWebhookModal] = useState(false)
  const [newApiSecret, setNewApiSecret] = useState<string | null>(null)

  const { data: keysData, loading: keysLoading, refetch: refetchKeys } = useQuery(GET_API_KEYS)
  const { data: webhooksData, loading: webhooksLoading, refetch: refetchWebhooks } = useQuery(GET_WEBHOOKS)

  const [createApiKey] = useMutation(CREATE_API_KEY)
  const [revokeApiKey] = useMutation(REVOKE_API_KEY)
  const [createWebhook] = useMutation(CREATE_WEBHOOK)
  const [deleteWebhook] = useMutation(DELETE_WEBHOOK)
  const [testWebhook] = useMutation(TEST_WEBHOOK)

  const apiKeys = keysData?.apiKeys || []
  const webhooks = webhooksData?.webhooks || []

  const handleCreateKey = async (values: any) => {
    try {
      const { data } = await createApiKey({ variables: { input: values } })
      setNewApiSecret(data.createApiKey.secret)
      refetchKeys()
      message.success('מפתח API נוצר בהצלחה')
    } catch (err: any) {
      message.error(err.message)
    }
  }

  const handleRevokeKey = async (id: string) => {
    Modal.confirm({
      title: 'ביטול מפתח API',
      content: 'מפתח זה יפסיק לעבוד מיד. האם להמשיך?',
      okText: 'בטל מפתח',
      cancelText: 'חזור',
      okType: 'danger',
      onOk: async () => {
        await revokeApiKey({ variables: { id } })
        refetchKeys()
        message.success('המפתח בוטל')
      },
    })
  }

  const handleCreateWebhook = async (values: any) => {
    try {
      await createWebhook({ variables: { input: values } })
      setCreateWebhookModal(false)
      refetchWebhooks()
      message.success('Webhook נוצר בהצלחה')
    } catch (err: any) {
      message.error(err.message)
    }
  }

  const handleDeleteWebhook = async (id: string) => {
    await deleteWebhook({ variables: { id } })
    refetchWebhooks()
    message.success('Webhook נמחק')
  }

  const handleTestWebhook = async (id: string) => {
    try {
      await testWebhook({ variables: { id } })
      message.success('Test ping נשלח')
    } catch (err: any) {
      message.error(err.message)
    }
  }

  const apiKeyColumns = [
    { title: 'שם', dataIndex: 'name', key: 'name' },
    {
      title: 'מפתח',
      dataIndex: 'keyPrefix',
      key: 'keyPrefix',
      render: (prefix: string) => <code>{prefix}...</code>,
    },
    {
      title: 'הרשאות',
      dataIndex: 'scopes',
      key: 'scopes',
      render: (scopes: string[]) => scopes?.slice(0, 3).map(s => <Tag key={s} className="text-xs">{s}</Tag>),
    },
    {
      title: 'סטטוס',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active: boolean) => <Tag color={active ? 'green' : 'red'}>{active ? 'פעיל' : 'מבוטל'}</Tag>,
    },
    {
      title: 'שימוש',
      dataIndex: 'usageCount',
      key: 'usageCount',
      render: (count: number) => count.toLocaleString(),
    },
    {
      title: 'נוצר',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => new Date(d).toLocaleDateString('he-IL'),
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_: any, record: any) => record.isActive && (
        <Button type="link" danger size="small" onClick={() => handleRevokeKey(record.id)}>
          בטל
        </Button>
      ),
    },
  ]

  const webhookColumns = [
    { title: 'שם', dataIndex: 'name', key: 'name' },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      render: (url: string) => <span className="text-xs font-mono">{url}</span>,
    },
    {
      title: 'אירועים',
      dataIndex: 'events',
      key: 'events',
      render: (events: string[]) => <span>{events?.length || 0} אירועים</span>,
    },
    {
      title: 'סטטוס',
      key: 'status',
      render: (_: any, record: any) => {
        if (!record.isActive) return <Tag color="default">כבוי</Tag>
        if (record.consecutiveFailures > 5) return <Tag color="red">שגיאה</Tag>
        if (record.consecutiveFailures > 0) return <Tag color="orange">כשלונות: {record.consecutiveFailures}</Tag>
        return <Tag color="green">תקין</Tag>
      },
    },
    {
      title: 'משלוח אחרון',
      dataIndex: 'lastDeliveryAt',
      key: 'lastDeliveryAt',
      render: (d: string) => d ? new Date(d).toLocaleString('he-IL') : '-',
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleTestWebhook(record.id)}>
            בדיקה
          </Button>
          <Button type="link" danger size="small" onClick={() => handleDeleteWebhook(record.id)}>
            מחק
          </Button>
        </Space>
      ),
    },
  ]

  const { hasPermission } = useAuth()
  const canManage = hasPermission(Permission.INTEGRATIONS_MANAGE)

  return (
    <ProtectedRoute requires={Permission.INTEGRATIONS_VIEW}>
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <LinkIcon className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">אינטגרציות ו-API</h1>
        </div>
        <p className="text-gray-500">ניהול מפתחות API, Webhooks ואינטגרציות חיצוניות</p>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'api-keys',
            label: (
              <span className="flex items-center gap-2">
                <KeyIcon className="h-4 w-4" />
                מפתחות API
              </span>
            ),
            children: (
              <div>
                <div className="flex justify-between mb-4">
                  <p className="text-gray-500">ניהול מפתחות API לגישה חיצונית למערכת</p>
                  {canManage && (
                    <Button
                      type="primary"
                      icon={<PlusIcon className="h-4 w-4" />}
                      onClick={() => setCreateKeyModal(true)}
                    >
                      מפתח חדש
                    </Button>
                  )}
                </div>
                <Card>
                  <Table
                    dataSource={apiKeys}
                    columns={apiKeyColumns}
                    rowKey="id"
                    loading={keysLoading}
                    locale={{ emptyText: 'אין מפתחות API' }}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'webhooks',
            label: (
              <span className="flex items-center gap-2">
                <ArrowPathIcon className="h-4 w-4" />
                Webhooks
              </span>
            ),
            children: (
              <div>
                <div className="flex justify-between mb-4">
                  <p className="text-gray-500">קבל התראות בזמן אמת על אירועים במערכת</p>
                  {canManage && (
                    <Button
                      type="primary"
                      icon={<PlusIcon className="h-4 w-4" />}
                      onClick={() => setCreateWebhookModal(true)}
                    >
                      Webhook חדש
                    </Button>
                  )}
                </div>
                <Card>
                  <Table
                    dataSource={webhooks}
                    columns={webhookColumns}
                    rowKey="id"
                    loading={webhooksLoading}
                    locale={{ emptyText: 'אין Webhooks' }}
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />

      {/* Create API Key Modal */}
      <Modal
        title="יצירת מפתח API"
        open={createKeyModal}
        onCancel={() => { setCreateKeyModal(false); setNewApiSecret(null) }}
        footer={null}
        width={600}
      >
        {newApiSecret ? (
          <div>
            <Alert
              message="שמור את המפתח הזה - הוא לא יוצג שוב!"
              type="warning"
              showIcon
              className="mb-4"
            />
            <div className="p-4 bg-gray-100 rounded-lg font-mono text-sm break-all">
              {newApiSecret}
            </div>
            <Button
              icon={<ClipboardDocumentIcon className="h-4 w-4" />}
              onClick={() => {
                navigator.clipboard.writeText(newApiSecret)
                message.success('הועתק ללוח')
              }}
              className="mt-3"
            >
              העתק
            </Button>
          </div>
        ) : (
          <Form layout="vertical" onFinish={handleCreateKey}>
            <Form.Item name="name" label="שם" rules={[{ required: true }]}>
              <Input placeholder="e.g., Production API Key" />
            </Form.Item>
            <Form.Item name="description" label="תיאור">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="scopes" label="הרשאות" rules={[{ required: true }]}>
              <Checkbox.Group>
                <div className="grid grid-cols-2 gap-2">
                  {availableScopes.map(scope => (
                    <Checkbox key={scope.value} value={scope.value}>
                      {scope.label}
                    </Checkbox>
                  ))}
                </div>
              </Checkbox.Group>
            </Form.Item>
            <Button type="primary" htmlType="submit">צור מפתח</Button>
          </Form>
        )}
      </Modal>

      {/* Create Webhook Modal */}
      <Modal
        title="יצירת Webhook"
        open={createWebhookModal}
        onCancel={() => setCreateWebhookModal(false)}
        footer={null}
        width={600}
      >
        <Form layout="vertical" onFinish={handleCreateWebhook}>
          <Form.Item name="name" label="שם" rules={[{ required: true }]}>
            <Input placeholder="e.g., Slack Notifications" />
          </Form.Item>
          <Form.Item name="url" label="URL" rules={[{ required: true, type: 'url' }]}>
            <Input placeholder="https://example.com/webhook" />
          </Form.Item>
          <Form.Item name="events" label="אירועים" rules={[{ required: true }]}>
            <Checkbox.Group>
              <div className="grid grid-cols-2 gap-2">
                {availableEvents.map(event => (
                  <Checkbox key={event.value} value={event.value}>
                    {event.label}
                  </Checkbox>
                ))}
              </div>
            </Checkbox.Group>
          </Form.Item>
          <Form.Item name="description" label="תיאור">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit">צור Webhook</Button>
        </Form>
      </Modal>
    </div>
    </ProtectedRoute>
  )
}
