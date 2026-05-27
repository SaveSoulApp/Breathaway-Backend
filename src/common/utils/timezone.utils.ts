import { DateUtil, dayjs } from './date.utils';

export class TimezoneUtil {
  /**
   * Validate if a string is a valid IANA timezone
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
   * Normalize timezone string
   * - If invalid, returns UTC
   * - Handles common case-insensitive issues
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
   * Convert a date string from user's timezone to UTC Date object
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
   * Format a Date object in the given timezone
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
   * Get date range boundaries in UTC for a given timezone
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
   * Get timezone offset in minutes for a specific date
   */
  static getOffsetInMinutes(date: Date, timezone: string): number {
    const normalizedTz = this.normalizeTimezone(timezone);
    return dayjs(date).tz(normalizedTz).utcOffset();
  }

  /**
   * Get timezone abbreviation (e.g., IST, EST, PST)
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
   * Check if two timezones are the same (handles normalization)
   */
  static areTimezonesSame(tz1: string, tz2: string): boolean {
    return this.normalizeTimezone(tz1) === this.normalizeTimezone(tz2);
  }
}
