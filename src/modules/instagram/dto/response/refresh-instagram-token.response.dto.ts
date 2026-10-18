import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Response DTO representing the payload returned by Instagram Graph API token refresh operations.
 */
export class RefreshInstagramTokenResponseDto {
  @ApiProperty({
    description: 'Refreshed long-lived Instagram user access token',
    example: 'IGQVJ...',
  })
  @Expose()
  access_token: string;

  @ApiProperty({
    description: 'Type of the access token',
    example: 'bearer',
  })
  @Expose()
  token_type: string;

  @ApiProperty({
    description: 'Lifetime of the access token in seconds',
    example: 5184000,
  })
  @Expose()
  expires_in: number;
}
