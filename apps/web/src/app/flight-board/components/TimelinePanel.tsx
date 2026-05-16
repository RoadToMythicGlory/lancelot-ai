'use client';

import React, { useMemo } from 'react';
import {
  HEBREW_WEEKDAYS,
  ITEM_TYPE_COLORS,
  ITEM_TYPE_SHORT_LABELS,
} from '../constants';
import { formatTime, stripHtml } from '../utils/formatters';
import type { FlightBoardItem, FlightBoardItemType, FlightBoardPanel } from '../types';

interface Props {
  panel: FlightBoardPanel;
  items: FlightBoardItem[];
}

function bucketKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export const TimelinePanel: React.FC<Props> = ({ panel, items }) => {
  const buckets = useMemo(() => {
    const map = new Map<string, { date: Date; items: FlightBoardItem[] }>();
    for (const item of items) {
      const dateStr = item.date || item.startTime;
      if (!dateStr) continue;
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) continue;
      const key = bucketKey(date);
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        const cleanDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        map.set(key, { date: cleanDate, items: [item] });
      }
    }
    const days = Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    return days.slice(0, 14);
  }, [items]);

  const today = useMemo(() => {
    const d = new Date();
    return bucketKey(d);
  }, []);

  if (buckets.length === 0) {
    return <div className="flight-board-empty">אין אירועים מתוארכים</div>;
  }

  return (
    <div className="flight-board-timeline">
      {buckets.map((bucket) => {
        const isToday = bucketKey(bucket.date) === today;
        return (
          <div
            key={bucketKey(bucket.date)}
            className={`flight-board-timeline-day ${isToday ? 'is-today' : ''}`}
          >
            <div className="flight-board-timeline-day-header">
              <span className="flight-board-timeline-day-name">
                {HEBREW_WEEKDAYS[bucket.date.getDay()]}
              </span>
              <span className="flight-board-timeline-day-date">
                {bucket.date.getDate().toString().padStart(2, '0')}/
                {(bucket.date.getMonth() + 1).toString().padStart(2, '0')}
              </span>
              <span className="flight-board-timeline-day-count">
                {bucket.items.length} אירועים
              </span>
            </div>
            {bucket.items.slice(0, panel.rowLimit ?? 30).map((item) => (
              <div
                key={item.id}
                className="flight-board-timeline-item"
                style={
                  {
                    ['--fb-item-color' as any]: ITEM_TYPE_COLORS[item.type as FlightBoardItemType],
                  } as React.CSSProperties
                }
              >
                <span style={{ fontWeight: 600 }}>{stripHtml(item.title) || 'ללא כותרת'}</span>
                <span style={{ color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{formatTime(item.startTime)}</span>
                  <span>{ITEM_TYPE_SHORT_LABELS[item.type as FlightBoardItemType]}</span>
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};
