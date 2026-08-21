import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class AlreadyMatchedException extends DomainException {
  constructor() {
    super('You already have an active match with this person');
  }
}
