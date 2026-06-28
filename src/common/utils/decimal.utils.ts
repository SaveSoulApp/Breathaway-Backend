import { Prisma } from '@prisma/client';

/**
 * Recursively converts Prisma Decimal instances to JavaScript numbers.
 *
 * Prisma maps `Decimal` / `@db.Decimal` columns to its own Decimal class which
 * serialises to a string in JSON (not a number). This utility walks any object
 * tree and calls `.toNumber()` on every Decimal it finds so that the data can be
 * serialised correctly by NestJS response interceptors.
 */
export class DecimalUtils {
  /**
   * Recursively convert all Prisma Decimal values to plain numbers.
   * Handles primitives, arrays, plain objects, and nested combinations.
   */
  static convertDecimals<T>(data: T): T {
    if (data === null || data === undefined) {
      return data;
    }

    if (data instanceof Prisma.Decimal) {
      return data.toNumber() as unknown as T;
    }

    if (Array.isArray(data)) {
      return (data as unknown[]).map((item) =>
        DecimalUtils.convertDecimals(item),
      ) as unknown as T;
    }

    if (data instanceof Date) {
      return data;
    }

    if (typeof data === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = DecimalUtils.convertDecimals(value);
      }
      return result as T;
    }

    return data;
  }
}
