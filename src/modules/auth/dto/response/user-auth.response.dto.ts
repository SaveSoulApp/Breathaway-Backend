import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Response payload containing authentication results and user profile summary.
 *
 * Returned after successful sign-in, registration, or token rotation,
 * enclosing access and refresh tokens along with basic user details for client hydration.
 */
export class UserAuthResponseDto {
  /**
   * The unique user identifier.
   */
  @ApiPropertyOptional({
    description: 'The unique user identifier',
    example: '01M43375E5QSSD3139BGTV9VQW',
  })
  @Expose()
  userId?: string;

  /**
   * Current authentication or account registration status.
   * E.g., 'verified' or 'pending_verification' if the user needs to fulfill additional verification steps.
   */
  @ApiPropertyOptional({
    description:
      'Status of the authentication (e.g. verified, pending_verification)',
    example: 'verified',
  })
  @Expose()
  status?: string;

  /**
   * Verified primary or secondary email address of the authenticated user.
   */
  @ApiPropertyOptional({
    description: 'User email address',
    example: 'user@example.com',
  })
  @Expose()
  email?: string;

  /**
   * Verified phone number of the authenticated user (including country prefix).
   */
  @ApiPropertyOptional({
    description: 'User phone number',
    example: '+1234567890',
  })
  @Expose()
  phone?: string;

  /**
   * JSON Web Token (JWT) used for authorizing subsequent HTTP requests.
   * Should be attached to the Authorization header as a Bearer token.
   */
  @ApiPropertyOptional({
    description: 'JWT Access token for authentication',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @Expose()
  accessToken?: string;

  /**
   * Token authorization type (e.g., 'Bearer').
   */
  @ApiPropertyOptional({
    description: 'Type of the access token',
    example: 'Bearer',
  })
  @Expose()
  tokenType?: string;

  /**
   * Access token validity in seconds.
   */
  @ApiPropertyOptional({
    description: 'Access token expiration time in seconds',
    example: 900,
  })
  @Expose()
  expiresIn?: number;

  /**
   * Cryptographically signed JWT used for rotating access credentials.
   */
  @ApiPropertyOptional({
    description: 'Signed JWT refresh token used to rotate credentials',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @Expose()
  refreshToken?: string;

  /**
   * ISO 8601 timestamp representing the exact expiration time of the refresh token.
   */
  @ApiPropertyOptional({
    description: 'ISO-8601 timestamp when the refresh token expires',
    example: '2026-10-18T09:30:55.328Z',
  })
  @Expose()
  refreshTokenExpiresAt?: string;
}
