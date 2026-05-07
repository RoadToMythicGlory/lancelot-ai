'use client';

import React from 'react';
import { useQuery } from '@apollo/client';
import { ActivityRow, ActivityStatus, BroadcastType } from '../types';
import { GET_ACTIVITY_ROWS } from '@/graphql/mcrQueries';

const broadcastTypeLabels: Record<BroadcastType, string> = {
  'SRT_CALLER': 'SRT CALLER',
  'SRT_LISTENER': 'SRT LISTENER',
  'DVBS2': 'DVBS2',
  'DVBS2X': 'DVBS2X',
  'NS3': 'NS3',
  'NS4': 'NS4',
  'RTMP': 'RTMP',
  'ZIXI': 'ZIXI',
  'PRT': 'PRT',
  'LIVEU': 'LIVEU',
  'KLITA_MOU': 'קליטה מOU',
  'OTHER': 'OTHER',
};

const broadcastTypeColors: Record<BroadcastType, string> = {
  'SRT_CALLER': '#7ca13d',
  'SRT_LISTENER': '#a8cc6a',
  'DVBS2': '#ed80e8',
  'DVBS2X': '#54b0c7',
  'NS3': '#1b943b',
  'NS4': '#1b943b',
  'RTMP': '#d46eab',
  'ZIXI': '#ff6b6b',
  'LIVEU': '#e8ca92',
  'PRT': '#c2e8ed',
  'KLITA_MOU': '#b135de',
  'OTHER': '#e31464',
};

const statusConfig: Record<ActivityStatus, { icon: string; color: string }> = {
  'READY': { icon: '✓', color: 'text-green-500' },
  'NOT_READY': { icon: '?', color: 'text-yellow-500' },
  'ERROR': { icon: '!', color: 'text-red-500' },
  'UNKNOWN': { icon: '?', color: 'text-gray-400' },
};

export default function ViewBoardPage() {
  const todayISO = new Date().toISOString();

  // Only fetch from ActivityRows — shows exactly what was filled in on the edit-board
  const { data, loading, error } = useQuery(GET_ACTIVITY_ROWS, {
    variables: {
      date: todayISO,
      includeHidden: false,
    },
    fetchPolicy: 'cache-and-network',
    pollInterval: 30000,
  });

  const activities: ActivityRow[] = data?.activityRows ?? [];

  const getStatusIcon = (status: ActivityStatus) => {
    const config = statusConfig[status] || statusConfig['UNKNOWN'];
    return <span className={`${config.color} text-xl`}>{config.icon}</span>;
  };

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <h1 className="text-2xl font-bold mb-4">לוח פעילויות צפייה</h1>

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
              <th className="text-right p-2">מכשירים</th>
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
                <td className="p-2 [&_*]:!text-white" dangerouslySetInnerHTML={{ __html: activity.equipment || '' }} />
                <td className="p-2 [&_*]:!text-white" dangerouslySetInnerHTML={{ __html: activity.backup || '' }} />
                <td className="p-2 [&_*]:!text-white" dangerouslySetInnerHTML={{ __html: activity.routing || '' }} />
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
                <td className="p-2 [&_*]:!text-white" dangerouslySetInnerHTML={{ __html: activity.notes || '' }} />
                <td className="p-2 text-center">{getStatusIcon(activity.status)}</td>
              </tr>
            ))}
            {!loading && activities.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center py-8 text-gray-500">
                  אין פעילויות להיום.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
