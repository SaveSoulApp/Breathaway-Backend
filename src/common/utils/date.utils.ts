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
   * Generates a native JavaScript Date object representing the current UTC time.
   *
   * Used primarily for interoperability with Prisma and native APIs that require
   * standard Date objects instead of Day.js wrappers.
   *
   * @returns A new native Date instance for the current moment.
   */
  static now(): Date {
    return dayjs().toDate();
  }

  /**
   * Instantiates a Day.js wrapper for the current time or a provided date.
   *
   * Acts as the central factory for Day.js instances to ensure all application date
   * manipulations use a uniform, extended (UTC/Timezone/Format) configuration.
   *
   * @param date - Optional raw date input to parse.
   * @returns A fully configured Day.js instance.
   */
  static dayjs(date?: dayjs.ConfigType): dayjs.Dayjs {
    return dayjs(date);
  }

  /**
   * Parses diverse date inputs into a standardized native Date object.
   *
   * Leverages Day.js for robust parsing across formats before unwrapping into
   * a native Date, ensuring safe conversion of user input or database records.
   *
   * @param dateVal - The raw string, number, or Date to evaluate.
   * @returns A reliable native Date instance.
   */
  static parse(dateVal: string | number | Date): Date {
    return dayjs(dateVal).toDate();
  }

  /**
   * Adds a specified number of days to a given date.
   *
   * @param dateVal - The source date.
   * @param days - Number of days to add.
   * @returns A new native Date instance.
   */
  static addDays(dateVal: string | number | Date, days: number): Date {
    return dayjs(dateVal).add(days, 'day').toDate();
  }
}

/**
 * Formats a date into a long, human-readable string for frontend display.
 *
 * Standardizes primary date rendering (e.g., "November 27, 2025") across the platform
 * to maintain consistent typography in reports and user dashboards.
 *
 * @param date - The source date to format.
 * @returns The formatted date string.
 */
export const formatDate = (date: string | Date): string => {
  return dayjs(date).format('MMMM D, YYYY');
};

/**
 * Formats a date into a compact string for space-constrained UI elements.
 *
 * Standardizes abbreviated date rendering (e.g., "Nov 27, 2025") for list views,
 * tables, and mobile interfaces.
 *
 * @param date - The source date to format.
 * @returns The compact formatted date string.
 */
export const formatDateShort = (date: string | Date): string => {
  return dayjs(date).format('MMM D, YYYY');
};

export { dayjs };
