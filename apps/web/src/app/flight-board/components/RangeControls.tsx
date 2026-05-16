'use client';

import React from 'react';
import { Button, DatePicker } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { RANGE_PRESET_LABELS } from '../constants';
import type { FlightBoardDateRangePreset, FlightBoardRange } from '../types';

interface Props {
  range: FlightBoardRange;
  onChange: (range: FlightBoardRange) => void;
}

const PRESETS: FlightBoardDateRangePreset[] = [
  'TODAY',
  'YESTERDAY',
  'THIS_WEEK',
  'THIS_MONTH',
  'ALL',
  'CUSTOM',
];

export const RangeControls: React.FC<Props> = ({ range, onChange }) => {
  const isCustom = range.preset === 'CUSTOM';
  const startValue = range.start ? dayjs(range.start) : null;
  const endValue = range.end ? dayjs(range.end) : null;

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {PRESETS.map((preset) => (
        <Button
          key={preset}
          type={range.preset === preset ? 'primary' : 'default'}
          size="middle"
          onClick={() => onChange({ preset })}
        >
          {RANGE_PRESET_LABELS[preset]}
        </Button>
      ))}
      {isCustom && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <DatePicker
            value={startValue}
            onChange={(d: Dayjs | null) =>
              onChange({ ...range, start: d ? d.toISOString() : undefined })
            }
            placeholder="מתאריך"
          />
          <DatePicker
            value={endValue}
            onChange={(d: Dayjs | null) =>
              onChange({ ...range, end: d ? d.toISOString() : undefined })
            }
            placeholder="עד תאריך"
          />
        </div>
      )}
    </div>
  );
};
