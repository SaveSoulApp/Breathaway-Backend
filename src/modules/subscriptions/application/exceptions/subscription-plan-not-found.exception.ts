import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class SubscriptionPlanNotFoundException extends DomainException {
  constructor(message = 'Subscription plan not found') {
    super(message);
  }
}
