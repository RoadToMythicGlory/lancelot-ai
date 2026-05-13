'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@apollo/client';
import { ActivityRow, ActivityStatus, BroadcastType, WarehouseEquipmentAssignment } from '../types';
import { GET_ACTIVITY_ROWS } from '@/graphql/mcrQueries';
import { Button, DatePicker } from 'antd';
import { LeftOutlined, RightOutlined, LoadingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const HEBREW_WEEKDAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];

const broadcastTypeLabels: Record<BroadcastType, string> = {
  'SRT_CALLER': 'SRT CALLER', 'SRT_LISTENER': 'SRT LISTENER',
  'DVBS2': 'DVBS2', 'DVBS2X': 'DVBS2X', 'NS3': 'NS3', 'NS4': 'NS4',
  'RTMP': 'RTMP', 'ZIXI': 'ZIXI', 'PRT': 'PRT', 'LIVEU': 'LIVEU',
  'KLITA_MOU': 'קליטה מOU', 'OTHER': 'OTHER',
};

const broadcastTypeColors: Record<BroadcastType, string> = {
  'SRT_CALLER': '#7ca13d', 'SRT_LISTENER': '#a8cc6a', 'DVBS2': '#ed80e8',
  'DVBS2X': '#54b0c7', 'NS3': '#1b943b', 'NS4': '#1b943b', 'RTMP': '#d46eab',
  'ZIXI': '#ff6b6b', 'LIVEU': '#e8ca92', 'PRT': '#c2e8ed', 'KLITA_MOU': '#b135de',
  'OTHER': '#e31464',
};

const statusConfig: Record<ActivityStatus, { icon: string; color: string }> = {
  'READY': { icon: '✓', color: 'text-green-500' },
  'NOT_READY': { icon: '?', color: 'text-yellow-500' },
  'ERROR': { icon: '!', color: 'text-red-500' },
  'UNKNOWN': { icon: '?', color: 'text-gray-400' },
};

export default function ViewBoardPage() {
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs>(() => dayjs().startOf('day'));

  const dateValid = selectedDate && selectedDate.isValid();
  const isToday = dateValid && selectedDate.isSame(dayjs(), 'day');

  const { data, loading, error } = useQuery(GET_ACTIVITY_ROWS, {
    variables: {
      date: dateValid ? selectedDate.startOf('day').toISOString() : new Date().toISOString(),
      includeHidden: false,
    },
    skip: !dateValid,
    fetchPolicy: 'cache-and-network',
    pollInterval: 30000,
  });

  const activities: ActivityRow[] = data?.activityRows ?? [];

  const goToPreviousDay = useCallback(() => {
    setSelectedDate((prev) => prev.subtract(1, 'day').startOf('day'));
  }, []);

  const goToNextDay = useCallback(() => {
    setSelectedDate((prev) => prev.add(1, 'day').startOf('day'));
  }, []);

  const goToToday = useCallback(() => {
    setSelectedDate(dayjs().startOf('day'));
  }, []);

  // Keyboard shortcuts for quickly scrolling between dates.
  // RTL convention: ArrowRight = previous day, ArrowLeft = next day. "t" / Home = today.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToPreviousDay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToNextDay();
      } else if (e.key === 'Home' || e.key === 't' || e.key === 'T') {
        e.preventDefault();
        goToToday();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goToPreviousDay, goToNextDay, goToToday]);

  const getStatusIcon = (status: ActivityStatus) => {
    const config = statusConfig[status] || statusConfig['UNKNOWN'];
    return <span className={`${config.color} text-xl`}>{config.icon}</span>;
  };

  const dateLabel = dateValid
    ? `${HEBREW_WEEKDAYS[selectedDate.day()]}, ${selectedDate.format('DD/MM/YYYY')}`
    : '';

  return (
    <div className="min-h-screen bg-black text-white p-4" dir="rtl">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">לוח פעילויות צפייה</h1>
          <div className="text-lg text-blue-300 mt-1 flex items-center gap-2">
            <span>{dateLabel}</span>
            {loading && (
              <LoadingOutlined className="text-blue-400" aria-label="טוען..." />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap" dir="rtl">
          <Button
            icon={<RightOutlined />}
            onClick={goToPreviousDay}
            title="יום קודם (חץ ימינה)"
          >
            יום קודם
          </Button>
          <Button
            onClick={goToToday}
            type={isToday ? 'primary' : 'default'}
            disabled={isToday}
            title="היום (T)"
          >
            היום
          </Button>
          <DatePicker
            value={dateValid ? selectedDate : null}
            onChange={(date) => { if (date) setSelectedDate(date.startOf('day')); }}
            format="DD/MM/YYYY"
            allowClear={false}
          />
          <Button
            icon={<LeftOutlined />}
            onClick={goToNextDay}
            title="יום הבא (חץ שמאלה)"
          >
            יום הבא
          </Button>
        </div>
      </div>

      {loading && activities.length === 0 && (
        <div className="text-center py-8 text-gray-400">טוען פעילויות...</div>
      )}

      {error && (
        <div className="text-center py-4 text-red-400 bg-red-900/30 rounded mb-4">
          שגיאה בטעינת נתונים: {error.message}
        </div>
      )}
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-600">
              <th className="text-right p-2">מקור</th>
              <th className="text-right p-2">פעילות</th>
              <th className="text-right p-2">שעה</th>
              <th className="text-right p-2">שעת סיום</th>
              <th className="text-right p-2">מקור שידור</th>
              <th className="text-right p-2">מכשירים</th>
              <th className="text-right p-2">ציוד מהמחסן</th>
              <th className="text-right p-2">גיבוי</th>
              <th className="text-right p-2">ניתובים</th>
              <th className="text-right p-2">ערוץ</th>
              <th className="text-right p-2">סוג שידור</th>
              <th className="text-right p-2">הערות</th>
              <th className="text-center p-2 w-16">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((activity) => (
              <tr
                key={activity.id}
                className={`border-b border-gray-700 ${activity.broadcastEventId ? 'bg-blue-900/20' : ''}`}
              >
                <td className="p-2">
                  {activity.broadcastEventId ? (
                    <span className="inline-block px-2 py-0.5 bg-blue-800 text-blue-200 rounded text-xs">
                      תכנון שידור
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">
                      ידני
                    </span>
                  )}
                </td>
                <td className="p-2 font-medium">{activity.activityName}</td>
                <td className="p-2">{activity.time}</td>
                <td className="p-2">{activity.endTime}</td>
                <td className="p-2 text-white [&_p]:text-inherit" dangerouslySetInnerHTML={{ __html: activity.source || '' }} />
                <td className="p-2 text-white [&_p]:text-inherit" dangerouslySetInnerHTML={{ __html: activity.equipment || '' }} />
                <td className="p-2">
                  {(activity.warehouseEquipment || []).length > 0 ? (
                    <div className="space-y-1">
                      {(activity.warehouseEquipment || []).map((item: WarehouseEquipmentAssignment) => (
                        <div key={item.id} className="text-xs bg-blue-900/40 text-blue-200 px-1.5 py-0.5 rounded">
                          {item.eventName} (×{item.quantityAssigned})
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-600">-</span>
                  )}
                </td>
                <td className="p-2 text-white [&_p]:text-inherit" dangerouslySetInnerHTML={{ __html: activity.backup || '' }} />
                <td className="p-2 text-white [&_p]:text-inherit" dangerouslySetInnerHTML={{ __html: activity.routing || '' }} />
                <td className="p-2">{activity.channel || '-'}</td>
                <td className="p-2">
                  {activity.broadcastType && (
                    <div
                      className="px-2 py-1 rounded text-center text-sm"
                      style={{
                        backgroundColor: broadcastTypeColors[activity.broadcastType] || '#666',
                        color: 'white',
                      }}
                    >
                      {broadcastTypeLabels[activity.broadcastType] || activity.broadcastType}
                    </div>
                  )}
                </td>
                <td className="p-2 text-white [&_p]:text-inherit" dangerouslySetInnerHTML={{ __html: activity.notes || '' }} />
                <td className="p-2 text-center">{getStatusIcon(activity.status)}</td>
              </tr>
            ))}
            {!loading && activities.length === 0 && (
              <tr>
                <td colSpan={13} className="text-center py-8 text-gray-500">
                  {isToday
                    ? 'אין פעילויות להיום.'
                    : `אין פעילויות לתאריך ${selectedDate.format('DD/MM/YYYY')}.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
