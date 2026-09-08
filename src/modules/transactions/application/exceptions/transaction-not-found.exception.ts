import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class TransactionNotFoundException extends DomainException {
  constructor(message = 'Transaction not found') {
    super(message);
  }
}
