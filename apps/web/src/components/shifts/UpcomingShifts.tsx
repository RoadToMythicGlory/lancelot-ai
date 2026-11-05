'use client';

import React, { useState } from 'react';
import { Card, Tag, Spin, Alert, Empty, Dropdown, Button, Modal, List, Typography } from 'antd';
import { CalendarOutlined, MoreOutlined, TeamOutlined, CalendarFilled } from '@ant-design/icons';
import { gql, useQuery, useLazyQuery } from '@apollo/client';
import dayjs from 'dayjs';
import 'dayjs/locale/he';

dayjs.locale('he');

const MY_UPCOMING_SHIFTS_QUERY = gql`
  query MyUpcomingShifts($limit: Int) {
    myUpcomingShifts(limit: $limit) {
      id
      date
      shiftType
      startTime
      endTime
      department
      requiredWorkers
      assignedWorkers {
        userId
        user {
          id
          firstName
          lastName
        }
        role
        assignedAt
      }
      notes
    }
  }
`;

const COWORKERS_QUERY = gql`
  query GetCoworkersForShift($department: String!, $startDate: String!, $endDate: String!) {
    shifts(startDate: $startDate, endDate: $endDate, department: $department) {
      id
      shiftType
      startTime
      endTime
      assignedWorkers {
        user {
          id
          firstName
          lastName
        }
        role
      }
    }
  }
`;

const DAILY_SCHEDULE_QUERY = gql`
  query GetDailySchedule($startDate: String!, $endDate: String!, $department: String!) {
    shifts(startDate: $startDate, endDate: $endDate, department: $department) {
      id
      shiftType
      startTime
      endTime
      assignedWorkers {
        user {
          id
          firstName
          lastName
        }
        role
      }
    }
  }
`;

// Query to get department shift configuration
const GET_MY_DEPARTMENT_SHIFT_CONFIG = gql`
  query GetMyDepartmentShiftConfig {
    myDepartmentShiftConfig {
      id
      shiftTypes {
        type
        label
        color
        defaultStartTime
        defaultEndTime
        enabled
      }
    }
  }
`;

export default function UpcomingShifts() {
  // Get department configuration
  const { data: configData } = useQuery(GET_MY_DEPARTMENT_SHIFT_CONFIG);
  
  // Default shift types for backward compatibility
  const defaultShiftTypeMap: Record<string, { label: string; time: string; color?: string }> = {
    morning: { label: 'בוקר', time: '07:00-15:00', color: '#faad14' },
    afternoon: { label: 'צהריים', time: '15:00-23:00', color: '#fa8c16' },
    night: { label: 'לילה', time: '23:00-07:00', color: '#8c8c8c' }
  };
  
  // Build shift type map from configuration or use defaults
  const shiftTypeMap = React.useMemo<Record<string, { label: string; time: string; color?: string }>>(() => {
    if (configData?.myDepartmentShiftConfig?.shiftTypes) {
      const map: Record<string, any> = {};
      configData.myDepartmentShiftConfig.shiftTypes
        .filter((st: any) => st.enabled)
        .forEach((st: any) => {
          map[st.type] = {
            label: st.label,
            time: `${st.defaultStartTime}-${st.defaultEndTime}`,
            color: st.color
          };
        });
      return Object.keys(map).length > 0 ? map : defaultShiftTypeMap;
    }
    return defaultShiftTypeMap;
  }, [configData]);
  const { loading, error, data, refetch } = useQuery(MY_UPCOMING_SHIFTS_QUERY, {
    variables: { limit: 100 },
    pollInterval: 60000 // Refresh every minute
  });

  const [getCoworkers, { loading: coworkersLoading, data: coworkersData }] = useLazyQuery(COWORKERS_QUERY);
  const [getDailySchedule, { loading: scheduleLoading, data: scheduleData }] = useLazyQuery(DAILY_SCHEDULE_QUERY);

  const [coworkersModalVisible, setCoworkersModalVisible] = useState(false);
  const [dailyScheduleModalVisible, setDailyScheduleModalVisible] = useState(false);
  const [selectedShift, setSelectedShift] = useState<any>(null);

  const handleShowCoworkers = async (shift: any) => {
    setSelectedShift(shift);
    await getCoworkers({
      variables: {
        department: shift.department,
        startDate: dayjs(shift.date).format('YYYY-MM-DD'),
        endDate: dayjs(shift.date).format('YYYY-MM-DD')
      }
    });
    setCoworkersModalVisible(true);
  };

  const handleShowDailySchedule = async (shift: any) => {
    setSelectedShift(shift);
    await getDailySchedule({
      variables: {
        startDate: dayjs(shift.date).format('YYYY-MM-DD'),
        endDate: dayjs(shift.date).format('YYYY-MM-DD'),
        department: shift.department
      }
    });
    setDailyScheduleModalVisible(true);
  };

  const getContextMenuItems = (shift: any) => [
    {
      key: 'coworkers',
      label: 'מי עובד איתי',
      icon: <TeamOutlined />,
      onClick: () => handleShowCoworkers(shift)
    },
    {
      key: 'daily-schedule',
      label: 'צפייה בסידור יומי מלא',
      icon: <CalendarFilled />,
      onClick: () => handleShowDailySchedule(shift)
    }
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="שגיאה בטעינת המשמרות"
        description={error.message}
        type="error"
        showIcon
      />
    );
  }

  const upcomingShifts = data?.myUpcomingShifts || [];

  if (upcomingShifts.length === 0) {
    return (
      <Card className="upcoming-shifts-card">
        <Empty 
          description="אין משמרות מתוכננות"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  // Group shifts by date
  const shiftsByDate = upcomingShifts.reduce((acc: any, shift: any) => {
    const date = dayjs(shift.date).format('YYYY-MM-DD');
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(shift);
    return acc;
  }, {});

  return (
    <Card title="המשמרות הקרובות שלי" className="upcoming-shifts-card">
      <div className="space-y-4">
        {Object.entries(shiftsByDate).map(([date, shifts]: [string, any]) => (
          <div key={date} className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarOutlined className="text-blue-500" />
              <span className="font-medium text-lg">
                {dayjs(date).format('dddd, DD/MM/YYYY')}
              </span>
            </div>
            
            <div className="grid gap-2">
              {shifts.map((shift: any) => {
                const shiftInfo = shiftTypeMap[shift.shiftType] || { 
                  label: shift.shiftType, 
                  color: '#1890ff', 
                  time: `${shift.startTime || '00:00'}-${shift.endTime || '00:00'}` 
                };
                return (
                  <div 
                    key={shift.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Tag 
                        color={shiftInfo.color}
                        className="m-0"
                      >
                        {shiftInfo.label}
                      </Tag>
                      <span className="text-gray-600">{(shift.startTime && shift.endTime) ? `${shift.startTime}-${shift.endTime}` : shiftInfo.time}</span>
                      <span className="text-gray-800">{shift.department}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {shift.notes && (
                        <span className="text-sm text-gray-500">
                          {shift.notes}
                        </span>
                      )}
                      <Dropdown
                        menu={{ items: getContextMenuItems(shift) }}
                        trigger={['click']}
                        placement="bottomRight"
                      >
                        <Button
                          icon={<MoreOutlined />}
                          size="small"
                          type="text"
                        />
                      </Dropdown>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-right">
        <a onClick={() => refetch()}>רענן עכשיו</a>
      </div>

      {/* Coworkers Modal */}
      <Modal
        title="מי עובד איתי"
        open={coworkersModalVisible}
        onCancel={() => setCoworkersModalVisible(false)}
        footer={null}
        width={600}
      >
        {coworkersLoading ? (
          <div className="flex justify-center py-4">
            <Spin />
          </div>
        ) : (
          <List
            dataSource={coworkersData?.shifts?.filter((s: any) => {
              const shiftStart = dayjs(`2000-01-01 ${s.startTime}`);
              const shiftEnd = dayjs(`2000-01-01 ${s.endTime}`);
              const selectedShiftInfo = shiftTypeMap[selectedShift?.shiftType] || { time: '00:00-00:00' };
              const selectedStart = dayjs(`2000-01-01 ${selectedShift?.startTime || selectedShiftInfo.time.split('-')[0]}`);
              const selectedEnd = dayjs(`2000-01-01 ${selectedShift?.endTime || selectedShiftInfo.time.split('-')[1]}`);
              
              // Check if shifts overlap
              return shiftStart.isBefore(selectedEnd) && shiftEnd.isAfter(selectedStart);
            }).flatMap((s: any) => s.assignedWorkers.map((w: any) => ({
              ...w,
              shiftType: s.shiftType,
              shiftTime: `${s.startTime}-${s.endTime}`
            }))) || []}
            renderItem={(worker: any) => (
              <List.Item>
                <List.Item.Meta
                  title={`${worker.user.firstName} ${worker.user.lastName}`}
                  description={
                    <div>
                      <Tag>{worker.role}</Tag>
                      <span className="text-gray-500 mr-2">
                        {(shiftTypeMap[worker.shiftType] || { label: worker.shiftType }).label} ({worker.shiftTime})
                      </span>
                    </div>
                  }
                />
              </List.Item>
            )}
            locale={{ emptyText: 'אין עובדים נוספים באותו הזמן' }}
          />
        )}
      </Modal>

      {/* Daily Schedule Modal */}
      <Modal
        title={`סידור יומי - ${selectedShift ? dayjs(selectedShift.date).format('DD/MM/YYYY') : ''}`}
        open={dailyScheduleModalVisible}
        onCancel={() => setDailyScheduleModalVisible(false)}
        footer={null}
        width={800}
      >
        {scheduleLoading ? (
          <div className="flex justify-center py-4">
            <Spin />
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(
              (scheduleData?.shifts || []).reduce((acc: any, shift: any) => {
                const shiftType = shift.shiftType;
                if (!acc[shiftType]) {
                  acc[shiftType] = [];
                }
                acc[shiftType].push(shift);
                return acc;
              }, {})
            ).map(([shiftType, shifts]: [string, any]) => (
              <Card
                key={shiftType}
                size="small"
                title={
                  <div className="flex items-center gap-2">
                    <Tag color={(shiftTypeMap[shiftType] || { color: '#1890ff' }).color}>
                      {(shiftTypeMap[shiftType] || { label: shiftType }).label}
                    </Tag>
                    <span className="text-gray-500">
                      {(shiftTypeMap[shiftType] || { time: '00:00-00:00' }).time}
                    </span>
                  </div>
                }
              >
                <List
                  size="small"
                  dataSource={shifts.flatMap((s: any) => 
                    s.assignedWorkers.map((w: any) => ({
                      ...w
                    }))
                  )}
                  renderItem={(worker: any) => (
                    <List.Item>
                      <Typography.Text>
                        {worker.user.firstName} {worker.user.lastName}
                      </Typography.Text>
                      <Tag>{worker.role}</Tag>
                    </List.Item>
                  )}
                  locale={{ emptyText: 'אין עובדים משובצים' }}
                />
              </Card>
            ))}
          </div>
        )}
      </Modal>
    </Card>
  );
} 