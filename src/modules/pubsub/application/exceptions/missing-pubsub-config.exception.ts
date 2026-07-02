import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class MissingPubSubConfigException extends DomainException {
  constructor(message = 'Server configuration error') {
    super(message);
  }
}
