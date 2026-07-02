import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class SocialAccountAlreadyLinkedException extends DomainException {
  constructor(message = 'This platform account is already linked to another active user') {
    super(message);
  }
}
