import { extractCountryCodeFromPhone } from './phone.utils';

describe('extractCountryCodeFromPhone', () => {
  describe('valid E.164 numbers — correct country resolved', () => {
    it.each([
      ['+919876543210', 'IN'],
      ['+14155552671', 'US'],
      ['+447400123456', 'GB'],
      ['+6581234567', 'SG'],
      ['+971501234567', 'AE'],
      ['+61412345678', 'AU'],
      ['+353861234567', 'IE'],
      ['+4917612345678', 'DE'],
    ])('parses %s → %s', (phone, expectedCountry) => {
      expect(extractCountryCodeFromPhone(phone)).toBe(expectedCountry);
    });
  });

  describe('invalid or unparseable inputs — returns null', () => {
    it.each([
      ['invalid-phone'],
      [''],
      ['12345'],
      ['+'],
      ['not-a-number'],
      ['9876543210'], // missing + prefix — not E.164
    ])('returns null for %s', (input) => {
      expect(extractCountryCodeFromPhone(input)).toBeNull();
    });
  });
});
