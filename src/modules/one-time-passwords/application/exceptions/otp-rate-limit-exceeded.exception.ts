import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class OtpRateLimitExceededException extends DomainException {
  constructor(message = 'Please wait before requesting another OTP.') {
    super(message);
  }
}
