import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class SubscriptionPlanPriceNotFoundException extends DomainException {
  constructor(message = 'Subscription plan or price not found') {
    super(message);
  }
}
