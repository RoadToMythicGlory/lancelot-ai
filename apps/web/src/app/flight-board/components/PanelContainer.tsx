'use client';

import React, { useMemo } from 'react';
import { Button, Tooltip } from 'antd';
import {
  ExpandOutlined,
  CompressOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { TablePanel } from './TablePanel';
import { KpiPanel } from './KpiPanel';
import { TimelinePanel } from './TimelinePanel';
import { ChartPanel } from './ChartPanel';
import { PANEL_WIDTH_FRACTION } from '../constants';
import type { FlightBoardItem, FlightBoardPanel } from '../types';

interface Props {
  panel: FlightBoardPanel;
  items: FlightBoardItem[];
  loading: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
}

function widthToColumnSpan(panel: FlightBoardPanel): number {
  const fraction = PANEL_WIDTH_FRACTION[panel.width] || 1;
  return Math.max(3, Math.round(12 * fraction));
}

// Value of `מקום שידור` (BroadcastArrayModal location dropdown) that marks
// the row as "satellite uplink only". Kept in sync with the option list in
// `apps/web/src/components/broadcast/BroadcastArrayModal.tsx` and
// `apps/web/src/app/broadcast-array/page.tsx`.
const SATELLITE_ONLY_LOCATION = 'יעלה לווין בלבד';

// True when an item's resolved broadcast location is the satellite-only
// option. Reads the same nested path that the table reader uses
// (`raw.broadcastArray.broadcastLocation`) so manual rows that were saved
// with that column get matched the same way as parsed broadcast events.
function isSatelliteOnlyItem(item: FlightBoardItem): boolean {
  const location = item.raw?.broadcastArray?.broadcastLocation;
  return typeof location === 'string' && location.trim() === SATELLITE_ONLY_LOCATION;
}

function filterPanelItems(panel: FlightBoardPanel, items: FlightBoardItem[]): FlightBoardItem[] {
  return items.filter((item) => {
    // Panel-level "הסתר לוויינים" toggle — applied uniformly to manual and
    // parsed rows so the user can't accidentally see a satellite-only row
    // by virtue of it being a manual override.
    if (panel.hideSatellites && isSatelliteOnlyItem(item)) return false;

    // Manual rows scoped to a specific panel only show in that panel.
    if (item.isManual) {
      if (item.panelKey && item.panelKey !== panel.panelKey) return false;
      return true;
    }
    if (!panel.itemTypes || panel.itemTypes.length === 0) return true;
    const allowed = new Set(panel.itemTypes);
    return allowed.has(item.type);
  });
}

export const PanelContainer: React.FC<Props> = ({
  panel,
  items,
  loading,
  expanded,
  onToggleExpand,
  canEdit,
  onEdit,
}) => {
  const filtered = useMemo(() => filterPanelItems(panel, items), [panel, items]);
  const span = widthToColumnSpan(panel);
  const showEdit = !!canEdit && !!onEdit && panel.type === 'TABLE';

  const renderBody = () => {
    if (panel.type === 'TABLE') return <TablePanel panel={panel} items={filtered} />;
    if (panel.type === 'KPI') return <KpiPanel panel={panel} items={filtered} />;
    if (panel.type === 'TIMELINE') return <TimelinePanel panel={panel} items={filtered} />;
    return <ChartPanel panel={panel} items={filtered} />;
  };

  return (
    <div
      className="flight-board-panel-cell"
      style={{ gridColumn: expanded ? '1 / -1' : `span ${span}` }}
    >
      <div className={`flight-board-panel ${expanded ? 'is-expanded' : ''}`}>
        <div className="flight-board-panel-header">
          <span
            className="flight-board-live-dot"
            style={{ fontSize: 11 }}
            aria-hidden="true"
          >
            LIVE
          </span>
          <h3 title={panel.title}>{panel.title}</h3>
          <div className="flight-board-panel-actions">
            {showEdit && (
              <Tooltip title="עריכת שורות (אדמין)">
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={onEdit}
                />
              </Tooltip>
            )}
            <Tooltip title={expanded ? 'מזער' : 'הצג מורחב'}>
              <Button
                size="small"
                type="text"
                icon={expanded ? <CompressOutlined /> : <ExpandOutlined />}
                onClick={onToggleExpand}
              />
            </Tooltip>
          </div>
        </div>
        <div className="flight-board-panel-body">
          {loading && <div className="flight-board-loading-bar" />}
          {renderBody()}
        </div>
      </div>
    </div>
  );
};
