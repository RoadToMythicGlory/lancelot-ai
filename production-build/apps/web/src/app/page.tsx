'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { 
  Layout, 
  Card, 
  Row, 
  Col, 
  Statistic, 
  Typography, 
  Button, 
  Space,
  Badge,
  Spin,
  message,
  Avatar,
  Divider,
  Modal
} from 'antd';
import { 
  UserOutlined, 
  TeamOutlined,
  VideoCameraOutlined,
  ScheduleOutlined,
  ToolOutlined,
  BellOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  RadarChartOutlined,
  MessageOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { Content } = Layout;

// GraphQL query for dashboard stats
const GET_DASHBOARD_STATS = gql`
  query GetDashboardStats {
    dashboardStats {
      totalUsers
      activeUsers
      totalDepartments
      todaysBroadcasts
      upcomingBroadcasts
      activeShifts
      openTickets
      criticalAlerts
    }
  }
`;

// GraphQL query for bulletin posts
const GET_BULLETIN_POSTS = gql`
  query GetBulletinPosts($limit: Int, $onlyEmergency: Boolean) {
    bulletinPosts(limit: $limit, onlyEmergency: $onlyEmergency) {
      id
      title
      content
      isEmergency
      isPinned
      departmentName
      author {
        displayName
      }
      createdAt
    }
  }
`;

// GraphQL query for today's broadcasts
const GET_TODAYS_BROADCASTS = gql`
  query GetTodaysBroadcasts {
    todaysBroadcasts {
      id
      eventNumber
      title
      hebrewTitle
      startTime
      endTime
      channel
      eventType
      live
      location
      venue
    }
  }
`;

// GraphQL query for weekly shifts
const GET_WEEKLY_SHIFTS = gql`
  query GetWeeklyShifts($userId: String) {
    weeklyShifts(userId: $userId) {
      id
      date
      startTime
      endTime
      shiftType
      department
      status
      user {
        id
        displayName
      }
    }
  }
`;

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [broadcastsModalVisible, setBroadcastsModalVisible] = useState(false);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Query for dashboard stats
  const { data: statsData, loading: statsLoading, refetch: refetchStats } = useQuery(GET_DASHBOARD_STATS, {
    skip: !user,
    errorPolicy: 'all',
    pollInterval: 300000 // Refresh every 5 minutes
  });

  // Query for bulletin posts
  const { data: bulletinData, loading: bulletinLoading } = useQuery(GET_BULLETIN_POSTS, {
    variables: { limit: 5, onlyEmergency: false },
    skip: !user,
    errorPolicy: 'all',
    pollInterval: 60000 // Refresh every minute
  });

  // Query for today's broadcasts
  const { data: broadcastsData, loading: broadcastsLoading } = useQuery(GET_TODAYS_BROADCASTS, {
    skip: !user,
    errorPolicy: 'all',
    pollInterval: 300000 // Refresh every 5 minutes
  });

  // Query for weekly shifts
  const { data: shiftsData, loading: shiftsLoading } = useQuery(GET_WEEKLY_SHIFTS, {
    variables: { userId: user?.id },
    skip: !user,
    errorPolicy: 'all',
    pollInterval: 300000 // Refresh every 5 minutes
  });

  // Extract data with defaults (before any conditional returns)
  const stats = statsData?.dashboardStats || {
    totalUsers: 0,
    activeUsers: 0,
    totalDepartments: 0,
    todaysBroadcasts: 0,
    upcomingBroadcasts: 0,
    activeShifts: 0,
    openTickets: 0,
    criticalAlerts: 0
  };

  const bulletinPosts = bulletinData?.bulletinPosts || [];
  const todaysBroadcasts = broadcastsData?.todaysBroadcasts || [];
  const weeklyShifts = shiftsData?.weeklyShifts || [];

  // Sort broadcasts by relevance (on-air first, then coming soon, then by start time)
  const sortedBroadcasts = useMemo(() => {
    const now = new Date();
    return [...todaysBroadcasts].sort((a, b) => {
      const aStart = new Date(a.startTime);
      const aEnd = new Date(a.endTime);
      const bStart = new Date(b.startTime);
      const bEnd = new Date(b.endTime);
      
      // Check if broadcasts are on air
      const aOnAir = now >= aStart && now < aEnd;
      const bOnAir = now >= bStart && now < bEnd;
      
      if (aOnAir && !bOnAir) return -1;
      if (!aOnAir && bOnAir) return 1;
      
      // If both are on air or both are not, sort by start time
      // For future events, closest first. For past events, most recent first
      const aFuture = aStart > now;
      const bFuture = bStart > now;
      
      if (aFuture && bFuture) {
        return aStart.getTime() - bStart.getTime(); // Ascending for future
      } else if (!aFuture && !bFuture) {
        return bStart.getTime() - aStart.getTime(); // Descending for past
      } else {
        return aFuture ? -1 : 1; // Future events before past
      }
    });
  }, [todaysBroadcasts]);

  // Get only the 5 most relevant broadcasts for the widget
  const topBroadcasts = sortedBroadcasts.slice(0, 5);

  // Protect the route - redirect to login if not authenticated
  useEffect(() => {
    // Only redirect after auth loading is complete
    if (!authLoading && !user) {
      // Store the intended destination
      sessionStorage.setItem('redirectAfterLogin', '/');
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Show loading while auth is being checked
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Spin size="large" />
          <p className="mt-4 text-gray-600">בודק הרשאות...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show nothing (will redirect)
  if (!user) {
    return null;
  }

  const getDepartmentName = (dept?: string) => {
    const departments: Record<string, string> = {
      'IT': 'מחלקת IT',
      'News': 'חדרי חדשות',
      'Sport': 'ספורט',
      'Cameramen': 'צלמים',
      'Editors': 'עורכים',
      'Graphics': 'גרפיקה',
      'Sound': 'סאונד',
      'Production': 'הפקה',
      'Engineering': 'הנדסה',
      'Archives': 'ארכיון',
      'Studio': 'אולפנים'
    };
    return departments[dept || ''] || dept || 'לא משויך';
  };

  const getRoleName = (role?: string) => {
    const roles: Record<string, string> = {
      'IT_ADMIN': '👑 מנהל IT',
      'SYSTEM_ADMIN': '⭐ מנהל מערכת',
      'admin': 'מנהל',
      'department_head': 'ראש מחלקה',
      'employee': 'עובד'
    };
    return roles[role || ''] || 'עובד';
  };

  const handleRefresh = async () => {
    try {
      await refetchStats();
      message.success('הנתונים עודכנו בהצלחה');
    } catch (error) {
      message.error('שגיאה בעדכון הנתונים');
    }
  };

  // Function to render a broadcast item
  const renderBroadcastItem = (broadcast: any) => {
    // Calculate broadcast status
    const now = new Date();
    const startTime = new Date(broadcast.startTime);
    const endTime = new Date(broadcast.endTime);
    const timeDiff = startTime.getTime() - now.getTime();
    const minutesUntilStart = Math.floor(timeDiff / (1000 * 60));
    
    let status = { text: 'היום', color: 'default' };
    if (now >= endTime) {
      status = { text: 'נגמר', color: 'default' };
    } else if (now >= startTime && now < endTime) {
      status = { text: 'באוויר', color: 'error' };
    } else if (minutesUntilStart <= 30) {
      status = { text: 'בקרוב', color: 'warning' };
    }
    
    return (
      <div key={broadcast.id} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
        <Row align="middle" gutter={16}>
          <Col xs={24} sm={2}>
            <Badge 
              status={status.color as any} 
              text={status.text}
              style={{ 
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            />
          </Col>
          <Col xs={24} sm={7}>
            <Space>
              {broadcast.live && <Badge status="processing" text="שידור חי" />}
              <Text strong>{broadcast.title || broadcast.hebrewTitle}</Text>
            </Space>
          </Col>
          <Col xs={24} sm={3}>
            <Text type="secondary">ערוץ {broadcast.channel}</Text>
          </Col>
          <Col xs={24} sm={6}>
            <ClockCircleOutlined className="mr-1" />
            <Text>
              {startTime.toLocaleTimeString('he-IL', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
              {broadcast.endTime && ` - ${endTime.toLocaleTimeString('he-IL', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}`}
            </Text>
          </Col>
          <Col xs={24} sm={6}>
            {broadcast.location && (
              <Text type="secondary">
                📍 {broadcast.location}
                {broadcast.venue && ` - ${broadcast.venue}`}
              </Text>
            )}
          </Col>
        </Row>
      </div>
    );
  };

    return (
    <Content className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header Section */}
        <Card className="mb-6 bg-gradient-to-r from-blue-600 to-purple-600 border-0">
          <Row align="middle" justify="space-between">
            <Col>
              <Space direction="vertical" size="small">
                <Title level={2} className="text-white mb-0">
                  ברוך הבא למערכת לנסלוט! 🚀
                </Title>
                <Space>
                  <Avatar icon={<UserOutlined />} className="bg-white text-blue-600" />
                  <Text className="text-white text-lg">
                    {user.displayName || user.email}
                  </Text>
                  <Divider type="vertical" className="bg-white opacity-50" />
                  <Text className="text-blue-100">
                    {getDepartmentName(user.department)} • {getRoleName(user.systemRole)}
                  </Text>
                </Space>
                <Text className="text-blue-100">
                  <ClockCircleOutlined className="mr-2" />
                  {currentTime.toLocaleDateString('he-IL', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </Text>
              </Space>
            </Col>
            <Col>
              <Button
                icon={<SyncOutlined />} 
                onClick={handleRefresh}
                loading={statsLoading}
                size="large"
                type="primary"
                ghost
              >
                רענן נתונים
              </Button>
            </Col>
          </Row>
          </Card>

        {/* Stats Grid */}
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card hoverable className="text-center">
              <Statistic
                title="משתמשים פעילים"
                value={stats.activeUsers}
                suffix={`/ ${stats.totalUsers}`}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card hoverable className="text-center">
              <Statistic
                title="מחלקות"
                value={stats.totalDepartments}
                prefix={<TeamOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card hoverable className="text-center">
              <Statistic
                title="שידורים היום"
                value={stats.todaysBroadcasts}
                prefix={<VideoCameraOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
              </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card hoverable className="text-center">
              <Statistic
                title="משמרות פעילות"
                value={stats.activeShifts}
                prefix={<ScheduleOutlined />}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
              </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card hoverable className="text-center">
              <Statistic
                title="כרטיסי תמיכה"
                value={stats.openTickets}
                prefix={<ToolOutlined />}
                valueStyle={{ color: '#eb2f96' }}
              />
            </Card>
              </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card hoverable className="text-center">
              <Badge count={stats.criticalAlerts} offset={[-5, 5]}>
                <Statistic
                  title="התראות דחופות"
                  value={stats.criticalAlerts}
                  prefix={<BellOutlined />}
                  valueStyle={{ color: '#f5222d' }}
                />
              </Badge>
            </Card>
              </Col>
            </Row>

        {/* Quick Actions */}
        <Card title="פעולות מהירות" className="mb-6">
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={8} md={6} lg={4}>
                    <Button 
                      type="primary" 
                    icon={<RadarChartOutlined />} 
                    block
                size="large"
                onClick={() => router.push('/broadcast-planning')}
                  >
                    תכנון שידורים
                  </Button>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
                  <Button 
                    icon={<CalendarOutlined />} 
                    block
                size="large"
                onClick={() => router.push('/shifts')}
                  >
                    ניהול משמרות
                  </Button>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <Button 
                icon={<ToolOutlined />} 
                block 
                size="large"
                onClick={() => router.push('/warehouse')}
              >
                מחסן ציוד
              </Button>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <Button 
                icon={<TeamOutlined />} 
                block 
                size="large"
                onClick={() => router.push('/users')}
              >
                ניהול משתמשים
              </Button>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
                  <Button 
                icon={<MessageOutlined />} 
                    block
                size="large"
                onClick={() => message.info('צ\'אט יפתח בקרוב')}
                  >
                צ'אט צוות
                  </Button>
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
                  <Button 
                icon={<BellOutlined />} 
                    block
                size="large"
                type="dashed"
                onClick={() => message.info('לוח מודעות יפתח בקרוב')}
                  >
                לוח מודעות
                  </Button>
            </Col>
          </Row>
              </Card>

                {/* Today's Broadcasts */}
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24}>
            <Card 
              title={
                <Space>
                  <VideoCameraOutlined />
                  <span>שידורים היום</span>
                  <Badge count={todaysBroadcasts.length} style={{ backgroundColor: '#52c41a' }} />
                </Space>
              }
              loading={broadcastsLoading}
              extra={
                <Button 
                  type="link" 
                  onClick={() => setBroadcastsModalVisible(true)}
                  disabled={todaysBroadcasts.length === 0}
                >
                  הצג הכל ({todaysBroadcasts.length})
                </Button>
              }
            >
              {topBroadcasts.length > 0 ? (
                <div className="overflow-x-auto">
                  <Space direction="vertical" className="w-full">
                    {topBroadcasts.map(renderBroadcastItem)}
                  </Space>
                </div>
              ) : (
                <div className="text-center py-8">
                  <VideoCameraOutlined className="text-4xl text-gray-400 mb-2" />
                  <br />
                  <Text type="secondary">אין שידורים מתוכננים להיום</Text>
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* Weekly Shifts and Bulletin Board */}
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card 
              title={
                <Space>
                  <CalendarOutlined />
                  <span>המשמרות שלי השבוע</span>
                </Space>
              }
              loading={shiftsLoading}
              extra={
                <Button type="link" onClick={() => router.push('/shifts')}>
                  הצג הכל
                </Button>
              }
              className="h-full"
            >
              {weeklyShifts.length > 0 ? (
                <Space direction="vertical" className="w-full">
                  {weeklyShifts.map((shift: any) => (
                    <div key={shift.id} className="border-b pb-3 last:border-b-0">
                      <Row>
                        <Col span={12}>
                          <Text strong>{shift.shiftType}</Text>
                          <br />
                          <Text type="secondary" className="text-sm">
                            {shift.department}
                          </Text>
                        </Col>
                        <Col span={12} className="text-left">
                          <Text>
                            {new Date(shift.date).toLocaleDateString('he-IL', { 
                              weekday: 'short',
                              day: 'numeric',
                              month: 'numeric'
                            })}
                          </Text>
                          <br />
                          <Text type="secondary" className="text-sm">
                            {shift.startTime} - {shift.endTime}
                          </Text>
                        </Col>
                      </Row>
                    </div>
                  ))}
                </Space>
              ) : (
                <div className="text-center py-8">
                  <CalendarOutlined className="text-4xl text-gray-400 mb-2" />
                  <br />
                  <Text type="secondary">אין משמרות מתוכננות השבוע</Text>
                </div>
              )}
            </Card>
          </Col>
          
          <Col xs={24} lg={12}>
            <Card 
              title="לוח מודעות" 
              loading={bulletinLoading}
              extra={
                <Badge count={bulletinPosts.filter((p: any) => p.isEmergency).length} offset={[-5, 5]}>
                  <Button type="link" icon={<BellOutlined />}>
                    הצג הכל
                  </Button>
                </Badge>
              }
              className="h-full"
            >
              {bulletinPosts.length > 0 ? (
                <Space direction="vertical" className="w-full">
                  {bulletinPosts.slice(0, 3).map((post: any) => (
                    <div 
                      key={post.id} 
                      className={`p-3 rounded-lg ${
                        post.isEmergency 
                          ? 'bg-red-50 border-l-4 border-red-500' 
                          : post.isPinned
                          ? 'bg-blue-50 border-l-4 border-blue-500'
                          : 'bg-gray-50'
                      }`}
                    >
                      <Space className="mb-1">
                        <Text strong className={post.isEmergency ? 'text-red-600' : ''}>
                          {post.title}
                        </Text>
                        {post.isEmergency && <Badge status="error" text="דחוף" />}
                      </Space>
                      <div>
                        <Text className="text-gray-600 text-sm">{post.content}</Text>
                      </div>
                      <div className="mt-2">
                        <Text type="secondary" className="text-xs">
                          {post.author.displayName} • {
                            new Date(post.createdAt).toLocaleDateString('he-IL', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          }
                        </Text>
                      </div>
                    </div>
                  ))}
                </Space>
              ) : (
                <div className="text-center py-8">
                  <BellOutlined className="text-4xl text-gray-400 mb-2" />
                  <br />
                  <Text type="secondary">אין הודעות חדשות</Text>
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* All Broadcasts Modal */}
        <Modal
          title={
            <Space>
              <VideoCameraOutlined />
              <span>כל שידורי היום ({todaysBroadcasts.length})</span>
            </Space>
          }
          open={broadcastsModalVisible}
          onCancel={() => setBroadcastsModalVisible(false)}
          footer={[
            <Button key="close" onClick={() => setBroadcastsModalVisible(false)}>
              סגור
            </Button>,
            <Button 
              key="planning" 
              type="primary" 
              onClick={() => {
                setBroadcastsModalVisible(false);
                router.push('/broadcast-planning');
              }}
            >
              לתכנון שידורים
            </Button>
          ]}
          width={900}
          styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
        >
          <Space direction="vertical" className="w-full">
            {sortedBroadcasts.map(renderBroadcastItem)}
          </Space>
        </Modal>
      </div>
    </Content>
  );
} 