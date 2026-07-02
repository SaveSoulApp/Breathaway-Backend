import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class BlockTargetNotFoundException extends DomainException {
  constructor(message = 'User to block not found') {
    super(message);
  }
}
