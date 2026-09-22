import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class ActiveMatchRequiredException extends DomainException {
  constructor() {
    super('You can only message users you have an active match with');
  }
}
