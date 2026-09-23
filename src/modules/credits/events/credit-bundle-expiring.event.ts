export const CREDIT_BUNDLE_EXPIRING_EVENT = 'credits.bundle-expiring';

export class CreditBundleExpiringEvent {
  constructor(
    public readonly userId: string,
    public readonly count: number,
    public readonly expiryDate: string,
    public readonly daysRemaining: number,
    public readonly urgency: string,
    public readonly isUrgent: boolean,
  ) {}
}
