import {
  applyCountryCode,
  isE164Phone,
  normalizeIdentityValue,
} from '@common/utils/identity.utils';
import { IdentityType } from '@prisma/client';

describe('identity.utils', () => {
  describe('normalizeIdentityValue', () => {
    it('should strip all non-digit characters from a PHONE value', () => {
      expect(normalizeIdentityValue('+91 98765 41491', IdentityType.PHONE)).toBe(
        '919876541491',
      );
    });

    it('should strip the leading + from an E.164 phone number', () => {
      expect(normalizeIdentityValue('+919876541491', IdentityType.PHONE)).toBe(
        '919876541491',
      );
    });

    it('should lowercase and trim EMAIL values', () => {
      expect(normalizeIdentityValue('  User@Example.COM  ', IdentityType.EMAIL)).toBe(
        'user@example.com',
      );
    });

    it('should strip leading @ and lowercase INSTAGRAM handles', () => {
      expect(normalizeIdentityValue('@SomeHandle', IdentityType.INSTAGRAM)).toBe(
        'somehandle',
      );
    });
  });

  describe('isE164Phone', () => {
    it('returns true for a valid E.164 number with 2-digit country code', () => {
      expect(isE164Phone('+919876541491')).toBe(true);
    });

    it('returns true for a valid E.164 number with 1-digit country code', () => {
      expect(isE164Phone('+12125551234')).toBe(true);
    });

    it('returns true for a valid E.164 number with 3-digit country code', () => {
      expect(isE164Phone('+85212345678')).toBe(true);
    });

    it('returns false when the leading + is missing', () => {
      expect(isE164Phone('919876541491')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(isE164Phone('')).toBe(false);
    });

    it('returns false for a number with spaces', () => {
      expect(isE164Phone('+91 9876541491')).toBe(false);
    });

    it('returns false for a number with only 6 total digits after +', () => {
      expect(isE164Phone('+91123')).toBe(false); // only 5 digits total
    });

    it('returns false for a number that is too long (more than 15 digits)', () => {
      expect(isE164Phone('+12345678901234567')).toBe(false);
    });

    it('strips surrounding whitespace before testing', () => {
      expect(isE164Phone('  +919876541491  ')).toBe(true);
    });
  });

  describe('applyCountryCode', () => {
    it('prepends +91 country code to a local number', () => {
      expect(applyCountryCode('9876541491', '+91')).toBe('+919876541491');
    });

    it('prepends +1 country code to a local number', () => {
      expect(applyCountryCode('4155551234', '+1')).toBe('+14155551234');
    });

    it('prepends +852 country code to a local number', () => {
      expect(applyCountryCode('61234567', '+852')).toBe('+85261234567');
    });

    it('returns rawPhone unchanged when it is already E.164', () => {
      expect(applyCountryCode('+919876541491', '+91')).toBe('+919876541491');
    });

    it('returns rawPhone unchanged when countryCode does not start with +', () => {
      expect(applyCountryCode('9876541491', '91')).toBe('9876541491');
    });

    it('returns rawPhone unchanged when countryCode is an empty string', () => {
      expect(applyCountryCode('9876541491', '')).toBe('9876541491');
    });

    it('trims whitespace from rawPhone before prepending', () => {
      expect(applyCountryCode('  9876541491  ', '+91')).toBe('+919876541491');
    });
  });
});
