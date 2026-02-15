import React, { useState, useMemo } from 'react';
import { Table, Card, Button, Space, Tag, Typography, Row, Col, Divider } from 'antd';
import { LeftOutlined, RightOutlined, CalendarOutlined } from '@ant-design/icons';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import moment from 'moment';
import './WeekShiftsView.css';

const { Title, Text } = Typography;

const GET_WEEK_SHIFTS = gql`
  query GetWeekShifts($weekOffset: Int!) {
    getShiftsByWeek(weekOffset: $weekOffset) {
      weekStart
      weekEnd
      shifts {
        id
        date
        shiftType
        startTime
        endTime
        assignedWorkers {
          userId
          user {
            id
            displayName
            department
          }
          role
        }
        department
        requiredWorkers
        notes
      }
    }
  }
`;

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

interface ShiftData {
  id: string;
  date: string;
  shiftType: string;
  startTime?: string;
  endTime?: string;
  assignedWorkers: Array<{
    userId: string;
    user: {
      id: string;
      displayName: string;
      department: string;
    };
    role: string;
  }>;
  department: string;
  requiredWorkers: number;
  notes?: string;
}

export default function WeekShiftsView() {
  const [weekOffset, setWeekOffset] = useState(0);
  
  const { data, loading } = useQuery(GET_WEEK_SHIFTS, {
    variables: { weekOffset }
  });

  const { data: configData } = useQuery(GET_MY_DEPARTMENT_SHIFT_CONFIG);

  const weekStart = moment().add(weekOffset, 'weeks').startOf('week');
  const weekEnd = moment().add(weekOffset, 'weeks').endOf('week');

  const getWeekDateRange = () => {
    return `${weekStart.format('DD/MM/YYYY')} - ${weekEnd.format('DD/MM/YYYY')}`;
  };

  // Build shift type map from configuration or use defaults
  const shiftTypeMap = useMemo(() => {
    const defaultMap: { [key: string]: { label: string; color: string; defaultStartTime: string; defaultEndTime: string } } = {
      morning: { label: 'בוקר', color: '#ffd93d', defaultStartTime: '07:00', defaultEndTime: '15:00' },
      afternoon: { label: 'צהריים', color: '#ff9800', defaultStartTime: '15:00', defaultEndTime: '23:00' },
      evening: { label: 'ערב', color: '#1890ff', defaultStartTime: '19:00', defaultEndTime: '23:00' },
      night: { label: 'לילה', color: '#f44336', defaultStartTime: '23:00', defaultEndTime: '07:00' },
    };

    if (configData?.myDepartmentShiftConfig?.shiftTypes) {
      const map: { [key: string]: { label: string; color: string; defaultStartTime: string; defaultEndTime: string } } = {};
      configData.myDepartmentShiftConfig.shiftTypes
        .filter((st: any) => st.enabled)
        .forEach((st: any) => {
          map[st.type] = {
            label: st.label,
            color: st.color,
            defaultStartTime: st.defaultStartTime,
            defaultEndTime: st.defaultEndTime
          };
        });
      return Object.keys(map).length > 0 ? map : defaultMap;
    }
    return defaultMap;
  }, [configData]);

  const shifts = data?.getShiftsByWeek?.shifts || [];

  // Generate week days
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const day = moment(weekStart).add(i, 'days');
    weekDays.push({
      date: day.format('YYYY-MM-DD'),
      dayName: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][i],
      displayDate: day.format('DD/MM')
    });
  }

  // Get all unique shift types from the shifts or from configuration
  const shiftTypes = useMemo(() => {
    if (configData?.myDepartmentShiftConfig?.shiftTypes) {
      return configData.myDepartmentShiftConfig.shiftTypes
        .filter((st: any) => st.enabled)
        .map((st: any) => st.type);
    }
    // Fallback to extracting from shifts data or using defaults
    const typesFromShifts = [...new Set(shifts.map((s: any) => s.shiftType))];
    return typesFromShifts.length > 0 ? typesFromShifts : ['morning', 'afternoon', 'night'];
  }, [configData, shifts]);

  // Organize shifts by date and type
  const shiftsByDateAndType = useMemo(() => {
    const organized: { [key: string]: { [key: string]: any[] } } = {};
    
    weekDays.forEach(day => {
      organized[day.date] = {};
      shiftTypes.forEach(type => {
        organized[day.date][type] = [];
      });
    });

    shifts.forEach((shift: any) => {
      const shiftDate = moment(shift.date).format('YYYY-MM-DD');
      if (organized[shiftDate] && organized[shiftDate][shift.shiftType]) {
        organized[shiftDate][shift.shiftType].push(shift);
      }
    });

    return organized;
  }, [shifts, weekDays, shiftTypes]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row justify="space-between" align="middle">
        <Col>
          <Title level={4}>
            {weekOffset === 0 ? 'השבוע הנוכחי' : 
             weekOffset === -1 ? 'שבוע שעבר' :
             weekOffset === 1 ? 'השבוע הבא' :
             weekOffset === 2 ? 'שבועיים קדימה' :
             weekOffset < 0 ? `${Math.abs(weekOffset)} שבועות אחורה` :
             `${weekOffset} שבועות קדימה`}
          </Title>
          <Text type="secondary">{getWeekDateRange()}</Text>
        </Col>
        <Col>
          <Space>
            <Button 
              icon={<RightOutlined />} 
              onClick={() => setWeekOffset(weekOffset - 1)}
            >
              שבוע קודם
            </Button>
            <Button 
              onClick={() => setWeekOffset(0)}
              type={weekOffset === 0 ? 'primary' : 'default'}
            >
              השבוע הנוכחי
            </Button>
            <Button 
              icon={<LeftOutlined />} 
              onClick={() => setWeekOffset(weekOffset + 1)}
            >
              שבוע הבא
            </Button>
          </Space>
        </Col>
      </Row>

      <div className="week-shifts-table-container">
        <table className={`week-shifts-table ${loading ? 'loading' : ''}`} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ 
                border: '1px solid #d9d9d9', 
                padding: '12px', 
                backgroundColor: '#f0f0f0',
                fontWeight: 'bold',
                textAlign: 'center',
                width: '100px'
              }}>
                תפקיד
              </th>
              {weekDays.map((day) => (
                <th key={day.date} style={{ 
                  border: '1px solid #d9d9d9', 
                  padding: '12px', 
                  backgroundColor: '#e6f7ff',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  minWidth: '140px'
                }}>
                  <div>{day.dayName}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>{day.displayDate}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shiftTypes.map((shiftType) => (
              <tr key={shiftType}>
                <td style={{ 
                  border: '1px solid #d9d9d9', 
                  padding: '12px',
                  backgroundColor: shiftTypeMap[shiftType]?.color + '20' || '#f0f0f0',
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}>
                  {shiftTypeMap[shiftType]?.label || shiftType}
                </td>
                {weekDays.map((day) => {
                  const shiftsForCell = shiftsByDateAndType[day.date]?.[shiftType] || [];
                  
                  return (
                    <td key={`${day.date}-${shiftType}`} style={{ 
                      border: '1px solid #d9d9d9', 
                      padding: '8px',
                      verticalAlign: 'top',
                      minHeight: '80px'
                    }}>
                      {shiftsForCell.map((shift: any, index: number) => (
                        <div key={shift.id} style={{ marginBottom: index < shiftsForCell.length - 1 ? '8px' : '0' }}>
                          {shift.assignedWorkers.map((worker: any, workerIndex: number) => (
                            <div key={worker.userId} style={{ 
                              fontSize: '13px',
                              lineHeight: '1.4',
                              marginBottom: workerIndex < shift.assignedWorkers.length - 1 ? '4px' : '0'
                            }}>
                              <div style={{ fontWeight: 500 }}>
                                {worker.user.displayName}
                              </div>
                              {worker.role && (
                                <div style={{ fontSize: '11px', color: '#666' }}>
                                  {worker.role}
                                </div>
                              )}
                            </div>
                          ))}
                          <div style={{ 
                            fontSize: '11px', 
                            color: '#1890ff',
                            marginTop: '4px'
                          }}>
                            {shift.startTime || shiftTypeMap[shift.shiftType]?.defaultStartTime || '00:00'} - {shift.endTime || shiftTypeMap[shift.shiftType]?.defaultEndTime || '00:00'}
                          </div>
                          {shift.department && shift.department !== 'MCR' && (
                            <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>
                              {shift.department}
                            </div>
                          )}
                        </div>
                      ))}
                      {shiftsForCell.length === 0 && (
                        <div style={{ 
                          fontSize: '12px', 
                          color: '#999',
                          textAlign: 'center',
                          padding: '20px 0'
                        }}>
                          -
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Space>
  );
}
