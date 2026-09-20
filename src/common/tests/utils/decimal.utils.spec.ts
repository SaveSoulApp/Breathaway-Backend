import { Prisma } from '@prisma/client';

import { DecimalUtils } from '../../utils/decimal.utils';

describe('DecimalUtils', () => {
  describe('convertDecimals', () => {
    it('should return null or undefined as is', () => {
      expect(DecimalUtils.convertDecimals(null)).toBeNull();
      expect(DecimalUtils.convertDecimals(undefined)).toBeUndefined();
    });

    it('should return primitive types unchanged', () => {
      expect(DecimalUtils.convertDecimals('hello')).toBe('hello');
      expect(DecimalUtils.convertDecimals(123)).toBe(123);
      expect(DecimalUtils.convertDecimals(true)).toBe(true);
    });

    it('should return Date instances unchanged', () => {
      const now = new Date();
      expect(DecimalUtils.convertDecimals(now)).toBe(now);
    });

    it('should return Buffer instances unchanged', () => {
      const buf = Buffer.from('test');
      expect(DecimalUtils.convertDecimals(buf)).toBe(buf);
    });

    it('should convert a Prisma.Decimal instance to a number', () => {
      const decimal = new Prisma.Decimal('19.99');
      const result = DecimalUtils.convertDecimals(decimal);
      expect(result).toBe(19.99);
      expect(typeof result).toBe('number');
    });

    it('should convert duck-typed Decimal objects with toNumber method', () => {
      const duckDecimal = {
        toNumber: () => 49.99,
        d: [49, 9900000],
        e: 1,
        s: 1,
      };
      const result = DecimalUtils.convertDecimals(duckDecimal);
      expect(result).toBe(49.99);
      expect(typeof result).toBe('number');
    });

    it('should recursively convert Decimals inside arrays', () => {
      const input = [
        new Prisma.Decimal('10.5'),
        new Prisma.Decimal('20.75'),
        'unchanged',
      ];
      const result = DecimalUtils.convertDecimals(input);
      expect(result).toEqual([10.5, 20.75, 'unchanged']);
    });

    it('should recursively convert Decimals inside nested objects and arrays', () => {
      const input = {
        id: 'plan_1',
        name: 'Annual Subscription',
        prices: [
          {
            id: 'price_1',
            currencyCode: 'INR',
            price: new Prisma.Decimal('999.00'),
            countryCode: 'IN',
          },
          {
            id: 'price_2',
            currencyCode: 'USD',
            price: new Prisma.Decimal('19.99'),
            countryCode: 'US',
          },
        ],
        metadata: {
          discount: new Prisma.Decimal('5.00'),
          active: true,
        },
        createdAt: new Date('2026-01-01T00:00:00Z'),
      };

      const result = DecimalUtils.convertDecimals(input);

      expect(result).toEqual({
        id: 'plan_1',
        name: 'Annual Subscription',
        prices: [
          {
            id: 'price_1',
            currencyCode: 'INR',
            price: 999,
            countryCode: 'IN',
          },
          {
            id: 'price_2',
            currencyCode: 'USD',
            price: 19.99,
            countryCode: 'US',
          },
        ],
        metadata: {
          discount: 5,
          active: true,
        },
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      expect(typeof result.prices[0].price).toBe('number');
      expect(result.createdAt).toBeInstanceOf(Date);
    });
  });
});
