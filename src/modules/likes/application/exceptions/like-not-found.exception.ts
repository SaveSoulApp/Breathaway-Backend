import { DomainException } from '@shared/domain/exceptions/domain.exception';

export class LikeNotFoundException extends DomainException {
  constructor(id: string) {
    super(`Like ${id} not found`);
  }
}
