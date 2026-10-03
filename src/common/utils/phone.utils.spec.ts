import { extractCountryCodeFromPhone, maskPhoneNumber } from './phone.utils';

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

describe('maskPhoneNumber', () => {
  it('masks standard international and digits-only phone numbers', () => {
    expect(maskPhoneNumber('+919876543210')).toBe('+91****3210');
    expect(maskPhoneNumber('919876543210')).toBe('91****3210');
    expect(maskPhoneNumber('+14155552671')).toBe('+14****2671');
  });

  it('masks short numbers safely', () => {
    expect(maskPhoneNumber('12345')).toBe('****');
    expect(maskPhoneNumber('123456')).toBe('****');
    expect(maskPhoneNumber('')).toBe('***');
    expect(maskPhoneNumber(null)).toBe('***');
    expect(maskPhoneNumber(undefined)).toBe('***');
  });
});
