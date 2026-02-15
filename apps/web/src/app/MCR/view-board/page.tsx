'use client';

import React, { useState, useEffect } from 'react';
import { ActivityRow, BroadcastType } from '../types';

const broadcastTypeColors: Record<BroadcastType, string> = {
  'SRT CALLER': '#7ca13d',
  'SRT LISTENER': '#a8cc6a',
  'DVBS2': '#ed80e8',
  'DVBS2X': '#54b0c7',
  'NS3': '#1b943b',
  'NS4': '#1b943b',
  'RTMP': '#d46eab',
  'ZIXI': '#ff6b6b',
  'LIVEU': '#e8ca92',
  'PRT': '#c2e8ed',
  'קליטה מOU': '#b135de',
  'OTHER': '#e31464',
};

export default function ViewBoardPage() {
  const [activities, setActivities] = useState<ActivityRow[]>([]);

  useEffect(() => {
    // TODO: Fetch today's activities from GraphQL API
    setActivities([]);
  }, []);

  const getStatusIcon = (status: ActivityRow['status']) => {
    switch (status) {
      case 'ready':
        return <span className="text-green-500 text-xl">✓</span>;
      case 'not_ready':
        return <span className="text-yellow-500 text-xl">?</span>;
      case 'error':
        return <span className="text-red-500 text-xl">!</span>;
      default:
        return <span className="text-gray-400 text-xl">?</span>;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <h1 className="text-2xl font-bold mb-4">לוח פעילויות צפייה</h1>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-600">
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
              <tr key={activity.id} className="border-b border-gray-700">
                <td className="p-2">{activity.activityName}</td>
                <td className="p-2">{activity.time}</td>
                <td className="p-2">{activity.endTime}</td>
                <td className="p-2">{activity.equipment}</td>
                <td className="p-2">{activity.backup}</td>
                <td className="p-2">{activity.routing}</td>
                <td className="p-2">{activity.channel || '-'}</td>
                <td className="p-2">
                  {activity.broadcastType && (
                    <div
                      className="px-2 py-1 rounded text-center"
                      style={{
                        backgroundColor: broadcastTypeColors[activity.broadcastType],
                        color: 'white',
                      }}
                    >
                      {activity.broadcastType}
                    </div>
                  )}
                </td>
                <td className="p-2">{activity.notes}</td>
                <td className="p-2 text-center">{getStatusIcon(activity.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

