import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class LedgerEntryNotFoundException extends DomainException {
  constructor(message = 'Ledger entry not found') {
    super(message);
  }
}
