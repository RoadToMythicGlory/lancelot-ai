'use client';

import React, { useState, useMemo, useEffect } from 'react';
import './broadcast-planning.css';
import { 
  Table, 
  Card, 
  Button, 
  Space, 
  Modal, 
  Tag, 
  Row, 
  Col,
  Typography,
  message,
  Spin,
  Alert,
  Input,
  DatePicker,
  Select,
  Form,
  Popconfirm,
  App,
  Dropdown,
  TimePicker,
  Switch,
  Upload,
  Tooltip,
  Badge,
  Divider,
  Checkbox
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined,
  DesktopOutlined,
  GlobalOutlined,
  InboxOutlined,
  RadarChartOutlined,
  PlaySquareOutlined,
  VideoCameraAddOutlined,
  ReloadOutlined,
  SearchOutlined,
  LeftOutlined,
  RightOutlined,
  TableOutlined,
  BarsOutlined,
  AppstoreOutlined,
  MoreOutlined,
  UploadOutlined,
  ExclamationCircleOutlined,
  FilterOutlined,
  ClearOutlined,
  SaveOutlined,
  CloseOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation } from '@apollo/client';
import { GET_BROADCAST_EVENTS } from '@/graphql/queries';
import { CREATE_BROADCAST_EVENT_WITH_OVERLAP_CHECK, UPDATE_BROADCAST_EVENT, DELETE_BROADCAST_EVENT } from '@/graphql/mutations';
import { getIsraeliWeekNumber, formatIsraeliWeekDisplay } from '@/utils/weekCalculation';

// Extend dayjs with the isoWeek plugin
dayjs.extend(isoWeek);
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
// Force all parsing/formatting to Asia/Jerusalem to avoid host TZ drift
dayjs.tz.setDefault('Asia/Jerusalem');

// Import existing department modals
import MCRModal from '../../components/broadcast/MCRModal';
import ExternalBroadcastsModal from '../../components/broadcast/ExternalBroadcastsModal';
import WarehouseModal from '../../components/broadcast/WarehouseModal';
import BroadcastArrayModal from '../../components/broadcast/BroadcastArrayModal';
import ClosedCaptionsModal from '../../components/broadcast/ClosedCaptionsModal';
import PlayoutDepartmentModal from '../../components/broadcast/PlayoutDepartmentModal';
import BatchEventCreator from '../../components/broadcast/BatchEventCreator';
import BroadcastEventModal from '../../components/broadcast/BroadcastEventModal';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Permission } from '@/rbac';
import { useAuth } from '@/contexts/AuthContext';

const { Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// GraphQL operations imported from cleaned graphql files

// Interface matching the backend schema
interface BroadcastEvent {
  id: string;
  title: string;
  description?: string;
  eventType: string;
  startTime: string;
  endTime: string;
  actualStartTime?: string;
  actualEndTime?: string;
  channel?: string;
  liveLocation?: string;
  source?: string;
  destination?: string;
  satellite?: string;
  technicalDirectorId?: string;
  controlOperatorId?: string;
  priority?: string;
  backup?: boolean;
  requiresSignLanguage?: boolean;
  requiresSubtitles?: boolean;
  accessibilityStatus?: string;
  contentDuration?: number;
  contentType?: string;
  contentSource?: string;
  metadata?: any;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  createdAt?: string;
  updatedAt?: string;
  // Sport broadcast fields
  koTime?: string;
  sport?: string;
  league?: string;
  stage?: string;
  homeTeam?: string;
  awayTeam?: string;
  parallelChannel?: string;
  channel1_4k?: boolean;
  live?: boolean;
  notes?: string;
}

type ViewMode = 'daily' | 'weekly' | 'monthly';
type TableDisplayMode = 'compact' | 'full';

// Filter interface
interface BroadcastFilters {
  channels: string[];
  sports: string[];
  leagues: string[];
  teams: string[];
  eventTypes: ('live' | 'recorded')[];
  departmentStatus: ('complete' | 'partial' | 'empty')[];
  timeRange: [Dayjs | null, Dayjs | null] | null;
  has4K: boolean | null;
  hasParallelChannel: boolean | null;
  searchText: string;
}

// Filter preset interface
interface FilterPreset {
  id: string;
  name: string;
  filters: BroadcastFilters;
  isDefault?: boolean;
}

const BroadcastPlanningPage: React.FC = () => {
  const { message: messageApi, modal } = App.useApp();
  const { hasPermission } = useAuth();

  // Real RBAC gates. MCR Operators / anyone without BROADCAST_MANAGE see the
  // page but in read-only mode (no create / edit / delete and the
  // department modals are non-savable).
  const canWrite = hasPermission(Permission.BROADCAST_MANAGE);
  const canEdit = canWrite;
  const canDelete = hasPermission(Permission.BROADCAST_DELETE) || canWrite;

  const [viewMode, setViewMode] = useState<ViewMode>('weekly');
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [searchText, setSearchText] = useState('');
  const [tableDisplayMode, setTableDisplayMode] = useState<TableDisplayMode>('compact');
  
  // Filter state
  const [filters, setFilters] = useState<BroadcastFilters>({
    channels: [],
    sports: [],
    leagues: [],
    teams: [],
    eventTypes: [],
    departmentStatus: [],
    timeRange: null,
    has4K: null,
    hasParallelChannel: null,
    searchText: ''
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([
    {
      id: '1',
      name: 'שידורים חיים',
      filters: {
        ...filters,
        eventTypes: ['live']
      },
      isDefault: true
    },
    {
      id: '2',
      name: 'כדורגל בלבד',
      filters: {
        ...filters,
        sports: ['כדורגל']
      }
    },
    {
      id: '3',
      name: 'ערוץ CHANNEL 1',
      filters: {
        ...filters,
        channels: ['CHANNEL 1']
      }
    },
    {
      id: '4',
      name: 'שידורי 4K',
      filters: {
        ...filters,
        has4K: true
      }
    }
  ]);
  
  // Modals
  const [createEventModal, setCreateEventModal] = useState(false);
  const [editEventModal, setEditEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BroadcastEvent | null>(null);
  const [batchCreatorModal, setBatchCreatorModal] = useState(false);
  const [fileImportSelectionModal, setFileImportSelectionModal] = useState(false);
  
  // Department selection modal
  const [departmentModal, setDepartmentModal] = useState(false);
  
  const [form] = Form.useForm();

  // Get date range
  const getDateRange = () => {
    switch (viewMode) {
      case 'daily':
        return {
          start: currentDate.startOf('day').toISOString(),
          end: currentDate.endOf('day').toISOString()
        };
      case 'weekly':
        return {
          start: currentDate.startOf('week').toISOString(),
          end: currentDate.endOf('week').toISOString()
        };
      case 'monthly':
        return {
          start: currentDate.startOf('month').toISOString(),
          end: currentDate.endOf('month').toISOString()
        };
    }
  };

  const dateRange = useMemo(() => getDateRange(), [viewMode, currentDate]);
  const { start: startDate, end: endDate } = dateRange;

  // GraphQL operations
  const { data, loading, error, refetch } = useQuery(GET_BROADCAST_EVENTS, {
    variables: { startDate, endDate },
    errorPolicy: 'all',
    fetchPolicy: 'network-only',
    pollInterval: 5000
  });

  const [createBroadcastEvent] = useMutation(CREATE_BROADCAST_EVENT_WITH_OVERLAP_CHECK);
  const [updateBroadcastEvent] = useMutation(UPDATE_BROADCAST_EVENT);
  const [deleteBroadcastEvent] = useMutation(DELETE_BROADCAST_EVENT);

  // Update selectedEvent when data changes (for live updates in the modal)
  useEffect(() => {
    if (selectedEvent && data?.broadcastEvents) {
      const updatedEvent = data.broadcastEvents.find((e: BroadcastEvent) => e.id === selectedEvent.id);
      if (updatedEvent) {
        setSelectedEvent(updatedEvent);
      }
    }
  }, [data?.broadcastEvents, selectedEvent?.id]);

  const allEvents: BroadcastEvent[] = useMemo(() => {
    if (!data?.broadcastEvents) return [];
    
    console.log('Raw broadcast events from backend:', data.broadcastEvents);
    
    // Map events - sport fields now come directly from backend
    return data.broadcastEvents.map((event: any) => {
      console.log('Mapping event:', event.id, {
        title: event.title,
        sport: event.sport,
        league: event.league,
        stage: event.stage,
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
        parallelChannel: event.parallelChannel,
        channel1_4k: event.channel1_4k,
        live: event.live,
        notes: event.notes,
        metadata: event.metadata
      });
      
      return {
        ...event,
        // Map contentType from sport field for display
        contentType: event.sport || event.contentType,
      };
    });
  }, [data?.broadcastEvents]);
  
  // Get unique values for filter options
  const filterOptions = useMemo(() => {
    const channels = new Set<string>();
    const sports = new Set<string>();
    const leagues = new Set<string>();
    const teams = new Set<string>();

    allEvents.forEach(event => {
      if (event.channel) channels.add(event.channel);
      if (event.sport || event.contentType) sports.add(event.sport || event.contentType || '');
      if (event.league) leagues.add(event.league);
      if (event.homeTeam) teams.add(event.homeTeam);
      if (event.awayTeam) teams.add(event.awayTeam);
    });

    return {
      channels: Array.from(channels).sort(),
      sports: Array.from(sports).filter(s => s).sort(),
      leagues: Array.from(leagues).sort(),
      teams: Array.from(teams).sort()
    };
  }, [allEvents]);

  // Get department status for an event
  const getEventDepartmentStatus = (event: BroadcastEvent): 'complete' | 'partial' | 'empty' => {
    if (!event.metadata?.departments) return 'empty';
    
    const departments = ['mcr', 'external-broadcasts', 'warehouse', 'broadcast-array', 'closed-captions', 'playout'];
    const statuses = departments.map(dept => getDepartmentStatus(event, dept));
    
    if (statuses.every(status => status !== 'error')) return 'complete';
    else if (statuses.some(status => status !== 'error')) return 'partial';
    return 'empty';
  };

  // Check if filters are active
  const hasActiveFilters = useMemo(() => {
    return filters.channels.length > 0 ||
           filters.sports.length > 0 ||
           filters.leagues.length > 0 ||
           filters.teams.length > 0 ||
           filters.eventTypes.length > 0 ||
           filters.departmentStatus.length > 0 ||
           filters.timeRange !== null ||
           filters.has4K !== null ||
           filters.hasParallelChannel !== null ||
           (filters.searchText && filters.searchText.trim() !== '');
  }, [filters]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return allEvents.filter(event => {
      // Search text filter (combined with filters.searchText)
      const combinedSearchText = searchText || filters.searchText;
      if (combinedSearchText) {
        const searchLower = combinedSearchText.toLowerCase();
        const matchesSearch = (
          event.title?.toLowerCase().includes(searchLower) ||
          event.description?.toLowerCase().includes(searchLower) ||
          event.contentType?.toLowerCase().includes(searchLower) ||
          event.sport?.toLowerCase().includes(searchLower) ||
          event.league?.toLowerCase().includes(searchLower) ||
          event.homeTeam?.toLowerCase().includes(searchLower) ||
          event.awayTeam?.toLowerCase().includes(searchLower) ||
          event.channel?.toLowerCase().includes(searchLower) ||
          event.notes?.toLowerCase().includes(searchLower)
        );
        if (!matchesSearch) return false;
      }

      // Channel filter
      if (filters.channels.length > 0) {
        if (!event.channel || !filters.channels.includes(event.channel)) return false;
      }

      // Sport filter
      if (filters.sports.length > 0) {
        const eventSport = event.sport || event.contentType;
        if (!eventSport || !filters.sports.includes(eventSport)) return false;
      }

      // League filter
      if (filters.leagues.length > 0) {
        if (!event.league || !filters.leagues.includes(event.league)) return false;
      }

      // Teams filter
      if (filters.teams.length > 0) {
        const hasTeam = (event.homeTeam && filters.teams.includes(event.homeTeam)) ||
                       (event.awayTeam && filters.teams.includes(event.awayTeam));
        if (!hasTeam) return false;
      }

      // Event type filter
      if (filters.eventTypes.length > 0) {
        const eventType = event.live ? 'live' : 'recorded';
        if (!filters.eventTypes.includes(eventType)) return false;
      }

      // Department status filter
      if (filters.departmentStatus.length > 0) {
        const status = getEventDepartmentStatus(event);
        if (!filters.departmentStatus.includes(status)) return false;
      }

      // Time range filter
      if (filters.timeRange && filters.timeRange[0] && filters.timeRange[1]) {
        const eventTime = dayjs(event.startTime);
        if (!eventTime.isAfter(filters.timeRange[0]) || !eventTime.isBefore(filters.timeRange[1])) {
          return false;
        }
      }

      // 4K filter
      if (filters.has4K !== null) {
        if (filters.has4K && !event.channel1_4k) return false;
        if (!filters.has4K && event.channel1_4k) return false;
      }

      // Parallel channel filter
      if (filters.hasParallelChannel !== null) {
        if (filters.hasParallelChannel && !event.parallelChannel) return false;
        if (!filters.hasParallelChannel && event.parallelChannel) return false;
      }

      return true;
    });
  }, [allEvents, searchText, filters]);

  // Check for channel overlaps
  const getChannelOverlaps = (event: BroadcastEvent): BroadcastEvent[] => {
    if (!event.channel) return [];
    
    return allEvents.filter(otherEvent => {
      if (otherEvent.id === event.id || !otherEvent.channel) return false;
      if (otherEvent.channel !== event.channel) return false;
      
      const eventStart = new Date(event.startTime).getTime();
      const eventEnd = new Date(event.endTime).getTime();
      const otherStart = new Date(otherEvent.startTime).getTime();
      const otherEnd = new Date(otherEvent.endTime).getTime();
      
      // Check if times overlap
      return (eventStart < otherEnd && eventEnd > otherStart);
    });
  };

  // Get department status color
  const getDepartmentStatus = (event: BroadcastEvent, department: string): 'success' | 'warning' | 'error' => {
    if (!event.metadata?.departments) {
      return 'error'; // Red - no data
    }

    // Frontend uses kebab-case, backend stores camelCase keys
    const departmentKeyMap: Record<string, string> = {
      'broadcast-array': 'broadcastArray',
      'external-broadcasts': 'externalBroadcasts',
      'closed-captions': 'closedCaptions',
    };
    const departmentKey = departmentKeyMap[department] || department;

    if (!event.metadata.departments?.[departmentKey]) {
      return 'error'; // Red - no data
    }
    
    const deptData = event.metadata.departments[departmentKey];
    
    // Check if department has filled required fields
    if (deptData.customData || deptData.data) {
      // Check completeness based on department
      const hasData = Object.keys(deptData.customData || deptData.data || {}).length > 0;
      if (hasData) {
        // Simple check - if has data, consider it at least partial
        const dataKeys = Object.keys(deptData.customData || deptData.data || {});
        if (dataKeys.length > 3) { // Arbitrary threshold for "complete"
          return 'success'; // Green - complete
        }
        return 'warning'; // Yellow - partial
      }
    }
    
    return 'error'; // Red - no data
  };

  // Get row class name based on department completion status
  const getRowClassName = (record: BroadcastEvent): string => {
    if (!record.metadata?.departments) return '';
    
    const departments = ['mcr', 'external-broadcasts', 'warehouse', 'broadcast-array', 'closed-captions', 'playout'];
    const statuses = departments.map(dept => getDepartmentStatus(record, dept));
    
    // If all departments have data (green or yellow), row is light green
    if (statuses.every(status => status !== 'error')) {
      return 'broadcast-row-complete';
    }
    // If some departments have data, row is light yellow
    else if (statuses.some(status => status !== 'error')) {
      return 'broadcast-row-partial';
    }
    // If no departments have data, no special color
    return '';
  };

  // Handle row click - open department selection modal
  const handleRowClick = (record: BroadcastEvent) => {
    setSelectedEvent(record);
    setDepartmentModal(true);
  };



  // Handle create event
  const handleCreateEvent = async (values: any, forceCreate: boolean = false) => {
    if (!canWrite) {
      messageApi.error('אין לך הרשאה ליצור אירועים');
      return;
    }
    try {
      // Auto-generate title from teams if not provided
      const title = values.title || 
        (values.homeTeam && values.awayTeam ? `${values.homeTeam} נגד ${values.awayTeam}` : '') ||
        values.contentType || 'אירוע ספורט';

      const input = {
        title,
        eventType: values.live ? 'live' : 'recorded',
        startTime: values.startTime.toISOString(),
        endTime: values.endTime?.toISOString(),
        channel: values.channel,
        // Sport broadcast fields - directly supported by backend!
        koTime: values.koTime ? values.koTime.toISOString() : null,
        sport: values.contentType,
        league: values.league,
        stage: values.stage,
        homeTeam: values.homeTeam,
        awayTeam: values.awayTeam,
        parallelChannel: values.parallelChannel || null,
        channel1_4k: values.channel1_4k || false,
        live: values.live || false,
        notes: values.notes,
      };

      const result = await createBroadcastEvent({ 
        variables: { 
          input,
          forceCreate 
        },
        refetchQueries: [
          { 
            query: GET_BROADCAST_EVENTS, 
            variables: { startDate, endDate } 
          }
        ],
        awaitRefetchQueries: true
      });

      // Defensive access: in some failure modes (server returned only
      // `errors`, network blip, schema mismatch with a stale bundle, etc.)
      // `result.data` can be undefined even though Apollo did not throw.
      // Reading `data.createBroadcastEventWithOverlapCheck` directly then
      // crashes with "Cannot read properties of undefined" and hides the
      // real cause from the user.
      const response = result?.data?.createBroadcastEventWithOverlapCheck;
      if (!response) {
        const gqlErrors = (result as any)?.errors;
        const msg = Array.isArray(gqlErrors) && gqlErrors[0]?.message
          ? gqlErrors[0].message
          : 'לא התקבלה תגובה תקינה מהשרת';
        messageApi.error(`שגיאה ביצירת האירוע: ${msg}`);
        return;
      }

      if (response.overlapCheck?.hasOverlaps && !forceCreate) {
        // Show overlap confirmation
        modal.confirm({
          title: 'זוהתה חפיפת ערוצים',
          content: response.overlapCheck.message,
          okText: 'צור בכל זאת',
          cancelText: 'ביטול',
          onOk: () => handleCreateEvent(values, true),
        });
        return;
      }

      messageApi.success('אירוע השידור נוצר בהצלחה!');
      setCreateEventModal(false);
      form.resetFields();
      await refetch();
    } catch (error: any) {
      messageApi.error(`שגיאה ביצירת האירוע: ${error.message}`);
    }
  };

  // Handle update event
  const handleUpdateEvent = async (values: any) => {
    if (!canEdit) {
      messageApi.error('אין לך הרשאה לערוך אירועים');
      return;
    }
    console.log('handleUpdateEvent called with values:', values);
    if (!selectedEvent) {
      console.error('No selected event!');
      return;
    }
    
    try {
      // Build the title from teams if not provided
      const title = values.title || 
        (values.homeTeam && values.awayTeam ? `${values.homeTeam} נגד ${values.awayTeam}` : 
         values.homeTeam || values.awayTeam || selectedEvent.title);

      const updateInput = {
        title,
        eventType: values.eventType || 'recorded',
        startTime: values.startTime.toISOString(),
        endTime: values.endTime?.toISOString(),
        channel: values.channel,
        // Sport broadcast fields - directly supported by backend!
        koTime: values.koTime ? values.koTime.toISOString() : null,
        sport: values.contentType, // ענף
        league: values.league,
        stage: values.stage,
        homeTeam: values.homeTeam,
        awayTeam: values.awayTeam,
        parallelChannel: values.parallelChannel || null,
        channel1_4k: values.channel1_4k || false,
        live: values.live || false,
        notes: values.notes,
        // Keep existing metadata
        metadata: selectedEvent.metadata || {}
      };

      console.log('Sending update with input:', updateInput);

      const result = await updateBroadcastEvent({
        variables: {
          id: selectedEvent.id,
          input: updateInput
        },
        refetchQueries: [
          { 
            query: GET_BROADCAST_EVENTS, 
            variables: { startDate, endDate } 
          }
        ],
        awaitRefetchQueries: true
      });
      
      console.log('Update result:', result);
      
      messageApi.success('האירוע עודכן בהצלחה!');
      setEditEventModal(false);
      setSelectedEvent(null);
      form.resetFields();
      await refetch();
    } catch (error: any) {
      console.error('Update error:', error);
      messageApi.error(`שגיאה בעדכון האירוע: ${error.message}`);
    }
  };

  // Handle delete event
  const handleDeleteEvent = async (eventId: string) => {
    if (!canDelete) {
      messageApi.error('אין לך הרשאה למחוק אירועים');
      return;
    }
    try {
      await deleteBroadcastEvent({ 
        variables: { id: eventId },
        refetchQueries: [
          { 
            query: GET_BROADCAST_EVENTS, 
            variables: { startDate, endDate } 
          }
        ],
        awaitRefetchQueries: true
      });
      messageApi.success('האירוע נמחק בהצלחה!');
      await refetch();
    } catch (error: any) {
      messageApi.error(`שגיאה במחיקת האירוע: ${error.message}`);
    }
  };

  // Handle batch save from Excel-like UI
  const handleBatchSave = async (events: any[], forceCreate: boolean = false) => {
    if (!canWrite) {
      messageApi.error('אין לך הרשאה ליצור אירועים');
      return;
    }
    try {
      // Track events that were NOT created because of overlap (need user confirmation to force-create).
      // The server-side mutation creates the event only when there is no overlap, or when forceCreate=true.
      // When hasOverlaps && !forceCreate, the server returns success=false without persisting the event,
      // so we must only retry those specific events — not the entire batch — to avoid duplicates.
      const pendingOverlapEvents: any[] = [];
      const overlapMessages: string[] = [];
      let createdCount = 0;

      // Sequential processing with small delay to avoid API 429 (rate limit ~100/min)
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const input = {
          title: event.title || `${event.sport || ''} ${event.league || ''} ${event.homeTeam || ''} vs ${event.awayTeam || ''}`.trim(),
          description: event.description,
          eventType: event.eventType || 'recorded',
          startTime: event.startTime,
          endTime: event.endTime || dayjs(event.startTime).add(2, 'hour').toISOString(),
          channel: event.channel,
          // Sport-specific fields
          koTime: event.koTime,
          sport: event.sport,
          league: event.league,
          stage: event.stage,
          homeTeam: event.homeTeam,
          awayTeam: event.awayTeam,
          parallelChannel: event.parallelChannel,
          channel1_4k: event.channel1_4k || false,
          live: event.live || false,
          notes: event.notes,
          // Legacy fields
          source: event.source,
          destination: event.destination,
          satellite: event.satellite,
          priority: event.priority || 'normal',
          metadata: event.metadata || {},
        };
        // Execute mutation
        // eslint-disable-next-line no-await-in-loop
        const res = await createBroadcastEvent({
          variables: { input, forceCreate },
          refetchQueries: [
            { query: GET_BROADCAST_EVENTS, variables: { startDate, endDate } }
          ],
          awaitRefetchQueries: true
        });

        const response = res.data?.createBroadcastEventWithOverlapCheck;
        if (response?.success) {
          createdCount++;
        } else if (response?.overlapCheck?.hasOverlaps) {
          pendingOverlapEvents.push(event);
          if (response.overlapCheck.message) {
            overlapMessages.push(response.overlapCheck.message);
          }
        }

        // Delay ~800ms between calls (~75/min) to stay under rate limits
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 800));
      }

      if (pendingOverlapEvents.length > 0 && !forceCreate) {
        modal.confirm({
          title: 'זוהו חפיפות ערוצים',
          content: overlapMessages.join('\n'),
          okText: 'צור בכל זאת',
          cancelText: 'ביטול',
          onOk: () => handleBatchSave(pendingOverlapEvents, true),
        });
        // Notify the user that the non-overlapping events were already saved.
        if (createdCount > 0) {
          messageApi.success(`נוצרו ${createdCount} אירועים. ${pendingOverlapEvents.length} ממתינים לאישור חפיפה.`);
          await refetch();
        }
        return;
      }

      messageApi.success(`נוצרו בהצלחה ${createdCount} אירועים`);
      await refetch();
      setBatchCreatorModal(false);
    } catch (error: any) {
      console.error('Error saving batch events:', error);
      messageApi.error(`שגיאה בשמירת האירועים: ${error.message}`);
    }
  };

  // Compact columns - Essential info only with NICE UI
  const compactColumns: ColumnsType<BroadcastEvent> = [
    {
      title: 'זמן',
      key: 'datetime',
      width: 140,
      render: (_, record) => {
        const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        const dayName = days[dayjs(record.startTime).day()];
        const isToday = dayjs(record.startTime).isSame(dayjs(), 'day');
        const isTomorrow = dayjs(record.startTime).isSame(dayjs().add(1, 'day'), 'day');
        
        return (
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ 
              fontSize: '13px', 
              fontWeight: 600,
              color: isToday ? '#1890ff' : isTomorrow ? '#52c41a' : '#000'
            }}>
              {isToday ? 'היום' : isTomorrow ? 'מחר' : dayName}
            </div>
            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
              {dayjs(record.startTime).format('DD/MM')}
            </div>
            <div style={{ 
              fontSize: '16px', 
              fontWeight: 'bold',
              color: '#262626',
              marginTop: '2px'
            }}>
              {dayjs(record.startTime).format('HH:mm')}
            </div>
          </div>
        );
      },
    },
    {
      title: 'משחק / אירוע',
      key: 'event',
      width: 350,
      render: (_, record) => {
        const hasTeams = record.homeTeam || record.awayTeam;
        const eventTitle = record.title || `${record.homeTeam || ''} - ${record.awayTeam || ''}`.trim() || 'אירוע';
        
        return (
          <div style={{ padding: '8px 0' }}>
            {hasTeams ? (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px',
                fontSize: '15px',
                fontWeight: 500
              }}>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {record.homeTeam || '-'}
                </span>
                <span style={{ 
                  color: '#8c8c8c', 
                  fontSize: '14px',
                  fontWeight: 400
                }}>
                  נגד
                </span>
                <span style={{ flex: 1, textAlign: 'right' }}>
                  {record.awayTeam || '-'}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: '15px', fontWeight: 500 }}>
                {eventTitle}
              </div>
            )}
            {record.league && (
              <div style={{ 
                fontSize: '12px', 
                color: '#8c8c8c',
                marginTop: '4px'
              }}>
                {record.league} {record.stage ? `• ${record.stage}` : ''}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'שידור',
      key: 'broadcast',
      width: 150,
      render: (_, record) => {
        const overlaps = getChannelOverlaps(record);
        const hasOverlaps = overlaps.length > 0;
        
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: '4px', position: 'relative' }}>
              <Tag 
                color={record.channel?.includes('5') ? 'blue' : 'default'}
                style={{ 
                  fontSize: '13px',
                  padding: '2px 8px',
                  fontWeight: 500
                }}
              >
                {record.channel || 'ללא ערוץ'}
              </Tag>
              {hasOverlaps && (
                <Tooltip 
                  title={
                    <div>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        חפיפת ערוץ עם {overlaps.length} אירועים:
                      </div>
                      {overlaps.map((overlap, index) => (
                        <div key={index} style={{ marginBottom: '2px' }}>
                          • {overlap.title || (overlap as any).hebrewTitle || 'אירוע ללא שם'}
                          <br />
                          <span style={{ fontSize: '11px', opacity: 0.8 }}>
                            {new Date(overlap.startTime).toLocaleString('he-IL', { 
                              hour: '2-digit', 
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit'
                            })} - {new Date(overlap.endTime).toLocaleString('he-IL', { 
                              hour: '2-digit', 
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  }
                >
                  <ExclamationCircleOutlined 
                    style={{ 
                      position: 'absolute',
                      top: '-8px',
                      right: '-8px',
                      fontSize: '16px',
                      color: '#ff4d4f',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      padding: '2px'
                    }} 
                  />
                </Tooltip>
              )}
            </div>
            <div>
              {record.live ? (
                <Tag 
                  color="red"
                  style={{ 
                    margin: 0,
                    padding: '2px 8px',
                    fontSize: '12px',
                    fontWeight: 600
                  }}
                >
                  שידור חי
                </Tag>
              ) : (
                <Tag 
                  color="default"
                  style={{ 
                    margin: 0,
                    padding: '2px 8px',
                    fontSize: '12px'
                  }}
                >
                  מוקלט
                </Tag>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: 'הערות',
      dataIndex: 'notes',
      key: 'notes',
      width: 200,
      ellipsis: true,
      render: (value) => (
        <span style={{ 
          fontSize: '13px',
          color: value ? '#262626' : '#8c8c8c',
          fontStyle: value ? 'normal' : 'italic'
        }}>
          {value || 'אין הערות'}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      fixed: 'right',
      render: (_, record) => {
        const dropdownItems: any[] = [
          {
            key: 'departments',
            icon: <AppstoreOutlined />,
            label: canEdit ? 'ניהול מחלקות' : 'צפייה במחלקות',
            onClick: (info: any) => {
              info.domEvent?.stopPropagation();
              setSelectedEvent(record);
              setDepartmentModal(true);
            }
          },
        ];

        if (canEdit) {
          dropdownItems.push({
            key: 'edit',
            icon: <EditOutlined />,
            label: 'עריכת אירוע',
            onClick: (info: any) => {
              info.domEvent?.stopPropagation();
              setSelectedEvent(record);
              setEditEventModal(true);
              setTimeout(() => {
                form.setFieldsValue({
                  title: record.title,
                  startTime: dayjs(record.startTime),
                  endTime: dayjs(record.endTime),
                  koTime: record.koTime ? dayjs(record.koTime) : null,
                  contentType: record.sport || record.contentType,
                  league: record.league,
                  stage: record.stage,
                  homeTeam: record.homeTeam,
                  awayTeam: record.awayTeam,
                  channel: record.channel,
                  parallelChannel: record.parallelChannel,
                  channel1_4k: record.channel1_4k || false,
                  live: record.live || false,
                  notes: record.notes,
                  eventType: record.eventType || 'recorded',
                });
              }, 100);
            }
          });
        }

        if (canDelete) {
          dropdownItems.push({ type: 'divider' });
          dropdownItems.push({
            key: 'delete',
            icon: <DeleteOutlined />,
            label: 'מחיקה',
            danger: true,
            onClick: (info: any) => {
              info.domEvent?.stopPropagation();
              modal.confirm({
                title: 'האם אתה בטוח?',
                content: 'פעולה זו תמחק את האירוע לצמיתות',
                okText: 'מחק',
                cancelText: 'ביטול',
                okButtonProps: { danger: true },
                onOk: () => handleDeleteEvent(record.id)
              });
            }
          });
        }

        return (
        <Dropdown
          menu={{ items: dropdownItems }}
          trigger={['click']}
        >
          <Button 
            type="text" 
            icon={<MoreOutlined />}
            style={{ width: '32px' }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </Dropdown>
        );
      },
    },
  ];

  // Full table columns - All sport broadcast fields
  const fullColumns: ColumnsType<BroadcastEvent> = [
    {
      title: 'שבוע',
      dataIndex: 'week',
      key: 'week',
      render: (_, record) => getIsraeliWeekNumber(dayjs(record.startTime)),
    },
    {
      title: 'יום',
      dataIndex: 'day',
      key: 'day',
      render: (_, record) => {
        const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        return days[dayjs(record.startTime).day()];
      },
    },
    {
      title: 'תאריך',
      dataIndex: 'date',
      key: 'date',
      render: (_, record) => dayjs(record.startTime).format('DD/MM'),
    },
    {
      title: 'שעה',
      dataIndex: 'time',
      key: 'time',
      render: (_, record) => dayjs(record.startTime).format('HH:mm'),
    },
    {
      title: 'KO / TO',
      dataIndex: 'koTime',
      key: 'koTime',
      render: (_, record) => record.koTime ? dayjs(record.koTime).format('HH:mm') : '-',
    },
    {
      title: 'ענף',
      dataIndex: 'sport',
      key: 'sport',
      render: (_, record) => record.contentType || '-',
    },
    {
      title: 'ליגה/ענף',
      dataIndex: 'league',
      key: 'league',
      render: (_, record) => record.league || '-',
    },
    {
      title: 'שלב',
      dataIndex: 'stage',
      key: 'stage',
      render: (_, record) => record.stage || '-',
    },
    {
      title: 'מארחת',
      dataIndex: 'homeTeam',
      key: 'homeTeam',
      render: (_, record) => record.homeTeam || record.title || '-',
    },
    {
      title: 'אורחת',
      dataIndex: 'awayTeam',
      key: 'awayTeam',
      render: (_, record) => record.awayTeam || '-',
    },
    {
      title: 'ערוץ',
      dataIndex: 'channel',
      key: 'channel',
    },
    {
      title: 'ערוץ מקביל',
      dataIndex: 'parallelChannel',
      key: 'parallelChannel',
      render: (value) => value || '-',
    },
    {
      title: '5 SPORT 4K',
      dataIndex: 'channel1_4k',
      key: 'channel1_4k',
      render: (value) => value ? <Tag color="green">כן</Tag> : <Tag>לא</Tag>,
    },
    {
      title: 'ישיר',
      dataIndex: 'live',
      key: 'live',
      render: (value) => value ? <Tag color="red">חי</Tag> : <Tag>מוקלט</Tag>,
    },
    {
      title: 'סיום',
      dataIndex: 'endTime',
      key: 'endTime',
      render: (_, record) => dayjs(record.endTime).format('HH:mm'),
    },
    {
      title: 'הערות',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: 'כ"ס',
      dataIndex: 'totalCrew',
      key: 'totalCrew',
      render: () => '-',
    },
    {
      title: 'פעולות',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button 
            type="text" 
            icon={<PlaySquareOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedEvent(record);
              setDepartmentModal(true);
            }}
            title="מחלקות"
          />
          {canEdit && (
            <Button 
              type="text" 
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                              console.log('Edit button clicked for record:', record);
                console.log('Record sport fields:', {
                  sport: record.sport,
                  league: record.league,
                  stage: record.stage,
                  homeTeam: record.homeTeam,
                  awayTeam: record.awayTeam,
                  parallelChannel: record.parallelChannel,
                  channel1_4k: record.channel1_4k,
                  live: record.live,
                  notes: record.notes,
                });
                setSelectedEvent(record);
                setEditEventModal(true);
                // Set form values after a small delay to ensure modal is open
                setTimeout(() => {
                  const formValues = {
                      title: record.title,
                      startTime: dayjs(record.startTime),
                      endTime: dayjs(record.endTime),
                      koTime: record.koTime ? dayjs(record.koTime) : null,
                      contentType: record.sport || record.contentType,
                      league: record.league,
                      stage: record.stage,
                      homeTeam: record.homeTeam,
                      awayTeam: record.awayTeam,
                      parallelChannel: record.parallelChannel,
                      channel1_4k: record.channel1_4k,
                      live: record.live,
                      notes: record.notes,
                      eventType: record.eventType || 'recorded',
                    };
                    console.log('Setting form values:', formValues);
                    form.setFieldsValue(formValues);
                  }, 100);
                }}
            />
          )}
          {canDelete && (
            <Popconfirm
              title="האם אתה בטוח שברצונך למחוק את האירוע?"
              onConfirm={() => {
                handleDeleteEvent(record.id);
              }}
            >
              <Button 
                type="text" 
                danger 
                icon={<DeleteOutlined />} 
                onClick={(e) => e.stopPropagation()}
              />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // Navigation functions
  const navigatePrevious = () => {
    switch (viewMode) {
      case 'daily':
        setCurrentDate(currentDate.subtract(1, 'day'));
        break;
      case 'weekly':
        setCurrentDate(currentDate.subtract(1, 'week'));
        break;
      case 'monthly':
        setCurrentDate(currentDate.subtract(1, 'month'));
        break;
    }
  };

  const navigateNext = () => {
    switch (viewMode) {
      case 'daily':
        setCurrentDate(currentDate.add(1, 'day'));
        break;
      case 'weekly':
        setCurrentDate(currentDate.add(1, 'week'));
        break;
      case 'monthly':
        setCurrentDate(currentDate.add(1, 'month'));
        break;
    }
  };

  const getDisplayTitle = () => {
    switch (viewMode) {
      case 'daily':
        return currentDate.format('DD MMMM YYYY');
      case 'weekly':
        return `שבוע ${getIsraeliWeekNumber(currentDate)}, ${currentDate.format('MMMM YYYY')}`;
      case 'monthly':
        return currentDate.format('MMMM YYYY');
    }
  };

  // Filter helper functions
  const clearAllFilters = () => {
    setFilters({
      channels: [],
      sports: [],
      leagues: [],
      teams: [],
      eventTypes: [],
      departmentStatus: [],
      timeRange: null,
      has4K: null,
      hasParallelChannel: null,
      searchText: ''
    });
    setSearchText('');
  };

  const applyPreset = (preset: FilterPreset) => {
    setFilters(preset.filters);
    setSearchText(preset.filters.searchText);
  };

  const saveFilterPreset = (name: string) => {
    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name,
      filters: { ...filters, searchText }
    };
    setFilterPresets([...filterPresets, newPreset]);
    messageApi.success('הפילטר נשמר בהצלחה');
  };

  const deleteFilterPreset = (id: string) => {
    setFilterPresets(filterPresets.filter(p => p.id !== id));
    messageApi.success('הפילטר נמחק');
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.channels.length > 0) count++;
    if (filters.sports.length > 0) count++;
    if (filters.leagues.length > 0) count++;
    if (filters.teams.length > 0) count++;
    if (filters.eventTypes.length > 0) count++;
    if (filters.departmentStatus.length > 0) count++;
    if (filters.timeRange !== null) count++;
    if (filters.has4K !== null) count++;
    if (filters.hasParallelChannel !== null) count++;
    if (filters.searchText || searchText) count++;
    return count;
  };

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Row gutter={[16, 16]} align="middle">
          <Col flex="auto">
            <Space>
              <Button icon={<LeftOutlined />} onClick={navigatePrevious} />
              <Title level={3} style={{ margin: 0 }}>{getDisplayTitle()}</Title>
              <Button icon={<RightOutlined />} onClick={navigateNext} />
              <Button onClick={() => setCurrentDate(dayjs())}>היום</Button>
            </Space>
          </Col>
          <Col>
            <Space>
              <Select value={viewMode} onChange={setViewMode} style={{ width: 100 }}>
                <Option value="daily">יומי</Option>
                <Option value="weekly">שבועי</Option>
                <Option value="monthly">חודשי</Option>
              </Select>
              <Select value={tableDisplayMode} onChange={setTableDisplayMode} style={{ width: 100 }}>
                <Option value="compact">קומפקטי</Option>
                <Option value="full">מלא</Option>
              </Select>
              {canWrite && (
                <Button 
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateEventModal(true)}
                >
                  אירוע חדש
                </Button>
              )}
              {canWrite && (
                <Button 
                  icon={<TableOutlined />}
                  onClick={() => setFileImportSelectionModal(true)}
                >
                  יצירה בקבצים
                </Button>
              )}
              <Button 
                icon={<PlaySquareOutlined />}
                onClick={() => {
                  if (filteredEvents.length > 0) {
                    setSelectedEvent(filteredEvents[0]);
                    setDepartmentModal(true);
                  } else {
                    messageApi.warning('אין אירועים להצגה');
                  }
                }}
              >
                שידורי לווין
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
                רענן
              </Button>
            </Space>
          </Col>
        </Row>

        <Row style={{ marginTop: 16 }} gutter={16}>
          <Col span={8}>
            <Input
              placeholder="חיפוש..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={16}>
            <Space>
              <Badge count={getActiveFilterCount()} offset={[-5, 5]}>
                <Button 
                  icon={<FilterOutlined />}
                  onClick={() => setShowAdvancedFilters(true)}
                  type={hasActiveFilters ? 'primary' : 'default'}
                >
                  סינון מתקדם
                </Button>
              </Badge>
              {hasActiveFilters && (
                <Button 
                  icon={<ClearOutlined />}
                  onClick={clearAllFilters}
                  danger
                >
                  נקה סינונים
                </Button>
              )}
              <Dropdown
                menu={{
                  items: filterPresets.map(preset => ({
                    key: preset.id,
                    label: preset.name,
                    icon: preset.isDefault ? <SaveOutlined /> : undefined,
                    onClick: () => applyPreset(preset)
                  }))
                }}
                placement="bottomLeft"
              >
                <Button>
                  סינונים מוכנים
                </Button>
              </Dropdown>
            </Space>
          </Col>
        </Row>

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <Row style={{ marginTop: 16 }}>
            <Col span={24}>
              <Card size="small" style={{ backgroundColor: '#f0f2f5' }}>
                <Space wrap>
                  <span style={{ fontWeight: 'bold' }}>פילטרים פעילים:</span>
                  
                  {filters.channels.length > 0 && (
                    <Tag 
                      closable 
                      onClose={() => setFilters({ ...filters, channels: [] })}
                      color="blue"
                    >
                      ערוצים: {filters.channels.join(', ')}
                    </Tag>
                  )}
                  
                  {filters.sports.length > 0 && (
                    <Tag 
                      closable 
                      onClose={() => setFilters({ ...filters, sports: [] })}
                      color="green"
                    >
                      ספורט: {filters.sports.join(', ')}
                    </Tag>
                  )}
                  
                  {filters.leagues.length > 0 && (
                    <Tag 
                      closable 
                      onClose={() => setFilters({ ...filters, leagues: [] })}
                      color="purple"
                    >
                      ליגות: {filters.leagues.join(', ')}
                    </Tag>
                  )}
                  
                  {filters.teams.length > 0 && (
                    <Tag 
                      closable 
                      onClose={() => setFilters({ ...filters, teams: [] })}
                      color="orange"
                    >
                      קבוצות: {filters.teams.length} נבחרו
                    </Tag>
                  )}
                  
                  {filters.eventTypes.length > 0 && (
                    <Tag 
                      closable 
                      onClose={() => setFilters({ ...filters, eventTypes: [] })}
                      color="red"
                    >
                      {filters.eventTypes.map(t => t === 'live' ? 'חי' : 'מוקלט').join(', ')}
                    </Tag>
                  )}
                  
                  {filters.departmentStatus.length > 0 && (
                    <Tag 
                      closable 
                      onClose={() => setFilters({ ...filters, departmentStatus: [] })}
                      color="gold"
                    >
                      סטטוס מחלקות: {filters.departmentStatus.length}
                    </Tag>
                  )}
                  
                  {filters.has4K !== null && (
                    <Tag 
                      closable 
                      onClose={() => setFilters({ ...filters, has4K: null })}
                      color="cyan"
                    >
                      4K: {filters.has4K ? 'כן' : 'לא'}
                    </Tag>
                  )}
                  
                  {filters.hasParallelChannel !== null && (
                    <Tag 
                      closable 
                      onClose={() => setFilters({ ...filters, hasParallelChannel: null })}
                      color="magenta"
                    >
                      ערוץ מקביל: {filters.hasParallelChannel ? 'יש' : 'אין'}
                    </Tag>
                  )}
                  
                  {filters.timeRange && filters.timeRange[0] && filters.timeRange[1] && (
                    <Tag 
                      closable 
                      onClose={() => setFilters({ ...filters, timeRange: null })}
                      color="volcano"
                    >
                      {filters.timeRange[0].format('DD/MM')} - {filters.timeRange[1].format('DD/MM')}
                    </Tag>
                  )}
                  
                  <Divider type="vertical" />
                  
                  <span style={{ color: '#1890ff', fontWeight: 'bold' }}>
                    {filteredEvents.length} אירועים מוצגים
                  </span>
                </Space>
              </Card>
            </Col>
          </Row>
        )}
      </Card>

      <Card style={{ marginTop: 16 }}>
        {loading && <Spin size="large" />}
        {error && (
          <Alert
            message="שגיאה בטעינת נתונים"
            description={error.message}
            type="error"
            showIcon
          />
        )}
        {!loading && !error && (
          <Table
            columns={tableDisplayMode === 'compact' ? compactColumns : fullColumns}
            dataSource={filteredEvents}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20 }}
            scroll={tableDisplayMode === 'compact' ? { x: 'max-content' } : undefined}
            size={tableDisplayMode === 'compact' ? 'small' : 'middle'}
            onRow={(record) => ({
              onClick: () => handleRowClick(record),
              style: { cursor: 'pointer' }
            })}
            rowClassName={getRowClassName}
          />
        )}
      </Card>

      {/* Department Selection Modal */}
      {/* Use the Beautiful BroadcastEventModal with larger buttons and color map */}
      {selectedEvent && departmentModal && (
        <BroadcastEventModal
          visible={departmentModal}
          event={selectedEvent}
          canEdit={canEdit}
          onClose={async () => {
            setDepartmentModal(false);
            setSelectedEvent(null);
            await refetch(); // Refresh data when modal closes
          }}
          onUpdate={async (updateData) => {
            if (!canEdit) return;
            await updateBroadcastEvent({
              variables: {
                id: selectedEvent.id,
                input: updateData
              },
              refetchQueries: [
                { 
                  query: GET_BROADCAST_EVENTS, 
                  variables: { startDate, endDate } 
                }
              ],
              awaitRefetchQueries: true
            });
          }}
          onDataSaved={async () => await refetch()}
        />
      )}

      {/* Create Event Modal - Sport Broadcast Format */}
      <Modal
        title="יצירת אירוע שידור ספורט"
        open={createEventModal}
        onCancel={() => {
          setCreateEventModal(false);
          form.resetFields();
        }}
        footer={null}
        width={1000}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateEvent}
        >
          {/* Date and Time Row */}
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="startTime"
                label="תאריך ושעה"
                rules={[{ required: true, message: 'חובה לבחור תאריך ושעה' }]}
              >
                <DatePicker showTime needConfirm={false} format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="koTime"
                label="KO / TO (Kick Off / Take Off)"
              >
                <TimePicker format="HH:mm" needConfirm={false} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="endTime"
                label="שעת סיום"
              >
                <DatePicker showTime needConfirm={false} format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {/* Sport Info Row */}
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                name="contentType"
                label="ענף"
              >
                <Input placeholder="כדורגל, כדורסל, טניס..." />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="league"
                label="ליגה/ענף"
              >
                <Input placeholder="ליגת העל, NBA, ליגת האלופות..." />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="stage"
                label="שלב"
              >
                <Input placeholder="חצי גמר, גמר, מחזור 10..." />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="live"
                label="ישיר"
                valuePropName="checked"
              >
                <Switch checkedChildren="חי" unCheckedChildren="מוקלט" />
              </Form.Item>
            </Col>
          </Row>

          {/* Teams Row */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="homeTeam"
                label="מארחת"
              >
                <Input placeholder="שם הקבוצה המארחת" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="awayTeam"
                label="אורחת"
              >
                <Input placeholder="שם הקבוצה האורחת" />
              </Form.Item>
            </Col>
          </Row>

          {/* Channels Row */}
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="channel"
                label="ערוץ"
                rules={[{ required: true, message: 'חובה לבחור ערוץ' }]}
              >
                <Select>
                  <Option value="CHANNEL 1">CHANNEL 1</Option>
                  <Option value="CHANNEL 2">CHANNEL 2</Option>
                  <Option value="CHANNEL 3">CHANNEL 3</Option>
                  <Option value="CHANNEL 4">CHANNEL 4</Option>
                  <Option value="CHANNEL 5">CHANNEL 5</Option>
                  <Option value="CHANNEL 1 4K">CHANNEL 1 4K</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="parallelChannel"
                label="ערוץ מקביל"
              >
                <Select allowClear>
                  <Option value="">ללא</Option>
                  <Option value="CHANNEL 1">CHANNEL 1</Option>
                  <Option value="CHANNEL 2">CHANNEL 2</Option>
                  <Option value="CHANNEL 3">CHANNEL 3</Option>
                  <Option value="CHANNEL 4">CHANNEL 4</Option>
                  <Option value="CHANNEL 5">CHANNEL 5</Option>
                  <Option value="CHANNEL 1 4K">CHANNEL 1 4K</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="channel1_4k"
                label="5 SPORT 4K"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          {/* Title and Notes */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="title"
                label="כותרת אירוע"
                tooltip="אם לא תמלא, הכותרת תיווצר אוטומטית מהקבוצות"
              >
                <Input placeholder="אופציונלי - ייווצר אוטומטית מהקבוצות" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="notes"
                label="הערות"
              >
                <TextArea rows={2} placeholder="הערות נוספות..." />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                יצירת אירוע
              </Button>
              <Button onClick={() => {
                setCreateEventModal(false);
                form.resetFields();
              }}>
                ביטול
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Event Modal - Sport Broadcast Format */}
      <Modal
        title="עריכת אירוע שידור ספורט"
        open={editEventModal && selectedEvent !== null}
        onCancel={() => {
          setEditEventModal(false);
          setSelectedEvent(null);
          form.resetFields();
        }}
        footer={null}
        width={1000}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            if (selectedEvent) {
              handleUpdateEvent(values);
            } else {
              messageApi.error('לא נבחר אירוע לעדכון');
            }
          }}
        >
          {/* Date and Time Row - תאריך, שעה, KO/TO, סיום */}
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="startTime"
                label="תאריך ושעה"
                rules={[{ required: true, message: 'חובה לבחור תאריך ושעה' }]}
              >
                <DatePicker showTime needConfirm={false} format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="koTime"
                label="KO / TO (Kick Off / Take Off)"
              >
                <TimePicker format="HH:mm" needConfirm={false} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="endTime"
                label="שעת סיום"
              >
                <DatePicker showTime needConfirm={false} format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {/* Sport Info Row - ענף, ליגה/ענף, שלב */}
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="contentType"
                label="ענף"
              >
                <Input placeholder="כדורגל, כדורסל, טניס..." />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="league"
                label="ליגה/ענף"
              >
                <Input placeholder="ליגת העל, NBA, ליגת האלופות..." />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="stage"
                label="שלב"
              >
                <Input placeholder="חצי גמר, גמר, מחזור 10..." />
              </Form.Item>
            </Col>
          </Row>

          {/* Teams Row - מארחת, אורחת */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="homeTeam"
                label="מארחת"
              >
                <Input placeholder="שם הקבוצה המארחת" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="awayTeam"
                label="אורחת"
              >
                <Input placeholder="שם הקבוצה האורחת" />
              </Form.Item>
            </Col>
          </Row>

          {/* Channels Row - ערוץ, ערוץ מקביל, 5 SPORT 4K, ישיר */}
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item
                name="channel"
                label="ערוץ"
                rules={[{ required: true, message: 'חובה לבחור ערוץ' }]}
              >
                <Select>
                  <Option value="CHANNEL 1">CHANNEL 1</Option>
                  <Option value="CHANNEL 2">CHANNEL 2</Option>
                  <Option value="CHANNEL 3">CHANNEL 3</Option>
                  <Option value="CHANNEL 4">CHANNEL 4</Option>
                  <Option value="CHANNEL 5">CHANNEL 5</Option>
                  <Option value="CHANNEL 1 4K">CHANNEL 1 4K</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="parallelChannel"
                label="ערוץ מקביל"
              >
                <Select allowClear>
                  <Option value="">ללא</Option>
                  <Option value="CHANNEL 1">CHANNEL 1</Option>
                  <Option value="CHANNEL 2">CHANNEL 2</Option>
                  <Option value="CHANNEL 3">CHANNEL 3</Option>
                  <Option value="CHANNEL 4">CHANNEL 4</Option>
                  <Option value="CHANNEL 5">CHANNEL 5</Option>
                  <Option value="CHANNEL 1 4K">CHANNEL 1 4K</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="channel1_4k"
                label="5 SPORT 4K"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                name="live"
                label="ישיר"
                valuePropName="checked"
              >
                <Switch checkedChildren="חי" unCheckedChildren="מוקלט" />
              </Form.Item>
            </Col>
          </Row>

          {/* Notes and Title Row - הערות */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="title"
                label="כותרת אירוע"
                tooltip="אם לא תמלא, הכותרת תיווצר אוטומטית מהקבוצות"
              >
                <Input placeholder="אופציונלי - ייווצר אוטומטית מהקבוצות" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="notes"
                label="הערות"
              >
                <TextArea rows={2} placeholder="הערות נוספות..." />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                עדכון אירוע
              </Button>
              <Button onClick={() => {
                setEditEventModal(false);
                setSelectedEvent(null);
                form.resetFields();
              }}>
                ביטול
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Department modals are now handled inside BroadcastEventModal */}

      {/* Batch Creator Modal */}
      {batchCreatorModal && (
        <BatchEventCreator
          visible={batchCreatorModal}
          onClose={() => setBatchCreatorModal(false)}
          onSave={handleBatchSave}
        />
      )}

      {/* File Import Selection Modal */}
      <Modal
        title="בחר שיטת יצירה"
        open={fileImportSelectionModal}
        onCancel={() => setFileImportSelectionModal(false)}
        footer={null}
        width={500}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card
            hoverable
            style={{ cursor: 'pointer' }}
            onClick={() => {
              setFileImportSelectionModal(false);
              setBatchCreatorModal(true);
            }}
          >
            <Space>
              <TableOutlined style={{ fontSize: 24, color: '#1890ff' }} />
              <div>
                <h4 style={{ margin: 0 }}>יצירת אירועים בטבלה</h4>
                <p style={{ margin: '4px 0 0 0', color: '#666' }}>
                  צרו אירועים באמצעות ממשק טבלאי (Excel-like)
                </p>
              </div>
            </Space>
          </Card>

          <Card hoverable style={{ cursor: 'pointer' }}>
            <Upload
              accept=".xlsx,.xls"
              showUploadList={false}
              beforeUpload={async (file) => {
                setFileImportSelectionModal(false);
                try {
                  messageApi.info('מעבד קובץ Excel...');

                  const formData = new FormData();
                  formData.append('file', file);

                  const excelParserUrl = process.env.NEXT_PUBLIC_EXCEL_PARSER_URL || 'http://localhost:4002';
                  const response = await fetch(`${excelParserUrl}/parse-broadcast-schedule`, {
                    method: 'POST',
                    body: formData
                  });

                  if (!response.ok) {
                    throw new Error(`Server error: ${response.status}`);
                  }

                  const result = await response.json();

                  if (result.success) {
                    messageApi.success(`נטענו ${result.events.length} אירועים מקובץ Excel!`);

                      const eventsToCreate = result.events.map((event: any) => {
                      // Prefer top-level parsed fields first
                      const raw = event.metadata?.raw || {};
                      const cd = event.metadata?.customData || {};

                      const parseDateStrict = (s: string) => {
                        const candidates = ['DD/MM/YYYY', 'D/M/YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD'];
                        for (const f of candidates) {
                          const d = dayjs.tz(s, f, 'Asia/Jerusalem');
                          if (d.isValid()) return d;
                        }
                        return dayjs.tz(s, 'Asia/Jerusalem');
                      };

                      const normalizeHHmm = (val: string) => {
                        if (!val) return '';
                        const m = val.match(/^(\d{1,2}):(\d{2})/);
                        if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
                        const d = dayjs(val);
                        return d.isValid() ? d.format('HH:mm') : '';
                      };

                      const dateStr = String(cd.date || raw['תאריך'] || event.date || '').trim();
                      const baseDate = parseDateStrict(dateStr);
                      const startHHmm = normalizeHHmm(String(cd.startTime || raw['שעה'] || event.startTime || '').trim());
                      const endHHmm = normalizeHHmm(String(cd.endTime || raw['סיום'] || event.endTime || '').trim());
                      const koHHmm = normalizeHHmm(String(cd.koTime || raw['KO / TO'] || event.koTime || '').trim());

                      // Build absolute times in Asia/Jerusalem, then to ISO
                      const startDateTime = baseDate.isValid() && startHHmm
                        ? dayjs.tz(`${baseDate.format('DD/MM/YYYY')} ${startHHmm}`, 'DD/MM/YYYY HH:mm', 'Asia/Jerusalem')
                        : baseDate.startOf('day');
                      let endDateTime = baseDate.isValid() && endHHmm
                        ? dayjs.tz(`${baseDate.format('DD/MM/YYYY')} ${endHHmm}`, 'DD/MM/YYYY HH:mm', 'Asia/Jerusalem')
                        : startDateTime.add(2, 'hour');
                      if (endDateTime.isBefore(startDateTime)) endDateTime = endDateTime.add(1, 'day');

                      const koTimeISO = baseDate.isValid() && koHHmm
                        ? dayjs.tz(`${baseDate.format('DD/MM/YYYY')} ${koHHmm}`, 'DD/MM/YYYY HH:mm', 'Asia/Jerusalem').toISOString()
                        : null;

                      const channel = cd.channel || raw['ערוץ'] || event.channel || 'CHANNEL 1';
                      const evType = event.eventType || (event.live ? 'live' : 'recorded') || 'recorded';
                      const sport = cd.sport || raw['ענף'] || event.sport || '';
                      const league = cd.league || raw['ליגה/ענף'] || event.league || '';
                      const stage = cd.stage || raw['שלב'] || event.stage || '';
                      const homeTeam = cd.homeTeam || raw['מארחת'] || event.homeTeam || '';
                      const awayTeam = cd.awayTeam || raw['אורחת'] || event.awayTeam || '';
                      const parallelChannel = cd.parallelChannel || raw['ערוץ מקביל'] || event.parallelChannel || null;
                      const liveFlag = cd.live === 'ישיר' || raw['ישיר'] === 'ישיר' || evType === 'live';

                      return {
                        title: event.title || (homeTeam || awayTeam ? `${homeTeam || ''} נגד ${awayTeam || ''}`.trim() : ''),
                        eventType: evType,
                        startTime: startDateTime.toISOString(),
                        endTime: endDateTime.toISOString(),
                        channel,
                        sport,
                        league,
                        stage,
                        homeTeam,
                        awayTeam,
                        koTime: koTimeISO,
                        parallelChannel,
                        channel1_4k: Boolean(cd.channel1_4k || raw['5 SPORT 4K'] || event.channel1_4k) || false,
                        live: liveFlag,
                        notes: event.notes || cd.notes || raw['הערות'] || '',
                        metadata: { ...(event.metadata || {}), customData: event }
                      };
                    });

                    modal.confirm({
                      title: `האם לייבא ${eventsToCreate.length} אירועים?`,
                      content: (
                        <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                          <p>דוגמת אירועים שיובאו:</p>
                          {eventsToCreate.slice(0, 5).map((event: any, index: number) => (
                            <div key={index} style={{ marginBottom: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                              <strong>{event.title}</strong><br />
                              {dayjs(event.startTime).format('DD/MM/YYYY HH:mm')} | {event.channel}
                            </div>
                          ))}
                          {eventsToCreate.length > 5 && <p>...ועוד {eventsToCreate.length - 5} אירועים</p>}
                        </div>
                      ),
                      width: 600,
                      okText: 'ייבא',
                      cancelText: 'ביטול',
                      onOk: async () => {
                        await handleBatchSave(eventsToCreate, true);
                        messageApi.success('האירועים יובאו בהצלחה!');
                      }
                    });
                  } else {
                    messageApi.error(`שגיאה בפענוח הקובץ: ${result.errors?.join(', ') || 'Unknown error'}`);
                  }
                } catch (error: any) {
                  console.error('Error importing Excel:', error);
                  messageApi.error(`שגיאה בייבוא קובץ Excel: ${error.message}`);
                }
                return false; // prevent auto upload
              }}
            >
              <Space>
                <UploadOutlined style={{ fontSize: 24, color: '#52c41a' }} />
                <div>
                  <h4 style={{ margin: 0 }}>ייבוא מקובץ Excel</h4>
                  <p style={{ margin: '4px 0 0 0', color: '#666' }}>
                    העלו קובץ Excel עם אירועי שידור
                  </p>
                </div>
              </Space>
            </Upload>
          </Card>
        </Space>
      </Modal>

      {/* Advanced Filters Modal */}
      <Modal
        title={
          <Space>
            <FilterOutlined />
            <span>סינון מתקדם</span>
            {hasActiveFilters && (
              <Tag color="blue">{getActiveFilterCount()} פילטרים פעילים</Tag>
            )}
          </Space>
        }
        open={showAdvancedFilters}
        onCancel={() => setShowAdvancedFilters(false)}
        width={800}
        footer={[
          <Button key="clear" onClick={clearAllFilters} danger>
            נקה הכל
          </Button>,
          <Button key="cancel" onClick={() => setShowAdvancedFilters(false)}>
            ביטול
          </Button>,
          <Button 
            key="apply" 
            type="primary" 
            onClick={() => {
              setShowAdvancedFilters(false);
              messageApi.success(`${filteredEvents.length} אירועים לאחר סינון`);
            }}
          >
            החל סינונים
          </Button>
        ]}
      >
        <Form layout="vertical">
          {/* Basic Filters */}
          <Divider orientation="left">סינונים בסיסיים</Divider>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="ערוצים">
                <Select
                  mode="multiple"
                  placeholder="בחר ערוצים"
                  value={filters.channels}
                  onChange={(value) => setFilters({ ...filters, channels: value })}
                  style={{ width: '100%' }}
                  maxTagCount="responsive"
                >
                  {filterOptions.channels.map(channel => (
                    <Option key={channel} value={channel}>{channel}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="ענפי ספורט">
                <Select
                  mode="multiple"
                  placeholder="בחר ענפים"
                  value={filters.sports}
                  onChange={(value) => setFilters({ ...filters, sports: value })}
                  style={{ width: '100%' }}
                  maxTagCount="responsive"
                >
                  {filterOptions.sports.map(sport => (
                    <Option key={sport} value={sport}>{sport}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="ליגות">
                <Select
                  mode="multiple"
                  placeholder="בחר ליגות"
                  value={filters.leagues}
                  onChange={(value) => setFilters({ ...filters, leagues: value })}
                  style={{ width: '100%' }}
                  maxTagCount="responsive"
                >
                  {filterOptions.leagues.map(league => (
                    <Option key={league} value={league}>{league}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="קבוצות">
                <Select
                  mode="multiple"
                  placeholder="בחר קבוצות"
                  value={filters.teams}
                  onChange={(value) => setFilters({ ...filters, teams: value })}
                  style={{ width: '100%' }}
                  maxTagCount="responsive"
                  showSearch
                  filterOption={(input, option) =>
                    !!option?.children?.toString().toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {filterOptions.teams.map(team => (
                    <Option key={team} value={team}>{team}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* Event Properties */}
          <Divider orientation="left">מאפייני אירוע</Divider>
          
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="סוג שידור">
                <Checkbox.Group
                  value={filters.eventTypes}
                  onChange={(value) => setFilters({ ...filters, eventTypes: value as ('live' | 'recorded')[] })}
                >
                  <Space direction="vertical">
                    <Checkbox value="live">שידור חי</Checkbox>
                    <Checkbox value="recorded">מוקלט</Checkbox>
                  </Space>
                </Checkbox.Group>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="שידורי 4K">
                <Select
                  placeholder="כל השידורים"
                  value={filters.has4K}
                  onChange={(value) => setFilters({ ...filters, has4K: value })}
                  style={{ width: '100%' }}
                  allowClear
                >
                  <Option value={true}>כן</Option>
                  <Option value={false}>לא</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="ערוץ מקביל">
                <Select
                  placeholder="כל השידורים"
                  value={filters.hasParallelChannel}
                  onChange={(value) => setFilters({ ...filters, hasParallelChannel: value })}
                  style={{ width: '100%' }}
                  allowClear
                >
                  <Option value={true}>יש</Option>
                  <Option value={false}>אין</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* Department Status */}
          <Divider orientation="left">סטטוס מחלקות</Divider>
          
          <Form.Item>
            <Checkbox.Group
              value={filters.departmentStatus}
              onChange={(value) => setFilters({ ...filters, departmentStatus: value as ('complete' | 'partial' | 'empty')[] })}
            >
              <Space>
                <Checkbox value="complete">
                  <Tag color="success">מלא</Tag>
                </Checkbox>
                <Checkbox value="partial">
                  <Tag color="warning">חלקי</Tag>
                </Checkbox>
                <Checkbox value="empty">
                  <Tag color="error">ריק</Tag>
                </Checkbox>
              </Space>
            </Checkbox.Group>
          </Form.Item>

          {/* Time Range */}
          <Divider orientation="left">טווח זמן מותאם</Divider>
          
          <Form.Item label="טווח תאריכים">
            <DatePicker.RangePicker
              value={filters.timeRange}
              onChange={(value) => setFilters({ ...filters, timeRange: value })}
              style={{ width: '100%' }}
              showTime
              format="DD/MM/YYYY HH:mm"
              placeholder={['תאריך התחלה', 'תאריך סיום']}
            />
          </Form.Item>

          {/* Save Filter */}
          <Divider orientation="left">שמירת פילטר</Divider>
          
          <Space>
            <Input
              placeholder="שם הפילטר"
              style={{ width: 200 }}
              onPressEnter={(e) => {
                const value = (e.target as HTMLInputElement).value;
                if (value) {
                  saveFilterPreset(value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <Button
              icon={<SaveOutlined />}
              onClick={() => {
                const input = document.querySelector('input[placeholder="שם הפילטר"]') as HTMLInputElement;
                if (input?.value) {
                  saveFilterPreset(input.value);
                  input.value = '';
                }
              }}
            >
              שמור פילטר
            </Button>
          </Space>

          {/* Saved Filters */}
          {filterPresets.filter(p => !p.isDefault).length > 0 && (
            <>
              <Divider orientation="left">פילטרים שמורים</Divider>
              <Space wrap>
                {filterPresets.filter(p => !p.isDefault).map(preset => (
                  <Tag
                    key={preset.id}
                    closable
                    onClose={() => deleteFilterPreset(preset.id)}
                    style={{ cursor: 'pointer' }}
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.name}
                  </Tag>
                ))}
              </Space>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
};

// Wrap with App component to provide message context  
const BroadcastPlanningPageWithApp: React.FC = () => {
  return (
    <ProtectedRoute requires={Permission.BROADCAST_VIEW}>
      <App>
        <BroadcastPlanningPage />
      </App>
    </ProtectedRoute>
  );
};

export default BroadcastPlanningPageWithApp; 