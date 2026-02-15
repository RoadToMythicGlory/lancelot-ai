'use client';

import React, { useState, useEffect, useMemo } from 'react';
import './ShiftsAdminDashboard.css';
import { 
  Card, 
  Row, 
  Col, 
  Button, 
  Progress, 
  Menu, 
  Table, 
  Tag, 
  Space, 
  Typography, 
  Divider,
  Badge,
  Tooltip,
  Modal,
  Form,
  Input,
  DatePicker,
  Select,
  Switch,
  TimePicker,
  Tabs,
  List,
  Alert,
  Statistic,
  Checkbox,
  InputNumber,
  ColorPicker,
  App,
  Radio,
  Spin
} from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  UserOutlined,
  FileTextOutlined,
  BellOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  PhoneOutlined,
  CalendarOutlined,
  TeamOutlined,
  FilterOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  MoreOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Dropdown } from 'antd';
import { useQuery, useMutation, gql } from '@apollo/client';
import moment from 'moment';
import dayjs from 'dayjs';
import 'moment/locale/he';
import { useAuth } from '../../../contexts/AuthContext';
import { GET_DEPARTMENT_SHIFT_CONFIG, GET_MY_DEPARTMENT_SHIFT_CONFIG, GET_DEPARTMENTS, GET_SHIFT_ROLE_TEMPLATES } from '../../../graphql/queries';
import { UPDATE_DEPARTMENT_SHIFT_CONFIG, CREATE_SHIFT_ROLE_TEMPLATE, UPDATE_SHIFT_ROLE_TEMPLATE, DELETE_SHIFT_ROLE_TEMPLATE, APPLY_SHIFT_ROLE_TEMPLATE } from '../../../graphql/mutations';
import { getJewishHolidaysForDate, getSpecialDayType } from '@/utils/jewishCalendar';
import { cleanGraphQLInput } from '@/utils/graphqlUtils';

moment.locale('he');

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// Type definitions
interface ShiftTemplate {
  id: string;
  name: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  departments: string[];
  daysOfWeek: number[];
  isActive: boolean;
}

interface ShiftRoleTemplate {
  id: string;
  name: string;
  departmentId: string;
  dayOfWeek: number;
  shiftType: string;
  roleAssignments: Array<{
    roleId: string;
    roleName: string;
    count: number;
  }>;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface SpecialRequest {
  id: string;
  user: {
    id: string;
    displayName: string;
    department: string;
  };
  type: string;
  date: string;
  shiftType: string;
  reason: string;
  status: string;
  createdAt: string;
}

interface DepartmentRole {
  id: string;
  name: string;
  description?: string;
  color: string;
  priority: number;
}

interface DepartmentShiftConfig {
  id: string;
  departmentId: string;
  departmentName: string;
  shiftTypes: ShiftTypeConfig[];
  departmentRoles?: DepartmentRole[];
  weeklyPatterns: WeeklyPattern[];
  constraints: ShiftConstraints;
  notifications: NotificationSettings;
  assignmentSettings?: AssignmentSettings;
  useTemplateSystem?: boolean;
}

interface ShiftTypeConfig {
  type: string;
  label: string;
  color: string;
  defaultStartTime: string;
  defaultEndTime: string;
  enabled: boolean;
  requiredStaff: number;
}

interface WeeklyPattern {
  name: string;
  description: string;
  pattern: DayPattern[];
  isActive: boolean;
}

interface DayPattern {
  dayOfWeek: number;
  shifts: PatternShift[];
}

interface PatternShift {
  shiftType: string;
  requiredStaff: number;
  startTime: string;
  endTime: string;
}

interface ShiftConstraints {
  minRestBetweenShifts: number;
  maxConsecutiveDays: number;
  maxShiftsPerWeek: number;
  maxNightShiftsPerWeek: number;
  requireApprovalForSwaps: boolean;
  autoAssignEnabled: boolean;
  allowOvertime: boolean;
  overtimeThresholdHours: number;
}

interface NotificationSettings {
  sendShiftReminders: boolean;
  reminderHoursBefore: number;
  sendSwapRequests: boolean;
  sendScheduleUpdates: boolean;
}

interface AssignmentSettings {
  maxConsecutiveSaturdays: number;
  maxConsecutiveWorkDays: number;
  maxDaysOffPerWeek: number;
  maxHoursPerDay: number;
}

// GraphQL queries
const GET_SHIFTS_BY_WEEK = gql`
  query GetShiftsByWeek($weekOffset: Int!) {
    getShiftsByWeek(weekOffset: $weekOffset) {
      weekStart
      weekEnd
      completionPercentage
      shifts {
        id
        date
        shiftType
        startTime
        endTime
        department
        requiredWorkers
        notes
        user {
          id
          displayName
          department
        }
        assignedWorkers {
          userId
          user {
            id
            displayName
          }
          role
        }
        status
      }
      stats {
        total
        assigned
        unassigned
      }
    }
  }
`;

const GET_SHIFT_TEMPLATES = gql`
  query GetShiftTemplates {
    getShiftTemplates {
      id
      name
      shiftType
      startTime
      endTime
      departments
      daysOfWeek
      isActive
    }
  }
`;

const GET_SPECIAL_REQUESTS = gql`
  query GetSpecialRequests($status: String) {
    getSpecialRequests(status: $status) {
      id
      user {
        id
        displayName
        department
      }
      type
      date
      shiftType
      reason
      status
      createdAt
    }
  }
`;

// Add mutations and queries for shift assignment
const CREATE_SHIFT = gql`
  mutation CreateShift($input: ShiftInput!) {
    createShift(input: $input) {
      id
      date
      shiftType
      department
    }
  }
`;

const ASSIGN_USER_TO_SHIFT = gql`
  mutation AssignUserToShift($input: ShiftAssignmentInput!) {
    assignUserToShift(input: $input) {
      id
      assignedWorkers {
        userId
        user {
          id
          displayName
        }
      }
    }
  }
`;

const REMOVE_USER_FROM_SHIFT = gql`
  mutation RemoveUserFromShift($shiftId: String!, $userId: String!) {
    removeUserFromShift(shiftId: $shiftId, userId: $userId) {
      id
    }
  }
`;

const UPDATE_SHIFT = gql`
  mutation UpdateShift($id: ID!, $input: ShiftInput!) {
    updateShift(id: $id, input: $input) {
      id
      date
      shiftType
      startTime
      endTime
      department
      requiredWorkers
      notes
      status
      assignedWorkers {
        userId
        user {
          id
          displayName
        }
        role
      }
      updatedAt
    }
  }
`;

const UPDATE_USER_DEPARTMENT_ROLES = gql`
  mutation UpdateUserDepartmentRoles($userId: ID!, $departments: [UserDepartmentInput!]!) {
    updateUser(id: $userId, input: { departments: $departments }) {
      id
      departments {
        departmentId
        departmentName
        roles
      }
    }
  }
`;

const GET_ALL_USERS = gql`
  query GetAllUsers {
    users {
      id
      displayName
      department
      email
      departments {
        departmentId
        departmentName
        roles
      }
    }
  }
`;

// Add new queries and mutations
const GET_EMPLOYEES = gql`
  query GetEmployees($department: String) {
    employees(department: $department) {
      id
      firstName
      lastName
      displayName
      email
      department
      phone
      systemRole
      isActive
      createdAt
      updatedAt
    }
  }
`;

// Add availability constraints query
const GET_AVAILABILITY_CONSTRAINTS_FOR_USERS = gql`
  query GetAvailabilityConstraints($weekStartDate: String!, $userId: String) {
    availabilityConstraints(weekStartDate: $weekStartDate, userId: $userId) {
      id
      userId
      weekStartDate
      constraints {
        dayOfWeek
        shiftType
        availability
      }
    }
  }
`;

// Removed HANDLE_SPECIAL_REQUEST mutation - not implemented in backend
// TODO: Implement handleSpecialRequest mutation for non-vacation special requests



const SEND_NOTIFICATION = gql`
  mutation SendNotification($input: NotificationInput!) {
    sendNotification(input: $input) {
      success
      message
      notificationId
    }
  }
`;

const GENERATE_SHIFT_REPORT = gql`
  mutation GenerateShiftReport($input: ShiftReportInput!) {
    generateShiftReport(input: $input) {
      reportType
      data
      generatedAt
      message
    }
  }
`;

const GET_SPECIAL_DAYS = gql`
  query GetSpecialDays {
    specialDays {
      id
      name
      date
      type
      affectsDepartments
      createdBy
      createdAt
    }
  }
`;

const UPDATE_SPECIAL_DAYS = gql`
  mutation UpdateSpecialDays($input: SpecialDayInput!) {
    updateSpecialDays(input: $input) {
      id
      name
      date
      type
    }
  }
`;

const DELETE_SPECIAL_DAY = gql`
  mutation DeleteSpecialDay($id: ID!) {
    deleteSpecialDay(id: $id)
  }
`;

const APPROVE_VACATION_REQUEST = gql`
  mutation ApproveVacationRequest($input: ApprovalInput!) {
    approveVacationRequest(input: $input) {
      id
      status
    }
  }
`;

const UPDATE_VACATION_REQUEST = gql`
  mutation UpdateVacationRequest($id: ID!, $input: VacationRequestInput!) {
    updateVacationRequest(id: $id, input: $input) {
      id
      startDate
      endDate
      vacationType
      reason
      status
    }
  }
`;

const CANCEL_VACATION_REQUEST = gql`
  mutation CancelVacationRequest($id: ID!) {
    cancelVacationRequest(id: $id) {
      id
      status
    }
  }
`;

const DELETE_VACATION_REQUEST = gql`
  mutation DeleteVacationRequest($id: ID!) {
    deleteVacationRequest(id: $id)
  }
`;

const GET_ALL_VACATION_REQUESTS = gql`
  query GetAllVacationRequests($status: RequestStatus, $userId: String) {
    vacationRequests(status: $status, userId: $userId) {
      id
      user {
        id
        displayName
        department
      }
      startDate
      endDate
      vacationType
      reason
      status
      adminNotes
      approvedBy
      approvedAt
      createdAt
    }
  }
`;

const GET_USER_VACATION_HISTORY = gql`
  query GetUserVacationHistory($userId: String!) {
    vacationRequests(userId: $userId) {
      id
      user {
        id
        displayName
        department
      }
      startDate
      endDate
      vacationType
      reason
      status
      adminNotes
      approvedBy
      approvedAt
      createdAt
    }
  }
`;

const APPROVE_SHIFT_SWAP_REQUEST = gql`
  mutation ApproveShiftSwapRequest($input: ApprovalInput!) {
    approveShiftSwapRequest(input: $input) {
      id
      status
    }
  }
`;

// Shift Assignment Form Component - moved inside main component
export default function ShiftsAdminDashboard() {
  const { user } = useAuth();
  const { modal, message } = App.useApp();
  const [weekOffset, setWeekOffset] = useState(0);
  const [baseWeekOffset, setBaseWeekOffset] = useState(0);
  const [selectedMenu, setSelectedMenu] = useState('schedule');

  const [selectedDate, setSelectedDate] = useState(moment());
  const [editingSection, setEditingSection] = useState<string | null>(null);
  
  // New state for shift assignment UX
  const [selectedShiftForAssignment, setSelectedShiftForAssignment] = useState<any>(null);
  const [userConstraints, setUserConstraints] = useState<any>({});
  
  // Form instances for modals

  const [notificationForm] = Form.useForm();
  const [specialDayForm] = Form.useForm();
  
  // Modal visibility states

  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [specialDayModalVisible, setSpecialDayModalVisible] = useState(false);
  
  // Right-click context menu state
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedShiftForEdit, setSelectedShiftForEdit] = useState<any>(null);
  const [editShiftModalVisible, setEditShiftModalVisible] = useState(false);
  const [editShiftForm] = Form.useForm();
  
  // User role assignment state
  const [userRoleModalVisible, setUserRoleModalVisible] = useState(false);
  const [selectedUserForRoleAssignment, setSelectedUserForRoleAssignment] = useState<any>(null);
  const [userRoleForm] = Form.useForm();
  
  // Shift Role Template state
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftRoleTemplate | null>(null);
  const [templateForm] = Form.useForm();
  const [applyTemplateModalVisible, setApplyTemplateModalVisible] = useState(false);
  const [selectedWeekForTemplate, setSelectedWeekForTemplate] = useState<string | null>(null);
  
  // Vacation history state
  const [selectedUserForVacationHistory, setSelectedUserForVacationHistory] = useState<any>(null);
  const [vacationHistoryModalVisible, setVacationHistoryModalVisible] = useState(false);
  
  // Vacation edit/cancel state
  const [selectedVacationForEdit, setSelectedVacationForEdit] = useState<any>(null);
  const [editVacationModalVisible, setEditVacationModalVisible] = useState(false);
  const [cancelVacationModalVisible, setCancelVacationModalVisible] = useState(false);
  const [vacationEditForm] = Form.useForm();
  
  // Overlapping vacations state
  const [selectedRequestForOverlap, setSelectedRequestForOverlap] = useState<any>(null);
  const [overlappingVacationsModalVisible, setOverlappingVacationsModalVisible] = useState(false);
  
  // Debug log
  console.log('Current state - vacationHistoryModalVisible:', vacationHistoryModalVisible, 'selectedUserForVacationHistory:', selectedUserForVacationHistory);
  
  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenuVisible(false);
    };
    
    if (contextMenuVisible) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [contextMenuVisible]);

  const formatSystemRole = (role?: string) => {
    switch (role) {
      case 'SYSTEM_ADMIN':
        return 'מנהל מערכת';
      case 'IT_ADMIN':
        return 'מנהל IT';
      case 'DEPARTMENT_ADMIN':
        return 'מנהל מחלקה';
      case 'DEPARTMENT_USER':
        return 'עובד מחלקה';
      default:
        return role || '';
    }
  };
  
  // Check if user is a department admin
  const isDepartmentAdmin = user?.systemRole === 'DEPARTMENT_ADMIN';
  const isSystemAdmin = user?.systemRole === 'SYSTEM_ADMIN' || user?.systemRole === 'IT_ADMIN';
  const userDepartment = user?.department;
  
  console.log('=== AUTH CONTEXT DEBUG ===');
  console.log('user:', user);
  console.log('user.systemRole:', user?.systemRole);
  console.log('user.department:', user?.department);
  console.log('isDepartmentAdmin:', isDepartmentAdmin);
  console.log('isSystemAdmin:', isSystemAdmin);
  console.log('=========================');

  // Load department configuration
  const { data: configData, loading: configLoading, refetch: refetchConfig, error: configError } = useQuery(
    isDepartmentAdmin ? GET_MY_DEPARTMENT_SHIFT_CONFIG : GET_DEPARTMENT_SHIFT_CONFIG,
    {
      variables: isDepartmentAdmin ? {} : { departmentId: userDepartment },
      // Only run department-specific config query when department is known
      skip: isDepartmentAdmin ? false : !userDepartment,
      onCompleted: (data) => {
        console.log('=== CONFIG QUERY COMPLETED ===');
        console.log('Raw data:', JSON.stringify(data, null, 2));
        console.log('myDepartmentShiftConfig exists:', !!data?.myDepartmentShiftConfig);
        console.log('myDepartmentShiftConfig:', data?.myDepartmentShiftConfig);
        console.log('departmentShiftConfig exists:', !!data?.departmentShiftConfig);
        console.log('departmentShiftConfig:', data?.departmentShiftConfig);
        console.log('=============================');
      },
      onError: (error) => {
        console.error('=== CONFIG QUERY ERROR ===');
        console.error('Error message:', error.message);
        console.error('GraphQL errors:', error.graphQLErrors);
        console.error('Network error:', error.networkError);
        console.error('Full error:', error);
        console.error('=========================');
      }
    }
  );
  
  // Only log once when data changes
  useEffect(() => {
    if (!configLoading) {
      console.log('=== CONFIG QUERY DEBUG ===');
      console.log('configLoading:', configLoading);
      console.log('configError:', configError);
      console.log('configData:', configData);
      console.log('myDepartmentShiftConfig from data:', configData?.myDepartmentShiftConfig);
      console.log('Query being used:', isDepartmentAdmin ? 'GET_MY_DEPARTMENT_SHIFT_CONFIG' : 'GET_DEPARTMENT_SHIFT_CONFIG');
      console.log('Query variables:', isDepartmentAdmin ? {} : { departmentId: userDepartment });
      console.log('Query skip:', isDepartmentAdmin ? false : !userDepartment);
      console.log('=========================');
    }
  }, [configData, configLoading, configError]);
  
  const [updateConfig] = useMutation(UPDATE_DEPARTMENT_SHIFT_CONFIG);
  const { data: departmentsData } = useQuery(GET_DEPARTMENTS);
  
  // Shift Role Template mutations
  const [createShiftRoleTemplate] = useMutation(CREATE_SHIFT_ROLE_TEMPLATE, {
    onCompleted: () => {
      message.success('תבנית נוצרה בהצלחה');
      refetchShiftRoleTemplates();
      setTemplateModalVisible(false);
      templateForm.resetFields();
    },
    onError: (error) => {
      message.error(`שגיאה ביצירת תבנית: ${error.message}`);
    }
  });
  
  const [updateShiftRoleTemplate] = useMutation(UPDATE_SHIFT_ROLE_TEMPLATE, {
    onCompleted: () => {
      message.success('תבנית עודכנה בהצלחה');
      refetchShiftRoleTemplates();
      setTemplateModalVisible(false);
      templateForm.resetFields();
      setEditingTemplate(null);
    },
    onError: (error) => {
      message.error(`שגיאה בעדכון תבנית: ${error.message}`);
    }
  });
  
  const [deleteShiftRoleTemplate] = useMutation(DELETE_SHIFT_ROLE_TEMPLATE, {
    onCompleted: () => {
      message.success('תבנית נמחקה בהצלחה');
      refetchShiftRoleTemplates();
    },
    onError: (error) => {
      message.error(`שגיאה במחיקת תבנית: ${error.message}`);
    }
  });
  
  const [applyShiftRoleTemplate] = useMutation(APPLY_SHIFT_ROLE_TEMPLATE, {
    onCompleted: (data) => {
      message.success(data.applyShiftRoleTemplate.message);
      refetch();
      setApplyTemplateModalVisible(false);
    },
    onError: (error) => {
      message.error(`שגיאה בהחלת תבנית: ${error.message}`);
    }
  });
  
  const departmentConfig: DepartmentShiftConfig = configData?.myDepartmentShiftConfig || configData?.departmentShiftConfig;
  
  // Debug departmentConfig
  useEffect(() => {
    console.log('=== DEPARTMENT CONFIG DEBUG ===');
    console.log('isDepartmentAdmin:', isDepartmentAdmin);
    console.log('userDepartment:', userDepartment);
    console.log('configData:', configData);
    console.log('departmentConfig:', departmentConfig);
    console.log('departmentConfig shiftTypes:', departmentConfig?.shiftTypes);
    console.log('departmentConfig departmentRoles:', departmentConfig?.departmentRoles);
    console.log('==============================');
  }, [departmentConfig, isDepartmentAdmin, userDepartment]);
  
  // Get departments based on user role
  const departments = isDepartmentAdmin && userDepartment ? 
    [userDepartment] : 
    (departmentsData?.departments?.map((dept: any) => dept.name) || []);
  const [derivedDepartments, setDerivedDepartments] = useState<string[]>(departments);
  
  // Use shift types from department configuration, fallback to defaults if not configured
  const defaultShiftTypes = [
    { type: 'morning', label: 'בוקר', color: '#ffd93d', time: '07:00-15:00', defaultStartTime: '07:00', defaultEndTime: '15:00', enabled: true, requiredStaff: 1 },
    { type: 'afternoon', label: 'צהריים', color: '#ff9800', time: '15:00-23:00', defaultStartTime: '15:00', defaultEndTime: '23:00', enabled: true, requiredStaff: 1 },
    { type: 'night', label: 'לילה', color: '#f44336', time: '23:00-07:00', defaultStartTime: '23:00', defaultEndTime: '07:00', enabled: true, requiredStaff: 1 }
  ];
  
  const shiftTypes = departmentConfig?.shiftTypes && departmentConfig.shiftTypes.length > 0
    ? departmentConfig.shiftTypes
        .filter(st => st.enabled) // Only show enabled shift types
        .map(st => ({
          ...st,
          time: `${st.defaultStartTime}-${st.defaultEndTime}`
        }))
    : defaultShiftTypes;
  
  // Debug logging for shift types
  console.log('=== SHIFT TYPES DEBUG ===');
  console.log('departmentConfig:', departmentConfig);
  console.log('departmentConfig?.shiftTypes:', departmentConfig?.shiftTypes);
  console.log('Final shiftTypes used in grid:', shiftTypes);
  console.log('========================');
  
  // Department roles
  const [localDepartmentRoles, setLocalDepartmentRoles] = useState<DepartmentRole[]>([]);
  
  // Update derived departments when departments data changes
  useEffect(() => {
    if (!isDepartmentAdmin && departmentsData?.departments) {
      setDerivedDepartments(departmentsData.departments.map((dept: any) => dept.name));
    }
  }, [departmentsData, isDepartmentAdmin]);
  
  // Load department roles from config if available
  useEffect(() => {
    if (departmentConfig?.departmentRoles && Array.isArray(departmentConfig.departmentRoles)) {
      setLocalDepartmentRoles(departmentConfig.departmentRoles as any);
    } else if (isDepartmentAdmin && userDepartment) {
      // Fallback to localStorage if backend has no roles yet
      const storedRoles = localStorage.getItem(`departmentRoles_${userDepartment}`);
      if (storedRoles) {
        try {
          setLocalDepartmentRoles(JSON.parse(storedRoles));
        } catch (e) {
          console.error('Failed to parse stored department roles:', e);
        }
      }
    }
  }, [departmentConfig, isDepartmentAdmin, userDepartment]);
  
  // Get department roles for display (prefer roles from loaded config; fallback to local state)
  const departmentRoles = (departmentConfig?.departmentRoles && departmentConfig.departmentRoles.length > 0) 
    ? (departmentConfig.departmentRoles as any) 
    : (isDepartmentAdmin ? localDepartmentRoles : null);
  
  // Log when department roles change
  console.log('=== DEPARTMENT ROLES SOURCE ===');
  console.log('Using roles from:', departmentConfig?.departmentRoles ? 'Database Config' : 'Local State');
  console.log('Config roles:', departmentConfig?.departmentRoles);
  console.log('Local roles:', localDepartmentRoles);
  console.log('Final roles:', departmentRoles);
  console.log('==============================');
  
  // Debug logging
  useEffect(() => {
    console.log('=== DEPARTMENT ROLES DEBUG ===');
    console.log('isDepartmentAdmin:', isDepartmentAdmin);
    console.log('userDepartment:', userDepartment);
    console.log('departmentConfig:', departmentConfig);
    console.log('departmentConfig.departmentRoles:', departmentConfig?.departmentRoles);
    console.log('localDepartmentRoles:', localDepartmentRoles);
    console.log('final departmentRoles:', departmentRoles);
    console.log('shiftTypes:', shiftTypes);
    console.log('=============================');
  }, [departmentConfig, departmentRoles, isDepartmentAdmin, userDepartment, localDepartmentRoles, shiftTypes]);

  // Week navigation states - showing 4 specific weeks
  const weekStatus = [
    { offset: -1, label: 'שבוע שעבר', icon: <CheckCircleOutlined /> },
    { offset: 0, label: 'השבוע הנוכחי', icon: <ExclamationCircleOutlined /> },
    { offset: 1, label: 'השבוע הבא', icon: <ClockCircleOutlined /> },
    { offset: 2, label: 'שבועיים קדימה', icon: <CloseCircleOutlined /> }
  ];

  // Left menu items
  const leftMenuItems = [
    { key: 'schedule', icon: <CalendarOutlined />, label: 'לוח משמרות' },
    { key: 'employees', icon: <UserOutlined />, label: 'פרטי עובדים' },
    { key: 'templates', icon: <FileTextOutlined />, label: 'תבניות' },
    ...(isDepartmentAdmin ? [
      { key: 'shiftRoles', icon: <TeamOutlined />, label: 'תפקידי משמרת' },
      ...(departmentConfig?.useTemplateSystem ? [
        { key: 'shiftTemplates', icon: <FileTextOutlined />, label: 'תבניות משמרת' }
      ] : [])
    ] : []),
    { key: 'notifications', icon: <BellOutlined />, label: 'הודעות לאפליקציה' },
    { key: 'requests', icon: <FileSearchOutlined />, label: 'בקשות מיוחדות' },
    { key: 'ezclock', icon: <ClockCircleOutlined />, label: ' שעון נוכחות' },
    { key: 'contact', icon: <PhoneOutlined />, label: 'לחץ כאן ליצירת קשר' }
  ];



  const { data: shiftsData, loading: shiftsLoading, refetch, error: shiftsError } = useQuery(GET_SHIFTS_BY_WEEK, {
    variables: { weekOffset }
  });
  
  // Query data for all visible weeks (for capacity display)
  const { data: weekCapacityData } = useQuery(GET_SHIFTS_BY_WEEK, {
    variables: { weekOffset: baseWeekOffset - 1 },
    skip: weekOffset === baseWeekOffset - 1 // Skip if already queried above
  });
  
  const { data: weekCapacityData2 } = useQuery(GET_SHIFTS_BY_WEEK, {
    variables: { weekOffset: baseWeekOffset },
    skip: weekOffset === baseWeekOffset // Skip if already queried above
  });
  
  const { data: weekCapacityData3 } = useQuery(GET_SHIFTS_BY_WEEK, {
    variables: { weekOffset: baseWeekOffset + 1 },
    skip: weekOffset === baseWeekOffset + 1 // Skip if already queried above
  });
  
  const { data: weekCapacityData4 } = useQuery(GET_SHIFTS_BY_WEEK, {
    variables: { weekOffset: baseWeekOffset + 2 },
    skip: weekOffset === baseWeekOffset + 2 // Skip if already queried above
  });
  
  console.log('=== SHIFTS QUERY DEBUG ===');
  console.log('shiftsLoading:', shiftsLoading);
  console.log('shiftsError:', shiftsError);
  console.log('shiftsData:', shiftsData);
  if (shiftsData?.getShiftsByWeek?.shifts) {
    console.log('All shifts:', shiftsData.getShiftsByWeek.shifts);
    const shiftsWithCustomTimes = shiftsData.getShiftsByWeek.shifts.filter((s: any) => s.startTime || s.endTime);
    console.log('Shifts with custom times:', shiftsWithCustomTimes);
  }
  console.log('=========================');

  // Derive departments for system admins from current week shifts
  useEffect(() => {
    if (!isDepartmentAdmin && isSystemAdmin) {
      const list: string[] = Array.from(
        new Set((shiftsData?.getShiftsByWeek?.shifts || []).map((s: any) => s.department).filter(Boolean))
      );
      if (list.length > 0) {
        setDerivedDepartments(list);
      }
    }
  }, [isDepartmentAdmin, isSystemAdmin, shiftsData]);

  // If admin has no bound department, refetch config using the first derived department
  useEffect(() => {
    if (!isDepartmentAdmin && isSystemAdmin && !userDepartment && derivedDepartments.length > 0) {
      refetchConfig({ departmentId: derivedDepartments[0] });
    }
  }, [isDepartmentAdmin, isSystemAdmin, userDepartment, derivedDepartments, refetchConfig]);

  const { data: templatesData } = useQuery(GET_SHIFT_TEMPLATES);
  const { data: requestsData, refetch: refetchRequests } = useQuery(GET_SPECIAL_REQUESTS, {
    variables: { status: 'pending' }
  });
  
  const { data: allVacationData, refetch: refetchVacations } = useQuery(GET_ALL_VACATION_REQUESTS);
  
  // Shift Role Templates queries
  const { data: shiftRoleTemplatesData, refetch: refetchShiftRoleTemplates } = useQuery(GET_SHIFT_ROLE_TEMPLATES, {
    variables: { departmentId: userDepartment || '' },
    skip: !userDepartment
  });
  
  // Query for user vacation history
  const { data: userVacationHistoryData, loading: userVacationHistoryLoading } = useQuery(GET_USER_VACATION_HISTORY, {
    variables: { userId: selectedUserForVacationHistory?.id },
    skip: !selectedUserForVacationHistory?.id
  });
  
  // Calculate overlapping vacations for selected request
  const overlappingVacations = useMemo(() => {
    if (!selectedRequestForOverlap || !allVacationData?.vacationRequests) {
      return [];
    }
    
    const request = selectedRequestForOverlap;
    const requestStart = new Date(request.startDate);
    const requestEnd = new Date(request.endDate);
    
    return allVacationData.vacationRequests.filter((vacation: any) => {
      // Skip the same request
      if (vacation.id === request.id) return false;
      
      // Only check approved vacations
      if (vacation.status !== 'approved') return false;
      
      const vacationStart = new Date(vacation.startDate);
      const vacationEnd = new Date(vacation.endDate);
      
      // Check if dates overlap
      return (vacationStart <= requestEnd && vacationEnd >= requestStart);
    });
  }, [selectedRequestForOverlap, allVacationData]);
  
  // Add mutations and users query for shift assignment
  const [createShift] = useMutation(CREATE_SHIFT);
  const [assignUser] = useMutation(ASSIGN_USER_TO_SHIFT);
  const [removeUser] = useMutation(REMOVE_USER_FROM_SHIFT);
  const [updateShift] = useMutation(UPDATE_SHIFT);
  const [updateUserRoles] = useMutation(UPDATE_USER_DEPARTMENT_ROLES);
  const [updateVacationRequest] = useMutation(UPDATE_VACATION_REQUEST);
  const [cancelVacationRequest] = useMutation(CANCEL_VACATION_REQUEST);
  const [deleteVacationRequest] = useMutation(DELETE_VACATION_REQUEST);
  const { data: usersData, loading: usersLoading, error: usersError, refetch: refetchUsers } = useQuery(GET_ALL_USERS);
  

  
  // Add new queries and mutations
  const { data: employeesData, refetch: refetchEmployees } = useQuery(GET_EMPLOYEES, {
    variables: { department: isDepartmentAdmin ? userDepartment : undefined }
  });
  const { data: specialDaysData, refetch: refetchSpecialDays } = useQuery(GET_SPECIAL_DAYS);
  
  // Query for availability constraints - get the week start date for the current week
  const currentWeekStart = moment().add(weekOffset, 'weeks').startOf('week').format('YYYY-MM-DD');
  const { data: constraintsData } = useQuery(GET_AVAILABILITY_CONSTRAINTS_FOR_USERS, {
    variables: { weekStartDate: currentWeekStart },
    onCompleted: (data) => {
      // Process constraints data into a map for quick lookup
      const constraintsMap: any = {};
      data?.availabilityConstraints?.forEach((userConstraint: any) => {
        constraintsMap[userConstraint.userId] = userConstraint.constraints;
      });
      setUserConstraints(constraintsMap);
    }
  });

  // const [handleSpecialRequest] = useMutation(HANDLE_SPECIAL_REQUEST); // Removed - not implemented in backend

  const [sendNotification] = useMutation(SEND_NOTIFICATION);
  const [generateReport] = useMutation(GENERATE_SHIFT_REPORT);
  const [updateSpecialDay] = useMutation(UPDATE_SPECIAL_DAYS);
  const [deleteSpecialDay] = useMutation(DELETE_SPECIAL_DAY);
  const [approveVacationRequest] = useMutation(APPROVE_VACATION_REQUEST);
  const [approveShiftSwapRequest] = useMutation(APPROVE_SHIFT_SWAP_REQUEST);

  // Generate week view data
  const generateWeekView = () => {
    const weekStart = moment().add(weekOffset, 'weeks').startOf('week');
    const weekDays = [];
    
    for (let i = 0; i < 7; i++) {
      weekDays.push(moment(weekStart).add(i, 'days'));
    }
    
    return weekDays;
  };

  const weekDays = generateWeekView();

  // Week navigation component - updated with date navigation
  const WeekNavigation = () => {
    const getWeekData = (offset: number) => {
      const actualOffset = baseWeekOffset + offset;
      
      // Get the appropriate data based on which week we're looking at
      let weekData = null;
      if (actualOffset === weekOffset) {
        weekData = shiftsData?.getShiftsByWeek;
      } else if (actualOffset === baseWeekOffset - 1) {
        weekData = weekCapacityData?.getShiftsByWeek;
      } else if (actualOffset === baseWeekOffset) {
        weekData = weekCapacityData2?.getShiftsByWeek;
      } else if (actualOffset === baseWeekOffset + 1) {
        weekData = weekCapacityData3?.getShiftsByWeek;
      } else if (actualOffset === baseWeekOffset + 2) {
        weekData = weekCapacityData4?.getShiftsByWeek;
      }
      
      if (weekData) {
        const percentage = weekData.completionPercentage || 0;
        return {
          percentage,
          status: percentage === 100 ? 'completed' : percentage > 0 ? 'in_progress' : 'not_started'
        };
      }
      
      return { percentage: 0, status: 'not_started' };
    };

    const handleWeekNavigation = (direction: 'prev' | 'next') => {
      if (direction === 'prev') {
        setBaseWeekOffset(baseWeekOffset - 1);
        setWeekOffset(weekOffset - 1);
      } else {
        setBaseWeekOffset(baseWeekOffset + 1);
        setWeekOffset(weekOffset + 1);
      }
    };

    const getWeekDateRange = (offset: number) => {
      const actualOffset = baseWeekOffset + offset;
      const weekStart = moment().add(actualOffset, 'weeks').startOf('week');
      const weekEnd = moment().add(actualOffset, 'weeks').endOf('week');
      return `${weekStart.format('DD/MM')} - ${weekEnd.format('DD/MM')}`;
    };

    const getWeekLabel = (offset: number) => {
      const actualOffset = baseWeekOffset + offset;
      
      // Only show special labels for actual relative weeks
      if (actualOffset === -1) {
        return 'שבוע שעבר';
      } else if (actualOffset === 0) {
        return 'השבוע הנוכחי';
      } else if (actualOffset === 1) {
        return 'השבוע הבא';
      } else if (actualOffset === 2) {
        return 'שבועיים קדימה';
      }
      
      // For all other weeks, just show the date range
      return getWeekDateRange(offset);
    };

    const getWeekIcon = (offset: number) => {
      const actualOffset = baseWeekOffset + offset;
      
      if (actualOffset === -1) {
        return <CheckCircleOutlined />;
      } else if (actualOffset === 0) {
        return <ExclamationCircleOutlined />;
      } else if (actualOffset === 1) {
        return <ClockCircleOutlined />;
      } else if (actualOffset === 2) {
        return <CloseCircleOutlined />;
      }
      
      return <CalendarOutlined />;
    };

    return (
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <Button 
            icon={<LeftOutlined />} 
            onClick={() => handleWeekNavigation('prev')}
            size="large"
          />
          <Title level={4}>לוח משמרות</Title>
          <Button 
            icon={<RightOutlined />} 
            onClick={() => handleWeekNavigation('next')}
            size="large"
          />
        </div>
        <Row gutter={16}>
          {weekStatus.map((week, index) => {
            const data = getWeekData(week.offset);
            const actualOffset = baseWeekOffset + week.offset;
            const isActive = weekOffset === actualOffset;
            const isCurrentWeek = actualOffset === 0;
            const weekLabel = getWeekLabel(week.offset);
            const weekIcon = getWeekIcon(week.offset);
            const showDateRange = actualOffset < -1 || actualOffset > 2;
            
            return (
              <Col span={6} key={week.offset}>
                <Card 
                  className={`cursor-pointer transition-all ${isActive ? 'border-blue-500 shadow-lg' : ''} ${isCurrentWeek ? 'bg-blue-50' : ''}`}
                  onClick={() => setWeekOffset(actualOffset)}
                  styles={{ body: { padding: '16px' } }}
                >
                  <div className="text-center">
                    <div className="mb-2">
                      {weekIcon}
                    </div>
                    <Title level={5} className="mb-2">
                      {!showDateRange ? weekLabel : ''}
                    </Title>
                    <Text type="secondary" className="block mb-2">
                      {getWeekDateRange(week.offset)}
                    </Text>
                    <Progress 
                      percent={data.percentage} 
                      status={data.status === 'completed' ? 'success' : 
                             data.status === 'not_started' ? 'exception' : 'active'}
                      strokeColor={data.status === 'not_started' ? '#ff4d4f' : undefined}
                    />
                    <Text type={data.status === 'not_started' ? 'danger' : 'secondary'}>
                      {data.percentage}%
                    </Text>
                    {isDepartmentAdmin && departmentConfig?.useTemplateSystem && data.percentage === 0 && (
                      <Button
                        type="link"
                        size="small"
                        className="mt-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          const weekStart = moment().add(actualOffset, 'weeks').startOf('week').format('YYYY-MM-DD');
                          setSelectedWeekForTemplate(weekStart);
                          setApplyTemplateModalVisible(true);
                        }}
                      >
                        החל תבניות
                      </Button>
                    )}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
        {baseWeekOffset !== 0 && (
          <div className="text-center mt-4">
            <Button onClick={() => {
              setBaseWeekOffset(0);
              setWeekOffset(0);
            }}>
              חזור לשבוע הנוכחי
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Get all users and department users (moved here to be accessible by modal)
  const allUsers = usersData?.users || employeesData?.employees || [];
  
  // Get display departments
  const displayDepartments = isDepartmentAdmin 
    ? (userDepartment ? [userDepartment] : (departmentConfig?.departmentId ? [departmentConfig.departmentId] : []))
    : (derivedDepartments.length ? derivedDepartments : departments);
    
  // Get users for the current department(s)
  const departmentUsers = allUsers.filter((u: any) => {
    // Check if user has departments array (MongoDB structure)
    if (u.departments && Array.isArray(u.departments)) {
      return u.departments.some((dept: any) => {
        const deptName = dept.departmentName || dept.departmentId;
        
        // Check each display department
        return displayDepartments.some((displayDept: string) => {
          // For MCR department, include Playout and Ingest users
          if (displayDept === 'MCR' || displayDept.startsWith('MCR')) {
            return deptName === 'MCR' || 
                   deptName === 'Playout' || 
                   deptName === 'Ingest' ||
                   (deptName && deptName.startsWith('MCR'));
          }
          // For other departments, exact match
          return deptName === displayDept;
        });
      });
    }
    // Fallback to old structure
    return displayDepartments.includes(u.department);
  });

  // Main shift calendar grid with new UX
  const ShiftCalendarGrid = () => {
    const [assignModalVisible, setAssignModalVisible] = useState(false);
    const [localEditShiftForm] = Form.useForm();
    const [selectedShift, setSelectedShift] = useState<any>(null);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [draggedUser, setDraggedUser] = useState<any>(null);
    const [removeEmployeesModalVisible, setRemoveEmployeesModalVisible] = useState(false);
    const [selectedShiftForRemoval, setSelectedShiftForRemoval] = useState<any>(null);
    const [selectedUsersToRemove, setSelectedUsersToRemove] = useState<string[]>([]);
    
    const handleShiftClick = (shift: any, day: any, shiftType: any, dept: string, role?: any) => {
      // Set the selected shift for assignment
      const dayOfWeek = day.day(); // 0 = Sunday, 1 = Monday, etc.
      const shiftData = {
        ...shift,
        dayOfWeek,
        shiftType: shiftType.type,
        date: day.format('YYYY-MM-DD'),
        department: dept,
        isNew: !shift?.id,
        assignedRole: role?.name || 'worker' // Store the role for this row
      };
      setSelectedShiftForAssignment(shiftData);
      // Also set it for removal if it has assigned workers
      if (shift?.assignedWorkers && shift.assignedWorkers.length > 0) {
        setSelectedShiftForRemoval(shiftData); // Use shiftData instead of shift
      } else {
        setSelectedShiftForRemoval(null); // Clear if no assigned workers
      }
      setSelectedUser(null); // Clear selected user when selecting a shift
    };
    
    const handleShiftRightClick = (e: React.MouseEvent, shift: any, day: any, shiftType: any, dept: string, role?: any) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Only show context menu for assigned shifts
      if (!shift?.id) return;
      
      const shiftData = {
        ...shift,
        shiftType: shiftType.type,
        date: day.format('YYYY-MM-DD'),
        department: dept,
        role: role?.name || 'worker',
        shiftLabel: shiftType.label,
        startTime: shift.startTime || shiftType.defaultStartTime,
        endTime: shift.endTime || shiftType.defaultEndTime
      };
      
      setSelectedShiftForEdit(shiftData);
      setContextMenuPosition({ x: e.clientX, y: e.clientY });
      setContextMenuVisible(true);
    };
    
    const handleEditShift = () => {
      setContextMenuVisible(false);
      if (selectedShiftForEdit) {
        localEditShiftForm.setFieldsValue({
          startTime: dayjs(selectedShiftForEdit.startTime, 'HH:mm'),
          endTime: dayjs(selectedShiftForEdit.endTime, 'HH:mm'),
          employeeId: selectedShiftForEdit.assignedWorkers?.[0]?.userId || null,
          role: selectedShiftForEdit.role
        });
        setEditShiftModalVisible(true);
      }
    };
    
    const handleClearShift = () => {
      setContextMenuVisible(false);
      if (selectedShiftForEdit && selectedShiftForEdit.assignedWorkers?.[0]?.userId) {
        modal.confirm({
          title: 'נקה משמרת',
          content: `האם אתה בטוח שברצונך לנקות את המשמרת של ${selectedShiftForEdit.assignedWorkers[0].displayName}?`,
          okText: 'אישור',
          cancelText: 'ביטול',
          onOk: async () => {
            try {
              await removeUser({
                variables: {
                  shiftId: selectedShiftForEdit.id,
                  userId: selectedShiftForEdit.assignedWorkers[0].userId
                }
              });
              message.success('המשמרת נוקתה בהצלחה');
              refetch();
            } catch (error) {
              console.error('Error clearing shift:', error);
              message.error('שגיאה בניקוי המשמרת');
            }
          }
        });
      }
    };
    
    const contextMenuItems: MenuProps['items'] = [
      {
        key: 'edit',
        label: 'ערוך משמרת',
        icon: <EditOutlined />,
        onClick: handleEditShift
      },
      {
        key: 'clear',
        label: 'נקה משמרת',
        icon: <DeleteOutlined />,
        onClick: handleClearShift
      }
    ];

    const handleUserClick = (user: any) => {
      setSelectedUser(user);
      setSelectedShiftForAssignment(null); // Clear selected shift when selecting a user
    };

    const handleUserDragStart = (e: React.DragEvent, user: any) => {
      setDraggedUser(user);
      e.dataTransfer.effectAllowed = 'move';
    };

    const handleShiftDrop = async (e: React.DragEvent, shift: any, day: any, shiftType: any, dept: string, role?: any) => {
      e.preventDefault();
      if (!draggedUser) return;

      const shiftData = {
        ...shift,
        date: day.format('YYYY-MM-DD'),
        shiftType: shiftType.type,
        department: dept,
        isNew: !shift?.id,
        assignedRole: role?.name || 'worker'
      };

      try {
        if (shiftData.isNew) {
          // Create new shift for the exact target shift type (do not default to first)
          const requiredWorkers = (shiftType.requiredStaff || 1);
          const { data } = await createShift({
            variables: {
              input: {
                date: shiftData.date,
                shiftType: shiftData.shiftType,
                department: shiftData.department,
                requiredWorkers
              }
            }
          });
          
          if (data?.createShift?.id) {
            // Assign user to new shift
            // Use the role from the shift data (which comes from the row clicked)
            const assignedRole = shiftData.assignedRole;
            await assignUser({
              variables: {
                input: {
                  shiftId: data.createShift.id,
                  userId: draggedUser.id,
                  role: assignedRole
                }
              }
            });
          }
        } else {
          // Check if user is already assigned
          const isAlreadyAssigned = shiftData.assignedWorkers?.some((w: any) => w.userId === draggedUser.id) || false;
          if (isAlreadyAssigned) {
            message.warning('העובד כבר משובץ למשמרת זו');
            setDraggedUser(null);
            return;
          }
          // Capacity and availability checks
          const cfg = shiftTypes.find((st: any) => st.type === shiftData.shiftType);
          const maxWorkers = cfg?.requiredStaff || 1;
          const currentCount = shiftData.assignedWorkers?.length || 0;
          if (currentCount >= maxWorkers) {
            message.warning('המשמרת מלאה לפי ההגדרה');
            setDraggedUser(null);
            return;
          }
          const dayOfWeek = day.day();
          const constraintColor = getConstraintColor(draggedUser.id, dayOfWeek, shiftType.type);
          if (constraintColor === '#f5222d') {
            message.error('העובד אינו זמין למשמרת זו');
            setDraggedUser(null);
            return;
          }
          
          // Check if user has the required role for this shift
          if (shiftData.assignedRole && shiftData.assignedRole !== '') {
            const currentDept = userDepartment || departmentConfig?.departmentId;
            const userDept = draggedUser.departments?.find((d: any) => 
              d.departmentId === currentDept || d.departmentName === currentDept
            );
            
            if (!userDept?.roles?.includes(shiftData.assignedRole)) {
              message.error(`העובד אינו מוגדר בתפקיד ${shiftData.assignedRole} הנדרש למשמרת זו`);
              setDraggedUser(null);
              return;
            }
          }
          // Assign new user without removing existing ones
          const assignedRole = shiftData.role || ((departmentRoles && Array.isArray(departmentRoles) && departmentRoles.length > 0)
            ? (departmentRoles[0] as any).name
            : 'worker');
          await assignUser({
            variables: {
              input: {
                shiftId: shiftData.id,
                userId: draggedUser.id,
                role: assignedRole
              }
            }
          });
        }
        
        message.success('העובד נוסף למשמרת בהצלחה');
        refetch();
      } catch (error) {
        message.error('שגיאה בעדכון המשמרת');
      }
      
      setDraggedUser(null);
    };

    const handleShiftDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    };

    const handleUserAssignment = async (userId: string) => {
      if (!selectedShiftForAssignment) {
        message.warning('אנא בחר משמרת תחילה');
        return;
      }
      
      try {
        if (selectedShiftForAssignment.isNew) {
          // Create new shift for the exact selected shift type (do not default to first)
          const requiredWorkers = (shiftTypes.find((st: any) => st.type === selectedShiftForAssignment.shiftType)?.requiredStaff || 1);
          const { data } = await createShift({
            variables: {
              input: {
                date: selectedShiftForAssignment.date,
                shiftType: selectedShiftForAssignment.shiftType,
                department: selectedShiftForAssignment.department,
                requiredWorkers
              }
            }
          });
          
          if (data?.createShift?.id) {
            // Assign user to new shift
            const assignedRole = selectedShiftForAssignment.assignedRole;
            await assignUser({
              variables: {
                input: {
                  shiftId: data.createShift.id,
                  userId: userId,
                  role: assignedRole
                }
              }
            });
          }
        } else {
          // Check if user is already assigned
          const isAlreadyAssigned = selectedShiftForAssignment.assignedWorkers?.some((w: any) => w.userId === userId) || false;
          if (isAlreadyAssigned) {
            message.warning('העובד כבר משובץ למשמרת זו');
            return;
          }
          // Capacity and availability checks
          const cfg = shiftTypes.find((st: any) => st.type === selectedShiftForAssignment.shiftType);
          const maxWorkers = cfg?.requiredStaff || 1;
          const currentCount = selectedShiftForAssignment.assignedWorkers?.length || 0;
          if (currentCount >= maxWorkers) {
            message.warning('המשמרת מלאה לפי ההגדרה');
            return;
          }
          const constraintColor = getConstraintColor(userId, selectedShiftForAssignment.dayOfWeek, selectedShiftForAssignment.shiftType);
          if (constraintColor === '#f5222d') {
            message.error('העובד אינו זמין למשמרת זו');
            return;
          }
          
          // Check if user has the required role for this shift
          if (selectedShiftForAssignment.assignedRole && selectedShiftForAssignment.assignedRole !== '') {
            const user = departmentUsers.find((u: any) => u.id === userId);
            if (user) {
              const currentDept = userDepartment || departmentConfig?.departmentId;
              
              // For MCR department, also check MCR-prefixed departments
              const userDept = user.departments?.find((d: any) => {
                if (d.departmentId === currentDept || d.departmentName === currentDept) {
                  return true;
                }
                // If current department is MCR, also match MCR-prefixed departments
                if (currentDept === 'MCR' && (d.departmentId?.startsWith('MCR-') || d.departmentName?.startsWith('MCR-'))) {
                  return true;
                }
                // If user's department is MCR-prefixed and current is MCR
                if (d.departmentId?.startsWith('MCR-') && currentDept === 'MCR') {
                  return true;
                }
                return false;
              });
              
              if (!userDept?.roles?.includes(selectedShiftForAssignment.assignedRole)) {
                message.error(`העובד אינו מוגדר בתפקיד ${selectedShiftForAssignment.assignedRole} הנדרש למשמרת זו`);
                return;
              }
            }
          }
          // Assign new user without removing existing ones
          const assignedRole = selectedShiftForAssignment.role || ((departmentRoles && Array.isArray(departmentRoles) && departmentRoles.length > 0)
            ? (departmentRoles[0] as any).name
            : 'worker');
          await assignUser({
            variables: {
              input: {
                shiftId: selectedShiftForAssignment.id,
                userId: userId,
                role: assignedRole
              }
            }
          });
        }
        
        message.success('העובד נוסף למשמרת בהצלחה');
        setSelectedShiftForAssignment(null);
        refetch();
      } catch (error) {
        message.error('שגיאה בעדכון המשמרת');
      }
    };

    const handleRemoveEmployees = async () => {
      if (!selectedShiftForRemoval || selectedUsersToRemove.length === 0) {
        message.warning('אנא בחר עובדים להסרה');
        return;
      }

      try {
        for (const userId of selectedUsersToRemove) {
          await removeUser({
            variables: {
              shiftId: selectedShiftForRemoval.id,
              userId: userId
            }
          });
        }
        
        message.success(`${selectedUsersToRemove.length} עובדים הוסרו מהמשמרת בהצלחה`);
        setRemoveEmployeesModalVisible(false);
        setSelectedShiftForRemoval(null);
        setSelectedUsersToRemove([]);
        refetch();
      } catch (error) {
        message.error('שגיאה בהסרת עובדים מהמשמרת');
      }
    };

    // displayDepartments and departmentUsers are now defined outside this component
    
    // Helper to get constraint color for table cells when user is selected
    const getCellConstraintColor = (userId: string, dayOfWeek: number, shiftType: string) => {
      if (!selectedUser || selectedUser.id !== userId) return 'transparent';
      return getConstraintColor(userId, dayOfWeek, shiftType);
    };
    
    return (
      <>
        <Card>
          <div className="flex justify-between items-center mb-4">
            <Title level={4}>לוח משמרות - {departmentConfig?.departmentName || 'כל המחלקות'}</Title>
            <Space>
              <Button 
                icon={<EditOutlined />} 
                onClick={() => setEditingSection('shiftTypes')}
              >
                ערוך סוגי משמרות
              </Button>
              <Button 
                icon={<EditOutlined />} 
                onClick={() => setEditingSection('constraints')}
              >
                ערוך הגבלות
              </Button>
              <Button 
                icon={<SettingOutlined />} 
                onClick={() => setEditingSection('assignmentSettings')}
              >
                הגדרות שיבוצים
              </Button>
            </Space>
          </div>
          
          {/* Users Section - Always Visible */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <Title level={5} className="mb-3">
              עובדי המחלקה {selectedShiftForAssignment && (
                <span className="text-blue-600">
                  - משמרת נבחרת: {selectedShiftForAssignment.date} {
                    selectedShiftForAssignment.shiftType === 'morning' ? 'בוקר' :
                    selectedShiftForAssignment.shiftType === 'afternoon' ? 'צהריים' : 'לילה'
                  }
                  {selectedShiftForAssignment.assignedRole && (
                    <span className="text-orange-600 font-bold">
                      {' '}(תפקיד: {selectedShiftForAssignment.assignedRole})
                    </span>
                  )}
                  {selectedShiftForRemoval && selectedShiftForRemoval.assignedWorkers && selectedShiftForRemoval.assignedWorkers.length > 0 && (
                    <Button 
                      size="small" 
                      danger 
                      className="mr-2 mr-2"
                      style={{ marginRight: '8px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRemoveEmployeesModalVisible(true);
                        setSelectedUsersToRemove([]);
                      }}
                    >
                      הסר עובדים ממשמרת זו
                    </Button>
                  )}
                </span>
              )}
              {selectedUser && (
                <span className="text-green-600">
                  - עובד נבחר: {selectedUser.displayName}
                </span>
              )}
              {isDepartmentAdmin && (
                <Button
                  size="small"
                  type="primary"
                  ghost
                  style={{ marginLeft: '16px' }}
                  onClick={() => setUserRoleModalVisible(true)}
                >
                  ניהול תפקידי עובדים
                </Button>
              )}
            </Title>

            <div className="flex flex-wrap gap-2">
              {departmentUsers
                .filter((user: any) => {
                  // If no shift is selected or no role is assigned to the shift, show all users
                  if (!selectedShiftForAssignment || !selectedShiftForAssignment.assignedRole || selectedShiftForAssignment.assignedRole === '') {
                    return true;
                  }
                  
                  // Get user's roles for the current department
                  const currentDept = userDepartment || departmentConfig?.departmentId;
                  
                  // For MCR department, also check MCR-prefixed departments
                  const userDept = user.departments?.find((d: any) => {
                    if (d.departmentId === currentDept || d.departmentName === currentDept) {
                      return true;
                    }
                    // If current department is MCR, also match MCR-prefixed departments
                    if (currentDept === 'MCR' && (d.departmentId?.startsWith('MCR-') || d.departmentName?.startsWith('MCR-'))) {
                      return true;
                    }
                    // If user's department is MCR-prefixed and current is MCR
                    if (d.departmentId?.startsWith('MCR-') && currentDept === 'MCR') {
                      return true;
                    }
                    return false;
                  });
                  
                  // Check if user has the required role
                  return userDept?.roles?.includes(selectedShiftForAssignment.assignedRole);
                })
                .map((user: any) => {
                let color = '#e0e0e0'; // Default gray
                let constraintText = 'בחר משמרת כדי לראות זמינות או לחץ כדי לראות את כל האילוצים';
                
                if (selectedShiftForAssignment) {
                  color = getConstraintColor(
                    user.id, 
                    selectedShiftForAssignment.dayOfWeek,
                    selectedShiftForAssignment.shiftType
                  );
                  constraintText = getConstraintText(
                    user.id,
                    selectedShiftForAssignment.dayOfWeek,
                    selectedShiftForAssignment.shiftType
                  );
                }
                
                const isSelected = selectedUser?.id === user.id;
                
                return (
                  <Tooltip key={user.id} title={constraintText}>
                    <Button
                      size="large"
                      style={{ 
                        backgroundColor: isSelected ? '#1890ff' : color,
                        borderColor: isSelected ? '#1890ff' : color,
                        color: (color === '#e0e0e0' && !isSelected) ? '#000' : '#fff',
                        fontWeight: 'bold',
                        transition: 'all 0.3s ease',
                        cursor: 'grab'
                      }}
                      onClick={() => handleUserClick(user)}
                      draggable
                      onDragStart={(e) => handleUserDragStart(e, user)}
                    >
                      {user.displayName}
                    </Button>
                  </Tooltip>
                );
              })}
              {(selectedShiftForAssignment || selectedUser) && (
                <Button 
                  size="large"
                  danger
                  onClick={() => {
                    setSelectedShiftForAssignment(null);
                    setSelectedUser(null);
                    setSelectedShiftForRemoval(null);
                  }}
                >
                  ביטול בחירה
                </Button>
              )}
            </div>
            
            {departmentUsers.length === 0 && (
              <div className="text-center text-gray-500 mt-4">
                אין עובדים במחלקה זו. 
                {usersLoading && " טוען..."}
                {usersError && " שגיאה בטעינת עובדים."}
              </div>
            )}
          </div>
          
          <div className="w-full">
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr>
                  <th className="border p-1 bg-gray-50 w-[10%]">
                    {isDepartmentAdmin ? 'תפקיד' : 'מחלקה'}
                  </th>
                  {weekDays.map((day, index) => {
                    const holidays = getJewishHolidaysForDate(day.toDate(), true); // Include Rosh Chodesh
                    const specialDayType = getSpecialDayType(day.toDate());
                    const holidayClass = specialDayType ? `holiday-${specialDayType}` : '';
                    
                    return (
                      <th key={index} className={`border p-1 bg-gray-50 w-[12.85%] ${holidayClass}`}>
                        <div className="text-sm">{day.format('dddd')}</div>
                        <div className="text-xs text-gray-500">{day.format('DD/MM')}</div>
                        {holidays.length > 0 && (
                          <div className="holiday-name">
                            {holidays[0].hebrewName}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shiftTypes.map((shiftType: any) => (
                  
                    <tr key={shiftType.type}>
                      <td className="border p-1 font-medium bg-gray-50 text-sm">
                        <span style={{ color: shiftType.color }}>
                          {shiftType.label}
                        </span>
                      </td>
                      {weekDays.map((day, dayIndex) => (
                        <td key={dayIndex} className="border p-1 align-top min-h-[120px]">
                          <div className="flex flex-col gap-1">
                            {(() => {
                              // Only log for the first cell to avoid spam
                              const currentDepartment = userDepartment || departmentConfig?.departmentId;
                              if (dayIndex === 0) {
                                console.log('=== SHIFT GRID CELL DEBUG (First Cell Only) ===');
                                console.log('Day:', day.format('YYYY-MM-DD'));
                                console.log('Department:', currentDepartment);
                                console.log('departmentRoles exists:', !!departmentRoles);
                                console.log('departmentRoles length:', departmentRoles?.length);
                                console.log('departmentRoles content:', departmentRoles);
                              }
                              
                              // Now we iterate over roles for each shift type
                              const rolesToMap = isDepartmentAdmin 
                                ? (departmentRoles && departmentRoles.length > 0 
                                    ? departmentRoles 
                                    : [{ name: 'עובד', color: '#1890ff', id: 'default-worker' }])
                                : [{ name: '', color: '#1890ff', id: 'default' }];
                                
                              const itemsToMap = rolesToMap.map((role: any) => {
                                const dayShifts = shiftsData?.getShiftsByWeek?.shifts?.filter((s: any) => {
                                  const shiftDate = moment(s.date);
                                  // For MCR department, include Playout and Ingest shifts as well
                                  let departmentMatch = false;
                                  if (currentDepartment === 'MCR' || currentDepartment?.startsWith('MCR')) {
                                    departmentMatch = s.department === 'MCR' || 
                                                     s.department === 'Playout' || 
                                                     s.department === 'Ingest' ||
                                                     (s.department && s.department.startsWith('MCR'));
                                  } else {
                                    departmentMatch = s.department === currentDepartment;
                                  }
                                  
                                  const matchesDateTime = shiftDate.isSame(day, 'day') && 
                                                         departmentMatch && 
                                                         s.shiftType === shiftType.type;
                                  
                                  // Debug logging for edited shifts
                                  if (s.startTime || s.endTime) {
                                    console.log('Shift with custom time:', {
                                      id: s.id,
                                      date: s.date,
                                      shiftType: s.shiftType,
                                      department: s.department,
                                      startTime: s.startTime,
                                      endTime: s.endTime,
                                      matchesDateTime,
                                      dayCheck: shiftDate.isSame(day, 'day'),
                                      deptCheck: departmentMatch,
                                      typeCheck: s.shiftType === shiftType.type
                                    });
                                  }
                                  
                                  // If we have a specific role, filter by that role
                                  if (role.name) {
                                    return matchesDateTime && s.assignedWorkers?.some((w: any) => w.role === role.name);
                                  }
                                  // Otherwise show all shifts for this department/day/shiftType
                                  return matchesDateTime;
                                }) || [];
                                  
                                return { dayShifts, shift: shiftType, currentRole: role };
                              });
                              
                              return itemsToMap.map(({ dayShifts, shift, currentRole }: { dayShifts: any[]; shift: any; currentRole: any }, mapIndex: number) => {
                            
                                const dayOfWeek = day.day();
                                const cellBgColor = selectedUser ? 
                                  getCellConstraintColor(selectedUser.id, dayOfWeek, shift.type) : 
                                  'transparent';
                                

                                
                                // For department roles, always show the slot even if no shifts exist
                                if (dayShifts.length === 0 || (currentRole && dayShifts.length === 0)) {
                                  return (
                                    <div
                                      key={`${shift.type}-${currentRole.id}-${dayIndex}-${mapIndex}`}
                                      className={`p-1 rounded border border-dashed border-gray-300 text-xs cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all ${
                                        selectedShiftForAssignment?.date === day.format('YYYY-MM-DD') && 
                                        selectedShiftForAssignment?.shiftType === shift.type &&
                                        selectedShiftForAssignment?.department === currentDepartment
                                          ? 'border-blue-500 bg-blue-100' 
                                          : ''
                                      }`}
                                      style={{ 
                                        backgroundColor: cellBgColor !== 'transparent' ? cellBgColor : undefined,
                                        opacity: cellBgColor !== 'transparent' ? 0.6 : 1,
                                        border: cellBgColor !== 'transparent' ? `2px solid ${cellBgColor}` : undefined
                                      }}
                                      onClick={() => handleShiftClick(null, day, shift, currentDepartment, currentRole)}
                                      onDrop={(e) => handleShiftDrop(e, null, day, shift, currentDepartment, currentRole)}
                                      onDragOver={handleShiftDragOver}
                                    >
                                      <div className="text-gray-500 text-center text-xs">
                                        <div>{currentRole.name || 'עובד'}</div>
                                      </div>
                                    </div>
                                  );
                                }
                                
                                return dayShifts.map((shiftData: any, idx: number) => (
                                  <div
                                    key={`${shift.type}-${currentRole.id}-${dayIndex}-${mapIndex}-${idx}`}
                                    className={`p-1 rounded text-white text-xs cursor-pointer hover:opacity-80 transition-all ${
                                      selectedShiftForAssignment?.id === shiftData.id
                                        ? 'ring-2 ring-blue-500 ring-opacity-75' 
                                        : ''
                                    }`}
                                    style={{ 
                                      backgroundColor: cellBgColor !== 'transparent' ? cellBgColor : shift.color,
                                      border: cellBgColor !== 'transparent' ? `2px solid ${shift.color}` : 'none'
                                    }}
                                    onClick={() => handleShiftClick(shiftData, day, shift, currentDepartment, currentRole)}
                                    onContextMenu={(e) => handleShiftRightClick(e, shiftData, day, shift, currentDepartment, currentRole)}
                                    onDrop={(e) => handleShiftDrop(e, shiftData, day, shift, currentDepartment, currentRole)}
                                    onDragOver={handleShiftDragOver}
                                  >
                                    <div className="font-semibold text-xs">{currentRole.name || 'עובד'}</div>
                                    {shiftData.assignedWorkers && shiftData.assignedWorkers.length > 0 ? (
                                      shiftData.assignedWorkers.map((worker: any, index: number) => (
                                        <div key={`${worker.userId}-${shift.type}-${dayIndex}-${index}`} className="font-bold text-xs truncate">
                                          {worker.user?.displayName || 'עובד לא ידוע'}
                                        </div>
                                      ))
                                    ) : (
                                      <div className="font-bold text-xs truncate">לא מאויש</div>
                                    )}
                                  </div>
                                ));
                              });
                            })()}
                          </div>
                        </td>
                      ))}
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        
        {/* Context Menu Dropdown */}
        <Dropdown
          menu={{ items: contextMenuItems }}
          open={contextMenuVisible}
          onOpenChange={setContextMenuVisible}
          trigger={['click']}
        >
          <div
            style={{
              position: 'fixed',
              left: contextMenuPosition.x,
              top: contextMenuPosition.y,
              width: 1,
              height: 1,
            }}
          />
        </Dropdown>
        
        {/* Edit Shift Modal */}
        <Modal
          title="ערוך משמרת"
          open={editShiftModalVisible}
          onCancel={() => {
            setEditShiftModalVisible(false);
            editShiftForm.resetFields();
          }}
          onOk={async () => {
            try {
              const values = await localEditShiftForm.validateFields();
              
              // Call the mutation to update the shift
              console.log('Updating shift with data:', {
                id: selectedShiftForEdit.id,
                input: {
                  date: selectedShiftForEdit.date,
                  shiftType: selectedShiftForEdit.shiftType,
                  department: selectedShiftForEdit.department,
                  requiredWorkers: selectedShiftForEdit.requiredWorkers || 1,
                  notes: selectedShiftForEdit.notes || '',
                  startTime: values.startTime.format('HH:mm'),
                  endTime: values.endTime.format('HH:mm')
                }
              });
              
              const result = await updateShift({
                variables: {
                  id: selectedShiftForEdit.id,
                  input: {
                    date: selectedShiftForEdit.date,
                    shiftType: selectedShiftForEdit.shiftType,
                    department: selectedShiftForEdit.department,
                    requiredWorkers: selectedShiftForEdit.requiredWorkers || 1,
                    notes: selectedShiftForEdit.notes || '',
                    startTime: values.startTime.format('HH:mm'),
                    endTime: values.endTime.format('HH:mm')
                  }
                }
              });
              
              console.log('Update result:', result);
              
              message.success('המשמרת עודכנה בהצלחה');
              setEditShiftModalVisible(false);
              localEditShiftForm.resetFields();
              // Refetch shifts data
              await refetch();
              console.log('Refetch completed');
            } catch (error) {
              console.error('Error updating shift:', error);
              message.error('שגיאה בעדכון המשמרת');
            }
          }}
        >
          {selectedShiftForEdit && (
            <Form form={localEditShiftForm} layout="vertical">
              <Form.Item label="תאריך">
                <Input value={selectedShiftForEdit.date} disabled />
              </Form.Item>
              <Form.Item label="סוג משמרת">
                <Input value={selectedShiftForEdit.shiftLabel} disabled />
              </Form.Item>
              <Form.Item
                name="startTime"
                label="שעת התחלה"
                rules={[{ required: true, message: 'נא להזין שעת התחלה' }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="endTime"
                label="שעת סיום"
                rules={[{ required: true, message: 'נא להזין שעת סיום' }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="employeeId"
                label="עובד"
                rules={[{ required: true, message: 'נא לבחור עובד' }]}
              >
                <Select placeholder="בחר עובד">
                  {departmentUsers.map((user: any) => (
                    <Select.Option key={user.id} value={user.id}>
                      {user.displayName}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="role"
                label="תפקיד במשמרת"
              >
                <Select placeholder="בחר תפקיד">
                  <Select.Option value="worker">עובד</Select.Option>
                  {departmentRoles.map((role: any) => (
                    <Select.Option key={role.id} value={role.name}>
                      {role.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Form>
          )}
        </Modal>
        
        {/* Remove Employees Modal */}
        <Modal
          title="הסר עובדים ממשמרת"
          open={removeEmployeesModalVisible}
          onCancel={() => {
            setRemoveEmployeesModalVisible(false);
            setSelectedShiftForRemoval(null);
            setSelectedUsersToRemove([]);
          }}
          footer={[
            <Button 
              key="cancel" 
              onClick={() => {
                setRemoveEmployeesModalVisible(false);
                setSelectedShiftForRemoval(null);
                setSelectedUsersToRemove([]);
              }}
            >
              ביטול
            </Button>,
            <Button 
              key="remove" 
              type="primary" 
              danger
              disabled={selectedUsersToRemove.length === 0}
              onClick={handleRemoveEmployees}
            >
              הסר עובדים נבחרים ({selectedUsersToRemove.length})
            </Button>
          ]}
        >
          {selectedShiftForRemoval && selectedShiftForRemoval.assignedWorkers ? (
            <div>
              <Text strong>בחר עובדים להסרה מהמשמרת:</Text>
              <Checkbox.Group
                style={{ width: '100%', marginTop: 16 }}
                value={selectedUsersToRemove}
                onChange={(checkedValues) => setSelectedUsersToRemove(checkedValues as string[])}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  {selectedShiftForRemoval.assignedWorkers.map((worker: any) => (
                    <Checkbox key={worker.userId} value={worker.userId}>
                      {worker.user?.displayName || 'עובד לא ידוע'}
                    </Checkbox>
                  ))}
                </Space>
              </Checkbox.Group>
            </div>
          ) : (
            <Text>אין עובדים משובצים למשמרת זו</Text>
          )}
        </Modal>
        
        {/* User Role Assignment Modal */}
        <Modal
          title="ניהול תפקידי עובדים"
          open={userRoleModalVisible}
          onCancel={() => {
            setUserRoleModalVisible(false);
            setSelectedUserForRoleAssignment(null);
          }}
          width={800}
          footer={[
            <Button 
              key="close" 
              onClick={() => {
                setUserRoleModalVisible(false);
                setSelectedUserForRoleAssignment(null);
              }}
            >
              סגור
            </Button>
          ]}
        >
          <div>
            <Alert
              message="הקצאת תפקידים לעובדי המחלקה"
              description="בחר תפקידים לכל עובד. רק עובדים עם התפקיד המתאים יוצגו בעת בחירת משמרת לתפקיד זה."
              type="info"
              showIcon
              className="mb-4"
            />
            
            <Table
              dataSource={departmentUsers}
              rowKey="id"
              pagination={false}
              columns={[
                {
                  title: 'שם העובד',
                  dataIndex: 'displayName',
                  key: 'displayName',
                },
                {
                  title: 'תפקידים',
                  key: 'roles',
                  render: (_, user: any) => {
                    const currentDept = userDepartment || departmentConfig?.departmentId;
                    
                    // For MCR department, also check MCR-prefixed departments
                    const userDept = user.departments?.find((d: any) => {
                      if (d.departmentId === currentDept || d.departmentName === currentDept) {
                        return true;
                      }
                      // If current department is MCR, also match MCR-prefixed departments
                      if (currentDept === 'MCR' && (d.departmentId?.startsWith('MCR-') || d.departmentName?.startsWith('MCR-'))) {
                        return true;
                      }
                      // If user's department is MCR-prefixed and current is MCR
                      if (d.departmentId?.startsWith('MCR-') && currentDept === 'MCR') {
                        return true;
                      }
                      return false;
                    });
                    const userRoles = userDept?.roles || [];
                    
                    return (
                      <Select
                        mode="multiple"
                        placeholder="בחר תפקידים"
                        style={{ width: '100%' }}
                        value={userRoles}
                        onChange={async (selectedRoles) => {
                          try {
                            // Update user's departments with new roles
                            const updatedDepartments = user.departments?.map((d: any) => {
                              // Check if this is the department we need to update
                              let shouldUpdate = false;
                              
                              if (d.departmentId === currentDept || d.departmentName === currentDept) {
                                shouldUpdate = true;
                              }
                              // If current department is MCR, also update MCR-prefixed departments
                              else if (currentDept === 'MCR' && (d.departmentId?.startsWith('MCR-') || d.departmentName?.startsWith('MCR-'))) {
                                shouldUpdate = true;
                              }
                              // If user's department is MCR-prefixed and current is MCR
                              else if (d.departmentId?.startsWith('MCR-') && currentDept === 'MCR') {
                                shouldUpdate = true;
                              }
                              
                              if (shouldUpdate) {
                                return {
                                  departmentId: d.departmentId,
                                  departmentName: d.departmentName,
                                  roles: selectedRoles
                                };
                              }
                              
                              // Remove __typename field when returning unchanged departments
                              return {
                                departmentId: d.departmentId,
                                departmentName: d.departmentName,
                                roles: d.roles || []
                              };
                            }) || [{
                              departmentId: currentDept,
                              departmentName: currentDept,
                              roles: selectedRoles
                            }];
                            
                            await updateUserRoles({
                              variables: {
                                userId: user.id,
                                departments: updatedDepartments
                              }
                            });
                            
                            message.success(`תפקידי ${user.displayName} עודכנו בהצלחה`);
                            await refetchUsers();
                          } catch (error) {
                            console.error('Error updating user roles:', error);
                            message.error('שגיאה בעדכון תפקידי העובד');
                          }
                        }}
                      >
                        {departmentRoles?.map((role: any) => (
                          <Select.Option key={role.name} value={role.name}>
                            <span style={{ color: role.color }}>
                              {role.name}
                            </span>
                          </Select.Option>
                        ))}
                      </Select>
                    );
                  }
                }
              ]}
            />
          </div>
        </Modal>
        
        {/* User Vacation History Modal */}
        <Modal
          title={`היסטוריית חופשות - ${selectedUserForVacationHistory?.displayName || ''}`}
          open={vacationHistoryModalVisible}
          onCancel={() => {
            setVacationHistoryModalVisible(false);
            setSelectedUserForVacationHistory(null);
          }}
          width={1000}
          footer={[
            <Button 
              key="close" 
              onClick={() => {
                setVacationHistoryModalVisible(false);
                setSelectedUserForVacationHistory(null);
              }}
            >
              סגור
            </Button>
          ]}
        >
          {userVacationHistoryLoading ? (
            <Spin tip="טוען היסטוריית חופשות..." />
          ) : (
            <Table
              dataSource={userVacationHistoryData?.vacationRequests || []}
              rowKey="id"
              scroll={{ y: 400 }}
              columns={[
                {
                  title: 'תאריכים',
                  key: 'dates',
                  render: (record: any) => (
                    <span>
                      {moment(record.startDate).format('DD/MM/YYYY')} - {moment(record.endDate).format('DD/MM/YYYY')}
                    </span>
                  )
                },
                {
                  title: 'סוג',
                  dataIndex: 'vacationType',
                  key: 'vacationType',
                  render: (type: string) => {
                    const types: Record<string, string> = {
                      annual: 'חופשה שנתית',
                      sick: 'מחלה',
                      personal: 'חופשה אישית',
                      maternity: 'חופשת לידה',
                      other: 'אחר'
                    };
                    return types[type] || type;
                  }
                },
                {
                  title: 'סטטוס',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => {
                    const colors: Record<string, string> = {
                      pending: 'orange',
                      approved: 'green',
                      rejected: 'red',
                      cancelled: 'default'
                    };
                    const labels: Record<string, string> = {
                      pending: 'ממתין',
                      approved: 'אושר',
                      rejected: 'נדחה',
                      cancelled: 'בוטל'
                    };
                    return <Tag color={colors[status]}>{labels[status]}</Tag>;
                  }
                },
                {
                  title: 'סיבה',
                  dataIndex: 'reason',
                  key: 'reason',
                  render: (reason: string) => reason || '-'
                },
                {
                  title: 'הערות מנהל',
                  dataIndex: 'adminNotes',
                  key: 'adminNotes',
                  render: (notes: string) => notes || '-'
                },
                {
                  title: 'תאריך הגשה',
                  dataIndex: 'createdAt',
                  key: 'createdAt',
                  render: (date: string) => moment(date).format('DD/MM/YYYY HH:mm'),
                  sorter: (a: any, b: any) => moment(a.createdAt).unix() - moment(b.createdAt).unix(),
                  defaultSortOrder: 'descend' as const
                }
              ]}
            />
          )}
        </Modal>
      </>
    );
  };

  // Component renderers for different menu items
  const renderContent = () => {
    switch (selectedMenu) {
      case 'schedule':
        return <ShiftCalendarGrid />;
      
      case 'employees':
        return (
          <Card title="פרטי עובדים">

            <Table
              dataSource={employeesData?.employees || []}
              rowKey="id"
              columns={[
                { title: 'שם', dataIndex: 'displayName', key: 'displayName' },
                {
                  title: 'מחלקה',
                  key: 'department',
                  render: (_: any, record: any) => formatSystemRole(record.systemRole) || record.department || ''
                },
                { title: 'טלפון', dataIndex: 'phone', key: 'phone' },
                { title: 'אימייל', dataIndex: 'email', key: 'email' },
                { title: 'סטטוס', dataIndex: 'isActive', key: 'isActive',
                  render: (isActive) => <Tag color={isActive ? 'green' : 'red'}>{isActive ? 'פעיל' : 'לא פעיל'}</Tag>
                }
              ]}
            />
          </Card>
        );
      
      case 'templates':
        return (
          <Card title="תבניות משמרות">
            <Button type="primary" className="mb-4">צור תבנית חדשה</Button>
            <List
              dataSource={templatesData?.getShiftTemplates || []}
              renderItem={(template: ShiftTemplate) => (
                <List.Item
                  actions={[
                    <Button key="edit" size="small">ערוך</Button>,
                    <Switch key="active" defaultChecked={template.isActive} />
                  ]}
                >
                  <List.Item.Meta
                    title={template.name}
                    description={`${template.startTime} - ${template.endTime} | ${template.departments.join(', ')}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        );
      
      case 'requests':
        const requestTabItems = [
          {
            key: 'pending',
            label: <Badge count={requestsData?.getSpecialRequests?.length || 0} offset={[10, 0]}>בקשות ממתינות</Badge>,
            children: (
              <List
                className="mt-4"
                dataSource={requestsData?.getSpecialRequests || []}
              renderItem={(request: SpecialRequest) => (
                <List.Item
                  actions={[
                    <Button 
                      key="approve" 
                      type="primary" 
                      size="small"
                      onClick={async () => {
                        try {
                          if (request.type === 'vacation') {
                            await approveVacationRequest({
                              variables: {
                                input: {
                                  requestId: request.id,
                                  approved: true,
                                  adminNotes: ''
                                }
                              }
                            });
                          } else if (request.type === 'shiftSwap') {
                            await approveShiftSwapRequest({
                              variables: {
                                input: {
                                  requestId: request.id,
                                  approved: true,
                                  adminNotes: ''
                                }
                              }
                            });
                          } else {
                            // TODO: Implement handleSpecialRequest mutation in backend
                            message.error('טיפול בבקשות מיוחדות אחרות עדיין לא מוטמע');
                            return;
                          }
                          message.success('הבקשה אושרה');
                          refetchRequests();
                        } catch (error) {
                          message.error('שגיאה באישור הבקשה');
                        }
                      }}
                    >
                      אשר
                    </Button>,
                    <Button 
                      key="reject" 
                      danger 
                      size="small"
                      onClick={async () => {
                        try {
                          if (request.type === 'vacation') {
                            await approveVacationRequest({
                              variables: {
                                input: {
                                  requestId: request.id,
                                  approved: false,
                                  adminNotes: ''
                                }
                              }
                            });
                          } else if (request.type === 'shiftSwap') {
                            await approveShiftSwapRequest({
                              variables: {
                                input: {
                                  requestId: request.id,
                                  approved: false,
                                  adminNotes: ''
                                }
                              }
                            });
                          } else {
                            // TODO: Implement handleSpecialRequest mutation in backend
                            message.error('טיפול בבקשות מיוחדות אחרות עדיין לא מוטמע');
                            return;
                          }
                          message.success('הבקשה נדחתה');
                          refetchRequests();
                        } catch (error) {
                          message.error('שגיאה בדחיית הבקשה');
                        }
                      }}
                    >
                      דחה
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<UserOutlined />}
                    title={request.user.displayName}
                    description={`${request.type} - ${request.reason}`}
                  />
                  <div>{moment(request.date).format('DD/MM/YYYY')}</div>
                </List.Item>
              )}
            />
            )
          },
          {
            key: 'history',
            label: 'היסטוריית חופשות',
            children: (
              <>
                <div className="mb-4">
                  <Radio.Group defaultValue="all" onChange={(e) => refetchVacations({ status: e.target.value === 'all' ? undefined : e.target.value })}>
                    <Radio.Button value="all">הכל</Radio.Button>
                    <Radio.Button value="approved">אושרו</Radio.Button>
                    <Radio.Button value="rejected">נדחו</Radio.Button>
                    <Radio.Button value="cancelled">בוטלו</Radio.Button>
                  </Radio.Group>
                </div>
                
                <Table
                  dataSource={allVacationData?.vacationRequests || []}
                  rowKey="id"
                  columns={[
                    {
                      title: 'עובד',
                      dataIndex: ['user', 'displayName'],
                      key: 'user',
                      render: (text: string, record: any) => (
                        <a
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Vacation history click event fired');
                            console.log('Record:', record);
                            console.log('User from record:', record.user);
                            console.log('Setting selectedUserForVacationHistory to:', record.user);
                            setSelectedUserForVacationHistory(record.user);
                            console.log('Setting vacationHistoryModalVisible to true');
                            setVacationHistoryModalVisible(true);
                          }}
                          style={{ cursor: 'pointer', color: '#1890ff', textDecoration: 'underline' }}
                        >
                          {text}
                        </a>
                      )
                    },
                    {
                      title: 'מחלקה',
                      dataIndex: ['user', 'department'],
                      key: 'department'
                    },
                    {
                      title: 'תאריכים',
                      key: 'dates',
                      render: (record: any) => (
                        <span>
                          {moment(record.startDate).format('DD/MM/YYYY')} - {moment(record.endDate).format('DD/MM/YYYY')}
                        </span>
                      )
                    },
                    {
                      title: 'סוג',
                      dataIndex: 'vacationType',
                      key: 'vacationType',
                      render: (type: string) => {
                        const types: Record<string, string> = {
                          annual: 'חופשה שנתית',
                          sick: 'מחלה',
                          personal: 'חופשה אישית',
                          maternity: 'חופשת לידה',
                          other: 'אחר'
                        };
                        return types[type] || type;
                      }
                    },
                    {
                      title: 'סטטוס',
                      dataIndex: 'status',
                      key: 'status',
                      render: (status: string) => {
                        const colors: Record<string, string> = {
                          pending: 'orange',
                          approved: 'green',
                          rejected: 'red',
                          cancelled: 'default'
                        };
                        const labels: Record<string, string> = {
                          pending: 'ממתין',
                          approved: 'אושר',
                          rejected: 'נדחה',
                          cancelled: 'בוטל'
                        };
                        return <Tag color={colors[status]}>{labels[status]}</Tag>;
                      }
                    },
                    {
                      title: 'הערות',
                      dataIndex: 'adminNotes',
                      key: 'adminNotes',
                      render: (notes: string) => notes || '-'
                    },
                    {
                      title: 'תאריך הגשה',
                      dataIndex: 'createdAt',
                      key: 'createdAt',
                      render: (date: string) => moment(date).format('DD/MM/YYYY HH:mm'),
                      sorter: (a: any, b: any) => moment(a.createdAt).unix() - moment(b.createdAt).unix(),
                      defaultSortOrder: 'descend' as const
                    },
                    {
                      title: 'טופל על ידי',
                      dataIndex: 'approvedBy',
                      key: 'approvedBy',
                      render: (id: string) => id ? 'מנהל' : '-'
                    }
                  ]}
                  pagination={{
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total) => `סה"כ ${total} בקשות`
                  }}
                />
              </>
            )
          }
        ];

        return (
          <Card title="ניהול חופשות ובקשות">
            <Tabs defaultActiveKey="pending" items={requestTabItems} />
          </Card>
        );
      
      case 'notifications':
        return (
          <Card title="הודעות לאפליקציה" 
            extra={
              <Button 
                icon={<EditOutlined />} 
                onClick={() => setEditingSection('notifications')}
              >
                ערוך הגדרות
              </Button>
            }
          >
            <List>
              <List.Item>
                <Space className="w-full justify-between">
                  <Text>שלח תזכורות משמרת</Text>
                  <Tag color={departmentConfig?.notifications?.sendShiftReminders ? 'green' : 'red'}>
                    {departmentConfig?.notifications?.sendShiftReminders ? 'פעיל' : 'כבוי'}
                  </Tag>
                </Space>
              </List.Item>
              {departmentConfig?.notifications?.sendShiftReminders && (
                <List.Item>
                  <Text>תזכורת {departmentConfig?.notifications?.reminderHoursBefore || 24} שעות לפני</Text>
                </List.Item>
              )}
              <List.Item>
                <Space className="w-full justify-between">
                  <Text>שלח בקשות החלפה</Text>
                  <Tag color={departmentConfig?.notifications?.sendSwapRequests ? 'green' : 'red'}>
                    {departmentConfig?.notifications?.sendSwapRequests ? 'פעיל' : 'כבוי'}
                  </Tag>
                </Space>
              </List.Item>
              <List.Item>
                <Space className="w-full justify-between">
                  <Text>שלח עדכוני לוח זמנים</Text>
                  <Tag color={departmentConfig?.notifications?.sendScheduleUpdates ? 'green' : 'red'}>
                    {departmentConfig?.notifications?.sendScheduleUpdates ? 'פעיל' : 'כבוי'}
                  </Tag>
                </Space>
              </List.Item>
            </List>
            <Divider />
            <Button 
              type="primary" 
              icon={<BellOutlined />} 
              block
              onClick={() => {
                notificationForm.resetFields();
                setNotificationModalVisible(true);
              }}
            >
              שלח הודעה חדשה
            </Button>
          </Card>
        );
      
      case 'ezclock':
        return (
          <Card title="EZClock - שעון נוכחות">
            <Alert
              message="מערכת שעון נוכחות"
              description="ניהול נוכחות עובדים ודיווחי שעות"
              type="info"
              showIcon
              className="mb-4"
            />
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="עובדים נוכחים" value={0} prefix={<UserOutlined />} />
              </Col>
              <Col span={8}>
                <Statistic title="משמרת נוכחית" value={(() => {
                  const hour = new Date().getHours();
                  if (hour >= 6 && hour < 14) return 'בוקר';
                  if (hour >= 14 && hour < 22) return 'צהריים/ערב';
                  return 'לילה';
                })()} />
              </Col>
              <Col span={8}>
                <Statistic title="שעות החודש" value={0} />
              </Col>
            </Row>
          </Card>
        );
      
      case 'shiftRoles':
        return isDepartmentAdmin ? (
          <Card 
            title={`תפקידי משמרת - ${userDepartment}`}
            extra={
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={() => {
                  // Auto-number new roles to avoid duplicate keys
                  const existingNewRoles = localDepartmentRoles.filter(r => r.name.startsWith('תפקיד חדש'));
                  const nextNumber = existingNewRoles.length > 0 ? existingNewRoles.length + 1 : 1;
                  const newRole: DepartmentRole = {
                    id: Date.now().toString(),
                    name: nextNumber === 1 ? 'תפקיד חדש' : `תפקיד חדש ${nextNumber}`,
                    description: '',
                    color: '#1890ff',
                    priority: (localDepartmentRoles.length || 0) + 1
                  };
                  
                  const updatedRoles = [...localDepartmentRoles, newRole];
                  setLocalDepartmentRoles(updatedRoles);
                  
                  // Save to localStorage
                  localStorage.setItem(`departmentRoles_${userDepartment}`, JSON.stringify(updatedRoles));
                  
                  console.log('=== ROLE CREATED DEBUG ===');
                  console.log('New role:', newRole);
                  console.log('Updated roles:', updatedRoles);
                  console.log('Saved to localStorage key:', `departmentRoles_${userDepartment}`);
                  console.log('=========================');
                  
                  message.success('תפקיד חדש נוסף בהצלחה. לחץ על "שמור" כדי לשמור את השינויים במערכת.');
                }}
              >
                הוסף תפקיד
              </Button>
            }
          >
            <Alert 
              message="ניהול תפקידי משמרת למחלקה"
              description="תפקידים אלו יופיעו בשורות הטבלה. סוגי המשמרות (בוקר/צהריים/לילה או מותאם אישית) יופיעו בתוך כל יום."
              type="info"
              className="mb-4"
            />
            <List
              dataSource={localDepartmentRoles}
              locale={{ emptyText: 'אין תפקידי משמרת מוגדרים עדיין' }}
              renderItem={(role: DepartmentRole) => (
                <List.Item
                  actions={[
                    <ColorPicker
                      key="color"
                      value={role.color}
                      onChange={(color) => {
                        const updatedRoles = localDepartmentRoles.map(r => 
                          r.id === role.id ? { ...r, color: color.toHexString() } : r
                        );
                        setLocalDepartmentRoles(updatedRoles);
                      }}
                    />,
                    <Button 
                      key="delete" 
                      danger 
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => {
                         const updatedRoles = localDepartmentRoles.filter(r => r.id !== role.id);
                         setLocalDepartmentRoles(updatedRoles);
                        message.success('תפקיד נמחק בהצלחה');
                      }}
                    />
                  ]}
                >
                  <List.Item.Meta 
                    title={
                      <Input
                        value={role.name}
                        onChange={(e) => {
                          const updatedRoles = localDepartmentRoles.map(r => 
                            r.id === role.id ? { ...r, name: e.target.value } : r
                          );
                           setLocalDepartmentRoles(updatedRoles);
                        }}
                        placeholder="שם התפקיד"
                      />
                    }
                    description={
                      <Input
                        placeholder="תיאור התפקיד"
                        value={role.description}
                        onChange={(e) => {
                          const updatedRoles = localDepartmentRoles.map(r => 
                            r.id === role.id ? { ...r, description: e.target.value } : r
                          );
                           setLocalDepartmentRoles(updatedRoles);
                        }}
                      />
                    }
                  />
                </List.Item>
              )}
            />
            <Divider />
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={async () => {
                try {
                  const variables = {
                    departmentId: departmentConfig?.departmentId || userDepartment,
                    input: cleanGraphQLInput({
                      departmentId: departmentConfig?.departmentId || userDepartment,
                      departmentName: departmentConfig?.departmentName || userDepartment,
                      departmentRoles: localDepartmentRoles.map((r: any) => ({
                        id: r.id,
                        name: r.name,
                        description: r.description || '',
                        color: r.color,
                        priority: r.priority
                      })),
                      // Preserve existing shift types when saving department roles
                      shiftTypes: (departmentConfig?.shiftTypes && departmentConfig.shiftTypes.length > 0 
                        ? departmentConfig.shiftTypes 
                        : defaultShiftTypes
                      ).map((st: any) => ({
                        type: st.type,
                        label: st.label,
                        color: st.color,
                        defaultStartTime: st.defaultStartTime,
                        defaultEndTime: st.defaultEndTime,
                        enabled: st.enabled,
                        requiredStaff: st.requiredStaff
                      })),
                      // Include all other fields to prevent them from being cleared
                      constraints: departmentConfig?.constraints || {
                        minRestBetweenShifts: 8,
                        maxConsecutiveDays: 5,
                        maxShiftsPerWeek: 5,
                        maxNightShiftsPerWeek: 2,
                        requireApprovalForSwaps: true,
                        autoAssignEnabled: false,
                        allowOvertime: false,
                        overtimeThresholdHours: 40
                      },
                      notifications: departmentConfig?.notifications || {
                        sendShiftReminders: true,
                        reminderHoursBefore: 24,
                        sendSwapRequests: true,
                        sendScheduleUpdates: true
                      },
                      weeklyPatterns: departmentConfig?.weeklyPatterns || []
                    })
                  };
                  
                  console.log('=== SAVING ROLES TO BACKEND ===');
                  console.log('Variables:', variables);
                  console.log('Local roles being saved:', localDepartmentRoles);
                  console.log('==============================');
                  
                  const result = await updateConfig({ variables });
                  
                  console.log('=== SAVE RESULT ===');
                  console.log('Result:', result);
                  console.log('===================');
                  
                  message.success('תפקידי המחלקה נשמרו בהצלחה');
                  refetchConfig();
                } catch (e) {
                  console.error('=== SAVE ERROR ===');
                  console.error('Error:', e);
                  console.error('==================');
                  message.error('שמירת תפקידי המחלקה נכשלה');
                }
              }}
            >
              שמור תפקידים
            </Button>
          </Card>
        ) : null;
      
      case 'shiftTemplates':
        return isDepartmentAdmin && departmentConfig?.useTemplateSystem ? (
          <Card 
            title={`תבניות משמרת - ${userDepartment}`}
            extra={
              <Space>
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditingTemplate(null);
                    templateForm.resetFields();
                    setTemplateModalVisible(true);
                  }}
                >
                  הוסף תבנית
                </Button>
              </Space>
            }
          >
            <Alert 
              message="ניהול תבניות משמרת למחלקה"
              description="צור תבניות לשילוב סוגי משמרות עם תפקידים. לדוגמה: יום ראשון בוקר - 2 MCR, 1 Ingest, 2 Playout"
              type="info"
              className="mb-4"
            />
            <List
              dataSource={shiftRoleTemplatesData?.shiftRoleTemplates || []}
              loading={!shiftRoleTemplatesData}
              locale={{ emptyText: 'אין תבניות משמרת מוגדרות עדיין' }}
              renderItem={(template: ShiftRoleTemplate) => {
                const dayName = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][template.dayOfWeek];
                const shiftTypeConfig = shiftTypes.find(st => st.type === template.shiftType);
                const totalWorkers = template.roleAssignments.reduce((sum, ra) => sum + ra.count, 0);
                
                return (
                  <List.Item
                    actions={[
                      <Button 
                        key="edit" 
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => {
                          setEditingTemplate(template);
                          templateForm.setFieldsValue({
                            name: template.name,
                            dayOfWeek: template.dayOfWeek,
                            shiftType: template.shiftType,
                            roleAssignments: template.roleAssignments
                          });
                          setTemplateModalVisible(true);
                        }}
                      >
                        ערוך
                      </Button>,
                      <Switch 
                        key="active" 
                        checked={template.isActive}
                        onChange={async (checked) => {
                          try {
                            await updateShiftRoleTemplate({
                              variables: {
                                id: template.id,
                                input: cleanGraphQLInput({
                                  name: template.name,
                                  departmentId: template.departmentId,
                                  dayOfWeek: template.dayOfWeek,
                                  shiftType: template.shiftType,
                                  roleAssignments: template.roleAssignments,
                                  isActive: checked
                                })
                              }
                            });
                          } catch (error) {
                            console.error('Error updating template:', error);
                          }
                        }}
                      />,
                      <Button 
                        key="delete" 
                        size="small" 
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          modal.confirm({
                            title: 'מחיקת תבנית',
                            content: `האם אתה בטוח שברצונך למחוק את התבנית "${template.name}"?`,
                            okText: 'מחק',
                            cancelText: 'ביטול',
                            onOk: async () => {
                              await deleteShiftRoleTemplate({
                                variables: { id: template.id }
                              });
                            }
                          });
                        }}
                      >
                        מחק
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          {template.name}
                          <Tag color={shiftTypeConfig?.color}>
                            {dayName} - {shiftTypeConfig?.label}
                          </Tag>
                          <Tag color="blue">{totalWorkers} עובדים</Tag>
                        </Space>
                      }
                      description={
                        <Space wrap>
                          {template.roleAssignments.map((ra, index) => (
                            <Tag key={index} color="green">
                              {ra.count} × {ra.roleName}
                            </Tag>
                          ))}
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </Card>
        ) : isDepartmentAdmin ? (
          <Card title={`תבניות משמרת - ${userDepartment}`}>
            <Alert
              message="מערכת התבניות אינה מופעלת"
              description="מערכת התבניות המתקדמת אינה מופעלת עבור המחלקה שלך. פנה למנהל המערכת להפעלת התכונה."
              type="warning"
              showIcon
            />
          </Card>
        ) : null;
      
      case 'contact':
        return (
          <Card title="יצירת קשר">
            <div className="text-center py-8">
              <PhoneOutlined className="text-4xl text-blue-500 mb-4" />
              <Title level={3}>לתמיכה טכנית</Title>
              <Text>טלפון: [PHONE REDACTED]</Text>
              <br />
              <Text>אימייל: support@idanmagor.com</Text>
            </div>
          </Card>
        );
      
      default:
        return null;
    }
  };

  // Shift Types Configuration Modal
  const ShiftTypesConfigModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    // Initialize with department config shift types, or default shift types if empty
    const initialShiftTypes = departmentConfig?.shiftTypes && departmentConfig.shiftTypes.length > 0 
      ? departmentConfig.shiftTypes 
      : defaultShiftTypes;
    const [shiftTypesConfig, setShiftTypesConfig] = useState(initialShiftTypes);
    
    useEffect(() => {
      if (departmentConfig?.shiftTypes && departmentConfig.shiftTypes.length > 0) {
        setShiftTypesConfig(departmentConfig.shiftTypes);
      } else if (departmentConfig?.shiftTypes && departmentConfig.shiftTypes.length === 0) {
        // If config exists but shift types are empty, use default shift types
        setShiftTypesConfig(defaultShiftTypes);
      }
    }, [departmentConfig]);

    const handleAddShiftType = () => {
      const newShiftType = {
        type: `shift_${Date.now()}`, // Unique ID
        label: 'משמרת חדשה',
        color: '#1890ff',
        defaultStartTime: '09:00',
        defaultEndTime: '17:00',
        enabled: true,
        requiredStaff: 1
      };
      setShiftTypesConfig([...shiftTypesConfig, newShiftType]);
    };

    const handleRemoveShiftType = (index: number) => {
      const newConfig = shiftTypesConfig.filter((_, i) => i !== index);
      setShiftTypesConfig(newConfig);
    };

    const handleSave = async () => {
      try {
        console.log('=== SHIFT TYPES MODAL SAVE ===');
        console.log('shiftTypesConfig to save:', shiftTypesConfig);
        console.log('departmentConfig?.departmentRoles:', departmentConfig?.departmentRoles);
        console.log('==============================');
        
        await updateConfig({
          variables: {
            departmentId: departmentConfig?.departmentId || userDepartment,
            input: cleanGraphQLInput({
              departmentId: departmentConfig?.departmentId || userDepartment,
              departmentName: departmentConfig?.departmentName || userDepartment,
              shiftTypes: shiftTypesConfig.map((st: any) => ({
                type: st.type,
                label: st.label,
                color: st.color,
                defaultStartTime: st.defaultStartTime,
                defaultEndTime: st.defaultEndTime,
                enabled: st.enabled,
                requiredStaff: st.requiredStaff
              })),
              // Preserve existing department roles when saving shift types - clean __typename
              departmentRoles: (departmentConfig?.departmentRoles || []).map((role: any) => ({
                id: role.id,
                name: role.name,
                description: role.description || '',
                color: role.color,
                priority: role.priority
              })),
              // Include all other fields to prevent them from being cleared
              weeklyPatterns: departmentConfig?.weeklyPatterns || [],
              constraints: departmentConfig?.constraints ? {
                minRestBetweenShifts: departmentConfig.constraints.minRestBetweenShifts,
                maxConsecutiveDays: departmentConfig.constraints.maxConsecutiveDays,
                maxShiftsPerWeek: departmentConfig.constraints.maxShiftsPerWeek,
                maxNightShiftsPerWeek: departmentConfig.constraints.maxNightShiftsPerWeek,
                requireApprovalForSwaps: departmentConfig.constraints.requireApprovalForSwaps,
                autoAssignEnabled: departmentConfig.constraints.autoAssignEnabled,
                allowOvertime: departmentConfig.constraints.allowOvertime,
                overtimeThresholdHours: departmentConfig.constraints.overtimeThresholdHours
              } : {
                minRestBetweenShifts: 8,
                maxConsecutiveDays: 5,
                maxShiftsPerWeek: 5,
                maxNightShiftsPerWeek: 2,
                requireApprovalForSwaps: true,
                autoAssignEnabled: false,
                allowOvertime: false,
                overtimeThresholdHours: 40
              },
              notifications: departmentConfig?.notifications ? {
                sendShiftReminders: departmentConfig.notifications.sendShiftReminders,
                reminderHoursBefore: departmentConfig.notifications.reminderHoursBefore,
                sendSwapRequests: departmentConfig.notifications.sendSwapRequests,
                sendScheduleUpdates: departmentConfig.notifications.sendScheduleUpdates
              } : {
                sendShiftReminders: true,
                reminderHoursBefore: 24,
                sendSwapRequests: true,
                sendScheduleUpdates: true
              }
            })
          }
        });
        message.success('הגדרות המשמרות עודכנו בהצלחה');
        await refetchConfig();
        // Also refetch shifts data to update the grid
        if (refetch) {
          await refetch();
        }
        onClose();
      } catch (error) {
        message.error('שגיאה בעדכון הגדרות המשמרות');
      }
    };
    
    return (
      <Modal
        title="הגדרת סוגי משמרות"
        open={visible}
        onCancel={onClose}
        width={900}
        footer={[
          <Button key="cancel" onClick={onClose}>ביטול</Button>,
          <Button key="save" type="primary" onClick={handleSave} icon={<SaveOutlined />}>שמור</Button>
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <Button 
            type="dashed" 
            onClick={handleAddShiftType} 
            icon={<PlusOutlined />}
            block
          >
            הוסף סוג משמרת חדש
          </Button>
        </div>
        <List
          dataSource={shiftTypesConfig}
          renderItem={(shift, index) => (
            <List.Item
              actions={[
                <Button 
                  type="text" 
                  danger 
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveShiftType(index)}
                >
                  הסר
                </Button>
              ]}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space wrap>
                  <Space>
                    <span>שם:</span>
                    <Input 
                      value={shift.label} 
                      onChange={(e) => {
                        const newConfig = shiftTypesConfig.map((item, i) => 
                          i === index 
                            ? { ...item, label: e.target.value }
                            : item
                        );
                        setShiftTypesConfig(newConfig);
                      }}
                    />
                  </Space>
                  <Space>
                    <span>צבע:</span>
                    <ColorPicker 
                      value={shift.color}
                      onChange={(color) => {
                        const newConfig = shiftTypesConfig.map((item, i) => 
                          i === index 
                            ? { ...item, color: color.toHexString() }
                            : item
                        );
                        setShiftTypesConfig(newConfig);
                      }}
                    />
                  </Space>
                  <Space>
                    <span>שעת התחלה:</span>
                    <TimePicker 
                      format="HH:mm" 
                      value={dayjs(shift.defaultStartTime, 'HH:mm')}
                      onChange={(time) => {
                        const newConfig = shiftTypesConfig.map((item, i) => 
                          i === index 
                            ? { ...item, defaultStartTime: time?.format('HH:mm') || '' }
                            : item
                        );
                        setShiftTypesConfig(newConfig);
                      }}
                    />
                  </Space>
                  <Space>
                    <span>שעת סיום:</span>
                    <TimePicker 
                      format="HH:mm" 
                      value={dayjs(shift.defaultEndTime, 'HH:mm')}
                      onChange={(time) => {
                        const newConfig = shiftTypesConfig.map((item, i) => 
                          i === index 
                            ? { ...item, defaultEndTime: time?.format('HH:mm') || '' }
                            : item
                        );
                        setShiftTypesConfig(newConfig);
                      }}
                    />
                  </Space>
                  <Space>
                    <span>עובדים נדרשים:</span>
                    <InputNumber 
                      min={1} 
                      value={shift.requiredStaff}
                      onChange={(value) => {
                        const newConfig = shiftTypesConfig.map((item, i) => 
                          i === index 
                            ? { ...item, requiredStaff: value || 1 }
                            : item
                        );
                        setShiftTypesConfig(newConfig);
                      }}
                    />
                  </Space>
                  <Space>
                    <span>פעיל:</span>
                    <Switch 
                      checked={shift.enabled}
                      onChange={(checked) => {
                        const newConfig = shiftTypesConfig.map((item, i) => 
                          i === index 
                            ? { ...item, enabled: checked }
                            : item
                        );
                        setShiftTypesConfig(newConfig);
                      }}
                    />
                  </Space>
                </Space>
              </Space>
            </List.Item>
          )}
        />
      </Modal>
    );
  };
  
  // Notification Settings Modal
  const NotificationSettingsModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const [form] = Form.useForm();
    
    useEffect(() => {
      if (departmentConfig?.notifications) {
        form.setFieldsValue(departmentConfig.notifications);
      }
    }, [departmentConfig, form]);
    
    const handleSave = async () => {
      try {
        const values = await form.validateFields();
        await updateConfig({
          variables: {
            departmentId: departmentConfig?.departmentId || userDepartment,
            input: cleanGraphQLInput({
              departmentId: departmentConfig?.departmentId || userDepartment,
              departmentName: departmentConfig?.departmentName || userDepartment,
              notifications: values,
              // Preserve other fields
              shiftTypes: departmentConfig?.shiftTypes || [],
              departmentRoles: departmentConfig?.departmentRoles || [],
              constraints: departmentConfig?.constraints || {},
              weeklyPatterns: departmentConfig?.weeklyPatterns || []
            })
          }
        });
        message.success('הגדרות התראות עודכנו בהצלחה');
        refetchConfig();
        onClose();
      } catch (error) {
        message.error('שגיאה בעדכון הגדרות התראות');
      }
    };
    
    return (
      <Modal
        title="הגדרת התראות"
        open={visible}
        onCancel={onClose}
        footer={[
          <Button key="cancel" onClick={onClose}>ביטול</Button>,
          <Button key="save" type="primary" onClick={handleSave} icon={<SaveOutlined />}>שמור</Button>
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="sendShiftReminders" label="שלח תזכורות משמרת" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="reminderHoursBefore" label="שעות לפני המשמרת לתזכורת">
            <InputNumber min={1} max={48} />
          </Form.Item>
          <Form.Item name="sendSwapRequests" label="שלח בקשות החלפה" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="sendScheduleUpdates" label="שלח עדכוני לוח זמנים" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    );
  };

  // Constraints Configuration Modal
  const ConstraintsConfigModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const [form] = Form.useForm();
    
    useEffect(() => {
      if (departmentConfig?.constraints) {
        form.setFieldsValue(departmentConfig.constraints);
      }
      
      // Load constraint laws from localStorage
      const deptId = departmentConfig?.departmentId || userDepartment;
      if (deptId) {
        const storedLaws = localStorage.getItem(`constraintLaws_${deptId}`);
        if (storedLaws) {
          try {
            const laws = JSON.parse(storedLaws);
            form.setFieldsValue({
              enableConstraintLaws: laws.enabled,
              constraintLaws_type1: laws.type1 || [],
              constraintLaws_type2: laws.type2 || [],
              constraintLaws_type3: laws.type3 || [],
              constraintLaws_type4: laws.type4 || [],
              constraintLaws_type5: laws.type5 || []
            });
          } catch (e) {
            console.error('Failed to parse stored constraint laws:', e);
          }
        }
      }
    }, [departmentConfig, form, userDepartment]);
    
    const handleSave = async () => {
      try {
        const values = await form.validateFields();
        
        // Separate constraint laws from regular constraints
        const {
          enableConstraintLaws,
          constraintLaws_type1,
          constraintLaws_type2,
          constraintLaws_type3,
          constraintLaws_type4,
          constraintLaws_type5,
          ...regularConstraints
        } = values;
        
        // Store constraint laws in a separate field for now
        const constraintLaws = enableConstraintLaws ? {
          enabled: true,
          type1: constraintLaws_type1 || [],
          type2: constraintLaws_type2 || [],
          type3: constraintLaws_type3 || [],
          type4: constraintLaws_type4 || [],
          type5: constraintLaws_type5 || []
        } : null;
        
        await updateConfig({
          variables: {
            departmentId: departmentConfig?.departmentId || userDepartment,
            input: cleanGraphQLInput({
              departmentId: departmentConfig?.departmentId || userDepartment,
              departmentName: departmentConfig?.departmentName || userDepartment,
              constraints: regularConstraints,
              // TODO: Add constraintLaws to backend schema
              // constraintLaws: constraintLaws
              // Preserve other fields
              shiftTypes: departmentConfig?.shiftTypes || [],
              departmentRoles: departmentConfig?.departmentRoles || [],
              notifications: departmentConfig?.notifications || {},
              weeklyPatterns: departmentConfig?.weeklyPatterns || []
            })
          }
        });
        
        // Store constraint laws in localStorage for now
        if (constraintLaws) {
          const deptId = departmentConfig?.departmentId || userDepartment;
          localStorage.setItem(`constraintLaws_${deptId}`, JSON.stringify(constraintLaws));
        }
        
        message.success('הגבלות עודכנו בהצלחה');
        refetchConfig();
        onClose();
      } catch (error) {
        message.error('שגיאה בעדכון ההגבלות');
      }
    };
    
    return (
      <Modal
        title="הגדרת הגבלות"
        open={visible}
        onCancel={onClose}
        footer={[
          <Button key="cancel" onClick={onClose}>ביטול</Button>,
          <Button key="save" type="primary" onClick={handleSave} icon={<SaveOutlined />}>שמור</Button>
        ]}
      >
        <Form form={form} layout="vertical">
          <Divider>חוקי הגבלות</Divider>
          
          <Form.Item name="enableConstraintLaws" valuePropName="checked">
            <Switch checkedChildren="חוקי הגבלות פעילים" unCheckedChildren="חוקי הגבלות כבויים" />
          </Form.Item>

          <Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.enableConstraintLaws !== currentValues.enableConstraintLaws}>
            {({ getFieldValue }) => {
              const isEnabled = getFieldValue('enableConstraintLaws');
              return isEnabled ? (
                <>
                  {/* Law Type 1: Not more than X constraints of type Y */}
                  <Divider orientation="left" className="text-sm">לא יותר מ-[X] הגבלות מסוג [Y]</Divider>
                  <Form.List name="constraintLaws_type1">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map(({ key, name, ...restField }) => (
                          <Space key={key} align="baseline" className="flex w-full mb-2">
                            <Form.Item name={[name, 'amount']} {...restField} noStyle>
                              <InputNumber min={1} max={10} placeholder="כמות" className="w-20" />
                            </Form.Item>
                            <span>הגבלות מסוג</span>
                            <Form.Item name={[name, 'constraintType']} {...restField} noStyle>
                              <Select placeholder="סוג הגבלה" className="w-32">
                                <Select.Option value="unavailable">לא זמין</Select.Option>
                                <Select.Option value="prefer_not">מעדיף שלא</Select.Option>
                                <Select.Option value="prefer">מעדיף</Select.Option>
                              </Select>
                            </Form.Item>
                            <Button type="link" onClick={() => remove(name)} icon={<DeleteOutlined />} />
                          </Space>
                        ))}
                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                          הוסף חוק
                        </Button>
                      </>
                    )}
                  </Form.List>

                  {/* Law Type 2: Leave at least X of day type Y open */}
                  <Divider orientation="left" className="text-sm">השאר לפחות [כמות] ימי [סוג] פתוחים</Divider>
                  <Form.List name="constraintLaws_type2">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map(({ key, name, ...restField }) => (
                          <Space key={key} align="baseline" className="flex w-full mb-2">
                            <span>השאר לפחות</span>
                            <Form.Item name={[name, 'amount']} {...restField} noStyle>
                              <InputNumber min={1} max={5} placeholder="כמות" className="w-20" />
                            </Form.Item>
                            <span>ימי</span>
                            <Form.Item name={[name, 'dayType']} {...restField} noStyle>
                              <Select placeholder="סוג יום" className="w-32">
                                <Select.Option value="business">עסקים (א-ה)</Select.Option>
                                <Select.Option value="weekend">סופ"ש (ו-ש)</Select.Option>
                              </Select>
                            </Form.Item>
                            <span>פתוחים</span>
                            <Button type="link" onClick={() => remove(name)} icon={<DeleteOutlined />} />
                          </Space>
                        ))}
                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                          הוסף חוק
                        </Button>
                      </>
                    )}
                  </Form.List>

                  {/* Law Type 3: Leave at least X days in the week open */}
                  <Divider orientation="left" className="text-sm">השאר לפחות [כמות] ימים בשבוע פתוחים</Divider>
                  <Form.List name="constraintLaws_type3">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map(({ key, name, ...restField }) => (
                          <Space key={key} align="baseline" className="flex w-full mb-2">
                            <span>השאר לפחות</span>
                            <Form.Item name={[name, 'amount']} {...restField} noStyle>
                              <InputNumber min={1} max={7} placeholder="כמות" className="w-20" />
                            </Form.Item>
                            <span>ימים בשבוע פתוחים</span>
                            <Button type="link" onClick={() => remove(name)} icon={<DeleteOutlined />} />
                          </Space>
                        ))}
                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                          הוסף חוק
                        </Button>
                      </>
                    )}
                  </Form.List>

                  {/* Law Type 4: Can't request more than X of constraint type Y in shift type Z */}
                  <Divider orientation="left" className="text-sm">לא יותר מ-[S] הגבלות מסוג [Y] במשמרת [X]</Divider>
                  <Form.List name="constraintLaws_type4">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map(({ key, name, ...restField }) => (
                          <Space key={key} align="baseline" className="flex w-full mb-2">
                            <span>לא יותר מ-</span>
                            <Form.Item name={[name, 'amount']} {...restField} noStyle>
                              <InputNumber min={1} max={10} placeholder="כמות" className="w-20" />
                            </Form.Item>
                            <Form.Item name={[name, 'constraintType']} {...restField} noStyle>
                              <Select placeholder="סוג הגבלה" className="w-32">
                                <Select.Option value="unavailable">לא זמין</Select.Option>
                                <Select.Option value="prefer_not">מעדיף שלא</Select.Option>
                              </Select>
                            </Form.Item>
                            <span>במשמרת</span>
                            <Form.Item name={[name, 'shiftType']} {...restField} noStyle>
                              <Select placeholder="סוג משמרת" className="w-32">
                                {shiftTypes.map(st => (
                                  <Select.Option key={st.type} value={st.type}>{st.label}</Select.Option>
                                ))}
                              </Select>
                            </Form.Item>
                            <Button type="link" onClick={() => remove(name)} icon={<DeleteOutlined />} />
                          </Space>
                        ))}
                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                          הוסף חוק
                        </Button>
                      </>
                    )}
                  </Form.List>

                  {/* Law Type 5: Can't have more than X constraints on specific weekdays */}
                  <Divider orientation="left" className="text-sm">לא יותר מ-[X] הגבלות בימים [Y]</Divider>
                  <Form.List name="constraintLaws_type5">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map(({ key, name, ...restField }) => (
                          <Space key={key} align="baseline" className="flex w-full mb-2">
                            <span>לא יותר מ-</span>
                            <Form.Item name={[name, 'amount']} {...restField} noStyle>
                              <InputNumber min={1} max={10} placeholder="כמות" className="w-20" />
                            </Form.Item>
                            <span>הגבלות בימים</span>
                            <Form.Item name={[name, 'weekdays']} {...restField} noStyle>
                              <Select mode="multiple" placeholder="בחר ימים" className="w-48">
                                <Select.Option value={0}>ראשון</Select.Option>
                                <Select.Option value={1}>שני</Select.Option>
                                <Select.Option value={2}>שלישי</Select.Option>
                                <Select.Option value={3}>רביעי</Select.Option>
                                <Select.Option value={4}>חמישי</Select.Option>
                                <Select.Option value={5}>שישי</Select.Option>
                                <Select.Option value={6}>שבת</Select.Option>
                              </Select>
                            </Form.Item>
                            <Button type="link" onClick={() => remove(name)} icon={<DeleteOutlined />} />
                          </Space>
                        ))}
                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                          הוסף חוק
                        </Button>
                      </>
                    )}
                  </Form.List>
                </>
              ) : null;
            }}
          </Form.Item>

          <Divider>הגדרות נוספות</Divider>
          <Form.Item name="requireApprovalForSwaps" label="דרוש אישור להחלפות" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="autoAssignEnabled" label="שיבוץ אוטומטי" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    );
  };



  // Notification Sending Modal
  const NotificationSendingModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const handleSubmit = async (values: any) => {
      try {
        await sendNotification({
          variables: {
            input: {
              ...values,
              department: isDepartmentAdmin ? userDepartment : values.department
            }
          }
        });
        message.success('ההודעה נשלחה בהצלחה');
        onClose();
      } catch (error) {
        message.error('שגיאה בשליחת ההודעה');
      }
    };

    return (
      <Modal
        title="שלח הודעה חדשה"
        open={visible}
        onCancel={onClose}
        footer={[
          <Button key="cancel" onClick={onClose}>ביטול</Button>,
          <Button key="send" type="primary" onClick={() => notificationForm.submit()}>שלח</Button>
        ]}
      >
        <Form
          form={notificationForm}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item name="title" label="כותרת" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="message" label="תוכן ההודעה" rules={[{ required: true }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
          {!isDepartmentAdmin && (
            <Form.Item name="department" label="מחלקה">
              <Select placeholder="כל המחלקות">
                {departments.map((dept: any) => (
                  <Select.Option key={dept} value={dept}>{dept}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          <Form.Item name="type" label="סוג הודעה">
            <Select defaultValue="general">
              <Select.Option value="general">כללי</Select.Option>
              <Select.Option value="urgent">דחוף</Select.Option>
              <Select.Option value="reminder">תזכורת</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    );
  };

  // Assignment Settings Modal
  const AssignmentSettingsModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const [form] = Form.useForm();
    
    useEffect(() => {
      if (departmentConfig) {
        form.setFieldsValue({
          // Load constraint values
          maxConsecutiveDays: departmentConfig.constraints?.maxConsecutiveDays,
          maxShiftsPerWeek: departmentConfig.constraints?.maxShiftsPerWeek,
          maxNightShiftsPerWeek: departmentConfig.constraints?.maxNightShiftsPerWeek,
          minRestBetweenShifts: departmentConfig.constraints?.minRestBetweenShifts,
          // Load template system toggle
          useTemplateSystem: departmentConfig.useTemplateSystem || false
        });
      }
    }, [departmentConfig, form]);
    
    const handleSave = async () => {
      try {
        const values = await form.validateFields();
        const deptId = departmentConfig?.departmentId || userDepartment;
        const deptName = departmentConfig?.departmentName || userDepartment;
        if (!deptId) {
          message.error('אין מחלקה מוגדרת לשמירת ההגדרות');
          return;
        }
        const { useTemplateSystem, ...constraintValues } = values;
        
        // Get current config to preserve other fields
        const currentConfig = departmentConfig || {};
        
        await updateConfig({
          variables: {
            departmentId: deptId,
            input: cleanGraphQLInput({
              departmentId: deptId,
              departmentName: deptName,
              shiftTypes: currentConfig.shiftTypes || [],
              departmentRoles: currentConfig.departmentRoles || [],
              constraints: {
                ...(currentConfig.constraints || {}),
                ...constraintValues
              },
              notifications: currentConfig.notifications || {},
              weeklyPatterns: currentConfig.weeklyPatterns || [],
              useTemplateSystem
            })
          }
        });
        message.success('הגדרות שיבוצים עודכנו בהצלחה');
        refetchConfig();
        onClose();
      } catch (error) {
        message.error('שגיאה בעדכון הגדרות שיבוצים');
      }
    };
    
    return (
      <Modal
        title="הגדרות שיבוצים"
        open={visible}
        onCancel={onClose}
        footer={[
          <Button key="cancel" onClick={onClose}>ביטול</Button>,
          <Button key="save" type="primary" onClick={handleSave} icon={<SaveOutlined />}>שמור</Button>
        ]}
      >
        <Form form={form} layout="vertical">
          <Divider orientation="left">מערכת תבניות</Divider>
          <Form.Item 
            name="useTemplateSystem" 
            label="הפעל מערכת תבניות משמרת"
            valuePropName="checked"
            extra="מאפשר יצירת תבניות משמרת עם הגדרת תפקידים לכל סוג משמרת"
          >
            <Switch />
          </Form.Item>
          
          <Divider orientation="left">הגבלות שיבוץ</Divider>
          <Form.Item name="maxConsecutiveDays" label="מקסימום ימי עבודה רצופים">
            <InputNumber min={1} max={7} />
          </Form.Item>
          <Form.Item name="maxShiftsPerWeek" label="מקסימום משמרות בשבוע">
            <InputNumber min={1} max={7} />
          </Form.Item>
          <Form.Item name="maxNightShiftsPerWeek" label="מקסימום משמרות לילה בשבוע">
            <InputNumber min={0} max={7} />
          </Form.Item>
          <Form.Item name="minRestBetweenShifts" label="מינימום שעות מנוחה בין משמרות">
            <InputNumber min={8} max={24} />
          </Form.Item>
        </Form>
      </Modal>
    );
  };

  // Special Day Addition Modal
  const SpecialDayAdditionModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const handleSubmit = async (values: any) => {
      try {
        await updateSpecialDay({
          variables: {
            input: {
              ...values,
              date: values.date.format('YYYY-MM-DD'),
              departments: isDepartmentAdmin ? [userDepartment] : values.departments
            }
          }
        });
        message.success('היום המיוחד נוסף בהצלחה');
        refetchSpecialDays();
        onClose();
      } catch (error) {
        message.error('שגיאה בהוספת יום מיוחד');
      }
    };

    return (
      <Modal
        title="הוסף יום מיוחד"
        open={visible}
        onCancel={onClose}
        footer={[
          <Button key="cancel" onClick={onClose}>ביטול</Button>,
          <Button key="save" type="primary" onClick={() => specialDayForm.submit()}>הוסף</Button>
        ]}
      >
        <Form
          form={specialDayForm}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item name="name" label="שם" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="date" label="תאריך" rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="type" label="סוג" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="holiday">חג</Select.Option>
              <Select.Option value="event">אירוע</Select.Option>
              <Select.Option value="training">הדרכה</Select.Option>
              <Select.Option value="other">אחר</Select.Option>
            </Select>
          </Form.Item>
          {!isDepartmentAdmin && (
            <Form.Item name="departments" label="מחלקות רלוונטיות">
              <Select mode="multiple" placeholder="בחר מחלקות">
                {departments.map((dept: any) => (
                  <Select.Option key={dept} value={dept}>{dept}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
        </Form>
      </Modal>
    );
  };

  // Helper function to get constraint color
  const getConstraintColor = (userId: string, dayOfWeek: number, shiftType: string) => {
    const userConstraintData = userConstraints[userId];
    if (!userConstraintData) return '#52c41a'; // Default green if no constraints
    
    const constraint = userConstraintData.find((c: any) => 
      c.dayOfWeek === dayOfWeek && c.shiftType === shiftType
    );
    
    if (!constraint) return '#52c41a'; // Default green
    
    switch (constraint.availability) {
      case 'available':
        return '#52c41a'; // Green - זמין
      case 'prefer':
        return '#1890ff'; // Blue - מעדיף
      case 'prefer_not':
        return '#fa8c16'; // Orange - מעדיף שלא
      case 'unavailable':
        return '#f5222d'; // Red - לא זמין
      default:
        return '#52c41a';
    }
  };

  // Helper function to get constraint text
  const getConstraintText = (userId: string, dayOfWeek: number, shiftType: string) => {
    const userConstraintData = userConstraints[userId];
    if (!userConstraintData) return 'זמין';
    
    const constraint = userConstraintData.find((c: any) => 
      c.dayOfWeek === dayOfWeek && c.shiftType === shiftType
    );
    
    if (!constraint) return 'זמין';
    
    switch (constraint.availability) {
      case 'available':
        return 'זמין';
      case 'prefer':
        return 'מעדיף';
      case 'prefer_not':
        return 'מעדיף שלא';
      case 'unavailable':
        return 'לא זמין';
      default:
        return 'זמין';
    }
  };

  // Validation function for constraint laws
  const validateConstraintsAgainstLaws = (constraints: any[], laws: any) => {
    const errors: string[] = [];
    
    if (!laws?.enableConstraintLaws) return errors;
    
    // Type 1: Not more than X constraints of type Y
    if (laws.constraintLaws_type1) {
      laws.constraintLaws_type1.forEach((law: any) => {
        const count = constraints.filter(c => c.availability === law.constraintType).length;
        if (count > law.amount) {
          errors.push(`לא ניתן להגדיר יותר מ-${law.amount} הגבלות מסוג "${law.constraintType === 'unavailable' ? 'לא זמין' : law.constraintType === 'prefer_not' ? 'מעדיף שלא' : 'מעדיף'}"`);
        }
      });
    }
    
    // Type 2: Leave at least X of day type Y open
    if (laws.constraintLaws_type2) {
      laws.constraintLaws_type2.forEach((law: any) => {
        const dayRange = law.dayType === 'business' ? [0,1,2,3,4] : [5,6];
        const constraintsInRange = constraints.filter(c => 
          dayRange.includes(c.dayOfWeek) && 
          (c.availability === 'unavailable' || c.availability === 'prefer_not')
        );
        const openDays = dayRange.length - new Set(constraintsInRange.map(c => c.dayOfWeek)).size;
        if (openDays < law.amount) {
          errors.push(`יש להשאיר לפחות ${law.amount} ימי ${law.dayType === 'business' ? 'עסקים' : 'סופ"ש'} פתוחים`);
        }
      });
    }
    
    // Type 3: Leave at least X days in the week open
    if (laws.constraintLaws_type3) {
      laws.constraintLaws_type3.forEach((law: any) => {
        const constrainedDays = new Set(
          constraints
            .filter(c => c.availability === 'unavailable' || c.availability === 'prefer_not')
            .map(c => c.dayOfWeek)
        ).size;
        const openDays = 7 - constrainedDays;
        if (openDays < law.amount) {
          errors.push(`יש להשאיר לפחות ${law.amount} ימים בשבוע פתוחים`);
        }
      });
    }
    
    // Type 4: Can't request more than X of constraint type Y in shift type Z
    if (laws.constraintLaws_type4) {
      laws.constraintLaws_type4.forEach((law: any) => {
        const count = constraints.filter(c => 
          c.shiftType === law.shiftType && 
          c.availability === law.constraintType
        ).length;
        if (count > law.amount) {
          const shiftLabel = shiftTypes.find(st => st.type === law.shiftType)?.label || law.shiftType;
          errors.push(`לא ניתן להגדיר יותר מ-${law.amount} הגבלות "${law.constraintType === 'unavailable' ? 'לא זמין' : 'מעדיף שלא'}" במשמרת ${shiftLabel}`);
        }
      });
    }
    
    // Type 5: Can't have more than X constraints on specific weekdays
    if (laws.constraintLaws_type5) {
      laws.constraintLaws_type5.forEach((law: any) => {
        const count = constraints.filter(c => 
          law.weekdays.includes(c.dayOfWeek) && 
          (c.availability === 'unavailable' || c.availability === 'prefer_not')
        ).length;
        if (count > law.amount) {
          const dayNames = law.weekdays.map((d: number) => 
            ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][d]
          ).join(', ');
          errors.push(`לא ניתן להגדיר יותר מ-${law.amount} הגבלות בימים: ${dayNames}`);
        }
      });
    }
    
    return errors;
  };

  return (
    <div className="shifts-admin-dashboard-wrapper">
      <div className="shifts-admin-dashboard-container">
        <div className="shifts-admin-dashboard">
          {/* Top Week Navigation */}
          <WeekNavigation />
          
          {/* Main Content - Full Width */}
          <Row gutter={16} className="mb-6">
            <Col span={24}>
              {renderContent()}
            </Col>
          </Row>
          
          {/* Bottom Section - Menu */}
          <Row gutter={16}>
            {/* Main Menu */}
            <Col span={24}>
              <Card 
                styles={{ body: { padding: '16px' } }} 
                title="תפריט ראשי"
                className="shifts-admin-dashboard-bottom-card"
              >
                <Menu
                  mode="inline"
                  selectedKeys={[selectedMenu]}
                  onClick={({ key }) => setSelectedMenu(key)}
                  items={leftMenuItems}
                  style={{ height: '400px', overflowY: 'auto' }}
                />
              </Card>
            </Col>
            

          </Row>
          
          {/* Configuration Modals */}
          <ShiftTypesConfigModal 
            visible={editingSection === 'shiftTypes'} 
            onClose={() => setEditingSection(null)} 
          />
          <ConstraintsConfigModal 
            visible={editingSection === 'constraints'} 
            onClose={() => setEditingSection(null)} 
          />
          <AssignmentSettingsModal
            visible={editingSection === 'assignmentSettings'}
            onClose={() => setEditingSection(null)}
          />
          <NotificationSettingsModal
            visible={editingSection === 'notifications'}
            onClose={() => setEditingSection(null)}
          />

          {notificationModalVisible && (
            <NotificationSendingModal
              visible={notificationModalVisible}
              onClose={() => setNotificationModalVisible(false)}
            />
          )}
          {specialDayModalVisible && (
            <SpecialDayAdditionModal
              visible={specialDayModalVisible}
              onClose={() => setSpecialDayModalVisible(false)}
            />
          )}
          
          {/* User Vacation History Modal */}
          <Modal
            title={`היסטוריית חופשות - ${selectedUserForVacationHistory?.displayName || ''}`}
            open={vacationHistoryModalVisible}
            onCancel={() => {
              setVacationHistoryModalVisible(false);
              setSelectedUserForVacationHistory(null);
            }}
            width={1000}
            footer={[
              <Button 
                key="close" 
                onClick={() => {
                  setVacationHistoryModalVisible(false);
                  setSelectedUserForVacationHistory(null);
                }}
              >
                סגור
              </Button>
            ]}
          >
            {userVacationHistoryLoading ? (
              <Spin tip="טוען היסטוריית חופשות..." />
            ) : (
              <Table
                dataSource={userVacationHistoryData?.vacationRequests || []}
                rowKey="id"
                scroll={{ y: 400 }}
                columns={[
                  {
                    title: 'תאריכים',
                    key: 'dates',
                    render: (record: any) => (
                      <span>
                        {moment(record.startDate).format('DD/MM/YYYY')} - {moment(record.endDate).format('DD/MM/YYYY')}
                      </span>
                    )
                  },
                  {
                    title: 'סוג',
                    dataIndex: 'vacationType',
                    key: 'vacationType',
                    render: (type: string) => {
                      const types: Record<string, string> = {
                        annual: 'חופשה שנתית',
                        sick: 'מחלה',
                        personal: 'חופשה אישית',
                        maternity: 'חופשת לידה',
                        other: 'אחר'
                      };
                      return types[type] || type;
                    }
                  },
                  {
                    title: 'סטטוס',
                    dataIndex: 'status',
                    key: 'status',
                    render: (status: string) => {
                      const colors: Record<string, string> = {
                        pending: 'orange',
                        approved: 'green',
                        rejected: 'red',
                        cancelled: 'default'
                      };
                      const labels: Record<string, string> = {
                        pending: 'ממתין',
                        approved: 'אושר',
                        rejected: 'נדחה',
                        cancelled: 'בוטל'
                      };
                      return <Tag color={colors[status]}>{labels[status]}</Tag>;
                    }
                  },
                  {
                    title: 'סיבה',
                    dataIndex: 'reason',
                    key: 'reason',
                    ellipsis: true
                  },
                  {
                    title: 'הערות מנהל',
                    dataIndex: 'adminNotes',
                    key: 'adminNotes',
                    ellipsis: true
                  },
                  {
                    title: 'תאריך אישור',
                    dataIndex: 'approvedAt',
                    key: 'approvedAt',
                    render: (date: string) => date ? moment(date).format('DD/MM/YYYY HH:mm') : '-'
                  },
                  {
                    title: 'פעולות',
                    key: 'actions',
                    width: 120,
                    render: (record: any) => (
                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setSelectedVacationForEdit(record);
                            vacationEditForm.setFieldsValue({
                              startDate: moment(record.startDate),
                              endDate: moment(record.endDate),
                              vacationType: record.vacationType,
                              reason: record.reason
                            });
                            setTimeout(() => {
                              setEditVacationModalVisible(true);
                            }, 0);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          ערוך
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setSelectedVacationForEdit(record);
                            setCancelVacationModalVisible(true);
                          }}
                          className="text-red-600 hover:text-red-800"
                          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          בטל
                        </button>
                      </div>
                    )
                  }
                ]}
              />
            )}
          </Modal>
          
          {/* Edit Vacation Modal */}
          <Modal
            title="ערוך בקשת חופשה"
            open={editVacationModalVisible}
            onCancel={() => {
              setEditVacationModalVisible(false);
              vacationEditForm.resetFields();
            }}
            onOk={async () => {
              try {
                const values = await vacationEditForm.validateFields();
                await updateVacationRequest({
                  variables: {
                    id: selectedVacationForEdit.id,
                    input: {
                      startDate: values.startDate.format('YYYY-MM-DD'),
                      endDate: values.endDate.format('YYYY-MM-DD'),
                      vacationType: values.vacationType,
                      reason: values.reason
                    }
                  }
                });
                message.success('בקשת החופשה עודכנה בהצלחה');
                setEditVacationModalVisible(false);
                vacationEditForm.resetFields();
                refetchVacations();
              } catch (error) {
                message.error('שגיאה בעדכון בקשת החופשה');
              }
            }}
          >
            <Form form={vacationEditForm} layout="vertical">
              <Form.Item name="startDate" label="תאריך התחלה" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="endDate" label="תאריך סיום" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="vacationType" label="סוג חופשה" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="annual">חופשה שנתית</Select.Option>
                  <Select.Option value="sick">מחלה</Select.Option>
                  <Select.Option value="personal">חופשה אישית</Select.Option>
                  <Select.Option value="maternity">חופשת לידה</Select.Option>
                  <Select.Option value="other">אחר</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name="reason" label="סיבה">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Form>
          </Modal>
          
          {/* Cancel Vacation Modal */}
          <Modal
            title="ביטול בקשת חופשה"
            open={cancelVacationModalVisible}
            onCancel={() => setCancelVacationModalVisible(false)}
            onOk={async () => {
              try {
                if (selectedVacationForEdit.status === 'approved') {
                  // Use deleteVacationRequest for approved vacations
                  await deleteVacationRequest({
                    variables: { id: selectedVacationForEdit.id }
                  });
                } else {
                  // Use cancelVacationRequest for pending vacations
                  await cancelVacationRequest({
                    variables: { id: selectedVacationForEdit.id }
                  });
                }
                message.success('בקשת החופשה בוטלה בהצלחה');
                setCancelVacationModalVisible(false);
                refetchVacations();
              } catch (error) {
                message.error('שגיאה בביטול בקשת החופשה');
              }
            }}
            okText="אישור"
            cancelText="ביטול"
            okButtonProps={{ danger: true }}
          >
            <p>האם אתה בטוח שברצונך לבטל את בקשת החופשה?</p>
          </Modal>
          
          {/* Overlapping Vacations Modal */}
          <Modal
            title="חופשות חופפות"
            open={overlappingVacationsModalVisible}
            onCancel={() => {
              setOverlappingVacationsModalVisible(false);
              setSelectedRequestForOverlap(null);
            }}
            footer={[
              <Button key="close" onClick={() => {
                setOverlappingVacationsModalVisible(false);
                setSelectedRequestForOverlap(null);
              }}>
                סגור
              </Button>
            ]}
            width={800}
          >
            {overlappingVacations.length === 0 ? (
              <Alert
                message="אין חופשות חופפות"
                description="אין עובדים אחרים עם חופשות מאושרות בתקופה הנבחרת"
                type="info"
                showIcon
              />
            ) : (
              <div>
                <Alert
                  message={`נמצאו ${overlappingVacations.length} חופשות חופפות`}
                  type="warning"
                  showIcon
                  className="mb-4"
                />
                <List
                  dataSource={overlappingVacations}
                  renderItem={(vacation: any) => (
                    <List.Item>
                      <List.Item.Meta
                        title={vacation.user?.displayName || 'עובד לא ידוע'}
                        description={
                          <div>
                            <div>
                              <strong>תקופה:</strong> {moment(vacation.startDate).format('DD/MM/YYYY')} - {moment(vacation.endDate).format('DD/MM/YYYY')}
                            </div>
                            <div>
                              <strong>סוג:</strong> {vacation.vacationType}
                            </div>
                            {vacation.reason && (
                              <div>
                                <strong>סיבה:</strong> {vacation.reason}
                              </div>
                            )}
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              </div>
            )}
          </Modal>
          
          {/* Shift Role Template Modal */}
          <Modal
            title={editingTemplate ? 'ערוך תבנית משמרת' : 'צור תבנית משמרת חדשה'}
            open={templateModalVisible}
            onCancel={() => {
              setTemplateModalVisible(false);
              templateForm.resetFields();
              setEditingTemplate(null);
            }}
            onOk={() => templateForm.submit()}
            width={700}
            okText="שמור"
            cancelText="ביטול"
          >
            <Form
              form={templateForm}
              layout="vertical"
              onFinish={async (values) => {
                try {
                  const input = cleanGraphQLInput({
                    name: values.name,
                    departmentId: userDepartment!,
                    dayOfWeek: values.dayOfWeek,
                    shiftType: values.shiftType,
                    roleAssignments: values.roleAssignments,
                    isActive: true
                  });
                  
                  if (editingTemplate) {
                    await updateShiftRoleTemplate({
                      variables: {
                        id: editingTemplate.id,
                        input
                      }
                    });
                  } else {
                    await createShiftRoleTemplate({
                      variables: { input }
                    });
                  }
                } catch (error) {
                  console.error('Error saving template:', error);
                }
              }}
            >
              <Form.Item
                name="name"
                label="שם התבנית"
                rules={[{ required: true, message: 'נא להזין שם לתבנית' }]}
              >
                <Input placeholder="לדוגמה: יום ראשון בוקר סטנדרטי" />
              </Form.Item>
              
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="dayOfWeek"
                    label="יום בשבוע"
                    rules={[{ required: true, message: 'נא לבחור יום' }]}
                  >
                    <Select placeholder="בחר יום">
                      <Select.Option value={0}>ראשון</Select.Option>
                      <Select.Option value={1}>שני</Select.Option>
                      <Select.Option value={2}>שלישי</Select.Option>
                      <Select.Option value={3}>רביעי</Select.Option>
                      <Select.Option value={4}>חמישי</Select.Option>
                      <Select.Option value={5}>שישי</Select.Option>
                      <Select.Option value={6}>שבת</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="shiftType"
                    label="סוג משמרת"
                    rules={[{ required: true, message: 'נא לבחור סוג משמרת' }]}
                  >
                    <Select placeholder="בחר סוג משמרת">
                      {shiftTypes.map(st => (
                        <Select.Option key={st.type} value={st.type}>
                          <Tag color={st.color}>{st.label}</Tag>
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              
              <Form.List
                name="roleAssignments"
                rules={[
                  {
                    validator: async (_, roleAssignments) => {
                      if (!roleAssignments || roleAssignments.length < 1) {
                        return Promise.reject(new Error('נא להוסיף לפחות תפקיד אחד'));
                      }
                    },
                  },
                ]}
              >
                {(fields, { add, remove }, { errors }) => (
                  <>
                    <div className="flex justify-between items-center mb-2">
                      <Text strong>הקצאת תפקידים</Text>
                      <Button
                        type="link"
                        onClick={() => add({ roleId: '', roleName: '', count: 1 })}
                        icon={<PlusOutlined />}
                      >
                        הוסף תפקיד
                      </Button>
                    </div>
                    {fields.map((field, index) => (
                      <Row key={field.key} gutter={16} align="middle" className="mb-2">
                        <Col span={14}>
                          <Form.Item
                            name={[field.name, 'roleId']}
                            rules={[{ required: true, message: 'נא לבחור תפקיד' }]}
                            noStyle
                          >
                            <Select
                              placeholder="בחר תפקיד"
                              onChange={(value) => {
                                const role = departmentRoles.find((r: DepartmentRole) => r.id === value);
                                if (role) {
                                  const assignments = templateForm.getFieldValue('roleAssignments');
                                  assignments[index].roleName = role.name;
                                  templateForm.setFieldsValue({ roleAssignments: assignments });
                                }
                              }}
                            >
                              {departmentRoles.map((role: DepartmentRole) => (
                                <Select.Option key={role.id} value={role.id}>
                                  <Space>
                                    <div
                                      style={{
                                        width: 12,
                                        height: 12,
                                        borderRadius: '50%',
                                        backgroundColor: role.color,
                                        display: 'inline-block'
                                      }}
                                    />
                                    {role.name}
                                  </Space>
                                </Select.Option>
                              ))}
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item
                            name={[field.name, 'count']}
                            rules={[{ required: true, message: 'כמות' }]}
                            noStyle
                          >
                            <InputNumber
                              min={1}
                              max={10}
                              placeholder="כמות"
                              style={{ width: '100%' }}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={4}>
                          <Button
                            type="text"
                            danger
                            onClick={() => remove(field.name)}
                            icon={<DeleteOutlined />}
                          />
                        </Col>
                      </Row>
                    ))}
                    <Form.ErrorList errors={errors} />
                  </>
                )}
              </Form.List>
            </Form>
          </Modal>
          
          {/* Apply Template Modal */}
          <Modal
            title="החל תבנית על שבוע"
            open={applyTemplateModalVisible}
            onCancel={() => {
              setApplyTemplateModalVisible(false);
              setSelectedWeekForTemplate(null);
            }}
            footer={null}
            width={600}
          >
            {selectedWeekForTemplate && (
              <div>
                <Alert
                  message="בחר תבנית להחלה"
                  description="התבנית תיצור או תעדכן משמרות לפי ההגדרות שלה"
                  type="info"
                  className="mb-4"
                />
                <List
                  dataSource={shiftRoleTemplatesData?.shiftRoleTemplates?.filter((t: ShiftRoleTemplate) => t.isActive) || []}
                  renderItem={(template: ShiftRoleTemplate) => {
                    const dayName = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][template.dayOfWeek];
                    const shiftTypeConfig = shiftTypes.find(st => st.type === template.shiftType);
                    
                    return (
                      <List.Item
                        actions={[
                          <Button
                            type="primary"
                            onClick={async () => {
                              try {
                                await applyShiftRoleTemplate({
                                  variables: {
                                    templateId: template.id,
                                    weekStartDate: selectedWeekForTemplate
                                  }
                                });
                              } catch (error) {
                                console.error('Error applying template:', error);
                              }
                            }}
                          >
                            החל תבנית
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              {template.name}
                              <Tag color={shiftTypeConfig?.color}>
                                {dayName} - {shiftTypeConfig?.label}
                              </Tag>
                            </Space>
                          }
                          description={
                            <Space wrap>
                              {template.roleAssignments.map((ra, index) => (
                                <Tag key={index}>{ra.count} × {ra.roleName}</Tag>
                              ))}
                            </Space>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              </div>
            )}
          </Modal>
        </div>
      </div>
    </div>
  );
} 