'use client';

import React, { useMemo, useState } from 'react';
import { CaretDownFilled, CaretUpFilled } from '@ant-design/icons';
import { Tooltip } from 'antd';
import {
  ALL_COLUMNS_BY_KEY,
  DEFAULT_TABLE_COLUMNS,
  ITEM_TYPE_COLORS,
  ITEM_TYPE_SHORT_LABELS,
} from '../constants';
import { formatColumnValue, formatStatus, sortItems } from '../utils/formatters';
import type { FlightBoardItem, FlightBoardPanel } from '../types';

interface Props {
  panel: FlightBoardPanel;
  items: FlightBoardItem[];
}

/**
 * Adaptive density classes — larger fonts/padding for short lists, then
 * progressively shrink as the row count grows so a TV viewport never needs
 * to scroll horizontally.
 */
function pickDensityClass(rowCount: number): string {
  if (rowCount <= 6) return 'flight-board-density-comfortable';
  if (rowCount <= 18) return 'flight-board-density-compact';
  if (rowCount <= 40) return 'flight-board-density-dense';
  return 'flight-board-density-ultra';
}

function columnLabel(key: string): string {
  const def = ALL_COLUMNS_BY_KEY[key];
  if (def) return def.label;
  if (key.startsWith('raw.')) return key.slice(4);
  return key;
}

function defaultColumns(panel: FlightBoardPanel): string[] {
  const source =
    panel.visibleColumns && panel.visibleColumns.length > 0
      ? panel.visibleColumns
      : DEFAULT_TABLE_COLUMNS;
  // Render in the user-configured order. Dedupe on the way out so a column
  // listed in two groups (or duplicated by mistake) only renders once.
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const key of source) {
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  return ordered;
}

function isLongTextKey(key: string): boolean {
  return !!ALL_COLUMNS_BY_KEY[key]?.longText;
}

function columnSizeClass(key: string): string {
  if (key === 'type') return 'fb-col-narrow';
  if (key === 'date' || ALL_COLUMNS_BY_KEY[key]?.dateOnly) return 'fb-col-date';
  if (
    key === 'startTime' ||
    key === 'endTime' ||
    ALL_COLUMNS_BY_KEY[key]?.timeOnly
  )
    return 'fb-col-time';
  if (key === 'channel') return 'fb-col-channel';
  if (key === 'status') return 'fb-col-status';
  return '';
}

export const TablePanel: React.FC<Props> = ({ panel, items }) => {
  const columns = useMemo(() => defaultColumns(panel), [panel]);
  const [sortField, setSortField] = useState<string | null>(panel.sortField || 'date');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(panel.sortDirection || 'ASC');

  const sorted = useMemo(() => {
    const limited =
      typeof panel.rowLimit === 'number' && panel.rowLimit > 0
        ? items.slice(0, panel.rowLimit)
        : items;
    return sortItems(limited, sortField, sortDir);
  }, [items, panel.rowLimit, sortField, sortDir]);

  const densityClass = pickDensityClass(sorted.length);

  const handleSort = (key: string) => {
    if (sortField === key) {
      setSortDir(sortDir === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortField(key);
      setSortDir('ASC');
    }
  };

  if (sorted.length === 0) {
    return <div className="flight-board-empty">אין אירועים</div>;
  }

  return (
    <div className={`flight-board-panel-table-wrapper ${densityClass}`}>
      <table className="flight-board-table">
        <thead>
          <tr>
            {columns.map((key) => {
              const isSorted = sortField === key;
              return (
                <th
                  key={key}
                  className={columnSizeClass(key)}
                  onClick={() => handleSort(key)}
                  title="לחץ למיון"
                >
                  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    {columnLabel(key)}
                    {isSorted ? (
                      sortDir === 'ASC' ? <CaretUpFilled /> : <CaretDownFilled />
                    ) : null}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <tr key={item.id}>
              {columns.map((key) => {
                if (key === 'type') {
                  return (
                    <td key={key} className="fb-col-narrow">
                      <span
                        className="flight-board-type-pill"
                        style={{ background: ITEM_TYPE_COLORS[item.type] || '#94a3b8' }}
                      >
                        {ITEM_TYPE_SHORT_LABELS[item.type] || item.type}
                      </span>
                    </td>
                  );
                }
                if (key === 'status') {
                  const statusText = formatStatus(item.status || '');
                  return (
                    <td key={key} className="fb-col-status">
                      {statusText ? (
                        <span className="flight-board-status-pill">{statusText}</span>
                      ) : (
                        ''
                      )}
                    </td>
                  );
                }
                const text = formatColumnValue(item, key);
                if (isLongTextKey(key) || key === 'title' || key === 'description' || key === 'notes') {
                  return (
                    <td key={key}>
                      <Tooltip title={text} mouseEnterDelay={0.4}>
                        <span style={{ display: 'inline-block', maxWidth: '100%' }}>{text}</span>
                      </Tooltip>
                    </td>
                  );
                }
                return <td key={key} className={columnSizeClass(key)}>{text}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
