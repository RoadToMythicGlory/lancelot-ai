'use client'

import React, { useMemo, useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  App as AntApp,
  Badge,
  Button,
  Card,
  Divider,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import {
  LifebuoyIcon,
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { Permission } from '@/rbac'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { GET_IT_TICKETS, GET_IT_TICKET } from '@/graphql/itSupportQueries'
import {
  ADD_IT_TICKET_MESSAGE,
  ASSIGN_IT_TICKET,
  CLOSE_IT_TICKET,
  UPDATE_IT_TICKET_STATUS,
} from '@/graphql/itSupportMutations'

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  open: { label: 'פתוח', color: 'blue' },
  in_progress: { label: 'בטיפול', color: 'processing' },
  waiting_on_user: { label: 'ממתין למשתמש', color: 'orange' },
  waiting_on_it: { label: 'ממתין לצוות IT', color: 'purple' },
  resolved: { label: 'נפתר', color: 'green' },
  closed: { label: 'סגור', color: 'default' },
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'default',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
}

const STATUS_OPTIONS = [
  { value: 'OPEN', label: STATUS_INFO.open.label },
  { value: 'IN_PROGRESS', label: STATUS_INFO.in_progress.label },
  { value: 'WAITING_ON_USER', label: STATUS_INFO.waiting_on_user.label },
  { value: 'WAITING_ON_IT', label: STATUS_INFO.waiting_on_it.label },
  { value: 'RESOLVED', label: STATUS_INFO.resolved.label },
  { value: 'CLOSED', label: STATUS_INFO.closed.label },
]

export default function ItSupportPage() {
  return (
    <ProtectedRoute requires={Permission.IT_SUPPORT_MANAGE}>
      <ItSupportInner />
    </ProtectedRoute>
  )
}

function ItSupportInner() {
  const { user } = useAuth()
  const { message, modal } = AntApp.useApp()
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')

  const { data, loading, refetch } = useQuery(GET_IT_TICKETS, {
    variables: { status: statusFilter, limit: 200, offset: 0 },
    fetchPolicy: 'cache-and-network',
  })

  const { data: detailData, refetch: refetchDetail } = useQuery(GET_IT_TICKET, {
    variables: { id: selectedTicketId },
    skip: !selectedTicketId,
    fetchPolicy: 'cache-and-network',
  })

  const [addMessage, { loading: replying }] = useMutation(ADD_IT_TICKET_MESSAGE)
  const [updateStatus] = useMutation(UPDATE_IT_TICKET_STATUS)
  const [assignTicket] = useMutation(ASSIGN_IT_TICKET)
  const [closeTicket] = useMutation(CLOSE_IT_TICKET)

  const tickets = useMemo(() => {
    const items = (data?.itTickets || []) as any[]
    if (!searchTerm) return items
    const t = searchTerm.toLowerCase()
    return items.filter((it) =>
      [it.ticketNumber, it.subject, it.createdByName, it.createdByEmail]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(t)),
    )
  }, [data, searchTerm])

  const detail = detailData?.itTicket

  const openCount = useMemo(
    () => (data?.itTickets || []).filter((t: any) => t.status !== 'closed').length,
    [data],
  )

  const handleSendReply = async () => {
    if (!detail || !replyDraft.trim()) return
    try {
      await addMessage({
        variables: { input: { ticketId: detail.id, message: replyDraft.trim() } },
      })
      setReplyDraft('')
      message.success('התגובה נשלחה')
      await Promise.all([refetchDetail(), refetch()])
    } catch (err: any) {
      message.error(err.message || 'שליחת התגובה נכשלה')
    }
  }

  const handleStatusChange = async (status: string) => {
    if (!detail) return
    try {
      await updateStatus({ variables: { id: detail.id, status } })
      message.success('הסטטוס עודכן')
      await Promise.all([refetchDetail(), refetch()])
    } catch (err: any) {
      message.error(err.message || 'עדכון הסטטוס נכשל')
    }
  }

  const handleAssignToMe = async () => {
    if (!detail || !user) return
    try {
      await assignTicket({ variables: { id: detail.id, assigneeId: user.id } })
      message.success('הפנייה שויכה אליך')
      await Promise.all([refetchDetail(), refetch()])
    } catch (err: any) {
      message.error(err.message || 'שיוך הפנייה נכשל')
    }
  }

  const handleCloseTicket = () => {
    if (!detail) return
    modal.confirm({
      title: 'סגירת פנייה',
      content: 'הפנייה תסומן כסגורה. ניתן יהיה רק לקרוא אותה לאחר מכן.',
      okText: 'כן, סגור',
      cancelText: 'ביטול',
      okType: 'danger',
      onOk: async () => {
        try {
          await closeTicket({ variables: { id: detail.id } })
          message.success('הפנייה נסגרה')
          await Promise.all([refetchDetail(), refetch()])
        } catch (err: any) {
          message.error(err.message || 'סגירת הפנייה נכשלה')
        }
      },
    })
  }

  const columns = [
    {
      title: '#',
      dataIndex: 'ticketNumber',
      key: 'ticketNumber',
      width: 140,
      render: (n: string) => <span className="font-mono text-xs text-gray-500">{n}</span>,
    },
    { title: 'נושא', dataIndex: 'subject', key: 'subject', ellipsis: true },
    {
      title: 'מבקש',
      dataIndex: 'createdByName',
      key: 'createdByName',
      width: 180,
      render: (name: string, row: any) => (
        <div className="flex flex-col">
          <span>{name}</span>
          <span className="text-xs text-gray-400">{row.createdByEmail}</span>
        </div>
      ),
    },
    {
      title: 'עדיפות',
      dataIndex: 'priority',
      key: 'priority',
      width: 110,
      render: (p: string) => <Tag color={PRIORITY_COLORS[p] || 'default'}>{p}</Tag>,
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (s: string) => {
        const info = STATUS_INFO[s] || { label: s, color: 'default' }
        return <Badge status={info.color as any} text={info.label} />
      },
    },
    {
      title: 'משויך אל',
      dataIndex: 'assignedToName',
      key: 'assignedToName',
      width: 160,
      render: (v: string) => v || <span className="text-gray-400">לא משויך</span>,
    },
    {
      title: 'נוצר',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (d: string) => new Date(d).toLocaleString('he-IL'),
    },
  ]

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <LifebuoyIcon className="h-7 w-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">תמיכת IT פנימית</h1>
            {openCount > 0 && <Badge count={openCount} overflowCount={999} />}
          </div>
          <p className="text-gray-500">ניהול פניות תמיכה פנימיות מהעובדים אל צוות ה-IT</p>
        </div>
        <Tooltip title="רענון רשימה">
          <Button icon={<ArrowPathIcon className="h-4 w-4" />} onClick={() => refetch()}>
            רענן
          </Button>
        </Tooltip>
      </div>

      <Card className="mb-4">
        <Space wrap size={[8, 8]}>
          <Select
            allowClear
            placeholder="סינון לפי סטטוס"
            style={{ width: 200 }}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={STATUS_OPTIONS}
          />
          <Input.Search
            allowClear
            placeholder="חיפוש לפי מבקש / נושא / מספר פנייה"
            style={{ width: 360 }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </Space>
      </Card>

      <Card>
        {loading && !data ? (
          <div className="flex justify-center p-12">
            <Spin size="large" />
          </div>
        ) : tickets.length === 0 ? (
          <Empty description="אין פניות" />
        ) : (
          <Table
            rowKey="id"
            dataSource={tickets}
            columns={columns as any}
            pagination={{ pageSize: 25, showSizeChanger: true }}
            onRow={(row) => ({ onClick: () => setSelectedTicketId(row.id) })}
            rowClassName="cursor-pointer"
          />
        )}
      </Card>

      <Modal
        title={detail ? `${detail.ticketNumber} — ${detail.subject}` : 'פנייה'}
        open={!!selectedTicketId}
        onCancel={() => {
          setSelectedTicketId(null)
          setReplyDraft('')
        }}
        footer={null}
        width={800}
      >
        {!detail ? (
          <div className="flex justify-center p-8">
            <Spin />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                status={(STATUS_INFO[detail.status]?.color || 'default') as any}
                text={STATUS_INFO[detail.status]?.label || detail.status}
              />
              <Tag color={PRIORITY_COLORS[detail.priority] || 'default'}>{detail.priority}</Tag>
              <Tag>{detail.category}</Tag>
              <span className="text-xs text-gray-500">
                {detail.createdByName} ({detail.createdByEmail})
              </span>
              <span className="text-xs text-gray-400">
                נפתח ב-{new Date(detail.createdAt).toLocaleString('he-IL')}
              </span>
            </div>

            <Space wrap size={[8, 8]}>
              <Select
                size="small"
                value={String(detail.status).toUpperCase()}
                style={{ minWidth: 180 }}
                onChange={(v) => handleStatusChange(v)}
                options={STATUS_OPTIONS}
              />
              <Button
                size="small"
                icon={<CheckCircleIcon className="h-4 w-4" />}
                onClick={handleAssignToMe}
                disabled={!user}
              >
                שייך אליי
              </Button>
              {detail.status !== 'closed' && (
                <Button
                  size="small"
                  danger
                  icon={<XCircleIcon className="h-4 w-4" />}
                  onClick={handleCloseTicket}
                >
                  סגור פנייה
                </Button>
              )}
              {detail.assignedToName && (
                <span className="text-xs text-gray-500">
                  משויך ל-{detail.assignedToName}
                </span>
              )}
            </Space>

            <Divider style={{ margin: '8px 0' }} />

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {(detail.messages || []).map((msg: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    msg.senderType === 'support'
                      ? 'bg-blue-50 border-blue-100 mr-8'
                      : 'bg-gray-50 border-gray-100 ml-8'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-sm">
                      {msg.senderName}
                      {msg.senderType === 'support' && (
                        <Tag className="mr-2" color="blue">
                          IT
                        </Tag>
                      )}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(msg.createdAt).toLocaleString('he-IL')}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                </div>
              ))}
            </div>

            <Divider style={{ margin: '8px 0' }} />

            <div className="space-y-2">
              <Input.TextArea
                rows={3}
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder="הקלד תגובה למבקש..."
              />
              <div className="flex justify-end">
                <Button
                  type="primary"
                  icon={<ChatBubbleLeftRightIcon className="h-4 w-4" />}
                  loading={replying}
                  disabled={!replyDraft.trim()}
                  onClick={handleSendReply}
                >
                  שלח תגובה
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
