'use client'

import React, { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { Card, Button, Tag, Progress, Table, Badge, Modal, Radio, message, Spin, Alert, Divider } from 'antd'
import { CreditCardIcon, DocumentTextIcon, ChartBarIcon, ArrowUpIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import { Permission } from '@/rbac'
import { GET_MY_SUBSCRIPTION, GET_INVOICES } from '@/graphql/saasQueries'
import { CHANGE_PLAN, CANCEL_SUBSCRIPTION } from '@/graphql/saasMutations'

const planDetails: Record<string, { name: string; nameHe: string; price: { monthly: number; yearly: number }; color: string; features: string[] }> = {
  free: {
    name: 'Free',
    nameHe: 'חינמי',
    price: { monthly: 0, yearly: 0 },
    color: 'default',
    features: ['עד 5 משתמשים', 'עד 50 אירועי שידור', '1GB אחסון', '3 מחלקות', 'תכנון שידורים בסיסי'],
  },
  pro: {
    name: 'Pro',
    nameHe: 'מקצועי',
    price: { monthly: 299, yearly: 2990 },
    color: 'blue',
    features: ['עד 50 משתמשים', 'עד 5,000 אירועי שידור', '100GB אחסון', '15 מחלקות', 'כל התכונות', 'סוכן AI', 'צ\'אט מוצפן', 'תמיכת עדיפות'],
  },
  enterprise: {
    name: 'Enterprise',
    nameHe: 'ארגוני',
    price: { monthly: 999, yearly: 9990 },
    color: 'gold',
    features: ['משתמשים ללא הגבלה', 'אירועים ללא הגבלה', '1TB אחסון', 'מחלקות ללא הגבלה', 'כל התכונות', 'SSO/SAML', 'SLA מותאם', 'מנהל חשבון ייעודי', 'ניטור חי'],
  },
}

export default function BillingPage() {
  const { user } = useAuth()
  const { data: subData, loading: subLoading } = useQuery(GET_MY_SUBSCRIPTION)
  const { data: invoicesData, loading: invLoading } = useQuery(GET_INVOICES, { variables: { limit: 20 } })

  const [changePlan] = useMutation(CHANGE_PLAN)
  const [cancelSub] = useMutation(CANCEL_SUBSCRIPTION)

  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('pro')
  const [billingCycle, setBillingCycle] = useState('monthly')

  const sub = subData?.mySubscription
  const invoices = invoicesData?.invoices || []
  const currentPlan = sub?.plan?.toLowerCase() || 'free'

  const handleChangePlan = async () => {
    try {
      await changePlan({
        variables: {
          input: {
            plan: selectedPlan.toUpperCase(),
            billingCycle: billingCycle.toUpperCase(),
          }
        }
      })
      message.success('התוכנית עודכנה בהצלחה!')
      setUpgradeModalVisible(false)
    } catch (err: any) {
      message.error(err.message)
    }
  }

  const handleCancelSub = async () => {
    Modal.confirm({
      title: 'ביטול מנוי',
      content: 'האם אתה בטוח שברצונך לבטל את המנוי? תוכל להמשיך להשתמש בשירות עד סוף תקופת החיוב הנוכחית.',
      okText: 'כן, בטל',
      cancelText: 'לא',
      okType: 'danger',
      onOk: async () => {
        try {
          await cancelSub()
          message.success('המנוי בוטל')
        } catch (err: any) {
          message.error(err.message)
        }
      },
    })
  }

  if (subLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spin size="large" />
      </div>
    )
  }

  const usagePercent = (current: number, max: number) => {
    if (max === 0) return 0
    return Math.round((current / max) * 100)
  }

  const invoiceColumns = [
    {
      title: 'מספר חשבונית',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
    },
    {
      title: 'סטטוס',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colors: Record<string, string> = {
          paid: 'green', open: 'blue', draft: 'default', void: 'red',
        }
        const labels: Record<string, string> = {
          paid: 'שולם', open: 'פתוח', draft: 'טיוטה', void: 'בוטל',
        }
        return <Tag color={colors[status]}>{labels[status] || status}</Tag>
      },
    },
    {
      title: 'סכום',
      dataIndex: 'total',
      key: 'total',
      render: (total: number, record: any) => `$${(total / 100).toFixed(2)} ${record.currency?.toUpperCase()}`,
    },
    {
      title: 'תאריך',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString('he-IL'),
    },
  ]

  return (
    <ProtectedRoute requires={Permission.BILLING_VIEW}>
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">חיוב ומנוי</h1>
        <p className="text-gray-500">ניהול תוכנית המנוי, תשלומים וחשבוניות</p>
      </div>

      {/* Current Plan */}
      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold">
                תוכנית {planDetails[currentPlan]?.nameHe || currentPlan}
              </h2>
              <Tag color={planDetails[currentPlan]?.color}>
                {planDetails[currentPlan]?.name}
              </Tag>
              {sub?.status === 'trialing' && (
                <Tag color="orange">תקופת ניסיון</Tag>
              )}
              {sub?.status === 'cancelled' && (
                <Tag color="red">בוטל</Tag>
              )}
            </div>
            <p className="text-gray-500">
              {sub?.status === 'trialing' && sub?.trialEnd
                ? `תקופת ניסיון מסתיימת ב-${new Date(sub.trialEnd).toLocaleDateString('he-IL')}`
                : sub?.currentPeriodEnd
                ? `חידוש ב-${new Date(sub.currentPeriodEnd).toLocaleDateString('he-IL')}`
                : ''}
            </p>
          </div>
          <div className="flex gap-2">
            {currentPlan !== 'enterprise' && (
              <Button
                type="primary"
                icon={<ArrowUpIcon className="h-4 w-4" />}
                onClick={() => setUpgradeModalVisible(true)}
              >
                שדרג תוכנית
              </Button>
            )}
            {sub?.status === 'active' && (
              <Button danger onClick={handleCancelSub}>
                בטל מנוי
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Usage Stats */}
      {sub?.limits && sub?.currentUsage && (
        <Card title="שימוש נוכחי" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'משתמשים', current: sub.currentUsage.users, max: sub.limits.maxUsers },
              { label: 'אירועי שידור', current: sub.currentUsage.broadcastEvents, max: sub.limits.maxBroadcastEvents },
              { label: 'אחסון (GB)', current: sub.currentUsage.storageUsedGB, max: sub.limits.maxStorageGB },
              { label: 'מחלקות', current: sub.currentUsage.departments, max: sub.limits.maxDepartments },
              { label: 'קריאות API', current: sub.currentUsage.apiCalls, max: sub.limits.maxApiCalls },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-sm text-gray-500">{item.current} / {item.max}</span>
                </div>
                <Progress
                  percent={usagePercent(item.current, item.max)}
                  status={usagePercent(item.current, item.max) > 90 ? 'exception' : 'active'}
                  showInfo={false}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Invoices */}
      <Card title="חשבוניות">
        <Table
          dataSource={invoices}
          columns={invoiceColumns}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: 'אין חשבוניות' }}
          loading={invLoading}
        />
      </Card>

      {/* Upgrade Modal */}
      <Modal
        title="שדרוג תוכנית"
        open={upgradeModalVisible}
        onCancel={() => setUpgradeModalVisible(false)}
        onOk={handleChangePlan}
        okText="שדרג עכשיו"
        cancelText="ביטול"
        width={800}
      >
        <div className="mb-4">
          <Radio.Group
            value={billingCycle}
            onChange={e => setBillingCycle(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="monthly">חודשי</Radio.Button>
            <Radio.Button value="yearly">שנתי (חיסכון 17%)</Radio.Button>
          </Radio.Group>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(planDetails).map(([key, plan]) => (
            <div
              key={key}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                selectedPlan === key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              } ${currentPlan === key ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => currentPlan !== key && setSelectedPlan(key)}
            >
              <h3 className="text-lg font-bold">{plan.nameHe}</h3>
              <p className="text-2xl font-bold mt-2">
                ${billingCycle === 'yearly'
                  ? Math.round(plan.price.yearly / 12)
                  : plan.price.monthly}
                <span className="text-sm font-normal text-gray-500">/חודש</span>
              </p>
              {currentPlan === key && (
                <Tag color="green" className="mt-2">תוכנית נוכחית</Tag>
              )}
              <ul className="mt-4 space-y-1">
                {plan.features.map((f, i) => (
                  <li key={i} className="text-sm text-gray-600">• {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Modal>
    </div>
    </ProtectedRoute>
  )
}
