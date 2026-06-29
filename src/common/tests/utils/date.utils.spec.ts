import { DateUtil, formatDate } from '../../utils/date.utils';

describe('Date Utils', () => {
  describe('formatDate', () => {
    let originalTZ: string | undefined;

    beforeAll(() => {
      originalTZ = process.env.TZ;
      process.env.TZ = 'UTC';
    });

    afterAll(() => {
      process.env.TZ = originalTZ;
    });

    it('should format a Date object correctly', () => {
      const date = DateUtil.parse('2025-11-27T00:00:00Z');
      expect(formatDate(date)).toBe('November 27, 2025');
    });

    it('should format a date string correctly', () => {
      const dateString = '2023-01-15';
      expect(formatDate(dateString)).toBe('January 15, 2023');
    });

    it('should handle different dates', () => {
      expect(formatDate('1999-12-31')).toBe('December 31, 1999');
      expect(formatDate('2000-02-29')).toBe('February 29, 2000'); // Leap year
    });

    it('should handle different date string formats as input', () => {
      expect(formatDate('Jan 1, 2022')).toBe('January 1, 2022');
    });

    it('should return "Invalid Date" for an invalid date input', () => {
      expect(formatDate('not a real date')).toBe('Invalid Date');
    });
  });

  describe('DateUtil.addDays', () => {
    it('should correctly add a specified number of days to a given date', () => {
      const initialDate = DateUtil.parse('2023-01-01T12:00:00Z');
      const expectedDate = DateUtil.parse('2023-01-08T12:00:00Z'); // 7 days later

      const result = DateUtil.addDays(initialDate, 7);

      expect(result.toISOString()).toBe(expectedDate.toISOString());
    });

    it('should correctly handle negative days', () => {
      const initialDate = DateUtil.parse('2023-01-08T12:00:00Z');
      const expectedDate = DateUtil.parse('2023-01-01T12:00:00Z'); // 7 days earlier

      const result = DateUtil.addDays(initialDate, -7);

      expect(result.toISOString()).toBe(expectedDate.toISOString());
    });
  });
});
