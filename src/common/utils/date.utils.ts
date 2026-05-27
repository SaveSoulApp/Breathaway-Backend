import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import advancedFormat from 'dayjs/plugin/advancedFormat';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(advancedFormat);

export class DateUtil {
  /**
   * Returns a native JS Date object for the current time.
   * Useful for Prisma or native Date requirements.
   */
  static now(): Date {
    return dayjs().toDate();
  }

  /**
   * Returns a Day.js object for the current time or parsed date.
   */
  static dayjs(date?: dayjs.ConfigType): dayjs.Dayjs {
    return dayjs(date);
  }

  /**
   * Parses a value into a native Date.
   */
  static parse(dateVal: string | number | Date): Date {
    return dayjs(dateVal).toDate();
  }
}

/**
 * Formats a date string or Date object into a human-readable string.
 * Format: "Month Day, Year" (e.g., "November 27, 2025")
 *
 * @param date - The date string or Date object to format
 * @returns The formatted date string
 */
export const formatDate = (date: string | Date): string => {
  return dayjs(date).format('MMMM D, YYYY');
};

/**
 * Formats a date string or Date object into a short date string.
 * Format: "Mon DD, YYYY" (e.g., "Nov 27, 2025")
 *
 * @param date - The date string or Date object to format
 * @returns The formatted date string
 */
export const formatDateShort = (date: string | Date): string => {
  return dayjs(date).format('MMM D, YYYY');
};

export { dayjs };
