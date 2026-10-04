import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Payload for rotating access and refresh tokens.
 *
 * Clients provide the previously issued JWT refresh token to obtain a fresh access token
 * and a rotated refresh token without requiring full credential re-authentication.
 */
export class RefreshTokenRequestDto {
  /**
   * Cryptographically signed JWT refresh token issued during login or the previous refresh.
   */
  @ApiProperty({
    description: 'Signed JWT refresh token issued during authentication',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
