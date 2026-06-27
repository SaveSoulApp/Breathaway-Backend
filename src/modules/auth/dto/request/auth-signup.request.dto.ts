import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Payload for registering a new user account in the system.
 *
 * Used in the sign-up endpoint to create a new user profile after verifying their credentials
 * via a Firebase UID token or OTP token.
 */
export class AuthSignupDto {
  /**
   * Firebase UID token or OTP token proving the registration credentials have been verified.
   * Must be a non-empty string used to authenticate the initial sign-up request.
   */
  @ApiProperty({
    description: 'Firebase UID token or OTP token for verification',
  })
  @IsString()
  @IsNotEmpty()
  uidToken: string;

  /**
   * The primary identifier (e.g., phone number or email address) to register for the new user.
   * Must be a non-empty string that is unique across all registered users.
   */
  @ApiProperty({
    description: 'User identifier (e.g., phone number or email) to sign up',
  })
  @IsString()
  @IsNotEmpty()
  uid: string;
}
