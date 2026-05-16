'use client';

import { useCallback, useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import type { CalendarRangeMode } from '../types';
import { HEBREW_MONTHS, HEBREW_WEEKDAYS } from '../constants';

/**
 * Shared MCR page range state: which day/week/month is currently selected
 * across Events / Schedule / Daily Checks / Exchange tabs.
 */
export function useMcrRange(initial: Date = new Date()) {
  const [date, setDate] = useState<Dayjs>(dayjs(initial).startOf('day'));
  const [mode, setMode] = useState<CalendarRangeMode>('day');

  const range = useMemo(() => {
    if (mode === 'day') {
      return {
        start: date.startOf('day'),
        end: date.endOf('day'),
      };
    }
    if (mode === 'week') {
      return {
        start: date.startOf('week'),
        end: date.endOf('week'),
      };
    }
    return {
      start: date.startOf('month'),
      end: date.endOf('month'),
    };
  }, [date, mode]);

  const label = useMemo(() => {
    if (mode === 'day') {
      const weekday = HEBREW_WEEKDAYS[date.day()];
      return `${weekday}, ${date.format('DD/MM/YYYY')}`;
    }
    if (mode === 'week') {
      const start = range.start.format('DD/MM');
      const end = range.end.format('DD/MM/YYYY');
      return `שבוע: ${start} – ${end}`;
    }
    return `${HEBREW_MONTHS[date.month()]} ${date.year()}`;
  }, [date, mode, range]);

  const next = useCallback(() => {
    setDate((prev) => {
      if (mode === 'day') return prev.add(1, 'day');
      if (mode === 'week') return prev.add(1, 'week');
      return prev.add(1, 'month');
    });
  }, [mode]);

  const prev = useCallback(() => {
    setDate((p) => {
      if (mode === 'day') return p.subtract(1, 'day');
      if (mode === 'week') return p.subtract(1, 'week');
      return p.subtract(1, 'month');
    });
  }, [mode]);

  const today = useCallback(() => {
    setDate(dayjs().startOf('day'));
  }, []);

  const isToday = useMemo(() => date.isSame(dayjs(), 'day'), [date]);

  return {
    date,
    setDate,
    mode,
    setMode,
    range,
    label,
    next,
    prev,
    today,
    isToday,
  };
}
