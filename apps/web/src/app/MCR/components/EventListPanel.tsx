'use client';

import React, { useMemo } from 'react';
import { Button, Empty, Skeleton, Tag, Tooltip } from 'antd';
import { PlusOutlined, DownloadOutlined, WifiOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import type { CalendarRangeMode, MCREvent } from '../types';
import {
  PREPARATION_STATUS_COLORS,
  PREPARATION_STATUS_LABELS,
  HEBREW_WEEKDAYS,
  BROADCAST_TYPE_LABELS_HE,
  BROADCAST_TYPE_COLORS,
} from '../constants';
import StatusChip from './StatusChip';

interface Props {
  events: MCREvent[];
  loading: boolean;
  mode: CalendarRangeMode;
  date: Dayjs;
  selectedId: string | null;
  canManage: boolean;
  onSelect: (event: MCREvent) => void;
  onExport: () => void;
  onCreate: () => void;
}

type GroupedEvent = { dateKey: string; label: string; events: MCREvent[] };

function groupByDay(events: MCREvent[]): GroupedEvent[] {
  const groups = new Map<string, MCREvent[]>();
  for (const ev of events) {
    const d = dayjs(ev.start);
    const key = d.format('YYYY-MM-DD');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, evs]) => {
      const d = dayjs(key);
      const label = `${HEBREW_WEEKDAYS[d.day()]}, ${d.format('DD/MM/YYYY')}`;
      return {
        dateKey: key,
        label,
        events: evs.sort(
          (a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf(),
        ),
      };
    });
}

const EventListPanel: React.FC<Props> = ({
  events,
  loading,
  mode,
  date: _date,
  selectedId,
  canManage,
  onSelect,
  onExport,
  onCreate,
}) => {
  const groups = useMemo(() => groupByDay(events), [events]);

  return (
    <div className="mcr-panel" dir="rtl">
      <div className="mcr-panel-header">
        <div className="mcr-section-title">
          <span>אירועי MCR</span>
          <span className="mcr-section-count">{events.length}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <Tooltip title="עדכון חי – נתונים מסונכרנים אוטומטית">
            <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
              <WifiOutlined />
              חי
            </span>
          </Tooltip>
          <Tooltip title="ייצוא לרשימה (CSV)">
            <Button size="small" icon={<DownloadOutlined />} onClick={onExport}>
              ייצוא
            </Button>
          </Tooltip>
          {canManage && (
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined />}
              onClick={onCreate}
            >
              אירוע חדש
            </Button>
          )}
        </div>
      </div>

      <div className="mcr-panel-padded" style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
        {loading && events.length === 0 ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : events.length === 0 ? (
          <Empty
            description={`אין אירועים בתקופה ${mode === 'day' ? 'הנבחרת' : 'שנבחרה'}`}
          >
            {canManage && (
              <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
                הוסף אירוע
              </Button>
            )}
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {(mode === 'day' ? [groups[0] || { dateKey: '', label: '', events }] : groups).map((g) => (
              <div key={g.dateKey} className="flex flex-col gap-2">
                {mode !== 'day' && g.label && (
                  <div className="mcr-day-group-header">
                    <span>{g.label}</span>
                    <span className="mcr-day-group-count">{g.events.length}</span>
                  </div>
                )}
                {g.events.map((ev) => {
                  const isSelected = ev.id === selectedId;
                  const start = dayjs(ev.start);
                  const end = dayjs(ev.end);
                  const sourceFromBroadcast = !!ev.broadcastEventId;
                  return (
                    <div
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelect(ev)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onSelect(ev);
                      }}
                      className={`mcr-event-row ${isSelected ? 'is-selected' : ''}`}
                    >
                      <div className="flex flex-1 min-w-0 flex-col gap-1">
                        <div className="mcr-event-row-title truncate">
                          {ev.title || 'אירוע ללא שם'}
                        </div>
                        <div className="mcr-event-row-meta">
                          <span>{start.format('HH:mm')}</span>
                          {end.isValid() && <span>– {end.format('HH:mm')}</span>}
                          {ev.broadcastChannel && (
                            <span style={{ color: '#1e293b' }}>
                              · ערוץ {ev.broadcastChannel}
                            </span>
                          )}
                          {ev.broadcastType && (
                            <Tag
                              style={{
                                margin: 0,
                                fontSize: 11,
                                backgroundColor:
                                  BROADCAST_TYPE_COLORS[ev.broadcastType] + '20',
                                color: BROADCAST_TYPE_COLORS[ev.broadcastType],
                                border: `1px solid ${BROADCAST_TYPE_COLORS[ev.broadcastType]}60`,
                              }}
                            >
                              {BROADCAST_TYPE_LABELS_HE[ev.broadcastType]}
                            </Tag>
                          )}
                          <span>·</span>
                          <Tag
                            style={{ margin: 0, fontSize: 11 }}
                            color={sourceFromBroadcast ? 'blue' : 'default'}
                          >
                            {sourceFromBroadcast ? 'מתכנון' : 'ידני'}
                          </Tag>
                        </div>
                      </div>
                      <StatusChip
                        size="sm"
                        label={PREPARATION_STATUS_LABELS[ev.preparationStatus]}
                        color={PREPARATION_STATUS_COLORS[ev.preparationStatus]}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EventListPanel;
