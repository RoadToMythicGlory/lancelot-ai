import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Modal, 
  Button, 
  Card, 
  Space, 
  Input, 
  Select, 
  Table, 
  Checkbox, 
  Tag, 
  Row, 
  Col, 
  Typography,
  Empty,
  Tooltip,
  DatePicker,
  App
} from 'antd';
import { 
  PlayCircleOutlined, 
  SearchOutlined, 
  FilterOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  LeftOutlined,
  RightOutlined
} from '@ant-design/icons';
import { useMutation, useQuery } from '@apollo/client';
import { UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA } from '../../graphql/mutations';
import { GET_BROADCAST_EVENTS } from '../../graphql/queries';
import { formatGMTTimeWithOffset } from '../../lib/time-utils';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import 'dayjs/locale/he';
import type { ColumnsType } from 'antd/es/table';
import { getIsraeliWeekNumber, formatIsraeliWeekDisplay } from '../../utils/weekCalculation';

// Configure dayjs
dayjs.locale('he');
dayjs.extend(isoWeek);

const { Option } = Select;
const { Title, Text } = Typography;

interface BroadcastEvent {
  id: string;
  title: string;
  hebrewTitle?: string;
  startTime: string;
  endTime?: string;
  channel?: string;
  sport?: string;
  league?: string;
  homeTeam?: string;
  awayTeam?: string;
  live?: boolean;
  metadata?: {
    departments?: {
      playout?: {
        customData?: {
          isSatelliteBroadcast?: boolean;
        };
      };
    };
  };
}

interface PlayoutDepartmentModalProps {
  visible: boolean;
  event: BroadcastEvent;
  onClose: () => void;
  onDataSaved?: () => void;
}

const PlayoutDepartmentModal: React.FC<PlayoutDepartmentModalProps> = ({ 
  visible, 
  event, 
  onClose, 
  onDataSaved 
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(dayjs());

  // Get date range for fetching events based on selected week (memoized to prevent infinite loops)
  const { startDate, endDate } = useMemo(() => ({
    startDate: selectedWeek.startOf('week').toISOString(), // Sunday
    endDate: selectedWeek.endOf('week').toISOString()       // Saturday
  }), [selectedWeek]);

  // Navigation functions for week selection
  const navigateToPreviousWeek = () => {
    setSelectedWeek(selectedWeek.subtract(1, 'week'));
  };

  const navigateToNextWeek = () => {
    setSelectedWeek(selectedWeek.add(1, 'week'));
  };

  const goToCurrentWeek = () => {
    setSelectedWeek(dayjs());
  };

  // Get display title for selected week
  const getWeekDisplayTitle = () => {
    return formatIsraeliWeekDisplay(selectedWeek);
  };

  // Fetch all broadcast events for selection
  const { data: eventsData, loading: eventsLoading, refetch } = useQuery(GET_BROADCAST_EVENTS, {
    variables: {
      startDate,
      endDate
    },
    skip: !visible,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
    pollInterval: 5000
  });

  // GraphQL mutation for updating department data
  const [updateDepartmentData] = useMutation(UPDATE_BROADCAST_EVENT_DEPARTMENT_DATA, {
    onError: (error) => {
      console.error('❌ Error saving satellite broadcast data:', error);
    }
  });

  const events: BroadcastEvent[] = eventsData?.broadcastEvents || [];
  
  // Prevent infinite loops by ensuring events array is stable
  const stableEventsLength = events.length;

  // Check if event is already marked as satellite broadcast
  const isSatelliteBroadcast = (event: BroadcastEvent): boolean => {
    return event.metadata?.departments?.playout?.customData?.isSatelliteBroadcast || false;
  };

  // Use ref to track initialization
  const hasInitializedRef = useRef(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setSearchText('');
      setChannelFilter(null);
      setSportFilter(null);
      setSelectedEventIds([]);
      hasInitializedRef.current = false;
    }
  }, [visible]);

  // Initialize selected events when data loads
  useEffect(() => {
    if (visible && stableEventsLength > 0 && !eventsLoading && !hasInitializedRef.current) {
      const satelliteEvents = events
        .filter(isSatelliteBroadcast)
        .map(e => e.id);
      
      setSelectedEventIds(satelliteEvents);
      hasInitializedRef.current = true;
    }
  }, [visible, stableEventsLength, eventsLoading]); // Use stable length to avoid array recreations

  // Filter events based on search and filters (memoized to prevent rerenders)
  const filteredEvents = useMemo(() => {
    if (!events || events.length === 0) return [];
    
    let filtered = [...events]; // Create a new array to avoid mutations

    // Search filter
    if (searchText?.trim()) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(event => 
        event.title?.toLowerCase().includes(search) ||
        event.hebrewTitle?.toLowerCase().includes(search) ||
        event.homeTeam?.toLowerCase().includes(search) ||
        event.awayTeam?.toLowerCase().includes(search) ||
        event.sport?.toLowerCase().includes(search) ||
        event.league?.toLowerCase().includes(search) ||
        event.channel?.toLowerCase().includes(search)
      );
    }

    // Channel filter
    if (channelFilter) {
      filtered = filtered.filter(event => event.channel === channelFilter);
    }

    // Sport filter
    if (sportFilter) {
      filtered = filtered.filter(event => event.sport === sportFilter);
    }

    return filtered;
  }, [stableEventsLength, searchText, channelFilter, sportFilter]); // Use stable length instead of events array

  // Get unique channels and sports for filters (memoized)
  const channels = useMemo(() => 
    Array.from(new Set(events.map(e => e.channel).filter(Boolean))), 
    [stableEventsLength]
  );
  const sports = useMemo(() => 
    Array.from(new Set(events.map(e => e.sport).filter(Boolean))), 
    [stableEventsLength]
  );

  // Handle selection change
  const handleSelectionChange = (eventId: string, checked: boolean) => {
    if (checked) {
      setSelectedEventIds(prev => [...prev, eventId]);
    } else {
      setSelectedEventIds(prev => prev.filter(id => id !== eventId));
    }
  };

  // Handle select all filtered
  const handleSelectAllFiltered = () => {
    const filteredIds = filteredEvents.map(e => e.id);
    const newSelection = Array.from(new Set([...selectedEventIds, ...filteredIds]));
    setSelectedEventIds(newSelection);
  };

  // Handle deselect all filtered
  const handleDeselectAllFiltered = () => {
    const filteredIds = filteredEvents.map(e => e.id);
    setSelectedEventIds(prev => prev.filter(id => !filteredIds.includes(id)));
  };

  // Save satellite broadcast selections
  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Update all events with their satellite broadcast status
      const promises = events.map(async (broadcastEvent) => {
        const isSatellite = selectedEventIds.includes(broadcastEvent.id);
        const departmentData = {
          customData: {
            isSatelliteBroadcast: isSatellite,
            notApplicable: false
          }
        };

        return updateDepartmentData({
          variables: {
            eventId: broadcastEvent.id,
            department: 'playout',
            data: departmentData
          }
        });
      });

      await Promise.all(promises);
      message.success(`${selectedEventIds.length} שידורי לוויין עודכנו בהצלחה`);
      
      // Call onDataSaved only once after all updates
      if (onDataSaved) {
        onDataSaved();
      }
      
      onClose();
      
    } catch (error) {
      console.error('Error saving satellite broadcast data:', error);
      message.error('שגיאה בשמירת הנתונים');
    } finally {
      setLoading(false);
    }
  };

  // Mark as not applicable
  const handleNotApplicable = async () => {
    setLoading(true);
    try {
      const departmentData = {
        customData: {
          notApplicable: true,
          isSatelliteBroadcast: false
        }
      };
      
      await updateDepartmentData({
        variables: {
          eventId: event.id,
          department: 'playout',
          data: departmentData
        }
      });
      
      message.success('סומן כלא רלוונטי');
      if (onDataSaved) {
        onDataSaved();
      }
      onClose();
    } catch (error) {
      console.error('Error marking as not applicable:', error);
      message.error('שגיאה בשמירת הנתונים');
    } finally {
      setLoading(false);
    }
  };

  // Table columns
  const columns: ColumnsType<BroadcastEvent> = [
    {
      title: (
        <Checkbox
          indeterminate={
            selectedEventIds.length > 0 && 
            selectedEventIds.length < filteredEvents.length
          }
          checked={
            filteredEvents.length > 0 && 
            filteredEvents.every(e => selectedEventIds.includes(e.id))
          }
          onChange={(e) => {
            if (e.target.checked) {
              handleSelectAllFiltered();
            } else {
              handleDeselectAllFiltered();
            }
          }}
        >
          בחר הכל
        </Checkbox>
      ),
      key: 'select',
      width: 80,
      render: (_, record) => (
        <Checkbox
          checked={selectedEventIds.includes(record.id)}
          onChange={(e) => handleSelectionChange(record.id, e.target.checked)}
        />
      ),
    },
    {
      title: 'זמן ישראל',
      key: 'israelTime',
      width: 100,
      render: (_, record) => {
        const eventDate = dayjs(record.startTime);
        return (
          <div>
            <div className="font-medium">{eventDate.format('DD/MM')}</div>
            <div className="text-sm text-gray-600">{eventDate.format('HH:mm')}</div>
          </div>
        );
      },
    },
    {
      title: 'GMT TIME',
      key: 'gmtTime',
      width: 100,
      render: (_, record) => (
        <div className="font-medium text-green-600">
          {formatGMTTimeWithOffset(record.startTime)}
        </div>
      ),
    },
    {
      title: 'אירוע',
      key: 'event',
      render: (_, record) => {
        const teams = record.homeTeam && record.awayTeam ? 
          `${record.homeTeam} - ${record.awayTeam}` : 
          record.homeTeam || record.awayTeam || '';
        
        return (
          <div>
            <div className="font-medium">{record.hebrewTitle || record.title}</div>
            {teams && <div className="text-sm text-gray-600">{teams}</div>}
            <div className="flex gap-1 mt-1">
              {record.sport && <Tag color="blue">{record.sport}</Tag>}
              {record.league && <Tag color="green">{record.league}</Tag>}
            </div>
          </div>
        );
      },
    },
    {
      title: 'ערוץ',
      key: 'channel',
      width: 100,
      render: (_, record) => (
        <Tag color="purple">{record.channel || '-'}</Tag>
      ),
    },
    {
      title: 'סטטוס',
      key: 'status',
      width: 80,
      render: (_, record) => (
        <div className="flex flex-col gap-1">
          {record.live && <Tag color="red">חי</Tag>}
          {isSatelliteBroadcast(record) && (
            <Tooltip title="שידור לוויין מסומן">
              <Tag color="orange" icon={<GlobalOutlined />}>
                לוויין
              </Tag>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <GlobalOutlined />
          <span>ניהול שידורי לוויין</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={1200}
      footer={[
        <Button key="cancel" onClick={onClose}>
          ביטול
        </Button>,
        <Button 
          key="not-applicable" 
          type="default"
          loading={loading}
          onClick={handleNotApplicable}
        >
          לא רלוונטי לנו
        </Button>,
        <Button 
          key="save" 
          type="primary" 
          loading={loading}
          onClick={handleSubmit}
          icon={<CheckCircleOutlined />}
        >
          שמור שידורי לוויין ({selectedEventIds.length})
        </Button>
      ]}
    >
      <div className="mb-4">
        <Card size="small" className="bg-blue-50">
          <Text>
            בחר שידורים שיסומנו כ"שידורי לוויין". השידורים הנבחרים יוצגו עם זמן GMT 
            ויחושב ההפרש לזמן ישראל (קיץ/חורף).
          </Text>
        </Card>
      </div>

      {/* Week Selection */}
      <div className="mb-4">
        <Card size="small">
          <Row align="middle" justify="space-between">
            <Col>
              <div className="flex items-center gap-2">
                <CalendarOutlined />
                <Text strong>שבוע נבחר:</Text>
                <Text>{getWeekDisplayTitle()}</Text>
              </div>
            </Col>
            <Col>
              <Space.Compact>
                <Button 
                  icon={<LeftOutlined />} 
                  onClick={navigateToPreviousWeek}
                  size="small"
                />
                <Button 
                  onClick={goToCurrentWeek}
                  size="small"
                >
                  השבוע
                </Button>
                <Button 
                  icon={<RightOutlined />} 
                  onClick={navigateToNextWeek}
                  size="small"
                />
              </Space.Compact>
            </Col>
          </Row>
        </Card>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Input
              prefix={<SearchOutlined />}
              placeholder="חיפוש לפי שם אירוע, קבוצה, ענף..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col>
            <Select
              placeholder="ערוץ"
              value={channelFilter}
              onChange={setChannelFilter}
              allowClear
              style={{ width: 120 }}
            >
              {channels.map(channel => (
                <Option key={channel} value={channel}>{channel}</Option>
              ))}
            </Select>
          </Col>
          <Col>
            <Select
              placeholder="ענף"
              value={sportFilter}
              onChange={setSportFilter}
              allowClear
              style={{ width: 120 }}
            >
              {sports.map(sport => (
                <Option key={sport} value={sport}>{sport}</Option>
              ))}
            </Select>
          </Col>
        </Row>
      </div>

      {/* Statistics */}
      <div className="mb-4">
        <Row gutter={16}>
          <Col>
            <Card size="small" className="text-center">
              <div className="text-lg font-bold text-blue-600">
                {filteredEvents.length}
              </div>
              <div className="text-xs text-gray-600">שידורים בסינון</div>
            </Card>
          </Col>
          <Col>
            <Card size="small" className="text-center">
              <div className="text-lg font-bold text-green-600">
                {selectedEventIds.length}
              </div>
              <div className="text-xs text-gray-600">שידורי לוויין נבחרו</div>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Events Table */}
      <Table
        columns={columns}
        dataSource={filteredEvents}
        rowKey="id"
        loading={eventsLoading}
        size="small"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => 
            `${range[0]}-${range[1]} מתוך ${total} שידורים`
        }}
        locale={{ 
          emptyText: (
            <Empty 
              description="אין שידורים המתאימים לקריטריונים"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )
        }}
        scroll={{ y: 400 }}
      />
    </Modal>
  );
};

export default PlayoutDepartmentModal; 