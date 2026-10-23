import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Result of terminating all other active sessions for the user.
 */
export class RevokeOtherSessionsResponseDto {
  @ApiProperty({
    description: 'Number of terminated session lineages',
    example: 3,
  })
  @Expose()
  revokedCount: number;
}
