import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class ActiveSubscriptionNotFoundException extends DomainException {
  constructor(message = 'No active subscription found') {
    super(message);
  }
}
