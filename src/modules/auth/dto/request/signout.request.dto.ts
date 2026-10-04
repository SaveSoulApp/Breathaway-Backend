import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Optional payload for user signout.
 *
 * If a specific refresh token is provided, only that active session/lineage is terminated.
 * If omitted, all active sessions for the authenticated user are revoked.
 */
export class SignoutRequestDto {
  /**
   * Optional refresh token to target for revocation.
   */
  @ApiPropertyOptional({
    description:
      'Optional refresh token to revoke a specific session. If omitted, all active sessions for this user are terminated.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
