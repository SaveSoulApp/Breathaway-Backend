import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class InvalidOtpException extends DomainException {
  constructor(message = 'Invalid or expired OTP') {
    super(message);
  }
}
