'use client'

import React, { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { Card, Form, Input, Button, Avatar, Divider, message, Tabs, Tag, Spin } from 'antd'
import { UserCircleIcon, KeyIcon, BellIcon, ClockIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { gql } from '@apollo/client'

const GET_ME = gql`
  query GetMe {
    me {
      id
      firstName
      lastName
      displayName
      email
      phone
      mobile
      systemRole
      departments {
        departmentId
        departmentName
        roles
      }
      isActive
      lastLogin
      createdAt
    }
  }
`

const UPDATE_MY_PROFILE = gql`
  mutation UpdateMyProfile($input: UpdateProfileInput!) {
    updateMyProfile(input: $input) {
      id
      firstName
      lastName
      phone
      mobile
    }
  }
`

const CHANGE_PASSWORD = gql`
  mutation ChangePassword($oldPassword: String!, $newPassword: String!) {
    changePassword(oldPassword: $oldPassword, newPassword: $newPassword)
  }
`

export default function ProfilePage() {
  const { user } = useAuth()
  const { data, loading } = useQuery(GET_ME)
  const [updateProfile] = useMutation(UPDATE_MY_PROFILE)
  const [changePasswordMut] = useMutation(CHANGE_PASSWORD)
  const [activeTab, setActiveTab] = useState('info')

  const profile = data?.me

  const handleSaveProfile = async (values: any) => {
    try {
      await updateProfile({ variables: { input: values } })
      message.success('הפרופיל עודכן בהצלחה')
    } catch (err: any) {
      message.error(err.message)
    }
  }

  const handleChangePassword = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('הסיסמאות אינן תואמות')
      return
    }
    try {
      await changePasswordMut({
        variables: {
          oldPassword: values.oldPassword,
          newPassword: values.newPassword,
        }
      })
      message.success('הסיסמה שונתה בהצלחה')
    } catch (err: any) {
      message.error(err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spin size="large" />
      </div>
    )
  }

  const roleLabels: Record<string, string> = {
    SYSTEM_ADMIN: 'מנהל מערכת',
    IT_ADMIN: 'מנהל IT',
    IT_USER: 'משתמש IT',
    DEPARTMENT_ADMIN: 'מנהל מחלקה',
    DEPARTMENT_USER: 'משתמש מחלקה',
  }

  const getInitials = () => {
    if (profile?.firstName && profile?.lastName) {
      return `${profile.firstName[0]}${profile.lastName[0]}`
    }
    return user?.email?.[0]?.toUpperCase() || '?'
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Profile Header */}
      <Card className="mb-6">
        <div className="flex items-center gap-6">
          <Avatar
            size={80}
            className="bg-blue-500 text-2xl font-bold flex items-center justify-center"
          >
            {getInitials()}
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {profile?.displayName || user?.displayName}
            </h1>
            <p className="text-gray-500">{profile?.email || user?.email}</p>
            <div className="flex gap-2 mt-2">
              <Tag color="blue">
                {roleLabels[profile?.systemRole || ''] || profile?.systemRole}
              </Tag>
              {profile?.departments?.map((dept: any) => (
                <Tag key={dept.departmentId} color="green">
                  {dept.departmentName}
                </Tag>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'info',
            label: (
              <span className="flex items-center gap-2">
                <UserCircleIcon className="h-4 w-4" />
                פרטים אישיים
              </span>
            ),
            children: (
              <Card>
                <Form
                  layout="vertical"
                  initialValues={{
                    firstName: profile?.firstName,
                    lastName: profile?.lastName,
                    phone: profile?.phone,
                    mobile: profile?.mobile,
                  }}
                  onFinish={handleSaveProfile}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Form.Item name="firstName" label="שם פרטי" rules={[{ required: true }]}>
                      <Input size="large" />
                    </Form.Item>
                    <Form.Item name="lastName" label="שם משפחה" rules={[{ required: true }]}>
                      <Input size="large" />
                    </Form.Item>
                    <Form.Item name="phone" label="טלפון">
                      <Input size="large" />
                    </Form.Item>
                    <Form.Item name="mobile" label="נייד">
                      <Input size="large" />
                    </Form.Item>
                  </div>

                  <Form.Item label="אימייל">
                    <Input value={profile?.email} disabled size="large" />
                    <p className="text-xs text-gray-400 mt-1">לא ניתן לשנות כתובת אימייל</p>
                  </Form.Item>

                  <Button type="primary" htmlType="submit" size="large">
                    שמור שינויים
                  </Button>
                </Form>
              </Card>
            ),
          },
          {
            key: 'password',
            label: (
              <span className="flex items-center gap-2">
                <KeyIcon className="h-4 w-4" />
                סיסמה
              </span>
            ),
            children: (
              <Card>
                <h3 className="text-lg font-semibold mb-4">שינוי סיסמה</h3>
                <Form layout="vertical" onFinish={handleChangePassword}>
                  <Form.Item
                    name="oldPassword"
                    label="סיסמה נוכחית"
                    rules={[{ required: true, message: 'נא להזין סיסמה נוכחית' }]}
                  >
                    <Input.Password size="large" />
                  </Form.Item>
                  <Form.Item
                    name="newPassword"
                    label="סיסמה חדשה"
                    rules={[
                      { required: true, message: 'נא להזין סיסמה חדשה' },
                      { min: 8, message: 'הסיסמה חייבת להכיל לפחות 8 תווים' },
                    ]}
                  >
                    <Input.Password size="large" />
                  </Form.Item>
                  <Form.Item
                    name="confirmPassword"
                    label="אימות סיסמה חדשה"
                    rules={[{ required: true, message: 'נא לאמת את הסיסמה' }]}
                  >
                    <Input.Password size="large" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" size="large">
                    שנה סיסמה
                  </Button>
                </Form>
              </Card>
            ),
          },
          {
            key: 'activity',
            label: (
              <span className="flex items-center gap-2">
                <ClockIcon className="h-4 w-4" />
                פעילות
              </span>
            ),
            children: (
              <Card>
                <h3 className="text-lg font-semibold mb-4">פעילות אחרונה</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">כניסה אחרונה</p>
                      <p className="text-sm text-gray-500">
                        {profile?.lastLogin
                          ? new Date(profile.lastLogin).toLocaleString('he-IL')
                          : 'לא ידוע'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">תאריך הצטרפות</p>
                      <p className="text-sm text-gray-500">
                        {profile?.createdAt
                          ? new Date(profile.createdAt).toLocaleString('he-IL')
                          : 'לא ידוע'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">סטטוס חשבון</p>
                    </div>
                    <Tag color={profile?.isActive ? 'green' : 'red'}>
                      {profile?.isActive ? 'פעיל' : 'לא פעיל'}
                    </Tag>
                  </div>
                </div>
              </Card>
            ),
          },
        ]}
      />
    </div>
  )
}
