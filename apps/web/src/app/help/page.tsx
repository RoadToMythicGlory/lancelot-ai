'use client'

import React, { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { Card, Input, Tag, Button, Tabs, Modal, Form, Select, List, Empty, Spin, Badge, Timeline, Divider } from 'antd'
import {
  QuestionMarkCircleIcon,
  BookOpenIcon,
  TicketIcon,
  MegaphoneIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import {
  GET_HELP_ARTICLES,
  GET_MY_SUPPORT_TICKETS,
  GET_CHANGELOG,
  GET_SUPPORT_TICKET,
} from '@/graphql/saasQueries'
import {
  CREATE_SUPPORT_TICKET,
  ADD_TICKET_MESSAGE,
  CLOSE_SUPPORT_TICKET,
  RATE_HELP_ARTICLE,
} from '@/graphql/saasMutations'

const categoryLabels: Record<string, string> = {
  getting_started: 'תחילת עבודה',
  broadcast: 'שידורים',
  mcr: 'MCR',
  shifts: 'משמרות',
  warehouse: 'מחסן',
  chat: 'צ\'אט',
  ai: 'AI',
  admin: 'ניהול',
  billing: 'חיוב',
  api: 'API',
  troubleshooting: 'פתרון בעיות',
}

const ticketStatusLabels: Record<string, { label: string; color: string }> = {
  open: { label: 'פתוח', color: 'blue' },
  in_progress: { label: 'בטיפול', color: 'processing' },
  waiting_on_customer: { label: 'ממתין לתגובתך', color: 'orange' },
  waiting_on_support: { label: 'ממתין לתמיכה', color: 'purple' },
  resolved: { label: 'נפתר', color: 'green' },
  closed: { label: 'סגור', color: 'default' },
}

const changeTypeLabels: Record<string, { label: string; color: string }> = {
  feature: { label: 'תכונה חדשה', color: 'green' },
  improvement: { label: 'שיפור', color: 'blue' },
  fix: { label: 'תיקון', color: 'orange' },
  breaking: { label: 'שינוי שובר', color: 'red' },
}

export default function HelpPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('articles')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>()
  const [createTicketModal, setCreateTicketModal] = useState(false)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

  const { data: articlesData, loading: aLoading } = useQuery(GET_HELP_ARTICLES, {
    variables: { category: selectedCategory, searchTerm: searchTerm || undefined },
  })
  const { data: ticketsData, loading: tLoading, refetch: refetchTickets } = useQuery(GET_MY_SUPPORT_TICKETS)
  const { data: changelogData, loading: cLoading } = useQuery(GET_CHANGELOG, {
    variables: { limit: 20 },
  })
  const { data: ticketDetailData } = useQuery(GET_SUPPORT_TICKET, {
    variables: { id: selectedTicketId },
    skip: !selectedTicketId,
  })

  const [createTicket] = useMutation(CREATE_SUPPORT_TICKET)
  const [addMessage] = useMutation(ADD_TICKET_MESSAGE)
  const [rateArticle] = useMutation(RATE_HELP_ARTICLE)

  const articles = articlesData?.helpArticles || []
  const tickets = ticketsData?.mySaasTickets || []
  const changelog = changelogData?.changelog || []
  const ticketDetail = ticketDetailData?.saasTicket

  const handleCreateTicket = async (values: any) => {
    try {
      await createTicket({ variables: { input: values } })
      setCreateTicketModal(false)
      refetchTickets()
    } catch (err: any) {
      console.error(err)
    }
  }

  const handleRate = async (articleId: string, helpful: boolean) => {
    try {
      await rateArticle({ variables: { articleId, helpful } })
    } catch (err: any) {
      console.error(err)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <QuestionMarkCircleIcon className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">מרכז עזרה ותמיכה</h1>
        </div>
        <p className="text-gray-500">מאמרי עזרה, פניות תמיכה ולוג שינויים</p>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'articles',
            label: (
              <span className="flex items-center gap-2">
                <BookOpenIcon className="h-4 w-4" />
                מאמרי עזרה
              </span>
            ),
            children: (
              <div>
                {/* Search & Filter */}
                <div className="flex gap-3 mb-4">
                  <Input
                    placeholder="חיפוש מאמרים..."
                    prefix={<MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ width: 300 }}
                    allowClear
                  />
                  <Select
                    placeholder="קטגוריה"
                    allowClear
                    style={{ width: 180 }}
                    value={selectedCategory}
                    onChange={val => setSelectedCategory(val)}
                  >
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <Select.Option key={key} value={key}>{label}</Select.Option>
                    ))}
                  </Select>
                </div>

                {/* Articles Grid */}
                {aLoading ? (
                  <div className="flex justify-center p-12"><Spin size="large" /></div>
                ) : articles.length === 0 ? (
                  <Empty description="לא נמצאו מאמרים" />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {articles.map((article: any) => (
                      <Card
                        key={article.id}
                        hoverable
                        className="h-full"
                      >
                        <Tag color="blue" className="mb-2">{categoryLabels[article.category] || article.category}</Tag>
                        <h3 className="font-semibold text-lg mb-2">{article.titleHe || article.title}</h3>
                        <p className="text-gray-500 text-sm mb-3">
                          {article.excerptHe || article.excerpt || ''}
                        </p>
                        <div className="flex items-center justify-between text-xs text-gray-400">
                          <span>{article.viewCount} צפיות</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRate(article.id, true)}
                              className="flex items-center gap-1 hover:text-green-500"
                            >
                              <HandThumbUpIcon className="h-3 w-3" /> {article.helpfulCount || 0}
                            </button>
                            <button
                              onClick={() => handleRate(article.id, false)}
                              className="flex items-center gap-1 hover:text-red-500"
                            >
                              <HandThumbDownIcon className="h-3 w-3" /> {article.notHelpfulCount || 0}
                            </button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'tickets',
            label: (
              <span className="flex items-center gap-2">
                <TicketIcon className="h-4 w-4" />
                פניות תמיכה
                {tickets.filter((t: any) => t.status !== 'closed').length > 0 && (
                  <Badge count={tickets.filter((t: any) => t.status !== 'closed').length} />
                )}
              </span>
            ),
            children: (
              <div>
                <div className="flex justify-between mb-4">
                  <h3 className="text-lg font-semibold">הפניות שלי</h3>
                  <Button
                    type="primary"
                    icon={<PlusIcon className="h-4 w-4" />}
                    onClick={() => setCreateTicketModal(true)}
                  >
                    פנייה חדשה
                  </Button>
                </div>

                {tLoading ? (
                  <Spin size="large" />
                ) : tickets.length === 0 ? (
                  <Empty description="אין פניות" />
                ) : (
                  <List
                    dataSource={tickets}
                    renderItem={(ticket: any) => (
                      <List.Item
                        className="cursor-pointer hover:bg-gray-50 rounded-lg p-3"
                        onClick={() => setSelectedTicketId(ticket.id)}
                      >
                        <List.Item.Meta
                          title={
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{ticket.ticketNumber}</span>
                              <span className="font-medium">{ticket.subject}</span>
                            </div>
                          }
                          description={
                            <div className="flex items-center gap-2 mt-1">
                              <Badge
                                status={(ticketStatusLabels[ticket.status]?.color || 'default') as any}
                                text={ticketStatusLabels[ticket.status]?.label || ticket.status}
                              />
                              <span className="text-xs text-gray-400">
                                {new Date(ticket.createdAt).toLocaleDateString('he-IL')}
                              </span>
                            </div>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'changelog',
            label: (
              <span className="flex items-center gap-2">
                <MegaphoneIcon className="h-4 w-4" />
                מה חדש
              </span>
            ),
            children: (
              <div>
                {cLoading ? (
                  <Spin size="large" />
                ) : changelog.length === 0 ? (
                  <Empty description="אין עדכונים" />
                ) : (
                  <Timeline
                    items={changelog.map((entry: any) => ({
                      children: (
                        <Card size="small" className="mb-4">
                          <div className="flex items-center gap-3 mb-2">
                            <Tag color="blue">v{entry.version}</Tag>
                            <h3 className="font-semibold">{entry.titleHe || entry.title}</h3>
                            <span className="text-xs text-gray-400">
                              {entry.publishedAt && new Date(entry.publishedAt).toLocaleDateString('he-IL')}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {entry.changes?.map((change: any, idx: number) => {
                              const info = changeTypeLabels[change.type] || { label: change.type, color: 'default' }
                              return (
                                <div key={idx} className="flex items-center gap-2">
                                  <Tag color={info.color} className="text-xs">{info.label}</Tag>
                                  <span className="text-sm">{change.descriptionHe || change.description}</span>
                                </div>
                              )
                            })}
                          </div>
                        </Card>
                      ),
                    }))}
                  />
                )}
              </div>
            ),
          },
        ]}
      />

      {/* Create Ticket Modal */}
      <Modal
        title="פנייה חדשה"
        open={createTicketModal}
        onCancel={() => setCreateTicketModal(false)}
        footer={null}
      >
        <Form layout="vertical" onFinish={handleCreateTicket}>
          <Form.Item name="subject" label="נושא" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label="קטגוריה">
            <Select defaultValue="question">
              <Select.Option value="bug">באג</Select.Option>
              <Select.Option value="feature_request">בקשת תכונה</Select.Option>
              <Select.Option value="question">שאלה</Select.Option>
              <Select.Option value="billing">חיוב</Select.Option>
              <Select.Option value="technical">טכני</Select.Option>
              <Select.Option value="other">אחר</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="priority" label="עדיפות">
            <Select defaultValue="NORMAL">
              <Select.Option value="LOW">נמוכה</Select.Option>
              <Select.Option value="NORMAL">רגילה</Select.Option>
              <Select.Option value="HIGH">גבוהה</Select.Option>
              <Select.Option value="URGENT">דחופה</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="description" label="תיאור" rules={[{ required: true }]}>
            <Input.TextArea rows={5} />
          </Form.Item>
          <Button type="primary" htmlType="submit">שלח פנייה</Button>
        </Form>
      </Modal>

      {/* Ticket Detail Modal */}
      <Modal
        title={ticketDetail ? `${ticketDetail.ticketNumber} - ${ticketDetail.subject}` : 'פנייה'}
        open={!!selectedTicketId}
        onCancel={() => setSelectedTicketId(null)}
        footer={null}
        width={700}
      >
        {ticketDetail && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Badge
                status={(ticketStatusLabels[ticketDetail.status]?.color || 'default') as any}
                text={ticketStatusLabels[ticketDetail.status]?.label || ticketDetail.status}
              />
              <Tag>{ticketDetail.category}</Tag>
            </div>
            <Divider />
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {ticketDetail.messages?.map((msg: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg ${
                    msg.senderType === 'support' ? 'bg-blue-50 mr-8' : 'bg-gray-50 ml-8'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-sm">{msg.senderName}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(msg.createdAt).toLocaleString('he-IL')}
                    </span>
                  </div>
                  <p className="text-sm">{msg.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
