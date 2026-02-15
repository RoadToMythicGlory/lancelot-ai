import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';

dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);

/**
 * Calculate week number for Israeli calendar (Sunday-Saturday weeks)
 * This ensures consistent week numbering across the application
 * 
 * @param date - The date to calculate the week for
 * @returns Week number (1-based)
 */
export function getIsraeliWeekNumber(date: Dayjs | Date | string): number {
  const d = dayjs(date);
  
  // Get the start of the year
  const startOfYear = d.startOf('year');
  
  // Find the first Sunday of the year
  let firstSunday = startOfYear.day(0); // Go to Sunday
  if (firstSunday.isBefore(startOfYear)) {
    firstSunday = firstSunday.add(1, 'week');
  }
  
  // If the date is before the first Sunday, it belongs to the last week of previous year
  if (d.isBefore(firstSunday)) {
    // Calculate from previous year
    const prevYearStart = d.subtract(1, 'year').startOf('year');
    let prevYearFirstSunday = prevYearStart.day(0);
    if (prevYearFirstSunday.isBefore(prevYearStart)) {
      prevYearFirstSunday = prevYearFirstSunday.add(1, 'week');
    }
    const weeksSinceStart = Math.floor(d.diff(prevYearFirstSunday, 'week'));
    return weeksSinceStart + 1;
  }
  
  // Calculate weeks since the first Sunday of the year
  const weeksSinceFirstSunday = Math.floor(d.diff(firstSunday, 'week'));
  return weeksSinceFirstSunday + 1;
}

/**
 * Get the start and end dates of an Israeli week (Sunday-Saturday)
 * 
 * @param date - Any date within the week
 * @returns Object with start and end dates of the week
 */
export function getIsraeliWeekRange(date: Dayjs | Date | string): { start: Dayjs; end: Dayjs } {
  const d = dayjs(date);
  // dayjs.startOf('week') already uses Sunday as the first day by default in most locales
  const start = d.startOf('week'); // Sunday
  const end = d.endOf('week');     // Saturday
  
  return { start, end };
}

/**
 * Format week display for Israeli calendar
 * 
 * @param date - The date to format
 * @returns Formatted string like "שבוע 34, 2025 (17/08 - 23/08)"
 */
export function formatIsraeliWeekDisplay(date: Dayjs | Date | string): string {
  const d = dayjs(date);
  const weekNumber = getIsraeliWeekNumber(d);
  const { start, end } = getIsraeliWeekRange(d);
  
  return `שבוע ${weekNumber}, ${d.format('YYYY')} (${start.format('DD/MM')} - ${end.format('DD/MM')})`;
}
