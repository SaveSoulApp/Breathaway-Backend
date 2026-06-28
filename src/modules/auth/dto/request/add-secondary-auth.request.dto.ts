import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Payload for adding a secondary authentication method (e.g., phone number or email) to an existing user account.
 *
 * This DTO is used during multi-factor authentication (MFA) setup or when linking alternative login credentials
 * to ensure that the new credential is valid and verified using a Firebase UID token or OTP token.
 */
export class AddSecondaryAuthRequestDto {
  /**
   * Firebase UID token or one-time password (OTP) token used to verify the ownership of the secondary identifier.
   * Must be a non-empty string obtained from the authentication provider.
   */
  @ApiProperty({
    description: 'Firebase UID token or OTP token for verification',
  })
  @IsString()
  @IsNotEmpty()
  uidToken: string;

  /**
   * The new secondary identifier (e.g., phone number or email address) to be linked to the user account.
   * Must be a non-empty string matching the credential verified by the token.
   */
  @ApiProperty({
    description: 'User identifier (e.g., phone number or email) being added',
  })
  @IsString()
  @IsNotEmpty()
  uid: string;
}
