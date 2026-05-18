import {
  amountToWords,
  CurrencyUtils,
  formatCurrency,
  formatINR,
} from '../../utils/currency.utils';

describe('CurrencyUtils', () => {
  describe('formatINR', () => {
    it('should format positive integer amount correctly', () => {
      expect(CurrencyUtils.formatINR(5000)).toBe('₹ 5,000/-');
      expect(CurrencyUtils.formatINR(100000)).toBe('₹ 1,00,000/-');
      expect(CurrencyUtils.formatINR(1234567)).toBe('₹ 12,34,567/-');
    });

    it('should format amount with decimals when showDecimals is true', () => {
      expect(CurrencyUtils.formatINR(5000.5, 'INR', true)).toBe('₹ 5,000.50/-');
      expect(CurrencyUtils.formatINR(1234.56, 'INR', true)).toBe(
        '₹ 1,234.56/-',
      );
    });

    it('should format negative amounts correctly', () => {
      expect(CurrencyUtils.formatINR(-5000)).toBe('-₹ 5,000/-');
      expect(CurrencyUtils.formatINR(-1234.56, 'INR', true)).toBe(
        '-₹ 1,234.56/-',
      );
    });

    it('should format zero amount correctly', () => {
      expect(CurrencyUtils.formatINR(0)).toBe('₹ 0/-');
      expect(CurrencyUtils.formatINR(0, 'INR', true)).toBe('₹ 0.00/-');
    });

    it('should handle edge cases', () => {
      expect(CurrencyUtils.formatINR(1)).toBe('₹ 1/-');
      expect(CurrencyUtils.formatINR(999)).toBe('₹ 999/-');
      expect(CurrencyUtils.formatINR(10000000)).toBe('₹ 1,00,00,000/-');
    });

    it('should return "Invalid amount" for invalid inputs', () => {
      expect(CurrencyUtils.formatINR(NaN)).toBe('Invalid amount');
      expect(CurrencyUtils.formatINR(Infinity)).toBe('Invalid amount');
      expect(CurrencyUtils.formatINR(-Infinity)).toBe('Invalid amount');
    });
  });

  describe('formatCurrency', () => {
    it('should format INR currency with Indian numbering system', () => {
      expect(CurrencyUtils.formatCurrency(5000, 'INR')).toBe('₹5,000.00');
      expect(CurrencyUtils.formatCurrency(100000, 'INR')).toBe('₹1,00,000.00');
    });

    it('should format USD currency correctly', () => {
      expect(CurrencyUtils.formatCurrency(5000, 'USD', 'en-US')).toBe(
        '$5,000.00',
      );
      expect(CurrencyUtils.formatCurrency(1234.56, 'USD', 'en-US')).toBe(
        '$1,234.56',
      );
    });

    it('should handle showDecimals parameter', () => {
      expect(CurrencyUtils.formatCurrency(5000, 'INR', 'en-US', false)).toBe(
        '₹5,000',
      );
      expect(CurrencyUtils.formatCurrency(5000.5, 'INR', 'en-US', false)).toBe(
        '₹5,001',
      );
    });

    it('should return "Invalid amount" for invalid inputs', () => {
      expect(CurrencyUtils.formatCurrency(NaN, 'INR')).toBe('Invalid amount');
      expect(CurrencyUtils.formatCurrency(Infinity, 'USD')).toBe(
        'Invalid amount',
      );
    });
  });

  describe('toWords', () => {
    it('should convert positive integers to words', () => {
      expect(CurrencyUtils.toWords(5000)).toBe(
        'Five Thousand Indian Rupees Only',
      );
      expect(CurrencyUtils.toWords(1)).toBe('One Indian Rupees Only');
      expect(CurrencyUtils.toWords(100)).toBe('One Hundred Indian Rupees Only');
    });

    it('should convert amounts with decimals to words', () => {
      expect(CurrencyUtils.toWords(5000.5)).toBe(
        'Five Thousand Indian Rupees And Fifty Paise Only',
      );
      expect(CurrencyUtils.toWords(123.45)).toBe(
        'One Hundred Twenty Three Indian Rupees And Forty Five Paise Only',
      );
    });

    it('should handle negative amounts', () => {
      expect(CurrencyUtils.toWords(-5000)).toBe(
        'Negative Five Thousand Indian Rupees Only',
      );
      expect(CurrencyUtils.toWords(-123.45)).toBe(
        'Negative One Hundred Twenty Three Indian Rupees And Forty Five Paise Only',
      );
    });

    it('should handle zero amount', () => {
      expect(CurrencyUtils.toWords(0)).toBe('Zero Indian Rupees Only');
    });

    it('should work with different currencies', () => {
      expect(CurrencyUtils.toWords(5000, 'USD')).toBe(
        'Five Thousand US Dollars Only',
      );
      expect(CurrencyUtils.toWords(5000.5, 'USD')).toBe(
        'Five Thousand US Dollars And Fifty Cents Only',
      );
    });

    it('should return "Invalid amount" for invalid inputs', () => {
      expect(CurrencyUtils.toWords(NaN)).toBe('Invalid amount');
      expect(CurrencyUtils.toWords(Infinity)).toBe('Invalid amount');
    });
  });

  describe('parseCurrency', () => {
    it('should parse Indian currency format correctly', () => {
      expect(CurrencyUtils.parseCurrency('₹ 5,000/-')).toBe(5000);
      expect(CurrencyUtils.parseCurrency('₹ 1,00,000/-')).toBe(100000);
      expect(CurrencyUtils.parseCurrency('₹ 12,34,567/-')).toBe(1234567);
    });

    it('should parse international currency formats', () => {
      expect(CurrencyUtils.parseCurrency('$5,000.00')).toBe(5000);
      expect(CurrencyUtils.parseCurrency('£1,250.75')).toBe(1250.75);
    });

    it('should parse European currency formats correctly', () => {
      // European format: dot as thousands separator, comma as decimal
      expect(CurrencyUtils.parseCurrency('€1.234,56')).toBe(1234.56);
      expect(CurrencyUtils.parseCurrency('€12.345,67')).toBe(12345.67);
      expect(CurrencyUtils.parseCurrency('€123.456,78')).toBe(123456.78);
    });

    it('should parse decimal amounts', () => {
      expect(CurrencyUtils.parseCurrency('₹ 1,234.56/-')).toBe(1234.56);
      expect(CurrencyUtils.parseCurrency('$123.45')).toBe(123.45);
    });

    it('should parse negative amounts', () => {
      expect(CurrencyUtils.parseCurrency('-₹ 5,000/-')).toBe(-5000);
      expect(CurrencyUtils.parseCurrency('-$1,234.56')).toBe(-1234.56);
      expect(CurrencyUtils.parseCurrency('-€1.234,56')).toBe(-1234.56);
    });

    it('should return NaN for invalid inputs', () => {
      expect(CurrencyUtils.parseCurrency('invalid')).toBeNaN();
      expect(CurrencyUtils.parseCurrency('')).toBeNaN();
      expect(CurrencyUtils.parseCurrency(null as any)).toBeNaN();
      expect(CurrencyUtils.parseCurrency(undefined as any)).toBeNaN();
    });
  });

  describe('isValidCurrency', () => {
    it('should return true for valid currency strings', () => {
      expect(CurrencyUtils.isValidCurrency('₹5,000')).toBe(true);
      expect(CurrencyUtils.isValidCurrency('$1,234.56')).toBe(true);
      expect(CurrencyUtils.isValidCurrency('123.45')).toBe(true);
      expect(CurrencyUtils.isValidCurrency('1,00,000')).toBe(true);
      expect(CurrencyUtils.isValidCurrency('-₹5,000/-')).toBe(true);
    });

    it('should return false for invalid currency strings', () => {
      expect(CurrencyUtils.isValidCurrency('abc')).toBe(false);
      expect(CurrencyUtils.isValidCurrency('12.34.56')).toBe(false);
      expect(CurrencyUtils.isValidCurrency('')).toBe(false);
      expect(CurrencyUtils.isValidCurrency(null as any)).toBe(false);
      expect(CurrencyUtils.isValidCurrency(undefined as any)).toBe(false);
    });
  });

  describe('Convenience functions', () => {
    describe('formatINR', () => {
      it('should format INR currency using convenience function', () => {
        expect(formatINR(5000)).toBe('₹ 5,000/-');
        expect(formatINR(100000)).toBe('₹ 1,00,000/-');
      });
    });

    describe('formatCurrency', () => {
      it('should format currency using convenience function', () => {
        expect(formatCurrency(5000, 'INR')).toBe('₹5,000.00');
        expect(formatCurrency(1000, 'USD')).toBe('$1,000.00');
      });
    });

    describe('amountToWords', () => {
      it('should convert amount to words using convenience function', () => {
        expect(amountToWords(5000)).toBe('Five Thousand Indian Rupees Only');
        expect(amountToWords(1000, 'USD')).toBe('One Thousand US Dollars Only');
      });
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle very large numbers', () => {
      expect(CurrencyUtils.formatINR(999999999999)).toBe(
        '₹ 9,99,99,99,99,999/-',
      );
      expect(CurrencyUtils.isValidCurrency('₹ 9,99,99,99,99,999/-')).toBe(true);
    });

    it('should handle very small decimal numbers', () => {
      expect(CurrencyUtils.formatINR(0.01, 'INR', true)).toBe('₹ 0.01/-');
      expect(CurrencyUtils.parseCurrency('₹ 0.01/-')).toBe(0.01);
    });
  });
});
