import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

/**
 * Supported third-party social media authentication platforms.
 *
 * Defines the allowed integration channels for social-based login and verification.
 */
export enum SocialAuthType {
  /** Instagram platform authentication. */
  INSTAGRAM = 'INSTAGRAM',
  /** LinkedIn platform authentication. */
  LINKEDIN = 'LINKEDIN',
  /** Twitter/X platform authentication. */
  TWITTER = 'TWITTER',
  /** Alternative or custom social platform authentication. */
  OTHER = 'OTHER',
}

/**
 * Payload representing credentials and handle details from a third-party social media platform.
 *
 * Used to link external social accounts, verify profile ownership, or perform OAuth/handle-based authentication.
 */
export class SocialAuthDto {
  /**
   * The type of social media platform being linked or authenticated against.
   * Must be one of the supported platforms defined in SocialAuthType.
   */
  @ApiProperty({
    description: 'The social platform used for auth',
    enum: SocialAuthType,
  })
  @IsEnum(SocialAuthType)
  type: SocialAuthType;

  /**
   * Unique numeric or alphanumeric user ID assigned by the target social media platform.
   * Used as the primary lookup handle when validating the external profile.
   */
  @ApiProperty({ description: 'User ID from the social platform' })
  @IsString()
  platformUserId: string;

  /**
   * Public user handle or username (e.g., @username) of the profile on the social media platform.
   * Used for user interface display and deep linking.
   */
  @ApiProperty({ description: 'User handle/username from the social platform' })
  @IsString()
  handle: string;
}
