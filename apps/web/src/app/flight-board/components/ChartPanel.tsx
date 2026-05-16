'use client';

import React, { useMemo } from 'react';
import { Tooltip } from 'antd';
import { ITEM_TYPE_COLORS, CHART_METRIC_LABELS, ITEM_TYPE_SHORT_LABELS } from '../constants';
import { formatStatus, readColumn } from '../utils/formatters';
import type { FlightBoardChartMetric, FlightBoardItem, FlightBoardPanel } from '../types';

interface Props {
  panel: FlightBoardPanel;
  items: FlightBoardItem[];
}

const FALLBACK_PALETTE = [
  '#38bdf8',
  '#22c55e',
  '#f97316',
  '#a855f7',
  '#facc15',
  '#ef4444',
  '#0ea5e9',
  '#ec4899',
  '#84cc16',
  '#14b8a6',
];

function pickColor(label: string, index: number, asItemType?: boolean) {
  if (asItemType && (ITEM_TYPE_COLORS as any)[label]) {
    return (ITEM_TYPE_COLORS as any)[label];
  }
  return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

function aggregate(
  panel: FlightBoardPanel,
  items: FlightBoardItem[],
): { label: string; value: number; raw: string }[] {
  const groupKey = panel.chartGroupBy || 'type';
  const metric: FlightBoardChartMetric = panel.chartMetric || 'COUNT';

  const buckets = new Map<string, { label: string; total: number; count: number }>();
  for (const item of items) {
    let raw: any;
    if (groupKey === 'type') raw = item.type;
    else if (groupKey === 'status') raw = item.status || 'UNKNOWN';
    else raw = readColumn(item, groupKey);

    const key = raw == null || raw === '' ? 'UNKNOWN' : String(raw);
    const existing = buckets.get(key);

    let measure = 1;
    if (metric === 'PEAK_VIEWERS') measure = Number(readColumn(item, 'raw.peakViewers')) || 0;
    else if (metric === 'AVG_VIEWERS') measure = Number(readColumn(item, 'raw.avgViewers')) || 0;
    else if (metric === 'TOTAL_REVENUE') measure = Number(readColumn(item, 'raw.revenue')) || 0;
    else if (metric === 'DURATION') {
      if (item.startTime && item.endTime) {
        measure = Math.max(0, (new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 60000);
      } else {
        measure = 0;
      }
    }

    if (existing) {
      existing.total += measure;
      existing.count += 1;
    } else {
      buckets.set(key, { label: key, total: measure, count: 1 });
    }
  }

  const result: { label: string; value: number; raw: string }[] = [];
  Array.from(buckets.values()).forEach((bucket) => {
    let value = bucket.total;
    if (metric === 'AVG_VIEWERS' && bucket.count > 0) {
      value = bucket.total / bucket.count;
    }
    if (metric === 'COUNT') value = bucket.count;
    result.push({ label: bucket.label, value, raw: bucket.label });
  });
  return result.sort((a, b) => b.value - a.value);
}

function formatLabel(panel: FlightBoardPanel, raw: string): string {
  const groupKey = panel.chartGroupBy || 'type';
  if (groupKey === 'type') {
    return ITEM_TYPE_SHORT_LABELS[raw as keyof typeof ITEM_TYPE_SHORT_LABELS] || raw;
  }
  if (groupKey === 'status') return formatStatus(raw);
  return raw;
}

const Legend: React.FC<{ data: { label: string; raw: string }[]; panel: FlightBoardPanel }> = ({
  data,
  panel,
}) => (
  <div className="flight-board-chart-legend">
    {data.map((d, i) => (
      <span key={d.raw} className="flight-board-chart-legend-item">
        <span
          className="flight-board-chart-legend-swatch"
          style={{ background: pickColor(d.raw, i, panel.chartGroupBy === 'type' || !panel.chartGroupBy) }}
        />
        {formatLabel(panel, d.raw)}
      </span>
    ))}
  </div>
);

const BarChart: React.FC<Props & { mode?: 'bar' | 'line' | 'area' }> = ({
  panel,
  items,
  mode = 'bar',
}) => {
  const data = useMemo(() => aggregate(panel, items), [panel, items]);
  if (data.length === 0) {
    return <div className="flight-board-empty">אין נתונים להצגה</div>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const isItemType = panel.chartGroupBy === 'type' || !panel.chartGroupBy;
  const padding = { top: 12, right: 16, bottom: 32, left: 36 };
  const width = 600;
  const height = 280;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const barWidth = Math.max(8, (innerW / Math.max(data.length, 1)) * 0.7);
  const slot = innerW / Math.max(data.length, 1);

  const points = data.map((d, i) => {
    const x = padding.left + slot * i + slot / 2;
    const y = padding.top + innerH - (d.value / max) * innerH;
    return { x, y, ...d };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="flight-board-chart-svg"
      >
        {/* Axis grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padding.left}
            x2={padding.left + innerW}
            y1={padding.top + innerH * (1 - t)}
            y2={padding.top + innerH * (1 - t)}
            stroke="rgba(148,163,184,0.15)"
            strokeWidth={1}
          />
        ))}

        {mode === 'bar' &&
          points.map((p, i) => (
            <Tooltip key={i} title={`${formatLabel(panel, p.raw)}: ${p.value.toFixed(0)}`}>
              <rect
                x={p.x - barWidth / 2}
                y={p.y}
                width={barWidth}
                height={padding.top + innerH - p.y}
                fill={pickColor(p.raw, i, isItemType)}
                rx={3}
              />
            </Tooltip>
          ))}

        {mode === 'line' && (
          <polyline
            fill="none"
            stroke="#38bdf8"
            strokeWidth={2}
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        )}

        {mode === 'area' && (
          <>
            <polyline
              fill="rgba(56,189,248,0.18)"
              stroke="none"
              points={[
                `${padding.left},${padding.top + innerH}`,
                ...points.map((p) => `${p.x},${p.y}`),
                `${padding.left + innerW},${padding.top + innerH}`,
              ].join(' ')}
            />
            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth={2}
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            />
          </>
        )}

        {/* Point markers + tooltips for line/area */}
        {(mode === 'line' || mode === 'area') &&
          points.map((p, i) => (
            <Tooltip key={i} title={`${formatLabel(panel, p.raw)}: ${p.value.toFixed(0)}`}>
              <circle cx={p.x} cy={p.y} r={4} fill="#38bdf8" />
            </Tooltip>
          ))}

        {/* X labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={height - 8}
            textAnchor="middle"
            fontSize={11}
            fill="#94a3b8"
          >
            {formatLabel(panel, p.raw).slice(0, 8)}
          </text>
        ))}

        {/* Y axis ticks */}
        {[0, 0.5, 1].map((t) => (
          <text
            key={t}
            x={padding.left - 6}
            y={padding.top + innerH * (1 - t) + 4}
            textAnchor="end"
            fontSize={10}
            fill="#94a3b8"
          >
            {Math.round(max * t)}
          </text>
        ))}
      </svg>
      <span style={{ fontSize: 11, color: '#94a3b8' }}>
        מדד: {CHART_METRIC_LABELS[panel.chartMetric || 'COUNT']}
      </span>
    </div>
  );
};

const PieChart: React.FC<Props> = ({ panel, items }) => {
  const data = useMemo(() => aggregate(panel, items), [panel, items]);
  if (data.length === 0) {
    return <div className="flight-board-empty">אין נתונים להצגה</div>;
  }
  const isItemType = panel.chartGroupBy === 'type' || !panel.chartGroupBy;
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const cx = 150;
  const cy = 150;
  const r = 110;
  let acc = 0;

  const slices = data.map((d, i) => {
    const start = (acc / total) * Math.PI * 2;
    acc += d.value;
    const end = (acc / total) * Math.PI * 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.sin(start);
    const y1 = cy - r * Math.cos(start);
    const x2 = cx + r * Math.sin(end);
    const y2 = cy - r * Math.cos(end);
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    const labelAngle = (start + end) / 2;
    const lx = cx + (r * 0.65) * Math.sin(labelAngle);
    const ly = cy - (r * 0.65) * Math.cos(labelAngle);
    const pct = ((d.value / total) * 100).toFixed(0);
    return {
      ...d,
      path,
      pct,
      lx,
      ly,
      color: pickColor(d.raw, i, isItemType),
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', alignItems: 'center' }}>
      <svg viewBox="0 0 300 300" className="flight-board-chart-svg" style={{ maxWidth: 360 }}>
        {slices.map((s, i) => (
          <Tooltip key={i} title={`${formatLabel(panel, s.raw)}: ${s.value.toFixed(0)} (${s.pct}%)`}>
            <g>
              <path d={s.path} fill={s.color} stroke="#0b1220" strokeWidth={1} />
              {Number(s.pct) >= 6 && (
                <text x={s.lx} y={s.ly} textAnchor="middle" fontSize={12} fill="#0b1220" fontWeight={700}>
                  {s.pct}%
                </text>
              )}
            </g>
          </Tooltip>
        ))}
      </svg>
      <Legend data={data} panel={panel} />
    </div>
  );
};

export const ChartPanel: React.FC<Props> = ({ panel, items }) => {
  if (panel.type === 'PIE_CHART') return <PieChart panel={panel} items={items} />;
  if (panel.type === 'LINE_CHART') return <BarChart panel={panel} items={items} mode="line" />;
  if (panel.type === 'AREA_CHART') return <BarChart panel={panel} items={items} mode="area" />;
  return <BarChart panel={panel} items={items} mode="bar" />;
};
