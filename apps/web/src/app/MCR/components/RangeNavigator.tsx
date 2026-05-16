'use client';

import React from 'react';
import { Button, DatePicker, Segmented, Tooltip } from 'antd';
import { LeftOutlined, RightOutlined, CalendarOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { CalendarRangeMode } from '../types';

interface Props {
  date: Dayjs;
  mode: CalendarRangeMode;
  label: string;
  isToday: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onModeChange: (mode: CalendarRangeMode) => void;
  onDateChange: (d: Dayjs) => void;
  trailing?: React.ReactNode;
}

/**
 * Unified day/week/month navigator used by Events and Schedule. Hebrew RTL:
 * the "previous" arrow points right, the "next" arrow points left.
 */
const RangeNavigator: React.FC<Props> = ({
  date,
  mode,
  label,
  isToday,
  onPrev,
  onNext,
  onToday,
  onModeChange,
  onDateChange,
  trailing,
}) => {
  return (
    <div
      dir="rtl"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          options={[
            { label: 'יומי', value: 'day' },
            { label: 'שבועי', value: 'week' },
            { label: 'חודשי', value: 'month' },
          ]}
          value={mode}
          onChange={(v) => onModeChange(v as CalendarRangeMode)}
        />
        <Tooltip title="היום">
          <Button
            type={isToday ? 'primary' : 'default'}
            disabled={isToday}
            onClick={onToday}
            icon={<CalendarOutlined />}
          >
            היום
          </Button>
        </Tooltip>
        <div className="flex items-center gap-1" dir="rtl">
          <Tooltip title="תקופה קודמת">
            <Button icon={<RightOutlined />} onClick={onPrev} aria-label="תקופה קודמת" />
          </Tooltip>
          <DatePicker
            value={date}
            onChange={(d) => d && onDateChange(d)}
            allowClear={false}
            format="DD/MM/YYYY"
            picker={mode === 'month' ? 'month' : mode === 'week' ? 'week' : 'date'}
          />
          <Tooltip title="תקופה הבאה">
            <Button icon={<LeftOutlined />} onClick={onNext} aria-label="תקופה הבאה" />
          </Tooltip>
        </div>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
          {label}
        </span>
      </div>

      {trailing && <div className="flex flex-wrap items-center gap-2">{trailing}</div>}
    </div>
  );
};

export default RangeNavigator;

export function defaultDayjsRange() {
  return dayjs().startOf('day');
}
