import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Payload for signing in an existing user using their authentication credentials.
 *
 * Used in the sign-in endpoint to authenticate a user by verifying their credentials
 * via a Firebase UID token or OTP token against the provided unique identifier.
 */
export class AuthSigninDto {
  /**
   * Firebase UID token or OTP verification token issued by the auth provider.
   * Must be a non-empty string used by the backend to verify the authenticity of the session.
   */
  @ApiProperty({
    description: 'Firebase UID token or OTP token for verification',
  })
  @IsString()
  @IsNotEmpty()
  uidToken: string;

  /**
   * The unique user identifier (e.g., phone number or email address) associated with the account.
   * Must be a non-empty string that matches the user record being accessed.
   */
  @ApiProperty({
    description: 'User identifier (e.g., phone number or email) to sign in',
  })
  @IsString()
  @IsNotEmpty()
  uid: string;
}
