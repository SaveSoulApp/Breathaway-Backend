import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Payload for signing in using development or bypass credentials.
 *
 * This DTO is strictly utilized in development or staging environments to facilitate rapid testing
 * without requiring live SMS or external provider authentication tokens.
 */
export class DevLoginRequestDto {
  /**
   * The developer or test user identifier (e.g., pre-seeded email or test phone number).
   * Must be a non-empty string configured in the local seed or test databases.
   */
  @ApiProperty({ description: 'Dev user identifier for login' })
  @IsString()
  @IsNotEmpty()
  identifier: string;
}
