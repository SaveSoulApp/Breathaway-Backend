import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class DeviceTokenAlreadyExistsException extends DomainException {
  constructor(message = 'A device with this token already exists') {
    super(message);
  }
}
