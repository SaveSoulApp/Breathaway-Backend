import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class DeviceNotFoundException extends DomainException {
  constructor(message = 'Device not found for this user') {
    super(message);
  }
}
