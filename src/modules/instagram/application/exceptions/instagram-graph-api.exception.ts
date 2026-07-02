import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class InstagramGraphApiException extends DomainException {
  constructor(message: string | any = 'Failed to refresh token') {
    // If the message is an object (from err.response?.data), we stringify or pass it to super.
    // Base DomainException takes a string. Let's ensure it's a string.
    super(typeof message === 'string' ? message : JSON.stringify(message));
  }
}
