import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class SocialIdentityApiException extends DomainException {
  constructor(message: string) {
    super(message);
  }
}
