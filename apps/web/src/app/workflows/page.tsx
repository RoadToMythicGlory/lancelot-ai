'use client'

import React, { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { Card, Table, Tag, Button, Modal, Form, Input, Select, Steps, Space, Spin, Empty, Badge, Tabs } from 'antd'
import {
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import { Permission } from '@/rbac'
import { GET_WORKFLOW_TEMPLATES, GET_WORKFLOW_INSTANCES, GET_MY_PENDING_APPROVALS } from '@/graphql/saasQueries'
import { CREATE_WORKFLOW_TEMPLATE, PROCESS_WORKFLOW_ACTION, START_WORKFLOW } from '@/graphql/saasMutations'

const statusLabels: Record<string, { label: string; color: string }> = {
  in_progress: { label: 'בתהליך', color: 'processing' },
  completed: { label: 'הושלם', color: 'success' },
  cancelled: { label: 'בוטל', color: 'default' },
  failed: { label: 'נכשל', color: 'error' },
  waiting: { label: 'ממתין', color: 'warning' },
}

const stepStatusIcons: Record<string, React.ReactNode> = {
  pending: <ClockIcon className="h-4 w-4 text-gray-400" />,
  approved: <CheckCircleIcon className="h-4 w-4 text-green-500" />,
  rejected: <XCircleIcon className="h-4 w-4 text-red-500" />,
  completed: <CheckCircleIcon className="h-4 w-4 text-green-500" />,
  timed_out: <ClockIcon className="h-4 w-4 text-orange-500" />,
}

export default function WorkflowsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('instances')
  const [detailModal, setDetailModal] = useState<any>(null)

  const { data: templatesData, loading: tLoading } = useQuery(GET_WORKFLOW_TEMPLATES)
  const { data: instancesData, loading: iLoading, refetch: refetchInstances } = useQuery(GET_WORKFLOW_INSTANCES, {
    variables: { limit: 50 },
  })
  const { data: approvalsData, loading: aLoading } = useQuery(GET_MY_PENDING_APPROVALS)

  const [processAction] = useMutation(PROCESS_WORKFLOW_ACTION)

  const templates = templatesData?.workflowTemplates || []
  const instances = instancesData?.workflowInstances || []
  const pendingApprovals = approvalsData?.myPendingApprovals || []

  const handleApprove = async (instanceId: string, comment?: string) => {
    try {
      await processAction({
        variables: {
          input: { instanceId, action: 'approved', comment },
        }
      })
      refetchInstances()
    } catch (err: any) {
      console.error(err)
    }
  }

  const handleReject = async (instanceId: string, comment?: string) => {
    try {
      await processAction({
        variables: {
          input: { instanceId, action: 'rejected', comment },
        }
      })
      refetchInstances()
    } catch (err: any) {
      console.error(err)
    }
  }

  const instanceColumns = [
    {
      title: 'תהליך',
      dataIndex: 'templateName',
      key: 'templateName',
      render: (name: string, record: any) => (
        <div>
          <p className="font-medium">{name}</p>
          {record.resourceName && <p className="text-xs text-gray-500">{record.resourceName}</p>}
        </div>
      ),
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const info = statusLabels[status] || { label: status, color: 'default' }
        return <Badge status={info.color as any} text={info.label} />
      },
    },
    {
      title: 'שלב נוכחי',
      key: 'currentStep',
      render: (_: any, record: any) => {
        const current = record.stepHistory?.[record.currentStepIndex]
        return current ? (
          <Tag>{current.stepName}</Tag>
        ) : '-'
      },
    },
    {
      title: 'SLA',
      key: 'sla',
      render: (_: any, record: any) => {
        if (record.slaBreached) return <Tag color="red">חריגת SLA</Tag>
        if (record.slaDeadline) {
          const remaining = new Date(record.slaDeadline).getTime() - Date.now()
          if (remaining > 0) {
            const hours = Math.floor(remaining / (1000 * 60 * 60))
            return <span className="text-sm">{hours} שעות נותרו</span>
          }
        }
        return '-'
      },
    },
    {
      title: 'יוזם',
      dataIndex: 'initiatedByName',
      key: 'initiatedByName',
    },
    {
      title: 'תאריך',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => new Date(d).toLocaleDateString('he-IL'),
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_: any, record: any) => (
        <Button type="link" size="small" onClick={() => setDetailModal(record)}>
          פרטים
        </Button>
      ),
    },
  ]

  const templateColumns = [
    { title: 'שם', dataIndex: 'name', key: 'name' },
    {
      title: 'טריגר',
      dataIndex: 'triggerType',
      key: 'triggerType',
      render: (type: string) => <Tag>{type}</Tag>,
    },
    {
      title: 'סוג משאב',
      dataIndex: 'resourceType',
      key: 'resourceType',
    },
    {
      title: 'שלבים',
      dataIndex: 'steps',
      key: 'steps',
      render: (steps: any[]) => steps?.length || 0,
    },
    {
      title: 'פעיל',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? 'פעיל' : 'כבוי'}</Tag>
      ),
    },
  ]

  return (
    <ProtectedRoute requires={Permission.WORKFLOWS_VIEW}>
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ArrowPathIcon className="h-7 w-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">מנוע תהליכים</h1>
          </div>
          <p className="text-gray-500">ניהול תהליכי אישור, אוטומציות ו-SLA</p>
        </div>
      </div>

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <Card className="mb-4 border-orange-200 bg-orange-50">
          <h3 className="font-semibold text-orange-800 mb-3">
            {pendingApprovals.length} אישורים ממתינים
          </h3>
          <div className="space-y-2">
            {pendingApprovals.map((approval: any) => (
              <div key={approval.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                <div>
                  <p className="font-medium">{approval.templateName}</p>
                  <p className="text-sm text-gray-500">{approval.resourceName} - על ידי {approval.initiatedByName}</p>
                </div>
                <Space>
                  <Button type="primary" size="small" onClick={() => handleApprove(approval.id)}>
                    אשר
                  </Button>
                  <Button danger size="small" onClick={() => handleReject(approval.id)}>
                    דחה
                  </Button>
                </Space>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'instances',
            label: `תהליכים (${instances.length})`,
            children: (
              <Card>
                <Table
                  dataSource={instances}
                  columns={instanceColumns}
                  rowKey="id"
                  loading={iLoading}
                  pagination={{ pageSize: 15 }}
                  locale={{ emptyText: 'אין תהליכים' }}
                />
              </Card>
            ),
          },
          {
            key: 'templates',
            label: `תבניות (${templates.length})`,
            children: (
              <Card>
                <Table
                  dataSource={templates}
                  columns={templateColumns}
                  rowKey="id"
                  loading={tLoading}
                  locale={{ emptyText: 'אין תבניות' }}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* Detail Modal */}
      <Modal
        title="פרטי תהליך"
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={null}
        width={600}
      >
        {detailModal && (
          <div className="space-y-4">
            <div className="flex justify-between">
              <div>
                <p className="text-sm text-gray-500">תבנית</p>
                <p className="font-medium">{detailModal.templateName}</p>
              </div>
              <Badge
                status={(statusLabels[detailModal.status]?.color || 'default') as any}
                text={statusLabels[detailModal.status]?.label || detailModal.status}
              />
            </div>
            {detailModal.resourceName && (
              <div>
                <p className="text-sm text-gray-500">משאב</p>
                <p className="font-medium">{detailModal.resourceName}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500 mb-2">שלבים</p>
              <Steps
                current={detailModal.currentStepIndex}
                direction="vertical"
                size="small"
                items={detailModal.stepHistory?.map((step: any) => ({
                  title: step.stepName,
                  description: step.completedAt
                    ? `${step.assigneeName || ''} - ${new Date(step.completedAt).toLocaleString('he-IL')}`
                    : step.status === 'pending' ? 'ממתין' : '',
                  status: step.status === 'approved' || step.status === 'completed' ? 'finish'
                    : step.status === 'rejected' ? 'error'
                    : step.status === 'pending' ? 'wait' : 'process',
                }))}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
    </ProtectedRoute>
  )
}
