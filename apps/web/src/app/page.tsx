'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useMutation, useQuery } from '@apollo/client';
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
  Form,
  Input,
  Switch as AntSwitch,
  Popconfirm,
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
  MessageOutlined,
  PlusOutlined,
  DeleteOutlined,
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
        id
        displayName
      }
      createdAt
    }
  }
`;

const CREATE_BULLETIN_POST = gql`
  mutation CreateBulletinPost(
    $title: String!
    $content: String!
    $isEmergency: Boolean
    $isPinned: Boolean
  ) {
    createBulletinPost(
      title: $title
      content: $content
      isEmergency: $isEmergency
      isPinned: $isPinned
    ) {
      id
    }
  }
`;

const DELETE_BULLETIN_POST = gql`
  mutation DeleteBulletinPost($id: ID!) {
    deleteBulletinPost(id: $id)
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

// For "my broadcast assignments" — fetch events for the next 7 days, filter by crewAssignments
const GET_BROADCAST_EVENTS_FOR_ASSIGNMENTS = gql`
  query GetBroadcastEventsForMyAssignments($startDate: DateTime, $endDate: DateTime) {
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

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, hasPermission } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [broadcastsModalVisible, setBroadcastsModalVisible] = useState(false);

  // Capabilities. Computed up-front so each useQuery below can be skipped for
  // users who don't have the relevant permission — otherwise the resolver
  // throws "Missing permission: X" and spams the user's console with
  // INTERNAL_SERVER_ERRORs for data they were never going to see anyway.
  const canViewDashboard = hasPermission(Permission.DASHBOARD_VIEW);
  const canViewBroadcasts = hasPermission(Permission.BROADCAST_VIEW);
  const canViewBulletin = canViewDashboard;
  const canManageBulletin = hasPermission(Permission.BULLETIN_MANAGE);
  const canViewOwnShifts = hasPermission(Permission.SHIFTS_VIEW_OWN);

  // Quick-action gates. Mirror the sidebar so we never advertise a destination
  // the user cannot actually open (ProtectedRoute on the target would just bounce
  // them back). Keep these in lockstep with `components/Sidebar.tsx`.
  const canSeeUsersAction = hasPermission(Permission.USERS_MANAGE_DEPT) || hasPermission(Permission.USERS_MANAGE_ALL);
  const canSeeWarehouseAction = hasPermission(Permission.WAREHOUSE_VIEW);
  const canSeeBroadcastPlanningAction = canViewBroadcasts;
  const canSeeShiftsAction = canViewOwnShifts;
  const canUseChat = hasPermission(Permission.CHAT_USE);
  // The bulletin board widget is rendered on this page, so the "open bulletin"
  // shortcut is only useful when the viewer can actually read posts.
  const canSeeBulletinShortcut = canViewBulletin;

  // Stat-card gates. Each tile leaks privileged information (active user count,
  // department count, support ticket queue, critical alerts, etc.) that a regular
  // employee should never see — gate them individually.
  const canSeeUsersStat = hasPermission(Permission.USERS_VIEW);
  const canSeeDepartmentsStat = hasPermission(Permission.USERS_VIEW);
  const canSeeTodaysBroadcastsStat = canViewBroadcasts;
  const canSeeActiveShiftsStat = hasPermission(Permission.SHIFTS_VIEW_ALL);
  const canSeeSupportStat = hasPermission(Permission.IT_SUPPORT_VIEW);
  const canSeeCriticalAlertsStat = hasPermission(Permission.DASHBOARD_MANAGE);

  const anyStatVisible =
    canSeeUsersStat ||
    canSeeDepartmentsStat ||
    canSeeTodaysBroadcastsStat ||
    canSeeActiveShiftsStat ||
    canSeeSupportStat ||
    canSeeCriticalAlertsStat;
  const anyQuickActionVisible =
    canSeeBroadcastPlanningAction ||
    canSeeShiftsAction ||
    canSeeWarehouseAction ||
    canSeeUsersAction ||
    canUseChat ||
    canSeeBulletinShortcut;

  // Compose / publish state for the bulletin board.
  const [bulletinModalOpen, setBulletinModalOpen] = useState(false);
  const [bulletinForm] = Form.useForm<{
    title: string;
    content: string;
    isEmergency: boolean;
    isPinned: boolean;
  }>();

  // Stable date range for the next 7 days (for broadcast assignments)
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
  const { data: bulletinData, loading: bulletinLoading, refetch: refetchBulletin } = useQuery(GET_BULLETIN_POSTS, {
    variables: { limit: 5, onlyEmergency: false },
    skip: !user || !canViewBulletin,
    errorPolicy: 'all',
    pollInterval: 60000 // Refresh every minute
  });

  const [createBulletinPost, { loading: creatingBulletin }] = useMutation(CREATE_BULLETIN_POST, {
    onCompleted: () => {
      message.success('ההודעה פורסמה');
      setBulletinModalOpen(false);
      bulletinForm.resetFields();
      refetchBulletin();
    },
    onError: (err) => {
      message.error(`פרסום נכשל: ${err.message}`);
    },
  });

  const [deleteBulletinPost] = useMutation(DELETE_BULLETIN_POST, {
    onCompleted: () => {
      message.success('ההודעה נמחקה');
      refetchBulletin();
    },
    onError: (err) => {
      message.error(`מחיקה נכשלה: ${err.message}`);
    },
  });

  // Query for today's broadcasts
  const { data: broadcastsData, loading: broadcastsLoading } = useQuery(GET_TODAYS_BROADCASTS, {
    skip: !user || !canViewBroadcasts,
    errorPolicy: 'all',
    pollInterval: 300000 // Refresh every 5 minutes
  });

  // Query for weekly shifts
  const { data: shiftsData, loading: shiftsLoading } = useQuery(GET_WEEKLY_SHIFTS, {
    variables: { userId: user?.id },
    skip: !user || !canViewOwnShifts,
    errorPolicy: 'all',
    pollInterval: 300000 // Refresh every 5 minutes
  });

  // Query for broadcast events (next 7 days) to extract "my broadcast array assignments"
  const { data: assignmentsSourceData, loading: assignmentsLoading } = useQuery(GET_BROADCAST_EVENTS_FOR_ASSIGNMENTS, {
    variables: assignmentsDateRange,
    skip: !user || !canViewBroadcasts,
    errorPolicy: 'all',
    pollInterval: 300000
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
  const broadcastEventsForAssignments = assignmentsSourceData?.broadcastEvents || [];

  // Helper: ensure metadata is an object (GraphQL JSON scalar may return a string)
  const ensureObject = (val: any): any => {
    if (!val) return null;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return null; }
    }
    return val;
  };

  // Merge shifts + broadcast-array assignments into one sorted list
  const upcomingWorkItems = useMemo(() => {
    const now = new Date();
    const userId = user?.id;
    if (!userId) return [];

    // --- Shift items ---
    const shiftItems = (weeklyShifts || []).map((shift: any) => {
      const base = new Date(shift.date);
      const parseTime = (t: string | undefined) => {
        if (!t) return new Date(base);
        const [h, m] = t.split(':').map((n: string) => parseInt(n, 10));
        const d = new Date(base);
        if (!Number.isNaN(h) && !Number.isNaN(m)) d.setHours(h, m, 0, 0);
        return d;
      };
      const start = parseTime(shift.startTime);
      let end = parseTime(shift.endTime);
      if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);

      return { kind: 'shift' as const, id: String(shift.id), start, end, shift };
    });

    // --- Broadcast-array assignment items ---
    const broadcastItems = (broadcastEventsForAssignments || []).flatMap((event: any) => {
      const meta = ensureObject(event?.metadata);
      if (!meta?.departments) return [];

      const dept = meta.departments.broadcastArray
        || meta.departments['broadcast-array']
        || null;
      if (!dept) return [];

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
        id: `ba-${event.id}-${a.role || 'r'}-${idx}`,
        start,
        end,
        event,
        role: a.role || a.userName || 'תפקיד',
        place,
      }));
    });

    return [...shiftItems, ...broadcastItems]
      .filter((item) => item.end > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [weeklyShifts, broadcastEventsForAssignments, user?.id]);

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
      'IT_ADMIN': 'מנהל IT',
      'SYSTEM_ADMIN': 'מנהל מערכת',
      'admin': 'מנהל',
      'department_head': 'ראש מחלקה',
      'employee': 'עובד'
    };
    return roles[role || ''] || 'עובד';
  };

  const userFirstName = user.displayName?.split(' ')[0] || user.email;
  const formattedDate = currentTime.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const formattedTime = currentTime.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const headerMetaItems = [
    getDepartmentName(user.department),
    getRoleName(user.systemRole),
    formattedDate,
  ];

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
    <ProtectedRoute requires={Permission.DASHBOARD_VIEW}>
    <Content className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-blue-500/20">
                {(user.displayName || user.email || '?')[0].toUpperCase()}
              </div>
              <div className="text-right" dir="rtl">
                <h1 className="text-2xl font-bold text-gray-900 leading-tight" dir="rtl">
                  {(() => {
                    const hour = currentTime.getHours();
                    if (hour < 6) return 'לילה טוב';
                    if (hour < 12) return 'בוקר טוב';
                    if (hour < 17) return 'צהריים טובים';
                    if (hour < 21) return 'ערב טוב';
                    return 'לילה טוב';
                  })()}, <bdi dir="auto">{userFirstName}</bdi>
                </h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-sm text-gray-500" dir="rtl">
                  {headerMetaItems.map((item, index) => (
                    <React.Fragment key={`${item}-${index}`}>
                      {index > 0 && <span className="w-1 h-1 rounded-full bg-gray-300" aria-hidden="true" />}
                      <bdi dir="auto">{item}</bdi>
                    </React.Fragment>
                  ))}
                  <span className="w-1 h-1 rounded-full bg-gray-300" aria-hidden="true" />
                  <span className="font-medium text-gray-700" dir="ltr">
                    {formattedTime}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={statsLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50"
            >
              <SyncOutlined spin={statsLoading} />
              רענן
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        {anyStatVisible && (
          <Row gutter={[16, 16]} className="mb-6">
            {canSeeUsersStat && (
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
            )}
            {canSeeDepartmentsStat && (
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
            )}
            {canSeeTodaysBroadcastsStat && (
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
            )}
            {canSeeActiveShiftsStat && (
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
            )}
            {canSeeSupportStat && (
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
            )}
            {canSeeCriticalAlertsStat && (
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
            )}
          </Row>
        )}

        {/* Quick Actions */}
        {anyQuickActionVisible && (
          <Card title="פעולות מהירות" className="mb-6">
            <Row gutter={[16, 16]}>
              {canSeeBroadcastPlanningAction && (
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
              )}
              {canSeeShiftsAction && (
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
              )}
              {canSeeWarehouseAction && (
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
              )}
              {canSeeUsersAction && (
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
              )}
              {canUseChat && (
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
              )}
              {canSeeBulletinShortcut && (
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
              )}
            </Row>
          </Card>
        )}

                {/* Today's Broadcasts — only surfaced to users who can read broadcasts */}
        {canViewBroadcasts && (
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
        )}

        {/* Weekly Shifts + Broadcast Assignments and Bulletin Board */}
        {(canViewOwnShifts || canViewBulletin) && (
        <Row gutter={[16, 16]}>
          {canViewOwnShifts && (
          <Col xs={24} lg={canViewBulletin ? 12 : 24}>
            <Card 
              title={
                <Space>
                  <CalendarOutlined />
                  <span>המשמרות והשיבוצים שלי</span>
                  {upcomingWorkItems.length > 0 && (
                    <Badge count={upcomingWorkItems.length} style={{ backgroundColor: '#722ed1' }} />
                  )}
                </Space>
              }
              loading={shiftsLoading || assignmentsLoading}
              extra={
                <Button type="link" onClick={() => router.push('/shifts')}>
                  הצג הכל
                </Button>
              }
              className="h-full"
            >
              {upcomingWorkItems.length > 0 ? (
                <Space direction="vertical" className="w-full">
                  {upcomingWorkItems.slice(0, 6).map((item) => {
                    const isToday = item.start.toDateString() === new Date().toDateString();

                    if (item.kind === 'shift') {
                      const shift = item.shift;
                      return (
                        <div key={item.id} className={`border-b pb-3 last:border-b-0 ${isToday ? 'bg-blue-50 rounded p-2' : ''}`}>
                          <Row align="middle">
                            <Col span={12}>
                              <Space size="small">
                                <CalendarOutlined />
                                <Text strong>{shift.shiftType || 'משמרת'}</Text>
                              </Space>
                              <br />
                              <Text type="secondary" className="text-sm">
                                {shift.department}
                              </Text>
                            </Col>
                            <Col span={12} className="text-left">
                              <Text>
                                {item.start.toLocaleDateString('he-IL', { 
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'numeric'
                                })}
                                {isToday && <Badge status="processing" className="mr-2" />}
                              </Text>
                              <br />
                              <Text type="secondary" className="text-sm">
                                {shift.startTime && shift.endTime
                                  ? `${shift.startTime} - ${shift.endTime}`
                                  : shift.shiftType || 'משמרת'}
                              </Text>
                            </Col>
                          </Row>
                        </div>
                      );
                    }

                    // Broadcast array assignment
                    const ev = item.event;
                    return (
                      <div key={item.id} className={`border-b pb-3 last:border-b-0 ${isToday ? 'bg-purple-50 rounded p-2' : ''}`}>
                        <Row align="middle">
                          <Col span={14}>
                            <Space size="small">
                              <VideoCameraOutlined style={{ color: '#722ed1' }} />
                              <Text strong>{ev.title || ev.hebrewTitle}</Text>
                            </Space>
                            <br />
                            <Space size="small" className="mt-1">
                              <Text type="secondary" className="text-sm">תפקיד:</Text>
                              <Text className="text-sm" style={{ color: '#722ed1', fontWeight: 500 }}>{item.role}</Text>
                              {ev.channel && <Text type="secondary" className="text-sm">• {ev.channel}</Text>}
                              {item.place && <Text type="secondary" className="text-sm">• {item.place}</Text>}
                            </Space>
                          </Col>
                          <Col span={10} className="text-left">
                            <Text>
                              {item.start.toLocaleDateString('he-IL', { 
                                weekday: 'short',
                                day: 'numeric',
                                month: 'numeric'
                              })}
                              {isToday && <Badge status="processing" className="mr-2" />}
                            </Text>
                            <br />
                            <Text type="secondary" className="text-sm">
                              {item.start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} -{' '}
                              {item.end.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </Col>
                        </Row>
                      </div>
                    );
                  })}
                </Space>
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

          {canViewBulletin && (
          <Col xs={24} lg={canViewOwnShifts ? 12 : 24}>
            <Card
              title="לוח מודעות"
              loading={bulletinLoading}
              extra={
                <Space>
                  {canManageBulletin && (
                    <Button
                      type="primary"
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => setBulletinModalOpen(true)}
                    >
                      הודעה חדשה
                    </Button>
                  )}
                  <Badge
                    count={bulletinPosts.filter((p: any) => p.isEmergency).length}
                    offset={[-5, 5]}
                  >
                    <Button type="link" icon={<BellOutlined />}>
                      הצג הכל
                    </Button>
                  </Badge>
                </Space>
              }
              className="h-full"
            >
              {bulletinPosts.length > 0 ? (
                <Space direction="vertical" className="w-full">
                  {bulletinPosts.slice(0, 3).map((post: any) => {
                    const ownPost = post.author?.id && user?.id && post.author.id === user.id;
                    const canDelete = canManageBulletin && ownPost;
                    return (
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
                        <div className="flex items-start justify-between gap-2">
                          <Space className="mb-1">
                            <Text strong className={post.isEmergency ? 'text-red-600' : ''}>
                              {post.title}
                            </Text>
                            {post.isEmergency && <Badge status="error" text="דחוף" />}
                          </Space>
                          {canDelete && (
                            <Popconfirm
                              title="למחוק את ההודעה?"
                              okText="כן"
                              cancelText="לא"
                              okButtonProps={{ danger: true }}
                              onConfirm={() =>
                                deleteBulletinPost({ variables: { id: post.id } })
                              }
                            >
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                              />
                            </Popconfirm>
                          )}
                        </div>
                        <div>
                          <Text className="text-gray-600 text-sm">{post.content}</Text>
                        </div>
                        <div className="mt-2">
                          <Text type="secondary" className="text-xs">
                            {post.author?.displayName || 'לא ידוע'} • {
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
                    );
                  })}
                </Space>
              ) : (
                <div className="text-center py-8">
                  <BellOutlined className="text-4xl text-gray-400 mb-2" />
                  <br />
                  <Text type="secondary">אין הודעות חדשות</Text>
                  {canManageBulletin && (
                    <div className="mt-3">
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setBulletinModalOpen(true)}
                      >
                        פרסם הודעה ראשונה
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </Col>
          )}
        </Row>
        )}

        {/* New Bulletin Post Modal */}
        <Modal
          title="הודעה חדשה ללוח המודעות"
          open={bulletinModalOpen}
          onCancel={() => setBulletinModalOpen(false)}
          okText="פרסם"
          cancelText="בטל"
          confirmLoading={creatingBulletin}
          onOk={async () => {
            try {
              const values = await bulletinForm.validateFields();
              await createBulletinPost({
                variables: {
                  title: values.title.trim(),
                  content: values.content.trim(),
                  isEmergency: !!values.isEmergency,
                  isPinned: !!values.isPinned,
                },
              });
            } catch {
              // antd surfaces field-level validation errors directly on the form.
            }
          }}
          destroyOnHidden
        >
          <Form
            form={bulletinForm}
            layout="vertical"
            initialValues={{ isEmergency: false, isPinned: false }}
          >
            <Form.Item
              name="title"
              label="כותרת"
              rules={[{ required: true, message: 'יש להזין כותרת' }]}
            >
              <Input placeholder="לדוגמה: עדכון לשידור הערב" maxLength={120} />
            </Form.Item>
            <Form.Item
              name="content"
              label="תוכן"
              rules={[{ required: true, message: 'יש להזין תוכן' }]}
            >
              <Input.TextArea rows={4} maxLength={2000} placeholder="גוף ההודעה" />
            </Form.Item>
            <Form.Item name="isEmergency" label="הודעת חירום" valuePropName="checked">
              <AntSwitch />
            </Form.Item>
            <Form.Item name="isPinned" label="הצמד לראש הלוח" valuePropName="checked">
              <AntSwitch />
            </Form.Item>
          </Form>
        </Modal>

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
    </ProtectedRoute>
  );
} 