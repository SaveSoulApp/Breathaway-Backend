import { DateUtil, dayjs } from './date.utils';

/**
 * Provides comprehensive utilities for handling, validating, and converting timezones.
 *
 * Ensures consistent date and time representations across the application, handling normalization
 * (e.g., standardizing legacy/alias timezones like Asia/Calcutta to Asia/Kolkata) and safe conversions
 * to UTC for database persistence.
 */
export class TimezoneUtil {
  /**
   * Validates whether a given string is a recognized IANA timezone identifier.
   *
   * Relies on the native `Intl.DateTimeFormat` API to check for timezone support in the current environment.
   *
   * @param tz - The raw timezone string to validate.
   * @returns `true` if the timezone is valid and supported; `false` otherwise.
   */
  static isValidTimezone(tz: string): boolean {
    if (!tz || typeof tz !== 'string') return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normalizes a timezone string to its canonical IANA identifier.
   *
   * Automatically resolves common aliases (e.g., mapping `Asia/Calcutta` to `Asia/Kolkata`) and handles
   * case-insensitive matching. Defaults to `UTC` if the input is empty or invalid to ensure a safe fallback.
   *
   * @param tz - The raw timezone string to normalize.
   * @returns The canonical IANA timezone identifier, or `UTC` if validation fails.
   */
  static normalizeTimezone(tz?: string): string {
    if (!tz || tz.trim() === '') {
      return 'UTC';
    }

    const trimmed = tz.trim();

    try {
      // Get the canonical name from Intl.DateTimeFormat (handles case-insensitive match automatically)
      let resolved = Intl.DateTimeFormat(undefined, {
        timeZone: trimmed,
      }).resolvedOptions().timeZone;
      if (resolved === 'Asia/Calcutta') {
        resolved = 'Asia/Kolkata';
      }
      return resolved;
    } catch {
      // Look for exact match ignoring case or partial match as fallbacks
      const normalizedInput = trimmed.toLowerCase();
      if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
        const intlWithSupportedValues = Intl as unknown as {
          supportedValuesOf: (key: string) => string[];
        };
        const aliases = ['Asia/Kolkata'];
        const allZones = [
          ...intlWithSupportedValues.supportedValuesOf('timeZone'),
          ...aliases,
        ];

        // Exact match ignoring case
        const exactMatch = allZones.find(
          (zone) => zone.toLowerCase() === normalizedInput,
        );
        if (exactMatch) {
          return exactMatch === 'Asia/Calcutta' ? 'Asia/Kolkata' : exactMatch;
        }

        // Partial match
        const partialMatch = allZones.find(
          (zone) =>
            zone.toLowerCase().includes(normalizedInput) ||
            normalizedInput.includes(
              zone.split('/').pop()?.toLowerCase() || '',
            ),
        );

        if (partialMatch) {
          return partialMatch === 'Asia/Calcutta'
            ? 'Asia/Kolkata'
            : partialMatch;
        }
      }

      // Default to UTC for invalid timezones
      return 'UTC';
    }
  }

  /**
   * Converts a date string in a specific timezone to a UTC Date object representing either the start or end of the day.
   *
   * Useful for converting user-provided local dates (e.g., from a date picker) into absolute UTC timestamps
   * for querying database ranges.
   *
   * @param dateString - The local date string in `YYYY-MM-DD` format.
   * @param timezone - The user's local timezone (e.g., "America/New_York").
   * @param timeOfDay - Indicates whether to calculate the `start` (00:00:00) or `end` (23:59:59) of the local day.
   * @returns A native Date object normalized to UTC.
   */
  static convertToUTC(
    dateString: string,
    timezone: string,
    timeOfDay: 'start' | 'end' = 'start',
  ): Date {
    const normalizedTz = this.normalizeTimezone(timezone);

    // Parse the date in YYYY-MM-DD format
    const [year, month, day] = dateString.split('-').map(Number);

    let dayjsDate = dayjs.tz(
      `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      'YYYY-MM-DD',
      normalizedTz,
    );

    if (timeOfDay === 'start') {
      dayjsDate = dayjsDate.startOf('day');
    } else {
      dayjsDate = dayjsDate.endOf('day');
    }

    // Convert to UTC
    return dayjsDate.utc().toDate();
  }

  /**
   * Formats a UTC Date object into a localized string for a specific timezone.
   *
   * @param date - The source Date object to format.
   * @param timezone - The target timezone to display the date in.
   * @param format - The desired Day.js format string.
   * @returns The formatted date string localized to the requested timezone.
   */
  static formatInTimezone(
    date: Date,
    timezone: string,
    format: string = 'YYYY-MM-DD',
  ): string {
    const normalizedTz = this.normalizeTimezone(timezone);
    return dayjs(date).tz(normalizedTz).format(format);
  }

  /**
   * Calculates the absolute UTC boundaries for a given date range in a specific timezone.
   *
   * Translates a start and end local date into a safe, timezone-aware UTC interval for querying data
   * (e.g., generating end-of-day reports).
   *
   * @param startDate - The start date string in `YYYY-MM-DD` format.
   * @param endDate - The end date string in `YYYY-MM-DD` format.
   * @param timezone - The timezone context for the date range.
   * @returns An object containing the precise UTC start and end Date boundaries.
   */
  static getUTCDateRange(
    startDate: string,
    endDate: string,
    timezone: string,
  ): { startUTC: Date; endUTC: Date } {
    return {
      startUTC: this.convertToUTC(startDate, timezone, 'start'),
      endUTC: this.convertToUTC(endDate, timezone, 'end'),
    };
  }

  /**
   * Calculates the offset in minutes from UTC for a specific date in a given timezone.
   *
   * Takes Daylight Saving Time (DST) into account based on the provided date.
   *
   * @param date - The reference date used to calculate the offset.
   * @param timezone - The target timezone.
   * @returns The timezone offset in minutes (e.g., -240 for EDT).
   */
  static getOffsetInMinutes(date: Date, timezone: string): number {
    const normalizedTz = this.normalizeTimezone(timezone);
    return dayjs(date).tz(normalizedTz).utcOffset();
  }

  /**
   * Retrieves the standard abbreviation for a timezone at a specific date.
   *
   * Handles DST transitions (e.g., returns EDT vs EST appropriately) and normalizes certain
   * aliases (e.g., returning IST for India Standard Time instead of a GMT offset).
   *
   * @param timezone - The target timezone identifier.
   * @param date - The reference date used to determine the correct abbreviation.
   * @returns The concise timezone abbreviation string.
   */
  static getTimezoneAbbreviation(
    timezone: string,
    // Note: this still defaults to DateUtil logic indirectly,
    // but preserving original signature
    date: Date = DateUtil.now(),
  ): string {
    const normalizedTz = this.normalizeTimezone(timezone);
    const abbr = dayjs(date).tz(normalizedTz).format('z');

    // Fallback for known zones where Intl returns GMT offsets
    if (normalizedTz === 'Asia/Kolkata' || normalizedTz === 'Asia/Calcutta') {
      return 'IST';
    }

    return abbr;
  }

  /**
   * Determines if two timezone strings represent the same canonical timezone.
   *
   * Performs normalization on both inputs before comparison to handle aliases and case differences.
   *
   * @param tz1 - The first timezone string.
   * @param tz2 - The second timezone string.
   * @returns `true` if the normalized timezones are identical; `false` otherwise.
   */
  static areTimezonesSame(tz1: string, tz2: string): boolean {
    return this.normalizeTimezone(tz1) === this.normalizeTimezone(tz2);
  }
}
