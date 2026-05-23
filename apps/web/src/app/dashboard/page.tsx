'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Permission } from '@/rbac';
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
  Modal,
  Tag
} from 'antd';
import { 
  UserOutlined, 
  TeamOutlined,
  VideoCameraOutlined,
  ScheduleOutlined,
  CalendarOutlined,
  BellOutlined,
  ClockCircleOutlined,
  SyncOutlined
} from '@ant-design/icons';

const { Content } = Layout;
const { Title, Text } = Typography;

// GraphQL queries
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

const GET_BULLETIN_POSTS = gql`
  query GetBulletinPosts($limit: Int!) {
    bulletinPosts(limit: $limit) {
      id
      title
      content
      createdAt
      author {
        id
        displayName
      }
      priority
      targetDepartments
    }
  }
`;

const GET_TODAYS_BROADCASTS = gql`
  query GetTodaysBroadcasts {
    todaysBroadcasts {
      id
      title
      hebrewTitle
      channel
      startTime
      endTime
      live
      location
      venue
    }
  }
`;

// For "my assignments" we reuse broadcastEvents + filter by broadcastArray crewAssignments in metadata
const GET_BROADCAST_EVENTS_FOR_ASSIGNMENTS = gql`
  query GetBroadcastEventsForAssignments($startDate: DateTime, $endDate: DateTime) {
    broadcastEvents(startDate: $startDate, endDate: $endDate) {
      id
      title
      hebrewTitle
      channel
      startTime
      endTime
      live
      metadata
    }
  }
`;

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

const LancelotDashboard: React.FC = () => {
  const router = useRouter();
  const { user, loading: authLoading, hasPermission } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [broadcastsModalVisible, setBroadcastsModalVisible] = useState(false);

  // Skip per-widget queries when the user lacks the permission so the
  // backend resolver doesn't throw and we don't pollute the console.
  const canViewDashboard = hasPermission(Permission.DASHBOARD_VIEW);
  const canViewBroadcasts = hasPermission(Permission.BROADCAST_VIEW);
  const canViewOwnShifts = hasPermission(Permission.SHIFTS_VIEW_OWN);
  const canViewBulletin = canViewDashboard;

  // Quick-action gates — mirror the sidebar so the dashboard never offers a
  // shortcut to a page the user cannot actually open.
  const canSeeBroadcastPlanningAction = canViewBroadcasts;
  const canSeeShiftsAction = canViewOwnShifts;
  const canSeeUsersAction = hasPermission(Permission.USERS_MANAGE_DEPT) || hasPermission(Permission.USERS_MANAGE_ALL);
  const canSeeWarehouseAction = hasPermission(Permission.WAREHOUSE_VIEW);
  const anyQuickActionVisible =
    canSeeBroadcastPlanningAction ||
    canSeeShiftsAction ||
    canSeeUsersAction ||
    canSeeWarehouseAction;

  // Stat-card gates — each tile leaks org-level info that regular employees
  // shouldn't see (active users, total departments, fleet of active shifts, …).
  const canSeeUsersStat = hasPermission(Permission.USERS_VIEW);
  const canSeeDepartmentsStat = hasPermission(Permission.USERS_VIEW);
  const canSeeTodaysBroadcastsStat = canViewBroadcasts;
  const canSeeActiveShiftsStat = hasPermission(Permission.SHIFTS_VIEW_ALL);
  const anyStatVisible =
    canSeeUsersStat ||
    canSeeDepartmentsStat ||
    canSeeTodaysBroadcastsStat ||
    canSeeActiveShiftsStat;

  const assignmentsDateRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, []);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Query for dashboard stats
  const { data: statsData, loading: statsLoading, refetch: refetchStats } = useQuery(GET_DASHBOARD_STATS, {
    skip: !user || !canViewDashboard,
    errorPolicy: 'all',
    pollInterval: 300000 // Refresh every 5 minutes
  });

  // Query for bulletin posts
  const { data: bulletinData, loading: bulletinLoading } = useQuery(GET_BULLETIN_POSTS, {
    variables: { limit: 5, onlyEmergency: false },
    skip: !user || !canViewDashboard,
    errorPolicy: 'all',
    pollInterval: 60000 // Refresh every minute
  });

  // Query for today's broadcasts
  const { data: broadcastsData, loading: broadcastsLoading } = useQuery(GET_TODAYS_BROADCASTS, {
    skip: !user || !canViewBroadcasts,
    errorPolicy: 'all',
    pollInterval: 300000 // Refresh every 5 minutes
  });

  // Query for broadcasts in the next week (to extract "my assignments" from broadcast array)
  const { data: assignmentsSourceData, loading: assignmentsLoading } = useQuery(GET_BROADCAST_EVENTS_FOR_ASSIGNMENTS, {
    variables: assignmentsDateRange,
    skip: !user || !canViewBroadcasts,
    errorPolicy: 'all',
    pollInterval: 300000
  });

  // Query for weekly shifts
  const { data: shiftsData, loading: shiftsLoading } = useQuery(GET_WEEKLY_SHIFTS, {
    variables: { userId: user?.id },
    skip: !user || !canViewOwnShifts,
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
  const upcomingBroadcastEventsForAssignments = assignmentsSourceData?.broadcastEvents || [];

  const upcomingWorkItems = useMemo(() => {
    const now = new Date();
    const userId = user?.id;
    if (!userId) return [];

    const parseShiftDateTime = (shift: any, time: string | undefined) => {
      const base = new Date(shift.date);
      if (time) {
        const [h, m] = time.split(':').map((n: string) => parseInt(n, 10));
        if (!Number.isNaN(h) && !Number.isNaN(m)) {
          base.setHours(h, m, 0, 0);
        }
      }
      return base;
    };

    const shiftItems = (weeklyShifts || []).map((shift: any) => {
      const start = parseShiftDateTime(shift, shift.startTime);
      let end = parseShiftDateTime(shift, shift.endTime);
      if (end < start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000); // overnight

      return {
        kind: 'shift' as const,
        id: String(shift.id),
        start,
        end,
        shift,
      };
    });

    // Helper: ensure metadata is an object (GraphQL JSON scalar may return a string)
    const ensureObject = (val: any): any => {
      if (!val) return null;
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return null; }
      }
      return val;
    };

    const broadcastItems = (upcomingBroadcastEventsForAssignments || []).flatMap((event: any) => {
      const meta = ensureObject(event?.metadata);
      if (!meta?.departments) return [];

      const dept = meta.departments.broadcastArray
        || meta.departments['broadcast-array']
        || null;
      if (!dept) return [];

      // crewAssignments can live at multiple levels depending on how the save happened
      const crewAssignments: any[] =
        (Array.isArray(dept.crewAssignments) ? dept.crewAssignments : null)
        || (Array.isArray(dept.broadcastArray?.crewAssignments) ? dept.broadcastArray.crewAssignments : null)
        || [];
      if (crewAssignments.length === 0) return [];

      const matched = crewAssignments.filter((a: any) => a?.userId === userId);
      if (matched.length === 0) return [];

      const start = new Date(event.startTime);
      const end = new Date(event.endTime);

      const place = dept.מקוםשידור || dept.customData?.מקוםשידור || '';

      return matched.map((a: any, idx: number) => ({
        kind: 'broadcast' as const,
        id: `${event.id}:${a.role || 'role'}:${idx}`,
        start,
        end,
        event,
        role: a.role || a.userName || 'תפקיד',
        place,
      }));
    });

    console.log('[Dashboard] upcomingWorkItems debug:', {
      userId,
      totalShifts: shiftItems.length,
      totalBroadcastEvents: (upcomingBroadcastEventsForAssignments || []).length,
      broadcastAssignmentsFound: broadcastItems.length,
      sampleEvent: (upcomingBroadcastEventsForAssignments || [])[0] ? {
        id: (upcomingBroadcastEventsForAssignments || [])[0]?.id,
        metadataType: typeof (upcomingBroadcastEventsForAssignments || [])[0]?.metadata,
        departments: Object.keys(ensureObject((upcomingBroadcastEventsForAssignments || [])[0]?.metadata)?.departments || {}),
        broadcastArray: ensureObject((upcomingBroadcastEventsForAssignments || [])[0]?.metadata)?.departments?.broadcastArray,
      } : 'no events',
    });

    const combined = [...shiftItems, ...broadcastItems]
      .filter((item) => item.end > now) // upcoming or currently active
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    return combined;
  }, [weeklyShifts, upcomingBroadcastEventsForAssignments, user?.id]);

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
      sessionStorage.setItem('redirectAfterLogin', '/dashboard');
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

  // Function to get broadcast status
  const getBroadcastStatus = (broadcast: any) => {
    const now = new Date();
    const startTime = new Date(broadcast.startTime);
    const endTime = new Date(broadcast.endTime);
    const timeDiff = startTime.getTime() - now.getTime();
    const minutesUntilStart = Math.floor(timeDiff / (1000 * 60));
    
    if (now >= endTime) {
      return { 
        text: 'הסתיים', 
        dotColor: 'default'
      };
    } else if (now >= startTime && now < endTime) {
      return { 
        text: 'באוויר', 
        dotColor: 'error'
      };
    } else if (minutesUntilStart <= 30) {
      return { 
        text: 'בקרוב', 
        dotColor: 'warning'
      };
    } else {
      return { 
        text: 'היום', 
        dotColor: 'success'
      };
    }
  };

  // Function to render a broadcast item
  const renderBroadcastItem = (broadcast: any) => {
    const startTime = new Date(broadcast.startTime);
    const endTime = new Date(broadcast.endTime);
    const status = getBroadcastStatus(broadcast);
    
    return (
      <div key={broadcast.id} className="p-3 hover:bg-gray-50 rounded transition-colors">
        <Row gutter={16} align="middle">
          <Col flex="none">
            <Badge status={status.dotColor as any} />
          </Col>
          <Col flex="auto">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Space size="small" className="w-full">
                  <Text strong>{broadcast.title || broadcast.hebrewTitle}</Text>
                  {broadcast.live && <Text type="danger">• שידור חי</Text>}
                </Space>
                <div className="mt-1">
                  <Space size="small">
                    <Text type="secondary" className="text-sm">
                      {startTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} - 
                      {endTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text type="secondary" className="text-sm">• ערוץ {broadcast.channel}</Text>
                    {broadcast.location && (
                      <Text type="secondary" className="text-sm">• {broadcast.location}</Text>
                    )}
                  </Space>
                </div>
              </div>
              <div className="mr-4">
                <Text type="secondary" className="text-sm">{status.text}</Text>
              </div>
            </div>
          </Col>
        </Row>
      </div>
    );
  };

    return (
    <Content className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="mb-6">
          <Row justify="space-between" align="middle">
            <Col>
              <Title level={2} className="mb-0">
                דשבורד ראשי
              </Title>
              <Text type="secondary">
                {new Date().toLocaleDateString('he-IL', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </Text>
            </Col>
            <Col>
              <Space>
                <Button 
                  icon={<SyncOutlined />} 
                  onClick={handleRefresh}
                  loading={statsLoading}
                >
                  רענן נתונים
                </Button>
                <Avatar 
                  size="large" 
                  icon={<UserOutlined />}
                  style={{ backgroundColor: '#1890ff' }}
                />
                <div>
                  <Text strong>{user?.displayName || user?.email}</Text>
                  <br />
                  <Text type="secondary" className="text-sm">
                    {getRoleName(user?.systemRole)} • {getDepartmentName(user?.department)}
                  </Text>
                </div>
              </Space>
            </Col>
          </Row>
        </div>

        {/* Stats Cards */}
        {anyStatVisible && (
          <Row gutter={[16, 16]} className="mb-6">
            {canSeeUsersStat && (
              <Col xs={12} sm={12} md={6}>
                <Card hoverable loading={statsLoading}>
                  <Statistic
                    title="משתמשים פעילים"
                    value={stats.activeUsers}
                    suffix={`/ ${stats.totalUsers}`}
                    prefix={<UserOutlined />}
                    valueStyle={{ color: '#3f8600' }}
                  />
                </Card>
              </Col>
            )}
            {canSeeDepartmentsStat && (
              <Col xs={12} sm={12} md={6}>
                <Card hoverable loading={statsLoading}>
                  <Statistic
                    title="מחלקות"
                    value={stats.totalDepartments}
                    prefix={<TeamOutlined />}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Card>
              </Col>
            )}
            {canSeeTodaysBroadcastsStat && (
              <Col xs={12} sm={12} md={6}>
                <Card hoverable loading={statsLoading}>
                  <Statistic
                    title="שידורים היום"
                    value={stats.todaysBroadcasts}
                    prefix={<VideoCameraOutlined />}
                    valueStyle={{ color: '#722ed1' }}
                  />
                </Card>
              </Col>
            )}
            {canSeeActiveShiftsStat && (
              <Col xs={12} sm={12} md={6}>
                <Card hoverable loading={statsLoading}>
                  <Statistic
                    title="משמרות פעילות"
                    value={stats.activeShifts}
                    prefix={<ScheduleOutlined />}
                    valueStyle={{ color: '#fa8c16' }}
                  />
                </Card>
              </Col>
            )}
          </Row>
        )}

        {/* Quick Actions */}
        {anyQuickActionVisible && (
          <Row gutter={[16, 16]} className="mb-6">
            <Col span={24}>
              <Card title="פעולות מהירות">
                <Row gutter={[16, 16]}>
                  {canSeeBroadcastPlanningAction && (
                    <Col xs={12} sm={8} md={6}>
                      <Button
                        type="primary"
                        block
                        icon={<VideoCameraOutlined />}
                        onClick={() => router.push('/broadcast-planning')}
                      >
                        תכנון שידורים
                      </Button>
                    </Col>
                  )}
                  {canSeeShiftsAction && (
                    <Col xs={12} sm={8} md={6}>
                      <Button
                        block
                        icon={<CalendarOutlined />}
                        onClick={() => router.push('/shifts')}
                      >
                        ניהול משמרות
                      </Button>
                    </Col>
                  )}
                  {canSeeUsersAction && (
                    <Col xs={12} sm={8} md={6}>
                      <Button
                        block
                        icon={<TeamOutlined />}
                        onClick={() => router.push('/users')}
                      >
                        ניהול משתמשים
                      </Button>
                    </Col>
                  )}
                  {canSeeWarehouseAction && (
                    <Col xs={12} sm={8} md={6}>
                      <Button
                        block
                        icon={<UserOutlined />}
                        onClick={() => router.push('/warehouse')}
                      >
                        ציוד ומחסן
                      </Button>
                    </Col>
                  )}
                </Row>
              </Card>
            </Col>
          </Row>
        )}

        {/* Main Content */}
        <Row gutter={[16, 16]}>
          {/* Today's Broadcasts — only for viewers with broadcast access */}
          {canViewBroadcasts && (
          <Col xs={24} lg={canViewOwnShifts ? 12 : 24}>
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
                <div className="space-y-1">
                  {topBroadcasts.map(renderBroadcastItem)}
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
          )}

          {/* Weekly Shifts — only for users who can read their own shifts */}
          {canViewOwnShifts && (
          <Col xs={24} lg={canViewBroadcasts ? 12 : 24}>
            <Card 
              title={
                <Space>
                  <CalendarOutlined />
                  <span>המשמרות והשיבוצים שלי</span>
                </Space>
              }
              loading={shiftsLoading || assignmentsLoading}
              extra={
                <Button type="link" onClick={() => router.push('/shifts')}>
                  הצג הכל
                </Button>
              }
            >
              {upcomingWorkItems.length > 0 ? (
                <div className="overflow-x-auto">
                  <Space direction="vertical" className="w-full">
                    {upcomingWorkItems.slice(0, 5).map((item) => {
                      const isToday = item.start.toDateString() === new Date().toDateString();
                      const isPast = item.end < new Date();

                      if (item.kind === 'shift') {
                        const shift = item.shift;
                        return (
                          <div key={item.id} className={`border rounded-lg p-3 ${isToday ? 'border-blue-500 bg-blue-50' : ''} ${isPast ? 'opacity-60' : ''}`}>
                            <Row align="middle" gutter={16}>
                              <Col xs={24} sm={8}>
                                <Space>
                                  <CalendarOutlined />
                                  <Text strong>
                                    {item.start.toLocaleDateString('he-IL', { 
                                      weekday: 'short', 
                                      day: 'numeric', 
                                      month: 'numeric' 
                                    })}
                                  </Text>
                                  {isToday && <Badge status="processing" text="היום" />}
                                </Space>
                              </Col>
                              <Col xs={24} sm={8}>
                                <Text>
                                  {shift.startTime} - {shift.endTime}
                                </Text>
                              </Col>
                              <Col xs={24} sm={8}>
                                <Space wrap>
                                  <Tag color="blue">משמרת</Tag>
                                  <Badge 
                                    status={shift.status === 'scheduled' || shift.status === 'active' ? 'success' : 'warning'} 
                                    text={shift.shiftType || 'משמרת רגילה'} 
                                  />
                                </Space>
                              </Col>
                            </Row>
                          </div>
                        );
                      }

                      // broadcast assignment
                      const ev = item.event;
                      return (
                        <div key={item.id} className={`border rounded-lg p-3 ${isToday ? 'border-purple-500 bg-purple-50' : ''} ${isPast ? 'opacity-60' : ''}`}>
                          <Row align="middle" gutter={16}>
                            <Col xs={24} sm={8}>
                              <Space>
                                <VideoCameraOutlined />
                                <Text strong>
                                  {item.start.toLocaleDateString('he-IL', { 
                                    weekday: 'short', 
                                    day: 'numeric', 
                                    month: 'numeric' 
                                  })}
                                </Text>
                                {isToday && <Badge status="processing" text="היום" />}
                              </Space>
                            </Col>
                            <Col xs={24} sm={8}>
                              <Space direction="vertical" size={0}>
                                <Text>
                                  {item.start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} -{' '}
                                  {item.end.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                                <Text type="secondary" className="text-xs">
                                  {ev.title || ev.hebrewTitle}
                                </Text>
                              </Space>
                            </Col>
                            <Col xs={24} sm={8}>
                              <Space wrap>
                                <Tag color="purple">שיבוץ שידור</Tag>
                                <Tag color="geekblue">{item.role}</Tag>
                                {ev.channel && <Tag>{ev.channel}</Tag>}
                                {item.place && <Tag>{item.place}</Tag>}
                              </Space>
                            </Col>
                          </Row>
                        </div>
                      );
                    })}
                  </Space>
                </div>
              ) : (
                <div className="text-center py-8">
                  <CalendarOutlined className="text-4xl text-gray-400 mb-2" />
                  <br />
                  <Text type="secondary">אין משמרות או שיבוצים קרובים</Text>
                </div>
              )}
            </Card>
          </Col>
          )}

          {/* Bulletin Board */}
          {canViewBulletin && (
          <Col xs={24}>
            <Card 
              title={
                <Space>
                  <BellOutlined />
                  <span>לוח מודעות</span>
                </Space>
              }
              loading={bulletinLoading}
            >
              {bulletinPosts.length > 0 ? (
                <Space direction="vertical" className="w-full">
                  {bulletinPosts.map((post: any) => (
                    <div key={post.id} className="border-b pb-3 last:border-0">
                      <Row justify="space-between" align="top">
                        <Col flex="1">
                          <Space direction="vertical" size={0}>
                            <Text strong>{post.title}</Text>
                            <Text type="secondary" className="text-sm">
                              {post.content}
                            </Text>
                            <Text type="secondary" className="text-xs">
                              {new Date(post.createdAt).toLocaleDateString('he-IL')} • {post.author?.displayName}
                            </Text>
                          </Space>
                        </Col>
                        <Col>
                          {post.priority === 'urgent' && (
                            <Badge status="error" text="דחוף" />
                          )}
                        </Col>
                      </Row>
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
          )}
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
          width={1000}
          styles={{ body: { maxHeight: '70vh', overflow: 'auto', padding: '24px' } }}
        >
          <div className="space-y-1">
            {sortedBroadcasts.map(renderBroadcastItem)}
          </div>
        </Modal>
      </div>
    </Content>
  );
};

export default LancelotDashboard;
