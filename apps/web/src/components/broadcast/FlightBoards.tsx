'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Modal, Table, DatePicker, Button, Tabs, Tag, Badge, Card, Space, Typography, Empty, Tooltip } from 'antd';
import { 
  CalendarOutlined, 
  CloseOutlined, 
  ReloadOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  DesktopOutlined,
  InboxOutlined,
  GlobalOutlined,
  PlaySquareOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import gsap from 'gsap';
import type { ColumnsType } from 'antd/es/table';

// Extend dayjs with isBetween plugin
dayjs.extend(isBetween);

const { Title, Text } = Typography;

dayjs.locale('he');

interface BroadcastEvent {
  id: string;
  title: string;
  hebrewTitle?: string;
  startTime: string;
  endTime?: string;
  channel?: string;
  metadata?: any;
  [key: string]: any;
}

interface FlightBoardsProps {
  visible: boolean;
  onClose: () => void;
  events: BroadcastEvent[];
  selectedDate?: dayjs.Dayjs;
}

// Type for equipment status
type EquipmentStatus = 'fully_assigned' | 'partially_assigned' | 'not_assigned';

const FlightBoards: React.FC<FlightBoardsProps> = ({ 
  visible, 
  onClose, 
  events, 
  selectedDate = dayjs() 
}) => {
  const [currentDate, setCurrentDate] = useState(selectedDate);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Filter events for selected date
  const dailyEvents = events.filter(event => {
    const eventDate = dayjs(event.startTime);
    return eventDate.isSame(currentDate, 'day');
  }).sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());

  // Auto refresh every 30 seconds
  useEffect(() => {
    if (autoRefresh && visible) {
      const interval = setInterval(() => {
        // Trigger refresh - in real app would refetch data
        setLoading(true);
        setTimeout(() => setLoading(false), 500);
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, visible]);

  // GSAP animations
  useEffect(() => {
    if (visible && dailyEvents.length > 0) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        // Animate modal entrance with a subtle effect
        gsap.fromTo('.flight-board-modal .ant-modal-content',
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
        );

        // Animate tabs
        gsap.fromTo('.flight-board-tabs .ant-tabs-tab',
          { opacity: 0, y: -10 },
          { 
            opacity: 1, 
            y: 0, 
            duration: 0.4, 
            stagger: 0.1,
            ease: 'power2.out',
            delay: 0.2
          }
        );

        // Animate table rows with stagger
        const rows = document.querySelectorAll('.flight-board-table tbody tr');
        if (rows.length > 0) {
          gsap.fromTo(rows,
            { opacity: 0, x: -30 },
            { 
              opacity: 1, 
              x: 0, 
              duration: 0.5, 
              stagger: 0.03,
              ease: 'power2.out',
              delay: 0.4
            }
          );
        }

        // Animate headers
        const headers = document.querySelectorAll('.flight-board-table th');
        if (headers.length > 0) {
          gsap.fromTo(headers,
            { opacity: 0 },
            { 
              opacity: 1, 
              duration: 0.3, 
              ease: 'power2.out',
              delay: 0.3
            }
          );
        }

        // Subtle hover effect for rows
        const rowElements = document.querySelectorAll('.flight-board-table tbody tr');
        rowElements.forEach(row => {
          row.addEventListener('mouseenter', () => {
            gsap.to(row, { x: 4, duration: 0.2, ease: 'power2.out' });
          });
          row.addEventListener('mouseleave', () => {
            gsap.to(row, { x: 0, duration: 0.2, ease: 'power2.out' });
          });
        });
      }, 100); // 100ms delay to ensure DOM is ready

      return () => {
        clearTimeout(timer);
        // Clean up event listeners
        const rowElements = document.querySelectorAll('.flight-board-table tbody tr');
        rowElements.forEach(row => {
          row.replaceWith(row.cloneNode(true)); // Remove all event listeners
        });
      };
    }
  }, [visible, dailyEvents.length]);

  // Helper function to format time
  const formatTime = (dateString: string) => {
    return dayjs(dateString).format('HH:mm');
  };

  // Helper function to get crew member name by role
  const getCrewMember = (event: BroadcastEvent, role: string): string => {
    const broadcastArrayData = event.metadata?.departments?.broadcastArray;
    if (!broadcastArrayData?.crewAssignments) return '-';
    
    const assignment = broadcastArrayData.crewAssignments.find((a: any) => a.role === role);
    
    // Debug logging
    if (assignment) {
      console.log(`Role: ${role}, Assignment:`, assignment);
    }
    
    // Return the userName if available, otherwise show dash
    return assignment?.userName || '-';
  };

  // Helper function to get concise broadcast name
  const getBroadcastName = (event: BroadcastEvent): string => {
    // If we have both teams, show "Home vs Away"
    if (event.homeTeam && event.awayTeam) {
      return `${event.homeTeam} - ${event.awayTeam}`;
    }
    
    // If we have just one team
    if (event.homeTeam || event.awayTeam) {
      return event.homeTeam || event.awayTeam || '';
    }
    
    // If no teams, show league or sport
    if (event.league) {
      return event.league;
    }
    
    if (event.sport) {
      return event.sport;
    }
    
    // Fallback to title but try to shorten it
    const title = event.hebrewTitle || event.title || 'אירוע';
    // If title is too long, take first few words
    const words = title.split(' ');
    if (words.length > 3) {
      return words.slice(0, 3).join(' ') + '...';
    }
    return title;
  };

  // Helper function to get equipment status
  const getEquipmentStatus = (event: BroadcastEvent): { status: EquipmentStatus; text: string; color: string } => {
    const warehouseData = event.metadata?.departments?.warehouse;
    if (!warehouseData) return { status: 'not_assigned', text: 'לא שויך', color: 'red' };
    
    const totalRequested = warehouseData.totalRequested || 0;
    const totalAssigned = warehouseData.totalAssigned || warehouseData.assignedItems?.length || 0;
    
    if (totalRequested === 0) return { status: 'not_assigned', text: 'לא שויך', color: 'red' };
    
    const percentage = (totalAssigned / totalRequested) * 100;
    
    if (percentage >= 100) return { status: 'fully_assigned', text: 'שויך במלואו', color: 'green' };
    if (percentage > 0) return { status: 'partially_assigned', text: 'חלקית', color: 'orange' };
    return { status: 'not_assigned', text: 'לא שויך', color: 'red' };
  };

  // Helper function to calculate row completeness
  const getRowCompleteness = (event: BroadcastEvent): { percentage: number; status: 'complete' | 'partial' | 'empty' } => {
    const broadcastArrayData = event.metadata?.departments?.broadcastArray;
    const requiredFields = [
      broadcastArrayData?.customData?.מקוםשידור || broadcastArrayData?.מקוםשידור,
      getCrewMember(event, 'טכנאי שידור'),
      getCrewMember(event, 'עוזר במאי'),
      getCrewMember(event, 'איש VTR'),
      getCrewMember(event, 'גרפיקאי'),
      getCrewMember(event, 'שדר'),
      getCrewMember(event, 'פרשן')
    ];
    
    const filledFields = requiredFields.filter(field => field && field !== '-').length;
    const percentage = (filledFields / requiredFields.length) * 100;
    
    if (percentage === 100) return { percentage, status: 'complete' };
    if (percentage > 0) return { percentage, status: 'partial' };
    return { percentage, status: 'empty' };
  };

  // Production Department Columns
  const productionColumns: ColumnsType<BroadcastEvent> = [
    {
      title: 'סטטוס',
      key: 'status',
      width: 80,
      render: (_, record) => {
        const completeness = getRowCompleteness(record);
        const statusColors = {
          complete: '#52c41a',
          partial: '#faad14',
          empty: '#ff4d4f'
        };
        const statusText = {
          complete: 'מלא',
          partial: `${Math.round(completeness.percentage)}%`,
          empty: 'ריק'
        };
        
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '60px',
              height: '4px',
              background: '#f0f0f0',
              borderRadius: '2px',
              margin: '0 auto 4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${completeness.percentage}%`,
                height: '100%',
                background: statusColors[completeness.status],
                transition: 'width 0.3s ease'
              }} />
            </div>
            <span style={{ 
              color: statusColors[completeness.status],
              fontSize: '12px',
              fontWeight: 600
            }}>
              {statusText[completeness.status]}
            </span>
          </div>
        );
      },
    },
    {
      title: 'פרשן',
      key: 'analyst',
      render: (_, record) => getCrewMember(record, 'פרשן'),
    },
    {
      title: 'שדרן',
      key: 'commentator',
      render: (_, record) => getCrewMember(record, 'שדר'),
    },
    {
      title: 'גרפיקה',
      key: 'graphics',
      render: (_, record) => getCrewMember(record, 'גרפיקאי'),
    },
    {
      title: 'VTR',
      key: 'vtr',
      render: (_, record) => getCrewMember(record, 'איש VTR'),
    },
    {
      title: 'ע.במאי',
      key: 'assistantDirector',
      render: (_, record) => getCrewMember(record, 'עוזר במאי'),
    },
    {
      title: 'במאי',
      key: 'director',
      render: (_, record) => getCrewMember(record, 'טכנאי שידור'),
    },
    {
      title: 'קונטרול',
      key: 'control',
      render: (_, record) => {
        const broadcastArrayData = record.metadata?.departments?.broadcastArray;
        return broadcastArrayData?.customData?.מקוםשידור || broadcastArrayData?.מקוםשידור || '-';
      },
    },
    {
      title: 'שידור',
      key: 'broadcast',
      width: 200,
      render: (_, record) => (
        <div>
          <div className="font-semibold">{getBroadcastName(record)}</div>
          {record.sport && <Tag color="blue">{record.sport}</Tag>}
        </div>
      ),
    },
    {
      title: 'שעה',
      key: 'time',
      width: 80,
      render: (_, record) => {
        const isLive = dayjs().isBetween(
          dayjs(record.startTime), 
          record.endTime ? dayjs(record.endTime) : dayjs(record.startTime).add(2, 'hours')
        );
        return (
          <div className="font-mono text-lg">
            {isLive && (
              <Tooltip title="זמן חי">
                <span className="live-indicator" />
              </Tooltip>
            )}
            {formatTime(record.startTime)}
          </div>
        );
      },
    },
  ];

  // Warehouse Department Columns
  const warehouseColumns: ColumnsType<BroadcastEvent> = [
    {
      title: 'שעה',
      key: 'time',
      width: 100,
      render: (_, record) => (
        <div className="font-mono text-lg">
          <ClockCircleOutlined className="ml-2" />
          {formatTime(record.startTime)}
        </div>
      ),
    },
    {
      title: 'שידור',
      key: 'broadcast',
      width: 250,
      render: (_, record) => (
        <div>
          <div className="font-semibold">{getBroadcastName(record)}</div>
          {record.location && <Text type="secondary">{record.location}</Text>}
        </div>
      ),
    },
    {
      title: 'קונטרול',
      key: 'control',
      width: 120,
      render: (_, record) => {
        const broadcastArrayData = record.metadata?.departments?.broadcastArray;
        return broadcastArrayData?.customData?.מקוםשידור || broadcastArrayData?.מקוםשידור || '-';
      },
    },
    {
      title: 'טכנאי שטח',
      key: 'fieldTech',
      width: 150,
      render: (_, record) => {
        const externalData = record.metadata?.departments?.externalBroadcasts;
        const fieldTech = externalData?.productionCrew?.find((crew: any) => 
          crew.role === 'טכנאי שטח' || crew.role === 'Field Technician'
        );
        return fieldTech?.name || '-';
      },
    },
    {
      title: 'ציוד',
      key: 'equipment',
      width: 150,
      render: (_, record) => {
        const equipmentStatus = getEquipmentStatus(record);
        return (
          <Badge 
            status={equipmentStatus.status === 'fully_assigned' ? 'success' : 
                   equipmentStatus.status === 'partially_assigned' ? 'warning' : 'error'}
            text={<span style={{ color: equipmentStatus.color }}>{equipmentStatus.text}</span>}
          />
        );
      },
    },
  ];

  // Logistics Floor Columns
  const logisticsColumns: ColumnsType<BroadcastEvent> = [
    {
      title: 'שעה',
      key: 'time',
      width: 80,
      render: (_, record) => (
        <div className="font-mono text-lg">
          <ClockCircleOutlined className="ml-2" />
          {formatTime(record.startTime)}
        </div>
      ),
    },
    {
      title: 'שידור',
      key: 'broadcast',
      render: (_, record) => (
        <div>
          <div className="font-semibold">{getBroadcastName(record)}</div>
          {record.channel && <Tag>{record.channel}</Tag>}
        </div>
      ),
    },
    {
      title: 'קונטרול',
      key: 'control',
      width: 120,
      render: (_, record) => record.metadata?.departments?.broadcastArray?.מקוםשידור || '-',
    },
    {
      title: 'לווין',
      key: 'satellite',
      width: 150,
      render: (_, record) => record.satellite || record.metadata?.departments?.playout?.satellite || '-',
    },
    {
      title: 'הערות',
      key: 'notes',
      render: (_, record) => record.notes || record.metadata?.departments?.playout?.notes || '-',
    },
  ];

  // Broadcast Room Columns
  const broadcastRoomColumns: ColumnsType<BroadcastEvent> = [
    {
      title: 'שעה',
      key: 'time',
      width: 80,
      render: (_, record) => (
        <div className="font-mono text-lg">
          <ClockCircleOutlined className="ml-2" />
          {formatTime(record.startTime)}
        </div>
      ),
    },
    {
      title: 'תכנית',
      key: 'program',
      render: (_, record) => (
        <div>
          <div className="font-semibold">{getBroadcastName(record)}</div>
          {record.live && <Tag color="red">חי</Tag>}
        </div>
      ),
    },
    {
      title: 'ערוץ',
      key: 'channel',
      width: 120,
      render: (_, record) => record.channel || '-',
    },
    {
      title: 'מקור',
      key: 'source',
      width: 150,
      render: (_, record) => {
        const mcrData = record.metadata?.departments?.mcr;
        return mcrData?.מקור || mcrData?.source || '-';
      },
    },
    {
      title: 'במאי',
      key: 'director',
      width: 120,
      render: (_, record) => getCrewMember(record, 'טכנאי שידור'),
    },
    {
      title: 'הערות',
      key: 'notes',
      render: (_, record) => record.notes || '-',
    },
    {
      title: 'Q',
      key: 'q',
      width: 60,
      align: 'center',
      render: (_, record) => {
        const hasQ = record.metadata?.departments?.mcr?.hasQ || false;
        return hasQ ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : '-';
      },
    },
  ];

  // Get current time for "NOW" indicator
  const now = dayjs();
  const isToday = currentDate.isSame(now, 'day');

  return (
    <Modal
      title={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CalendarOutlined className="text-2xl text-red-500" />
            <span>לוחות טיסות - {currentDate.format('DD/MM/YYYY')}</span>
          </div>
          <Space>
            <DatePicker
              value={currentDate}
              onChange={(date) => date && setCurrentDate(date)}
              format="DD/MM/YYYY"
              className="custom-datepicker"
            />
            <Button 
              icon={<ReloadOutlined spin={loading} />}
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 500);
              }}
              className="refresh-button"
            >
              רענן
            </Button>
          </Space>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width="95vw"
      style={{ top: 20 }}
      footer={null}
      styles={{
        body: { 
          height: 'calc(100vh - 200px)', 
          overflowY: 'auto',
          padding: 0
        },
        mask: { backgroundColor: 'rgba(0, 0, 0, 0.85)' }
      }}
      className="flight-board-modal"
    >
      {dailyEvents.length === 0 ? (
        <div className="empty-state">
          <Empty description="אין אירועים ליום זה" />
        </div>
      ) : (
        <>
          {/* Legend */}
          <div style={{ 
            padding: '16px 24px', 
            background: '#0d0d0d',
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="live-indicator" style={{ position: 'static' }} />
              <span style={{ color: '#666', fontSize: '14px' }}>שידור חי</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', background: '#52c41a', borderRadius: '2px' }} />
              <span style={{ color: '#666', fontSize: '14px' }}>משימה מלאה</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', background: '#faad14', borderRadius: '2px' }} />
              <span style={{ color: '#666', fontSize: '14px' }}>משימה חלקית</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', background: '#ff4d4f', borderRadius: '2px' }} />
              <span style={{ color: '#666', fontSize: '14px' }}>משימה ריקה</span>
            </div>
          </div>
          
          <Tabs 
            defaultActiveKey="production" 
            size="large"
            className="flight-board-tabs"
            items={[
            {
              key: 'production',
              label: (
                <span className="tab-label">
                  <DesktopOutlined className="ml-2" />
                  הפקה
                </span>
              ),
              children: (
                <Card className="flight-board-card" variant="borderless">
                  <Table
                    columns={productionColumns}
                    dataSource={dailyEvents}
                    rowKey="id"
                    pagination={false}
                    loading={loading}
                    className="flight-board-table production-table"
                    rowClassName={(record) => {
                      const classes = [];
                      if (isToday) {
                        const eventTime = dayjs(record.startTime);
                        const endTime = record.endTime ? dayjs(record.endTime) : eventTime.add(2, 'hours');
                        if (now.isAfter(endTime)) classes.push('row-completed');
                        else if (now.isBetween(eventTime, endTime)) classes.push('row-live');
                        else if (eventTime.diff(now, 'hours') <= 1) classes.push('row-upcoming');
                      }
                      return classes.join(' ');
                    }}
                  />
                </Card>
              )
            },
            {
              key: 'warehouse',
              label: (
                <span className="tab-label">
                  <InboxOutlined className="ml-2" />
                  מחסן
                </span>
              ),
              children: (
                <Card className="flight-board-card" variant="borderless">
                  <Table
                    columns={warehouseColumns}
                    dataSource={dailyEvents}
                    rowKey="id"
                    pagination={false}
                    loading={loading}
                    className="flight-board-table warehouse-table"
                    rowClassName={(record) => {
                      const classes = [];
                      if (isToday) {
                        const eventTime = dayjs(record.startTime);
                        const endTime = record.endTime ? dayjs(record.endTime) : eventTime.add(2, 'hours');
                        if (now.isAfter(endTime)) classes.push('row-completed');
                        else if (now.isBetween(eventTime, endTime)) classes.push('row-live');
                        else if (eventTime.diff(now, 'hours') <= 1) classes.push('row-upcoming');
                      }
                      return classes.join(' ');
                    }}
                  />
                </Card>
              )
            },
            {
              key: 'logistics',
              label: (
                <span className="tab-label">
                  <GlobalOutlined className="ml-2" />
                  לוגיסטיקה
                </span>
              ),
              children: (
                <Card className="flight-board-card" variant="borderless">
                  <Table
                    columns={logisticsColumns}
                    dataSource={dailyEvents}
                    rowKey="id"
                    pagination={false}
                    loading={loading}
                    className="flight-board-table logistics-table"
                    rowClassName={(record) => {
                      const classes = [];
                      if (isToday) {
                        const eventTime = dayjs(record.startTime);
                        const endTime = record.endTime ? dayjs(record.endTime) : eventTime.add(2, 'hours');
                        if (now.isAfter(endTime)) classes.push('row-completed');
                        else if (now.isBetween(eventTime, endTime)) classes.push('row-live');
                        else if (eventTime.diff(now, 'hours') <= 1) classes.push('row-upcoming');
                      }
                      return classes.join(' ');
                    }}
                  />
                </Card>
              )
            },
            {
              key: 'broadcastRoom',
              label: (
                <span className="tab-label">
                  <PlaySquareOutlined className="ml-2" />
                  חדר שידור
                </span>
              ),
              children: (
                <Card className="flight-board-card" variant="borderless">
                  <Table
                    columns={broadcastRoomColumns}
                    dataSource={dailyEvents}
                    rowKey="id"
                    pagination={false}
                    loading={loading}
                    className="flight-board-table broadcast-room-table"
                    rowClassName={(record) => {
                      const classes = [];
                      if (isToday) {
                        const eventTime = dayjs(record.startTime);
                        const endTime = record.endTime ? dayjs(record.endTime) : eventTime.add(2, 'hours');
                        if (now.isAfter(endTime)) classes.push('row-completed');
                        else if (now.isBetween(eventTime, endTime)) classes.push('row-live');
                        else if (eventTime.diff(now, 'hours') <= 1) classes.push('row-upcoming');
                      }
                      return classes.join(' ');
                    }}
                  />
                </Card>
              )
            }
          ]}
        />
        </>
      )}
    </Modal>
  );
};

export default FlightBoards; 