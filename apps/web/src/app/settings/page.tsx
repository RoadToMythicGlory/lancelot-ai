'use client'

import React, { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { Tabs, Card, Form, Input, Select, Switch, Button, Tag, Space, Divider, InputNumber, message, Spin, Alert } from 'antd'
import {
  BuildingOfficeIcon,
  UserIcon,
  ShieldCheckIcon,
  PuzzlePieceIcon,
  BellIcon,
  KeyIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import { Permission } from '@/rbac'
import { GET_MY_ORGANIZATION, GET_NOTIFICATION_PREFERENCES } from '@/graphql/saasQueries'
import {
  UPDATE_ORGANIZATION,
  UPDATE_ORGANIZATION_SETTINGS,
  UPDATE_FEATURE_FLAGS,
  UPDATE_SECURITY_SETTINGS,
  UPDATE_NOTIFICATION_PREFERENCES,
} from '@/graphql/saasMutations'

export default function SettingsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('organization')
  const { data: orgData, loading: orgLoading } = useQuery(GET_MY_ORGANIZATION)
  const { data: notifPrefsData } = useQuery(GET_NOTIFICATION_PREFERENCES)

  const [updateOrg] = useMutation(UPDATE_ORGANIZATION)
  const [updateSettings] = useMutation(UPDATE_ORGANIZATION_SETTINGS)
  const [updateFeatures] = useMutation(UPDATE_FEATURE_FLAGS)
  const [updateSecurity] = useMutation(UPDATE_SECURITY_SETTINGS)
  const [updateNotifPrefs] = useMutation(UPDATE_NOTIFICATION_PREFERENCES)

  const { hasPermission } = useAuth()
  const org = orgData?.myOrganization
  const isAdmin = hasPermission(Permission.SETTINGS_MANAGE)
  const canWrite = isAdmin

  const handleSaveOrg = async (values: any) => {
    try {
      await updateOrg({ variables: { input: values } })
      message.success('הגדרות הארגון עודכנו בהצלחה')
    } catch (err: any) {
      message.error(err.message)
    }
  }

  const handleSaveSettings = async (values: any) => {
    try {
      await updateSettings({ variables: { input: values } })
      message.success('ההגדרות עודכנו בהצלחה')
    } catch (err: any) {
      message.error(err.message)
    }
  }

  const handleSaveFeatures = async (values: any) => {
    try {
      await updateFeatures({ variables: { input: values } })
      message.success('תכונות עודכנו בהצלחה')
    } catch (err: any) {
      message.error(err.message)
    }
  }

  const handleSaveSecurity = async (values: any) => {
    try {
      await updateSecurity({ variables: { input: values } })
      message.success('הגדרות אבטחה עודכנו בהצלחה')
    } catch (err: any) {
      message.error(err.message)
    }
  }

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spin size="large" />
      </div>
    )
  }

  const tabItems = [
    {
      key: 'organization',
      label: (
        <span className="flex items-center gap-2">
          <BuildingOfficeIcon className="h-4 w-4" />
          ארגון
        </span>
      ),
      children: (
        <Card title="פרטי ארגון" className="mb-4">
          <Form
            layout="vertical"
            initialValues={{
              name: org?.name,
              hebrewName: org?.hebrewName,
              contactEmail: org?.contactEmail,
              contactPhone: org?.contactPhone,
              address: org?.address,
              country: org?.country,
            }}
            onFinish={handleSaveOrg}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Form.Item name="name" label="שם ארגון (אנגלית)">
                <Input />
              </Form.Item>
              <Form.Item name="hebrewName" label="שם ארגון (עברית)">
                <Input />
              </Form.Item>
              <Form.Item name="contactEmail" label="אימייל ליצירת קשר">
                <Input type="email" />
              </Form.Item>
              <Form.Item name="contactPhone" label="טלפון">
                <Input />
              </Form.Item>
              <Form.Item name="address" label="כתובת">
                <Input />
              </Form.Item>
              <Form.Item name="country" label="מדינה">
                <Input />
              </Form.Item>
            </div>
            <Button type="primary" htmlType="submit" disabled={!canWrite}>שמור שינויים</Button>
          </Form>

          <Divider />

          <h3 className="text-lg font-semibold mb-4">הגדרות כלליות</h3>
          <Form
            layout="vertical"
            initialValues={{
              timezone: org?.settings?.timezone || 'Asia/Jerusalem',
              locale: org?.settings?.locale || 'he',
              dateFormat: org?.settings?.dateFormat || 'DD/MM/YYYY',
              brandColor: org?.settings?.brandColor || '#3B82F6',
            }}
            onFinish={handleSaveSettings}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Form.Item name="timezone" label="אזור זמן">
                <Select>
                  <Select.Option value="Asia/Jerusalem">Asia/Jerusalem (IST)</Select.Option>
                  <Select.Option value="UTC">UTC</Select.Option>
                  <Select.Option value="America/New_York">America/New_York (EST)</Select.Option>
                  <Select.Option value="Europe/London">Europe/London (GMT)</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name="locale" label="שפה">
                <Select>
                  <Select.Option value="he">עברית</Select.Option>
                  <Select.Option value="en">English</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name="dateFormat" label="פורמט תאריך">
                <Select>
                  <Select.Option value="DD/MM/YYYY">DD/MM/YYYY</Select.Option>
                  <Select.Option value="MM/DD/YYYY">MM/DD/YYYY</Select.Option>
                  <Select.Option value="YYYY-MM-DD">YYYY-MM-DD</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name="brandColor" label="צבע מותג">
                <Input type="color" style={{ width: 80, height: 40 }} />
              </Form.Item>
            </div>
            <Button type="primary" htmlType="submit" disabled={!canWrite}>שמור הגדרות</Button>
          </Form>
        </Card>
      ),
    },
    {
      key: 'features',
      label: (
        <span className="flex items-center gap-2">
          <PuzzlePieceIcon className="h-4 w-4" />
          תכונות
        </span>
      ),
      children: (
        <Card title="ניהול תכונות (Feature Flags)">
          <p className="text-gray-500 mb-4">הפעל או כבה מודולים במערכת</p>
          <Form
            layout="vertical"
            initialValues={org?.settings?.features}
            onFinish={handleSaveFeatures}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: 'broadcasting', label: 'תכנון שידורים', desc: 'ניהול אירועי שידור' },
                { name: 'mcr', label: 'MCR', desc: 'חדר בקרה מרכזי' },
                { name: 'shifts', label: 'משמרות', desc: 'ניהול משמרות עובדים' },
                { name: 'warehouse', label: 'מחסן', desc: 'ניהול ציוד ומחסן' },
                { name: 'chat', label: 'צ\'אט', desc: 'מערכת הודעות פנימית' },
                { name: 'aiAgent', label: 'סוכן AI', desc: 'עוזר AI חכם' },
                { name: 'vizrt', label: 'Vizrt/גרפיקה', desc: 'אינטגרציית גרפיקה' },
                { name: 'liveMonitoring', label: 'ניטור חי', desc: 'ניטור סיגנלים בזמן אמת' },
              ].map(feature => (
                <div key={feature.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{feature.label}</p>
                    <p className="text-sm text-gray-500">{feature.desc}</p>
                  </div>
                  <Form.Item name={feature.name} valuePropName="checked" className="mb-0">
                    <Switch />
                  </Form.Item>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Button type="primary" htmlType="submit" disabled={!canWrite}>שמור תכונות</Button>
            </div>
          </Form>
        </Card>
      ),
    },
    {
      key: 'security',
      label: (
        <span className="flex items-center gap-2">
          <ShieldCheckIcon className="h-4 w-4" />
          אבטחה
        </span>
      ),
      children: (
        <Card title="הגדרות אבטחה">
          <Form
            layout="vertical"
            initialValues={org?.settings?.security}
            onFinish={handleSaveSecurity}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">אימות דו-שלבי (MFA)</p>
                  <p className="text-sm text-gray-500">חייב אימות דו-שלבי לכל המשתמשים</p>
                </div>
                <Form.Item name="mfaRequired" valuePropName="checked" className="mb-0">
                  <Switch />
                </Form.Item>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">SSO (Single Sign-On)</p>
                  <p className="text-sm text-gray-500">הפעלת כניסה חד-פעמית</p>
                </div>
                <Form.Item name="ssoEnabled" valuePropName="checked" className="mb-0">
                  <Switch />
                </Form.Item>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Form.Item name="passwordMinLength" label="אורך סיסמה מינימלי">
                  <InputNumber min={6} max={32} />
                </Form.Item>
                <Form.Item name="sessionTimeoutMinutes" label="זמן פקיעת הפעלה (דקות)">
                  <InputNumber min={15} max={1440} />
                </Form.Item>
              </div>
            </div>
            <Button type="primary" htmlType="submit" className="mt-4" disabled={!canWrite}>שמור הגדרות אבטחה</Button>
          </Form>
        </Card>
      ),
    },
    {
      key: 'notifications',
      label: (
        <span className="flex items-center gap-2">
          <BellIcon className="h-4 w-4" />
          התראות
        </span>
      ),
      children: (
        <Card title="העדפות התראות">
          <p className="text-gray-500 mb-4">בחר אילו התראות לקבל ובאיזה ערוצים</p>
          <div className="space-y-3">
            {[
              { key: 'broadcast_created', label: 'שידור חדש נוצר' },
              { key: 'broadcast_updated', label: 'שידור עודכן' },
              { key: 'broadcast_cancelled', label: 'שידור בוטל' },
              { key: 'shift_assigned', label: 'שובצת למשמרת' },
              { key: 'shift_swap_request', label: 'בקשת החלפת משמרת' },
              { key: 'shift_reminder', label: 'תזכורת משמרת' },
              { key: 'approval_required', label: 'נדרש אישור' },
              { key: 'equipment_assigned', label: 'ציוד שובץ' },
              { key: 'system_alert', label: 'התראת מערכת' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">{item.label}</span>
                <Space>
                  <Tag color="blue">אפליקציה</Tag>
                  <Tag color="green">אימייל</Tag>
                  <Tag>Push</Tag>
                </Space>
              </div>
            ))}
          </div>
        </Card>
      ),
    },
  ]

  return (
    <ProtectedRoute requires={Permission.SETTINGS_VIEW}>
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">הגדרות</h1>
        <p className="text-gray-500">ניהול הגדרות הארגון, האבטחה והתכונות</p>
      </div>

      {!org && (
        <Alert
          message="לא נמצא ארגון"
          description="ליצירת ארגון חדש, עבור לדף ההרשמה הארגוני."
          type="info"
          showIcon
          className="mb-4"
        />
      )}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        tabPosition="right"
        className="settings-tabs"
      />
    </div>
    </ProtectedRoute>
  )
}
