import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class DeletedAccountReverificationException extends DomainException {
  constructor(
    message = 'This account was previously deleted and requires re-verification',
  ) {
    super(message);
  }
}
