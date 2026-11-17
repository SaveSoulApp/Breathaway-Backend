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
 * Payload for registering a new user account in the system.
 *
 * Used in the sign-up endpoint to create a new user profile after verifying their credentials
 * via a Firebase UID token or OTP token, while capturing affirmative acceptance of mandatory legal policies.
 */
export class AuthSignupRequestDto {
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

  /**
   * Affirmative consent flag indicating explicit agreement to the Terms of Service,
   * Privacy Policy, and Cancellation Policy.
   */
  @ApiPropertyOptional({
    description:
      'Affirmative consent agreeing cumulatively to all current mandatory legal documents (Terms of Service, Privacy Policy, and Cancellation Policy). Required for successful registration unless explicit acceptedLegalDocs array is provided.',
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
