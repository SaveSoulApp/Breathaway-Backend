import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Response payload containing authentication results and user profile summary.
 *
 * This DTO is returned after successful sign-in, registration, or token exchange,
 * enclosing the JWT access token and basic user details needed for immediate client hydration.
 */
export class UserAuthResponseDto {
  /**
   * The unique user identifier.
   * Typically returned in sign-in responses.
   */
  @ApiPropertyOptional({ description: 'The unique user ID (used in login)' })
  @Expose()
  user_id?: string;

  /**
   * The unique user identifier.
   * Typically returned in sign-up responses.
   */
  @ApiPropertyOptional({ description: 'The unique user ID (used in signup)' })
  @Expose()
  userId?: string;

  /**
   * Current authentication or account registration status.
   * E.g., 'pending_verification' if the user needs to fulfill additional verification steps.
   */
  @ApiPropertyOptional({
    description: 'Status of the authentication (e.g. pending_verification)',
  })
  @Expose()
  status?: string;

  /**
   * Verified primary or secondary email address of the authenticated user.
   */
  @ApiPropertyOptional({ description: 'User email address' })
  @Expose()
  email?: string;

  /**
   * Verified phone number of the authenticated user (including country prefix).
   */
  @ApiPropertyOptional({ description: 'User phone number' })
  @Expose()
  phone?: string;

  /**
   * JSON Web Token (JWT) used for authorizing subsequent HTTP requests.
   * Should be attached to the Authorization header as a Bearer token.
   */
  @ApiPropertyOptional({ description: 'JWT Access token for authentication' })
  @Expose()
  access_token?: string;

  /**
   * Token authorization type.
   */
  @ApiPropertyOptional({
    description: 'Type of the access token',
    example: 'Bearer',
  })
  @Expose()
  token_type?: string;

  /**
   * Access token validity in seconds.
   */
  @ApiPropertyOptional({
    description: 'Access token expiration time in seconds',
    example: 900,
  })
  @Expose()
  expires_in?: number;

  /**
   * JSON Web Token (JWT) used for refreshing access credentials.
   */
  @ApiPropertyOptional({
    description: 'JWT Refresh token used to rotate credentials',
  })
  @Expose()
  refresh_token?: string;

  /**
   * ISO 8601 timestamp representing the exact expiration time of the refresh token.
   */
  @ApiPropertyOptional({
    description: 'ISO-8601 timestamp when the refresh token expires',
  })
  @Expose()
  refresh_token_expires_at?: string;
}
