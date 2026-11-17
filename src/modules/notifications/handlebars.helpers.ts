import * as Handlebars from 'handlebars';

/**
 * Registers custom Handlebars helpers for notifications (push, email, SMS).
 * Helpers registered:
 * - `gt`: Greater than comparison (a > b)
 * - `gte`: Greater than or equal (a >= b)
 * - `lt`: Less than comparison (a < b)
 * - `lte`: Less than or equal (a <= b)
 * - `eq`: Equality comparison (a === b or Number(a) === Number(b))
 * - `pluralize`: Pluralization helper (count === 1 ? singular : plural)
 */
export function registerNotificationHandlebarsHelpers(): void {
  Handlebars.registerHelper(
    'gt',
    (a: unknown, b: unknown) => Number(a) > Number(b),
  );
  Handlebars.registerHelper(
    'gte',
    (a: unknown, b: unknown) => Number(a) >= Number(b),
  );
  Handlebars.registerHelper(
    'lt',
    (a: unknown, b: unknown) => Number(a) < Number(b),
  );
  Handlebars.registerHelper(
    'lte',
    (a: unknown, b: unknown) => Number(a) <= Number(b),
  );
  Handlebars.registerHelper(
    'eq',
    (a: unknown, b: unknown) => a === b || Number(a) === Number(b),
  );
  Handlebars.registerHelper(
    'pluralize',
    (count: unknown, singular: string, plural: string) =>
      Number(count) === 1 ? singular : plural,
  );
}

// Ensure helpers are registered immediately upon module import
registerNotificationHandlebarsHelpers();
