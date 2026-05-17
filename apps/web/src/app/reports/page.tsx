'use client'

import React, { useState } from 'react'
import { useQuery } from '@apollo/client'
import { Card, Select, DatePicker, Button, Table, Statistic, Row, Col, Tabs, Spin, Tag } from 'antd'
import {
  ChartBarIcon,
  ArrowDownTrayIcon,
  CalendarIcon,
  UsersIcon,
  VideoCameraIcon,
  CubeIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { gql } from '@apollo/client'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import { Permission } from '@/rbac'

const { RangePicker } = DatePicker

const GET_DASHBOARD_STATS = gql`
  query GetDashboardStats {
    dashboardStats {
      totalUsers
      totalBroadcasts
      totalShifts
      activeEquipment
      upcomingBroadcasts
      todayShifts
    }
  }
`

const reportTypes = [
  {
    key: 'broadcast_summary',
    label: 'סיכום שידורים',
    icon: <VideoCameraIcon className="h-5 w-5" />,
    description: 'סיכום כל אירועי השידור לפי תקופה',
    columns: [
      { title: 'תאריך', dataIndex: 'date', key: 'date' },
      { title: 'סה"כ שידורים', dataIndex: 'total', key: 'total' },
      { title: 'חי', dataIndex: 'live', key: 'live' },
      { title: 'מוקלט', dataIndex: 'recorded', key: 'recorded' },
      { title: 'בוטלו', dataIndex: 'cancelled', key: 'cancelled' },
      { title: 'שעות שידור', dataIndex: 'totalHours', key: 'totalHours' },
    ],
  },
  {
    key: 'shift_utilization',
    label: 'ניצול משמרות',
    icon: <ClockIcon className="h-5 w-5" />,
    description: 'ניתוח ניצול כוח אדם ומשמרות',
    columns: [
      { title: 'מחלקה', dataIndex: 'department', key: 'department' },
      { title: 'משמרות מתוכננות', dataIndex: 'planned', key: 'planned' },
      { title: 'משמרות שבוצעו', dataIndex: 'completed', key: 'completed' },
      { title: 'אחוז ניצול', dataIndex: 'utilization', key: 'utilization', render: (v: number) => `${v}%` },
      { title: 'שעות נוספות', dataIndex: 'overtime', key: 'overtime' },
    ],
  },
  {
    key: 'equipment_usage',
    label: 'שימוש בציוד',
    icon: <CubeIcon className="h-5 w-5" />,
    description: 'דוח שימוש וזמינות ציוד',
    columns: [
      { title: 'ציוד', dataIndex: 'name', key: 'name' },
      { title: 'קטגוריה', dataIndex: 'category', key: 'category' },
      { title: 'שיבוצים', dataIndex: 'assignments', key: 'assignments' },
      { title: 'זמינות', dataIndex: 'availability', key: 'availability', render: (v: number) => `${v}%` },
      { title: 'מצב', dataIndex: 'condition', key: 'condition', render: (v: string) => <Tag>{v}</Tag> },
    ],
  },
  {
    key: 'user_activity',
    label: 'פעילות משתמשים',
    icon: <UsersIcon className="h-5 w-5" />,
    description: 'סיכום פעילות משתמשים במערכת',
    columns: [
      { title: 'משתמש', dataIndex: 'name', key: 'name' },
      { title: 'כניסות', dataIndex: 'logins', key: 'logins' },
      { title: 'פעולות', dataIndex: 'actions', key: 'actions' },
      { title: 'כניסה אחרונה', dataIndex: 'lastLogin', key: 'lastLogin' },
      { title: 'תפקיד', dataIndex: 'role', key: 'role', render: (v: string) => <Tag>{v}</Tag> },
    ],
  },
  {
    key: 'rights_overview',
    label: 'סקירת זכויות',
    icon: <CalendarIcon className="h-5 w-5" />,
    description: 'מצב זכויות שידור ותפוגות',
    columns: [
      { title: 'כותרת', dataIndex: 'title', key: 'title' },
      { title: 'בעל זכויות', dataIndex: 'rightsHolder', key: 'rightsHolder' },
      { title: 'סטטוס', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'active' ? 'green' : v === 'expiring_soon' ? 'orange' : 'red'}>{v}</Tag> },
      { title: 'תפוגה', dataIndex: 'endDate', key: 'endDate' },
      { title: 'עלות', dataIndex: 'cost', key: 'cost', render: (v: number) => `$${v?.toLocaleString() || 0}` },
    ],
  },
  {
    key: 'cost_analysis',
    label: 'ניתוח עלויות',
    icon: <ChartBarIcon className="h-5 w-5" />,
    description: 'ניתוח עלויות לפי קטגוריות',
    columns: [
      { title: 'קטגוריה', dataIndex: 'category', key: 'category' },
      { title: 'עלות חודשית', dataIndex: 'monthlyCost', key: 'monthlyCost', render: (v: number) => `$${v?.toLocaleString() || 0}` },
      { title: 'עלות שנתית', dataIndex: 'yearlyCost', key: 'yearlyCost', render: (v: number) => `$${v?.toLocaleString() || 0}` },
      { title: 'שינוי מחודש קודם', dataIndex: 'change', key: 'change', render: (v: number) => (
        <span className={v >= 0 ? 'text-red-500' : 'text-green-500'}>
          {v >= 0 ? '+' : ''}{v}%
        </span>
      )},
    ],
  },
]

export default function ReportsPage() {
  const { user } = useAuth()
  const [selectedReport, setSelectedReport] = useState('broadcast_summary')
  const [dateRange, setDateRange] = useState<any>(null)
  const { data: statsData, loading: statsLoading } = useQuery(GET_DASHBOARD_STATS)

  const currentReport = reportTypes.find(r => r.key === selectedReport)
  const stats = statsData?.dashboardStats

  const handleExport = () => {
    // TODO: Implement CSV/PDF export
    console.log('Exporting report:', selectedReport)
  }

  return (
    <ProtectedRoute requires={Permission.AUDIT_VIEW}>
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ChartBarIcon className="h-7 w-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">דוחות וניתוחים</h1>
          </div>
          <p className="text-gray-500">דוחות מתקדמים, KPIs וניתוח ביצועים</p>
        </div>
        <Button
          icon={<ArrowDownTrayIcon className="h-4 w-4" />}
          onClick={handleExport}
        >
          ייצוא דוח
        </Button>
      </div>

      {/* KPI Cards */}
      {stats && (
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={12} sm={8} lg={4}>
            <Card>
              <Statistic title="משתמשים" value={stats.totalUsers || 0} prefix={<UsersIcon className="h-4 w-4" />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <Card>
              <Statistic title="שידורים" value={stats.totalBroadcasts || 0} prefix={<VideoCameraIcon className="h-4 w-4" />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <Card>
              <Statistic title="משמרות" value={stats.totalShifts || 0} prefix={<ClockIcon className="h-4 w-4" />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <Card>
              <Statistic title="ציוד פעיל" value={stats.activeEquipment || 0} prefix={<CubeIcon className="h-4 w-4" />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <Card>
              <Statistic title="שידורים קרובים" value={stats.upcomingBroadcasts || 0} valueStyle={{ color: '#3f8600' }} />
            </Card>
          </Col>
          <Col xs={12} sm={8} lg={4}>
            <Card>
              <Statistic title="משמרות היום" value={stats.todayShifts || 0} valueStyle={{ color: '#1677ff' }} />
            </Card>
          </Col>
        </Row>
      )}

      {/* Report Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {reportTypes.map(report => (
          <Card
            key={report.key}
            hoverable
            className={`cursor-pointer transition-all ${
              selectedReport === report.key ? 'border-blue-500 shadow-md' : ''
            }`}
            onClick={() => setSelectedReport(report.key)}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                selectedReport === report.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {report.icon}
              </div>
              <div>
                <p className="font-semibold">{report.label}</p>
                <p className="text-xs text-gray-500">{report.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Report Filters */}
      <Card className="mb-4">
        <div className="flex items-center gap-4">
          <span className="font-medium">טווח תאריכים:</span>
          <RangePicker
            onChange={(dates) => setDateRange(dates)}
            style={{ width: 300 }}
          />
          <Select
            placeholder="מחלקה"
            allowClear
            style={{ width: 180 }}
          >
            <Select.Option value="all">כל המחלקות</Select.Option>
          </Select>
          <Button type="primary">הפק דוח</Button>
        </div>
      </Card>

      {/* Report Table */}
      <Card title={currentReport?.label}>
        <Table
          columns={currentReport?.columns || []}
          dataSource={[]} // Data would come from API
          locale={{ emptyText: 'בחר טווח תאריכים והפק דוח' }}
          pagination={{ pageSize: 20 }}
        />
      </Card>
    </div>
    </ProtectedRoute>
  )
}
