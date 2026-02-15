import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Calculates GMT time from Israel local time
 * Israel uses:
 * - IDT (Israel Daylight Time) UTC+3 during summer
 * - IST (Israel Standard Time) UTC+2 during winter
 * 
 * @param israelTime - The Israel local time as a string or dayjs object
 * @returns The GMT time as a dayjs object
 */
export function israelTimeToGMT(israelTime: string | dayjs.Dayjs): dayjs.Dayjs {
  const localTime = dayjs(israelTime).tz('Asia/Jerusalem');
  return localTime.utc();
}

/**
 * Formats a time for GMT display
 * @param israelTime - The Israel local time
 * @returns Formatted GMT time string (HH:mm)
 */
export function formatGMTTime(israelTime: string | dayjs.Dayjs): string {
  const gmtTime = israelTimeToGMT(israelTime);
  return gmtTime.format('HH:mm');
}

/**
 * Calculates the current GMT offset for Israel time
 * @param date - The date to check the offset for
 * @returns The GMT offset in hours (2 for winter, 3 for summer)
 */
export function getIsraelGMTOffset(date: string | dayjs.Dayjs = dayjs()): number {
  const israelTime = dayjs(date).tz('Asia/Jerusalem');
  const utcTime = israelTime.utc();
  const offsetMinutes = israelTime.utcOffset();
  return offsetMinutes / 60;
}

/**
 * Determines if a given date is during Israel's daylight saving time (summer time)
 * @param date - The date to check
 * @returns true if it's summer time (IDT), false if it's standard time (IST)
 */
export function isIsraelSummerTime(date: string | dayjs.Dayjs = dayjs()): boolean {
  const offset = getIsraelGMTOffset(date);
  return offset === 3; // IDT is UTC+3, IST is UTC+2
}

/**
 * Formats GMT time with indication of the offset used
 * @param israelTime - The Israel local time
 * @returns Formatted string with GMT time and offset info
 */
export function formatGMTTimeWithOffset(israelTime: string | dayjs.Dayjs): string {
  const gmtTime = israelTimeToGMT(israelTime);
  const offset = getIsraelGMTOffset(israelTime);
  const offsetType = offset === 3 ? 'IDT' : 'IST';
  
  return `${gmtTime.format('HH:mm')} (${offsetType})`;
} 