import { PartialType } from '@nestjs/swagger';

import { CreateIdentityRequestDto } from './create-identity.request.dto';

/**
 * Payload for PATCH /identities/:id — updates an identity's public value and/or platform ID.
 *
 * Inherits fields and validation from CreateIdentityRequestDto, marking all properties as optional.
 * Values are lowercased, re-encrypted, and re-hashed before writing. Duplicate detection runs
 * against all other active identities of the same type.
 */
export class UpdateIdentityRequestDto extends PartialType(
  CreateIdentityRequestDto,
) {}
