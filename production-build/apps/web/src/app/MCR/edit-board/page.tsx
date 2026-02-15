'use client';

import React, { useState, useEffect } from 'react';
import { ActivityRow, BroadcastType } from '../types';
import RichTextEditor from '../components/RichTextEditor';

const broadcastTypes: BroadcastType[] = [
  'SRT CALLER',
  'SRT LISTENER',
  'DVBS2',
  'DVBS2X',
  'NS4',
  'NS3',
  'RTMP',
  'ZIXI',
  'PRT',
  'LIVEU',
  'קליטה מOU',
  'OTHER',
];

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

export default function EditBoardPage() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    // TODO: Fetch activities for selected date from GraphQL API
    setActivities([]);
  }, [selectedDate]);

  const handleAddRow = () => {
    const newRow: ActivityRow = {
      id: Date.now().toString(),
      activityName: '',
      time: '',
      endTime: '',
      equipment: '',
      backup: '',
      routing: '',
      channel: '-',
      broadcastType: undefined,
      notes: '',
      status: 'unknown',
      isManual: true,
    };
    setActivities([...activities, newRow]);
  };

  const handleHideRow = (id: string) => {
    setActivities(activities.map(a => 
      a.id === id ? { ...a, isHidden: true } : a
    ));
  };

  const handleCellEdit = (rowId: string, field: string, value: string) => {
    setActivities(activities.map(activity =>
      activity.id === rowId ? { ...activity, [field]: value } : activity
    ));
    setEditingCell(null);
  };

  const startEdit = (rowId: string, field: string, currentValue: string) => {
    setEditingCell({ rowId, field });
    setEditValue(currentValue);
  };

  const renderEditableCell = (activity: ActivityRow, field: keyof ActivityRow, isRichText: boolean = false) => {
    const isEditing = editingCell?.rowId === activity.id && editingCell?.field === field;
    const value = activity[field] as string;

    if (isEditing && isRichText) {
      return (
        <RichTextEditor
          value={editValue}
          onChange={setEditValue}
          placeholder=""
        />
      );
    }

    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleCellEdit(activity.id, field, editValue)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleCellEdit(activity.id, field, editValue);
            }
          }}
          className="w-full p-1 border rounded"
          autoFocus
        />
      );
    }

    if (isRichText) {
      return (
        <div
          onClick={() => startEdit(activity.id, field, value)}
          className="cursor-pointer p-1 hover:bg-gray-100 min-h-[30px]"
          dangerouslySetInnerHTML={{ __html: value || '&nbsp;' }}
        />
      );
    }

    return (
      <div
        onClick={() => startEdit(activity.id, field, value)}
        className="cursor-pointer p-1 hover:bg-gray-100 min-h-[30px]"
      >
        {value || '\u00A0'}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-full mx-auto">
        <h1 className="text-2xl font-bold mb-4">לוח פעילויות עריכה</h1>
        
        <div className="mb-4 flex items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="font-medium">בחר תאריך:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="p-2 border rounded"
              required
            />
          </label>
          <button
            onClick={handleAddRow}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            הוסף שורה +
          </button>
        </div>

        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-gray-100">
                <th className="text-right p-3">פעילות</th>
                <th className="text-right p-3">מכשירים</th>
                <th className="text-right p-3">גיבוי</th>
                <th className="text-right p-3">ניתובים</th>
                <th className="text-right p-3">ערוץ</th>
                <th className="text-right p-3">סוג שידור</th>
                <th className="text-right p-3">הערות</th>
                <th className="text-right p-3">סטטוס</th>
                <th className="text-center p-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {activities.filter(a => !a.isHidden).map((activity) => (
                <tr key={activity.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    {activity.isManual ? (
                      renderEditableCell(activity, 'activityName')
                    ) : (
                      <div className="font-medium">{activity.activityName}</div>
                    )}
                  </td>
                  <td className="p-3">{renderEditableCell(activity, 'equipment', true)}</td>
                  <td className="p-3">{renderEditableCell(activity, 'backup', true)}</td>
                  <td className="p-3">{renderEditableCell(activity, 'routing', true)}</td>
                  <td className="p-3">{activity.channel || '-'}</td>
                  <td className="p-3">
                    {activity.broadcastType ? (
                      <div
                        className="px-2 py-1 rounded text-center text-white"
                        style={{ backgroundColor: broadcastTypeColors[activity.broadcastType] }}
                      >
                        {activity.broadcastType}
                      </div>
                    ) : (
                      <select
                        value={activity.broadcastType || ''}
                        onChange={(e) => handleCellEdit(activity.id, 'broadcastType', e.target.value)}
                        className="w-full p-1 border rounded"
                      >
                        <option value="">בחר סוג</option>
                        {broadcastTypes.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-3">{renderEditableCell(activity, 'notes', true)}</td>
                  <td className="p-3">
                    <select
                      value={activity.status}
                      onChange={(e) => handleCellEdit(activity.id, 'status', e.target.value)}
                      className="w-full p-1 border rounded"
                    >
                      <option value="unknown">לא הוגדר</option>
                      <option value="ready">מוכן לשידור</option>
                      <option value="not_ready">לא מוכן לשידור</option>
                      <option value="error">תקלה</option>
                    </select>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handleHideRow(activity.id)}
                      className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      הסתר שורה
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

