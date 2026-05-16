'use client';

import React, { useMemo } from 'react';
import {
  ITEM_TYPE_COLORS,
  ITEM_TYPE_HEBREW_LABELS,
} from '../constants';
import { formatStatus } from '../utils/formatters';
import type { FlightBoardItem, FlightBoardItemType, FlightBoardPanel } from '../types';

interface Props {
  panel: FlightBoardPanel;
  items: FlightBoardItem[];
}

export const KpiPanel: React.FC<Props> = ({ panel, items }) => {
  const grouped = useMemo(() => {
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const item of items) {
      byType[item.type] = (byType[item.type] || 0) + 1;
      const status = item.status || 'UNKNOWN';
      byStatus[status] = (byStatus[status] || 0) + 1;
    }
    return { byType, byStatus };
  }, [items]);

  if (items.length === 0) {
    return <div className="flight-board-empty">אין אירועים</div>;
  }

  // When the panel narrows to specific item types, render one card per type.
  // Otherwise show a single total + status breakdown.
  if (panel.itemTypes && panel.itemTypes.length > 0) {
    return (
      <div className="flight-board-kpi-grid">
        {panel.itemTypes.map((type) => {
          const count = grouped.byType[type] || 0;
          return (
            <div
              key={type}
              className="flight-board-kpi-card"
              style={{ borderTop: `3px solid ${ITEM_TYPE_COLORS[type as FlightBoardItemType]}` }}
            >
              <div className="flight-board-kpi-label">{ITEM_TYPE_HEBREW_LABELS[type as FlightBoardItemType]}</div>
              <div className="flight-board-kpi-value">{count}</div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flight-board-kpi-grid">
      <div className="flight-board-kpi-card">
        <div className="flight-board-kpi-label">סך אירועים</div>
        <div className="flight-board-kpi-value">{items.length}</div>
        <div className="flight-board-kpi-status-row">
          {Object.entries(grouped.byStatus).map(([status, count]) => (
            <span key={status} className="flight-board-status-pill">
              {formatStatus(status)} · {count}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
