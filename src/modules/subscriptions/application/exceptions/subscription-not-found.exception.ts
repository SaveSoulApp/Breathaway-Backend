import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class SubscriptionNotFoundException extends DomainException {
  constructor(message = 'Subscription not found') {
    super(message);
  }
}
