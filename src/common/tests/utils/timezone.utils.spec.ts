import { DateUtil } from '@common/utils/date.utils';
import { TimezoneUtil } from '../../utils/timezone.utils';

describe('TimezoneUtil', () => {
  // Set a consistent timezone for the test environment to avoid flaky tests
  let originalTZ: string | undefined;

  beforeAll(() => {
    originalTZ = process.env.TZ;
    process.env.TZ = 'UTC';
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  describe('isValidTimezone', () => {
    it('should return true for valid IANA timezones', () => {
      expect(TimezoneUtil.isValidTimezone('America/New_York')).toBe(true);
      expect(TimezoneUtil.isValidTimezone('Asia/Kolkata')).toBe(true);
      expect(TimezoneUtil.isValidTimezone('UTC')).toBe(true);
    });

    it('should return false for invalid timezones', () => {
      expect(TimezoneUtil.isValidTimezone('Invalid/Timezone')).toBe(false);
      expect(TimezoneUtil.isValidTimezone('Mars/Olympus_Mons')).toBe(false);
    });

    it('should return false for empty or non-string inputs', () => {
      expect(TimezoneUtil.isValidTimezone('')).toBe(false);
      expect(TimezoneUtil.isValidTimezone(null as unknown as string)).toBe(
        false,
      );
      expect(TimezoneUtil.isValidTimezone(undefined as unknown as string)).toBe(
        false,
      );
      expect(TimezoneUtil.isValidTimezone(123 as unknown as string)).toBe(
        false,
      );
    });
  });

  describe('normalizeTimezone', () => {
    it('should return a valid timezone as-is', () => {
      expect(TimezoneUtil.normalizeTimezone('America/Chicago')).toBe(
        'America/Chicago',
      );
    });

    it('should default to UTC for undefined, null, or empty strings', () => {
      expect(TimezoneUtil.normalizeTimezone(undefined)).toBe('UTC');
      expect(TimezoneUtil.normalizeTimezone(null as unknown as string)).toBe(
        'UTC',
      );
      expect(TimezoneUtil.normalizeTimezone('')).toBe('UTC');
      expect(TimezoneUtil.normalizeTimezone('  ')).toBe('UTC');
    });

    it('should handle case-insensitive matching', () => {
      expect(TimezoneUtil.normalizeTimezone('asia/kolkata')).toBe(
        'Asia/Kolkata',
      );
    });

    it('should handle partial matching', () => {
      expect(TimezoneUtil.normalizeTimezone('Kolkata')).toBe('Asia/Kolkata');
    });

    it('should default to UTC for invalid timezones', () => {
      expect(TimezoneUtil.normalizeTimezone('Invalid/Zone')).toBe('UTC');
    });
  });

  describe('convertToUTC', () => {
    it('should convert a date string from a given timezone to a UTC Date object (start of day)', () => {
      const dateString = '2023-07-04';
      const timezone = 'America/New_York'; // EDT is UTC-4
      const expectedUTCDate = DateUtil.parse('2023-07-04T04:00:00.000Z');
      expect(TimezoneUtil.convertToUTC(dateString, timezone, 'start')).toEqual(
        expectedUTCDate,
      );
    });

    it('should convert a date string from a given timezone to a UTC Date object (end of day)', () => {
      const dateString = '2023-07-04';
      const timezone = 'America/New_York'; // EDT is UTC-4
      const expectedUTCDate = DateUtil.parse('2023-07-05T03:59:59.999Z');
      expect(TimezoneUtil.convertToUTC(dateString, timezone, 'end')).toEqual(
        expectedUTCDate,
      );
    });
  });

  describe('formatInTimezone', () => {
    it('should format a UTC Date object into a string for a given timezone', () => {
      const date = DateUtil.parse('2023-07-04T12:00:00.000Z');
      const timezone = 'America/New_York'; // 12:00 UTC is 8:00 EDT
      expect(
        TimezoneUtil.formatInTimezone(date, timezone, 'YYYY-MM-DD HH:mm'),
      ).toBe('2023-07-04 08:00');
    });
  });

  describe('getUTCDateRange', () => {
    it('should return the start and end of a date range in UTC', () => {
      const startDate = '2023-11-05';
      const endDate = '2023-11-06';
      const timezone = 'America/New_York'; // DST ends Nov 5, 2023. EST is UTC-5

      const { startUTC, endUTC } = TimezoneUtil.getUTCDateRange(
        startDate,
        endDate,
        timezone,
      );

      // On Nov 5, 2023, DST ends in America/New_York. The day starts in EDT (UTC-4)
      // and ends in EST (UTC-5).
      // 2023-11-05 00:00:00 EDT = 2023-11-05T04:00:00.000Z
      expect(startUTC).toEqual(DateUtil.parse('2023-11-05T04:00:00.000Z'));

      // 2023-11-06 23:59:59.999 EST = 2023-11-07T04:59:59.999Z
      expect(endUTC).toEqual(DateUtil.parse('2023-11-07T04:59:59.999Z'));
    });
  });

  describe('getOffsetInMinutes', () => {
    it('should return the correct offset in minutes', () => {
      const date = DateUtil.now();
      expect(TimezoneUtil.getOffsetInMinutes(date, 'Asia/Kolkata')).toBe(330);
      expect(TimezoneUtil.getOffsetInMinutes(date, 'UTC')).toBe(0);
    });
  });

  describe('getTimezoneAbbreviation', () => {
    it('should return the correct timezone abbreviation', () => {
      // Test during standard time
      const winterDate = DateUtil.parse('2023-01-15T12:00:00Z');
      expect(
        TimezoneUtil.getTimezoneAbbreviation('America/New_York', winterDate),
      ).toBe('EST');

      // Test during daylight saving time
      const summerDate = DateUtil.parse('2023-07-15T12:00:00Z');
      expect(
        TimezoneUtil.getTimezoneAbbreviation('America/New_York', summerDate),
      ).toBe('EDT');

      expect(
        TimezoneUtil.getTimezoneAbbreviation('Asia/Kolkata', DateUtil.now()),
      ).toBe('IST');
    });
  });

  describe('areTimezonesSame', () => {
    it('should return true for equivalent timezones', () => {
      expect(
        TimezoneUtil.areTimezonesSame('Asia/Kolkata', 'asia/kolkata'),
      ).toBe(true);
    });

    it('should return false for different timezones', () => {
      expect(
        TimezoneUtil.areTimezonesSame('America/New_York', 'Asia/Kolkata'),
      ).toBe(false);
    });
  });
});
