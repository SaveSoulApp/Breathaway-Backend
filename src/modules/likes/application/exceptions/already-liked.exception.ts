import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class AlreadyLikedException extends DomainException {
  constructor() {
    super('You already liked this person');
  }
}
