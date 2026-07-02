import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class MissingInstagramConfigException extends DomainException {
  constructor(message = 'Instagram access token not configured.') {
    super(message);
  }
}
