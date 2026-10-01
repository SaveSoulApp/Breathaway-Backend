/**
 * High-level groupings for notification routing, user preference toggles,
 * and inbox feed filtering.
 *
 * Stored as varchar strings in PostgreSQL to allow new categories to be
 * added in code without requiring database schema DDL migrations.
 */
export enum NotificationCategory {
  SOCIAL = 'SOCIAL',
  SECURITY = 'SECURITY',
  BILLING = 'BILLING',
  REMINDER = 'REMINDER',
  MARKETING = 'MARKETING',
  SYSTEM = 'SYSTEM',
  SUPPORT = 'SUPPORT',
}
