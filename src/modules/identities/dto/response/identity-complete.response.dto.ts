import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IdentityResponseDto } from './identity.response.dto';

/**
 * Extended identity response that includes decrypted plaintext values.
 *
 * Returned exclusively by /complete and /lookup endpoints. Decryption occurs
 * server-side via `IdentityCryptoService`; these values are never cached and
 * must only be transmitted over authenticated, TLS-protected connections.
 */
export class IdentityCompleteResponseDto extends IdentityResponseDto {
  @ApiProperty()
  @Expose()
  publicValue: string;

  @ApiPropertyOptional()
  @Expose()
  platformId?: string | null;
}
