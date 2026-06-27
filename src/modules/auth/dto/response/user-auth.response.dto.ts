import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Response payload containing authentication results and user profile summary.
 *
 * This DTO is returned after successful sign-in, registration, or token exchange,
 * enclosing the JWT access token and basic user details needed for immediate client hydration.
 */
export class UserAuthDto {
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
}
