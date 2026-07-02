import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class UnsupportedAuthMethodException extends DomainException {
  constructor(message = 'Unsupported authentication method') {
    super(message);
  }
}
