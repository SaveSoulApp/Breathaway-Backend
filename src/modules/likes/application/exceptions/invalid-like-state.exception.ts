import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class InvalidLikeStateException extends DomainException {
  constructor() {
    super('Only PENDING likes can be deleted');
  }
}
