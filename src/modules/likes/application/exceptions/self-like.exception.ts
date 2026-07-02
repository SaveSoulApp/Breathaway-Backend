import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class SelfLikeException extends DomainException {
  constructor() {
    super('You cannot like yourself');
  }
}
