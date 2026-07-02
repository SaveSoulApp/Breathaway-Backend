import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class BlockNotFoundException extends DomainException {
  constructor(message = 'Block not found') {
    super(message);
  }
}
