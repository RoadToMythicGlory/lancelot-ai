'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Empty,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  PlusOutlined,
  SaveOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useSubscription } from '@apollo/client';
import dayjs, { Dayjs } from 'dayjs';
import RangeNavigator from './RangeNavigator';
import RichTextEditor from './RichTextEditor';
import { useMcrRange } from '../hooks/useMcrRange';
import {
  GET_ACTIVITY_ROWS,
  ACTIVITY_ROW_CREATED_SUB,
  ACTIVITY_ROW_UPDATED_SUB,
  ACTIVITY_ROW_DELETED_SUB,
} from '@/graphql/mcrQueries';
import { DELETE_ACTIVITY_ROW, SAVE_ACTIVITY_ROWS } from '@/graphql/mcrMutations';
import type { ActivityRow, ActivityStatus, BroadcastType } from '../types';
import {
  ACTIVITY_STATUS_COLORS,
  ACTIVITY_STATUS_LABELS,
  BROADCAST_TYPES,
  BROADCAST_TYPE_COLORS,
  BROADCAST_TYPE_LABELS_HE,
  HEBREW_WEEKDAYS,
} from '../constants';
import StatusChip from './StatusChip';
import { sanitizeMcrHtml } from '../utils/sanitizeHtml';
import { exportCsv } from '../utils/exportCsv';

interface Props {
  canManage: boolean;
}

type LocalRow = ActivityRow & {
  _localId?: string;
  _isNew?: boolean;
  _dirty?: boolean;
};

function makeEmpty(date: Dayjs): LocalRow {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
  return {
    id: `tmp-${Math.random().toString(36).slice(2, 9)}`,
    _localId: `tmp-${Math.random().toString(36).slice(2, 9)}`,
    _isNew: true,
    _dirty: true,
    date: date.startOf('day').toISOString(),
    activityName: 'פעילות חדשה',
    time,
    endTime: time,
    status: 'UNKNOWN',
    isHidden: false,
    isManual: true,
  };
}

const ScheduleArea: React.FC<Props> = ({ canManage }) => {
  const { message } = App.useApp();
  const range = useMcrRange();
  const [rows, setRows] = useState<LocalRow[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; field: keyof ActivityRow } | null>(
    null,
  );
  const [editValue, setEditValue] = useState('');
  const [showViewMode, setShowViewMode] = useState(false);

  // Bring in rows from the API for the currently selected DAY.
  // Week/month modes just show grouped daily tables.
  const queryDate = range.date.startOf('day').toISOString();
  const { data, loading, refetch } = useQuery(GET_ACTIVITY_ROWS, {
    variables: { date: queryDate, includeHidden: true },
    fetchPolicy: 'cache-and-network',
  });
  const [saveRows, { loading: saving }] = useMutation(SAVE_ACTIVITY_ROWS, {
    refetchQueries: ['GetActivityRows'],
  });
  const [deleteRow, { loading: deleting }] = useMutation(DELETE_ACTIVITY_ROW, {
    refetchQueries: ['GetActivityRows'],
  });

  // Live updates: any activity row change re-fetches the current day. We
  // intentionally refetch instead of patching the cache because the row
  // shape includes nested warehouse equipment that's expensive to mirror
  // client-side and dirty-edit tracking would be hard to merge correctly.
  // Refetch is debounced naturally by Apollo's network policy.
  useSubscription(ACTIVITY_ROW_CREATED_SUB, {
    onData: () => {
      // Only refetch if there are no unsaved changes — otherwise we'd
      // clobber the operator's in-progress edits.
      if (rows.every((r) => !r._dirty)) refetch();
    },
  });
  useSubscription(ACTIVITY_ROW_UPDATED_SUB, {
    onData: () => {
      if (rows.every((r) => !r._dirty)) refetch();
    },
  });
  useSubscription(ACTIVITY_ROW_DELETED_SUB, {
    onData: () => {
      if (rows.every((r) => !r._dirty)) refetch();
    },
  });

  useEffect(() => {
    if (data?.activityRows) {
      setRows(
        data.activityRows.map((r: any) => ({
          ...r,
          _localId: r.id,
          _isNew: false,
          _dirty: false,
        })),
      );
    }
  }, [data, range.date]);

  const dirtyCount = useMemo(() => rows.filter((r) => r._dirty).length, [rows]);

  const updateRow = (id: string, patch: Partial<LocalRow>) => {
    setRows((prev) =>
      prev.map((r) => (r._localId === id ? { ...r, ...patch, _dirty: true } : r)),
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, makeEmpty(range.date)]);
  };

  // Removes a row by its local id. Only valid for unsaved (`_isNew`) rows
  // — persisted rows go through `deletePersistedRow` so the server copy
  // is also removed.
  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r._localId !== id));
  };

  const duplicateRow = (row: LocalRow) => {
    const copy = makeEmpty(range.date);
    copy.activityName = row.activityName;
    copy.time = row.time;
    copy.endTime = row.endTime;
    copy.source = row.source;
    copy.equipment = row.equipment;
    copy.backup = row.backup;
    copy.routing = row.routing;
    copy.channel = row.channel;
    copy.broadcastType = row.broadcastType;
    copy.notes = row.notes;
    copy.status = row.status || 'UNKNOWN';
    copy.isHidden = false;
    copy.isManual = true;
    // Drop the broadcast link on the duplicate so it doesn't shadow the
    // original row's link to a planner event.
    copy.broadcastEventId = undefined as any;
    setRows((prev) => {
      const idx = prev.findIndex((r) => (r._localId || r.id) === (row._localId || row.id));
      if (idx < 0) return [...prev, copy];
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const deletePersistedRow = async (row: LocalRow) => {
    if (!row.id || row._isNew) {
      removeRow(row._localId!);
      return;
    }
    try {
      await deleteRow({ variables: { id: row.id } });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      message.success('השורה נמחקה');
    } catch (err: any) {
      message.error('מחיקה נכשלה: ' + (err?.message || 'שגיאה לא ידועה'));
    }
  };

  const handleSave = async () => {
    try {
      const payload = rows.map((r) => ({
        id: r._isNew ? undefined : r.id,
        date: range.date.startOf('day').toISOString(),
        activityName: r.activityName,
        time: r.time,
        endTime: r.endTime,
        source: r.source,
        equipment: r.equipment,
        backup: r.backup,
        routing: r.routing,
        channel: r.channel,
        broadcastType: r.broadcastType,
        notes: r.notes,
        status: r.status,
        isHidden: r.isHidden ?? false,
        isManual: r.isManual ?? !r.broadcastEventId,
        broadcastEventId: r.broadcastEventId,
      }));
      await saveRows({
        variables: { date: range.date.startOf('day').toISOString(), rows: payload },
      });
      setSavedAt(dayjs().format('HH:mm:ss'));
      message.success('הלוח נשמר');
    } catch (err: any) {
      message.error('שמירה נכשלה: ' + (err?.message || 'שגיאה לא ידועה'));
    }
  };

  const handleExport = () => {
    const headers = [
      'פעילות',
      'שעת התחלה',
      'שעת סיום',
      'תאריך',
      'אולפן/מקור',
      'ערוץ',
      'מקור שידור',
      'יעד',
      'מכשירים',
      'הערות',
    ];
    const data = rows
      .filter((r) => !r.isHidden)
      .map((r) => [
        r.activityName,
        r.time,
        r.endTime,
        dayjs(r.date).format('DD/MM/YYYY'),
        r.channel || '',
        r.channel || '',
        r.source || '',
        r.routing || '',
        r.equipment || '',
        r.notes || '',
      ]);
    exportCsv(
      `mcr-schedule-${range.date.format('YYYY-MM-DD')}.csv`,
      headers,
      data,
    );
  };

  const startEdit = (row: LocalRow, field: keyof ActivityRow) => {
    if (!canManage) return;
    setEditingCell({ id: row._localId || row.id, field });
    setEditValue((row[field] as string) || '');
  };

  const commitEdit = () => {
    if (!editingCell) return;
    updateRow(editingCell.id, { [editingCell.field]: editValue } as Partial<LocalRow>);
    setEditingCell(null);
  };

  const renderCell = (row: LocalRow, field: keyof ActivityRow, rich = false) => {
    const isEditing =
      editingCell?.id === (row._localId || row.id) && editingCell?.field === field;
    const value = (row[field] as string) || '';

    if (isEditing && rich) {
      return (
        <div>
          <RichTextEditor value={editValue} onChange={setEditValue} />
          <Space size={4} className="mt-1">
            <Button size="small" type="primary" onClick={commitEdit}>
              ✓
            </Button>
            <Button size="small" onClick={() => setEditingCell(null)}>
              ✕
            </Button>
          </Space>
        </div>
      );
    }
    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') setEditingCell(null);
          }}
          className="w-full p-1 border rounded"
          autoFocus
        />
      );
    }

    if (rich) {
      return (
        <div
          onClick={() => startEdit(row, field)}
          className={`cursor-pointer p-1 hover:bg-slate-50 min-h-[28px] rounded`}
          dangerouslySetInnerHTML={{ __html: sanitizeMcrHtml(value || '&nbsp;') }}
        />
      );
    }

    return (
      <div
        onClick={() => startEdit(row, field)}
        className="cursor-pointer p-1 hover:bg-slate-50 min-h-[28px] rounded"
      >
        {value || '\u00A0'}
      </div>
    );
  };

  const columns: ColumnsType<LocalRow> = [
    {
      title: 'מקור',
      key: 'origin',
      width: 70,
      render: (_, r) =>
        r.broadcastEventId ? (
          <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>תכנון</Tag>
        ) : (
          <Tag style={{ margin: 0, fontSize: 11 }}>ידני</Tag>
        ),
    },
    {
      title: 'פעילות',
      key: 'activityName',
      render: (_, r) => renderCell(r, 'activityName'),
    },
    { title: 'שעה', key: 'time', width: 80, render: (_, r) => renderCell(r, 'time') },
    { title: 'סיום', key: 'endTime', width: 80, render: (_, r) => renderCell(r, 'endTime') },
    {
      title: 'מקור שידור',
      key: 'source',
      render: (_, r) => renderCell(r, 'source', true),
    },
    {
      title: 'מכשירים',
      key: 'equipment',
      render: (_, r) => renderCell(r, 'equipment', true),
    },
    { title: 'גיבוי', key: 'backup', render: (_, r) => renderCell(r, 'backup', true) },
    { title: 'ניתובים', key: 'routing', render: (_, r) => renderCell(r, 'routing', true) },
    { title: 'ערוץ', key: 'channel', width: 80, render: (_, r) => renderCell(r, 'channel') },
    {
      title: 'סוג שידור',
      key: 'broadcastType',
      width: 110,
      render: (_, r) => (
        <Select
          size="small"
          value={r.broadcastType}
          placeholder="בחר"
          style={{ width: '100%' }}
          disabled={!canManage}
          allowClear
          onChange={(v: BroadcastType) => updateRow(r._localId || r.id, { broadcastType: v })}
          options={BROADCAST_TYPES.map((t) => ({
            value: t,
            label: (
              <span style={{ color: BROADCAST_TYPE_COLORS[t] }}>
                {BROADCAST_TYPE_LABELS_HE[t]}
              </span>
            ),
          }))}
        />
      ),
    },
    { title: 'הערות', key: 'notes', render: (_, r) => renderCell(r, 'notes', true) },
    {
      title: 'סטטוס',
      key: 'status',
      width: 130,
      render: (_, r) => (
        <Select
          size="small"
          value={r.status}
          style={{ width: '100%' }}
          disabled={!canManage}
          onChange={(v: ActivityStatus) => updateRow(r._localId || r.id, { status: v })}
          options={(['UNKNOWN', 'READY', 'NOT_READY', 'ERROR'] as ActivityStatus[]).map((k) => ({
            value: k,
            label: (
              <StatusChip
                size="sm"
                label={ACTIVITY_STATUS_LABELS[k]}
                color={ACTIVITY_STATUS_COLORS[k]}
              />
            ),
          }))}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      align: 'center',
      render: (_, r) => (
        <Space size={2}>
          <Tooltip title={r.isHidden ? 'הצג בלוח צפייה' : 'הסתר מלוח צפייה'}>
            <Button
              size="small"
              type="text"
              disabled={!canManage}
              icon={r.isHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              onClick={() => updateRow(r._localId || r.id, { isHidden: !r.isHidden })}
            />
          </Tooltip>
          <Tooltip title="שכפל שורה">
            <Button
              size="small"
              type="text"
              disabled={!canManage}
              icon={<CopyOutlined />}
              onClick={() => duplicateRow(r)}
            />
          </Tooltip>
          <Popconfirm
            title={r._isNew ? 'הסרת שורה חדשה?' : 'למחוק את השורה לצמיתות?'}
            okText="כן"
            cancelText="לא"
            okButtonProps={{ danger: true, loading: deleting }}
            onConfirm={() => (r._isNew ? removeRow(r._localId!) : deletePersistedRow(r))}
          >
            <Tooltip title="מחק שורה">
              <Button
                size="small"
                type="text"
                danger
                disabled={!canManage}
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <RangeNavigator
        date={range.date}
        mode={range.mode}
        label={range.label}
        isToday={range.isToday}
        onDateChange={range.setDate}
        onModeChange={range.setMode}
        onNext={range.next}
        onPrev={range.prev}
        onToday={range.today}
        trailing={
          <>
            <Tooltip title="עדכון חי – נתונים מסונכרנים אוטומטית">
              <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold px-2">
                <WifiOutlined />
                חי
              </span>
            </Tooltip>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              ייצוא
            </Button>
            <Button onClick={() => setShowViewMode(true)}>תצוגת הצגה</Button>
            {canManage && (
              <Button type="primary" icon={<PlusOutlined />} onClick={addRow}>
                הוסף שורה
              </Button>
            )}
            {canManage && (
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                disabled={dirtyCount === 0}
                loading={saving}
              >
                שמור הכל {dirtyCount > 0 && `(${dirtyCount})`}
              </Button>
            )}
          </>
        }
      />

      {savedAt && (
        <div className="text-sm text-emerald-700">השמירה האחרונה: {savedAt}</div>
      )}

      <div className="mcr-panel mcr-panel-padded mcr-schedule-table" style={{ overflow: 'auto' }}>
        {loading && rows.length === 0 ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : range.mode === 'day' ? (
          rows.length === 0 ? (
            <Empty description="אין פעילויות לתאריך זה">
              {canManage && (
                <Button type="primary" icon={<PlusOutlined />} onClick={addRow}>
                  הוסף שורה
                </Button>
              )}
            </Empty>
          ) : (
            <Table
              columns={columns}
              dataSource={rows}
              rowKey={(r) => r._localId || r.id}
              pagination={false}
              size="small"
              bordered
              tableLayout="fixed"
              rowClassName={(r) =>
                [r._dirty ? 'is-dirty' : '', r.isHidden ? 'is-hidden-row' : '']
                  .filter(Boolean)
                  .join(' ')
              }
            />
          )
        ) : (
          // Week/month: group by day. For each day we open a separate
          // GraphQL-loaded table on click; for simplicity we show a summary
          // listing pulled from the same query (only the selected day is
          // fully loaded — others are placeholders the user can navigate to).
          <WeekOrMonthSummary
            mode={range.mode}
            rangeStart={range.range.start}
            rangeEnd={range.range.end}
            selectedDate={range.date}
            onPickDay={(d) => {
              range.setDate(d);
              range.setMode('day');
            }}
          />
        )}
      </div>

      <Modal
        open={showViewMode}
        onCancel={() => setShowViewMode(false)}
        title="תצוגת הצגה"
        width="92vw"
        footer={[
          <Button key="exit" type="primary" onClick={() => setShowViewMode(false)}>
            חזרה למצב עריכה
          </Button>,
          <Button key="exp" icon={<DownloadOutlined />} onClick={handleExport}>
            ייצוא
          </Button>,
        ]}
      >
        <ViewModeTable
          date={range.date}
          rows={rows.filter((r) => !r.isHidden)}
        />
      </Modal>
    </div>
  );
};

export default ScheduleArea;

// ---- helpers ----

const WeekOrMonthSummary: React.FC<{
  mode: 'week' | 'month';
  rangeStart: Dayjs;
  rangeEnd: Dayjs;
  selectedDate: Dayjs;
  onPickDay: (d: Dayjs) => void;
}> = ({ rangeStart, rangeEnd, selectedDate, onPickDay }) => {
  const days = useMemo(() => {
    const out: Dayjs[] = [];
    let cur = rangeStart.startOf('day');
    while (cur.isBefore(rangeEnd) || cur.isSame(rangeEnd, 'day')) {
      out.push(cur);
      cur = cur.add(1, 'day');
    }
    return out;
  }, [rangeStart, rangeEnd]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-slate-500">
        לחץ על יום כדי לפתוח את עריכתו המלאה. כל שינוי נשמר עם כפתור &quot;שמור הכל&quot;.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {days.map((d) => {
          const isSelected = d.isSame(selectedDate, 'day');
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPickDay(d)}
              className={`text-right p-3 rounded-xl border ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-white hover:border-blue-300'
              }`}
            >
              <div className="font-semibold">{HEBREW_WEEKDAYS[d.day()]}</div>
              <div className="text-xs text-slate-500">{d.format('DD/MM/YYYY')}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ViewModeTable: React.FC<{ date: Dayjs; rows: LocalRow[] }> = ({ date, rows }) => (
  <div className="mcr-view-page p-4 rounded-md">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-2xl font-bold">לוח MCR יומי</h2>
      <div className="text-base text-blue-300">
        {HEBREW_WEEKDAYS[date.day()]}, {date.format('DD/MM/YYYY')}
      </div>
    </div>
    {rows.length === 0 ? (
      <div className="text-gray-400 text-center py-10">אין פעילויות בתאריך זה</div>
    ) : (
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>פעילות</th>
              <th>שעה</th>
              <th>סיום</th>
              <th>אולפן/מקור</th>
              <th>ערוץ</th>
              <th>יעד</th>
              <th>מכשירים</th>
              <th>הערות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._localId || r.id}>
                <td>{r.activityName}</td>
                <td>{r.time}</td>
                <td>{r.endTime}</td>
                <td dangerouslySetInnerHTML={{ __html: sanitizeMcrHtml(r.source || '') }} />
                <td>{r.channel || '-'}</td>
                <td dangerouslySetInnerHTML={{ __html: sanitizeMcrHtml(r.routing || '') }} />
                <td dangerouslySetInnerHTML={{ __html: sanitizeMcrHtml(r.equipment || '') }} />
                <td dangerouslySetInnerHTML={{ __html: sanitizeMcrHtml(r.notes || '') }} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
