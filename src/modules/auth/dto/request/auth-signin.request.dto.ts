import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { AcceptedLegalDocumentRequestDto } from '@modules/legal/dto';

/**
 * Payload for signing in an existing user using their authentication credentials.
 *
 * Used in the sign-in endpoint to authenticate a user by verifying their credentials
 * via a Firebase UID token or OTP token against the provided unique identifier.
 */
export class AuthSigninRequestDto {
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

  /**
   * Affirmative consent flag indicating explicit agreement to the Terms of Service,
   * Privacy Policy, and Cancellation Policy (used when signin-or-signup creates a new user).
   */
  @ApiPropertyOptional({
    description:
      'Affirmative consent agreeing cumulatively to all current mandatory legal documents (Terms of Service, Privacy Policy, and Cancellation Policy). Required for successful registration when creating a new account unless explicit acceptedLegalDocs array is provided.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  acceptedTermsAndPolicies?: boolean;

  /**
   * Optional explicit breakdown of accepted legal document versions.
   */
  @ApiPropertyOptional({
    type: [AcceptedLegalDocumentRequestDto],
    description:
      'Explicit breakdown of accepted legal document versions. If omitted and acceptedTermsAndPolicies is true, active versions are bound automatically.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptedLegalDocumentRequestDto)
  acceptedLegalDocs?: AcceptedLegalDocumentRequestDto[];
}
