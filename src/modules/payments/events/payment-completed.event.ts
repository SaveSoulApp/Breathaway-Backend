/**
 * Fired after a web payment is fully confirmed and credits have been granted.
 *
 * Emitted by `PaymentsService` — consumed by `NotificationEventsListener`
 * to dispatch push + email notifications. Domain services NEVER import
 * `NotificationsModule` directly.
 */
export const PAYMENT_COMPLETED_EVENT = 'payment.completed';

export class PaymentCompletedEvent {
  constructor(
    /** Internal ULID of the user who paid. */
    public readonly userId: string,
    /** Internal ULID of the `PaymentOrder`. */
    public readonly orderId: string,
    /** Credits actually granted, frozen at grant time. */
    public readonly creditsGranted: number,
    /** Amount paid in smallest currency unit (e.g. paise). */
    public readonly amount: number,
    /** ISO-4217 currency code (e.g. "INR"). */
    public readonly currency: string,
  ) {}
}
