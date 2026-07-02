import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class MatchNotFoundException extends DomainException {
  constructor(message = 'Match not found') {
    super(message);
  }
}
