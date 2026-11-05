'use client';

import React, { useState, useEffect } from 'react';
import { Card, Select, Button, message, Spin, Modal, Alert } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useMutation, useQuery, gql } from '@apollo/client';
import { GET_DEPARTMENT_SHIFT_CONFIG, GET_MY_DEPARTMENT_SHIFT_CONFIG } from '@/graphql/queries';
import { useAuth } from '@/contexts/AuthContext';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import isoWeek from 'dayjs/plugin/isoWeek';
import 'dayjs/locale/he';
import { validateConstraintsAgainstLaws } from '@/utils/constraintValidation';

dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);
dayjs.locale('he');

const { Option } = Select;

const GET_AVAILABILITY_CONSTRAINTS = gql`
  query GetMyAvailabilityConstraints($weekStartDate: String!) {
    myAvailabilityConstraints(weekStartDate: $weekStartDate) {
      id
      weekStartDate
      constraints {
        dayOfWeek
        shiftType
        availability
      }
    }
  }
`;

const SUBMIT_AVAILABILITY_CONSTRAINTS = gql`
  mutation SubmitAvailabilityConstraints($input: AvailabilityConstraintInput!) {
    submitAvailabilityConstraints(input: $input) {
      id
      weekStartDate
      constraints {
        dayOfWeek
        shiftType
        availability
      }
    }
  }
`;

const DAYS_OF_WEEK = [
  { value: 0, label: 'ראשון' },
  { value: 1, label: 'שני' },
  { value: 2, label: 'שלישי' },
  { value: 3, label: 'רביעי' },
  { value: 4, label: 'חמישי' },
  { value: 5, label: 'שישי' },
  { value: 6, label: 'שבת' }
];

const DEFAULT_SHIFT_TYPES = [
  { value: 'morning', label: 'בוקר', time: '07:00-15:00' },
  { value: 'afternoon', label: 'צהריים', time: '15:00-23:00' },
  { value: 'night', label: 'לילה', time: '23:00-07:00' }
];

const AVAILABILITY_OPTIONS = [
  { value: 'available', label: 'זמין', color: '#52c41a' },
  { value: 'unavailable', label: 'לא זמין', color: '#ff4d4f' },
  { value: 'prefer', label: 'מעדיף', color: '#1890ff' },
  { value: 'prefer_not', label: 'מעדיף שלא', color: '#fa8c16' }
];

interface Constraint {
  dayOfWeek: number;
  shiftType: string;
  availability: string;
}

export default function AvailabilityConstraints() {
  const { user } = useAuth();
  const [currentWeek, setCurrentWeek] = useState(dayjs().startOf('week'));
  const [selectedAvailability, setSelectedAvailability] = useState('available');
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const isDepartmentAdmin = user?.systemRole === 'DEPARTMENT_ADMIN';
  const userDepartment = user?.department;
  const { data: deptConfigData, error: deptError } = useQuery(
    isDepartmentAdmin ? GET_MY_DEPARTMENT_SHIFT_CONFIG : GET_DEPARTMENT_SHIFT_CONFIG,
    { variables: isDepartmentAdmin ? {} : { departmentId: userDepartment }, skip: !userDepartment && !isDepartmentAdmin }
  );

  const weekStartDate = currentWeek.format('YYYY-MM-DD');

  const { data, loading, refetch } = useQuery(GET_AVAILABILITY_CONSTRAINTS, {
    variables: { weekStartDate },
    onCompleted: (data) => {
      if (data?.myAvailabilityConstraints?.constraints) {
        // Create a deep copy of the constraints to avoid read-only issues
        const mutableConstraints = data.myAvailabilityConstraints.constraints.map((c: Constraint) => ({
          dayOfWeek: c.dayOfWeek,
          shiftType: c.shiftType,
          availability: c.availability
        }));
        setConstraints(mutableConstraints);
      } else {
        // No constraints found, start with empty array
        setConstraints([]);
      }
    }
  });

  const [submitAvailability] = useMutation(SUBMIT_AVAILABILITY_CONSTRAINTS, {
    onCompleted: async () => {
      try {
        // Wait for refetch to complete before showing success
        await refetch();
        message.success('אילוצי הזמינות נשמרו בהצלחה');
        setHasChanges(false);
      } catch (error) {
        console.error('Error refetching after save:', error);
      }
    },
    onError: (error) => {
      message.error('שגיאה בשמירת אילוצי הזמינות');
      console.error('Availability constraints error:', error);
    }
  });

  const handleCellClick = (dayOfWeek: number, shiftType: string) => {
    const newConstraints = [...constraints];
    const existingIndex = newConstraints.findIndex(
      c => c.dayOfWeek === dayOfWeek && c.shiftType === shiftType
    );

    if (existingIndex >= 0) {
      // If clicking with the same availability as current, do nothing
      if (newConstraints[existingIndex].availability === selectedAvailability) {
        return;
      }
      
      // If setting back to available, remove the constraint
      if (selectedAvailability === 'available') {
        newConstraints.splice(existingIndex, 1);
      } else {
        // Create a new object instead of modifying the existing one
        newConstraints[existingIndex] = {
          ...newConstraints[existingIndex],
          availability: selectedAvailability
        };
      }
    } else {
      // Only add constraint if it's different from default (available)
      if (selectedAvailability !== 'available') {
        newConstraints.push({
          dayOfWeek,
          shiftType,
          availability: selectedAvailability
        });
      }
    }

    // Validate against constraint laws for real-time feedback
    const departmentConfig = deptConfigData?.myDepartmentShiftConfig || deptConfigData?.departmentShiftConfig;
    if (departmentConfig?.constraints) {
      const validation = validateConstraintsAgainstLaws(newConstraints, departmentConfig);
      
      if (!validation.isValid && validation.errors.length > 0) {
        message.warning(validation.errors[0]); // Show first error as warning
      }
    }

    setConstraints(newConstraints);
    setHasChanges(true);
  };

  const getCellColor = (dayOfWeek: number, shiftType: string) => {
    const constraint = constraints.find(
      c => c.dayOfWeek === dayOfWeek && c.shiftType === shiftType
    );
    
    if (constraint) {
      const option = AVAILABILITY_OPTIONS.find(opt => opt.value === constraint.availability);
      return option?.color || '#52c41a'; // Default to available color
    }
    
    // Default to available (green) color
    return '#52c41a';
  };

  const handleSave = async () => {
    // Validate against constraint laws if department has them
    const departmentConfig = deptConfigData?.myDepartmentShiftConfig || deptConfigData?.departmentShiftConfig;
    if (departmentConfig?.constraints) {
      const validation = validateConstraintsAgainstLaws(constraints, departmentConfig);
      
      if (!validation.isValid) {
        Modal.error({
          title: 'הגבלות לא תקינות',
          content: (
            <div>
              <p>האילוצים שהגדרת אינם עומדים בחוקי ההגבלות של המחלקה:</p>
              <ul>
                {validation.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          ),
        });
        return;
      }
    }

    await submitAvailability({
      variables: {
        input: {
          weekStartDate,
          constraints: constraints.map(c => ({
            dayOfWeek: c.dayOfWeek,
            shiftType: c.shiftType,
            availability: c.availability
          }))
        }
      }
    });
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const doChange = () => {
      const newWeek = direction === 'prev' 
        ? currentWeek.subtract(1, 'week')
        : currentWeek.add(1, 'week');
      setCurrentWeek(newWeek);
      setHasChanges(false);
      setConstraints([]);
    };
    if (hasChanges) {
      Modal.confirm({
        title: 'יש שינויים שלא נשמרו',
        content: 'האם לעבור שבוע מבלי לשמור?',
        okText: 'כן',
        cancelText: 'לא',
        onOk: doChange
      });
    } else {
      doChange();
    }
  };

  const getWeekDateRange = () => {
    const start = currentWeek.format('DD/MM');
    const end = currentWeek.endOf('week').format('DD/MM');
    return `${start} - ${end}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin size="large" />
      </div>
    );
  }

  const SHIFT_TYPES: { value: string; label: string; time: string }[] = (deptConfigData?.myDepartmentShiftConfig?.shiftTypes || deptConfigData?.departmentShiftConfig?.shiftTypes || [])
    .filter((st: any) => st.enabled)
    .map((st: any) => ({ value: st.type, label: st.label, time: `${st.defaultStartTime}-${st.defaultEndTime}` }))
    .concat((deptConfigData ? [] : DEFAULT_SHIFT_TYPES));

  return (
    <Card title="אילוצי זמינות" className="availability-constraints-card">
      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Button 
          icon={<RightOutlined />} 
          onClick={() => navigateWeek('next')}
        />
        <div className="text-lg font-medium">
          {getWeekDateRange()}
        </div>
        <Button 
          icon={<LeftOutlined />} 
          onClick={() => navigateWeek('prev')}
        />
      </div>

      {/* Availability Selector */}
      <div className="mb-6">
        <Select
          value={selectedAvailability}
          onChange={setSelectedAvailability}
          style={{ width: 200 }}
        >
          {AVAILABILITY_OPTIONS.map(option => (
            <Option key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: option.color }}
                />
                {option.label}
              </div>
            </Option>
          ))}
        </Select>
      </div>

      {/* Weekly Schedule Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-3 text-right">יום</th>
              {SHIFT_TYPES.map(shift => (
                <th key={shift.value} className="p-3 text-center">
                  <div>{shift.label}</div>
                  <div className="text-xs text-gray-500">{shift.time}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS_OF_WEEK.map((day, dayIndex) => (
              <tr key={day.value} className="border-t">
                <td className="p-3 font-medium">{day.label}</td>
                {SHIFT_TYPES.map(shift => (
                  <td 
                    key={`${day.value}-${shift.value}`}
                    className="p-0 border-r"
                  >
                    <div
                      className="h-16 cursor-pointer transition-colors hover:opacity-80"
                      style={{ backgroundColor: getCellColor(day.value, shift.value) }}
                      onClick={() => handleCellClick(day.value, shift.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex justify-end">
        <Button 
          type="primary" 
          onClick={handleSave}
          disabled={!hasChanges}
        >
          שמור אילוצים
        </Button>
      </div>

      {/* Instructions */}
      <div className="mt-4 text-sm text-gray-600">
        <p>• כל המשמרות מוגדרות כ"זמין" כברירת מחדל</p>
        <p>• בחר סטטוס זמינות מהרשימה ולחץ על המשמרות לשינוי</p>
        <p>• האילוצים יועברו למערכת השיבוץ ויילקחו בחשבון בעת יצירת המשמרות</p>
        <p>• ניתן לעדכן את האילוצים בכל עת</p>
      </div>
    </Card>
  );
} 