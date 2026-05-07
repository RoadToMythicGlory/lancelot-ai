'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { ActivityRow, ActivityStatus, BroadcastType } from '../types';
import { GET_ACTIVITY_ROWS } from '@/graphql/mcrQueries';
import { CREATE_ACTIVITY_ROW, UPDATE_ACTIVITY_ROW, HIDE_ACTIVITY_ROW } from '@/graphql/mcrMutations';
import RichTextEditor from '../components/RichTextEditor';

const broadcastTypes: BroadcastType[] = [
  'SRT_CALLER',
  'SRT_LISTENER',
  'DVBS2',
  'DVBS2X',
  'NS4',
  'NS3',
  'RTMP',
  'ZIXI',
  'PRT',
  'LIVEU',
  'KLITA_MOU',
  'OTHER',
];

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

const statusLabels: Record<ActivityStatus, string> = {
  'UNKNOWN': 'לא הוגדר',
  'READY': 'מוכן לשידור',
  'NOT_READY': 'לא מוכן לשידור',
  'ERROR': 'תקלה',
};

export default function EditBoardPage() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Fetch activity rows for the selected date (includes auto-synced broadcast events)
  const { data, loading, error, refetch } = useQuery(GET_ACTIVITY_ROWS, {
    variables: {
      date: new Date(selectedDate + 'T00:00:00').toISOString(),
      includeHidden: true,
    },
    fetchPolicy: 'cache-and-network',
  });

  const activities: ActivityRow[] = data?.activityRows ?? [];

  // Mutations
  const [createActivityRow] = useMutation(CREATE_ACTIVITY_ROW, {
    onCompleted: () => refetch(),
    onError: (err) => console.error('Failed to create activity row:', err),
  });

  const [updateActivityRow] = useMutation(UPDATE_ACTIVITY_ROW, {
    onCompleted: () => refetch(),
    onError: (err) => console.error('Failed to update activity row:', err),
  });

  const [hideActivityRow] = useMutation(HIDE_ACTIVITY_ROW, {
    onCompleted: () => refetch(),
    onError: (err) => console.error('Failed to hide activity row:', err),
  });

  const handleAddRow = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    createActivityRow({
      variables: {
        input: {
          date: new Date(selectedDate + 'T00:00:00').toISOString(),
          activityName: 'פעילות חדשה',
          time: currentTime,
          endTime: currentTime,
          status: 'UNKNOWN',
          isManual: true,
        },
      },
    });
  };

  const handleHideRow = (id: string) => {
    hideActivityRow({ variables: { id } });
  };

  const handleCellEdit = (rowId: string, field: string, value: string) => {
    updateActivityRow({
      variables: {
        id: rowId,
        input: { [field]: value },
      },
    });
    setEditingCell(null);
  };

  const startEdit = (rowId: string, field: string, currentValue: string) => {
    setEditingCell({ rowId, field });
    setEditValue(currentValue || '');
  };

  const renderEditableCell = (activity: ActivityRow, field: keyof ActivityRow, isRichText: boolean = false) => {
    const isEditing = editingCell?.rowId === activity.id && editingCell?.field === field;
    const value = (activity[field] as string) || '';

    if (isEditing && isRichText) {
      return (
        <div>
          <RichTextEditor
            value={editValue}
            onChange={setEditValue}
            placeholder=""
          />
          <div className="flex gap-1 mt-1">
            <button
              onClick={() => handleCellEdit(activity.id, field, editValue)}
              className="px-2 py-0.5 bg-green-500 text-white rounded text-xs"
            >
              ✓
            </button>
            <button
              onClick={() => setEditingCell(null)}
              className="px-2 py-0.5 bg-gray-400 text-white rounded text-xs"
            >
              ✕
            </button>
          </div>
        </div>
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
            if (e.key === 'Escape') {
              setEditingCell(null);
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
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            רענן
          </button>
        </div>

        {loading && activities.length === 0 && (
          <div className="text-center py-8 text-gray-500">טוען פעילויות...</div>
        )}

        {error && (
          <div className="text-center py-4 text-red-500 bg-red-50 rounded mb-4">
            שגיאה בטעינת נתונים: {error.message}
          </div>
        )}

        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-gray-100">
                <th className="text-right p-3">מקור</th>
                <th className="text-right p-3">פעילות</th>
                <th className="text-right p-3">שעה</th>
                <th className="text-right p-3">שעת סיום</th>
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
                <tr
                  key={activity.id}
                  className={`border-b hover:bg-gray-50 ${activity.broadcastEventId ? 'bg-blue-50/50' : ''}`}
                >
                  <td className="p-3">
                    {activity.broadcastEventId ? (
                      <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        תכנון שידור
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                        ידני
                      </span>
                    )}
                  </td>
                  <td className="p-3">{renderEditableCell(activity, 'activityName')}</td>
                  <td className="p-3">{renderEditableCell(activity, 'time')}</td>
                  <td className="p-3">{renderEditableCell(activity, 'endTime')}</td>
                  <td className="p-3">{renderEditableCell(activity, 'equipment', true)}</td>
                  <td className="p-3">{renderEditableCell(activity, 'backup', true)}</td>
                  <td className="p-3">{renderEditableCell(activity, 'routing', true)}</td>
                  <td className="p-3">{renderEditableCell(activity, 'channel')}</td>
                  <td className="p-3">
                    {activity.broadcastType ? (
                      <div
                        className="px-2 py-1 rounded text-center text-white text-sm"
                        style={{ backgroundColor: broadcastTypeColors[activity.broadcastType] || '#666' }}
                      >
                        {broadcastTypeLabels[activity.broadcastType] || activity.broadcastType}
                      </div>
                    ) : (
                      <select
                        value=""
                        onChange={(e) => handleCellEdit(activity.id, 'broadcastType', e.target.value)}
                        className="w-full p-1 border rounded text-sm"
                      >
                        <option value="">בחר סוג</option>
                        {broadcastTypes.map((type) => (
                          <option key={type} value={type}>{broadcastTypeLabels[type]}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="p-3">{renderEditableCell(activity, 'notes', true)}</td>
                  <td className="p-3">
                    <select
                      value={activity.status}
                      onChange={(e) => handleCellEdit(activity.id, 'status', e.target.value)}
                      className="w-full p-1 border rounded text-sm"
                    >
                      {(Object.keys(statusLabels) as ActivityStatus[]).map((key) => (
                        <option key={key} value={key}>{statusLabels[key]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handleHideRow(activity.id)}
                      className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                    >
                      הסתר שורה
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && activities.filter(a => !a.isHidden).length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-gray-400">
                    אין פעילויות לתאריך זה. לחץ על &quot;הוסף שורה +&quot; כדי להתחיל.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
