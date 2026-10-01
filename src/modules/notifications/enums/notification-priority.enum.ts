/**
 * Delivery urgency and client prioritization levels.
 *
 * Stored as varchar strings in PostgreSQL to allow new priority tiers
 * (such as CRITICAL) to be added in code without requiring database schema DDL migrations.
 */
export enum NotificationPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}
