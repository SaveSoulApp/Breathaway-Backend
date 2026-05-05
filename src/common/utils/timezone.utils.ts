import moment from 'moment-timezone';

export class TimezoneUtil {
  /**
   * Validate if a string is a valid IANA timezone
   */
  static isValidTimezone(tz: string): boolean {
    if (!tz || typeof tz !== 'string') return false;
    return moment.tz.zone(tz.trim()) !== null;
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

    // Try case-insensitive matching
    const allZones = moment.tz.names();
    const normalizedInput = trimmed.toLowerCase();

    // Look for exact match ignoring case
    const exactMatch = allZones.find(
      (zone) => zone.toLowerCase() === normalizedInput,
    );
    if (exactMatch) {
      return exactMatch;
    }

    // Look for partial match (e.g., "Asia/Kolkata" for "kolkata")
    const partialMatch = allZones.find(
      (zone) =>
        zone.toLowerCase().includes(normalizedInput) ||
        normalizedInput.includes(zone.split('/').pop()?.toLowerCase() || ''),
    );

    if (partialMatch) {
      return partialMatch;
    }

    // Default to UTC for invalid timezones
    return 'UTC';
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

    // Create moment object in user's timezone
    let momentDate = moment.tz(
      `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      'YYYY-MM-DD',
      normalizedTz,
    );

    if (timeOfDay === 'start') {
      momentDate = momentDate.startOf('day');
    } else {
      momentDate = momentDate.endOf('day');
    }

    // Convert to UTC
    return momentDate.utc().toDate();
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
    return moment(date).tz(normalizedTz).format(format);
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
    return moment(date).tz(normalizedTz).utcOffset();
  }

  /**
   * Get timezone abbreviation (e.g., IST, EST, PST)
   */
  static getTimezoneAbbreviation(
    timezone: string,
    date: Date = new Date(),
  ): string {
    const normalizedTz = this.normalizeTimezone(timezone);
    return moment(date).tz(normalizedTz).format('z');
  }

  /**
   * Check if two timezones are the same (handles normalization)
   */
  static areTimezonesSame(tz1: string, tz2: string): boolean {
    return this.normalizeTimezone(tz1) === this.normalizeTimezone(tz2);
  }
}
