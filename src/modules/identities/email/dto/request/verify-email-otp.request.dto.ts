import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';

/**
 * Request payload for POST /identities/email/verify-otp.
 *
 * Verifies the 6-digit OTP code sent to the email address. Upon successful
 * verification, the email is claimed and linked to the authenticated user's account.
 */
export class VerifyEmailOtpRequestDto {
  @ApiProperty({
    description: 'The email address that received the verification OTP',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Must be a valid email address' })
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @ApiProperty({
    description: '6-digit numeric verification OTP received in the email',
    example: '482910',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must contain only digits' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  otp: string;
}
